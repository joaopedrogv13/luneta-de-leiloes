"""Endereço da Caixa → campos para a geocodificação (C5 da verificação do ranking de localização).

A Caixa escreve o endereço num campo só: `"Rua Expedicionario Benoni Falcao Gouveia, N. 338, Lt 28, Qd 08"`. O que vem
antes de `, N.` é o logradouro (às vezes com quadra, lote ou o nome antigo no meio), o número vem depois de `N.` e o
resto é complemento. Os padrões que o instantâneo de 21.230 imóveis mostrou (casos em casos-endereco.json):

- `, N.` em quase todos; `Sn`, `S/N`, `0` e `00` = sem número; número repetido (`N. 102, 102,`);
- Goiás e entorno do DF: `Quadra 249, N. Sn, Lt 11B Rua 86` (a rua de verdade está no complemento), `Lote 05 Quadra 03
  Rua Presidente Jk`, `Rua 86 Qd 221 Lt 08 B` (quadra e lote antes de `, N.`), `Quadra Quadra 41` (duplicado);
- DF: `Qnp 30, N. S/N, Conj Q Lt 06` e `Quadra Qr 314, ..., Conjunto 5 Lote 15`: no CNEFE o logradouro é a própria
  quadra com o conjunto (`QR 314 CONJUNTO 5`); o lote fica no complemento;
- nome antigo: `Rua Compositor Tunai (Antiga Rua Projetada 1)`, `(Atual Rua B do Eldorado)`, `(Rua 31)`;
- `Rua 13` e `Rua Treze`, `Rua Vii`: o CNEFE usa as duas formas, então saem as duas como variantes;
- Bauru: `N. 8-45` é quadra 8, número 45 (o CNEFE grava QUADRA=8 e número 45);
- rodovia com km (`BR 104 Km 32`, `Rodovia AM-010, Km 13`): o número não é de casa; a precisão fica no máximo "rua";
- rural (`Sitio Muquem`, `Fazenda ...`, bairro `Zona Rural`, tipo "rural"): sem nota, porque as métricas são urbanas.
  `Gleba A` ou `Chacara 03` no complemento de um prédio em Goiás é nome de loteamento, não imóvel rural.

Só biblioteca padrão (o geocodebr padroniza depois: "R" vira "RUA", "Av." vira "AVENIDA").
"""
from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------------------------------------------------


def sem_acento(texto: str) -> str:
    t = unicodedata.normalize("NFD", texto)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def chave(texto: str | None) -> str:
    """Maiúsculas, sem acento, só letras, dígitos e espaço simples."""
    if not texto:
        return ""
    t = sem_acento(texto).upper().replace("º", " ").replace("°", " ").replace("ª", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^0-9A-Z]+", " ", t)).strip()


def colapsar(texto: str) -> str:
    return re.sub(r"\s+", " ", texto or "").strip()


def chave_qdlt(valor: str | None) -> str | None:
    """Quadra ou lote comparável dos dois lados: "08" → "8", "01A" → "1A", "11-B" → "11B", "C-1" → "C1"."""
    if valor is None:
        return None
    k = re.sub(r"[^0-9A-Z]", "", sem_acento(str(valor)).upper())
    k = re.sub(r"(?<![0-9])0+(?=[0-9])", "", k)
    return k or None


# ---------------------------------------------------------------------------------------------------------------------
# Números por extenso e romanos (mesma grafia do enderecobr/CNEFE: QUATORZE, CENTO E QUARENTA E QUATRO)
# ---------------------------------------------------------------------------------------------------------------------

_UNIDADES = ["", "UM", "DOIS", "TRES", "QUATRO", "CINCO", "SEIS", "SETE", "OITO", "NOVE", "DEZ", "ONZE", "DOZE",
             "TREZE", "QUATORZE", "QUINZE", "DEZESSEIS", "DEZESSETE", "DEZOITO", "DEZENOVE"]
