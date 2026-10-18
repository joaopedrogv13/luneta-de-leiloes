"""Geocodificação dos imóveis da base com o geocodebr (IPEA) sobre o CNEFE 2022 (IBGE), com as regras da verificação.

Entrada: o instantâneo do site (base/saida/site/imoveis.json.gz: id, endereço, bairro, cidade, UF, tipo), mais o CEP
quando houver (coluna `cep` ou `extras.cep` do banco base/dados/luneta.db, e `--fichas fichas.json` do
baixar-fichas.ts). Saída: base/saida/localizacao/geocode.json (um registro por id) e medicao-geocode.md.

O que acontece, em ordem (os códigos C2 a C5 são as correções de r4-fontes-verificacao.md):

1. **Endereço** (endereco.py, C5): logradouro, número, quadra, lote, nome antigo e variantes (Rua 13 / RUA TREZE).
2. **Município**: código IBGE pela tabela do geocodebr (nome padronizado + UF); no DF, toda região administrativa é
   Brasília. Ponto da sede e `raio_km` de base/geo/municipios.csv.
3. **Bairro** (C3): o bairro da Caixa raramente bate letra por letra com o DSC_LOCALIDADE do CNEFE ("Lot Esplanada" x
   "ESPLANADA", "Parque Industrial I" x "PARQUE INDUSTRIAL", nome cortado em 20 letras). O casamento aproximado só
   escolhe a localidade de entrada, com limiar alto, resposta única e sem aceitar palavra genérica sozinha.
4. **geocodebr** com `resolver_empates=False`: uma linha por (imóvel, variante do nome). Os empates são resolvidos aqui.
5. **Regras** (C2), por variante:
   - empate com candidatos a mais de 1 km entre si → bairro (centro da localidade no CNEFE) ou cidade;
   - casou sem a localidade (níveis *04) com nome genérico ("Rua 06", "Quadra 17") → rebaixa;
   - casou sem a localidade e caiu a mais de max(2 km, 1,5 × desvio do bairro) do centro do bairro informado → rebaixa;
   - o ponto precisa cair a até `raio_km` + 10 km da sede do município.
   A melhor variante vence (numero > rua > bairro > cidade; no empate, a de menor desvio, depois a principal).
6. **Degraus no CNEFE completo** (C4), para quem ficou abaixo de "numero":
   - quadra e lote (Goiás, DF, loteamentos): (localidade casada ou logradouro, QUADRA, LOTE), zeros à esquerda tirados
     dos dois lados, aceito só se todos os pontos ficarem a até 60 m da mediana; faixas ("Lts 1 a 4") ficam de fora;
   - quadra e número de Bauru ("N. 8-45": QUADRA 8, número 45);
   - rua interna de condomínio: o CNEFE grava a rua externa e põe a interna como complemento (RUA INTERNA X).
7. **Limites**: rural → "cidade" (motivo "rural": as métricas da nota são urbanas); rodovia com km → no máximo "rua".
8. **Precisão final**: numero (número exato, interpolado ou quadra e lote, com desvio até 150 m) | rua (rua ou CEP até
   500 m) | bairro (localidade até 2,5 km) | cidade (o resto: fica a sede do município). Cada registro leva desvio_m,
   setor censitário (quando todos os pontos caem num só), o motivo do rebaixamento e o degrau usado.
9. **Conferência no polígono do bairro** (IBGE, bairros 2022), onde o IBGE tem bairros: só medida (medicao-geocode.md).

Uso:
    python base/fontes/localizacao/geocodificar.py [--instantaneo base/saida/site/imoveis.json.gz]
        [--banco base/dados/luneta.db] [--fichas fichas.json ...] [--saida base/saida/localizacao] [--limite N]
        [--ids id1,id2] [--sem-cnefe] [--sem-medicao]

Antes: python base/fontes/localizacao/entradas.py (baixa e confere as tabelas). Dados: "Fonte: IBGE, CNEFE 2022; IPEA,
geocodebr (MIT)". O arquivo de saída só tem o que o instantâneo já publica (id) mais coordenada, precisão e setor.
"""
from __future__ import annotations

import argparse
import collections
import difflib
import gzip
import json
import math
import os
import re
import sqlite3
import statistics
import sys
import time
import warnings
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import endereco as en  # noqa: E402
import entradas as ent  # noqa: E402

RAIZ = AQUI.parents[2]
INSTANTANEO_PADRAO = RAIZ / "base" / "saida" / "site" / "imoveis.json.gz"
BANCO_PADRAO = RAIZ / "base" / "dados" / "luneta.db"
SAIDA_PADRAO = RAIZ / "base" / "saida" / "localizacao"
MUNICIPIOS_CSV = RAIZ / "base" / "geo" / "municipios.csv"

VERSAO = 1
# limites da precisão final (m)
LIMITE_NUMERO_M = 150
LIMITE_RUA_M = 500
LIMITE_BAIRRO_M = 2500
# empates (C2): candidatos a menos de 300 m são o mesmo lugar; acima de 1 km, o empate é perdido
EMPATE_MESMO_LUGAR_M = 300
EMPATE_LONGE_M = 1000
# *04 longe do bairro informado (C2)
LONGE_DO_BAIRRO_M = 2000
LONGE_DO_BAIRRO_FATOR = 1.5
# degrau quadra e lote (C4)
RAIO_QDLT_M = 60
# casamento sem a localidade que cai a mais disto fora do polígono do bairro informado (IBGE) é rebaixado
FORA_DO_BAIRRO_IBGE_M = 1000
# rua interna: todos os pontos a até 300 m
RAIO_RUA_INTERNA_M = 300
# município: raio_km + folga (o mesmo de base/geo/geocodificar.ts)
FOLGA_MUNICIPIO_KM = 10
RAIO_PADRAO_KM = 100
# variantes do nome por imóvel (além da principal)
MAX_VARIANTES = 5

ORDEM_PRECISAO = {"numero": 0, "rua": 1, "bairro": 2, "cidade": 3}
# ordem da escada do geocodebr (match_types.py)
ESCADA = ["dn01", "da01", "pn01", "pa01", "dn02", "da02", "pn02", "pa02", "dn03", "da03", "pn03", "pa03", "dn04", "da04",
          "dl01", "pl01", "dl02", "pl02", "dl03", "pl03", "dl04", "dc01", "dc02", "db01", "dm01"]
FAMILIA = {"n": "numero", "a": "numero_aproximado", "l": "logradouro", "c": "cep", "b": "localidade", "m": "municipio"}


def log(*partes: object) -> None:
    print(*partes, flush=True)


