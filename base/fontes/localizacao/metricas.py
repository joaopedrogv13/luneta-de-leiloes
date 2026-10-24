"""Métricas do entorno de cada ponto (imóveis e células habitadas da grade 2022), por cidade da base.

O que é medido em cada ponto (os raios são em linha reta):

| indicador | o que é | raio | fonte |
|---|---|---|---|
| `mercados_500`, `farmacias_500`, `padarias_500` | estabelecimentos pelo nome (C8) | 500 m | CNEFE 2022 |
| `escolas_1k` | escolas em atividade (públicas e privadas) | 1 km | INEP 2025 |
| `saude_1k` | unidades de saúde de atenção (C7) | 1 km | CNES abr/2026 |
| `comercio_1k` | estabelecimentos de comércio e serviços (espécie 6; a galeria conta 1) | 1 km | CNEFE 2022 |
| `onibus_500` | pontos de ônibus | 500 m | OpenStreetMap |
| `estacao_m` | distância até a estação de metrô, trem, VLT, BRT, barca ou terminal de ônibus mais perto (até 5 km) | — | OpenStreetMap |
| `parque_m` | distância até o parque, praça ou parquinho mais perto (até 3 km; parque pequeno: até a borda aproximada) | — | OpenStreetMap |
| `renda` | renda dos responsáveis com rendimento, média dos setores ponderada pelos domicílios do CNEFE no raio (R$ de 2022) | 500 m (1 km com menos de 50 domicílios) | Censo 2022 + CNEFE |
| `pavimentacao`, `calcada`, `iluminacao`, `onibus_face` | % dos domicílios em face de quadra com via pavimentada, calçada, iluminação pública, ponto de ônibus | 500 m | Censo 2022 (Entorno) + CNEFE |
| `esgoto` | % dos domicílios com esgoto pela rede geral ou pluvial (ou fossa ligada à rede) | 500 m | Censo 2022 (Domicílio) + CNEFE |

**Agregação antes (C12).** Os 5 milhões de domicílios de São Paulo não são contados um a um em volta de cada ponto: o
CNEFE é somado antes em quadradinhos de 0,001° (cerca de 110 × 100 m), com, por quadradinho, o número de domicílios e a
soma das variáveis do setor de cada domicílio (renda, % pavimentação...). A soma no raio é a soma dos quadradinhos cujo
centro cai no raio (erro de borda de até 70 m). Os pontos de serviço (bem menos numerosos) são contados exatos, com uma
árvore k-d por categoria.

**Ponderação por domicílio.** O valor do raio é a média dos setores pesada pelo número de domicílios do CNEFE de cada
setor que cai no raio: reflete o raio real sem desenhar o setor. O código de setor do CNEFE é o da malha da coleta;
6,9% dos domicílios das cidades da base têm um código que não existe nos agregados (96% em Nossa Senhora do
Socorro/SE): esses recebem o setor do polígono da malha de setores 2022 em que caem (C6, opção a). O que ainda fica
sem dado (setor em sigilo, ponto fora da malha) entra na fração perdida (`perda_renda`): acima de 30%, o componente
sai marcado `incompleto`.

Distâncias e raios num plano local por cidade (equirretangular centrado na caixa da cidade).
"""
from __future__ import annotations

import math
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import cidades as cid  # noqa: E402
import entradas as ent  # noqa: E402

RAIO_COMERCIO_M = 500
RAIO_SERVICO_M = 1000
RAIO_ENTORNO_M = 500
RAIO_ENTORNO_FOLGA_M = 1000
MIN_DOMICILIOS = 50
ESTACAO_MAX_M = 5000
PARQUE_MAX_M = 3000
PASSO_BIN = 1000  # 1/0,001°