_DEZENAS = ["", "", "VINTE", "TRINTA", "QUARENTA", "CINQUENTA", "SESSENTA", "SETENTA", "OITENTA", "NOVENTA"]
_CENTENAS = ["", "CENTO", "DUZENTOS", "TREZENTOS", "QUATROCENTOS", "QUINHENTOS", "SEISCENTOS", "SETECENTOS",
             "OITOCENTOS", "NOVECENTOS"]


def por_extenso(n: int) -> str | None:
    """1..999 por extenso; None fora da faixa."""
    if not 0 < n < 1000:
        return None
    if n == 100:
        return "CEM"
    partes = []
    c, r = divmod(n, 100)
    if c:
        partes.append(_CENTENAS[c])
    if r:
        if r < 20:
            partes.append(_UNIDADES[r])
        else:
            d, u = divmod(r, 10)
            partes.append(_DEZENAS[d] + (f" E {_UNIDADES[u]}" if u else ""))
    return " E ".join(partes)


_EXTENSO_PARA_NUMERO = {por_extenso(k): k for k in range(1, 1000)}
_EXTENSO_PARA_NUMERO["CATORZE"] = 14
_ROMANOS = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def romano(t: str) -> int | None:
    """"VII" → 7 (até 89, só I V X L); None se não for romano válido. Uma letra só ("I", "V", "X") também conta."""
    if not re.fullmatch(r"(L?X{0,3})(IX|IV|V?I{0,3})", t) or not t:
        return None
    total, anterior = 0, 0
    for ch in reversed(t):
        v = _ROMANOS[ch]
        total += -v if v < anterior else v
        anterior = max(anterior, v)
    return total or None


# ---------------------------------------------------------------------------------------------------------------------
# Tipos de logradouro e palavras de complemento
# ---------------------------------------------------------------------------------------------------------------------

# tipo (como a Caixa escreve) → forma longa; o geocodebr padroniza de novo, isto só serve para reconhecer a via
TIPOS_VIA = {
    "RUA": "RUA", "R": "RUA", "RU": "RUA",
    "AVENIDA": "AVENIDA", "AV": "AVENIDA", "AVENIDAD": "AVENIDA", "AVN": "AVENIDA",
    "ALAMEDA": "ALAMEDA", "AL": "ALAMEDA",
    "TRAVESSA": "TRAVESSA", "TRAV": "TRAVESSA", "TV": "TRAVESSA", "TAVESSA": "TRAVESSA",
    "ESTRADA": "ESTRADA", "EST": "ESTRADA", "ESTR": "ESTRADA",
    "RODOVIA": "RODOVIA", "ROD": "RODOVIA",
    "PRACA": "PRACA", "PC": "PRACA", "PCA": "PRACA",
    "VIA": "VIA", "VIELA": "VIELA", "BECO": "BECO", "LARGO": "LARGO", "LADEIRA": "LADEIRA", "PASSAGEM": "PASSAGEM",
    "SERVIDAO": "SERVIDAO", "CAMINHO": "CAMINHO", "VICINAL": "VICINAL", "MARGINAL": "MARGINAL", "ACESSO": "ACESSO",
}
_VIA = r"(?:Rua|R|Ru|Avenida|Avenidad|Av|Avn|Alameda|Al|Travessa|Trav|Tv|Estrada|Est|Rodovia|Rod|Pra[cç]a|P[cç]a?|Via|Viela|Beco|Largo|Ladeira|Passagem|Servid[aã]o|Caminho)"
RE_VIA = re.compile(rf"\b{_VIA}\.?\s+(?=\S)", re.I)

