"""ITBI de Belo Horizonte (SMFA, dados.pbh.gov.br, licença CC-BY). Uso: python bh.py saida/itbi-belo-horizonte.json

O portal da PBH é CKAN, mas a API respondeu HTML na exploração (explorar.json: JSONDecodeError). Por isso este
conector tenta a API em dois endereços, depois as páginas do portal (busca "itbi" → página de cada conjunto → links
.csv) e, por fim, o download direto de um arquivo conhecido do conjunto "ITBI Relatórios" (um CSV por mês). Em 17/10/2026
o portal respondeu HTTP 403 a tudo vindo do GitHub Actions (servidor fora do Brasil); o coletor não contorna.
"""
import re
from urllib.parse import urljoin

from ckan import rodar
from comum import baixar, log, principal

BASES = ["https://dados.pbh.gov.br", "https://ckan.pbh.gov.br"]
# Recursos conhecidos do conjunto "ITBI Relatórios" (um CSV por mês; achados numa busca em 17/10/2026), para tentar o
# download direto quando a API e as páginas recusam. Se também recusar (403), a coleta fica para uma rede no Brasil.
CONHECIDOS = [
    {"nome": "2026 - Fevereiro - ITBI Relatórios", "formato": "csv", "licenca": "CC-BY (conferir no portal)", "conjunto": "itbi-relatorios", "modificado": None,
     "url": f"{base}/dataset/itbi-relatorios/resource/453b3f6d-ec7f-415c-af5e-c23d1f488e2a/download/pda_itbi_relatorio_202602.csv"}
    for base in ("https://ckan.pbh.gov.br", "https://dados.pbh.gov.br")
]
FONTE = {
    "nome": "Prefeitura de Belo Horizonte, Secretaria Municipal de Fazenda: relatório de transações com ITBI (dados abertos)",
    "url": "https://dados.pbh.gov.br/dataset/relatorio-itbi",
    "via": "portal de dados abertos da PBH",
    "atribuicao": "Fonte: Prefeitura de Belo Horizonte (CC-BY)",
    "observacao": "valor e área como a prefeitura publica (ver valor_usado e area_usada)",
}


def pelas_paginas():
    """Recursos achados no HTML do portal (sem a API)."""
    achados = []
    for base in BASES:
        try:
            busca = baixar(f"{base}/dataset/", params={"q": "itbi"}, timeout=60)
            log(f"BH: busca em {base} → {busca.status_code} {busca.headers.get('content-type')} {len(busca.text)} bytes")
            conjuntos = sorted(set(re.findall(r'href="(/dataset/[^"/?#]+)"', busca.text)))
            conjuntos = [c for c in conjuntos if "itbi" in c.lower()] or conjuntos[:5]
            log(f"BH: conjuntos {conjuntos}")
            for c in conjuntos:
                pagina = baixar(urljoin(base, c), timeout=60).text
                for url in sorted(set(re.findall(r'href="([^"]+\.(?:csv|zip|xlsx))"', pagina, flags=re.I))):
                    achados.append({"nome": url.rsplit("/", 1)[-1], "formato": url.rsplit(".", 1)[-1].lower(), "url": urljoin(base, url), "licenca": "CC-BY (conferir no portal)", "conjunto": c, "modificado": None})
            if achados:
                return achados
        except Exception as e:  # noqa: BLE001
            log(f"BH: páginas de {base} falharam: {type(e).__name__}: {str(e)[:300]}")
    return achados


def rodar_bh(saida):
    try:
        rodar(saida, "Belo Horizonte", "MG", BASES, FONTE)
    except RuntimeError as e:
        if "nenhum arquivo" not in str(e):
            raise
        log(f"BH: API sem resultado ({e}); tentando pelas páginas do portal")
        extras = pelas_paginas()
        if extras:
            rodar(saida, "Belo Horizonte", "MG", [], FONTE, recursos_extras=extras)
            return
        log("BH: tentando o download direto dos arquivos conhecidos")
        for r in CONHECIDOS:
            try:
                baixar(r["url"], timeout=120, tentativas=1)
            except Exception as e:  # noqa: BLE001
                log(f"BH: {r['url']} → {type(e).__name__}: {str(e)[:200]}")
                continue
            rodar(saida, "Belo Horizonte", "MG", [], FONTE, recursos_extras=[r])
            return
        raise RuntimeError("BH: o portal da PBH recusou a API, as páginas e o download direto (HTTP 403 para este servidor); rodar de uma rede no Brasil")


principal(rodar_bh)