CAT_MERCADO = "mercado"
CONTAGENS = {
    # indicador: (categorias, raio)
    "mercados_500": (("mercado",), RAIO_COMERCIO_M),
    "farmacias_500": (("farmacia",), RAIO_COMERCIO_M),
    "padarias_500": (("padaria",), RAIO_COMERCIO_M),
    "escolas_1k": (("escola_publica", "escola_privada"), RAIO_SERVICO_M),
    "saude_1k": (("saude",), RAIO_SERVICO_M),
    "comercio_1k": (("estab",), RAIO_SERVICO_M),
    "onibus_500": (("onibus",), RAIO_COMERCIO_M),
}
# metro, trem, vlt e monotrilho desde a rodada 5 (osm.py); "trilho" é a categoria única dos arquivos antigos
ESTACOES = ("metro", "trem", "vlt", "monotrilho", "trilho", "brt", "barca", "terminal")
LAZER = ("praca", "parque", "playground")
CAMADAS = ["dom", "dom_r4", "r4", "dom_r6", "r6", "dom_ent", "pav", "calc", "ilum", "onib", "dom_esg", "esg", "dom_sem"]
INDICADORES = [*CONTAGENS, "estacao_m", "parque_m", "renda", "pavimentacao", "calcada", "iluminacao", "onibus_face", "esgoto"]


def log(*partes: object) -> None:
    print(*partes, flush=True)


# ---------------------------------------------------------------------------------------------------------------------
# Leitura (uma vez para todas as cidades)
# ---------------------------------------------------------------------------------------------------------------------


def _lista(munis) -> str:
    return ",".join(str(int(m)) for m in sorted(munis)) or "0"


def setor_por_poligono(lat: np.ndarray, lon: np.ndarray, codigos: np.ndarray, geometrias) -> np.ndarray:
    """Código do setor (polígono da malha) que contém cada ponto, ou -1 fora de todos. Ponto na divisa de dois setores
    fica com o primeiro que o índice devolve (o resultado é o mesmo a cada execução)."""
    import shapely

    saida = np.full(len(lat), -1, dtype=np.int64)
    if not len(lat) or not len(geometrias):
        return saida
    arv = shapely.STRtree(geometrias)
    ip, ig = arv.query(shapely.points(np.asarray(lon, dtype=np.float64), np.asarray(lat, dtype=np.float64)), predicate="intersects")
    if len(ip):
        ordem = np.lexsort((ig, ip))
        ip, ig = ip[ordem], ig[ordem]
        _, primeiro = np.unique(ip, return_index=True)
        saida[ip[primeiro]] = np.asarray(codigos, dtype=np.int64)[ig[primeiro]]
    return saida