# palavras que começam um complemento (onde o nome da via termina)
_COMP = (r"Lt|Lts|Lote|Lotes|Lot(?=\s*\d)|Qd|Qds|Qda|Quadra|Quadras|Cs|Casa|Bl|Bla|Bloco|Apto|Ap|Apartamento|Vg|Vaga|Ch|"
         r"Chacara|Ch[aá]cara|Cj|Conj|Conjunto|Torre|Tr|Pav|Pavimento|Unid|Unidade|Lj|Loja|Sl|Sala|Gleba|Etapa|Modelo|"
         r"Tipo|Res|Residencial|Cond|Condominio|Condom[ií]nio|Edificio|Edif[ií]cio|Ed|Plano|Mr|Box|Garagem|Andar|"
         r"Sub\s?Cond|Subcondominio|Subcondom[ií]nio|Duplex|Km|Setor")
RE_COMP_INICIO = re.compile(rf"(?:^|[\s,;-])(?:{_COMP})\.?(?=\s|\d|$|[,;-])", re.I)

RE_PARENTESES = re.compile(r"\(\s*([^()]*?)\s*(?:\)|$)")
RE_NOME_ANTIGO = re.compile(rf"^(?:Antig[oa]|Ant\.?|Atual|Futur[oa]|Logradouro do Condom[ií]nio|Frente Para a)?\s*({_VIA}\.?\s+.+)$", re.I)

# nome genérico (C2): Rua 06, Av B, Quadra 17, Travessa Projetada, Rua Vii, Rua Treze, Rua A-2
_EXTENSOS = "|".join(sorted((k for k in _EXTENSO_PARA_NUMERO if k), key=len, reverse=True))
RE_EXTENSO = re.compile(rf"^(.*?)\b({_EXTENSOS})\b(.*)$")
RE_DATA = re.compile(r"\bDE (JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\b")
RE_GENERICO = re.compile(
    rf"^\s*(?:{_VIA}|Quadra|Qd|Q)\.?\s+(?:N\s+)?(?:\d+\s*-?\s*[A-Z]?|[A-Z]\s*-?\s*\d*|[IVXL]+|PROJETAD[AO]\b.*|SEM DENOMINACAO\b.*|"
    rf"(?:{_EXTENSOS})(?:\s+[A-Z])?)\s*$",
    re.I,
)

RE_RURAL_LOGRADOURO = re.compile(
    r"^(?:Uma\s+)?(?:Parte\s+de\s+Terra|Gleba|Fazenda|Faz\.?|S[ií]tio|Ch[aá]cara|Granja|Est[aâ]ncia|Lote\s+Rural|"
    r"[ÁA]rea\s+Rural|Zona\s+Rural|Assentamento|N[uú]cleo\s+Rural|Colonia|Col[oô]nia)\b",
    re.I,
)
RE_RURAL_BAIRRO = re.compile(r"\b(?:Zona|[ÁA]rea)\s+Rural\b|^Rural$|^Interior$|\bAssentamento\b|\bN[uú]cleo\s+Rural\b", re.I)
RE_RODOVIA = re.compile(r"^(?:Rodovia|Rod\.?|BR|SP|RJ|MG|PE|BA|GO|PR|SC|RS|AM|PA|AL|CE|PB|RN|PI|MA|MT|MS|ES|SE|TO|RO|AC|AP|RR|DF)\b[\s-]*\d", re.I)
RE_KM = re.compile(r"\bKm\.?\s*\d", re.I)
# códigos de quadra do DF: QNP 30, QR 314, QS 423, CSB 2, QNM 12, SHIS QI 5, CNB 14, QSD 17, SRTVN...
RE_DF = re.compile(r"^(?:Quadra\s+)?((?:[QCES][A-Z]{0,4})|SHIS|SHIN|SMPW|SMDB|SHCES|SQS|SQN|CLN|CLS|SCLN|SCLS)[\s-]*(\d+[A-Z]?)\b", re.I)


def nome_generico(logradouro: str | None) -> bool:
    """"Rua 06", "Avenida B", "Quadra 17", "Rua Projetada", "Rua Vii", "Rua Treze": nome que se repete em muitos
    bairros da mesma cidade. Casar só por ele, sem a localidade, é arriscado (C2)."""
    return bool(logradouro) and bool(RE_GENERICO.match(chave(logradouro)))


