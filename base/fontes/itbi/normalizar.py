"""Normalização de nomes de rua e bairro para casar o ITBI com os endereços da base.

A MESMA regra está em src/lib/catalogo/lugar.ts (normalizarRua / normalizarBairro): mude as duas juntas e
regenere os casos de base/fontes/itbi/casos-normalizacao.json (testar_normalizacao.py --gerar), que os dois lados
conferem. Minúsculas, sem acento e pontuação, sem o que vem entre parênteses ("(antiga Rua 5)"), sem o tipo de
logradouro no começo (Rua, Av., Travessa...) e com as abreviações de título expandidas (Dr → doutor, Pres →
presidente...). "N. Sra.", "Nsa. Sra." e "N. S." viram "nossa senhora" (uma vez só).
"""
import re
import unicodedata

TIPOS_LOGRADOURO = {
    "r", "rua", "av", "ave", "avenida", "al", "alameda", "tv", "trav", "travessa", "pc", "pca", "praca", "est", "estr",
    "estrada", "rod", "rodovia", "lgo", "largo", "vd", "viaduto", "pq", "parque", "bc", "beco", "via", "vl", "vila",
    "vie", "viela", "ld", "ladeira", "pass", "passagem", "srv", "servidao", "q", "qd", "quadra", "conj", "cj",
}
# só no começo: "Vila" e "Parque" também são nome de rua ("Rua Vila Rica"); por isso só sai o PRIMEIRO token
TITULOS = {
    "dr": "doutor", "dra": "doutora", "prof": "professor", "profa": "professora", "gen": "general", "gal": "general",
    "cel": "coronel", "cap": "capitao", "ten": "tenente", "maj": "major", "mal": "marechal", "sgt": "sargento",
    "brig": "brigadeiro", "alm": "almirante", "cmte": "comandante", "pres": "presidente", "gov": "governador",
    "sen": "senador", "dep": "deputado", "ver": "vereador", "min": "ministro", "des": "desembargador", "eng": "engenheiro",
    "pe": "padre", "fr": "frei", "d": "dom", "sto": "santo", "sta": "santa", "s": "sao", "ns": "nossa senhora",
    "nsa": "nossa senhora", "nsra": "nossa senhora", "sra": "senhora",
}
# fim do nome da rua: número, "nº", "s/n", "km", lote, quadra, complemento...
PARADAS = {
    "n", "no", "num", "numero", "nr", "km", "lote", "lt", "quadra", "qd", "casa", "apto", "ap", "apartamento", "bloco",
    "bl", "sala", "loja", "esquina", "esq", "entre", "proximo", "prox", "conjunto", "conj", "cj",
}
ABREV_BAIRRO = {
    "jd": "jardim", "jdm": "jardim", "jard": "jardim", "vl": "vila", "pq": "parque", "res": "residencial",
    "cj": "conjunto", "conj": "conjunto", "st": "setor", "chac": "chacara", "lot": "loteamento", "bal": "balneario",
    "nsa": "nossa", "sra": "senhora", "sto": "santo", "sta": "santa", "s": "sao", "cid": "cidade",
}
# "n sra", "nsa sra", "n s de fatima" → "nossa senhora" (mas "n s n", o "s/n" de sem número, fica)
NOSSA_SENHORA = re.compile(r"\b(?:n|ns|nsa|nsra|nossa) (?:sra|senhora|s(?! n\b))\b")


def _base(texto):
    if not texto:
        return ""
    t = re.split(r"[(\[]", str(texto), maxsplit=1)[0]
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return NOSSA_SENHORA.sub("nossa senhora", t)


def normalizar_rua(texto):
    """'R. Dr. José Benedetti, nº 18' → 'doutor jose benedetti'. Para no número, em "nº", "s/n", km, lote..."""
    palavras = _base(texto).split(" ") if texto else []
    nome = []
    for i, p in enumerate(palavras):
        if not p:
            continue
        if p[0].isdigit() or (p in PARADAS and nome) or (p == "s" and i + 1 < len(palavras) and palavras[i + 1] == "n"):
            break
        nome.append(p)
    if nome and nome[0] in TIPOS_LOGRADOURO:
        nome = nome[1:]
    return " ".join(TITULOS.get(p, p) for p in nome)


def normalizar_bairro(texto):
    palavras = _base(texto).split(" ") if texto else []
    return " ".join(ABREV_BAIRRO.get(p, p) for p in palavras if p)


# "bairro" que é torre, bloco, edifício ou condomínio (o arquivo de SP mistura o complemento no bairro): fica de fora
BAIRRO_INVALIDO = re.compile(
    r"^(torre|bloco|bl|ed|edificio|edif|cond|condominio|apto|apartamento|ap|sala|loja|conjunto comercial|"
    r"vaga|box|garagem|t|unidade|un|andar|pav|pavimento|lt|qd)\b|^\d|^.$"
)


def bairro_valido(chave):
    """Chave (já normalizada) que pode ser um bairro."""
    return bool(chave) and not BAIRRO_INVALIDO.search(chave)