def carregar_bins(munis: list[int]) -> dict[str, np.ndarray]:
    """Quadradinhos de 0,001° com os domicílios do CNEFE (espécie 1) e as somas das variáveis dos setores (C12).

    O CNEFE grava o setor da malha usada na coleta; os agregados de 2022 usam a malha final, e 6,9% dos domicílios das
    cidades da base (96% em Nossa Senhora do Socorro/SE, 69% em Criciúma/SC, 23% em Campinas/SP) têm um código de setor
    que não existe nos agregados. Esses domicílios recebem o setor do polígono da malha de setores 2022 em que caem (C6,
    opção a); só o que não cai em nenhum polígono fica sem setor (entra na fração perdida). `info` traz as contagens."""
    import duckdb
    import pyarrow as pa
    import shapely

    t0 = time.time()
    con = duckdb.connect()
    c = ent.caminho_por_nome
    con.execute(f"""CREATE TEMP TABLE setor AS
        SELECT b.code_tract::BIGINT AS setor,
               r.V06004 AS r4, r.V06006 AS r6,
               CASE WHEN e.domicilios_V05000 > 0 THEN e.domicilios_V05006 / e.domicilios_V05000 END AS pav,
               CASE WHEN e.domicilios_V05000 > 0 THEN e.domicilios_V05021 / e.domicilios_V05000 END AS calc,
               CASE WHEN e.domicilios_V05000 > 0 THEN e.domicilios_V05012 / e.domicilios_V05000 END AS ilum,
               CASE WHEN e.domicilios_V05000 > 0 THEN e.domicilios_V05015 / e.domicilios_V05000 END AS onib,
               CASE WHEN d.domicilio01_V00001 > 0 THEN (coalesce(d.domicilio02_V00309, 0) + coalesce(d.domicilio02_V00310, 0)) / d.domicilio01_V00001 END AS esg
        FROM read_parquet('{c('censobr:2022_tracts_basico').as_posix()}') b
        LEFT JOIN read_parquet('{c('censobr:2022_tracts_responsavelrenda').as_posix()}') r ON r.code_tract = b.code_tract
        LEFT JOIN read_parquet('{c('censobr:2022_tracts_entorno').as_posix()}') e ON e.code_tract = b.code_tract
        LEFT JOIN read_parquet('{c('censobr:2022_tracts_domicilio').as_posix()}') d ON d.code_tract = b.code_tract""")
    cnefe = f"""SELECT {cid.SQL_LAT} AS lat, {cid.SQL_LON} AS lon, code_tract::BIGINT AS setor, code_muni::INTEGER AS m
                FROM read_parquet('{c('cnefe_2022').as_posix()}') WHERE code_muni IN ({_lista(munis)}) AND cod_especie = 1"""
    # 1) os domicílios com setor fora dos agregados: o setor do polígono da malha 2022 em que caem
    fora = con.execute(f"""SELECT p.lat, p.lon, p.m FROM ({cnefe}) p LEFT JOIN setor s ON s.setor = p.setor
                           WHERE s.setor IS NULL AND p.lat IS NOT NULL AND p.lon IS NOT NULL""").fetchnumpy()
    f_lat, f_lon = np.asarray(fora["lat"], dtype=np.float64), np.asarray(fora["lon"], dtype=np.float64)
    novo = np.full(len(f_lat), -1, dtype=np.int64)
    if len(f_lat):
        munis_fora = sorted({int(x) for x in np.unique(fora["m"])})
        pol = con.execute(f"""SELECT code_tract::BIGINT AS setor, ST_AsWKB(geometry) AS wkb
            FROM read_parquet('{c('censustracts_2022_simplified').as_posix()}') WHERE code_muni IN ({_lista(munis_fora)})""").to_arrow_table()
        geos = shapely.from_wkb(pol.column("wkb").to_numpy(zero_copy_only=False))
        novo = setor_por_poligono(f_lat, f_lon, pol.column("setor").to_numpy(), geos)
    recuperados = int((novo >= 0).sum())
    g2 = pa.table({
        "bi": np.floor(f_lat * PASSO_BIN).astype(np.int32),
        "bj": np.floor(f_lon * PASSO_BIN).astype(np.int32),
        "setor": pa.array(novo, mask=novo < 0),
    })
    con.register("g2", g2)
    # 2) todos os domicílios por quadradinho e setor (o setor do polígono no lugar do que não está nos agregados)
    tab = con.execute(f"""
        WITH p AS (
            SELECT floor(p.lat * {PASSO_BIN})::INTEGER AS bi, floor(p.lon * {PASSO_BIN})::INTEGER AS bj, p.setor
            FROM ({cnefe}) p SEMI JOIN setor s ON s.setor = p.setor),
        g1 AS (SELECT bi, bj, setor, count(*)::DOUBLE AS n FROM p WHERE bi IS NOT NULL AND bj IS NOT NULL GROUP BY ALL),
        g AS (SELECT bi, bj, setor, n FROM g1
              UNION ALL SELECT bi, bj, setor, count(*)::DOUBLE AS n FROM g2 GROUP BY ALL)
        SELECT g.bi, g.bj,
               sum(n) AS dom,
               sum(CASE WHEN s.r4 IS NOT NULL THEN n ELSE 0 END) AS dom_r4, sum(n * coalesce(s.r4, 0)) AS r4,
               sum(CASE WHEN s.r6 IS NOT NULL THEN n ELSE 0 END) AS dom_r6, sum(n * coalesce(s.r6, 0)) AS r6,
               sum(CASE WHEN s.pav IS NOT NULL THEN n ELSE 0 END) AS dom_ent,
               sum(n * coalesce(s.pav, 0)) AS pav, sum(n * coalesce(s.calc, 0)) AS calc, sum(n * coalesce(s.ilum, 0)) AS ilum,
               sum(n * coalesce(s.onib, 0)) AS onib,
               sum(CASE WHEN s.esg IS NOT NULL THEN n ELSE 0 END) AS dom_esg, sum(n * coalesce(s.esg, 0)) AS esg,
               sum(CASE WHEN s.setor IS NULL THEN n ELSE 0 END) AS dom_sem
        FROM g LEFT JOIN setor s ON s.setor = g.setor
        GROUP BY g.bi, g.bj ORDER BY g.bi, g.bj""").to_arrow_table()
    con.close()
    saida = {k: tab.column(k).to_numpy() for k in ["bi", "bj", *CAMADAS]}
    saida["bi"] = saida["bi"].astype(np.int32)
    saida["bj"] = saida["bj"].astype(np.int32)
    for k in CAMADAS:
        saida[k] = saida[k].astype(np.float64)
    total = int(saida["dom"].sum())
    saida["info"] = {"domicilios": total, "setor_fora_dos_agregados": int(len(f_lat)), "recuperados_pelo_poligono": recuperados,
                     "sem_setor": int(saida["dom_sem"].sum())}
    log(f"  domicílios do CNEFE em {len(saida['bi'])} quadradinhos ({total} domicílios; {len(f_lat)} com setor fora dos agregados, "
        f"{recuperados} recuperados pelo polígono da malha 2022; {time.time() - t0:.0f} s)")
    return saida