# ---------------------------------------------------------------------------------------------------------------------
# Número
# ---------------------------------------------------------------------------------------------------------------------


def ler_numero(token: str | None) -> tuple[int | None, tuple[str, int] | None]:
    """Número do imóvel e, no padrão de Bauru ("8-45"), (quadra, número)."""
    t = colapsar(token or "").strip(" .,;")
    if not t or re.fullmatch(r"(?i)\.?(s\s*/?\s*n[º°o]?|sn|s\.n\.?|sem\s+n[uú]mero)", t):
        return None, None
    m = re.fullmatch(r"(\d{1,2})\s*-\s*(\d{1,3})", t)
    if m:
        return int(m.group(2)) or None, (m.group(1).lstrip("0") or "0", int(m.group(2)))
    m = re.match(r"(\d+)", t)
    if not m:
        return None, None
    n = int(m.group(1))
    if n == 0 or n > 99999:
        return None, None
    return n, None


# ---------------------------------------------------------------------------------------------------------------------
# Complementos
# ---------------------------------------------------------------------------------------------------------------------

# valor de quadra ou lote: "08", "11B", "08 B", "C-1", "AV-3"; a letra solta depois de espaço só vale em maiúscula
# ("Lt 7 e Parte do Lt 5": o "e" é conjunção)
_VALOR = r"([A-Z]{0,3}[\s-]?\d+[A-Z]?(?:(?:-|\s)?(?-i:[A-Z])(?![A-Za-z]))?|[A-Z](?:[\s-]?\d+)?(?![A-Z]))"
RE_QUADRA = re.compile(rf"(?:\b|(?<=\d))(?:Quadra|Qda|Qd)\.?\s*(?:Quadra\s+)?{_VALOR}", re.I)
RE_LOTE = re.compile(rf"(?:\b|(?<=\d))(?:Lote|Lot|Lt)\.?\s*{_VALOR}", re.I)
RE_LOTE_FAIXA = re.compile(r"\b(?:Lts|Lotes)\b|\b(?:Lt|Lote)\.?\s*\d+[A-Z]?\s*(?:/|\ba\b|\be\b|\bao\b|-\s*\d+\s*e)\s*\d", re.I)
RE_CONJUNTO = re.compile(r"\b(?:Conjunto|Cjto|Conj|Cj)\b\.?\s*([A-Z0-9]{1,4}(?:-?[A-Z])?)\b", re.I)


def _primeiro(rx: re.Pattern, textos: list[str]) -> str | None:
    for t in textos:
        m = rx.search(t)
        if m:
            return m.group(1)
    return None


def _cortar_complemento(cabeca: str) -> tuple[str, str]:
    """"Rua 86 Qd 221 Lt 08 B" → ("Rua 86", "Qd 221 Lt 08 B"). Só corta depois da primeira palavra do nome."""
    m = RE_VIA.match(cabeca)
    inicio = m.end() if m else 0
    # o nome tem pelo menos uma palavra depois do tipo ("Rua Quadra" não vira só "Rua")
    m2 = re.match(r"\S+", cabeca[inicio:])
    inicio += m2.end() if m2 else 0
    corte = RE_COMP_INICIO.search(cabeca, inicio)
    if not corte:
        return cabeca.strip(" ,;-"), ""
    return cabeca[: corte.start()].strip(" ,;-"), cabeca[corte.start():].strip(" ,;-")


def _via_no_texto(texto: str) -> str | None:
    """A primeira via dentro de um complemento: "Lt 11B Rua 86" → "Rua 86"; "Cs 13 Qd P Rua H 3ª Etapa" → "Rua H"."""
    for m in RE_VIA.finditer(texto):
        resto = texto[m.start():]
        via, _ = _cortar_complemento(resto)
        via = re.split(r"\s+\d+\s*[ªº°]", via)[0]
        if len(chave(via).split()) >= 2:
            return via.strip(" ,;-")
    return None


