"""Estatísticas de R$/m² do ITBI por cidade, bairro e rua (e por tipo), no formato que o site lê.

Entrada: DataFrame com as colunas tipo (apartamento|casa|terreno|comercial), preco_m2, data (datetime),
bairro, rua (texto original) e, opcionalmente, peso (quantas transações a linha representa: o Rio publica
médias por trecho de logradouro, não transações). Saída: dict pronto para JSON (ver base/fontes/itbi/README.md).

Sem peso: n = transações; media = média sem os 10% mais baixos e os 10% mais altos; mediana, p25 e p75 das
transações. Com peso: n = soma dos pesos; media = média ponderada (sem as pontas de 10% do peso); mediana e
quartis ponderados entre as linhas (são quartis entre trechos, não entre transações).
"""
import numpy as np

from normalizar import bairro_valido, normalizar_bairro, normalizar_rua

MIN_BAIRRO = 5
MIN_RUA = 3

def _quantil_ponderado(v, w, q):
    acumulado = np.cumsum(w) - 0.5 * w
    return float(np.interp(q * w.sum(), acumulado, v))


def estat(valores, pesos=None):
    v = np.asarray(valores, dtype=float)
    if pesos is None:
        v = np.sort(v)
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
    w = np.asarray(pesos, dtype=float)
    ordem = np.argsort(v)
    v, w = v[ordem], w[ordem]
    acumulado = np.cumsum(w) / w.sum()
    miolo = (acumulado - w / w.sum() >= 0.1 - 1e-9) & (acumulado <= 0.9 + 1e-9)
    vm, wm = (v[miolo], w[miolo]) if miolo.any() else (v, w)
    return {
        "n": int(round(w.sum())),
        "media": round(float(np.average(vm, weights=wm))),
        "mediana": round(_quantil_ponderado(v, w, 0.5)),
        "p25": round(_quantil_ponderado(v, w, 0.25)),
        "p75": round(_quantil_ponderado(v, w, 0.75)),
    }


def por_tipo(df, minimo):
    saida = {}
    tem_peso = "peso" in df.columns
    for tipo, g in df.groupby("tipo"):
        n = g["peso"].sum() if tem_peso else len(g)
        if n >= minimo:
            saida[tipo] = estat(g["preco_m2"], g["peso"] if tem_peso else None)
    return saida


def agregar(df, cidade, uf, fonte, meses=12):
    df = df[df["preco_m2"].notna() & (df["preco_m2"] > 50) & (df["preco_m2"] < 200_000)].copy()
    if "peso" in df.columns:
        df = df[df["peso"].notna() & (df["peso"] > 0)]
    fim = df["data"].max()
    ini = fim - np.timedelta64(int(meses * 30.44), "D")
    df = df[df["data"] > ini]
    df["bairro_n"] = df["bairro"].map(normalizar_bairro)
    df["rua_n"] = df["rua"].map(normalizar_rua)
    bairros, ruas = {}, {}
    for chave, g in df[df["bairro_n"].map(bairro_valido)].groupby("bairro_n"):
        tipos = por_tipo(g, MIN_BAIRRO)
        if tipos:
            bairros[chave] = {"nome": g["bairro"].mode().iat[0], "tipos": tipos}
    for chave, g in df[df["rua_n"] != ""].groupby("rua_n"):
        tipos = por_tipo(g, MIN_RUA)
        if tipos:
            ruas[chave] = {"nome": g["rua"].mode().iat[0], "tipos": tipos}
    transacoes = int(round(df["peso"].sum())) if "peso" in df.columns else int(len(df))
    return {
        "cidade": cidade,
        "uf": uf,
        # "data > ini": o período começa no dia seguinte
        "fonte": {**fonte, "periodo": [str((ini + np.timedelta64(1, "D")).date()), str(fim.date())], "transacoes": transacoes},
        "cidade_tipos": por_tipo(df, MIN_BAIRRO),
        "bairros": bairros,
        "ruas": ruas,
    }
