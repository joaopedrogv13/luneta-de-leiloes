"""Estação de metrô, trem e VLT mais perto de cada imóvel (rodada 5, decisão 11): as colunas `metro_m`, `trem_m` e
`vlt_m` (com o nome da estação) no arquivo do OpenStreetMap do site, `base/saida/site/localizacao-osm.json.gz` (ODbL).

O site usa as colunas para a tag positiva "Metrô a 450 m" (e "Trem a…", "VLT a…"), só abaixo de 1 km, para o filtro
"Metrô a até 1 km" e para a frase "Estação de metrô X a 450 m" da seção de localização (src/lib/catalogo/estacoes.ts).

Regras:
- **Só imóvel com endereço no número ou na rua** (a precisão do arquivo principal, localizacao.json.gz). No bairro ou na
  cidade o ponto pode estar a quilômetros do imóvel: nenhuma distância é gravada.
- **Distância em linha reta** (haversine, em metros, arredondada a 10 m) do ponto do endereço até o ponto da estação no
  OSM (o nó da estação ou o centro da área dela) ou até um acesso de metrô (railway=subway_entrance), o que estiver
  mais perto. Até `LIMITE_M` (2 km); além disso, nada (null).
- **Metrô** inclui o monotrilho (em São Paulo, as linhas 15-Prata e 17-Ouro são do Metrô): a coluna `metro_mono` diz
  quando a estação mais perto é de monotrilho (o site escreve "estação de monotrilho").
- **Nome:** o da estação no OSM; o acesso de metrô não tem nome próprio (o nome dele é o da saída), então vale o nome da
  estação com nome mais perto do acesso, a até 800 m dele. Ponto de metrô sem nome a mais de 800 m de qualquer estação
  com nome (acesso "órfão": marcação errada ou de estação que não existe) fica fora. Sem nome em nenhum dos dois, a
  frase sai sem nome ("Estação de metrô a 450 m").
- **Só estação de passageiros em operação, de transporte urbano.** O OSM marca como estação muita parada antiga do
  interior, linha de carga, trem turístico, funicular e bonde. A nota de localização (nota.py) usa a categoria inteira,
  como sempre; aqui, para a tag, saem:
  - nome ou rede com "antiga", "desativada", "abandonada", "turística", "museu", "histórica", "ruínas", "réplica",
    "cultural", "Maria Fumaça", "carga", "bonde", "funicular", "plano inclinado", "teleférico", "Corcovado",
    "Aeromóvel" (`RE_FORA`) ou só "Estação 1", "Estação 2"... (plano inclinado);
  - a estação marcada ao mesmo tempo como metrô, trem e VLT no mesmo ponto (a linha Teresina–Parnaíba, de Altos a Luís
    Correia: marcação confusa de linha sem serviço regular);
  - trem, VLT e monotrilho fora de uma rede urbana de passageiros conhecida: entra a estação cujo nome, rede ou operador
    cita uma rede da lista (`REDES_PASSAGEIROS`: CPTM, ViaMobilidade, TIC Trens, SuperVia, Trensurb, CBTU, Metrofor,
    VLT, EMTU...; no monotrilho, o Metrô) e, a partir dela, as vizinhas da mesma categoria a até 1 km umas das outras
    (no VLT, 600 m; a rede costuma estar marcada só em parte das estações e paradas da linha). Operadora de carga ou de trem turístico
    (MRS, Rumo, FCA, VLI, ABPF...) não entra pela vizinhança. A "Estação Ferroviária de X" de uma cidade do interior,
    longe de qualquer linha urbana, fica de fora; o trem de longa distância (Vitória a Minas, Carajás) também;
  - metrô não passa pela lista (só pelos nomes acima): o OSM só marca metrô onde há metrô.
- Trem e VLT na mesma estação (a CBTU marca as linhas de João Pessoa, Natal e Maceió dos dois jeitos): fica só o VLT.
- Metrô e VLT com o mesmo nome e a mesma distância (a Linha Sul do Metrofor, em Fortaleza): fica só o metrô.

Uso (depois do nota.py; no Actions, a etapa `nota` chama sozinho; aqui, com o osm-pois.csv.gz da etapa `osm`):

    python base/fontes/localizacao/estacoes.py --osm osm-pois.csv.gz [--site base/saida/site] [--medicao medicao-nota.md]

Grava as colunas no localizacao-osm.json.gz (o resto do arquivo fica como está: a nota não muda) e reescreve a seção
"Estação de metrô, trem e VLT perto" do medicao-nota.md (entre os marcadores <!-- estacoes:inicio --> e
<!-- estacoes:fim -->), com quantos imóveis ganham cada tag, por cidade.
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
SITE = RAIZ / "base" / "saida" / "site"
MEDICAO = RAIZ / "base" / "saida" / "localizacao" / "medicao-nota.md"

LIMITE_M = 2000
#: a tag do site (src/lib/catalogo/estacoes.ts, LIMITE_TAG_M): estação a menos de 1 km
TAG_M = 1000
NOME_ACESSO_M = 800
REDE_VIZINHA_M = 2000
PRECISOES_COM_DISTANCIA = ("numero", "rua")
#: modos da tag → categorias do osm-pois.csv.gz (osm.py)
MODOS = {"metro": ("metro", "monotrilho"), "trem": ("trem",), "vlt": ("vlt",)}
ROTULO_MODO = {"metro": "Metrô", "trem": "Trem", "vlt": "VLT"}

RE_FORA = re.compile(
    r"\b(antig[ao]s?|desativad[ao]s?|abandonad[ao]s?|tur[ií]stic[ao]s?|museu|hist[oó]ric[ao]s?|ru[ií]nas?|r[eé]plica|"
    r"cultur(al|a)|maria[ -]fuma[cç]a|carga|desmontad[ao]|demolid[ao]|extint[ao]|bonde|funicular|plano inclinado|"
    r"telef[eé]rico|corcovado|cremalheira|aerom[oó]vel|trenzinho|monorail)\b",
    re.IGNORECASE,
)
RE_NUMERADA = re.compile(r"^\s*esta[cç][aã]o\s+\d+\s*$", re.IGNORECASE)
#: redes e operadores urbanos de passageiros (nome, rede ou operador da estação no OSM): trem e VLT
REDES_PASSAGEIROS = re.compile(
    r"\b(CPTM|Companhia Paulista de Trens Metropolitanos|ViaMobilidade|Via Mobilidade|TIC Trens|Trivia|SuperVia|Supervia|"
    r"Trensurb|CBTU|Metrofor|Companhia Cearense de Transportes Metropolitanos|VLT|EMTU|BR Mobilidade|Metr[oô]|MetrôRio|"
    r"MetrôBH|Metropolitano|Expresso Aeroporto)\b",
    re.IGNORECASE,
)
#: no monotrilho, só o do Metrô (em São Paulo, as linhas 15-Prata e 17-Ouro); o de parque ou de santuário fica fora
REDES_MONOTRILHO = re.compile(r"\b(Metr[oô]|Metropolitano|Linha 15|Linha 17)\b", re.IGNORECASE)
#: carga, turismo e preservação: não entram pela vizinhança de uma estação urbana
RE_CARGA = re.compile(
    r"\b(MRS|Rumo|FCA|VLI|Vli|Ferrovia Centro[- ]Atl[aâ]ntica|Transnordestina|FTL|FTC|RFFSA|ABPF|AFMB|APFSM|Giordani|Mogyana|"
    r"Central Log[ií]stica|Vale|EFVM|EFC|Ferroeste|Ferroviaria Oriental)\b"
)
#: a vizinhança da rede: estações de trem a até 1 km umas das outras; no VLT, 600 m (as paradas do VLT Carioca ficam a
#: 300 a 600 m umas das outras, e o bonde de Santa Teresa, a quase 1 km da parada mais perto do VLT)
VIZINHA_M = {"trem": 1000, "vlt": 600, "monotrilho": 1000}


def log(*partes: object) -> None:
    print(*partes, flush=True)


# ---------------------------------------------------------------------------------------------------------------------
# Funções puras (testadas em testar.py)
# ---------------------------------------------------------------------------------------------------------------------


def nome_curto(nome: str) -> str:
    """"Estação Botafogo" → "Botafogo"; "Estação de Metrô Sé (Linha 1)" → "Sé (Linha 1)"; "Estação Jaraguá;Jaraguá" →
    "Jaraguá"; "Jurubatuba- Senac" → "Jurubatuba - Senac". Vazio fica vazio."""
    partes = [p.strip() for p in (nome or "").split(";") if p.strip()]
    n = re.sub(r"\s+", " ", partes[0] if partes else "")
    n = re.sub(r"\s*-\s+|\s+-\s*", " - ", n)
    n = re.sub(r"^(esta[cç][aã]o|est\.)\s+(de\s+|do\s+)?((metr[oô]|trem|vlt|monotrilho|ferrovi[aá]ria)\s+)?(de\s+|do\s+|da\s+)?", "", n, flags=re.IGNORECASE)
    n = re.sub(r"\s*[-–]\s*(metr[oô]|cptm|supervia|vlt)\s*$", "", n, flags=re.IGNORECASE)
    return n.strip()[:60]


def fora(nome: str, rede: str = "") -> bool:
    """Estação antiga, turística, de bonde, funicular...: não vira tag (a nota usa todas)."""
    return bool(RE_FORA.search(f"{nome or ''} {rede or ''}")) or bool(RE_NUMERADA.match(nome or ""))


def de_rede_passageiros(nome: str, rede: str, monotrilho: bool = False) -> bool:
    return bool((REDES_MONOTRILHO if monotrilho else REDES_PASSAGEIROS).search(f"{nome or ''} {rede or ''}"))


def de_carga(rede: str) -> bool:
    """Operadora de carga ou de trem turístico (pela rede e pelo operador; o nome da estação pode ter "Vale", "Rumo"...)."""
    return bool(RE_CARGA.search(rede or ""))


def distancias_m(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Haversine (m) de um ponto até vários."""
    r = 6_371_008.8
    p1, p2 = math.radians(lat), np.radians(lats)
    dlat = p2 - p1
    dlon = np.radians(lons) - math.radians(lon)
    a = np.sin(dlat / 2) ** 2 + math.cos(p1) * np.cos(p2) * np.sin(dlon / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(np.minimum(1.0, a)))