# ---------------------------------------------------------------------------------------------------------------------
# Variantes do nome
# ---------------------------------------------------------------------------------------------------------------------


def variantes_nome(logradouro: str) -> list[str]:
    """Formas que o CNEFE pode usar: "Rua 13" ↔ "RUA TREZE"; "Rua Vii" → "RUA 7" e "RUA SETE"."""
    k = chave(logradouro)
    saida: list[str] = []
    m = re.fullmatch(r"(.*?\b)(\d{1,3})(\b.*)", k)
    if m and por_extenso(int(m.group(2))):
        saida.append(f"{m.group(1)}{por_extenso(int(m.group(2)))}{m.group(3)}")
    m = RE_EXTENSO.match(k)
    if m and not RE_DATA.search(k):
        saida.append(f"{m.group(1)}{_EXTENSO_PARA_NUMERO[m.group(2)]}{m.group(3)}")
    m = re.fullmatch(r"(\S+(?: \S+)*? )([IVXL]+)((?: [A-Z])?)", k)
    if m and len(m.group(2)) > 1:
        n = romano(m.group(2))
        if n:
            saida.append(f"{m.group(1)}{n}{m.group(3)}")
            if por_extenso(n):
                saida.append(f"{m.group(1)}{por_extenso(n)}{m.group(3)}")
    return [s for s in dict.fromkeys(saida) if s != k]


# ---------------------------------------------------------------------------------------------------------------------
# Análise
# ---------------------------------------------------------------------------------------------------------------------