def distancia_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine, raio médio da Terra (6.371 km)."""
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 2 * 6371000 * math.asin(min(1.0, math.sqrt(a)))


# =====================================================================================================================
# Bairro: casamento aproximado com as localidades do CNEFE (C3)
# =====================================================================================================================

# palavras que sozinhas não identificam um bairro
GENERICAS = {
    "JARDIM", "VILA", "PARQUE", "CONJUNTO", "HABITACIONAL", "RESIDENCIAL", "LOTEAMENTO", "BAIRRO", "SETOR", "CENTRO",
    "NOVA", "NOVO", "SAO", "SANTA", "SANTO", "DOS", "DAS", "DE", "DO", "DA", "E", "CIDADE", "NUCLEO", "DISTRITO",
    "CONDOMINIO", "CHACARA", "CHACARAS", "RECANTO", "PORTAL", "ALTO", "MORADA", "SITIO", "ZONA", "AREA", "URBANA", "RURAL",
    "NORTE", "SUL", "LESTE", "OESTE", "CENTRAL", "JD", "VL", "PQ", "RES", "LOT", "CJ", "CONJ", "HAB", "COHAB", "BOA",
    "VISTA", "BELA", "MONTE", "SERRA", "MORRO", "PRAIA", "SITIOS", "ESTANCIA", "GLEBA", "SETORES", "QUADRA", "MANSOES",
}
# tipos que podem sair da frente do nome (os dois lados) antes de comparar; os "distintivos" mudam o lugar
# ("JARDIM COLONIAL" e "PARQUE COLONIAL" são bairros diferentes em São Paulo), os outros não ("LOT", "BAIRRO")
PREFIXOS_TIPO = {
    "CONJUNTO HABITACIONAL": None, "CONJ HAB": None, "LOTEAMENTO": None, "LOT": None, "LT": None, "BAIRRO": None,
    "RESIDENCIAL": None, "RES": None, "DISTRITO": None, "HABITACIONAL": None,
    "NUCLEO": "NUCLEO", "CONDOMINIO": "CONDOMINIO", "SETOR": "SETOR", "CONJUNTO": "CONJUNTO", "CJ": "CONJUNTO",
    "JARDIM": "JARDIM", "JD": "JARDIM", "VILA": "VILA", "VL": "VILA", "PARQUE": "PARQUE", "PQ": "PARQUE",
    "CHACARA": "CHACARA", "CHACARAS": "CHACARA",
}
RE_SUFIXO = re.compile(r"^(.*\S)\s+(?:[IVX]{1,4}|\d{1,2}|[A-H])$")
RE_TOKEN_SUFIXO = re.compile(r"^(?:[IVX]{1,4}|\d{1,3}|[A-Z])$")
LIMIAR_SIMILARIDADE = 0.92
MARGEM_SIMILARIDADE = 0.04
# a Caixa corta o bairro em 20 (às vezes 40) letras
TAMANHOS_CORTADOS = {19, 20, 39, 40}


def _tipos_e_nucleo(nome: str) -> tuple[frozenset[str], str]:
    """Tira os tipos da frente: "LOTEAMENTO PARQUE ESPLANADA" → ({"PARQUE"}, "ESPLANADA")."""
    n = nome
    tipos: set[str] = set()
    mudou = True
    while mudou:
        mudou = False
        for p, distintivo in PREFIXOS_TIPO.items():
            if n.startswith(p + " ") and len(n) > len(p) + 1:
                n = n[len(p) + 1:]
                if distintivo:
                    tipos.add(distintivo)
                mudou = True
    return frozenset(tipos), n


def _nucleo(nome: str) -> str:
    return _tipos_e_nucleo(nome)[1]


def _so_sufixo_diferente(a: str, b: str) -> bool:
    """"RESIDENCIAL ALTA VISTA I" x "RESIDENCIAL ALTA VISTA II": o que muda é só o número do setor (outro lugar)."""
    ta, tb = a.split(), b.split()
    dif = set(ta) ^ set(tb)
    return bool(dif) and all(RE_TOKEN_SUFIXO.match(t) for t in dif)


def _significativo(nome: str) -> bool:
    """Tem ao menos uma palavra de 4 letras ou mais que não é genérica."""
    return any(len(p) >= 4 and p not in GENERICAS and not p.isdigit() for p in nome.split())


def formas_do_bairro(bairro: str | None) -> list[str]:
    """"Centro (Papucaia)" → ["CENTRO PAPUCAIA", "CENTRO", "PAPUCAIA"]; sem acento e em maiúsculas."""
    if not bairro:
        return []
    formas = [en.chave(bairro)]
    m = re.match(r"^(.*?)\(([^)]*)\)?\s*(.*)$", bairro)
    if m:
        fora = en.chave(f"{m.group(1)} {m.group(3)}")
        dentro = en.chave(m.group(2))
        formas += [fora, dentro]
    return [f for f in dict.fromkeys(formas) if f]


def casar_localidade(formas: list[str], candidatas: dict[str, object], padronizar=None, cidade: str | None = None) -> tuple[str | None, str]:
    """Escolhe a localidade do CNEFE para o bairro informado. Devolve (localidade, método) com método em
    exata | sem_tipo | sufixo | cortado | aproximada | nenhuma. Só aceita resposta única (C3) e nunca casa:
    - só por palavra genérica ("JARDIM", "VILA", "PARQUE" sozinhas não bastam);
    - tipos distintivos diferentes ("JARDIM COLONIAL" x "PARQUE COLONIAL");
    - setores diferentes do mesmo loteamento ("ALTA VISTA I" x "ALTA VISTA II");
    - o bairro que é o nome da própria cidade ("Uberaba" em Uberaba) por aproximação."""
    if not formas or not candidatas:
        return None, "nenhuma"
    nomes = list(candidatas)
    for f in formas:
        for alvo in dict.fromkeys([f, padronizar(f) if padronizar else f]):
            if alvo in candidatas:
                return alvo, "exata"
    principal = formas[0]
    padr = padronizar(principal) if padronizar else principal
    nome_cidade = en.chave(cidade) if cidade else None
    tentativas = list(dict.fromkeys([padr, *formas]))
    # sem o tipo na frente, dos dois lados, se os tipos distintivos forem compatíveis (um contém o outro)
    for f in tentativas:
        tf, nf = _tipos_e_nucleo(f)
        if not _significativo(nf) or nf == nome_cidade:
            continue
        achados = []
        for c in nomes:
            tc, nc = _tipos_e_nucleo(c)
            if nc == nf and (tf <= tc or tc <= tf):
                achados.append(c)
        if len(achados) == 1:
            return achados[0], "sem_tipo"
    # sufixo romano, número ou letra ("PARQUE INDUSTRIAL I" x "PARQUE INDUSTRIAL"), só se não houver outro irmão
    for f in tentativas:
        m = RE_SUFIXO.match(f)
        if m and m.group(1) in candidatas and _significativo(m.group(1)) and m.group(1) != nome_cidade:
            irmaos = [c for c in nomes if c != m.group(1) and c.startswith(m.group(1) + " ") and RE_SUFIXO.match(c)]
            if not irmaos:
                return m.group(1), "sufixo"
        if _significativo(f) and f != nome_cidade:
            filhos = [c for c in nomes if c.startswith(f + " ") and RE_SUFIXO.match(c) and RE_SUFIXO.match(c).group(1) == f]
            if len(filhos) == 1:
                return filhos[0], "sufixo"
    # cortado: a Caixa corta o bairro em 20 (ou 40) letras: "LOT PARQUE SANTA RIT" → "LOTEAMENTO PARQUE SANTA RITA"
    for f in dict.fromkeys([principal, padr]):
        nucleo_f = _nucleo(f)
        # a última palavra pode estar cortada ("RIT"): ela conta se tiver 3 letras ou mais
        if len(principal) not in TAMANHOS_CORTADOS or RE_SUFIXO.match(f) or not (_significativo(nucleo_f) or (len(nucleo_f) >= 8 and len(nucleo_f.split()[-1]) >= 3)):
            continue
        tf, nf = _tipos_e_nucleo(f)
        achados = []
        for c in nomes:
            tc, nc = _tipos_e_nucleo(c)
            direto = c.startswith(f) and len(c) > len(f) and c[len(f)].isalnum()
            pelo_nucleo = (tf <= tc or tc <= tf) and nc.startswith(nf) and len(nc) > len(nf) and nc[len(nf)].isalnum()
            if (direto or pelo_nucleo) and not _so_sufixo_diferente(f, c):
                achados.append(c)
        if len(achados) == 1:
            return achados[0], "cortado"
    # aproximada: similaridade alta, resposta única, nome com palavra significativa
    if len(padr) >= 8 and _significativo(padr) and _nucleo(padr) != nome_cidade:
        notas = sorted(((difflib.SequenceMatcher(None, padr, c).ratio(), c) for c in nomes), reverse=True)
        if notas and notas[0][0] >= LIMIAR_SIMILARIDADE and (len(notas) == 1 or notas[0][0] - notas[1][0] >= MARGEM_SIMILARIDADE):
            c = notas[0][1]
            tp, _ = _tipos_e_nucleo(padr)
            tc, _ = _tipos_e_nucleo(c)
            if set(padr.split()) - GENERICAS and set(c.split()) - GENERICAS and not _so_sufixo_diferente(padr, c) and (tp <= tc or tc <= tp):
                return c, "aproximada"
    return None, "nenhuma"


# =====================================================================================================================
# Empates e classificação (C2)
# =====================================================================================================================


def resolver_empate(candidatos: list[dict]) -> tuple[dict | None, dict]:
    """Candidatos de um mesmo endereço (lat, lon, contagem_cnefe, desvio_metros...). Devolve (escolhido, info):
    - um só: ele;
    - os que ficam a menos de 300 m de um melhor colapsam nele (o de mais endereços no CNEFE fica);
    - sobrou mais de um e a maior distância passa de 1 km: info["empate"] = "longe" (C2: rebaixar);
    - sobrou mais de um, todos perto: média ponderada pelos endereços, desvio = maior distância até a média."""
    validos = [c for c in candidatos if c.get("lat") is not None and c.get("lon") is not None]
    if not validos:
        return None, {"empate": "sem_resultado"}
    if len(validos) == 1:
        return validos[0], {"empate": None}
    ordem = sorted(validos, key=lambda c: (-(c.get("contagem_cnefe") or 0), c.get("desvio_metros") or 0, c.get("endereco_encontrado") or ""))
    mantidos: list[dict] = []
    for c in ordem:
        if all(distancia_m(c["lat"], c["lon"], m["lat"], m["lon"]) > EMPATE_MESMO_LUGAR_M for m in mantidos):
            mantidos.append(c)
    if len(mantidos) == 1:
        return mantidos[0], {"empate": "colapsado", "candidatos": len(validos)}
    maior = max(distancia_m(a["lat"], a["lon"], b["lat"], b["lon"]) for i, a in enumerate(mantidos) for b in mantidos[i + 1:])
    if maior > EMPATE_LONGE_M:
        return mantidos[0], {"empate": "longe", "candidatos": len(validos), "distancia_m": round(maior)}
    peso = sum(max(1, m.get("contagem_cnefe") or 1) for m in mantidos)
    lat = sum(m["lat"] * max(1, m.get("contagem_cnefe") or 1) for m in mantidos) / peso
    lon = sum(m["lon"] * max(1, m.get("contagem_cnefe") or 1) for m in mantidos) / peso
    escolhido = dict(mantidos[0])
    escolhido["lat"], escolhido["lon"] = lat, lon
    espalhamento = max(distancia_m(lat, lon, m["lat"], m["lon"]) for m in mantidos)
    escolhido["desvio_metros"] = max(escolhido.get("desvio_metros") or 0, round(espalhamento))
    setores = {m.get("cod_setor") for m in mantidos}
    escolhido["cod_setor"] = setores.pop() if len(setores) == 1 else None
    return escolhido, {"empate": "media", "candidatos": len(validos), "distancia_m": round(maior)}


def precisao_por_desvio(familia: str, desvio: float | None) -> str:
    d = desvio if desvio is not None else 0
    if familia in ("numero", "numero_aproximado"):
        return "numero" if d <= LIMITE_NUMERO_M else "rua" if d <= LIMITE_RUA_M else "bairro" if d <= LIMITE_BAIRRO_M else "cidade"
    if familia in ("logradouro", "cep"):
        return "rua" if d <= LIMITE_RUA_M else "bairro" if d <= LIMITE_BAIRRO_M else "cidade"
    if familia == "localidade":
        return "bairro" if d <= LIMITE_BAIRRO_M else "cidade"
    return "cidade"


def resultado_bairro(ref: dict | None, motivo: str | None, degrau: str) -> dict:
    """Rebaixa para o centro da localidade (bairro) do CNEFE, ou para a cidade se não houver ou se ela for espalhada."""
    if ref and ref.get("lat") is not None and (ref.get("desvio") or 0) <= LIMITE_BAIRRO_M:
        return {"precisao": "bairro", "lat": ref["lat"], "lon": ref["lon"], "desvio_m": round(ref.get("desvio") or 0),
                "setor": ref.get("setor"), "motivo": motivo, "degrau": degrau}
    return resultado_cidade(motivo or "bairro_espalhado" if ref else motivo or "bairro_nao_achado")


def resultado_cidade(motivo: str | None) -> dict:
    return {"precisao": "cidade", "lat": None, "lon": None, "desvio_m": None, "setor": None, "motivo": motivo, "degrau": "municipio"}


PARTICULAS = {"DE", "DA", "DO", "DAS", "DOS", "E", "D"}


def _fonetica(t: str) -> str:
    """Grafias que mudam e o nome não: LUIZ/LUIS, MACURANY/MACURANI, ABRAHAO/ABRAAO, CARMELLO/CARMELO."""
    t = t.replace("PH", "F").replace("TH", "T").replace("Y", "I").replace("Z", "S").replace("W", "V").replace("K", "C").replace("H", "")
    return re.sub(r"(.)\1+", r"\1", t)


def nomes_compativeis(entrada: str | None, encontrado: str | None) -> bool:
    """O casamento por nome parecido (níveis p* do geocodebr, Jaro ≥ 0,9) vale se cada palavra do nome informado tem
    uma parecida no nome achado (≥ 0,88 depois da fonética). "RUA ITATINGA" x "RUA IPATINGA" e "TRAVESSA SAO JOAO" x
    "TRAVESSA SAO JOSE" não passam; "RUA LUIZ CUNHA" x "RUA LUIS CUNHA" e "PIMENTEL DE OLIVEIRA" x "PIMENTEL
    OLIVEIRA" passam (o nome achado pode ter palavras a mais: "JOSEFA FERREIRA DE BARROS DA SILVA")."""
    if not entrada or not encontrado:
        return True
    a = [_fonetica(t) for t in en.chave(entrada).split()[1:] if t not in PARTICULAS]
    b = [_fonetica(t) for t in en.chave(encontrado).split()[1:] if t not in PARTICULAS]
    if not a or not b:
        return True
    for t in a:
        if not any(t == u or (len(t) > 2 and difflib.SequenceMatcher(None, t, u).ratio() >= 0.88) or
                   (len(t) <= 3 and u.startswith(t)) for u in b):
            return False
    return True