def arred10(m: float) -> int:
    return int(round(m / 10.0) * 10)


# ---------------------------------------------------------------------------------------------------------------------
# Leitura
# ---------------------------------------------------------------------------------------------------------------------


def ler_estacoes(caminho: Path) -> tuple[dict[str, list[dict]], str | None, dict]:
    """osm-pois.csv.gz → {modo: [{lat, lon, nome, cat}]} só com as estações que valem para a tag; a data dos dados."""
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
    brutas: dict[str, list[dict]] = collections.defaultdict(list)
    cats = {c: modo for modo, cs in MODOS.items() for c in cs}
    for r in csv.DictReader(corpo):
        modo = cats.get(r["categoria"])
        if modo:
            brutas[modo].append({"lat": float(r["lat"]), "lon": float(r["lon"]), "nome": r.get("nome") or "", "rede": r.get("rede") or "",
                                 "cat": r["categoria"]})
    if not brutas:
        raise SystemExit(f"{caminho}: nenhuma estação de metrô, trem ou VLT (é um osm-pois.csv.gz da rodada 5 em diante?)")
    # marcação confusa: o mesmo ponto como metrô, trem e VLT (a linha Teresina–Parnaíba)
    pontos = {cat: {(round(e["lat"], 4), round(e["lon"], 4)) for es in brutas.values() for e in es if e["cat"] == cat} for cat in ("metro", "trem", "vlt")}
    triplos = pontos["metro"] & pontos["trem"] & pontos["vlt"]
    saida: dict[str, list[dict]] = {}
    contagem: dict = {}
    for modo, lista in brutas.items():
        validas = [e for e in lista if not fora(e["nome"], e["rede"]) and (round(e["lat"], 4), round(e["lon"], 4)) not in triplos]
        boas = []
        for cat in MODOS[modo]:
            daqui = [e for e in validas if e["cat"] == cat]
            if cat == "metro":
                boas += sem_orfaos(daqui)
            else:
                boas += pela_rede(daqui, monotrilho=cat == "monotrilho", vizinha_m=VIZINHA_M[cat])
        saida[modo] = boas
        contagem[modo] = {"osm": len(lista), "fora": len(lista) - len(validas), "usadas": len(boas)}
    return saida, data, contagem


