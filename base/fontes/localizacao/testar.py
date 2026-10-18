"""Testes do pipeline de localização, sem rede e sem as tabelas: python base/fontes/localizacao/testar.py

- casos-endereco.json: o parser do endereço da Caixa (endereco.py) nos padrões do instantâneo;
- as regras de geocodificar.py que não dependem dos dados: casamento do bairro (C3), empates e rebaixamentos (C2),
  precisão pelo desvio, interpolação do número, limites de rural e rodovia, e o casamento por nome parecido;
- a nota de localização: categorias do OSM (osm.py), nomes dos estabelecimentos (pois.py), percentil ponderado com
  empates, pesos redistribuídos, nota final e o "acesso" dentro de cada componente (nota.py).

Os testes do geocode só usam a biblioteca padrão (geocodificar.py importa geocodebr, duckdb e shapely só dentro das
funções que usam os dados); os da nota usam numpy e shapely (requirements.txt). Sai com código 1 se algum falhar.
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import endereco as en  # noqa: E402
import geocodificar as gc  # noqa: E402

FALHAS: list[str] = []
TOTAL = 0


def teste(func):
    global TOTAL
    TOTAL += 1
    try:
        func()
    except AssertionError as e:
        FALHAS.append(f"{func.__name__}: {e}")
    except Exception:  # noqa: BLE001 - relata e segue
        FALHAS.append(f"{func.__name__}: {traceback.format_exc()}")
    return func


def igual(obtido, esperado, contexto=""):
    assert obtido == esperado, f"{contexto} esperado {esperado!r}, obtido {obtido!r}"


# ---------------------------------------------------------------------------------------------------------------------
# Endereço
# ---------------------------------------------------------------------------------------------------------------------


@teste
def casos_do_instantaneo():
    dados = json.loads((AQUI / "casos-endereco.json").read_text(encoding="utf-8"))
    casos = dados["casos"]
    assert len(casos) >= 60, f"só {len(casos)} casos"
    erros = []
    for c in casos:
        r = en.analisar(c["endereco"], c["bairro"], c["tipo"], c["uf"])
        for k, v in c["esperado"].items():
            if k == "variantes_contem":
                faltam = [x for x in v if x not in r["variantes"]]
                if faltam:
                    erros.append(f"{c['endereco']!r}: faltam variantes {faltam} (tem {r['variantes']})")
            elif r.get(k) != v:
                erros.append(f"{c['endereco']!r}: {k} esperado {v!r}, obtido {r.get(k)!r}")
    assert not erros, f"{len(erros)} divergência(s):\n    " + "\n    ".join(erros)


@teste
def grupos_cobertos():
    casos = json.loads((AQUI / "casos-endereco.json").read_text(encoding="utf-8"))["casos"]
    grupos = {c["grupo"] for c in casos}
    for g in ("goias_quadra", "df", "antiga", "rua_numero", "repetido", "sn", "apto_bl", "rodovia_km", "rural", "bauru", "lts_faixa"):
        assert g in grupos, f"grupo {g} sem caso"


@teste
def chave_de_quadra_e_lote():
    for valor, esperado in [("08", "8"), ("01A", "1A"), ("11-B", "11B"), ("C-1", "C1"), ("0", "0"), ("000", "0"), ("10", "10"),
                            ("A001B05", "A1B5"), (None, None), ("", None)]:
        igual(en.chave_qdlt(valor), esperado, f"chave_qdlt({valor!r})")


@teste
def nomes_genericos():
    for nome in ["Rua 06", "RUA 6", "Avenida B", "Quadra 17", "Rua Projetada", "Rua Projetada A", "Rua Vii", "Rua Treze",
                 "Travessa A-2", "Rua 14-A", "Rua Vinte e Oito", "R 5"]:
        assert en.nome_generico(nome), f"{nome} devia ser genérico"
    for nome in ["Rua Treze de Maio", "Rua Expedicionario Benoni", "Avenida Brasil", "Rua 2 de Julho", "Rua das Flores", None, ""]:
        assert not en.nome_generico(nome), f"{nome!r} não é genérico"


@teste
def numeros_por_extenso_e_romanos():
    igual(en.por_extenso(13), "TREZE")
    igual(en.por_extenso(28), "VINTE E OITO")
    igual(en.por_extenso(144), "CENTO E QUARENTA E QUATRO")
    igual(en.por_extenso(100), "CEM")
    igual(en.por_extenso(1000), None)
    igual(en.romano("VII"), 7)
    igual(en.romano("XIV"), 14)
    igual(en.romano("IIII"), None)
    igual(en.variantes_nome("Rua 13"), ["RUA TREZE"])
    igual(en.variantes_nome("Rua Treze"), ["RUA 13"])
    igual(en.variantes_nome("Rua Vii"), ["RUA 7", "RUA SETE"])
    igual(en.variantes_nome("Rua Sete de Setembro"), [])


@teste
def numero():
    for token, esperado in [("338", (338, None)), ("Sn", (None, None)), ("S/N", (None, None)), ("S/Nº", (None, None)), (".sn", (None, None)),
                            ("00", (None, None)), ("1391-S", (1391, None)), ("540A2", (540, None)), ("8-45", (45, ("8", 45))),
                            ("Lt 11", (None, None)), ("", (None, None)), (None, (None, None))]:
        igual(en.ler_numero(token), esperado, f"ler_numero({token!r})")


# ---------------------------------------------------------------------------------------------------------------------
# Bairro (C3)
# ---------------------------------------------------------------------------------------------------------------------

LOCALIDADES = {k: {} for k in [
    "TRIBOBO", "ESPLANADA", "PARQUE INDUSTRIAL", "JARDIM COLONIAL", "LOTEAMENTO PARQUE SANTA RITA", "RESIDENCIAL ALTA VISTA II",
    "RESIDENCIAL ALTA VISTA", "JARDIM UBERABA", "BELVEDERE", "SAO FELIX I", "SAO FELIX II", "QUINTA DO FAROL", "CENTRO",
    "CONDOMINIO PRIMAVERA", "PAPUCAIA", "JARDIM BEIJA FLOR", "PARQUE DAS BRISAS III",
]}


def casar(bairro, cidade=None):
    return gc.casar_localidade(gc.formas_do_bairro(bairro), LOCALIDADES, None, cidade)


@teste
def bairro_exato_e_parenteses():
    igual(casar("Tribobó"), ("TRIBOBO", "exata"))
    igual(casar("Centro (Papucaia)"), ("CENTRO", "exata"))
    igual(gc.formas_do_bairro("Centro (Papucaia)"), ["CENTRO PAPUCAIA", "CENTRO", "PAPUCAIA"])


@teste
def bairro_sem_tipo():
    igual(casar("Lot Esplanada"), ("ESPLANADA", "sem_tipo"))
    igual(casar("Parque Colonial"), (None, "nenhuma"), "PARQUE x JARDIM: bairros diferentes;")
    igual(casar("Jardim Primavera"), (None, "nenhuma"), "JARDIM x CONDOMINIO;")
    igual(casar("Uberaba", "Uberaba"), (None, "nenhuma"), "nome da cidade;")


@teste
def bairro_sufixo():
    igual(casar("Parque Industrial I"), ("PARQUE INDUSTRIAL", "sufixo"))
    igual(casar("Belvedere II"), ("BELVEDERE", "sufixo"))
    igual(casar("Sao Felix"), (None, "nenhuma"), "dois setores, nenhum escolhido;")
    igual(casar("Residencial Alta Vista I"), (None, "nenhuma"), "tem irmão II;")


@teste
def bairro_cortado_e_aproximado():
    igual(casar("Lot Parque Santa Rit"), ("LOTEAMENTO PARQUE SANTA RITA", "cortado"))
    igual(casar("Quinta do Faro"), ("QUINTA DO FAROL", "aproximada"))
    igual(casar("Jardim Beijaflor"), ("JARDIM BEIJA FLOR", "aproximada"))
    igual(casar("Parque das Brisas I"), (None, "nenhuma"), "I x III;")
    igual(casar("Jardim"), (None, "nenhuma"), "palavra genérica sozinha;")


# ---------------------------------------------------------------------------------------------------------------------
# Empates, classificação e limites (C2, C5)
# ---------------------------------------------------------------------------------------------------------------------

SG = {"lat": -22.8268, "lon": -43.0634, "raio_km": 20}  # sede de São Gonçalo/RJ (aproximada)


def cand(lat, lon, tr="dn03", desvio=8, n=10, logr="RUA EXPEDICIONARIO BENONI", setor="330490405000001"):
    return {"lat": lat, "lon": lon, "tipo_resultado": tr, "desvio_metros": desvio, "contagem_cnefe": n, "logradouro_encontrado": logr,
            "cod_setor": setor, "endereco_encontrado": logr}


@teste
def empates():
    um, info = gc.resolver_empate([cand(-22.85, -43.03)])
    igual(info["empate"], None)
    perto, info = gc.resolver_empate([cand(-22.85, -43.03, n=20), cand(-22.8505, -43.0305, n=5)])
    igual(info["empate"], "colapsado")
    igual(perto["contagem_cnefe"], 20)
    _, info = gc.resolver_empate([cand(-22.85, -43.03), cand(-22.90, -43.03)])
    igual(info["empate"], "longe")
    media, info = gc.resolver_empate([cand(-22.85, -43.03, n=10), cand(-22.854, -43.03, n=10)])
    igual(info["empate"], "media")
    assert abs(media["lat"] - (-22.852)) < 1e-6 and media["desvio_metros"] >= 200, media
    igual(gc.resolver_empate([])[0], None)


@teste
def precisao_pelo_desvio():
    igual(gc.precisao_por_desvio("numero", 9), "numero")
    igual(gc.precisao_por_desvio("numero_aproximado", 151), "rua")
    igual(gc.precisao_por_desvio("logradouro", 500), "rua")
    igual(gc.precisao_por_desvio("logradouro", 900), "bairro")
    igual(gc.precisao_por_desvio("localidade", 2400), "bairro")
    igual(gc.precisao_por_desvio("localidade", 2600), "cidade")
    igual(gc.precisao_por_desvio("municipio", 10), "cidade")


@teste
def classificacao():
    ref = {"lat": -22.86, "lon": -43.03, "desvio": 600, "setor": None}
    ctx = {"logradouro": "RUA EXPEDICIONARIO BENONI FALCAO GOUVEIA", "bairro_ref": ref, "municipio": SG}
    r = gc.classificar([cand(-22.8597, -43.0329)], ctx)
    igual((r["precisao"], r["motivo"], r["degrau"]), ("numero", None, "dn03"))
    r = gc.classificar([cand(-22.8597, -43.0329, tr="dn04", logr="RUA 6")], {**ctx, "logradouro": "RUA 6"})
    igual((r["precisao"], r["motivo"]), ("bairro", "nome_generico_sem_bairro"))
    igual((r["lat"], r["lon"]), (ref["lat"], ref["lon"]), "rebaixado vai para o centro do bairro;")
    r = gc.classificar([cand(-22.95, -43.03, tr="dn04")], ctx)
    igual(r["motivo"], "longe_do_bairro")
    r = gc.classificar([cand(-22.85, -43.03), cand(-22.90, -43.03)], ctx)
    igual((r["precisao"], r["motivo"]), ("bairro", "empate_longe"))
    r = gc.classificar([cand(-22.85, -43.03), cand(-22.90, -43.03)], {**ctx, "bairro_ref": None})
    igual((r["precisao"], r["motivo"]), ("cidade", "empate_longe"))
    r = gc.classificar([cand(-23.55, -46.63)], ctx)
    igual((r["precisao"], r["motivo"]), ("cidade", "fora_do_municipio"))
    r = gc.classificar([cand(-22.86, -43.03, tr="dl03", desvio=800)], ctx)
    igual((r["precisao"], r["motivo"]), ("bairro", "desvio_alto"))
    r = gc.classificar([cand(-22.86, -43.03, tr="db01", desvio=3000, logr=None)], ctx)
    igual((r["precisao"], r["motivo"]), ("cidade", "desvio_alto"))
    r = gc.classificar([], ctx)
    igual((r["precisao"], r["motivo"]), ("bairro", "sem_resultado"))
    r = gc.classificar([cand(-22.86, -43.03, tr="pn03", logr="RUA IPATINGA")], {**ctx, "logradouro": "RUA ITATINGA"})
    igual(r["motivo"], "nome_parecido")


@teste
def nome_parecido():
    assert gc.nomes_compativeis("RUA LUIZ CUNHA", "RUA LUIS CUNHA")
    assert gc.nomes_compativeis("RUA MACURANY", "RUA MACURANI")
    assert gc.nomes_compativeis("AVENIDA CHRISOSTOMO PIMENTEL DE OLIVEIRA", "AVENIDA CHRISOSTOMO PIMENTEL OLIVEIRA")
    assert gc.nomes_compativeis("RUA JOSEFA FERREIRA DE BARROS", "RUA JOSEFA FERREIRA DE BARROS DA SILVA")
    assert gc.nomes_compativeis("AVENIDA DOM CARLOS CARMELLO", "AVENIDA DOM CARLOS CARMELO")
    assert not gc.nomes_compativeis("RUA ITATINGA", "RUA IPATINGA")
    assert not gc.nomes_compativeis("TRAVESSA SAO JOAO", "TRAVESSA SAO JOSE")
    assert not gc.nomes_compativeis("RUA LESTE", "RUA LESTA")


@teste
def interpolacao():
    rua = [(10, -22.0, -43.0, 6), (20, -22.0, -43.001, 6), (30, -22.0, -43.002, 6), (11, -22.0001, -43.0, 6)]
    lat, lon, desvio, como = gc.interpolar(14, rua)
    igual(como, "entre_vizinhos")
    assert abs(lon - (-43.0004)) < 1e-9, lon  # entre 10 e 20 (mesmo lado: pares)
    assert desvio < 60, desvio
    lat, lon, desvio, como = gc.interpolar(130, rua)
    igual((como, lon), ("alem_do_ultimo", -43.002))
    igual(round(desvio), 106, "desvio soma a diferença de numeração;")
    igual(gc.interpolar(5, []), None)


@teste
def limites():
    r = {"precisao": "numero", "lat": -22.0, "lon": -43.0, "desvio_m": 9, "setor": None, "motivo": None, "degrau": "dn03"}
    igual(gc.limitar(r, {"rural": True})["motivo"], "rural")
    igual(gc.limitar(r, {"rural": True})["precisao"], "cidade")
    igual(gc.limitar(r, {"rodovia_km": True})["precisao"], "rua")
    igual(gc.limitar(r, {})["precisao"], "numero")


@teste
def melhor_variante():
    a = {"precisao": "bairro", "desvio_m": 500}
    b = {"precisao": "rua", "desvio_m": 90}
    c = {"precisao": "rua", "desvio_m": 20}
    igual(gc.melhor([(0, a), (1, b), (2, c)])[0], 1, "na mesma precisão vence a variante anterior;")


@teste
def porte_da_cidade():
    igual(gc.porte(19999), "menos de 20 mil")
    igual(gc.porte(500000), "mais de 500 mil")
    igual(gc.porte(None), "desconhecido")


# ---------------------------------------------------------------------------------------------------------------------
# Nota de localização (osm.py, pois.py, nota.py): regras puras; nota.py usa numpy (requirements.txt)
# ---------------------------------------------------------------------------------------------------------------------


@teste
def osm_categorias():
    import osm

    casos = [
        ({"highway": "bus_stop"}, "onibus"),
        ({"public_transport": "platform", "bus": "yes"}, "onibus"),
        ({"highway": "bus_stop", "name": "BRT Alvorada"}, "brt"),
        ({"amenity": "bus_station", "name": "Terminal Rodoviário"}, "terminal"),
        ({"railway": "station", "public_transport": "station", "train": "yes"}, "trilho"),
        ({"railway": "station"}, None),  # estação velha só com railway=station: fora
        ({"railway": "station", "station": "subway"}, "trilho"),
        ({"railway": "subway_entrance"}, "trilho"),
        ({"railway": "station", "public_transport": "station", "usage": "freight"}, None),
        ({"railway": "station", "public_transport": "station", "disused:railway": "station"}, None),
        ({"amenity": "ferry_terminal"}, "barca"),
        ({"leisure": "park", "name": "Praça XV de Novembro"}, "praca"),
        ({"leisure": "park", "name": "Parque Lage"}, "parque"),
        ({"place": "square"}, "praca"),
        ({"highway": "pedestrian", "area": "yes", "name": "Praça da Sé"}, "praca"),
        ({"highway": "pedestrian", "name": "Praça da Sé"}, None),  # via, não área
        ({"leisure": "playground"}, "playground"),
        ({"leisure": "playground", "access": "private"}, None),  # parquinho de condomínio
        ({"landuse": "recreation_ground"}, "parque"),
        ({"shop": "bakery"}, None),
    ]
    for tags, esperado in casos:
        igual(osm.classificar(tags), esperado, f"{tags}:")


@teste
def osm_geometria():
    import osm

    igual(osm.pontos_da_geometria({"type": "Point", "coordinates": [-43.1, -22.9]}, "onibus"), [(-22.9, -43.1, 0)])
    # praça pequena (cerca de 1 ha): o centro com o raio do círculo de mesma área
    pequena = {"type": "Polygon", "coordinates": [[[-43.1, -22.9], [-43.099, -22.9], [-43.099, -22.899], [-43.1, -22.899], [-43.1, -22.9]]]}
    p = osm.pontos_da_geometria(pequena, "praca")
    igual(len(p), 1)
    assert 50 <= p[0][2] <= 70, p
    # parque grande (1 km²): centro e borda a cada 100 m
    grande = {"type": "Polygon", "coordinates": [[[-43.1, -22.9], [-43.09, -22.9], [-43.09, -22.89], [-43.1, -22.89], [-43.1, -22.9]]]}
    g = osm.pontos_da_geometria(grande, "parque")
    assert 35 <= len(g) <= 45, len(g)
    igual(osm.pontos_da_geometria({"type": "LineString", "coordinates": [[-43.1, -22.9], [-43.09, -22.9]]}, "praca"), [])


@teste
def nomes_dos_estabelecimentos():
    import pois

    casos = [
        ("SUPERMERCADO BOM PRECO", "mercado"),
        ("MERCADINHO DO ZE", "mercado"),
        ("MERCADORIAS EM GERAL", None),
        ("ESTACIONAMENTO DO SUPERMERCADO X", None),
        ("DEPOSITO DO MERCADINHO", None),
        ("DROGARIA SÃO PAULO", "farmacia"),
        ("FARMACIA VETERINARIA", None),
        ("PADARIA SEM FUNCIONAMENTO", None),
        ("PANIFICADORA E LANCHONETE", "padaria"),
        ("ITAU UNIBANCO", None),  # banco fica de fora da v1
        ("MERCADO LIVRE PONTO DE COLETA", None),
        ("SUPERMERCADO E PADARIA", "mercado"),
        (None, None),
    ]
    for nome, esperado in casos:
        igual(pois.classificar_nome(nome), esperado, f"{nome!r}:")


@teste
def percentil_ponderado_com_empates():
    import numpy as np

    import nota

    ref = nota.Referencia(np.array([0.0, 0.0, 0.0, 1.0]), np.array([1.0, 1.0, 1.0, 1.0]))
    # ranking médio: os 3 empatados no zero ficam no meio deles (37,5), não em 0
    igual([round(x, 1) for x in ref.percentil(np.array([0.0, 1.0, 2.0, -1.0, np.nan]))[:4]], [37.5, 87.5, 100.0, 0.0])
    assert np.isnan(ref.percentil(np.array([np.nan]))[0])
    # pesos pelos moradores
    ref2 = nota.Referencia(np.array([1.0, 2.0]), np.array([900.0, 100.0]))
    igual(round(float(ref2.percentil(np.array([2.0]))[0]), 1), 95.0)
    igual(nota.mediana_ponderada(np.array([1.0, 2.0, 3.0]), np.array([1.0, 1.0, 10.0])), 3.0)
    igual(nota.quantil_ponderado(np.array([1.0, 2.0, 3.0, 4.0]), np.ones(4), 0.25), 1.0)
    igual(nota.mediana_ponderada(np.array([np.nan]), np.array([1.0])), None)


@teste
def pesos_redistribuidos_e_nota_final():
    import numpy as np

    import nota

    igual(sum(nota.pesos_efetivos(list(nota.PESOS)).values()), 100)
    sem_lazer = nota.pesos_efetivos([c for c in nota.COMPONENTES if c != "lazer"])
    igual(sum(sem_lazer.values()), 100)
    assert "lazer" not in sem_lazer
    # 3 células e 1 imóvel; o imóvel não tem renda: o peso dela vai para os outros
    mat = np.array([
        [10.0, 50.0, 90.0, 90.0],      # servicos
        [10.0, 50.0, 90.0, 90.0],      # transporte
        [10.0, 50.0, 90.0, np.nan],    # renda
        [10.0, 50.0, 90.0, 90.0],      # infra
        [10.0, 50.0, 90.0, 90.0],      # comercio
        [np.nan, np.nan, np.nan, np.nan],  # lazer: a cidade não tem
    ])
    bruta, final = nota.nota_final(mat, 3, np.array([1.0, 1.0, 1.0]), nota.PESOS)
    igual([round(float(x), 1) for x in bruta], [10.0, 50.0, 90.0, 90.0])
    # o imóvel empata com a melhor célula: (2 + 0,5) / 3
    igual(round(float(final[3]), 1), 83.3)
    igual(nota.terco(10), "baixo")
    igual(nota.terco(50), "medio")
    igual(nota.terco(90), "alto")


@teste
def acesso_dentro_do_componente():
    import numpy as np

    import nota

    v = nota.acesso("mercados_500", np.array([0.0, 5.0, 50.0]), 5)
    igual([round(float(x), 2) for x in v], [0.0, 0.63, 1.0])
    d = nota.acesso("estacao_m", np.array([0.0, 800.0]), None)
    igual([round(float(x), 2) for x in d], [1.0, 0.37])
    igual(round(float(nota.acesso("parque_m", np.array([400.0]), None)[0]), 2), 0.37)
    igual(float(nota.acesso("pavimentacao", np.array([0.8]), None)[0]), 0.8)
    # k mínimo 1: cidade em que o comum é zero
    igual(round(float(nota.acesso("onibus_500", np.array([1.0]), 0)[0]), 2), 0.63)


@teste
def setor_pelo_poligono_da_malha():
    import numpy as np
    import shapely

    import metricas

    # dois setores lado a lado (0,01° de lado) e um ponto fora dos dois
    a = shapely.box(-43.02, -22.90, -43.01, -22.89)
    b = shapely.box(-43.01, -22.90, -43.00, -22.89)
    codigos = np.array([330490405000001, 330490405000002])
    lat = np.array([-22.895, -22.895, -22.80, -22.895])
    lon = np.array([-43.015, -43.005, -43.015, -43.01])  # o último fica na divisa: um setor só, sempre o mesmo
    s = metricas.setor_por_poligono(lat, lon, codigos, [a, b])
    igual(s[:3].tolist(), [330490405000001, 330490405000002, -1])
    assert s[3] in codigos, s
    igual(metricas.setor_por_poligono(lat, lon, codigos, [a, b]).tolist(), s.tolist())
    igual(metricas.setor_por_poligono(np.array([]), np.array([]), codigos, [a, b]).tolist(), [])


@teste
def cobertura_do_osm_so_nas_celulas_da_cidade():
    import numpy as np

    import metricas

    celulas = np.array([[0.0, 0.0], [200.0, 0.0]])
    # 2 pontos de ônibus dentro das células, 1 na beirada (149 m) e 2 longe (na cidade vizinha)
    pontos = np.array([[10.0, 10.0], [210.0, -40.0], [349.0, 0.0], [2000.0, 0.0], [0.0, -900.0]])
    igual(metricas.contar_perto(pontos, celulas, metricas.RAIO_COBERTURA_M), 3)
    igual(metricas.contar_perto(np.zeros((0, 2)), celulas, 150), 0)
    igual(metricas.contar_perto(pontos, np.zeros((0, 2)), 150), 0)


@teste
def distancia_da_area_de_risco_em_metros():
    import shapely

    import nota

    lat, lon = -23.0, -46.6
    dlat = 105 / 110574  # 105 m ao norte
    dlon = 105 / (111320 * 0.9205048534524404)  # 105 m a leste (cos 23°)
    ao_norte = shapely.box(lon - 0.001, lat + dlat, lon + 0.001, lat + dlat + 0.001)
    a_leste = shapely.box(lon + dlon, lat - 0.001, lon + dlon + 0.001, lat + 0.001)
    em_volta = shapely.box(lon - 0.001, lat - 0.001, lon + 0.001, lat + 0.001)
    for geo, esperado in ((ao_norte, 105), (a_leste, 105)):
        arv = shapely.STRtree([geo])
        igual(round(nota.distancia_risco(arv, [geo], lat, lon, 500)), esperado)
        # a 105 m não é "perto" (100 m): antes, ao norte, saía 97 m e dava alerta
        igual(nota.distancia_risco(arv, [geo], lat, lon, 100), None)
    igual(nota.distancia_risco(shapely.STRtree([em_volta]), [em_volta], lat, lon, 100), 0.0)


@teste
def nota_arredonda_o_meio_para_cima():
    import nota

    igual([nota.nota_inteira(x) for x in (48.5, 49.5, 99.4, 99.5, 0.49, None, float("nan"))], [49, 50, 99, 100, 0, None, None])


if __name__ == "__main__":
    if FALHAS:
        print(f"{len(FALHAS)} de {TOTAL} teste(s) falharam:")
        for f in FALHAS:
            print(f"  - {f}")
        sys.exit(1)
    print(f"{TOTAL} testes ok (casos-endereco.json: {len(json.loads((AQUI / 'casos-endereco.json').read_text(encoding='utf-8'))['casos'])} endereços)")
