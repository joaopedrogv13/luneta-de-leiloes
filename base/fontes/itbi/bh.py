"""ITBI de Belo Horizonte (SMFA, dados.pbh.gov.br, licença CC-BY). Uso: python bh.py saida/itbi-belo-horizonte.json

O portal da PBH é CKAN, mas a API respondeu HTML na exploração (explorar.json: JSONDecodeError). Por isso este
conector tenta a API em dois endereços e, se nenhum responder JSON, lê as páginas do portal (busca "itbi" → página
de cada conjunto → links .csv). O log diz o que a PBH respondeu, para a próxima correção.
"""
import re
from urllib.parse import urljoin

from ckan import rodar
from comum import baixar, log, principal

BASES = ["https://dados.pbh.gov.br", "https://ckan.pbh.gov.br"]
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
        if not extras:
            raise RuntimeError("BH: nenhum arquivo de ITBI achado na API nem nas páginas do portal")
        rodar(saida, "Belo Horizonte", "MG", [], FONTE, recursos_extras=extras)


principal(rodar_bh)