def pela_rede(lista: list[dict], monotrilho: bool = False, vizinha_m: float = 1000) -> list[dict]:
    """As estações de rede urbana conhecida e, a partir delas, as vizinhas (a até `vizinha_m` uma da outra), sem as de carga."""
    if not lista:
        return []
    dentro = [de_rede_passageiros(e["nome"], e["rede"], monotrilho) for e in lista]
    candidata = [not d and not de_carga(e["rede"]) for e, d in zip(lista, dentro)]
    la = np.array([e["lat"] for e in lista])
    lo = np.array([e["lon"] for e in lista])
    fila = [k for k, d in enumerate(dentro) if d]
    while fila:
        k = fila.pop()
        perto = np.nonzero(distancias_m(lista[k]["lat"], lista[k]["lon"], la, lo) <= vizinha_m)[0]
        for j in perto:
            if candidata[j] and not dentro[j]:
                dentro[j] = True
                fila.append(int(j))
    return [e for e, d in zip(lista, dentro) if d]


def sem_orfaos(lista: list[dict]) -> list[dict]:
    """Metrô: o ponto sem nome (quase sempre um acesso) só vale a até NOME_ACESSO_M de uma estação com nome. Acesso
    "órfão", longe de qualquer estação, é marcação errada ou de estação que não existe (um no Méier, no Rio, a 2,6 km do
    metrô mais perto)."""
    com_nome = [e for e in lista if e["nome"]]
    if not com_nome:
        return []
    la = np.array([e["lat"] for e in com_nome])
    lo = np.array([e["lon"] for e in com_nome])
    return [e for e in lista if e["nome"] or distancias_m(e["lat"], e["lon"], la, lo).min() <= NOME_ACESSO_M]