def carregar_celulas(codigos: list[int]) -> dict[str, np.ndarray]:
    """Células habitadas (pop_total > 0) da grade 2022 das cidades: centro, moradores e domicílios."""
    import duckdb

    t0 = time.time()
    con = duckdb.connect()
    tab = con.execute(f"""SELECT code_muni::INTEGER AS code, pop_total AS pop, total_dom AS dom, ST_AsWKB(geometry) AS wkb
        FROM read_parquet('{ent.caminho_por_nome('statsgrid_2022').as_posix()}')
        WHERE code_muni IN ({_lista(codigos)}) AND pop_total > 0""").to_arrow_table()
    con.close()
    import shapely

    geo = shapely.from_wkb(tab.column("wkb").to_numpy(zero_copy_only=False))
    centro = shapely.centroid(geo)
    saida = {
        "code": tab.column("code").to_numpy().astype(np.int32),
        "pop": tab.column("pop").to_numpy().astype(np.float64),
        "dom": tab.column("dom").to_numpy().astype(np.float64),
        "lat": shapely.get_y(centro),
        "lon": shapely.get_x(centro),
    }
    log(f"  grade 2022: {len(saida['code'])} células habitadas, {int(saida['pop'].sum())} moradores ({time.time() - t0:.0f} s)")
    return saida


def carregar_pois(caminho: Path) -> dict[str, np.ndarray]:
    import pyarrow.parquet as pq

    t0 = time.time()
    tab = pq.read_table(caminho, columns=["fonte", "categoria", "lat", "lon", "raio_m"])
    cats = tab.column("categoria").dictionary_encode().combine_chunks()
    nomes = [str(x) for x in cats.dictionary.to_pylist()]
    saida = {
        "cat": cats.indices.to_numpy().astype(np.int16),
        "lat": tab.column("lat").to_numpy(),
        "lon": tab.column("lon").to_numpy(),
        "raio": tab.column("raio_m").to_numpy().astype(np.float64),
        "nomes": np.array(nomes, dtype=object),
    }
    ordem = np.argsort(saida["lat"], kind="stable")
    for k in ("cat", "lat", "lon", "raio"):
        saida[k] = saida[k][ordem]
    log(f"  pontos de serviço: {len(saida['lat'])} em {len(nomes)} categorias ({time.time() - t0:.0f} s)")
    return saida


def faces_onibus_por_municipio(codigos: list[int]) -> dict[int, float]:
    """Faces de quadra com ponto de ônibus (Entorno, V05415) por município: a base da cobertura do OSM."""
    import duckdb

    return {int(m): float(f or 0) for m, f in duckdb.sql(
        f"SELECT code_muni::INTEGER, sum(faces_V05415) FROM read_parquet('{ent.caminho_por_nome('censobr:2022_tracts_entorno').as_posix()}') "
        f"WHERE code_muni IN ({_lista(codigos)}) GROUP BY 1").fetchall()}


# ---------------------------------------------------------------------------------------------------------------------
# Por cidade
# ---------------------------------------------------------------------------------------------------------------------


@dataclass
class Projecao:
    lat0: float
    lon0: float

    def xy(self, lat, lon) -> np.ndarray:
        lat = np.asarray(lat, dtype=np.float64)
        lon = np.asarray(lon, dtype=np.float64)
        return np.column_stack(((lon - self.lon0) * 111320.0 * math.cos(math.radians(self.lat0)), (lat - self.lat0) * 110574.0))