def classificar(candidatos: list[dict], ctx: dict) -> dict:
    """Uma variante do endereço → resultado com precisão final. `ctx`: logradouro (entrada), bairro_ref (centro da
    localidade casada no CNEFE: lat, lon, desvio, setor), municipio (lat, lon, raio_km)."""
    escolhido, info = resolver_empate(candidatos)
    ref = ctx.get("bairro_ref")
    if escolhido is None:
        return resultado_bairro(ref, "sem_resultado", "bairro") if ref else resultado_cidade("sem_resultado")
    tr = escolhido.get("tipo_resultado") or "dm01"
    familia = FAMILIA.get(tr[1], "municipio")
    nivel = tr[2:]
    degrau = tr
    if info.get("empate") == "longe" and escolhido.get("logradouro_encontrado"):
        return resultado_bairro(ref, "empate_longe", "bairro")
    if familia in ("numero", "numero_aproximado", "logradouro") and nivel == "04":
        nome = escolhido.get("logradouro_encontrado") or ctx.get("logradouro") or ""
        if en.nome_generico(nome) or en.nome_generico(ctx.get("logradouro")):
            return resultado_bairro(ref, "nome_generico_sem_bairro", "bairro")
        if ref and ref.get("lat") is not None:
            longe = max(LONGE_DO_BAIRRO_M, LONGE_DO_BAIRRO_FATOR * (ref.get("desvio") or 0))
            if distancia_m(escolhido["lat"], escolhido["lon"], ref["lat"], ref["lon"]) > longe:
                return resultado_bairro(ref, "longe_do_bairro", "bairro")
    if tr[0] == "p" and escolhido.get("logradouro_encontrado") and not nomes_compativeis(ctx.get("logradouro"), escolhido["logradouro_encontrado"]):
        return resultado_bairro(ref, "nome_parecido", "bairro")
    if familia == "municipio":
        return resultado_cidade("so_municipio")
    muni = ctx.get("municipio")
    if muni and muni.get("lat") is not None:
        limite = ((muni.get("raio_km") or RAIO_PADRAO_KM) + FOLGA_MUNICIPIO_KM) * 1000
        if distancia_m(escolhido["lat"], escolhido["lon"], muni["lat"], muni["lon"]) > limite:
            return resultado_cidade("fora_do_municipio")
    precisao = precisao_por_desvio(familia, escolhido.get("desvio_metros"))
    motivo = None
    if precisao == "cidade":
        return resultado_cidade("desvio_alto")
    if (familia in ("numero", "numero_aproximado") and precisao != "numero") or (familia in ("logradouro", "cep") and precisao != "rua"):
        motivo = "desvio_alto"
    return {
        "precisao": precisao,
        "lat": escolhido["lat"],
        "lon": escolhido["lon"],
        "desvio_m": round(escolhido.get("desvio_metros") or 0),
        "setor": escolhido.get("cod_setor"),
        "motivo": motivo,
        "degrau": degrau,
        "empate": info.get("empate"),
        # só para a medição (não vão para o geocode.json)
        "logradouro_encontrado": escolhido.get("logradouro_encontrado"),
        "localidade_encontrada": escolhido.get("localidade_encontrada"),
        "numero_encontrado": escolhido.get("numero_encontrado"),
        "interpolacao": escolhido.get("interpolacao"),
        "similaridade": escolhido.get("similaridade_logradouro"),
    }


