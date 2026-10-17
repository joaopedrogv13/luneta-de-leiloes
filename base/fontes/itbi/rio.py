"""ITBI do Rio de Janeiro (Secretaria Municipal de Fazenda). Uso: python rio.py saida/itbi-rio-de-janeiro.json

O Rio não publica transação a transação: publica VALORES MÉDIOS por trecho de logradouro (e por divisão
administrativa), por ano e por mês, em tabelas do MapServer da prefeitura (pgeo3.rio.rj.gov.br, serviço
Fazenda/ITBI) e em planilhas na página da Fazenda. Diferença em relação às outras cidades (ver README):
cada linha é um trecho com a quantidade de transações e o valor médio do m²; a agregação usa a quantidade como
peso (média ponderada; mediana e quartis ponderados ENTRE TRECHOS, não entre transações).

O script também grava saida/explorar-rio.json com os campos e 3 linhas de cada tabela (dado agregado e público),
para conferir a leitura.
"""
import json
import re
import sys
from datetime import date

import pandas as pd

from agregar import agregar
from comum import baixar, chave_coluna, gravar, ler_tabela, log, principal, resumo_colunas, tipo_de

SERVICO = "https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Fazenda/ITBI/MapServer"
PAGINA = "https://fazenda.prefeitura.rio/itbi-valores-medios-por-m2-de-transacoes-imobiliarias-por-trecho-de-logradouro/"
FONTE = {
    "nome": "Prefeitura do Rio de Janeiro, Secretaria Municipal de Fazenda: valores médios do m² nas transações com ITBI, por trecho de logradouro",
    "url": PAGINA,
    "via": "MapServer da prefeitura (Fazenda/ITBI)",
    "atribuicao": "Fonte: Prefeitura da Cidade do Rio de Janeiro, Secretaria Municipal de Fazenda",
    "licenca": None,
    "observacao": "a prefeitura publica médias por trecho de logradouro; a Luneta pondera pela quantidade de transações (quartis entre trechos)",
}


def info(camada):
    return baixar(f"{SERVICO}/{camada}", params={"f": "json"}, timeout=60).json()


def consulta(camada, **params):
    base = {"where": "1=1", "outFields": "*", "returnGeometry": "false", "f": "json"}
    return baixar(f"{SERVICO}/{camada}/query", params={**base, **params}, timeout=120).json()


def campo(campos, *grupos, evitar=()):
    for grupo in grupos:
        for c in campos:
            k = chave_coluna(c)
            partes = k.split("_")
            if all((p in partes) if len(p) <= 3 else (p in k) for p in grupo) and not any(e in k for e in evitar):
                return c
    return None


def todas_as_linhas(camada, where, maximo):
    linhas, offset = [], 0
    while True:
        r = consulta(camada, where=where, resultOffset=offset, resultRecordCount=maximo)
        if "error" in r:
            raise RuntimeError(f"tabela {camada}: {r['error']}")
        novas = [f["attributes"] for f in r.get("features", [])]
        linhas += novas
        if not novas or not r.get("exceededTransferLimit") and len(novas) < maximo:
            break
        offset += len(novas)
        if offset > 2_000_000:
            break
    return pd.DataFrame(linhas)


def explorar(saida_dir):
    servico = baixar(SERVICO, params={"f": "json"}, timeout=60).json()
    tabelas = {t["id"]: t["name"] for t in servico.get("tables", [])}
    relatorio = {"tabelas": tabelas}
    for tid, nome in tabelas.items():
        try:
            i = info(tid)
            campos = [(c.get("name"), c.get("type"), c.get("alias")) for c in i.get("fields") or []]
            amostra = [f["attributes"] for f in consulta(tid, resultRecordCount=3).get("features", [])]
            contagem = consulta(tid, returnCountOnly="true").get("count")
            relatorio[str(tid)] = {"nome": nome, "campos": campos, "maxRecordCount": i.get("maxRecordCount"), "paginacao": (i.get("advancedQueryCapabilities") or {}).get("supportsPagination"), "contagem": contagem, "amostra": amostra}
            log(f"Rio tabela {tid} ({nome}): {contagem} linhas; campos {[c[0] for c in campos]}")
            log(f"  amostra: {json.dumps(amostra, ensure_ascii=False)[:600]}")
        except Exception as e:  # noqa: BLE001
            relatorio[str(tid)] = {"nome": nome, "erro": f"{type(e).__name__}: {e}"[:300]}
            log(f"Rio tabela {tid}: erro {relatorio[str(tid)]['erro']}")
    # planilhas da página da Fazenda (só a estrutura)
    try:
        html = baixar(PAGINA, timeout=60).text
        planilhas = sorted(set(re.findall(r'href="([^"]*ITBI[^"]*\.xlsx)"', html, flags=re.I)))
        relatorio["planilhas"] = planilhas
        for url in planilhas[-2:]:
            log(f"Rio: planilha {url}")
            bruto = baixar(url, timeout=600).content
            todas = pd.read_excel(__import__("io").BytesIO(bruto), sheet_name=None, header=None, nrows=12, dtype=str)
            relatorio[url] = {aba: df.fillna("").values.tolist() for aba, df in todas.items()}
            for aba, df in todas.items():
                log(f"  aba {aba!r}: primeiras linhas {df.fillna('').values.tolist()[:8]}")
    except Exception as e:  # noqa: BLE001
        log(f"Rio: planilhas falharam: {type(e).__name__}: {str(e)[:300]}")
    with open(f"{saida_dir}/explorar-rio.json", "w", encoding="utf-8") as f:
        json.dump(relatorio, f, ensure_ascii=False, indent=1, default=str)
    return relatorio


