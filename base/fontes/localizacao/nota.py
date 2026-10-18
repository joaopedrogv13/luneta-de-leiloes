"""Nota de localização: percentil do imóvel entre os MORADORES da própria cidade, com os componentes, e os arquivos do site.

Passo a passo (o README desta pasta explica em português simples; a página "Como a nota é calculada" sai dele):

1. **Pontos.** Os imóveis (posição e precisão do geocode, A1) e as células habitadas da grade estatística 2022 das
   mesmas cidades (centro da célula, peso = moradores). As células são "onde as pessoas da cidade moram".
2. **Indicadores** em cada ponto (metricas.py): mercados, farmácias e padarias a 500 m; escolas e unidades de saúde a
   1 km; comércio e serviços a 1 km; pontos de ônibus a 500 m; distância até estação e até parque ou praça; renda,
   pavimentação, calçada, iluminação, ponto de ônibus na face e esgoto no raio de 500 m.
3. **Dentro de cada componente** (C11), cada indicador vira um "acesso" de 0 a 1 e o componente é a média deles:
   - contagem n: 1 − exp(−n / k), com k = o comum na cidade (mediana pelos moradores, no mínimo 1): o primeiro mercado
     vale mais que o décimo;
   - distância d: exp(−d / 800 m) para estação (10 min a pé) e exp(−d / 400 m) para parque;
   - porcentagem: ela mesma (0 a 1); renda: o valor (é um componente de um indicador só).
   | componente | peso | indicadores |
   |---|---|---|
   | Serviços do dia a dia | 25 | mercados, farmácias, padarias (500 m), escolas, unidades de saúde (1 km) |
   | Transporte | 20 | estação (distância), pontos de ônibus no OSM (500 m), ponto de ônibus na face (Censo) |
   | Renda do entorno | 20 | renda dos responsáveis com rendimento (500 m) |
   | Infraestrutura da rua | 25 | pavimentação, calçada, iluminação, esgoto (500 m) |
   | Comércio e movimento | 5 | estabelecimentos de comércio e serviços (1 km) |
   | Lazer | 5 | parque, praça ou parquinho (distância) |
4. **Percentil ponderado** (C11): a nota do componente é a posição do imóvel entre as células da cidade, pesadas pelos
   moradores: P = 100 × (moradores abaixo + metade dos moradores empatados) / moradores. Empate usa o ranking médio
   (sem isso, meia cidade sem estação ganharia 0).
5. **Pesos redistribuídos.** Indicador que a cidade não tem (nenhuma estação, nenhum ponto de ônibus no OSM, nenhum
   parque mapeado) sai do componente; componente sem nenhum indicador sai da nota e o peso dele vai para os outros, na
   proporção, com o motivo gravado. Ponto sem domicílio a 1 km fica sem renda e sem infraestrutura (idem).
6. **Nota bruta** = média dos componentes pelos pesos efetivos. **Nota final** = percentil da nota bruta do imóvel entre
   as notas brutas das células da cidade (0 a 100): "melhor localizado que X% dos moradores".
7. **Precisão** (decisão 2): número ou rua → nota normal; bairro → "nota aproximada": o meio da faixa entre os
   percentis 25 e 75 das notas das células num raio do desvio (300 m a 2,5 km) do centro do bairro; cidade e rural →
   sem nota.
8. **Cidade pequena** (menos de 20 mil moradores na grade ou menos de 50 células habitadas): sem nota de 0 a 100; os
   indicadores absolutos e a posição em terços.
9. **Área de risco (C10):** BATER (IBGE e Cemaden, 2018, base de 2010) só como alerta, sem teto: o ponto cai dentro ou
   a menos de 100 m de uma área mapeada (no aproximado, a menos de 500 m do centro do bairro). `coberturaRisco` diz se a cidade
   tem mapeamento; "sem mapeamento" nunca vira "sem risco".

Saídas (em colunas, como o imoveis.json.gz):
- base/saida/site/localizacao.json.gz: tudo que vem do IBGE, IPEA, INEP, CNES e BATER, a situação, a nota final e a
  faixa;
- base/saida/site/localizacao-osm.json.gz: só o que é derivado do OpenStreetMap (pontos de ônibus, estação, parque e os
  componentes de transporte e lazer), sob a ODbL, com o aviso no arquivo (C9);
- base/saida/site/localizacao-cidades.json.gz: por cidade, o comum de cada indicador, moradores, células, porte,
  cobertura do OSM e do BATER e o que ficou de fora;
- base/saida/localizacao/medicao-nota.md: distribuição, cobertura e a validação com o ITBI (Spearman).

Uso: python base/fontes/localizacao/nota.py [--pois cache/nota/pois.parquet] [--ibge-renda ibge-renda.json] [--cidades N]
"""
from __future__ import annotations

import argparse
import collections
import gzip
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import cidades as cid  # noqa: E402
import entradas as ent  # noqa: E402
import metricas as met  # noqa: E402
import pois as poi  # noqa: E402

RAIZ = AQUI.parents[2]
SITE = RAIZ / "base" / "saida" / "site"
SAIDA_LOC = RAIZ / "base" / "saida" / "localizacao"
GEOCODE = SAIDA_LOC / "geocode.json"
INSTANTANEO = SITE / "imoveis.json.gz"
VERSAO = 1