def melhor(resultados: list[tuple[int, dict]]) -> tuple[int, dict]:
    """A melhor variante: a de melhor precisão; no empate, a que vem antes (a principal, depois o nome antigo, depois
    as formas por extenso), e só então a de menor desvio."""
    return min(resultados, key=lambda kr: (ORDEM_PRECISAO[kr[1]["precisao"]], kr[0], kr[1].get("desvio_m") if kr[1].get("desvio_m") is not None else 1e9))


def limitar(r: dict, analise: dict) -> dict:
    """Rural → cidade; rodovia com km → no máximo rua."""
    if analise.get("rural"):
        return resultado_cidade("rural")
    if analise.get("rodovia_km") and r["precisao"] == "numero":
        r = {**r, "precisao": "rua", "motivo": "rodovia_km"}
    return r


# =====================================================================================================================
# Entradas
# =====================================================================================================================


def ler_instantaneo(caminho: Path) -> list[dict]:
    with gzip.open(caminho, "rt", encoding="utf-8") as f:
        dados = json.load(f)
    c = dados["colunas"]
    return [
        {
            "id": c["id"][k],
            "endereco": c["endereco"][k],
            "bairro": c["bairro"][k],
            "cidade": c["cidade"][k],
            "uf": c["uf"][k],
            "tipo": c["tipo"][k],
            "fonte": (c["fonte"][k] or {}).get("id"),
            "lat0": c["lat"][k],
            "lon0": c["lon"][k],
            "precisao0": c["precisaoGeo"][k],
        }
        for k in range(len(c["id"]))
    ]


PREFIXO_ID = {"caixa_csv": "caixa", "leiloesjudiciais_api": "lj"}


def ler_ceps_banco(caminho: Path) -> dict[str, str]:
    """CEP de cada imóvel no banco: a coluna `cep` (o conector da Caixa grava o da ficha) ou `extras.cep`."""
    if not caminho.exists():
        return {}
    ceps: dict[str, str] = {}
    con = sqlite3.connect(f"file:{caminho}?mode=ro", uri=True)
    try:
        for fonte, id_fonte, cep, extras in con.execute("SELECT fonte_id, id_na_fonte, cep, extras FROM imovel WHERE status = 'ativo'"):
            valor = cep
            if not valor and extras:
                try:
                    valor = (json.loads(extras) or {}).get("cep")
                except json.JSONDecodeError:
                    valor = None
            digitos = re.sub(r"\D", "", str(valor or ""))
            if len(digitos) == 8:
                ceps[f"{PREFIXO_ID.get(fonte, fonte)}-{id_fonte}"] = digitos
    finally:
        con.close()
    return ceps


def ler_ceps_fichas(caminhos: list[str]) -> dict[str, str]:
    """`fichas.json` do baixar-fichas.ts: { lidas_em, fichas: { <id13>: { cep, ... } } }."""
    ceps: dict[str, str] = {}
    for c in caminhos:
        dados = json.loads(Path(c).read_text(encoding="utf-8"))
        for id13, ficha in (dados.get("fichas") or {}).items():
            digitos = re.sub(r"\D", "", str((ficha or {}).get("cep") or ""))
            if len(digitos) == 8:
                ceps[f"caixa-{id13}"] = digitos
    return ceps


class Municipios:
    """Código IBGE pelo nome (tabela `municipio` do geocodebr) e sede/raio de base/geo/municipios.csv."""

    def __init__(self, tabela_geocodebr: Path, csv: Path = MUNICIPIOS_CSV):
        import duckdb

        self.por_nome: dict[tuple[str, str], int] = {}
        for uf, nome, code in duckdb.sql(f"SELECT estado, municipio, code_muni FROM read_parquet('{tabela_geocodebr.as_posix()}')").fetchall():
            self.por_nome[(uf, nome)] = int(code)
        self.sede: dict[int, dict] = {}
        self.por_chave: dict[tuple[str, str], int] = {}
        import csv as _csv

        with csv.open(encoding="utf-8") as f:
            for linha in _csv.DictReader(f):
                code = int(linha["codigo_ibge"])
                self.sede[code] = {"nome": linha["nome"], "uf": linha["uf"], "lat": float(linha["lat"]), "lon": float(linha["lon"]),
                                   "raio_km": float(linha["raio_km"]) if linha.get("raio_km") else None}
                self.por_chave[(linha["uf"], en.chave(linha["nome"]))] = code
        # o mesmo que base/geo/municipios.ts: raio do CNEFE onde a malha fica curta, e apelidos ("ASSU"/RN → Açu)
        raios = csv.with_name("raios-cnefe.csv")
        if raios.exists():
            with raios.open(encoding="utf-8") as f:
                for linha in _csv.DictReader(f):
                    m = self.sede.get(int(linha["codigo_ibge"]))
                    if m and float(linha["raio_km"]) > (m["raio_km"] or 0):
                        m["raio_km"] = float(linha["raio_km"])
        apelidos = csv.with_name("apelidos.csv")
        if apelidos.exists():
            with apelidos.open(encoding="utf-8") as f:
                for linha in _csv.DictReader(f):
                    self.por_chave.setdefault((linha["uf"], en.chave(linha["nome"])), int(linha["codigo_ibge"]))

    def codigo(self, uf: str, cidade: str, padronizar) -> int | None:
        if uf == "DF":
            return 5300108
        for nome in (padronizar(cidade), en.chave(cidade)):
            if (uf, nome) in self.por_nome:
                return self.por_nome[(uf, nome)]
        return self.por_chave.get((uf, en.chave(cidade)))


class Localidades:
    """Localidades (bairros) do CNEFE por município, com o centro e o desvio (tabela municipio_localidade)."""

    def __init__(self, tabela: Path, codigos: set[int]):
        import duckdb

        self.por_muni: dict[int, dict[str, dict]] = collections.defaultdict(dict)
        lista = ",".join(str(c) for c in sorted(codigos)) or "0"
        for code, loc, lat, lon, desvio, n, setor in duckdb.sql(
            f"SELECT code_muni, localidade, lat, lon, desvio_metros, n_casos, cod_setor FROM read_parquet('{tabela.as_posix()}') "
            f"WHERE code_muni IN ({lista})"
        ).fetchall():
            if loc:
                self.por_muni[int(code)][loc] = {"lat": float(lat), "lon": float(lon), "desvio": float(desvio or 0), "n": n,
                                                 "setor": str(setor) if setor is not None else None}


# =====================================================================================================================
# geocodebr
# =====================================================================================================================