def contar_perto(pontos_xy: np.ndarray, referencia_xy: np.ndarray, raio_m: float) -> int:
    """Quantos de `pontos_xy` ficam a até `raio_m` de algum ponto de `referencia_xy` (coordenadas em metros)."""
    from scipy.spatial import cKDTree

    if not len(pontos_xy) or not len(referencia_xy):
        return 0
    d, _ = cKDTree(referencia_xy).query(pontos_xy, k=1, distance_upper_bound=raio_m)
    return int(np.isfinite(d).sum())


def _faixa_ordenada(v: np.ndarray, lo: float, hi: float) -> slice:
    return slice(int(np.searchsorted(v, lo, "left")), int(np.searchsorted(v, hi, "right")))


@dataclass
class Resultado:
    """Indicadores por ponto (arrays alinhados com os pontos pedidos) e o que a cidade tem."""
    valores: dict[str, np.ndarray]
    perda_renda: np.ndarray
    tem: dict[str, bool] = field(default_factory=dict)
    cobertura: dict[str, float] = field(default_factory=dict)


#: um ponto de ônibus do OSM conta para a cobertura da cidade se fica a até esta distância do centro de uma célula
#: habitada dela (meia diagonal da célula de 200 m, com folga)
RAIO_COBERTURA_M = 150


