"""Fluxo comum das prefeituras que publicam o ITBI num portal CKAN (Recife, Fortaleza, Porto Alegre, Belo Horizonte).

1. acha os arquivos do conjunto "ITBI" no portal (package_search), sem os de imunidades e dicionários;
2. baixa os dos 2 anos mais recentes (pelo ano no nome) ou, sem ano no nome, o arquivo único;
3. lê (CSV, ZIP ou planilha), imprime o resumo das colunas, padroniza (transacoes.py) e agrega (agregar.py).
"""
import pandas as pd

from agregar import agregar
from comum import anos_no_nome, baixar, gravar, ler_tabela, log, recursos_ckan, resumo_colunas, sem_acento
from transacoes import padronizar

FORA = ("imunidade", "beneficio", "renuncia", "dicionario", "metadado", "leiame", "readme")


def escolher(recursos, anos=2):
    bons = [r for r in recursos if not any(f in sem_acento(f"{r['nome']} {r['conjunto']} {r['url']}") for f in FORA)]
    com_ano = [(max(anos_no_nome(f"{r['nome']} {r['url']}")), r) for r in bons if anos_no_nome(f"{r['nome']} {r['url']}")]
    if com_ano:
        ultimos = sorted({a for a, _ in com_ano}, reverse=True)[:anos]
        return [(a, r) for a, r in com_ano if a in ultimos]
    return [(None, r) for r in bons]


def rodar(saida, cidade, uf, bases, fonte, forcar=None, recursos_extras=None, anos=2):
    recursos, erros = [], []
    for base in bases:
        try:
            recursos = recursos_ckan(base)
            log(f"{cidade}: {len(recursos)} arquivos no portal {base}")
            if recursos:
                break
        except Exception as e:  # noqa: BLE001
            erros.append(f"{base}: {type(e).__name__}: {str(e)[:300]}")
            log(f"{cidade}: portal {base} falhou: {erros[-1]}")
    recursos = recursos + (recursos_extras or [])
    if not recursos:
        raise RuntimeError(f"nenhum arquivo de ITBI achado ({'; '.join(erros)})")
    for r in recursos:
        log(f"  - {r['nome']} [{r['formato']}] {r['url']} (licença: {r['licenca']})")
    escolhidos = escolher(recursos, anos)
    frames = []
    for ano, r in escolhidos:
        log(f"{cidade}: baixando {r['url']}")
        resposta = baixar(r["url"], timeout=600)
        df = ler_tabela(resposta.content, r["url"])
        df["_ano_arquivo"] = ano
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    resumo_colunas(df.drop(columns=["_ano_arquivo"]))
    anos_arquivo = [a for a, _ in escolhidos if a]
    padrao, usadas = padronizar(df, ano_padrao=max(anos_arquivo) if anos_arquivo else None, forcar=forcar)
    licenca = escolhidos[0][1]["licenca"]
    resultado = agregar(padrao, cidade, uf, {
        **fonte,
        "licenca": licenca,
        "arquivos": [r["url"] for _, r in escolhidos],
        "valor_usado": usadas["valor"],
        "area_usada": usadas["area"],
    })
    gravar(resultado, saida)
