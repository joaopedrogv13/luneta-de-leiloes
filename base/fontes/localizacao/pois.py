"""Pontos de serviço por categoria nas cidades da base (e nas vizinhas, dentro da caixa da cidade), para a nota.

Fontes, uma tabela só (`pois.parquet` no cache, fora do git; nunca publicado):

| fonte | categorias | de onde |
|---|---|---|
| CNEFE 2022 (IBGE) | `mercado`, `farmacia`, `padaria` (pelo nome do estabelecimento, C8), `estab` (todo estabelecimento da espécie 6, "outras finalidades": comércio e serviços), `ensino_cnefe` (4), `saude_cnefe` (5), `religioso` (8) | cnefe_2022.parquet (geobr) |
| INEP | `escola_publica`, `escola_privada` (só em atividade) | schools_2025.parquet (geobr) |
| CNES (Ministério da Saúde) | `saude` (unidades de atenção, sem consultório isolado; C7) | healthfacilities_202604.parquet (geobr) |
| OpenStreetMap | `metro`, `trem`, `vlt`, `monotrilho` (até a rodada 4, `trilho`), `brt`, `barca`, `terminal`, `onibus`, `praca`, `parque`, `playground` (osm.py, só do Actions) | osm-pois.csv.gz |

Colunas: `fonte`, `categoria`, `lat`, `lon`, `raio_m` (parque pequeno do OSM: raio do círculo de mesma área),
`code_muni` (null no OSM). **Nenhum nome é lido para a saída**: o nome do estabelecimento do CNEFE só passa pela
expressão regular dentro do DuckDB e a classificação sai como categoria (o nome pode ser de pessoa: "CONSULTÓRIO DR.
FULANO"; LGPD). Do CNES só se leem o tipo, o motivo de desativação, o município e a coordenada (C7: o arquivo tem CPF e
razão social de pessoa física).

Regras do nome (C8): sem acento e em maiúsculas; palavra inteira (\\b dos dois lados: "MERCADO" não pega
"MERCADORIAS"); fora o que começa com "PERTENCE A", "ESTACIONAMENTO", "DEPOSITO", "GALPAO", "MATERIAL DE CONSTRUCAO",
"ESCRITORIO", "FUNDOS", "ALMOXARIFADO" ou "ESTOQUE" e o que cita veterinária, imobiliária, Mercado Livre, Mercado Pago,
carga e descarga, "sem funcionamento", desativado, fechado ou em obra. Amostra conferida à mão em 18/10/2026 (80 nomes
por categoria em 12 cidades, antes das últimas exclusões): farmácia 78 certos, mercado 77, padaria 77 (cerca de 96% a
98%). Banco e lotérica ficaram de fora da v1 (a verificação achou cerca de 10 certos em 25). Uma linha do CNEFE com vários estabelecimentos (galeria, shopping:
`COD_INDICADOR_ESTAB_ENDERECO` 2 ou 3) conta como 1: pode subestimar centro comercial.

CNES (C7): `co_motivo_desab` nulo e `tp_unidade` em 01 posto de saúde, 02 centro de saúde/UBS, 04 policlínica, 05
hospital geral, 07 hospital especializado, 15 unidade mista, 20 e 21 pronto-socorro geral e especializado, 36 clínica ou
centro de especialidade, 73 pronto atendimento (UPA); fora o 22 (consultório isolado), o 39 (apoio diagnóstico), o 43
(farmácia) e os de gestão e regulação.

Uso: python base/fontes/localizacao/pois.py [--osm osm-pois.csv.gz] [--cidades base/saida/localizacao/cidades-base.csv]
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import json
import re
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import cidades as cid  # noqa: E402
import entradas as ent  # noqa: E402

RAIZ = AQUI.parents[2]
MEDICAO_PADRAO = RAIZ / "base" / "saida" / "localizacao" / "pois-contagem.json"

# ---------------------------------------------------------------------------------------------------------------------
# Classificação pelo nome (C8): o mesmo regex em Python (testes) e no DuckDB (dados)
# ---------------------------------------------------------------------------------------------------------------------

EXCLUIR_PREFIXO = r"^(PERTENCE A|ESTACIONAMENTO|DEPOSITO|GALPAO|MATERIAL DE CONSTRUCAO|ESCRITORIO|FUNDOS|ALMOXARIFADO|ESTOQUE)\b"
EXCLUIR_QUALQUER = (r"\b(VETERINARI[AO]S?|PET ?SHOP|AGROPECUARIA|IMOBILIARI[AO]S?|MERCADO (LIVRE|PAGO|IMOBILIARIO|DE CAPITAIS)|DISTRIBUIDORA DE MEDICAMENTOS|"
                    r"CARGA E DESCARGA|SEM FUNCION[A-Z]*|DESATIVAD[AO]S?|FECHAD[AO]S?|ABANDONAD[AO]S?|EM CONSTRUCAO|EM REFORMA)\b")
CATEGORIAS_NOME: dict[str, str] = {
    # ordem importa: a primeira que casa vence ("SUPERMERCADO E PADARIA" é mercado)
    "farmacia": r"\b(FARMACIAS?|DROGARIAS?|DROGASIL|DROGA RAIA|DROGAO|PAGUE MENOS|FARMA)\b",
    "mercado": r"\b(SUPERMERCADOS?|HIPERMERCADOS?|MINIMERCADOS?|MINI MERCADOS?|MERCADOS?|MERCADINHOS?|MERCEARIAS?|HORTIFRUTI|HORTIFRUTIGRANJEIROS?|SACOLAO|ATACADAO|ATACAREJO|ACOUGUES?|CASA DE CARNES)\b",
    "padaria": r"\b(PADARIAS?|PANIFICADORAS?|PANIFICACAO|PANIFICIO|CONFEITARIAS?)\b",
}
ESPECIE_CATEGORIA = {4: "ensino_cnefe", 5: "saude_cnefe", 8: "religioso"}
TIPOS_CNES = (1, 2, 4, 5, 7, 15, 20, 21, 36, 73)


def sem_acento(texto: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def classificar_nome(nome: str | None) -> str | None:
    """Categoria do estabelecimento (espécie 6) pelo nome, ou None. A mesma regra do SQL abaixo."""
    if not nome:
        return None
    n = re.sub(r"\s+", " ", sem_acento(nome).upper()).strip()
    if re.search(EXCLUIR_PREFIXO, n) or re.search(EXCLUIR_QUALQUER, n):
        return None
    for cat, rx in CATEGORIAS_NOME.items():
        if re.search(rx, n):
            return cat
    return None


def _sql_categoria(coluna: str) -> str:
    n = f"regexp_replace(upper(strip_accents({coluna})), '\\s+', ' ', 'g')"
    casos = " ".join(f"WHEN regexp_matches({n}, '{rx}') THEN '{cat}'" for cat, rx in CATEGORIAS_NOME.items())
    return (f"CASE WHEN {coluna} IS NULL THEN NULL WHEN regexp_matches(trim({n}), '{EXCLUIR_PREFIXO}') THEN NULL "
            f"WHEN regexp_matches({n}, '{EXCLUIR_QUALQUER}') THEN NULL {casos} ELSE NULL END")


# ---------------------------------------------------------------------------------------------------------------------
# Leitura das fontes
# ---------------------------------------------------------------------------------------------------------------------

SQL_LAT = cid.SQL_LAT
SQL_LON = cid.SQL_LON


def municipios_de(cidades: list[dict]) -> list[int]:
    return sorted({c["codigo_ibge"] for c in cidades} | {v for c in cidades for v in c["vizinhas"]})


def cnefe(con, caminho: Path, munis: list[int], destino: Path) -> None:
    lista = ",".join(str(m) for m in munis)
    especies = " ".join(f"WHEN {e} THEN '{c}'" for e, c in ESPECIE_CATEGORIA.items())
    con.execute(
        f"""COPY (
            WITH b AS (
                SELECT code_muni::INTEGER AS code_muni, cod_especie::INTEGER AS esp, {SQL_LAT} AS lat, {SQL_LON} AS lon,
                       CASE WHEN cod_especie = 6 THEN {_sql_categoria('dsc_estabelecimento')} END AS cat_nome
                FROM read_parquet('{caminho.as_posix()}')
                WHERE code_muni IN ({lista}) AND cod_especie IN (4, 5, 6, 8))
            SELECT 'cnefe' AS fonte, CASE esp {especies} ELSE 'estab' END AS categoria, lat, lon, 0::SMALLINT AS raio_m, code_muni
            FROM b WHERE lat IS NOT NULL
            UNION ALL
            SELECT 'cnefe', cat_nome, lat, lon, 0::SMALLINT, code_muni FROM b WHERE lat IS NOT NULL AND cat_nome IS NOT NULL
        ) TO '{destino.as_posix()}' (FORMAT parquet)"""
    )


def _wkb_ponto(coluna: str) -> tuple[str, str]:
    """lat e lon da coluna geometry do geobr (o DuckDB lê como GEOMETRY): a coordenada que o geobr escolheu entre a da
    fonte e a do geocodebr (`coords_source`)."""
    txt = f"ST_AsText({coluna})"
    lat = f"TRY_CAST(regexp_extract({txt}, 'POINT \\(([-0-9.eE]+) ([-0-9.eE]+)\\)', 2) AS DOUBLE)"
    lon = f"TRY_CAST(regexp_extract({txt}, 'POINT \\(([-0-9.eE]+) ([-0-9.eE]+)\\)', 1) AS DOUBLE)"
    return lat, lon


def inep(con, caminho: Path, munis: list[int], destino: Path) -> None:
    lista = ",".join(str(m) for m in munis)
    lat, lon = _wkb_ponto("geometry")
    con.execute(
        f"""COPY (
            SELECT 'inep' AS fonte, CASE WHEN tp_dependencia IN (1, 2, 3) THEN 'escola_publica' ELSE 'escola_privada' END AS categoria,
                   coalesce({lat}, lat_inep, lat_geocodebr) AS lat, coalesce({lon}, lon_inep, lon_geocodebr) AS lon,
                   0::SMALLINT AS raio_m, code_muni::INTEGER AS code_muni
            FROM read_parquet('{caminho.as_posix()}')
            WHERE code_muni IN ({lista}) AND tp_situacao_funcionamento = 1
        ) TO '{destino.as_posix()}' (FORMAT parquet)"""
    )


def cnes(con, caminho: Path, munis: list[int], destino: Path) -> None:
    lista = ",".join(str(m) for m in munis)
    lat, lon = _wkb_ponto("geometry")
    tipos = ",".join(str(t) for t in TIPOS_CNES)
    # só estas colunas: tipo, motivo de desativação, município e coordenada (C7)
    con.execute(
        f"""COPY (
            SELECT 'cnes' AS fonte, 'saude' AS categoria, coalesce({lat}, lat_cnes, lat_geocodebr) AS lat,
                   coalesce({lon}, lon_cnes, lon_geocodebr) AS lon, 0::SMALLINT AS raio_m, code_muni::INTEGER AS code_muni
            FROM read_parquet('{caminho.as_posix()}', union_by_name = true)
            WHERE code_muni IN ({lista}) AND co_motivo_desab IS NULL AND tp_unidade IN ({tipos})
        ) TO '{destino.as_posix()}' (FORMAT parquet)"""
    )


def ler_osm(caminho: Path) -> tuple[list[tuple], str | None]:
    """osm-pois.csv.gz → [(categoria, lat, lon, raio_m)], e a data dos dados (linha "# Dados do OSM de ...")."""
    linhas: list[tuple] = []
    data = None
    with gzip.open(caminho, "rt", encoding="utf-8") as f:
        corpo = []
        for l in f:
            if l.startswith("#"):
                m = re.match(r"# Dados do OSM de (\S+)", l)
                if m:
                    data = m.group(1)
                continue
            corpo.append(l)
    for r in csv.DictReader(corpo):
        linhas.append((r["categoria"], float(r["lat"]), float(r["lon"]), int(r.get("raio_m") or 0)))
    return linhas, data


def gerar(cidades: list[dict], caminho_osm: Path | None, destino: Path) -> dict:
    import duckdb

    t0 = time.time()
    munis = municipios_de(cidades)
    con = duckdb.connect()
    pasta = destino.parent
    pasta.mkdir(parents=True, exist_ok=True)
    partes = {k: pasta / f"pois-{k}.parquet" for k in ("cnefe", "inep", "cnes", "osm")}
    cnefe(con, ent.caminho_por_nome("cnefe_2022"), munis, partes["cnefe"])
    log(f"  CNEFE: {time.time() - t0:.0f} s")
    inep(con, ent.caminho_por_nome("schools_2025"), munis, partes["inep"])
    cnes(con, ent.caminho_por_nome("healthfacilities_202604"), munis, partes["cnes"])
    data_osm = None
    if caminho_osm and caminho_osm.exists():
        linhas, data_osm = ler_osm(caminho_osm)
        con.execute("CREATE TEMP TABLE osm (categoria VARCHAR, lat DOUBLE, lon DOUBLE, raio_m SMALLINT)")
        con.executemany("INSERT INTO osm VALUES (?, ?, ?, ?)", linhas)
        con.execute(f"COPY (SELECT 'osm' AS fonte, categoria, lat, lon, raio_m, NULL::INTEGER AS code_muni FROM osm) TO '{partes['osm'].as_posix()}' (FORMAT parquet)")
    else:
        log("  Sem o osm-pois.csv.gz: transporte só com o Censo (ponto de ônibus na face) e lazer fica sem dado")
        partes.pop("osm")
    fontes = ", ".join(f"'{p.as_posix()}'" for p in partes.values())
    con.execute(f"COPY (SELECT * FROM read_parquet([{fontes}]) WHERE lat IS NOT NULL ORDER BY lat) TO '{destino.as_posix()}' (FORMAT parquet)")
    contagem = {f"{f}:{c}": n for f, c, n in con.execute(f"SELECT fonte, categoria, count(*) FROM read_parquet('{destino.as_posix()}') GROUP BY 1, 2 ORDER BY 1, 2").fetchall()}
    for p in partes.values():
        p.unlink(missing_ok=True)
    con.close()
    info = {"gerado_em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "municipios": len(munis), "cidades_base": len(cidades),
            "osm": {"arquivo": caminho_osm.name if caminho_osm else None, "data": data_osm}, "contagem": contagem}
    log(f"Gravado: {destino} ({sum(contagem.values())} pontos, {time.time() - t0:.0f} s): {contagem}")
    return info


def log(*partes: object) -> None:
    print(*partes, flush=True)


def destino_padrao() -> Path:
    return ent.pasta_cache() / "nota" / "pois.parquet"


def principal(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--osm", default=None, help="osm-pois.csv.gz do Actions (osm.py); sem ele, transporte só com o Censo e sem lazer")
    p.add_argument("--cidades", default=str(cid.SAIDA_PADRAO))
    p.add_argument("--saida", default=None, help="padrão: $LUNETA_LOCAL_CACHE/nota/pois.parquet")
    p.add_argument("--medicao", default=str(MEDICAO_PADRAO))
    a = p.parse_args(argv)
    cidades = cid.ler_cidades(Path(a.cidades))
    destino = Path(a.saida) if a.saida else destino_padrao()
    info = gerar(cidades, Path(a.osm) if a.osm else None, destino)
    Path(a.medicao).write_text(json.dumps(info, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