def medir_cidade(caixa: tuple[float, float, float, float], lat: np.ndarray, lon: np.ndarray, bins: dict, pois: dict,
                 usar_v06006: bool, faces_onibus: float, n_celulas: int | None = None) -> Resultado:
    """Indicadores dos pontos (lat, lon) de uma cidade, com os quadradinhos e os pontos de serviço dentro da caixa.

    `n_celulas`: os primeiros pontos são as células habitadas da própria cidade. A cobertura do OSM (pontos de ônibus
    contra as faces com ponto de ônibus do Censo, que são só do município) conta então só os pontos de ônibus dentro
    das células habitadas da cidade, e não os da caixa inteira, que pega as vizinhas perto da divisa (uma cidade
    pequena ao lado de uma capital bem mapeada passava na regra dos 10% sem ter o próprio território mapeado)."""
    from scipy.spatial import cKDTree

    la0, la1, lo0, lo1 = caixa
    proj = Projecao((la0 + la1) / 2, (lo0 + lo1) / 2)
    q = proj.xy(lat, lon)
    n = len(q)
    tree_q = cKDTree(q) if n else None
    valores: dict[str, np.ndarray] = {}

    # --- pontos de serviço na caixa (com 5 km a mais para as estações)
    dlat5 = ESTACAO_MAX_M / 110574.0
    dlon5 = ESTACAO_MAX_M / (111320.0 * max(0.2, math.cos(math.radians(proj.lat0))))
    fx = _faixa_ordenada(pois["lat"], la0 - dlat5, la1 + dlat5)
    p_lat, p_lon, p_cat, p_raio = pois["lat"][fx], pois["lon"][fx], pois["cat"][fx], pois["raio"][fx]
    dentro5 = (p_lon >= lo0 - dlon5) & (p_lon <= lo1 + dlon5)
    na_caixa = dentro5 & (p_lat >= la0) & (p_lat <= la1) & (p_lon >= lo0) & (p_lon <= lo1)
    nomes = list(pois["nomes"])
    idx = {c: nomes.index(c) for c in nomes}

    def pontos(cats, area) -> np.ndarray:
        ks = [idx[c] for c in cats if c in idx]
        if not ks:
            return np.zeros(len(p_cat), dtype=bool)
        return np.isin(p_cat, ks) & area

    tem: dict[str, bool] = {}
    cobertura: dict[str, float] = {}
    for ind, (cats, raio) in CONTAGENS.items():
        m = pontos(cats, na_caixa)
        tem[ind] = bool(m.any())
        if n == 0:
            valores[ind] = np.zeros(0)
            continue
        if m.any():
            t = cKDTree(proj.xy(p_lat[m], p_lon[m]))
            valores[ind] = t.query_ball_point(q, raio, return_length=True).astype(np.float64)
        else:
            valores[ind] = np.zeros(n)
    m_onibus = pontos(("onibus",), na_caixa)
    cobertura["onibus_osm_caixa"] = float(m_onibus.sum())
    if n_celulas is not None:
        cobertura["onibus_osm"] = float(contar_perto(proj.xy(p_lat[m_onibus], p_lon[m_onibus]), q[:n_celulas], RAIO_COBERTURA_M))
    else:
        cobertura["onibus_osm"] = cobertura["onibus_osm_caixa"]
    cobertura["faces_onibus"] = faces_onibus
    cobertura["estacoes"] = float(pontos(ESTACOES, na_caixa).sum())
    cobertura["lazer"] = float(pontos(LAZER, na_caixa).sum())

    # distâncias
    for ind, cats, maximo, area in (("estacao_m", ESTACOES, ESTACAO_MAX_M, dentro5), ("parque_m", LAZER, PARQUE_MAX_M, na_caixa)):
        m = pontos(cats, area)
        tem[ind] = bool(pontos(cats, na_caixa).any())
        if n == 0 or not m.any():
            valores[ind] = np.full(n, np.nan)
            continue
        t = cKDTree(proj.xy(p_lat[m], p_lon[m]))
        raios = p_raio[m]
        k = min(12, int(m.sum()))
        d, j = t.query(q, k=k, distance_upper_bound=maximo + 600)
        if k == 1:
            d, j = d[:, None], j[:, None]
        r = np.where(j < len(raios), raios[np.minimum(j, len(raios) - 1)], 0.0)
        efetiva = np.where(np.isfinite(d), np.maximum(0.0, d - r), np.inf)
        valores[ind] = np.minimum(efetiva.min(axis=1), maximo)

    # --- domicílios (quadradinhos) no raio
    bi0, bi1 = math.floor(la0 * PASSO_BIN) - 12, math.floor(la1 * PASSO_BIN) + 12
    fb = _faixa_ordenada(bins["bi"], bi0, bi1)
    bj = bins["bj"][fb]
    mb = (bj >= math.floor(lo0 * PASSO_BIN) - 12) & (bj <= math.floor(lo1 * PASSO_BIN) + 12)
    camadas = {k: bins[k][fb][mb] for k in CAMADAS}
    centro_lat = (bins["bi"][fb][mb] + 0.5) / PASSO_BIN
    centro_lon = (bj[mb] + 0.5) / PASSO_BIN
    somas = {k: np.zeros(n) for k in CAMADAS}
    if n and len(centro_lat):
        tree_b = cKDTree(proj.xy(centro_lat, centro_lon))

        def somar(tq, raio, alvo: dict[str, np.ndarray], onde: np.ndarray | None = None):
            pares = tree_b.sparse_distance_matrix(tq, raio, output_type="ndarray")
            if len(pares) == 0:
                return
            ib, jq = pares["i"], pares["j"]
            for k in CAMADAS:
                s = np.bincount(jq, weights=camadas[k][ib], minlength=tq.n)
                if onde is None:
                    alvo[k] += s
                else:
                    alvo[k][onde] = s

        somar(tree_q, RAIO_ENTORNO_M, somas)
        poucos = np.flatnonzero(somas["dom"] < MIN_DOMICILIOS)
        if len(poucos):
            somar(cKDTree(q[poucos]), RAIO_ENTORNO_FOLGA_M, somas, poucos)

    def razao(a, b):
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(somas[b] > 0, somas[a] / np.maximum(somas[b], 1e-9), np.nan)

    if usar_v06006:
        valores["renda"] = razao("r6", "dom_r6")
        perda = 1 - np.where(somas["dom"] > 0, somas["dom_r6"] / np.maximum(somas["dom"], 1e-9), 0)
    else:
        valores["renda"] = razao("r4", "dom_r4")
        perda = 1 - np.where(somas["dom"] > 0, somas["dom_r4"] / np.maximum(somas["dom"], 1e-9), 0)
    valores["pavimentacao"] = razao("pav", "dom_ent")
    valores["calcada"] = razao("calc", "dom_ent")
    valores["iluminacao"] = razao("ilum", "dom_ent")
    valores["onibus_face"] = razao("onib", "dom_ent")
    valores["esgoto"] = razao("esg", "dom_esg")
    valores["domicilios"] = somas["dom"]
    for ind in ("renda", "pavimentacao", "calcada", "iluminacao", "onibus_face", "esgoto"):
        tem[ind] = bool(np.isfinite(valores[ind]).any())
    return Resultado(valores=valores, perda_renda=np.where(somas["dom"] > 0, perda, np.nan), tem=tem, cobertura=cobertura)