def ler_json_gz(caminho: Path) -> dict:
    with gzip.open(caminho, "rt", encoding="utf-8") as f:
        return json.load(f)


def gravar_json_gz(caminho: Path, conteudo: dict) -> int:
    dados = json.dumps(conteudo, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    tmp = caminho.with_name(caminho.name + ".tmp")
    with gzip.GzipFile(tmp, "wb", compresslevel=9, mtime=0) as f:
        f.write(dados)
    tmp.replace(caminho)
    return caminho.stat().st_size


# ---------------------------------------------------------------------------------------------------------------------
# Cálculo
# ---------------------------------------------------------------------------------------------------------------------


def mais_perto(lat: float, lon: float, est: list[dict], arr: tuple[np.ndarray, np.ndarray], nomeados: tuple[np.ndarray, np.ndarray, list[int]]):
    """(distância em m, índice da estação) da mais perto, ou None além do limite."""
    if not est:
        return None
    d = distancias_m(lat, lon, arr[0], arr[1])
    j = int(np.argmin(d))
    if d[j] > LIMITE_M:
        return None
    return float(d[j]), j


def nome_da(est: list[dict], j: int, nomeados: tuple[np.ndarray, np.ndarray, list[int]]) -> str:
    """O nome da estação j; acesso sem nome: o da estação com nome mais perto dele, a até NOME_ACESSO_M."""
    if est[j]["nome"]:
        return nome_curto(est[j]["nome"])
    la, lo, idx = nomeados
    if not idx:
        return ""
    d = distancias_m(est[j]["lat"], est[j]["lon"], la, lo)
    k = int(np.argmin(d))
    return nome_curto(est[idx[k]]["nome"]) if d[k] <= NOME_ACESSO_M else ""


#: metrô e VLT "na mesma estação": o mesmo nome e distâncias até ±20 m (os pontos da estação e do acesso diferem pouco)
MESMA_ESTACAO_M = 20


def sem_duplicadas(achadas: dict[str, tuple[float, int]], prep: dict) -> dict[str, tuple[float, int]]:
    """A mesma estação marcada em dois modos vira uma tag só (`achadas`: modo → (distância, índice da estação)).

    - Trem e VLT a até 100 m um do outro (a CBTU marca as linhas de João Pessoa, Natal e Maceió dos dois jeitos): fica o
      VLT.
    - Metrô e VLT com o mesmo nome e a mesma distância (±MESMA_ESTACAO_M): fica o metrô. A Linha Sul do Metrofor, em
      Fortaleza, está marcada também como VLT (Esperança e Aracapé davam "Metrô a 450 m" e "VLT a 450 m" no mesmo imóvel;
      revisão final da rodada 5, CONT-04).
    """
    saida = dict(achadas)
    if "trem" in saida and "vlt" in saida:
        et, ev = prep["trem"][0][saida["trem"][1]], prep["vlt"][0][saida["vlt"][1]]
        if distancias_m(et["lat"], et["lon"], np.array([ev["lat"]]), np.array([ev["lon"]]))[0] <= 100:
            del saida["trem"]
    if "metro" in saida and "vlt" in saida:
        (dm, jm), (dv, jv) = saida["metro"], saida["vlt"]
        nm = nome_da(prep["metro"][0], jm, prep["metro"][2]).casefold()
        nv = nome_da(prep["vlt"][0], jv, prep["vlt"][2]).casefold()
        if nm and nm == nv and abs(dm - dv) <= MESMA_ESTACAO_M:
            del saida["vlt"]
    return saida


def calcular(principal: dict, estacoes: dict[str, list[dict]]) -> tuple[dict[str, list], list[str]]:
    """Colunas novas (na ordem dos ids do arquivo principal) e a lista de nomes (as colunas *_nome são índices nela)."""
    c = principal["colunas"]
    ids = c["id"]
    precisoes = principal["precisoes"]
    nomes: list[str] = []
    nome_id: dict[str, int] = {}
    col: dict[str, list] = {f"{m}_m": [None] * len(ids) for m in MODOS}
    col.update({f"{m}_nome": [None] * len(ids) for m in MODOS})
    col["metro_mono"] = [None] * len(ids)
    prep = {}
    for modo, est in estacoes.items():
        arr = (np.array([e["lat"] for e in est]), np.array([e["lon"] for e in est]))
        idx = [k for k, e in enumerate(est) if e["nome"]]
        nomeados = (np.array([est[k]["lat"] for k in idx]), np.array([est[k]["lon"] for k in idx]), idx)
        prep[modo] = (est, arr, nomeados)
    for k in range(len(ids)):
        p = c["precisao"][k]
        lat, lon = c["lat"][k], c["lon"][k]
        if p is None or lat is None or lon is None or precisoes[p] not in PRECISOES_COM_DISTANCIA:
            continue
        achadas = {}
        for modo, (est, arr, nomeados) in prep.items():
            r = mais_perto(lat, lon, est, arr, nomeados)
            if r is not None:
                achadas[modo] = r
        achadas = sem_duplicadas(achadas, prep)
        for modo, (d, j) in achadas.items():
            est, arr, nomeados = prep[modo]
            col[f"{modo}_m"][k] = arred10(d)
            nome = nome_da(est, j, nomeados)
            if nome:
                if nome not in nome_id:
                    nome_id[nome] = len(nomes)
                    nomes.append(nome)
                col[f"{modo}_nome"][k] = nome_id[nome]
            if modo == "metro" and est[j]["cat"] == "monotrilho":
                col["metro_mono"][k] = 1
    return col, nomes


# ---------------------------------------------------------------------------------------------------------------------
# Medição (seção do medicao-nota.md)
# ---------------------------------------------------------------------------------------------------------------------

INICIO = "<!-- estacoes:inicio -->"
FIM = "<!-- estacoes:fim -->"


def num(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def pct(a: int, b: int) -> str:
    return f"{100 * a / b:.1f}%".replace(".", ",") if b else "—"


def medicao(principal: dict, cidades: dict, col: dict[str, list], contagem: dict, data_osm: str | None) -> str:
    c = principal["colunas"]
    precisoes = principal["precisoes"]
    n = len(c["id"])
    com_ponto = [k for k in range(n) if c["precisao"][k] is not None and precisoes[c["precisao"][k]] in PRECISOES_COM_DISTANCIA and c["lat"][k] is not None]
    linhas = [INICIO, "", "## Estação de metrô, trem e VLT perto (tag do site)", ""]
    linhas.append(
        f"Gerado em {time.strftime('%d/%m/%Y %H:%M UTC', time.gmtime())} por `base/fontes/localizacao/estacoes.py`, com o OSM de "
        f"{data_osm or 'data não informada'}. Distância em linha reta do ponto do endereço (número ou rua) até a estação mais perto; "
        f"a tag do site vale abaixo de {num(TAG_M)} m. Metrô inclui o monotrilho. A nota de localização não muda: ela segue com a "
        "distância até qualquer estação (`estacao_m`)."
    )
    linhas += ["", f"Imóveis com endereço no número ou na rua: {num(len(com_ponto))} de {num(n)}.", ""]
    linhas += ["| Tag | Imóveis (< 1 km) | % dos com número ou rua | < 500 m | 1 a 2 km | Pontos no OSM | Fora pelo nome | Usados |",
               "|---|---|---|---|---|---|---|---|"]
    for modo in MODOS:
        ds = [col[f"{modo}_m"][k] for k in com_ponto if col[f"{modo}_m"][k] is not None]
        tag = sum(1 for d in ds if d < TAG_M)
        meio = sum(1 for d in ds if d < 500)
        longe = sum(1 for d in ds if TAG_M <= d <= LIMITE_M)
        ct = contagem.get(modo, {})
        linhas.append(f"| {ROTULO_MODO[modo]} a X m | {num(tag)} | {pct(tag, len(com_ponto))} | {num(meio)} | {num(longe)} | "
                      f"{num(ct.get('osm', 0))} | {num(ct.get('fora', 0))} | {num(ct.get('usadas', 0))} |")
    algum = sum(1 for k in com_ponto if any(col[f"{m}_m"][k] is not None and col[f"{m}_m"][k] < TAG_M for m in MODOS))
    linhas += ["", f"Com pelo menos uma das três tags: {num(algum)} ({pct(algum, len(com_ponto))} dos com número ou rua).", ""]
    linhas.append(
        "Pontos: estações, paradas e acessos de metrô do OSM (uma estação costuma ter vários). Trem, VLT e monotrilho só contam "
        "estação de rede urbana de passageiros conhecida (nome, rede ou operador com CPTM, ViaMobilidade, SuperVia, Trensurb, CBTU, "
        "Metrofor, VLT...; no monotrilho, o Metrô) e as vizinhas dela a até 1 km; nenhum modo conta nome com \"antiga\", "
        "\"desativada\", \"turística\", \"bonde\", \"funicular\" etc. (`REDES_PASSAGEIROS`, `RE_FORA` e `RE_CARGA` em estacoes.py)."
    )
    # por cidade
    por = collections.defaultdict(lambda: {"ponto": 0, **{m: 0 for m in MODOS}, "algum": 0})
    for k in com_ponto:
        code = c["cidade"][k]
        x = por[code]
        x["ponto"] += 1
        tem = False
        for m in MODOS:
            d = col[f"{m}_m"][k]
            if d is not None and d < TAG_M:
                x[m] += 1
                tem = True
        if tem:
            x["algum"] += 1
    linhas += ["", "Por cidade (as que têm pelo menos um imóvel com a tag):", "",
               "| Cidade | Imóveis com número ou rua | Metrô < 1 km | Trem < 1 km | VLT < 1 km | Alguma |", "|---|---|---|---|---|---|"]
    ordem = sorted((code for code, x in por.items() if x["algum"]), key=lambda code: (-por[code]["algum"], str(code)))
    for code in ordem:
        x = por[code]
        cc = cidades.get(str(code)) or {}
        nome = f"{cc.get('nome', code)}/{cc.get('uf', '?')}"
        linhas.append(f"| {nome} | {num(x['ponto'])} | {num(x['metro'])} | {num(x['trem'])} | {num(x['vlt'])} | {num(x['algum'])} ({pct(x['algum'], x['ponto'])}) |")
    if not ordem:
        linhas.append("| — | — | — | — | — | — |")
    linhas += ["", FIM, ""]
    return "\n".join(linhas)


def gravar_medicao(caminho: Path, secao: str) -> None:
    texto = caminho.read_text(encoding="utf-8") if caminho.exists() else "# Medição da nota de localização\n"
    if INICIO in texto and FIM in texto:
        antes, resto = texto.split(INICIO, 1)
        depois = resto.split(FIM, 1)[1].lstrip("\n")
        texto = antes.rstrip("\n") + "\n\n" + secao + depois
    else:
        texto = texto.rstrip("\n") + "\n\n" + secao
    caminho.write_text(texto, encoding="utf-8")


def principal_(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--osm", required=True, help="osm-pois.csv.gz da etapa osm do Actions (rodada 5 em diante: metro, trem, vlt, monotrilho)")
    p.add_argument("--site", default=str(SITE), help="pasta dos localizacao*.json.gz (padrão: base/saida/site)")
    p.add_argument("--medicao", default=str(MEDICAO))
    a = p.parse_args(argv)
    site = Path(a.site)
    t0 = time.time()
    estacoes, data_osm, contagem = ler_estacoes(Path(a.osm))
    log(f"Estações: {contagem} (OSM de {data_osm})")
    principal = ler_json_gz(site / "localizacao.json.gz")
    arq_osm = ler_json_gz(site / "localizacao-osm.json.gz")
    if arq_osm["colunas"]["id"] != principal["colunas"]["id"]:
        raise SystemExit("localizacao.json.gz e localizacao-osm.json.gz com ids diferentes: rode o nota.py de novo")
    cidades = {}
    if (site / "localizacao-cidades.json.gz").exists():
        cidades = ler_json_gz(site / "localizacao-cidades.json.gz")["cidades"]
    col, nomes = calcular(principal, estacoes)
    arq_osm["colunas"].update(col)
    arq_osm["estacoes"] = {
        "dados_osm_de": data_osm,
        "gerado_em": time.strftime("%Y-%m-%d", time.gmtime()),
        "limite_m": LIMITE_M,
        "tag_m": TAG_M,
        "precisoes": list(PRECISOES_COM_DISTANCIA),
        "modos": {m: list(cs) for m, cs in MODOS.items()},
        "nomes": nomes,
        "regra": "distância em linha reta do ponto do endereço (número ou rua) até a estação de passageiros mais perto no OpenStreetMap; metrô inclui monotrilho",
    }
    tamanho = gravar_json_gz(site / "localizacao-osm.json.gz", arq_osm)
    gravar_medicao(Path(a.medicao), medicao(principal, cidades, col, contagem, data_osm))
    com = {m: sum(1 for d in col[f"{m}_m"] if d is not None and d < TAG_M) for m in MODOS}
    log(f"Gravado: localizacao-osm.json.gz ({tamanho // 1024} KB), {len(nomes)} nomes; tags (< {TAG_M} m): {com} ({time.time() - t0:.0f} s)")
    return 0


if __name__ == "__main__":
    sys.exit(principal_())
