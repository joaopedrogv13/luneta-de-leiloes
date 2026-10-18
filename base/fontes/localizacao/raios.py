"""Raio dos municípios medido no CNEFE 2022: corrige o `raio_km` de base/geo/municipios.csv onde a malha erra.

`raio_km` (base/geo/README.md) é a maior distância da sede até a divisa, medida na malha simplificada do
tbrugz/geodata-br. Em 32 municípios a malha fica curta: no Rio de Janeiro ela dá 19 km, mas Santa Cruz e Sepetiba ficam
a mais de 50 km do Centro (737 mil endereços do CNEFE ficam além de raio_km + 10 km). A conferência "o ponto caiu no
município?" (base/geo/geocodificar.ts e geocodificar.py) jogaria esses imóveis para a sede.

Este script mede, em cada município, a distância da sede até o centro de cada trecho de rua do CNEFE (tabela
municipio_logradouro_localidade do geocodebr) e grava em base/geo/raios-cnefe.csv o percentil 99,9 arredondado para
cima, só onde ele passa de raio_km + 10 km com pelo menos 50 endereços além. O base/geo/municipios.ts usa o maior dos
dois. O arquivo é separado de municipios.csv para o `atualizar.ts` (que recalcula raio_km pela malha) não apagar a
correção.

Uso: python base/fontes/localizacao/raios.py [--saida base/geo/raios-cnefe.csv]
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import entradas as ent  # noqa: E402

RAIZ = AQUI.parents[2]
MUNICIPIOS = RAIZ / "base" / "geo" / "municipios.csv"
SAIDA = RAIZ / "base" / "geo" / "raios-cnefe.csv"
FOLGA_KM = 10
MINIMO_ENDERECOS_FORA = 50


def medir(municipios: Path = MUNICIPIOS) -> list[tuple]:
    import duckdb

    tabela = ent.caminho_por_nome("geocodebr:municipio_logradouro_localidade")
    con = duckdb.connect()
    con.execute(f"CREATE TABLE m AS SELECT * FROM read_csv('{municipios.as_posix()}', header=true, types={{'codigo_ibge':'BIGINT'}})")
    return con.execute(
        f"""
        WITH d AS (
          SELECT m.codigo_ibge, m.uf, m.nome, m.raio_km, s.n_casos,
            6371 * 2 * asin(sqrt(pow(sin(radians(s.lat - m.lat) / 2), 2)
              + cos(radians(m.lat)) * cos(radians(s.lat)) * pow(sin(radians(s.lon - m.lon) / 2), 2))) AS km
          FROM read_parquet('{tabela.as_posix()}') s JOIN m ON m.codigo_ibge = s.code_muni
        )
        SELECT codigo_ibge, uf, nome, raio_km, quantile_cont(km, 0.999) AS p999,
               sum(CASE WHEN km > coalesce(raio_km, 100) + {FOLGA_KM} THEN n_casos ELSE 0 END) AS fora
        FROM d GROUP BY ALL ORDER BY codigo_ibge
        """
    ).fetchall()


def principal(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--saida", default=str(SAIDA))
    a = p.parse_args(argv)
    linhas = [r for r in medir() if r[5] >= MINIMO_ENDERECOS_FORA and r[4] > (r[3] or 100)]
    saida = Path(a.saida)
    with saida.open("w", encoding="utf-8", newline="\n") as f:
        f.write("codigo_ibge,uf,nome,raio_km,raio_malha_km,enderecos_alem\n")
        for code, uf, nome, raio, p999, fora in linhas:
            nome_csv = f'"{nome}"' if "," in nome else nome
            f.write(f"{code},{uf},{nome_csv},{math.ceil(p999)},{'' if raio is None else int(raio)},{int(fora)}\n")
    print(f"{len(linhas)} municípios com raio corrigido pelo CNEFE → {saida}")
    for code, uf, nome, raio, p999, fora in linhas:
        print(f"  {nome}/{uf}: malha {raio} km → CNEFE {math.ceil(p999)} km ({int(fora)} endereços além de raio_km + {FOLGA_KM})")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