def configurar_geocodebr(pasta: Path) -> None:
    """Aponta o geocodebr para a nossa pasta de cache sem gravar a configuração do usuário (definir_pasta_cache grava
    num arquivo do usuário, e um caminho relativo gravado lá faria o pacote baixar 1,1 GB na pasta corrente).
    `import geocodebr.download_cnefe` devolve a FUNÇÃO de mesmo nome (o __init__ do pacote a reexporta), por isso os
    módulos vêm de importlib."""
    import importlib

    caminho = str(Path(pasta).resolve())
    for nome in ("geocodebr.cache", "geocodebr.download_cnefe"):
        importlib.import_module(nome).listar_pasta_cache = lambda: caminho
    if importlib.import_module("geocodebr.download_cnefe").listar_pasta_cache() != caminho:
        raise RuntimeError("não consegui apontar o geocodebr para a pasta de cache")
    # o DuckDB usa até 80% da memória da máquina como cache (11 GB num contêiner de 15 GB); LUNETA_DUCKDB_MEMORIA
    # ("4GB") limita, e o que passar vai para disco
    limite = os.environ.get("LUNETA_DUCKDB_MEMORIA")
    modulo_geocode = importlib.import_module("geocodebr.geocode")
    original = getattr(modulo_geocode.create_geocodebr_db, "__wrapped__", modulo_geocode.create_geocodebr_db)

    def criar(*args, **kwargs):
        con = original(*args, **kwargs)
        if limite:
            con.execute(f"SET memory_limit = '{limite}'")
        return con

    criar.__wrapped__ = original  # type: ignore[attr-defined]
    modulo_geocode.create_geocodebr_db = criar
    faltam = [t for t in ent.TABELAS_GEOCODEBR if not (Path(caminho) / f"geocodebr_data_release_{ent.GEOCODEBR_RELEASE}" / f"{t}.parquet").exists()]
    if faltam:
        raise RuntimeError(f"tabelas do geocodebr ausentes em {caminho}: {', '.join(faltam)} (rode entradas.py)")


def rodar_geocodebr(linhas: list[dict], pasta: Path) -> dict[str, list[dict]]:
    """Uma chamada para todas as linhas (gid, logradouro, numero, cep, localidade, municipio, estado). Devolve os
    candidatos por gid (com resolver_empates=False, um endereço empatado volta em várias linhas)."""
    import geocodebr as g
    import polars as pl

    configurar_geocodebr(pasta)
    df = pl.DataFrame(linhas, schema={"gid": pl.Utf8, "logradouro": pl.Utf8, "numero": pl.Int64, "cep": pl.Utf8,
                                      "localidade": pl.Utf8, "municipio": pl.Utf8, "estado": pl.Utf8})
    campos = g.definir_campos(logradouro="logradouro", numero="numero", cep="cep", localidade="localidade", municipio="municipio", estado="estado")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = pl.from_arrow(g.geocode(enderecos=df, campos_endereco=campos, resultado_completo=True, resolver_empates=False,
                                      verboso=False, cache=True))
    por_gid: dict[str, list[dict]] = collections.defaultdict(list)
    colunas = ["gid", "lat", "lon", "precisao", "tipo_resultado", "desvio_metros", "endereco_encontrado", "logradouro_encontrado",
               "numero_encontrado", "localidade_encontrada", "cep_encontrado", "contagem_cnefe", "empate", "cod_setor",
               "similaridade_logradouro"]
    for linha in res.select(colunas).iter_rows(named=True):
        por_gid[linha["gid"]].append(linha)
    return por_gid


def interpolar(n: int, pontos: list[tuple[int, float, float, float]]) -> tuple[float, float, float, str] | None:
    """Ponto do número `n` a partir dos números do CNEFE na mesma rua: (numero, lat, lon, desvio).
    - com vizinho menor e maior (do mesmo lado da rua, se houver): interpolação linear pelo número; o desvio é o do
      vizinho mais disperso mais a distância até o vizinho mais perto;
    - só de um lado (o número passa do último do CNEFE): o ponto do número mais perto, com desvio somado da diferença
      de numeração (no Brasil o número costuma ser a distância em metros desde o começo da rua).
    O geocodebr 0.2.0 faz a média de TODOS os números da rua pesada por 1/|diferença| e devolve a média dos desvios
    (6 m): para um número além do fim da rua, o ponto cai perto do meio dela com desvio pequeno."""
    if not pontos:
        return None
    lado = [x for x in pontos if x[0] % 2 == n % 2]
    for grupo in (lado, pontos):
        abaixo = [x for x in grupo if x[0] < n]
        acima = [x for x in grupo if x[0] > n]
        if abaixo and acima:
            a = max(abaixo, key=lambda x: x[0])
            b = min(acima, key=lambda x: x[0])
            t = (n - a[0]) / (b[0] - a[0])
            lat = a[1] + t * (b[1] - a[1])
            lon = a[2] + t * (b[2] - a[2])
            d = distancia_m(a[1], a[2], b[1], b[2])
            return lat, lon, max(a[3], b[3]) + min(t, 1 - t) * d, "entre_vizinhos"
    perto = min(pontos, key=lambda x: (abs(x[0] - n), x[3]))
    return perto[1], perto[2], perto[3] + abs(perto[0] - n), "alem_do_ultimo"


def reinterpolar(candidatos: dict[str, list[dict]], numeros: dict[str, int | None], codigos: dict[str, int], tabelas: Path) -> collections.Counter:
    """Refaz o ponto dos números interpolados (da*, pa*) com interpolar(). Altera os candidatos no lugar."""
    import duckdb

    alvos = []
    for gid, cands in candidatos.items():
        for k, c in enumerate(cands):
            tr = c.get("tipo_resultado") or ""
            if tr[:2] in ("da", "pa") and numeros.get(gid) and c.get("logradouro_encontrado"):
                nivel = tr[2:]
                loc = c.get("localidade_encontrada") if nivel in ("01", "03") or c.get("localidade_encontrada") else None
                cep = c.get("cep_encontrado") if nivel in ("01", "02") else None
                alvos.append((gid, k, codigos[gid], c["logradouro_encontrado"], loc, cep, int(numeros[gid])))
    cont: collections.Counter = collections.Counter()
    if not alvos:
        return cont
    con = duckdb.connect()
    con.execute("CREATE TEMP TABLE a (gid VARCHAR, k INTEGER, muni INTEGER, logr VARCHAR, loc VARCHAR, cep VARCHAR, n INTEGER)")
    con.executemany("INSERT INTO a VALUES (?, ?, ?, ?, ?, ?, ?)", alvos)
    pontos: dict[tuple[str, int], list] = collections.defaultdict(list)
    sem_cep = (tabelas / "municipio_logradouro_numero_localidade.parquet").as_posix()
    com_cep = (tabelas / "municipio_logradouro_numero_cep_localidade.parquet").as_posix()
    for consulta in (
        f"""SELECT a.gid, a.k, t.numero, t.lat, t.lon, t.desvio_metros FROM a JOIN read_parquet('{sem_cep}') t
            ON t.code_muni = a.muni AND t.logradouro = a.logr AND (a.loc IS NULL OR t.localidade = a.loc) WHERE a.cep IS NULL""",
        f"""SELECT a.gid, a.k, t.numero, t.lat, t.lon, t.desvio_metros FROM a JOIN read_parquet('{com_cep}') t
            ON t.code_muni = a.muni AND t.logradouro = a.logr AND t.cep = a.cep AND (a.loc IS NULL OR t.localidade = a.loc) WHERE a.cep IS NOT NULL""",
    ):
        for gid, k, numero, lat, lon, desvio in con.execute(consulta).fetchall():
            if numero is not None and lat is not None:
                pontos[(gid, k)].append((int(numero), float(lat), float(lon), float(desvio or 0)))
    con.close()
    for gid, k, *_resto, n in alvos:
        novo = interpolar(n, pontos.get((gid, k), []))
        c = candidatos[gid][k]
        if novo is None:
            c["desvio_metros"] = max(c.get("desvio_metros") or 0, LIMITE_RUA_M + 1)
            c["interpolacao"] = "sem_vizinhos"
        else:
            c["lat"], c["lon"], desvio, c["interpolacao"] = novo
            c["desvio_metros"] = round(desvio)
        cont[c["interpolacao"]] += 1
    return cont


# =====================================================================================================================
# Degraus no CNEFE completo (C4): quadra e lote, quadra e número (Bauru), rua interna
# =====================================================================================================================

SQL_CHAVE = "regexp_replace(regexp_replace(upper({x}), '[^0-9A-Z]', '', 'g'), '(^|[^0-9])0+([0-9])', '\\1\\2', 'g')"