def linhas_da_tabela(tid, relatorio, terreno):
    """Linhas (tipo, preco_m2, peso, data, bairro, rua) de uma tabela por logradouro, ou None se não reconhecer."""
    meta = relatorio.get(str(tid)) or {}
    campos = [c[0] for c in meta.get("campos", [])]
    if not campos:
        return None
    c_rua = campo(campos, ("nome", "logr"), ("logradouro",), ("logr",), evitar=("cod", "tipo_logr"))
    c_bairro = campo(campos, ("bairro",), evitar=("cod",))
    c_ano = campo(campos, ("ano",))
    c_mes = campo(campos, ("mes",))
    c_qtd = campo(campos, ("qtd",), ("quant",), ("num", "trans"), ("total", "trans"), ("transacoes",), evitar=("valor", "m2"))
    c_m2 = campo(campos, ("valor", "medio", "m2"), ("media", "m2"), ("valor", "m2"), ("m2",), ("metro",), evitar=("area", "qtd", "quant"))
    c_tipo = campo(campos, ("tipologia",), ("tipo", "imovel"), ("tipo", "uso"), ("uso",), ("tipo",), evitar=("logr", "cod"))
    usados = {"rua": c_rua, "bairro": c_bairro, "ano": c_ano, "mes": c_mes, "qtd": c_qtd, "m2": c_m2, "tipo": c_tipo}
    log(f"Rio tabela {tid}: campos usados {usados}")
    if not (c_rua and c_ano and c_m2):
        log(f"Rio tabela {tid}: faltam campos (rua, ano, valor do m²)")
        return None
    ano_min = date.today().year - 1
    maximo = meta.get("maxRecordCount") or 1000
    df = todas_as_linhas(tid, f"{c_ano} >= {ano_min}", maximo)
    log(f"Rio tabela {tid}: {len(df)} linhas desde {ano_min}")
    resumo_colunas(df)
    if terreno:
        tipo = pd.Series("terreno", index=df.index)
    elif c_tipo:
        tipo = df[c_tipo].map(tipo_de)
    else:
        log(f"Rio tabela {tid}: sem campo de tipo; não dá para separar apartamento de casa")
        return None
    mes = pd.to_numeric(df[c_mes], errors="coerce").fillna(7) if c_mes else 7
    return pd.DataFrame({
        "tipo": tipo,
        "preco_m2": pd.to_numeric(df[c_m2], errors="coerce"),
        "peso": pd.to_numeric(df[c_qtd], errors="coerce") if c_qtd else 1,
        "data": pd.to_datetime(pd.DataFrame({"year": pd.to_numeric(df[c_ano], errors="coerce"), "month": mes, "day": 1}), errors="coerce"),
        "bairro": df[c_bairro].fillna("").astype(str) if c_bairro else "",
        "rua": df[c_rua].fillna("").astype(str),
    })


def rodar_rio(saida):
    pasta = saida.rsplit("/", 1)[0] if "/" in saida else "."
    relatorio = explorar(pasta)
    tabelas = relatorio.get("tabelas", {})
    por_mes = {tid: n for tid, n in tabelas.items() if "logradouro" in n.lower() and "mês" in n.lower()}
    por_ano = {tid: n for tid, n in tabelas.items() if "logradouro" in n.lower() and "ano" in n.lower()}
    escolha = por_mes or por_ano
    frames = []
    for tid, nome in escolha.items():
        linhas = linhas_da_tabela(tid, relatorio, terreno="territoria" in nome.lower())
        if linhas is not None:
            frames.append(linhas)
    if not frames:
        raise RuntimeError("nenhuma tabela por logradouro reconhecida (ver explorar-rio.json e o log)")
    df = pd.concat(frames, ignore_index=True)
    df = df[df["tipo"].notna() & df["data"].notna()]
    log(f"Rio: {len(df)} linhas (trecho × período × tipo), {int(df['peso'].sum())} transações; tipos {df['tipo'].value_counts().to_dict()}")
    gravar(agregar(df, "Rio de Janeiro", "RJ", FONTE), saida)


if __name__ == "__main__":
    principal(rodar_rio)
    sys.exit(0)