def analisar(endereco: str | None, bairro: str | None = None, tipo: str | None = None, uf: str | None = None) -> dict:
    """Separa o endereço da Caixa em campos. Nunca lança: endereço vazio dá logradouro None."""
    s = colapsar(endereco or "").strip(" ,;")
    r: dict = {
        "logradouro": None,
        "numero": None,
        "numero_bruto": None,
        "complementos": [],
        "quadra": None,
        "lote": None,
        "conjunto": None,
        "quadra_numero": None,
        "nome_antigo": None,
        "variantes": [],
        "rural": False,
        "rodovia_km": False,
        "padrao": "vazio" if not s else "comum",
    }
    if not s:
        r["rural"] = (tipo or "").lower() == "rural" or bool(bairro and RE_RURAL_BAIRRO.search(bairro))
        return r

    # 1) cabeça (logradouro) | número | resto
    m = re.match(r"^(.*?),\s*N\.\s*([^,]*)(?:,(.*))?$", s)
    if m:
        cabeca, token, resto = m.group(1), m.group(2), m.group(3) or ""
        r["numero_bruto"] = colapsar(token) or None
        # "N. Lt 11": o lote no lugar do número
        if re.match(r"(?i)\s*(Lt|Lote|Qd|Quadra)\b", token):
            resto = f"{token}, {resto}"
            token = ""
            r["numero_bruto"] = None
    else:
        r["padrao"] = "sem_n"
        partes = s.split(",", 1)
        cabeca, resto = partes[0], partes[1] if len(partes) > 1 else ""
        token = ""
        rx_n = re.compile(r"(?i)[\s,]+N[º°o]\.?\s*(\d+\w*)")
        m2 = rx_n.search(cabeca)
        if m2:
            token = m2.group(1)
            r["numero_bruto"] = token
            cabeca = cabeca[: m2.start()]
        else:
            m2 = rx_n.search(resto)
            if m2:
                token = m2.group(1)
                r["numero_bruto"] = token
        m3 = re.search(r"(?i)\s+S\s*/\s*N[º°o]?\b", cabeca)
        if m3:
            resto = f"{cabeca[m3.end():]}, {resto}"
            cabeca = cabeca[: m3.start()]
            r["numero_bruto"] = "S/N"
    numero, quadra_numero = ler_numero(token)
    r["numero"] = numero
    r["quadra_numero"] = list(quadra_numero) if quadra_numero else None

    # 2) nome antigo e outros parênteses
    variantes: list[str] = []
    for p in RE_PARENTESES.findall(cabeca):
        mm = RE_NOME_ANTIGO.match(p.strip())
        if mm:
            variantes.append(mm.group(1))
            if re.match(r"(?i)antig|ant\b", p.strip()):
                r["nome_antigo"] = colapsar(mm.group(1))
        elif re.match(r"(?i)antig[oa]\s+\S", p.strip()):
            # "(Antiga Cabucu-Queimados)": o tipo é o mesmo da via atual
            nome = re.sub(r"(?i)^antig[oa]\s+", "", p.strip())
            tipo_atual = RE_VIA.match(cabeca)
            antigo = f"{tipo_atual.group(0).strip()} {nome}" if tipo_atual else nome
            variantes.append(antigo)
            r["nome_antigo"] = colapsar(antigo)
    cabeca = colapsar(RE_PARENTESES.sub(" ", cabeca))
    mm = re.search(rf"(?i)\s+Antig[oa]\s+({_VIA}\.?\s+.+)$", cabeca)
    if mm:
        r["nome_antigo"] = colapsar(mm.group(1))
        variantes.append(mm.group(1))
        cabeca = cabeca[: mm.start()]
    cabeca = re.sub(r"(?i)\bN[º°o]\.?\s*(?=\d)", "", cabeca)  # "Rua Nº 06" → "Rua 06"
    cabeca = re.sub(r"(?i)^0\s+", "", cabeca).strip(" ,;-")

    pedacos = [colapsar(x) for x in re.split(r"[,;]", resto) if colapsar(x)]
    # número repetido: "N. 102, 102," ou "N. 508, 508 11"
    if pedacos and r["numero_bruto"] and re.fullmatch(rf"{re.escape(r['numero_bruto'])}(\s+\S+)?", pedacos[0]):
        pedacos = pedacos[1:] if pedacos[0] == r["numero_bruto"] else [pedacos[0][len(r["numero_bruto"]):].strip()] + pedacos[1:]

    # 3) padrões de quadra primeiro (Goiás, DF) e de lote primeiro
    textos_comp = list(pedacos)
    logradouro = cabeca
    df = RE_DF.match(cabeca)
    m_qd = re.match(r"(?i)^(?:Q\s+)?(?:Quadra|Qd|Qda)\.?\s+(?:Quadra\s+)?(\S+)\s*(.*)$", cabeca)
    m_lt = re.match(r"(?i)^(?:Lote|Lt)\.?\s+(\S+)\s*,?\s*(.*)$", cabeca)
    if df and (uf or "").upper() == "DF" or (df and re.match(r"(?i)^Quadra\s+[A-Z]{2,4}\s*\d", cabeca)):
        r["padrao"] = "df"
        codigo = f"{df.group(1).upper()} {df.group(2).lstrip('0') or '0'}"
        resto_cabeca = cabeca[df.end():]
        textos_comp = [resto_cabeca, *pedacos]
        conj = _primeiro(RE_CONJUNTO, textos_comp)
        r["conjunto"] = chave_qdlt(conj)
        logradouro = f"{codigo} CONJUNTO {conj.upper()}" if conj else codigo
        if conj:
            # o CNEFE escreve "QR 414 CONJUNTO 10 A"
            separado = re.sub(r"(?i)^(\d+)-?([A-Z])$", r"\1 \2", conj).upper()
            if separado != conj.upper():
                variantes.append(f"{codigo} CONJUNTO {separado}")
            variantes.append(codigo)
    elif m_qd and not re.match(r"(?i)^(?:Quadra|Qd)\s+(?:Rua|Avenida|Av)\b", cabeca):
        r["padrao"] = "quadra_primeiro"
        textos_comp = [f"Qd {m_qd.group(1)}", m_qd.group(2), *pedacos]
        via = _via_no_texto(" , ".join([m_qd.group(2), *pedacos]))
        logradouro = via or f"Quadra {m_qd.group(1)}"
        if via:
            variantes.append(f"Quadra {m_qd.group(1)}")
    elif m_lt:
        r["padrao"] = "lote_primeiro"
        textos_comp = [f"Lt {m_lt.group(1)}", m_lt.group(2), *pedacos]
        via = _via_no_texto(" , ".join([m_lt.group(2), *pedacos]))
        logradouro = via
    else:
        logradouro, cauda = _cortar_complemento(cabeca)
        if cauda:
            textos_comp = [cauda, *pedacos]
            if r["padrao"] == "comum":
                r["padrao"] = "complemento_no_logradouro"
        if not logradouro and cauda:
            logradouro = None

    # 4) quadra, lote (sem faixa), conjunto e o resto dos complementos
    if r["quadra_numero"]:
        r["quadra"] = chave_qdlt(r["quadra_numero"][0])
    quadra = _primeiro(RE_QUADRA, textos_comp)
    if quadra and not r["quadra"]:
        r["quadra"] = chave_qdlt(quadra)
    if not any(RE_LOTE_FAIXA.search(t) for t in textos_comp):
        r["lote"] = chave_qdlt(_primeiro(RE_LOTE, textos_comp))
    if r["conjunto"] is None:
        r["conjunto"] = chave_qdlt(_primeiro(RE_CONJUNTO, textos_comp))
    r["complementos"] = [t for t in (colapsar(x) for x in textos_comp) if t]

    # rodovia ou estrada com km e a rua de verdade no complemento ("Estrada Carlos Braga Km 08, N. Sn, Rua Lago do
    # Guedes Lt 27"): a rua entra como variante
    if logradouro and re.match(r"(?i)^(?:Rodovia|Rod\.?|Estrada|BR)\b", logradouro) and RE_KM.search(f"{cabeca} {resto}"):
        via = _via_no_texto(" , ".join(pedacos))
        if via and not re.match(r"(?i)^(?:Rodovia|Rod\.?|Estrada)\b", via):
            variantes.insert(0, via)

    # 5) rodovia, rural
    if logradouro:
        logradouro = colapsar(re.sub(r"(?i)\s*-?\s*\bKm\.?\s*\d+([.,]\d+)?\b.*$", "", logradouro)).strip(" ,;-") or logradouro
    todo = f"{cabeca} {resto}"
    r["rodovia_km"] = bool(RE_RODOVIA.match(cabeca) or re.match(r"(?i)^(?:Rodovia|Rod\.?|Estrada)\b", cabeca)) and bool(RE_KM.search(todo))
    tipo_rural = (tipo or "").lower() == "rural"
    rural_texto = bool(RE_RURAL_LOGRADOURO.match(cabeca)) and not RE_VIA.match(cabeca)
    rural_bairro = bool(bairro and RE_RURAL_BAIRRO.search(bairro))
    r["rural"] = tipo_rural or ((rural_texto or rural_bairro) and (tipo or "").lower() != "apartamento")

    # 6) variantes: nome antigo, forma por extenso / algarismo / romano
    r["logradouro"] = colapsar(logradouro) if logradouro else None
    todas: list[str] = []
    base = [x for x in [r["logradouro"], *variantes] if x]
    for v in base:
        todas.append(chave(v))
        if r["padrao"] != "df":  # "QR QUATROCENTOS E QUATORZE" não existe no CNEFE do DF
            todas.extend(variantes_nome(v))
    principal = chave(r["logradouro"]) if r["logradouro"] else None
    r["variantes"] = [v for v in dict.fromkeys(todas) if v and v != principal]
    return r


def resumo(r: dict) -> str:
    """Uma linha para log e teste: "RUA X | 338 | qd 8 lt 28"."""
    partes = [r.get("logradouro") or "-", str(r.get("numero") or "S/N")]
    if r.get("quadra") or r.get("lote"):
        partes.append(f"qd {r.get('quadra') or '-'} lt {r.get('lote') or '-'}")
    return " | ".join(partes)