def _valor_comp(nomes: tuple[str, ...]) -> str:
    """CASE que pega o valor do primeiro complemento com um dos nomes."""
    partes = " ".join(f"WHEN nom_comp_elem{k} IN ({', '.join(repr(n) for n in nomes)}) THEN val_comp_elem{k}" for k in range(1, 6))
    return f"CASE {partes} END"


def _wkb_para_latlon(wkb: bytes) -> tuple[float, float]:
    import struct

    ordem = "<" if wkb[0] == 1 else ">"
    x, y = struct.unpack(ordem + "dd", wkb[5:21])
    return y, x


def _mediana_dentro(pontos: list[tuple[float, float]], raio: float) -> tuple[float, float, float] | None:
    """Mediana dos pontos e a maior distância até ela; None se algum passar do raio."""
    if not pontos:
        return None
    lat = statistics.median(p[0] for p in pontos)
    lon = statistics.median(p[1] for p in pontos)
    maior = max(distancia_m(lat, lon, p[0], p[1]) for p in pontos)
    return (lat, lon, maior) if maior <= raio else None


def degraus_cnefe(pendentes: list[dict], caminho_cnefe: Path, padronizar_bairro, padronizar_logradouro) -> dict[str, dict]:
    """Tenta, para cada imóvel pendente, quadra+lote, quadra+número e rua interna no CNEFE do município."""
    import duckdb

    qdlt = [p for p in pendentes if p["analise"].get("quadra") and p["analise"].get("lote") and p.get("code")]
    qdnum = [p for p in pendentes if p["analise"].get("quadra_numero") and p.get("code")]
    interna = [p for p in pendentes if p["resultado"]["precisao"] in ("bairro", "cidade") and p["analise"].get("logradouro")
               and not en.nome_generico(p["analise"]["logradouro"]) and p.get("code")]
    if not (qdlt or qdnum or interna):
        return {}
    con = duckdb.connect()
    chaves_qdlt = sorted({(p["code"], p["analise"]["quadra"], p["analise"]["lote"]) for p in qdlt})
    chaves_qdnum = sorted({(p["code"], en.chave_qdlt(p["analise"]["quadra_numero"][0]), int(p["analise"]["quadra_numero"][1])) for p in qdnum})

    def nome_sem_tipo(logr: str) -> str:
        k = en.chave(logr)
        partes = k.split(" ", 1)
        return partes[1] if len(partes) == 2 and partes[0] in en.TIPOS_VIA else k

    chaves_interna = sorted({(p["code"], nome_sem_tipo(p["analise"]["logradouro"])) for p in interna if len(nome_sem_tipo(p["analise"]["logradouro"])) >= 4})
    con.execute("CREATE TEMP TABLE k_qdlt (muni BIGINT, qd VARCHAR, lt VARCHAR)")
    con.executemany("INSERT INTO k_qdlt VALUES (?, ?, ?)", chaves_qdlt)
    con.execute("CREATE TEMP TABLE k_qdnum (muni BIGINT, qd VARCHAR, num BIGINT)")
    con.executemany("INSERT INTO k_qdnum VALUES (?, ?, ?)", chaves_qdnum)
    con.execute("CREATE TEMP TABLE k_int (muni BIGINT, nome VARCHAR)")
    con.executemany("INSERT INTO k_int VALUES (?, ?)", chaves_interna)
    munis = sorted({k[0] for k in chaves_qdlt} | {k[0] for k in chaves_qdnum} | {k[0] for k in chaves_interna})
    lista = ",".join(str(m) for m in munis)
    qd = SQL_CHAVE.format(x=_valor_comp(("QUADRA",)))
    lt = SQL_CHAVE.format(x=_valor_comp(("LOTE",)))
    ri = f"upper({_valor_comp(('RUA INTERNA', 'TRAVESSA INTERNA'))})"
    t0 = time.time()
    con.execute(
        f"""CREATE TEMP TABLE base AS
        SELECT code_muni::BIGINT AS muni, dsc_localidade AS loc, nom_tipo_seglogr AS tipo, nom_titulo_seglogr AS titulo,
               nom_seglogr AS nome, num_endereco::BIGINT AS num, code_tract::BIGINT AS setor, {qd} AS qd, {lt} AS lt,
               {ri} AS interna, ST_AsWKB(geometry) AS wkb
        FROM read_parquet('{caminho_cnefe.as_posix()}') WHERE code_muni IN ({lista})"""
    )
    linhas_qdlt = con.execute("SELECT b.muni, b.qd, b.lt, b.loc, b.tipo, b.titulo, b.nome, b.setor, b.wkb FROM base b JOIN k_qdlt k ON b.muni = k.muni AND b.qd = k.qd AND b.lt = k.lt").fetchall()
    linhas_qdnum = con.execute("SELECT b.muni, b.qd, b.num, b.loc, b.tipo, b.titulo, b.nome, b.setor, b.wkb FROM base b JOIN k_qdnum k ON b.muni = k.muni AND b.qd = k.qd AND b.num = k.num").fetchall()
    linhas_int = con.execute(
        "SELECT b.muni, k.nome, b.loc, b.tipo, b.titulo, b.nome, b.setor, b.wkb FROM base b JOIN k_int k ON b.muni = k.muni "
        "AND (b.interna = k.nome OR regexp_replace(b.interna, '^(RUA|TRAVESSA|AVENIDA|ALAMEDA) ', '') = k.nome)"
    ).fetchall()
    con.close()
    log(f"  CNEFE: {len(munis)} municípios, {len(linhas_qdlt)} pontos de quadra e lote, {len(linhas_qdnum)} de quadra e número, "
        f"{len(linhas_int)} de rua interna ({time.time() - t0:.0f} s)")

    cache_bairro: dict[str, str] = {}
    cache_logr: dict[tuple, set[str]] = {}

    def loc_padr(loc: str | None) -> str | None:
        if not loc:
            return None
        if loc not in cache_bairro:
            cache_bairro[loc] = padronizar_bairro(loc)
        return cache_bairro[loc]

    def logr_formas(tipo, titulo, nome) -> set[str]:
        k = (tipo, titulo, nome)
        if k not in cache_logr:
            formas = {en.chave(" ".join(x for x in (tipo, titulo, nome) if x)), en.chave(nome or ""), en.chave(" ".join(x for x in (tipo, nome) if x))}
            formas |= {padronizar_logradouro(f) for f in list(formas) if f}
            cache_logr[k] = {f for f in formas if f}
        return cache_logr[k]

    def agrupar(linhas, n_chave):
        g = collections.defaultdict(list)
        for l in linhas:
            g[tuple(l[:n_chave])].append(l)
        return g

    g_qdlt = agrupar(linhas_qdlt, 3)
    g_qdnum = agrupar(linhas_qdnum, 3)
    g_int = agrupar(linhas_int, 2)

    def filtrar(p: dict, linhas: list) -> tuple[list, str]:
        """Linhas da mesma localidade casada ou do mesmo logradouro (uma das duas é obrigatória)."""
        loc = p.get("localidade")
        nomes = p.get("logradouros_padr") or set()
        por_loc = [l for l in linhas if loc and loc_padr(l[-6]) == loc]
        por_logr = [l for l in linhas if nomes and logr_formas(l[-5], l[-4], l[-3]) & nomes]
        ambos = [l for l in por_loc if l in por_logr]
        if ambos:
            return ambos, "localidade+logradouro"
        if por_loc:
            return por_loc, "localidade"
        if por_logr:
            return por_logr, "logradouro"
        return [], ""

    saida: dict[str, dict] = {}

    def aceitar(p: dict, linhas: list, raio: float, degrau: str, precisao: str) -> bool:
        if not linhas:
            return False
        pontos = [_wkb_para_latlon(l[-1]) for l in linhas]
        m = _mediana_dentro(pontos, raio)
        if not m:
            return False
        lat, lon, maior = m
        atual = p["resultado"]
        # não troca um ponto de rua confiável por um lote a mais de 500 m dela
        if atual["precisao"] == "rua" and atual.get("lat") is not None and distancia_m(lat, lon, atual["lat"], atual["lon"]) > max(LIMITE_RUA_M, atual.get("desvio_m") or 0):
            return False
        setores = {l[-2] for l in linhas}
        saida[p["id"]] = {"precisao": precisao, "lat": lat, "lon": lon, "desvio_m": max(6, round(maior)),
                          "setor": str(setores.pop()) if len(setores) == 1 and None not in setores else None, "motivo": None,
                          "degrau": degrau}
        return True

    for p in qdnum:
        if p["resultado"]["precisao"] == "numero":
            continue
        q, n = en.chave_qdlt(p["analise"]["quadra_numero"][0]), int(p["analise"]["quadra_numero"][1])
        linhas, _ = filtrar(p, g_qdnum.get((p["code"], q, n), []))
        aceitar(p, linhas, RAIO_QDLT_M, "quadra_numero", "numero")
    for p in qdlt:
        if p["id"] in saida or p["resultado"]["precisao"] == "numero":
            continue
        linhas, _ = filtrar(p, g_qdlt.get((p["code"], p["analise"]["quadra"], p["analise"]["lote"]), []))
        aceitar(p, linhas, RAIO_QDLT_M, "qdlt", "numero")
    for p in interna:
        if p["id"] in saida:
            continue
        linhas = g_int.get((p["code"], nome_sem_tipo(p["analise"]["logradouro"])), [])
        loc = p.get("localidade")
        if loc:
            linhas = [l for l in linhas if loc_padr(l[2]) == loc]
        aceitar(p, linhas, RAIO_RUA_INTERNA_M, "rua_interna", "rua")
    return saida


