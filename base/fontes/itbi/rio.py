"""ITBI do Rio de Janeiro (Secretaria Municipal de Fazenda). Uso: python rio.py saida/itbi-rio-de-janeiro.json

Duas publicações da Fazenda:
1. (principal) a planilha de transações da página "ITBI: valores médios por m²..." (ITBI_TRANSACOES_<ano>_diante*.xlsx):
   uma linha por transação, com ano, mês, bairro, logradouro, tipologia (APARTAMENTO, CASA, TERRENO, SALA, LOJA...),
   parte transferida, valor declarado e área. Vira o mesmo formato das outras cidades (mediana e quartis entre
   transações). Os textos vêm com os escapes do Excel ("Rua_x0020_Nova" = "Rua Nova"), desfeitos aqui. Bairro em
   branco é completado pelo código do bairro (tabela 1 do MapServer).
2. (reserva, se a planilha falhar) as tabelas do MapServer Fazenda/ITBI por logradouro e mês: cada linha é a MÉDIA de
   um trecho de rua num mês (total de transações, valor médio do imóvel, área construída média). O R$/m² do trecho é
   valor médio ÷ área média, e a agregação usa o total de transações como peso (média ponderada; mediana e quartis
   ponderados ENTRE TRECHOS, não entre transações). Ver README.

O script também grava saida/explorar-rio.json com os campos e 3 linhas de cada tabela (dado agregado e público).
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
FONTE_PLANILHA = {
    "nome": "Prefeitura do Rio de Janeiro, Secretaria Municipal de Fazenda: transações imobiliárias com ITBI",
    "url": PAGINA,
    "via": "planilha de transações da página da Fazenda",
    "atribuicao": "Fonte: Prefeitura da Cidade do Rio de Janeiro, Secretaria Municipal de Fazenda",
    "licenca": None,
    "observacao": "valor declarado e área da planilha da Fazenda; só transmissão de 100% do imóvel",
}
FONTE_MAPSERVER = {
    **FONTE_PLANILHA,
    "nome": "Prefeitura do Rio de Janeiro, Secretaria Municipal de Fazenda: valores médios do m² nas transações com ITBI, por trecho de logradouro",
    "via": "MapServer da prefeitura (Fazenda/ITBI)",
    "observacao": "a prefeitura publica médias por trecho de logradouro e mês; a Luneta pondera pela quantidade de transações (quartis entre trechos)",
}


def info(camada):
    return baixar(f"{SERVICO}/{camada}", params={"f": "json"}, timeout=60).json()


def consulta(camada, **params):
    base = {"where": "1=1", "outFields": "*", "returnGeometry": "false", "f": "json"}
    return baixar(f"{SERVICO}/{camada}/query", params={**base, **params}, timeout=120).json()


def todas_as_linhas(camada, where, maximo, campos="*"):
    linhas, offset = [], 0
    while True:
        r = consulta(camada, where=where, outFields=campos, resultOffset=offset, resultRecordCount=maximo)
        if "error" in r:
            raise RuntimeError(f"tabela {camada}: {r['error']}")
        novas = [f["attributes"] for f in r.get("features", [])]
        linhas += novas
        if not novas or (not r.get("exceededTransferLimit") and len(novas) < maximo):
            break
        offset += len(novas)
        if offset > 2_000_000:
            break
    return pd.DataFrame(linhas)


ESCAPE_EXCEL = re.compile(r"_x([0-9A-Fa-f]{4})_")


def sem_escape(valor):
    """'Rua_x0020_Nova' → 'Rua Nova' (escape de caractere do XML do Excel)."""
    if not isinstance(valor, str):
        return valor
    return ESCAPE_EXCEL.sub(lambda m: chr(int(m.group(1), 16)), valor).strip()


def explorar(saida_dir):
    servico = baixar(SERVICO, params={"f": "json"}, timeout=60).json()
    tabelas = {t["id"]: t["name"] for t in servico.get("tables", [])}
    relatorio = {"tabelas": tabelas}
    for tid, nome in tabelas.items():
        try:
            i = info(tid)
            campos = [(c.get("name"), c.get("type"), c.get("alias")) for c in i.get("fields") or []]
            contagem = consulta(tid, returnCountOnly="true").get("count")
            relatorio[str(tid)] = {"nome": nome, "campos": campos, "maxRecordCount": i.get("maxRecordCount"), "contagem": contagem}
            log(f"Rio tabela {tid} ({nome}): {contagem} linhas; campos {[c[0] for c in campos]}")
        except Exception as e:  # noqa: BLE001
            relatorio[str(tid)] = {"nome": nome, "erro": f"{type(e).__name__}: {e}"[:300]}
            log(f"Rio tabela {tid}: erro {relatorio[str(tid)]['erro']}")
    try:
        html = baixar(PAGINA, timeout=60).text
        relatorio["planilhas"] = sorted(set(re.findall(r'href="([^"]*ITBI[^"]*\.xlsx)"', html, flags=re.I)))
    except Exception as e:  # noqa: BLE001
        relatorio["planilhas"] = []
        log(f"Rio: página da Fazenda falhou: {type(e).__name__}: {str(e)[:300]}")
    log(f"Rio: planilhas na página {relatorio['planilhas']}")
    with open(f"{saida_dir}/explorar-rio.json", "w", encoding="utf-8") as f:
        json.dump(relatorio, f, ensure_ascii=False, indent=1, default=str)
    return relatorio


def bairros_por_codigo():
    """Código do bairro (int) → nome, da tabela 1 do MapServer (para a planilha com bairro em branco)."""
    try:
        df = todas_as_linhas(1, "1=1", 2000, campos="codbairro,bairro")
        return {int(c): str(b).strip() for c, b in zip(df["codbairro"], df["bairro"]) if str(c).strip().isdigit() and isinstance(b, str)}
    except Exception as e:  # noqa: BLE001
        log(f"Rio: sem a tabela de bairros ({type(e).__name__}: {str(e)[:200]})")
        return {}


def pela_planilha(relatorio):
    """Transações da planilha mais recente (…_diante*.xlsx); None se não houver."""
    planilhas = [u for u in relatorio.get("planilhas", []) if "transac" in u.lower()]
    recentes = [u for u in planilhas if "diante" in u.lower()] or planilhas[-1:]
    if not recentes:
        log("Rio: nenhuma planilha de transações na página")
        return None
    url = recentes[-1]
    log(f"Rio: baixando {url}")
    df = ler_tabela(baixar(url, timeout=900).content, url)
    for c in df.columns:
        if df[c].dtype == object or pd.api.types.is_string_dtype(df[c]):
            df[c] = df[c].map(sem_escape)
    resumo_colunas(df)
    col = {chave_coluna(c): c for c in df.columns}
    precisa = ["ano", "mes", "logradouro", "ds_imovel_tipologia", "area"]
    if any(p not in col for p in precisa) or not ("vl_declarado" in col or "valor_transacoes" in col):
        log(f"Rio: a planilha não tem as colunas esperadas {precisa} + valor; colunas {list(df.columns)}")
        return None
    valor = pd.to_numeric(df[col.get("vl_declarado") or col["valor_transacoes"]], errors="coerce")
    area = pd.to_numeric(df[col["area"]], errors="coerce")
    parte = pd.to_numeric(df[col["parte_transferida"]], errors="coerce") if "parte_transferida" in col else pd.Series(100.0, index=df.index)
    tipologia = df[col["ds_imovel_tipologia"]]
    descricao = df[col["descricao"]] if "descricao" in col else pd.Series("", index=df.index)
    tipo = tipologia.map(tipo_de)
    tipo = tipo.where(tipo.notna(), descricao.map(tipo_de))
    tipo = tipo.where(tipo != "fora")
    log(f"Rio: tipologias {tipologia.value_counts().head(25).to_dict()}")
    log(f"Rio: tipos {tipo.value_counts(dropna=False).to_dict()}")
    bairro = df[col["bairro"]] if "bairro" in col else (df[col["nm_bairro_norm"]] if "nm_bairro_norm" in col else pd.Series("", index=df.index))
    bairro = bairro.fillna("").astype(str).str.strip()
    if "cd_bairro" in col and (bairro == "").any():
        nomes = bairros_por_codigo()
        codigo = pd.to_numeric(df[col["cd_bairro"]], errors="coerce")
        bairro = bairro.where(bairro != "", codigo.map(lambda c: nomes.get(int(c), "") if pd.notna(c) else ""))
        log(f"Rio: bairro em branco em {int((bairro == '').sum())} linhas depois do código")
    inteiro = parte.isna() | (parte >= 99)
    saida = pd.DataFrame({
        "tipo": tipo,
        "preco_m2": valor / area.where(area >= 5),
        "data": pd.to_datetime(pd.DataFrame({"year": pd.to_numeric(df[col["ano"]], errors="coerce"), "month": pd.to_numeric(df[col["mes"]], errors="coerce"), "day": 1}), errors="coerce"),
        "bairro": bairro,
        "rua": df[col["logradouro"]].fillna("").astype(str),
    })[inteiro]
    saida = saida[saida["tipo"].notna() & saida["data"].notna() & saida["preco_m2"].notna()]
    log(f"Rio: {len(saida)} transações com tipo, data e R$/m² (de {len(df)}); {int((~inteiro).sum())} transmissões parciais fora; de {saida['data'].min()} a {saida['data'].max()}")
    log(f"Rio: R$/m² por tipo (mediana): {saida.groupby('tipo')['preco_m2'].median().round().to_dict()}")
    return saida


def pelo_mapserver(relatorio):
    """Médias por trecho e mês das tabelas 8 (residencial e não residencial) e 7 (territorial), com peso."""
    frames = []
    for tid, terreno in ((8, False), (7, True)):
        meta = relatorio.get(str(tid)) or {}
        campos = [c[0] for c in meta.get("campos", [])]
        if "ano_transação" not in campos:
            log(f"Rio tabela {tid}: sem ano_transação; campos {campos}")
            continue
        ano_min = date.today().year - 2
        df = todas_as_linhas(tid, f"ano_transação >= {ano_min}", meta.get("maxRecordCount") or 1000)
        log(f"Rio tabela {tid}: {len(df)} linhas desde {ano_min}")
        area = pd.to_numeric(df["média_área_terreno" if terreno else "média_área_construída"], errors="coerce")
        valor = pd.to_numeric(df["média_valor_imóvel"], errors="coerce")
        compra = df["principal_transação_mercado"].astype(str).str.upper().str.contains("COMPRA")
        tipo = pd.Series("terreno", index=df.index) if terreno else df["principais_tipologias"].map(tipo_de)
        frames.append(pd.DataFrame({
            "tipo": tipo.where(tipo != "fora"),
            "preco_m2": valor / area.where(area >= 5),
            "peso": pd.to_numeric(df["total_transações"], errors="coerce"),
            "data": pd.to_datetime(pd.DataFrame({"year": pd.to_numeric(df["ano_transação"], errors="coerce"), "month": pd.to_numeric(df["mês_transação"], errors="coerce"), "day": 1}), errors="coerce"),
            "bairro": df["bairro"].fillna("").astype(str).str.strip(),
            "rua": df["logradouro"].fillna("").astype(str),
        })[compra])
    if not frames:
        return None
    df = pd.concat(frames, ignore_index=True)
    return df[df["tipo"].notna() & df["data"].notna()]


def rodar_rio(saida):
    pasta = saida.rsplit("/", 1)[0] if "/" in saida else "."
    relatorio = explorar(pasta)
    try:
        df = pela_planilha(relatorio)
    except Exception as e:  # noqa: BLE001
        log(f"Rio: planilha falhou ({type(e).__name__}: {str(e)[:300]}); vou pelo MapServer")
        df = None
    fonte = FONTE_PLANILHA
    if df is None or len(df) < 1000:
        df = pelo_mapserver(relatorio)
        fonte = FONTE_MAPSERVER
    if df is None or df.empty:
        raise RuntimeError("nem a planilha nem o MapServer deram transações (ver o log e explorar-rio.json)")
    gravar(agregar(df, "Rio de Janeiro", "RJ", fonte), saida)


if __name__ == "__main__":
    principal(rodar_rio)
    sys.exit(0)
