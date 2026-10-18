"""Cidades da base para o ranking de localização: código IBGE de cada imóvel, a caixa de cada cidade e as vizinhas.

- **Código IBGE**: o mesmo casamento do geocode (`geocodificar.Municipios`: nome padronizado pelo enderecobr + UF,
  apelidos de base/geo/apelidos.csv; no DF, toda região administrativa é Brasília).
- **Caixa da cidade**: o retângulo que contém os endereços do CNEFE 2022 da cidade (percentis 0,1 e 99,9 da latitude e
  da longitude, para um ponto errado não esticar a caixa), mais uma margem. É o recorte do OSM no Actions (osm.py) e
  das outras fontes de pontos (pois.py).
- **Vizinhas**: municípios cuja caixa de endereços (sem margem) cruza a caixa da cidade (com a margem de 3 km). Os
  pontos de serviço e os domicílios delas entram quando caem dentro da caixa da cidade: um mercado do outro lado da
  divisa, a 300 m do imóvel, conta.

Saída: base/saida/localizacao/cidades-base.csv (commitada: o Actions lê a caixa daqui sem baixar o CNEFE):
`codigo_ibge,uf,nome,imoveis,lat_min,lat_max,lon_min,lon_max,vizinhas` (vizinhas separadas por espaço).

Uso: python base/fontes/localizacao/cidades.py [--instantaneo ...] [--saida ...]
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import json
import math
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import entradas as ent  # noqa: E402

RAIZ = AQUI.parents[2]
INSTANTANEO_PADRAO = RAIZ / "base" / "saida" / "site" / "imoveis.json.gz"
SAIDA_PADRAO = RAIZ / "base" / "saida" / "localizacao" / "cidades-base.csv"
MUNICIPIOS_CSV = RAIZ / "base" / "geo" / "municipios.csv"
#: margem da caixa além do último endereço (2 km da divisa + o raio de 1 km das métricas)
MARGEM_KM = 3.0
CAMPOS = ["codigo_ibge", "uf", "nome", "imoveis", "lat_min", "lat_max", "lon_min", "lon_max", "vizinhas"]


def log(*partes: object) -> None:
    print(*partes, flush=True)


def km_lat(km: float) -> float:
    return km / 111.32


def km_lon(km: float, lat: float) -> float:
    return km / (111.32 * max(0.2, math.cos(math.radians(lat))))


def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 2 * 6371.0 * math.asin(min(1.0, math.sqrt(a)))


def ler_instantaneo(caminho: Path) -> list[dict]:
    with gzip.open(caminho, "rt", encoding="utf-8") as f:
        c = json.load(f)["colunas"]
    return [{"id": c["id"][k], "uf": c["uf"][k], "cidade": c["cidade"][k], "tipo": c["tipo"][k]} for k in range(len(c["id"]))]


def codigos_dos_imoveis(imoveis: list[dict]) -> dict[str, int | None]:
    """id → código IBGE (None se a cidade não casar)."""
    import enderecobr as eb

    import geocodificar as gc

    tabela = ent.pasta_geocodebr() / f"geocodebr_data_release_{ent.GEOCODEBR_RELEASE}" / "municipio.parquet"
    munis = gc.Municipios(tabela)
    cache: dict[tuple[str, str], int | None] = {}
    saida: dict[str, int | None] = {}
    for i in imoveis:
        k = (i["uf"], i["cidade"] or "")
        if k not in cache:
            cache[k] = munis.codigo(i["uf"], i["cidade"], eb.padronizar_municipios) if i["cidade"] else None
        saida[i["id"]] = cache[k]
    return saida


def ler_municipios() -> dict[int, dict]:
    """Sede e raio (o maior entre a malha e o CNEFE, como base/geo/municipios.ts)."""
    m: dict[int, dict] = {}
    with MUNICIPIOS_CSV.open(encoding="utf-8") as f:
        for linha in csv.DictReader(f):
            m[int(linha["codigo_ibge"])] = {"uf": linha["uf"], "nome": linha["nome"], "lat": float(linha["lat"]), "lon": float(linha["lon"]),
                                            "raio_km": float(linha["raio_km"] or 30)}
    raios = MUNICIPIOS_CSV.with_name("raios-cnefe.csv")
    if raios.exists():
        with raios.open(encoding="utf-8") as f:
            for linha in csv.DictReader(f):
                x = m.get(int(linha["codigo_ibge"]))
                if x and float(linha["raio_km"]) > x["raio_km"]:
                    x["raio_km"] = float(linha["raio_km"])
    return m


def cruza(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return a[0] <= b[1] and b[0] <= a[1] and a[2] <= b[3] and b[2] <= a[3]


# a coordenada do Parquet do geobr está só em `geometry` (C5 da verificação); o DuckDB sem a extensão espacial lê o
# texto "POINT (lon lat)". Ponto vazio ou fora do padrão vira NULL (TRY_CAST).
SQL_LAT = "TRY_CAST(regexp_extract(ST_AsText(geometry), 'POINT \\(([-0-9.eE]+) ([-0-9.eE]+)\\)', 2) AS DOUBLE)"
SQL_LON = "TRY_CAST(regexp_extract(ST_AsText(geometry), 'POINT \\(([-0-9.eE]+) ([-0-9.eE]+)\\)', 1) AS DOUBLE)"


def caixas_do_cnefe(caminho_cnefe: Path) -> dict[int, tuple[float, float, float, float]]:
    """(lat_min, lat_max, lon_min, lon_max) dos endereços do CNEFE de cada município do Brasil (percentis 0,1 e 99,9).
    Cerca de 2 min para os 111 milhões de endereços."""
    import duckdb

    con = duckdb.connect()
    linhas = con.execute(
        f"""WITH p AS (SELECT code_muni::INTEGER AS m, {SQL_LAT} AS lat, {SQL_LON} AS lon
                      FROM read_parquet('{caminho_cnefe.as_posix()}'))
            SELECT m, quantile_cont(lat, 0.001), quantile_cont(lat, 0.999), quantile_cont(lon, 0.001), quantile_cont(lon, 0.999)
            FROM p WHERE lat IS NOT NULL GROUP BY m"""
    ).fetchall()
    con.close()
    return {int(m): (a, b, c, d) for m, a, b, c, d in linhas}


def gerar(instantaneo: Path, saida: Path) -> list[dict]:
    t0 = time.time()
    imoveis = ler_instantaneo(instantaneo)
    codigos = codigos_dos_imoveis(imoveis)
    por_cidade = collections.Counter(c for c in codigos.values() if c)
    sem = sum(1 for c in codigos.values() if not c)
    municipios = ler_municipios()
    log(f"{len(imoveis)} imóveis, {len(por_cidade)} cidades com código IBGE, {sem} sem código ({time.time() - t0:.0f} s)")
    caminho = ent.caminho_por_nome("cnefe_2022")
    caixas = caixas_do_cnefe(caminho)
    log(f"Caixas do CNEFE: {len(caixas)} municípios ({time.time() - t0:.0f} s)")
    linhas = []
    for c, n in sorted(por_cidade.items()):
        m = municipios.get(c)
        if c in caixas:
            lat0, lat1, lon0, lon1 = caixas[c]
        elif m:
            r = m["raio_km"]
            lat0, lat1, lon0, lon1 = m["lat"] - km_lat(r), m["lat"] + km_lat(r), m["lon"] - km_lon(r, m["lat"]), m["lon"] + km_lon(r, m["lat"])
        else:
            continue
        meio = (lat0 + lat1) / 2
        caixa = (lat0 - km_lat(MARGEM_KM), lat1 + km_lat(MARGEM_KM), lon0 - km_lon(MARGEM_KM, meio), lon1 + km_lon(MARGEM_KM, meio))
        viz = sorted(v for v, cv in caixas.items() if v != c and cruza(caixa, cv))
        linhas.append({
            "codigo_ibge": c,
            "uf": m["uf"] if m else "",
            "nome": m["nome"] if m else "",
            "imoveis": n,
            "lat_min": round(caixa[0], 5),
            "lat_max": round(caixa[1], 5),
            "lon_min": round(caixa[2], 5),
            "lon_max": round(caixa[3], 5),
            "vizinhas": " ".join(str(v) for v in viz),
        })
    saida.parent.mkdir(parents=True, exist_ok=True)
    with saida.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        w.writeheader()
        w.writerows(linhas)
    log(f"Gravado: {saida} ({len(linhas)} cidades, {time.time() - t0:.0f} s)")
    return linhas


def ler_cidades(caminho: Path = SAIDA_PADRAO) -> list[dict]:
    """cidades-base.csv → lista de dicionários com os números convertidos."""
    with caminho.open(encoding="utf-8") as f:
        saida = []
        for linha in csv.DictReader(f):
            saida.append({
                "codigo_ibge": int(linha["codigo_ibge"]),
                "uf": linha["uf"],
                "nome": linha["nome"],
                "imoveis": int(linha["imoveis"]),
                "caixa": (float(linha["lat_min"]), float(linha["lat_max"]), float(linha["lon_min"]), float(linha["lon_max"])),
                "vizinhas": [int(v) for v in linha["vizinhas"].split()] if linha["vizinhas"] else [],
            })
    return saida


def principal(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--instantaneo", default=str(INSTANTANEO_PADRAO))
    p.add_argument("--saida", default=str(SAIDA_PADRAO))
    a = p.parse_args(argv)
    gerar(Path(a.instantaneo), Path(a.saida))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