#: pesos da decisão da rodada 4 (30/20/20/15/10/5) ajustados pela validação com o ITBI (medicao-nota.md): comércio
#: puxou contra o preço (negativo em 4 de 8 recortes, mediana −0,07) e serviços oscilou em torno de zero; 10 pontos
#: foram para infraestrutura (positiva em 7 de 8). A renda ficou nos 20 da decisão para a nota não virar medida de renda.
PESOS = {"servicos": 25, "transporte": 20, "renda": 20, "infra": 25, "comercio": 5, "lazer": 5}
PESOS_DECISAO = {"servicos": 30, "transporte": 20, "renda": 20, "infra": 15, "comercio": 10, "lazer": 5}
COMPONENTES = list(PESOS)
DO_OSM = {"transporte", "lazer"}
SUBMETRICAS = {
    "servicos": ["mercados_500", "farmacias_500", "padarias_500", "escolas_1k", "saude_1k"],
    "transporte": ["estacao_m", "onibus_500", "onibus_face"],
    "renda": ["renda"],
    "infra": ["pavimentacao", "calcada", "iluminacao", "esgoto"],
    "comercio": ["comercio_1k"],
    "lazer": ["parque_m"],
}
DECAIMENTO_M = {"estacao_m": 800.0, "parque_m": 400.0}
COBERTURA_OSM_ONIBUS = 0.10
CIDADE_PEQUENA_MORADORES = 20_000
CIDADE_PEQUENA_CELULAS = 50
FAIXA_RAIO_MIN_M = 300
FAIXA_RAIO_MAX_M = 2500
FAIXA_MIN_CELULAS = 3
RISCO_PERTO_M = 100
RISCO_APROX_MAX_M = 500
PERDA_INCOMPLETO = 0.30
PRECISOES = ["numero", "rua", "bairro", "cidade"]
SITUACOES = ["calculada", "aproximada", "sem_nota"]
MOTIVOS = ["cidade", "rural", "pequena", "sem_cidade", "poucas_celulas", "sem_ponto"]
PRECISAO_DO_SITE = {"exata": "numero", "rua": "rua", "cep": "rua", "bairro": "bairro", "cidade": "cidade"}
CIDADES_ITBI = {"SP|São Paulo": 3550308, "RJ|Rio de Janeiro": 3304557, "RS|Porto Alegre": 4314902, "CE|Fortaleza": 2304400, "PE|Recife": 2611606}

FONTES = [
    {"nome": "IBGE, CNEFE 2022", "detalhe": "endereços, domicílios e estabelecimentos (nome só para classificar; nunca publicado)", "licenca": "dados públicos (Decreto 8.777/2016); citar a fonte", "url": "https://www.ibge.gov.br/estatisticas/sociais/populacao/38734-cadastro-nacional-de-enderecos-para-fins-estatisticos.html"},
    {"nome": "IBGE, Censo Demográfico 2022, agregados por setor", "detalhe": "renda do responsável, entorno dos domicílios e esgoto (valores de 2022)", "licenca": "dados públicos; citar a fonte", "url": "https://www.ibge.gov.br/estatisticas/sociais/trabalho/22827-censo-demografico-2022.html"},
    {"nome": "IBGE, Grade Estatística 2022", "detalhe": "células de 200 m com moradores: a referência da nota", "licenca": "dados públicos; citar a fonte", "url": "https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/26565-malhas-de-setores-censitarios-divisoes-intramunicipais.html"},
    {"nome": "IPEA, geocodebr, geobr e censobr", "detalhe": "geocodificação e os arquivos do IBGE em Parquet", "licenca": "pacotes MIT", "url": "https://github.com/ipeaGIT"},
    {"nome": "Inep, Censo Escolar e Catálogo de Escolas 2025", "detalhe": "escolas em atividade", "licenca": "CC BY 4.0", "url": "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos"},
    {"nome": "Ministério da Saúde, CNES (abr/2026)", "detalhe": "unidades de saúde de atenção", "licenca": "dados públicos (Decreto 9.903/2019); citar a fonte", "url": "https://cnes.datasus.gov.br/"},
    {"nome": "IBGE e Cemaden, População em Áreas de Risco no Brasil (BATER, 2018)", "detalhe": "áreas de risco mapeadas, base de 2010 (só alerta)", "licenca": "dados públicos; citar a fonte", "url": "https://www.ibge.gov.br/geociencias/informacoes-ambientais/estudos-ambientais/21538-populacao-em-areas-de-risco-no-brasil.html"},
]
FONTE_OSM = {"nome": "OpenStreetMap", "detalhe": "estações, pontos de ônibus, parques e praças", "licenca": "ODbL 1.0, © contribuidores do OpenStreetMap", "url": "https://www.openstreetmap.org/copyright"}
AVISO_ODBL = (
    "Contém dados do OpenStreetMap, © contribuidores do OpenStreetMap (https://www.openstreetmap.org/copyright). Este arquivo é "
    "um banco de dados derivado do OpenStreetMap e está disponível sob a Open Database License (ODbL) 1.0 "
    "(https://opendatacommons.org/licenses/odbl/1-0/)."
)


def log(*partes: object) -> None:
    print(*partes, flush=True)