# =====================================================================================================================
# Bairros do IBGE (polígonos) e porte das cidades
# =====================================================================================================================


class BairrosIBGE:
    """Polígonos dos bairros do Censo 2022 (só onde o IBGE delimita bairros)."""

    def __init__(self, caminho: Path, codigos: set[int]):
        import duckdb
        import shapely

        self.shapely = shapely
        self.por_muni: dict[int, dict[str, object]] = collections.defaultdict(dict)
        lista = ",".join(str(c) for c in sorted(codigos)) or "0"
        for code, nome, wkb in duckdb.sql(
            f"SELECT code_muni::BIGINT, name_neighborhood, ST_AsWKB(geometry) FROM read_parquet('{caminho.as_posix()}') WHERE code_muni IN ({lista})"
        ).fetchall():
            if nome and wkb:
                k = en.chave(nome)
                geo = shapely.from_wkb(bytes(wkb))
                anterior = self.por_muni[int(code)].get(k)
                self.por_muni[int(code)][k] = geo if anterior is None else shapely.union(anterior, geo)

    def conferir(self, code: int | None, bairro: str | None, lat: float | None, lon: float | None, cidade: str | None = None) -> tuple[str | None, float | None]:
        """("dentro" | "fora" | None, distância em m até o polígono quando fora). None: sem bairros do IBGE na cidade,
        ou o bairro informado não casa com nenhum."""
        if code is None or lat is None or lon is None or code not in self.por_muni:
            return None, None
        nome, _ = casar_localidade(formas_do_bairro(bairro), self.por_muni[code], None, cidade)
        if not nome:
            return None, None
        poli = self.por_muni[code][nome]
        if self.shapely.contains_xy(poli, lon, lat):
            return "dentro", 0.0
        graus = self.shapely.distance(poli, self.shapely.Point(lon, lat))
        return "fora", graus * 111320 * max(0.3, math.cos(math.radians(lat)))


def populacao_por_municipio(caminho: Path) -> dict[int, int]:
    import duckdb

    if not caminho.exists():
        return {}
    return {int(c): int(p or 0) for c, p in duckdb.sql(f"SELECT code_muni, SUM(V0001) FROM read_parquet('{caminho.as_posix()}') WHERE code_muni IS NOT NULL GROUP BY 1").fetchall()}


def porte(pop: int | None) -> str:
    if pop is None:
        return "desconhecido"
    if pop < 20000:
        return "menos de 20 mil"
    if pop < 50000:
        return "20 a 50 mil"
    if pop < 100000:
        return "50 a 100 mil"
    if pop < 500000:
        return "100 a 500 mil"
    return "mais de 500 mil"


# =====================================================================================================================
# Pipeline
# =====================================================================================================================


def geocodificar(imoveis: list[dict], ceps: dict[str, str], usar_cnefe: bool = True) -> list[dict]:
    import enderecobr as eb

    pasta_gbr = ent.pasta_geocodebr()
    tabelas = pasta_gbr / f"geocodebr_data_release_{ent.GEOCODEBR_RELEASE}"
    t0 = time.time()
    munis = Municipios(tabelas / "municipio.parquet")
    for p in imoveis:
        p["analise"] = en.analisar(p["endereco"], p["bairro"], p["tipo"], p["uf"])
        p["cep"] = ceps.get(p["id"])
        p["code"] = munis.codigo(p["uf"], p["cidade"], eb.padronizar_municipios) if p["cidade"] else None
        p["municipio"] = munis.sede.get(p["code"]) if p["code"] else None
    locs = Localidades(tabelas / "municipio_localidade.parquet", {p["code"] for p in imoveis if p["code"]})
    cont_metodo = collections.Counter()
    for p in imoveis:
        cand = locs.por_muni.get(p["code"], {}) if p["code"] else {}
        p["localidade"], p["localidade_metodo"] = casar_localidade(formas_do_bairro(p["bairro"]), cand, eb.padronizar_bairros, p["cidade"])
        p["bairro_ref"] = cand.get(p["localidade"]) if p["localidade"] else None
        cont_metodo[p["localidade_metodo"]] += 1
    log(f"Bairro casado com a localidade do CNEFE: {dict(cont_metodo)} ({time.time() - t0:.0f} s)")

    # linhas do geocodebr: principal + variantes
    linhas = []
    for p in imoveis:
        if not p["code"]:
            continue
        a = p["analise"]
        nomes = [a["logradouro"], *a["variantes"][:MAX_VARIANTES]] if a["logradouro"] else [None]
        p["n_variantes"] = len(nomes)
        p["nomes_padr"] = [eb.padronizar_logradouros(n) if n else None for n in nomes]
        p["logradouros_padr"] = {n for n in p["nomes_padr"] if n}
        numero = None if a.get("quadra_numero") else a.get("numero")
        localidade = p["localidade"] or (eb.padronizar_bairros(p["bairro"]) if p["bairro"] else None)
        for k, nome in enumerate(nomes):
            linhas.append({"gid": f"{p['id']}#{k}", "logradouro": nome, "numero": numero, "cep": p["cep"], "localidade": localidade,
                           "municipio": str(p["code"]), "estado": p["uf"]})
    log(f"geocodebr: {len(linhas)} linhas para {sum(1 for p in imoveis if p['code'])} imóveis...")
    t1 = time.time()
    candidatos = rodar_geocodebr(linhas, pasta_gbr)
    log(f"  ok em {time.time() - t1:.0f} s")
    numeros = {l["gid"]: l["numero"] for l in linhas}
    codigos = {l["gid"]: int(l["municipio"]) for l in linhas}
    cont = reinterpolar(candidatos, numeros, codigos, tabelas)
    log(f"Números interpolados refeitos entre os vizinhos do CNEFE: {dict(cont)}")

    for p in imoveis:
        if not p["code"]:
            p["resultado"] = resultado_cidade("municipio_desconhecido")
            p["variante"] = None
            continue
        ctx = {"bairro_ref": p["bairro_ref"], "municipio": p["municipio"]}
        res = [(k, classificar(candidatos.get(f"{p['id']}#{k}", []), {**ctx, "logradouro": p["nomes_padr"][k]})) for k in range(p["n_variantes"])]
        p["variante"], p["resultado"] = melhor(res)

    if usar_cnefe:
        caminho = ent.caminho_por_nome("cnefe_2022")
        if caminho.exists():
            pendentes = [p for p in imoveis if p["resultado"]["precisao"] != "numero" and not p["analise"].get("rural")]
            t2 = time.time()
            novos = degraus_cnefe(pendentes, caminho, eb.padronizar_bairros, eb.padronizar_logradouros)
            for p in imoveis:
                if p["id"] in novos:
                    p["resultado"] = novos[p["id"]]
            log(f"Degraus no CNEFE: {collections.Counter(r['degrau'] for r in novos.values())} ({time.time() - t2:.0f} s)")
        else:
            log(f"Sem o CNEFE completo em {caminho}: degraus de quadra e lote desligados (rode entradas.py)")

    # conferência no polígono do bairro do IBGE: casamento sem a localidade (níveis *04, quadra e lote, rua interna)
    # que cai a mais de 1 km do bairro informado é rebaixado; os outros só são medidos (medicao.py)
    caminho_bairros = ent.caminho_por_nome("neighborhoods_2022")
    bairros = BairrosIBGE(caminho_bairros, {p["code"] for p in imoveis if p.get("code")}) if caminho_bairros.exists() else None
    rebaixados = 0
    for p in imoveis:
        p["resultado"] = limitar(p["resultado"], p["analise"])
        r = p["resultado"]
        p["bairro_ibge"] = bairros.conferir(p.get("code"), p.get("bairro"), r.get("lat"), r.get("lon"), p.get("cidade")) if bairros else (None, None)
        sem_localidade = (r.get("degrau") or "")[2:] == "04" or r.get("degrau") in ("qdlt", "quadra_numero", "rua_interna")
        if r["precisao"] in ("numero", "rua") and sem_localidade and p["bairro_ibge"][0] == "fora" and (p["bairro_ibge"][1] or 0) > FORA_DO_BAIRRO_IBGE_M:
            p["resultado"] = resultado_bairro(p["bairro_ref"], "fora_do_bairro_ibge", "bairro")
            r = p["resultado"]
            p["bairro_ibge"] = bairros.conferir(p.get("code"), p.get("bairro"), r.get("lat"), r.get("lon"), p.get("cidade"))
            rebaixados += 1
    log(f"Conferência no polígono do bairro do IBGE: {rebaixados} rebaixado(s) (sem a localidade e a mais de {FORA_DO_BAIRRO_IBGE_M} m)")
    log(f"Geocodificação: {time.time() - t0:.0f} s no total")
    return imoveis


