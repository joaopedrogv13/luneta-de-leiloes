"""OpenStreetMap no Actions: reduz o extrato do Brasil (osmium export, geojsonseq) aos pontos de transporte e lazer nas
cidades da base, num CSV pequeno, com a licença ODbL no próprio arquivo.

Roda no GitHub Actions (a Geofabrik não abre deste contêiner): o actions.sh baixa o brazil-latest.osm.pbf, filtra as
tags com `osmium tags-filter`, exporta em geojsonseq e chama:

    python base/fontes/localizacao/osm.py --geojsonseq pois.geojsonseq --saida base/fontes/localizacao/saida \
        [--cidades base/saida/localizacao/cidades-base.csv] [--data-osm 2026-10-17T20:21:02Z]

Categorias (uma por objeto; a primeira regra que casa vence):

| categoria  | o que é | tags |
|---|---|---|
| trilho     | estação ou acesso de metrô, trem, VLT ou monotrilho | railway=station/halt (com public_transport ou o modo: estação velha só com railway=station fica fora), railway=tram_stop/subway_entrance; public_transport=station com train/subway/light_rail/tram/monorail=yes |
| brt        | estação de BRT | nome, rede ou operador com "BRT" em estação, plataforma, terminal ou ponto de ônibus |
| barca      | terminal de barcas | amenity=ferry_terminal |
| terminal   | terminal de ônibus | amenity=bus_station; public_transport=station com bus=yes |
| onibus     | ponto de ônibus | highway=bus_stop; public_transport=platform com bus=yes |
| praca      | praça | place=square; leisure=park ou highway=pedestrian (área) com nome "Praça ..." |
| parque     | parque | leisure=park; landuse=recreation_ground |
| playground | parquinho | leisure=playground |

Fora: o que está desativado, abandonado, histórico, de carga ou só turístico (disused, abandoned, historic,
railway:historic, usage=freight/tourism/military, railway=station com station=funicular é mantido) e lazer com
access=private/no.

Geometria: ponto → o ponto; via ou área de transporte → o ponto representativo; parque, praça ou parquinho pequeno (até
5 ha) → o ponto representativo com `raio_m` (o raio do círculo de mesma área: a distância até o parque é a distância
até o centro menos esse raio); área maior → pontos na borda a cada 100 m (`raio_m` 0) mais o centro.

Recorte: só o que cai na caixa de alguma cidade da base (cidades-base.csv, que já tem 3 km de margem além do último
endereço); estações, barcas e terminais com 5 km a mais (a distância até a estação vai até 5 km).

Saída (pasta --saida):
- `osm-pois.csv.gz`: `categoria,lat,lon,raio_m` (5 casas), com o aviso da ODbL nas primeiras linhas (começam com #);
- `osm-LEIA-ME.txt`: licença, atribuição, data dos dados e como foi gerado;
- `osm-cobertura.csv`: por cidade, quantos pontos de cada categoria caem na caixa (para medir a cobertura do OSM).

Só biblioteca padrão + shapely (polígonos).
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import io
import json
import math
import re
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
CIDADES_PADRAO = RAIZ / "base" / "saida" / "localizacao" / "cidades-base.csv"

CATEGORIAS = ["trilho", "brt", "barca", "terminal", "onibus", "praca", "parque", "playground"]
ESTACOES = {"trilho", "brt", "barca", "terminal"}
LAZER = {"praca", "parque", "playground"}
MARGEM_ESTACAO_KM = 5.0
AREA_PEQUENA_M2 = 50_000
PASSO_BORDA_M = 100

AVISO_ODBL = [
    "Dados do OpenStreetMap (c) contribuidores do OpenStreetMap, https://www.openstreetmap.org/copyright",
    "Disponibilizados sob a Open Database License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/",
    "Este arquivo é um banco de dados derivado do OpenStreetMap e também está sob a ODbL 1.0 (compartilhar pela mesma licença).",
    "Gerado pela Luneta de Leilões (base/fontes/localizacao/osm.py): só categoria e coordenada; nenhum nome é gravado.",
]

RE_BRT = re.compile(r"\bBRT\b", re.IGNORECASE)
RE_PRACA = re.compile(r"^\s*pra[cç]a\b", re.IGNORECASE)
SIM = {"yes", "true", "1"}


def log(*partes: object) -> None:
    print(*partes, flush=True)


def desativado(t: dict) -> bool:
    if any(k.startswith(("disused", "abandoned", "was:", "removed", "demolished", "razed", "construction", "proposed")) for k in t):
        return True
    if t.get("historic") or t.get("railway:historic") or t.get("railway:preserved") in SIM:
        return True
    if t.get("usage") in ("freight", "tourism", "military", "industrial"):
        return True
    if t.get("railway") in ("abandoned", "disused", "razed", "proposed", "construction"):
        return True
    return t.get("operational_status") in ("closed", "abandoned") or t.get("opening_hours") == "closed"


def classificar(t: dict) -> str | None:
    """Categoria do objeto pelas tags, ou None."""
    if not t or desativado(t):
        return None
    nome = " ".join(str(t.get(k) or "") for k in ("name", "network", "operator", "official_name"))
    pt = t.get("public_transport")
    rail = t.get("railway")
    # trilhos: estação (railway=station/halt) só com sinal de que está em operação para passageiros (o esquema de
    # transporte público do OSM ou o modo); muita estação velha do interior ficou só com railway=station
    modo = any(t.get(k) in SIM for k in ("train", "subway", "light_rail", "tram", "monorail")) or t.get("station") in ("subway", "light_rail", "train", "monorail")
    if rail in ("station", "halt") and t.get("station") != "funicular" and not (t.get("tourism") or t.get("railway:tourism") in SIM):
        if pt in ("station", "stop_position", "platform") or modo:
            return "trilho"
        return None
    if rail in ("tram_stop", "subway_entrance"):
        return "trilho"
    if pt == "station" and modo:
        return "trilho"
    # BRT (antes de terminal e de ponto de ônibus)
    onibus_like = t.get("highway") == "bus_stop" or t.get("amenity") == "bus_station" or pt in ("station", "platform")
    if onibus_like and RE_BRT.search(nome):
        return "brt"
    if t.get("amenity") == "ferry_terminal":
        return "barca"
    if t.get("amenity") == "bus_station" or (pt == "station" and t.get("bus") in SIM):
        return "terminal"
    if t.get("highway") == "bus_stop" or (pt == "platform" and t.get("bus") in SIM):
        return "onibus"
    # lazer
    if t.get("access") in ("private", "no"):
        return None
    if t.get("place") == "square":
        return "praca"
    if t.get("leisure") == "park":
        return "praca" if RE_PRACA.search(t.get("name") or "") else "parque"
    if t.get("highway") == "pedestrian" and t.get("area") in SIM and RE_PRACA.search(t.get("name") or ""):
        return "praca"
    if t.get("landuse") == "recreation_ground":
        return "parque"
    if t.get("leisure") == "playground":
        return "playground"
    return None


# ---------------------------------------------------------------------------------------------------------------------
# Caixas das cidades (índice em quadrados de 0,5°)
# ---------------------------------------------------------------------------------------------------------------------


def ler_caixas(caminho: Path) -> list[dict]:
    with caminho.open(encoding="utf-8") as f:
        return [
            {"codigo": int(l["codigo_ibge"]), "uf": l["uf"], "nome": l["nome"],
             "caixa": (float(l["lat_min"]), float(l["lat_max"]), float(l["lon_min"]), float(l["lon_max"]))}
            for l in csv.DictReader(f)
        ]


def expandir(caixa: tuple[float, float, float, float], km: float) -> tuple[float, float, float, float]:
    dlat = km / 111.32
    dlon = km / (111.32 * max(0.2, math.cos(math.radians((caixa[0] + caixa[1]) / 2))))
    return caixa[0] - dlat, caixa[1] + dlat, caixa[2] - dlon, caixa[3] + dlon


class IndiceCaixas:
    PASSO = 0.5

    def __init__(self, caixas: list[tuple[float, float, float, float]]):
        self.caixas = caixas
        self.grade: dict[tuple[int, int], list[int]] = collections.defaultdict(list)
        for k, (a, b, c, d) in enumerate(caixas):
            for i in range(math.floor(a / self.PASSO), math.floor(b / self.PASSO) + 1):
                for j in range(math.floor(c / self.PASSO), math.floor(d / self.PASSO) + 1):
                    self.grade[(i, j)].append(k)

    def dentro(self, lat: float, lon: float) -> list[int]:
        cands = self.grade.get((math.floor(lat / self.PASSO), math.floor(lon / self.PASSO)), ())
        return [k for k in cands if self.caixas[k][0] <= lat <= self.caixas[k][1] and self.caixas[k][2] <= lon <= self.caixas[k][3]]


# ---------------------------------------------------------------------------------------------------------------------
# Geometria
# ---------------------------------------------------------------------------------------------------------------------


def area_m2(geo) -> float:
    """Área aproximada em m² (graus² × fator local)."""
    c = geo.centroid
    return geo.area * (111320.0**2) * max(0.2, math.cos(math.radians(c.y)))


def pontos_da_geometria(geom: dict, categoria: str) -> list[tuple[float, float, int]]:
    """[(lat, lon, raio_m)] para gravar."""
    tipo = geom.get("type")
    if tipo == "Point":
        lon, lat = geom["coordinates"][:2]
        return [(lat, lon, 0)]
    import shapely.geometry as sg

    try:
        g = sg.shape(geom)
    except Exception:  # noqa: BLE001 - geometria quebrada fica de fora
        return []
    if g.is_empty:
        return []
    if categoria not in LAZER or tipo not in ("Polygon", "MultiPolygon"):
        if categoria in LAZER and tipo in ("LineString", "MultiLineString"):
            return []  # praça ou parque como linha (via de pedestre aberta): não é área
        p = g.representative_point()
        return [(p.y, p.x, 0)]
    a = area_m2(g)
    p = g.representative_point()
    if a <= AREA_PEQUENA_M2:
        return [(p.y, p.x, int(round(math.sqrt(a / math.pi))))]
    saida = [(p.y, p.x, 0)]
    partes = list(g.geoms) if hasattr(g, "geoms") else [g]
    for parte in partes:
        anel = parte.exterior
        lat0 = anel.centroid.y
        metros_por_grau = 111320.0 * math.sqrt(max(0.04, math.cos(math.radians(lat0))))  # média dos eixos
        comprimento_m = anel.length * metros_por_grau
        n = max(4, int(comprimento_m / PASSO_BORDA_M))
        for k in range(n):
            q = anel.interpolate(k / n, normalized=True)
            saida.append((q.y, q.x, 0))
    return saida


# ---------------------------------------------------------------------------------------------------------------------
# Leitura e gravação
# ---------------------------------------------------------------------------------------------------------------------


def ler_geojsonseq(caminho: Path):
    with open(caminho, "rb") as f:
        for linha in f:
            linha = linha.strip().lstrip(b"\x1e")
            if not linha:
                continue
            try:
                yield json.loads(linha)
            except json.JSONDecodeError:
                continue


def reduzir(geojsonseq: Path, cidades: list[dict]) -> tuple[list[tuple], dict]:
    caixas = [c["caixa"] for c in cidades]
    ix = IndiceCaixas(caixas)
    ix_est = IndiceCaixas([expandir(c, MARGEM_ESTACAO_KM) for c in caixas])
    vistos: set[tuple] = set()
    linhas: list[tuple] = []
    cobertura = collections.defaultdict(collections.Counter)
    cont = collections.Counter()
    t0 = time.time()
    for k, feat in enumerate(ler_geojsonseq(geojsonseq)):
        if k and k % 500_000 == 0:
            log(f"  {k} objetos lidos, {len(linhas)} pontos ({time.time() - t0:.0f} s)")
        cont["objetos"] += 1
        cat = classificar(feat.get("properties") or {})
        if not cat:
            continue
        cont[f"classificado:{cat}"] += 1
        pontos = pontos_da_geometria(feat.get("geometry") or {}, cat)
        indice = ix_est if cat in ESTACOES else ix
        contou = False
        for lat, lon, raio in pontos:
            if not indice.dentro(lat, lon):
                continue
            chave = (cat, round(lat, 5), round(lon, 5))
            if chave in vistos:
                continue
            vistos.add(chave)
            linhas.append((cat, round(lat, 5), round(lon, 5), raio))
            if not contou:
                # cobertura: um objeto conta uma vez por cidade (pelo primeiro ponto dentro da caixa sem a margem extra)
                for c in ix.dentro(lat, lon):
                    cobertura[cidades[c]["codigo"]][cat] += 1
                contou = True
        if contou:
            cont[f"gravado:{cat}"] += 1
    linhas.sort()
    return linhas, {"contagem": dict(cont), "cobertura": cobertura}


def gravar(saida: Path, linhas: list[tuple], extra: dict, cidades: list[dict], data_osm: str | None) -> None:
    saida.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    for l in AVISO_ODBL:
        buf.write(f"# {l}\n")
    buf.write(f"# Dados do OSM de {data_osm or 'data não informada'} (Geofabrik, brazil-latest.osm.pbf)\n")
    buf.write("categoria,lat,lon,raio_m\n")
    for cat, lat, lon, raio in linhas:
        buf.write(f"{cat},{lat:.5f},{lon:.5f},{raio}\n")
    with gzip.open(saida / "osm-pois.csv.gz", "wt", encoding="utf-8", compresslevel=9) as f:
        f.write(buf.getvalue())
    por_cat = collections.Counter(l[0] for l in linhas)
    leia = [
        "Pontos de transporte e lazer do OpenStreetMap nas cidades da base da Luneta de Leilões",
        "",
        *AVISO_ODBL,
        "",
        f"Dados do OSM de: {data_osm or 'não informada'} (https://download.geofabrik.de/south-america/brazil-latest.osm.pbf)",
        f"Gerado em: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}",
        "Como: osmium tags-filter + osmium export (geojsonseq) + base/fontes/localizacao/osm.py (regras no topo do arquivo).",
        "Colunas de osm-pois.csv.gz: categoria, lat, lon (5 casas), raio_m (parque pequeno: raio do círculo de mesma área).",
        "",
        "Pontos por categoria:",
        *[f"  {c}: {por_cat.get(c, 0)}" for c in CATEGORIAS],
        "",
        "Contagens da leitura:",
        *[f"  {k}: {v}" for k, v in sorted(extra["contagem"].items())],
    ]
    (saida / "osm-LEIA-ME.txt").write_text("\n".join(leia) + "\n", encoding="utf-8")
    with (saida / "osm-cobertura.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["codigo_ibge", "uf", "nome", *CATEGORIAS])
        for c in cidades:
            cob = extra["cobertura"].get(c["codigo"], {})
            w.writerow([c["codigo"], c["uf"], c["nome"], *[cob.get(k, 0) for k in CATEGORIAS]])
    log(f"Gravado: {saida / 'osm-pois.csv.gz'} ({len(linhas)} pontos: {dict(por_cat)})")


def principal(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--geojsonseq", required=True)
    p.add_argument("--saida", required=True)
    p.add_argument("--cidades", default=str(CIDADES_PADRAO))
    p.add_argument("--data-osm", default=None)
    a = p.parse_args(argv)
    cidades = ler_caixas(Path(a.cidades))
    log(f"{len(cidades)} cidades da base ({a.cidades})")
    linhas, extra = reduzir(Path(a.geojsonseq), cidades)
    gravar(Path(a.saida), linhas, extra, cidades, a.data_osm)
    return 0


if __name__ == "__main__":
    sys.exit(principal())
