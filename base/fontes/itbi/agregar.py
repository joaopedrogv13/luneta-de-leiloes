"""Estatísticas de R$/m² do ITBI por cidade, bairro e rua (e por tipo), no formato que o site lê.

Entrada: DataFrame com as colunas tipo (apartamento|casa|terreno|comercial), preco_m2, data (datetime),
bairro, rua (texto original). Saída: dict pronto para JSON (ver base/fontes/itbi/README.md).
"""
import numpy as np

from normalizar import normalizar_bairro, normalizar_rua

MIN_BAIRRO = 5
MIN_RUA = 3


def estat(valores):
    v = np.sort(np.asarray(valores, dtype=float))
    n = len(v)
    corte = int(n * 0.1)
    aparada = v[corte : n - corte] if n - 2 * corte > 0 else v
    return {
        "n": int(n),
        "media": round(float(aparada.mean())),
        "mediana": round(float(np.median(v))),
        "p25": round(float(np.percentile(v, 25))),
        "p75": round(float(np.percentile(v, 75))),
    }


def por_tipo(df, minimo):
    saida = {}
    for tipo, g in df.groupby("tipo"):
        if len(g) >= minimo:
            saida[tipo] = estat(g["preco_m2"])
    return saida


def agregar(df, cidade, uf, fonte, meses=12):
    df = df[df["preco_m2"].notna() & (df["preco_m2"] > 50) & (df["preco_m2"] < 200_000)].copy()
    fim = df["data"].max()
    ini = fim - np.timedelta64(int(meses * 30.44), "D")
    df = df[df["data"] > ini]
    df["bairro_n"] = df["bairro"].map(normalizar_bairro)
    df["rua_n"] = df["rua"].map(normalizar_rua)
    bairros, ruas = {}, {}
    for chave, g in df[df["bairro_n"] != ""].groupby("bairro_n"):
        tipos = por_tipo(g, MIN_BAIRRO)
        if tipos:
            bairros[chave] = {"nome": g["bairro"].mode().iat[0], "tipos": tipos}
    for chave, g in df[df["rua_n"] != ""].groupby("rua_n"):
        tipos = por_tipo(g, MIN_RUA)
        if tipos:
            ruas[chave] = {"nome": g["rua"].mode().iat[0], "tipos": tipos}
    return {
        "cidade": cidade,
        "uf": uf,
        "fonte": {**fonte, "periodo": [str(ini.date()), str(fim.date())], "transacoes": int(len(df))},
        "cidade_tipos": por_tipo(df, MIN_BAIRRO),
        "bairros": bairros,
        "ruas": ruas,
    }