def registro(p: dict) -> dict:
    r = p["resultado"]
    saida = {
        "precisao": r["precisao"],
        "lat": round(r["lat"], 6) if r.get("lat") is not None else None,
        "lon": round(r["lon"], 6) if r.get("lon") is not None else None,
        "desvio_m": r.get("desvio_m"),
        "setor": r.get("setor"),
        "motivo": r.get("motivo"),
        "degrau": r.get("degrau"),
    }
    if p.get("variante"):
        saida["variante"] = p["variante"]
    return saida


def gravar_geocode(caminho: Path, imoveis: list[dict], manifesto: list[dict]) -> None:
    """JSON com um imóvel por linha (diff legível)."""
    caminho.parent.mkdir(parents=True, exist_ok=True)
    cont = collections.Counter(p["resultado"]["precisao"] for p in imoveis)
    cabeca = {
        "formato": "luneta-geocode",
        "versao": VERSAO,
        "gerado_em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "fonte": "IBGE, CNEFE 2022; IPEA, geocodebr 0.2.0 (MIT), tabelas padronizacao_cnefe v0.5.0",
        "precisoes": "numero (número exato, interpolado ou quadra e lote; desvio até 150 m) | rua (até 500 m) | bairro (centro da localidade, até 2,5 km) | cidade (sem ponto melhor que a sede do município)",
        "regras": {"numero_m": LIMITE_NUMERO_M, "rua_m": LIMITE_RUA_M, "bairro_m": LIMITE_BAIRRO_M, "empate_mesmo_lugar_m": EMPATE_MESMO_LUGAR_M,
                   "empate_longe_m": EMPATE_LONGE_M, "longe_do_bairro_m": LONGE_DO_BAIRRO_M, "qdlt_m": RAIO_QDLT_M,
                   "rua_interna_m": RAIO_RUA_INTERNA_M, "fora_do_bairro_ibge_m": FORA_DO_BAIRRO_IBGE_M,
                   "folga_municipio_km": FOLGA_MUNICIPIO_KM},
        "entradas": [{"nome": m["nome"], "sha256": m["sha256"]} for m in manifesto],
        "total": len(imoveis),
        "por_precisao": {k: cont.get(k, 0) for k in ORDEM_PRECISAO},
    }
    partes = [json.dumps(cabeca, ensure_ascii=False, indent=1)[:-2] + ',\n "imoveis": {\n']
    itens = sorted(imoveis, key=lambda p: p["id"])
    for k, p in enumerate(itens):
        fim = ",\n" if k + 1 < len(itens) else "\n"
        partes.append(f"  {json.dumps(p['id'])}: {json.dumps(registro(p), ensure_ascii=False, separators=(',', ':'))}{fim}")
    partes.append(" }\n}\n")
    temporario = caminho.with_name(caminho.name + ".tmp")
    temporario.write_text("".join(partes), encoding="utf-8")
    temporario.replace(caminho)


def principal(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--instantaneo", default=str(INSTANTANEO_PADRAO))
    p.add_argument("--banco", default=str(BANCO_PADRAO), help="lê o CEP (coluna cep ou extras.cep), se o banco existir")
    p.add_argument("--fichas", action="append", default=[], help="fichas.json do baixar-fichas.ts (campo cep); pode repetir")
    p.add_argument("--saida", default=str(SAIDA_PADRAO))
    p.add_argument("--limite", type=int, default=0, help="só os N primeiros imóveis (teste)")
    p.add_argument("--ids", default="", help="só estes ids, separados por vírgula (teste)")
    p.add_argument("--sem-cnefe", action="store_true", help="não roda os degraus no CNEFE completo")
    p.add_argument("--sem-medicao", action="store_true", help="não grava medicao-geocode.md")
    p.add_argument("--depurar", default="", help="grava um JSONL com o caminho de cada imóvel (local, não publicar)")
    a = p.parse_args(argv)

    imoveis = ler_instantaneo(Path(a.instantaneo))
    if a.ids:
        quero = set(a.ids.split(","))
        imoveis = [i for i in imoveis if i["id"] in quero]
    if a.limite:
        imoveis = imoveis[: a.limite]
    ceps = ler_ceps_banco(Path(a.banco))
    ceps.update(ler_ceps_fichas(a.fichas))
    log(f"{len(imoveis)} imóveis do instantâneo; CEP para {sum(1 for i in imoveis if i['id'] in ceps)}")
    manifesto = json.loads(ent.MANIFESTO_REFERENCIA.read_text(encoding="utf-8"))["arquivos"] if ent.MANIFESTO_REFERENCIA.exists() else []
    inicio = time.time()
    geocodificar(imoveis, ceps, usar_cnefe=not a.sem_cnefe)
    saida = Path(a.saida)
    gravar_geocode(saida / "geocode.json", imoveis, manifesto)
    if a.depurar:
        with open(a.depurar, "w", encoding="utf-8") as f:
            for i in imoveis:
                campos = ("id", "endereco", "bairro", "cidade", "uf", "tipo", "code", "localidade", "localidade_metodo", "variante", "resultado", "analise", "bairro_ibge")
                f.write(json.dumps({k: (sorted(v) if isinstance(v, set) else v) for k, v in i.items() if k in campos}, ensure_ascii=False, default=str) + "\n")
    cont = collections.Counter(i["resultado"]["precisao"] for i in imoveis)
    n = len(imoveis) or 1
    log("Precisão: " + ", ".join(f"{k} {cont.get(k, 0)} ({100 * cont.get(k, 0) / n:.1f}%)" for k in ORDEM_PRECISAO))
    if not a.sem_medicao:
        import medicao

        medicao.gravar(saida / "medicao-geocode.md", imoveis, segundos=time.time() - inicio, ceps=len([i for i in imoveis if i.get("cep")]))
    log(f"Gravado: {saida / 'geocode.json'}")
    return 0


if __name__ == "__main__":
    os.environ.setdefault("POLARS_MAX_THREADS", str(os.cpu_count() or 2))
    sys.exit(principal())