# ---------------------------------------------------------------------------------------------------------------------
# Funções puras (testadas em testar.py)
# ---------------------------------------------------------------------------------------------------------------------


def mediana_ponderada(v: np.ndarray, w: np.ndarray) -> float | None:
    ok = np.isfinite(v) & (w > 0)
    if not ok.any():
        return None
    o = np.argsort(v[ok], kind="stable")
    vv, ww = v[ok][o], w[ok][o]
    c = np.cumsum(ww)
    return float(vv[int(np.searchsorted(c, c[-1] / 2, "left"))])


def quantil_ponderado(v: np.ndarray, w: np.ndarray, q: float) -> float | None:
    ok = np.isfinite(v) & (w > 0)
    if not ok.any():
        return None
    o = np.argsort(v[ok], kind="stable")
    vv, ww = v[ok][o], w[ok][o]
    c = np.cumsum(ww)
    return float(vv[min(len(vv) - 1, int(np.searchsorted(c, q * c[-1], "left")))])


class Referencia:
    """Distribuição ponderada (valores das células, pesos = moradores) para o percentil com ranking médio."""

    def __init__(self, valores: np.ndarray, pesos: np.ndarray):
        ok = np.isfinite(valores) & (pesos > 0)
        v = np.round(valores[ok], 9)
        o = np.argsort(v, kind="stable")
        self.v = v[o]
        self.c = np.cumsum(pesos[ok][o])
        self.total = float(self.c[-1]) if len(self.c) else 0.0

    def percentil(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        saida = np.full(x.shape, np.nan)
        if self.total <= 0:
            return saida
        ok = np.isfinite(x)
        xr = np.round(x[ok], 9)
        lo = np.searchsorted(self.v, xr, "left")
        hi = np.searchsorted(self.v, xr, "right")
        abaixo = np.where(lo > 0, self.c[np.maximum(lo - 1, 0)], 0.0)
        ate = np.where(hi > 0, self.c[np.maximum(hi - 1, 0)], 0.0)
        saida[ok] = 100.0 * (abaixo + 0.5 * (ate - abaixo)) / self.total
        return saida


def acesso(indicador: str, valores: np.ndarray, k: float | None) -> np.ndarray:
    """Indicador cru → acesso de 0 a 1 (dentro do componente)."""
    v = np.asarray(valores, dtype=np.float64)
    if indicador in DECAIMENTO_M:
        return np.exp(-v / DECAIMENTO_M[indicador])
    if indicador in ("renda",):
        return v
    if indicador in ("pavimentacao", "calcada", "iluminacao", "esgoto", "onibus_face"):
        return v
    if indicador == "comercio_1k":
        return np.log1p(v)
    return 1.0 - np.exp(-v / max(1.0, k or 1.0))


def pesos_efetivos(disponiveis: list[str]) -> dict[str, int]:
    """Pesos (soma 100, maior resto) dos componentes disponíveis."""
    if not disponiveis:
        return {}
    total = sum(PESOS[c] for c in disponiveis)
    brutos = {c: 100.0 * PESOS[c] / total for c in disponiveis}
    inteiros = {c: int(math.floor(v)) for c, v in brutos.items()}
    falta = 100 - sum(inteiros.values())
    for c in sorted(disponiveis, key=lambda c: (-(brutos[c] - inteiros[c]), COMPONENTES.index(c)))[:falta]:
        inteiros[c] += 1
    return inteiros


def terco(p: float | None) -> str | None:
    if p is None or not math.isfinite(p):
        return None
    return "baixo" if p < 100 / 3 else ("medio" if p < 200 / 3 else "alto")


def arred(v, passo: float = 1.0):
    if v is None or not math.isfinite(v):
        return None
    r = round(v / passo) * passo
    return int(r) if passo >= 1 else round(r, 6)


def nota_inteira(v: float | None) -> int | None:
    """Nota arredondada como na escola (meio para cima: 49,5 → 50, 48,5 → 49). O round() do Python arredonda o meio para
    o par (48,5 → 48), o que fazia o meio da faixa da nota aproximada cair ora para baixo, ora para cima."""
    if v is None or not math.isfinite(v):
        return None
    return int(math.floor(v + 0.5))


# ---------------------------------------------------------------------------------------------------------------------
# Entradas
# ---------------------------------------------------------------------------------------------------------------------


def ler_imoveis() -> list[dict]:
    with gzip.open(INSTANTANEO, "rt", encoding="utf-8") as f:
        c = json.load(f)["colunas"]
    geo = {}
    if GEOCODE.exists():
        geo = json.loads(GEOCODE.read_text(encoding="utf-8"))["imoveis"]
    saida = []
    for k in range(len(c["id"])):
        i = c["id"][k]
        g = geo.get(i) or {}
        precisao = PRECISAO_DO_SITE.get(c["precisaoGeo"][k] or "cidade", "cidade")
        saida.append({
            "id": i, "uf": c["uf"][k], "cidade": c["cidade"][k], "tipo": c["tipo"][k], "lat": c["lat"][k], "lon": c["lon"][k],
            "precisao": precisao, "desvio": g.get("desvio_m") if g.get("precisao") == precisao else None,
            "motivo_geo": g.get("motivo"),
        })
    return saida


def ler_bater(codigos: set[int]):
    import duckdb
    import shapely

    tab = duckdb.sql(f"SELECT code_muni::INTEGER AS m, ST_AsWKB(geometry) AS w FROM read_parquet('{ent.caminho_por_nome('disasterriskareas_2010').as_posix()}')").fetchall()
    geos, munis = [], set()
    for m, w in tab:
        munis.add(int(m))
        if w is not None:
            geos.append(shapely.from_wkb(bytes(w)))
    arv = shapely.STRtree(geos)
    return arv, geos, munis


def distancia_risco(arv, geos, lat: float, lon: float, maximo_m: float) -> float | None:
    """Distância (m) do ponto até a área de risco mais perto, se até `maximo_m`; 0 = dentro.

    A distância é medida num plano local em metros (cada polígono candidato é levado para x = Δlon × 111.320 × cos(lat),
    y = Δlat × 110.574). Medir em graus e multiplicar por um fator só (o da longitude) encurtava as distâncias no
    sentido norte-sul em cerca de 8% (13% no Sul): uma área a 108 m ao norte saía "a 100 m"."""
    import shapely

    fx = 111320.0 * max(0.3, math.cos(math.radians(lat)))
    fy = 110574.0
    cand = arv.query(shapely.box(lon - maximo_m / fx, lat - maximo_m / fy, lon + maximo_m / fx, lat + maximo_m / fy))
    origem = shapely.Point(0.0, 0.0)
    escala = np.array([fx, fy])
    centro = np.array([lon, lat])
    melhor = None
    for k in cand:
        g = shapely.transform(geos[k], lambda xy: (xy - centro) * escala)
        d = 0.0 if shapely.intersects(g, origem) else float(shapely.distance(g, origem))
        if d <= maximo_m and (melhor is None or d < melhor):
            melhor = d
    return melhor


def ruas_itbi() -> dict[int, list[dict]]:
    """Ruas do ITBI das 5 capitais com um ponto (geocodebr: logradouro por localidade) para a validação."""
    import duckdb

    sys.path.insert(0, str(RAIZ / "base" / "fontes" / "itbi"))
    import normalizar as nz  # noqa: E402

    saida: dict[int, list[dict]] = {}
    tabela = ent.pasta_geocodebr() / f"geocodebr_data_release_{ent.GEOCODEBR_RELEASE}" / "municipio_logradouro_localidade.parquet"
    for arq in sorted((SITE / "itbi").glob("*.json.gz")):
        with gzip.open(arq, "rt", encoding="utf-8") as f:
            d = json.load(f)
        code = CIDADES_ITBI.get(f"{d['uf']}|{d['cidade']}")
        if not code:
            continue
        pontos = collections.defaultdict(list)
        for logr, lat, lon, n in duckdb.sql(f"SELECT logradouro, lat, lon, n_casos FROM read_parquet('{tabela.as_posix()}') WHERE code_muni = {code}").fetchall():
            chave = nz.normalizar_rua(logr or "")
            if chave:
                pontos[chave].append((float(lat), float(lon), int(n or 1)))
        lista = []
        for chave, rua in d["ruas"].items():
            ps = pontos.get(chave)
            if not ps:
                continue
            w = np.array([p[2] for p in ps], dtype=float)
            la = np.array([p[0] for p in ps])
            lo = np.array([p[1] for p in ps])
            mla, mlo = float(np.average(la, weights=w)), float(np.average(lo, weights=w))
            espalhado = np.max(np.hypot((la - mla) * 110574, (lo - mlo) * 111320 * math.cos(math.radians(mla))))
            if espalhado > 1500:
                continue  # nome que se repete em lugares diferentes da cidade
            lista.append({"chave": chave, "lat": mla, "lon": mlo, "tipos": rua["tipos"]})
        saida[code] = lista
        log(f"  ITBI {d['cidade']}: {len(lista)} de {len(d['ruas'])} ruas com ponto no CNEFE")
    return saida


# ---------------------------------------------------------------------------------------------------------------------
# Cálculo por cidade
# ---------------------------------------------------------------------------------------------------------------------


def nota_final(mat: np.ndarray, nc: int, cel_pop: np.ndarray, pesos_dic: dict[str, float]) -> tuple[np.ndarray, np.ndarray]:
    """(nota bruta, nota final) de todos os pontos: média dos percentis dos componentes pelos pesos (o peso de um
    componente sem dado no ponto vai para os outros, na proporção) e o percentil dela entre as células (as nc primeiras)."""
    pesos = np.array([pesos_dic[c] for c in COMPONENTES], dtype=float)
    disponivel = np.isfinite(mat)
    soma_w = (disponivel * pesos[:, None]).sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        bruta = np.where(soma_w > 0, np.nansum(np.where(disponivel, mat, 0) * pesos[:, None], axis=0) / soma_w, np.nan)
    return bruta, Referencia(bruta[:nc], cel_pop).percentil(bruta)


#: pesos testados na validação com o ITBI (medicao-nota.md, "Sensibilidade dos pesos")
ALTERNATIVAS = {
    "1. pesos da decisão": PESOS_DECISAO,
    "2. sem comércio": {"servicos": 30, "transporte": 20, "renda": 20, "infra": 15, "comercio": 0, "lazer": 5},
    "3. comércio 5, infraestrutura 20": {"servicos": 30, "transporte": 20, "renda": 20, "infra": 20, "comercio": 5, "lazer": 5},
    "4. comércio 5, serviços 25, infraestrutura 25 (os usados)": PESOS,
    "5. renda 30 (só para comparar)": {"servicos": 25, "transporte": 15, "renda": 30, "infra": 15, "comercio": 10, "lazer": 5},
    "6. sem renda (só para comparar)": {"servicos": 35, "transporte": 25, "renda": 0, "infra": 20, "comercio": 12, "lazer": 8},
}


def calcular(cidades: list[dict], imoveis: list[dict], codigos: dict[str, int | None], caminho_pois: Path, usar_v06006: bool,
             com_validacao: bool = True, alternativas: dict[str, dict] | None = None) -> dict:
    t0 = time.time()
    base = [c["codigo_ibge"] for c in cidades]
    munis = poi.municipios_de(cidades)
    bins = met.carregar_bins(munis)
    celulas = met.carregar_celulas(base)
    pois = met.carregar_pois(caminho_pois)
    faces = met.faces_onibus_por_municipio(base)
    tem_osm = any(n in ("onibus", "trilho", "parque", "praca") for n in pois["nomes"])
    arv, geos, munis_bater = ler_bater(set(base))
    ruas = ruas_itbi() if com_validacao else {}
    log(f"Entradas prontas ({time.time() - t0:.0f} s); OSM: {'sim' if tem_osm else 'não'}")

    por_cidade_imoveis = collections.defaultdict(list)
    for k, i in enumerate(imoveis):
        c = codigos.get(i["id"])
        if c:
            por_cidade_imoveis[c].append(k)
    ordem_cel = np.argsort(celulas["code"], kind="stable")
    codes_ord = celulas["code"][ordem_cel]

    res_imoveis: dict[str, dict] = {}
    res_cidades: dict[int, dict] = {}
    validacao: dict[int, list[dict]] = {}
    for n_cidade, c in enumerate(cidades):
        code = c["codigo_ibge"]
        sl = slice(int(np.searchsorted(codes_ord, code, "left")), int(np.searchsorted(codes_ord, code, "right")))
        ic = ordem_cel[sl]
        cel_lat, cel_lon, cel_pop = celulas["lat"][ic], celulas["lon"][ic], celulas["pop"][ic]
        ks = por_cidade_imoveis.get(code, [])
        im = [imoveis[k] for k in ks]
        com_ponto = [i for i in im if i["lat"] is not None and i["precisao"] in ("numero", "rua", "bairro")]
        extra = ruas.get(code, [])
        lat = np.concatenate([cel_lat, [i["lat"] for i in com_ponto], [r["lat"] for r in extra]]).astype(np.float64)
        lon = np.concatenate([cel_lon, [i["lon"] for i in com_ponto], [r["lon"] for r in extra]]).astype(np.float64)
        nc, ni = len(cel_lat), len(com_ponto)
        r = met.medir_cidade(c["caixa"], lat, lon, bins, pois, usar_v06006, faces.get(code, 0.0), n_celulas=len(cel_lat))
        moradores = float(cel_pop.sum())
        pequena = moradores < CIDADE_PEQUENA_MORADORES or nc < CIDADE_PEQUENA_CELULAS

        # --- quais indicadores a cidade tem
        fora: dict[str, str] = {}
        incluir: dict[str, list[str]] = {}
        cob_onibus = r.cobertura["onibus_osm"] / r.cobertura["faces_onibus"] if r.cobertura["faces_onibus"] > 0 else (1.0 if r.cobertura["onibus_osm"] else 0.0)
        for comp, subs in SUBMETRICAS.items():
            ok = []
            for s in subs:
                if s == "onibus_500" and (not tem_osm or cob_onibus < COBERTURA_OSM_ONIBUS):
                    continue
                if s in ("estacao_m", "parque_m") and not (tem_osm and r.tem.get(s)):
                    continue
                if s in met.CONTAGENS and s != "onibus_500" and not r.tem.get(s):
                    continue
                if not np.isfinite(r.valores[s][:nc]).any():
                    continue
                ok.append(s)
            incluir[comp] = ok
            if not ok:
                fora[comp] = ("sem_osm" if comp in DO_OSM and not tem_osm else ("sem_parque" if comp == "lazer" else "sem_dado"))

        # --- acesso por indicador e componente cru
        ks_cidade = {s: (mediana_ponderada(r.valores[s][:nc], cel_pop) if s in met.CONTAGENS else None) for s in met.CONTAGENS}
        brutos: dict[str, np.ndarray] = {}
        for comp, subs in incluir.items():
            if not subs:
                brutos[comp] = np.full(len(lat), np.nan)
                continue
            m = np.vstack([acesso(s, r.valores[s], ks_cidade.get(s)) for s in subs])
            if len(subs) > 1:
                ok = np.isfinite(m)
                n_ok = ok.sum(axis=0)
                brutos[comp] = np.where(n_ok > 0, np.where(ok, m, 0).sum(axis=0) / np.maximum(n_ok, 1), np.nan)
            else:
                brutos[comp] = m[0]
        # --- percentil por componente entre as células
        notas_comp: dict[str, np.ndarray] = {}
        for comp in COMPONENTES:
            ref = Referencia(brutos[comp][:nc], cel_pop)
            notas_comp[comp] = ref.percentil(brutos[comp])
        # --- nota bruta com pesos redistribuídos por ponto, e a nota final (percentil entre as células)
        mat = np.vstack([notas_comp[c] for c in COMPONENTES])
        bruta, final = nota_final(mat, nc, cel_pop, PESOS)

        # --- comum na cidade
        comum = {}
        for s in met.INDICADORES:
            comum[s] = mediana_ponderada(r.valores[s][:nc], cel_pop) if s in r.valores else None
        res_cidades[code] = {
            "codigo": code, "uf": c["uf"], "nome": c["nome"], "moradores": int(round(moradores)), "celulas": nc, "pequena": bool(pequena),
            "bater": code in munis_bater, "imoveis": len(im), "fora": fora, "incluidos": incluir,
            "cobertura": {**r.cobertura, "onibus_razao": round(cob_onibus, 3)}, "comum": comum,
            "k": {s: v for s, v in ks_cidade.items() if v is not None},
            "notas_celulas": final[:nc], "pop_celulas": cel_pop, "brutos_celulas": {cc: brutos[cc][:nc] for cc in COMPONENTES},
        }

        # --- imóveis com ponto
        from scipy.spatial import cKDTree

        proj = met.Projecao((c["caixa"][0] + c["caixa"][1]) / 2, (c["caixa"][2] + c["caixa"][3]) / 2)
        tree_cel = cKDTree(proj.xy(cel_lat, cel_lon)) if nc else None
        for j, i in enumerate(com_ponto):
            k = nc + j
            reg = {"cidade": code, "precisao": i["precisao"], "lat": i["lat"], "lon": i["lon"], "desvio": i["desvio"],
                   "comp": {cc: (None if not math.isfinite(notas_comp[cc][k]) else float(notas_comp[cc][k])) for cc in COMPONENTES},
                   "ind": {s: (float(r.valores[s][k]) if s in r.valores and math.isfinite(r.valores[s][k]) else None) for s in met.INDICADORES},
                   "perda": float(r.perda_renda[k]) if math.isfinite(r.perda_renda[k]) else None,
                   "bruta": float(bruta[k]) if math.isfinite(bruta[k]) else None,
                   "nota": float(final[k]) if math.isfinite(final[k]) else None, "faixa": None, "situacao": "calculada", "motivo": None}
            if i["motivo_geo"] == "rural":
                reg.update(situacao="sem_nota", motivo="rural", nota=None)
            elif pequena:
                reg.update(situacao="sem_nota", motivo="pequena", nota=None)
            elif i["precisao"] == "bairro":
                faixa = None
                if tree_cel is not None:
                    raio = min(FAIXA_RAIO_MAX_M, max(FAIXA_RAIO_MIN_M, float(i["desvio"] or FAIXA_RAIO_MAX_M)))
                    for raio_tentado in (raio, FAIXA_RAIO_MAX_M):
                        viz = tree_cel.query_ball_point(proj.xy([i["lat"]], [i["lon"]])[0], raio_tentado)
                        if len(viz) >= FAIXA_MIN_CELULAS:
                            v = final[:nc][viz]
                            w = cel_pop[viz]
                            faixa = (quantil_ponderado(v, w, 0.25), quantil_ponderado(v, w, 0.75))
                            break
                if faixa and faixa[0] is not None:
                    a, b = nota_inteira(faixa[0]), nota_inteira(faixa[1])
                    reg.update(situacao="aproximada", faixa=[a, b], nota=(a + b) / 2)
                else:
                    reg.update(situacao="sem_nota", motivo="poucas_celulas", nota=None)
            if reg["nota"] is None and reg["situacao"] == "calculada":
                reg.update(situacao="sem_nota", motivo="sem_ponto")
            # risco
            maximo = RISCO_PERTO_M if i["precisao"] in ("numero", "rua") else min(RISCO_APROX_MAX_M, max(RISCO_PERTO_M, float(i["desvio"] or RISCO_PERTO_M)))
            reg["risco_m"] = distancia_risco(arv, geos, i["lat"], i["lon"], maximo) if code in munis_bater else None
            res_imoveis[i["id"]] = reg
        for i in im:
            if i["id"] in res_imoveis:
                continue
            res_imoveis[i["id"]] = {"cidade": code, "precisao": i["precisao"], "lat": None, "lon": None, "desvio": None, "comp": {}, "ind": {},
                                    "perda": None, "bruta": None, "nota": None, "faixa": None, "situacao": "sem_nota",
                                    "motivo": "rural" if i["motivo_geo"] == "rural" else "cidade", "risco_m": None}
        # --- validação (ruas do ITBI)
        if extra:
            k0 = nc + ni
            alt = {nome: nota_final(mat, nc, cel_pop, p)[1] for nome, p in (alternativas or {}).items()}
            validacao[code] = [{"tipos": e["tipos"], "nota": float(final[k0 + j]), **{f"c_{cc}": float(notas_comp[cc][k0 + j]) for cc in COMPONENTES},
                                **{f"alt:{nome}": float(v[k0 + j]) for nome, v in alt.items()}}
                               for j, e in enumerate(extra)]
        if n_cidade % 100 == 0 or nc > 10000:
            log(f"  [{n_cidade + 1}/{len(cidades)}] {c['nome']}/{c['uf']}: {nc} células, {len(im)} imóveis ({time.time() - t0:.0f} s)")
    for i in imoveis:
        if i["id"] not in res_imoveis:
            res_imoveis[i["id"]] = {"cidade": codigos.get(i["id"]), "precisao": i["precisao"], "lat": None, "lon": None, "desvio": None,
                                    "comp": {}, "ind": {}, "perda": None, "bruta": None, "nota": None, "faixa": None,
                                    "situacao": "sem_nota", "motivo": "sem_cidade", "risco_m": None}
    log(f"Nota calculada para {len(cidades)} cidades em {time.time() - t0:.0f} s")
    return {"imoveis": res_imoveis, "cidades": res_cidades, "validacao": validacao, "tem_osm": tem_osm, "alternativas": alternativas or {},
            "domicilios": bins.get("info") or {}}


# ---------------------------------------------------------------------------------------------------------------------
# Gravação
# ---------------------------------------------------------------------------------------------------------------------

IND_PRINCIPAL = ["mercados_500", "farmacias_500", "padarias_500", "escolas_1k", "saude_1k", "comercio_1k", "renda", "pavimentacao",
                 "calcada", "iluminacao", "esgoto", "onibus_face"]
IND_OSM = ["onibus_500", "estacao_m", "parque_m"]
PERCENTUAIS = {"pavimentacao", "calcada", "iluminacao", "esgoto", "onibus_face"}


def valor_indicador(s: str, v: float | None):
    if v is None or not math.isfinite(v):
        return None
    if s == "renda":
        return arred(v, 10)
    if s in PERCENTUAIS:
        return int(round(100 * v))
    if s in ("estacao_m", "parque_m"):
        return arred(v, 10)
    return int(round(v))


def gravar_json_gz(caminho: Path, conteudo: dict) -> int:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    dados = json.dumps(conteudo, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    tmp = caminho.with_name(caminho.name + ".tmp")
    with gzip.GzipFile(tmp, "wb", compresslevel=9, mtime=0) as f:
        f.write(dados)
    tmp.replace(caminho)
    return caminho.stat().st_size


def gravar(res: dict, imoveis: list[dict], usar_v06006: bool, data_osm: str | None, info_pois: dict) -> dict:
    hoje = time.strftime("%Y-%m-%d", time.gmtime())
    ids = [i["id"] for i in imoveis]
    R = res["imoveis"]
    col = collections.defaultdict(list)
    osm = collections.defaultdict(list)
    for i in ids:
        x = R[i]
        col["id"].append(i)
        col["situacao"].append(SITUACOES.index(x["situacao"]))
        col["motivo"].append(MOTIVOS.index(x["motivo"]) if x["motivo"] else None)
        col["nota"].append(nota_inteira(x["nota"]))
        col["faixa_min"].append(x["faixa"][0] if x["faixa"] else None)
        col["faixa_max"].append(x["faixa"][1] if x["faixa"] else None)
        col["precisao"].append(PRECISOES.index(x["precisao"]) if x["precisao"] in PRECISOES else 3)
        col["desvio_m"].append(arred(x["desvio"], 10) if x["desvio"] is not None else None)
        col["lat"].append(round(x["lat"], 5) if x["lat"] is not None else None)
        col["lon"].append(round(x["lon"], 5) if x["lon"] is not None else None)
        col["cidade"].append(x["cidade"])
        for cc in COMPONENTES:
            v = x["comp"].get(cc)
            alvo = osm if cc in DO_OSM else col
            alvo[f"c_{cc}"].append(nota_inteira(v))
        for s in IND_PRINCIPAL:
            col[s].append(valor_indicador(s, x["ind"].get(s)))
        for s in IND_OSM:
            osm[s].append(valor_indicador(s, x["ind"].get(s)))
        col["incompleto_renda"].append(1 if (x["perda"] or 0) > PERDA_INCOMPLETO else 0)
        col["risco_m"].append(arred(x["risco_m"], 10) if x["risco_m"] is not None else None)
    principal = {
        "formato": "luneta-localizacao", "versao": VERSAO, "gerado_em": hoje,
        "pesos": PESOS, "situacoes": SITUACOES, "motivos": MOTIVOS, "precisoes": PRECISOES,
        "renda": {"variavel": "V06006" if usar_v06006 else "V06004", "rotulo": ("renda típica (mediana por setor) dos responsáveis com rendimento" if usar_v06006 else "renda média dos responsáveis com rendimento"), "valores": "R$ de 2022"},
        "regras": {"raio_comercio_m": met.RAIO_COMERCIO_M, "raio_servico_m": met.RAIO_SERVICO_M, "raio_entorno_m": met.RAIO_ENTORNO_M,
                   "decaimento_m": DECAIMENTO_M, "cidade_pequena_moradores": CIDADE_PEQUENA_MORADORES, "cidade_pequena_celulas": CIDADE_PEQUENA_CELULAS,
                   "risco_perto_m": RISCO_PERTO_M, "risco_aprox_max_m": RISCO_APROX_MAX_M, "perda_incompleto": PERDA_INCOMPLETO,
                   "cobertura_osm_onibus": COBERTURA_OSM_ONIBUS},
        "fontes": FONTES, "nota_osm": "A nota final usa também os componentes de transporte e lazer, derivados do OpenStreetMap (© contribuidores do OpenStreetMap, ODbL); as colunas do OSM estão em localizacao-osm.json.gz.",
        "colunas": dict(col),
    }
    arq_osm = {
        "formato": "luneta-localizacao-osm", "versao": VERSAO, "gerado_em": hoje, "licenca": "ODbL-1.0", "aviso": AVISO_ODBL,
        "atribuicao": "© contribuidores do OpenStreetMap", "dados_osm_de": data_osm, "com_osm": bool(res["tem_osm"]),
        "fonte": FONTE_OSM,
        "colunas": {"id": ids, **dict(osm)},
        "cidades": {str(code): {"comum": {s: valor_indicador(s, cc["comum"].get(s)) for s in IND_OSM},
                                "cobertura": {k: (round(v, 3) if isinstance(v, float) else v) for k, v in cc["cobertura"].items()}}
                    for code, cc in res["cidades"].items()},
    }
    cidades_out = {}
    for code, cc in res["cidades"].items():
        cidades_out[str(code)] = {
            "nome": cc["nome"], "uf": cc["uf"], "moradores": cc["moradores"], "celulas": cc["celulas"], "pequena": cc["pequena"],
            "bater": cc["bater"], "imoveis": cc["imoveis"], "fora": cc["fora"],
            # os indicadores que entraram em cada componente nesta cidade (só os nomes)
            "indicadores": {comp: subs for comp, subs in cc["incluidos"].items() if subs},
            "comum": {s: valor_indicador(s, cc["comum"].get(s)) for s in IND_PRINCIPAL},
        }
    arq_cid = {"formato": "luneta-localizacao-cidades", "versao": VERSAO, "gerado_em": hoje, "fontes": FONTES, "cidades": cidades_out}
    tamanhos = {
        "localizacao.json.gz": gravar_json_gz(SITE / "localizacao.json.gz", principal),
        "localizacao-osm.json.gz": gravar_json_gz(SITE / "localizacao-osm.json.gz", arq_osm),
        "localizacao-cidades.json.gz": gravar_json_gz(SITE / "localizacao-cidades.json.gz", arq_cid),
    }
    log(f"Gravados: {tamanhos}")
    return tamanhos


def principal(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--pois", default=None, help="pois.parquet (padrão: $LUNETA_LOCAL_CACHE/nota/pois.parquet)")
    p.add_argument("--ibge-renda", default=str(SAIDA_LOC / "ibge-renda.json"),
                   help="ibge-renda.json da etapa ibge (V06006 só se confirmada como mediana); padrão: o commitado em base/saida/localizacao")
    p.add_argument("--cidades", type=int, default=0, help="só as N primeiras cidades (teste)")
    p.add_argument("--so", default="", help="só estes códigos IBGE, separados por vírgula (teste)")
    p.add_argument("--sem-validacao", action="store_true")
    p.add_argument("--sem-gravar", action="store_true")
    a = p.parse_args(argv)
    import medicao_nota

    t0 = time.time()
    usar_v06006 = False
    renda_info = None
    if a.ibge_renda and Path(a.ibge_renda).exists():
        renda_info = json.loads(Path(a.ibge_renda).read_text(encoding="utf-8"))
        usar_v06006 = bool((renda_info.get("v06006") or {}).get("mediana"))
    log(f"Renda: {'V06006 (mediana confirmada no dicionário do IBGE)' if usar_v06006 else 'V06004 (média dos responsáveis com rendimento)'}")
    cidades = cid.ler_cidades()
    if a.so:
        quero = {int(x) for x in a.so.split(",")}
        cidades = [c for c in cidades if c["codigo_ibge"] in quero]
    if a.cidades:
        cidades = cidades[: a.cidades]
    imoveis = ler_imoveis()
    codigos = cid.codigos_dos_imoveis([{"id": i["id"], "uf": i["uf"], "cidade": i["cidade"]} for i in imoveis])
    quero = {c["codigo_ibge"] for c in cidades}
    if a.so or a.cidades:
        imoveis = [i for i in imoveis if codigos.get(i["id"]) in quero]
    caminho_pois = Path(a.pois) if a.pois else poi.destino_padrao()
    info_pois = {}
    med = poi.MEDICAO_PADRAO
    if med.exists():
        info_pois = json.loads(med.read_text(encoding="utf-8"))
    res = calcular(cidades, imoveis, codigos, caminho_pois, usar_v06006, com_validacao=not a.sem_validacao, alternativas=ALTERNATIVAS)
    data_osm = (info_pois.get("osm") or {}).get("data")
    tamanhos = {} if a.sem_gravar else gravar(res, imoveis, usar_v06006, data_osm, info_pois)
    medicao_nota.gravar(SAIDA_LOC / "medicao-nota.md", res, imoveis, tamanhos=tamanhos, usar_v06006=usar_v06006, renda_info=renda_info,
                        info_pois=info_pois, segundos=time.time() - t0)
    return 0


if __name__ == "__main__":
    sys.exit(principal())
