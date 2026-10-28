"""
Regras da base da Luneta reproduzidas em Python (biblioteca padrão), para o exportador do PBCV.

Cada função aqui é a tradução fiel de uma função TypeScript da Luneta. A fonte da verdade é o
TypeScript: se ele mudar, mude aqui também e rode os casos compartilhados
(`casos-compartilhados.json`, conferidos dos dois lados: `pbcv.test.ts` e `testar.py`).

| Python                          | TypeScript                                             |
| ------------------------------- | ------------------------------------------------------ |
| mascarar_documentos             | base/util/lgpd.ts → mascararDocumentos                 |
| mascarar_nomes                  | base/util/lgpd.ts → mascararNomes                      |
| mascarar_dados_pessoais         | base/util/lgpd.ts → mascararDadosPessoais              |
| campo_sem_pessoa                | base/fontes/leiloesjudiciais/normalizar.ts → campoSemPessoa |
| sem_pessoa                      | base/fontes/leiloeiros/normalizar.ts → semPessoa       |
| PAPEL_DE_PESSOA                 | base/leiloeiros/validar.ts → PAPEL_DE_PESSOA           |
| comitente_parece_empresa_ou_orgao | base/leiloeiros/contrato.ts → comitentePareceEmpresaOuOrgao |
| inferir_tipo_imovel             | base/util/classificar.ts → inferirTipoImovel           |
| tipo_pela_categoria             | base/fontes/leiloesjudiciais/normalizar.ts → SUBCATEGORIAS |
| tem_partes                      | (só daqui: o "A x B" que o campoSemPessoa corta, para o exportador descartar o campo) |
| sem_html, sem_acento, texto_ou_nulo, truncar, normalizar_texto | base/util/texto.ts |

Diferenças de motor de regex (JavaScript → Python) tratadas aqui:
- `\\p{L}`, `\\p{Lu}`, `\\p{M}` não existem no `re`: as classes são montadas com `unicodedata`, com
  todo o Unicode (as letras fora do plano básico, como 𝐀, contam). O `re` testa essas letras uma faixa
  por vez, o que deixa a máscara quase 4 vezes mais lenta; por isso o módulo carrega uma segunda cópia
  de si mesmo só com o plano básico e a usa no texto sem caractere fora dele (fim do arquivo);
- o JavaScript conta e indexa o texto em unidades UTF-16; o Python, em caracteres. Nas regex com a
  flag `u` dá no mesmo; onde o TypeScript olha um `charAt` (andar para trás num nome) ou um `length`,
  um caractere fora do plano básico (𝐀, emoji) vira duas metades que não são letra, e aqui também
  (`_len16`; e as regex sem `u` de `mascarar_documentos` rodam sobre as metades);
- `\\d` e `\\s` do JavaScript são o 0-9 ASCII e um conjunto fixo de espaços: usamos as classes
  explícitas `[0-9]` e `_S` (o `\\s` do Python aceita outros caracteres);
- `\\b` do JavaScript é ASCII: as regex sem a flag `u` usam `re.ASCII`;
- lookbehind de tamanho variável (`(?<=\\p{L}[ \\t]+)`) não existe no `re`: é conferido em código.
"""

from __future__ import annotations

import importlib.util
import re
import unicodedata

# Até onde vão as classes \p{L}, \p{M}... O módulo carrega uma segunda cópia de si mesmo só com o plano básico
# (U+0000 a U+FFFF), quase 4 vezes mais rápida: o `re` testa as letras fora do plano básico uma faixa por vez. Texto
# sem caractere fora do plano básico (quase todos) usa a cópia rápida, e o resultado é o mesmo (fim do arquivo).
_LIMITE = globals().get("_LIMITE", 0x110000)

# ---------------------------------------------------------------------------
# Classes de caractere do JavaScript
# ---------------------------------------------------------------------------


def _escape(cp: int) -> str:
    return f"\\u{cp:04x}" if cp <= 0xFFFF else f"\\U{cp:08x}"


def _classes(grupos: dict[str, tuple[str, ...]]) -> dict[str, str]:
    """
    Conteúdo de classes de regex (sem os colchetes) com os caracteres das categorias Unicode, numa
    passada só por todo o Unicode (as letras fora do plano básico, como 𝐀, também contam: o `u` do
    JavaScript as trata como letra).
    """
    faixas: dict[str, list[tuple[int, int]]] = {nome: [] for nome in grupos}
    inicio = {nome: -1 for nome in grupos}
    for cp in range(_LIMITE + 1):
        categoria = unicodedata.category(chr(cp)) if cp < _LIMITE else ""
        for nome, categorias in grupos.items():
            dentro = categoria in categorias
            if dentro and inicio[nome] < 0:
                inicio[nome] = cp
            elif not dentro and inicio[nome] >= 0:
                faixas[nome].append((inicio[nome], cp - 1))
                inicio[nome] = -1
    return {
        nome: "".join(_escape(a) if a == b else f"{_escape(a)}-{_escape(b)}" for a, b in lista)
        for nome, lista in faixas.items()
    }


_CLASSES = _classes({"L": ("Lu", "Ll", "Lt", "Lm", "Lo"), "LU": ("Lu",), "LL": ("Ll",), "M": ("Mn", "Mc", "Me")})
_L = _CLASSES["L"]  # \p{L}
_LU = _CLASSES["LU"]  # \p{Lu}
_LL = _CLASSES["LL"]  # \p{Ll}
_M = _CLASSES["M"]  # \p{M}
# \s do JavaScript (igual com ou sem a flag u)
_ESPACOS_JS = "\t\n\v\f\r                  　﻿"
_S_DENTRO = "\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff"
_S = f"[{_S_DENTRO}]"

_RE_LETRA = re.compile(f"[{_L}]")
_RE_COMECA_LU = re.compile(f"[{_LU}]")


def _js(padrao: str) -> str:
    r"""Troca o \s do padrão (escrito como no TypeScript) pelos espaços do JavaScript, dentro e fora de [...]."""
    saida = []
    dentro = False
    i = 0
    while i < len(padrao):
        c = padrao[i]
        if c == "\\" and i + 1 < len(padrao):
            par = padrao[i : i + 2]
            if par == "\\s":
                saida.append(_S_DENTRO if dentro else _S)
            else:
                saida.append(par)
            i += 2
            continue
        if c == "[" and not dentro:
            dentro = True
            saida.append(c)
            # "]" logo depois de "[" ou "[^" é literal
            if padrao[i + 1 : i + 2] == "^":
                saida.append("^")
                i += 1
            if padrao[i + 1 : i + 2] == "]":
                saida.append("]")
                i += 1
        elif c == "]" and dentro:
            dentro = False
            saida.append(c)
        else:
            saida.append(c)
        i += 1
    return "".join(saida)


# ---------------------------------------------------------------------------
# Texto (base/util/texto.ts)
# ---------------------------------------------------------------------------

_ENTIDADES = {
    "nbsp": " ", "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "ordm": "º", "ordf": "ª", "deg": "°",
    "sup2": "²", "sup3": "³", "middot": "·", "ndash": "–", "mdash": "—", "hellip": "…", "laquo": "«", "raquo": "»",
    "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”", "bull": "•", "euro": "€", "sect": "§", "rsaquo": "›",
    "lsaquo": "‹", "copy": "©", "reg": "®", "trade": "™", "times": "×", "divide": "÷", "frac12": "½", "frac14": "¼",
    "frac34": "¾", "aacute": "á", "Aacute": "Á", "eacute": "é", "Eacute": "É", "iacute": "í", "Iacute": "Í",
    "oacute": "ó", "Oacute": "Ó", "uacute": "ú", "Uacute": "Ú", "agrave": "à", "Agrave": "À", "acirc": "â",
    "Acirc": "Â", "ecirc": "ê", "Ecirc": "Ê", "ocirc": "ô", "Ocirc": "Ô", "atilde": "ã", "Atilde": "Ã",
    "otilde": "õ", "Otilde": "Õ", "ccedil": "ç", "Ccedil": "Ç", "uuml": "ü", "Uuml": "Ü",
}
_RE_ENTIDADE = re.compile(r"&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);", re.IGNORECASE | re.ASCII)


def decodificar_entidades(texto: str) -> str:
    def troca(m: re.Match) -> str:
        corpo = m.group(1)
        if corpo[0] == "#":
            hexa = corpo[1] in "xX"
            try:
                codigo = int(corpo[2:] if hexa else corpo[1:], 16 if hexa else 10)
            except ValueError:
                return m.group(0)
            if codigo <= 0 or codigo > 0x10FFFF:
                return m.group(0)
            try:
                return chr(codigo)
            except ValueError:
                return m.group(0)
        return _ENTIDADES.get(corpo, m.group(0))

    return _RE_ENTIDADE.sub(troca, texto)


_RE_COMENTARIO = re.compile(r"<!--[\s\S]*?-->")
_RE_OCULTOS = re.compile(r"<(script|style|noscript)\b[\s\S]*?</\1" + _S + r"*>", re.IGNORECASE | re.ASCII)
_RE_BR = re.compile(r"<br" + _S + r"*/?>", re.IGNORECASE)
_RE_FIM_BLOCO = re.compile(r"</(p|div|li|tr|h[1-6]|ul|ol|table|section|article)" + _S + r"*>", re.IGNORECASE)
_RE_FORMATACAO = re.compile(r"</?(b|i|u|em|strong|span|font|a|small|sup|sub|mark|abbr)\b[^>]*>", re.IGNORECASE | re.ASCII)
_RE_TAG = re.compile(r"<[^>]*>")


def sem_html(texto: str) -> str:
    """Tira HTML e devolve texto legível (blocos viram quebra de linha), como `semHtml`."""
    t = _RE_COMENTARIO.sub(" ", texto)
    t = _RE_OCULTOS.sub(" ", t)
    t = _RE_BR.sub("\n", t)
    t = _RE_FIM_BLOCO.sub("\n", t)
    t = _RE_FORMATACAO.sub("", t)
    t = _RE_TAG.sub(" ", t)
    t = decodificar_entidades(t)
    t = t.replace(" ", " ")
    t = re.sub(r"[ \t\f\v\r]+", " ", t)
    t = re.sub(r" *\n[ \n]*", "\n", t)
    return t.strip(_ESPACOS_JS)


def sem_acento(texto: str) -> str:
    decomposto = unicodedata.normalize("NFD", texto)
    return unicodedata.normalize("NFC", "".join(c for c in decomposto if not unicodedata.category(c).startswith("M")))


_RE_ESPACOS = re.compile(_S + "+")


def colapsar_espacos(texto: str) -> str:
    return _RE_ESPACOS.sub(" ", texto).strip(_ESPACOS_JS)


def texto_ou_nulo(valor: object) -> str | None:
    if valor is None:
        return None
    texto = colapsar_espacos(str(valor))
    return texto or None


def normalizar_texto(texto: str) -> str:
    return colapsar_espacos(sem_acento(sem_html(texto)).lower())


def truncar(texto: str, maximo: int) -> str:
    """Corta em `maximo` caracteres, sem quebrar palavra quando der, e acrescenta "…"."""
    if len(texto) <= maximo:
        return texto
    corte = texto[: max(0, maximo - 1)]
    ultimo = corte.rfind(" ")
    base = corte[:ultimo] if ultimo > maximo * 0.6 else corte
    return base.rstrip(_ESPACOS_JS) + "…"


# ---------------------------------------------------------------------------
# Documentos, contatos e IP (base/util/lgpd.ts)
# ---------------------------------------------------------------------------

MASCARA_NOME = "[NOME]"

_CPF_FORMATADO = re.compile(r"(?<![0-9.])[0-9]{3}\.[0-9]{3}\.[0-9]{3}" + _S + "?-" + _S + "?[0-9]{2}(?![0-9])")
_CNPJ_FORMATADO = re.compile(r"(?<![0-9])[0-9]{2}\.[0-9]{3}\.[0-9]{3}" + _S + "?/" + _S + "?[0-9]{4}" + _S + "?-" + _S + "?[0-9]{2}(?![0-9])")
_CPF_ROTULADO = re.compile(_js(r"(\bCPF(?:/MF)?\b[^\d\n]{0,25}?)\d[\d.\s-]{9,13}\d(?!\d)"), re.IGNORECASE | re.ASCII)
_CNPJ_ROTULADO = re.compile(_js(r"(\bCNPJ(?:/MF)?\b[^\d\n]{0,25}?)\d[\d.\s/-]{12,17}\d(?!\d)"), re.IGNORECASE | re.ASCII)
_RG_ROTULADO = re.compile(
    _js(r"(\b(?:RG|R\.G\.|C\.?I\.?|carteira de identidade)\b[^\d\n]{0,15}?)[\dXx][\d.\-\sXx/]{4,}[\dXx](?:\s*[-/]?\s*(?:SSP|SDS|DETRAN|IFP|PC)[\s/-]*[A-Z]{0,2}\b)?"),
    re.IGNORECASE | re.ASCII,
)
_DIGITOS_SOLTOS = re.compile(r"(?<![0-9.,/-])([0-9]{14}|[0-9]{11})(?![0-9.,/-]?[0-9])")
_EMAIL = re.compile(f"[{_L}0-9._%+\\-]+@[{_L}0-9\\-]+(?:\\.[{_L}0-9\\-]+)+")
_IPV4 = re.compile(r"(?<![0-9.])([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})(?![0-9.]|,[0-9])")


def _digito_verificador(digitos: str, pesos: list[int]) -> int:
    soma = sum(int(digitos[i]) * p for i, p in enumerate(pesos))
    resto = soma % 11
    return 0 if resto < 2 else 11 - resto


def cpf_valido(digitos: str) -> bool:
    if not re.fullmatch(r"[0-9]{11}", digitos) or re.fullmatch(r"([0-9])\1{10}", digitos):
        return False
    d1 = _digito_verificador(digitos, [10, 9, 8, 7, 6, 5, 4, 3, 2])
    d2 = _digito_verificador(digitos, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
    return d1 == int(digitos[9]) and d2 == int(digitos[10])


def cnpj_valido(digitos: str) -> bool:
    if not re.fullmatch(r"[0-9]{14}", digitos) or re.fullmatch(r"([0-9])\1{13}", digitos):
        return False
    d1 = _digito_verificador(digitos, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    d2 = _digito_verificador(digitos, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return d1 == int(digitos[12]) and d2 == int(digitos[13])


def _digitos_soltos(m: re.Match) -> str:
    d = m.group(0)
    if len(d) == 11 and cpf_valido(d):
        return "[CPF]"
    if len(d) == 14 and cnpj_valido(d):
        return "[CNPJ]"
    return d


def _ipv4(m: re.Match) -> str:
    return "[IP]" if all(int(o) <= 255 for o in m.groups()) else m.group(0)


_RE_ASTRAL = re.compile("[\U00010000-\U0010ffff]")


def _em_utf16(texto: str) -> str:
    """Cada caractere fora do plano básico vira as duas metades UTF-16, como o JavaScript as vê."""
    def metades(m: re.Match) -> str:
        cp = ord(m.group(0)) - 0x10000
        return chr(0xD800 + (cp >> 10)) + chr(0xDC00 + (cp & 0x3FF))

    return _RE_ASTRAL.sub(metades, texto)


def _len16(texto: str) -> int:
    """`length` do JavaScript (unidades UTF-16): um caractere fora do plano básico conta 2."""
    return len(texto) + len(_RE_ASTRAL.findall(texto))


def _de_utf16(texto: str) -> str:
    return texto.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "surrogatepass")


def mascarar_documentos(texto: str) -> str:
    """CPF, CNPJ, RG, e-mail e IPv4 → "[CPF]", "[CNPJ]", "[RG]", "[E-MAIL]", "[IP]"."""
    t = _EMAIL.sub("[E-MAIL]", texto)
    # As regex abaixo não têm a flag `u` no TypeScript: contam unidades UTF-16 ("[^\d\n]{0,25}" entre o
    # rótulo e o número). Com emoji ou 𝐀 no texto, elas rodam sobre a mesma visão em metades.
    astral = _RE_ASTRAL.search(t) is not None
    if astral:
        t = _em_utf16(t)
    t = _CNPJ_FORMATADO.sub("[CNPJ]", t)
    t = _CPF_FORMATADO.sub("[CPF]", t)
    t = _CNPJ_ROTULADO.sub(lambda m: m.group(1) + "[CNPJ]", t)
    t = _CPF_ROTULADO.sub(lambda m: m.group(1) + "[CPF]", t)
    t = _RG_ROTULADO.sub(lambda m: m.group(1) + "[RG]", t)
    t = _DIGITOS_SOLTOS.sub(_digitos_soltos, t)
    t = _IPV4.sub(_ipv4, t)
    return _de_utf16(t) if astral else t


# ---------------------------------------------------------------------------
# Nomes (base/util/lgpd.ts)
# ---------------------------------------------------------------------------

_PAPEIS = [
    "executad[oa]s?", "exequentes?", "devedor(?:a|es|as)?", "fiduciantes?", "deposit[áa]ri[oa]s?",
    "requerentes?", "requerid[oa]s?", "r[ée]us?", "r[ée]s", "autor(?:a|es|as)?", "credor(?:a|es|as)?",
    "copropriet[áa]ri[oa]s?", "propriet[áa]ri[oa]s?", "cond[ôo]min[oa]s?", r"promitentes?(?:\s+(?:comprador|vendedor)(?:a|es|as)?)?",
    r"compromiss[áa]ri[oa]s?(?:\s+comprador(?:a|es|as)?)?", "mutu[áa]ri[oa]s?", "inventariantes?",
    "herdeir[oa]s?", "c[ôo]njuges?", "meeir[oa]s?", "interessad[oa]s?", "avalistas?", "fiador(?:a|es|as)?",
    "s[óo]ci[oa]s?", "titular(?:es)?", "ocupantes?", "possuidor(?:a|es|as)?", "locat[áa]ri[oa]s?",
    "inquilin[oa]s?", "outorgantes?", "outorgad[oa]s?", "embargantes?", "embargad[oa]s?",
    "impugnantes?", "agravantes?", "agravad[oa]s?", "apelantes?", "apelad[oa]s?", "reclamantes?",
    "reclamad[oa]s?", "intimad[oa]s?", "citad[oa]s?",
    "usufrutu[áa]ri[oa]s?", "nu-propriet[áa]ri[oa]s?", "adquirentes?", "transmitentes?", "doador(?:a|es|as)?",
    "donat[áa]ri[oa]s?", "cedentes?", "cession[áa]ri[oa]s?", "anuentes?",
    r"em\s+favor\s+de", r"a\s+favor\s+de", r"em\s+benef[íi]cio\s+de",
    r"em\s+face\s+de", r"movid[oa]\s+por", r"propost[oa]\s+por", r"ajuizad[oa]\s+por", "contra",
    r"de\s+propriedade\s+de", r"pertencente\s+a", r"em\s+nome\s+de", r"titularidade\s+d[aeo]s?",
    r"ocupad[oa]s?\s+por", r"na\s+posse\s+de", r"em\s+poder\s+de", r"locad[oa]s?\s+(?:para|a|ao|[àá])",
    r"resid(?:e|em)\s+no\s+im[óo]vel", "morador(?:a|es|as)?",
    r"sr\.?", r"sra\.?", r"srs\.?", r"sras\.?", r"srta\.?",
]
_PAPEIS_COM_SEPARADOR = [
    "arrematantes?", "licitantes?", "compradore?s?", "compradoras?", "vendedore?s?", "vendedoras?",
    "proponentes?", "vencedor(?:a|es|as)?", "participantes?", "partes?", "advogad[oa]s?", "nome",
]
_PAPEIS_RESULTADO = [
    r"arrematad[oa]s?(?:\s+em\s+(?:leil[ãa]o|hasta\s+p[úu]blica|pra[çc]a))?\s+(?:por|pel[oa]s?)",
    r"adjudicad[oa]s?\s+(?:a|ao|aos|[àá]|[àá]s|em\s+favor\s+de|para|por|pel[oa]s?)",
    r"adquirid[oa]s?\s+(?:por|pel[oa]s?)",
    "vencedor(?:a|es|as)?", "arrematantes?", "adjudicat[áa]ri[oa]s?",
]


def _regex_papeis(lista: list[str]) -> re.Pattern:
    return re.compile(f"(?<![{_L}{_M}])(?:{_js('|'.join(lista))})(?![{_L}{_M}])", re.IGNORECASE)


_RE_PAPEIS = _regex_papeis(_PAPEIS)
_RE_PAPEIS_SEPARADOR = _regex_papeis(_PAPEIS_COM_SEPARADOR)
_RE_PAPEIS_RESULTADO = _regex_papeis(_PAPEIS_RESULTADO)
_RE_PALAVRA_PAPEL = re.compile(f"(?:{_js('|'.join(_PAPEIS + _PAPEIS_COM_SEPARADOR))})", re.IGNORECASE)

_PARTICULAS = {"de", "da", "do", "das", "dos", "e", "d'", "di", "del", "du", "van", "von", "y"}

_NAO_NOMES = set(
    (
        "A O AS OS AO AOS E EM NO NA NOS NAS DE DA DO DAS DOS POR PELO PELA PELOS PELAS PARA COM SEM QUE SE "
        "SUA SEU SUAS SEUS NAO SIM FICA FICAM FICARA FICARAO DEVE DEVEM DEVERA DEVERAO PODE PODEM PODERA PODERAO "
        "SERA SERAO ESTA ESTAO ARCA ARCARA ARCARAO PAGA PAGARA RESPONSAVEL RESPONSAVEIS CONFORME TERMOS ART "
        "ARTIGO LEI CPF CNPJ RG OAB PROCESSO AUTOS NUMERO OUTROS OUTRAS OUTRO OUTRA TODOS TODAS INTIMADO INTIMADA "
        "INTIMADOS INTIMADAS INTIMACAO CITADO CITADA REPRESENTADO REPRESENTADA QUALIFICADO QUALIFICADA ACIMA "
        "ABAIXO SUPRA INSCRITO INSCRITA PORTADOR PORTADORA BRASILEIRO BRASILEIRA BRASILEIROS CASADO CASADA "
        "SOLTEIRO SOLTEIRA DIVORCIADO DIVORCIADA VIUVO VIUVA SEPARADO SEPARADA ACERCA SOBRE QUANTO COMO BEM BENS "
        "IMOVEL IMOVEIS LOTE VALOR EDITAL LEILAO PRACA DATA NOME ATE APOS ANTES DURANTE MEDIANTE ATRAVES "
        "CASO FIDUCIARIO FIDUCIARIA NOTIFICADO NOTIFICADA NOTIFICACAO CIENTE CIENTES VIA INFORMA INFORMADO "
        "EVENTUAIS EVENTUAL TAMBEM AINDA JA HA "
        "OCUPADO OCUPADA OCUPADOS OCUPADAS DESOCUPADO DESOCUPADA DESOCUPADOS DESOCUPADAS VAGO VAGA VAZIO VAZIA "
        "LIVRE TERCEIRO TERCEIRA TERCEIROS TERCEIRAS INVASOR INVASORES INVADIDO INVADIDA LOCADO LOCADA ALUGADO "
        "ALUGADA FAMILIA FAMILIARES PROPRIO PROPRIA PROPRIOS PROPRIAS DESCONHECIDO DESCONHECIDA DESCONHECIDOS "
        "INFORMACAO INFORMACOES NENHUM NENHUMA OCUPACAO SITUACAO ATUAL ATUALMENTE RESIDENCIAL COMERCIAL CONSTA CONSTAM"
    ).split(" ")
)

_PALAVRA = re.compile(f"[{_L}][{_L}{_M}'’.\\-]*")
_ESPACO_LINHA = re.compile(r"[ \t]+")
_VIRGULA = re.compile(r"[ \t]*,[ \t]*")
_SUFIXO_PLURAL = re.compile(r"(?:[ \t]*\((?:a|s|as|es|os|o|a/s|s/as)\))+", re.IGNORECASE)
_SEPARADOR = re.compile(r"[ \t]*[:–—=\-][ \t]*\n?[ \t]*")
_PREFIXOS = re.compile(
    r"(?:(?:o|a|os|as|de|da|do|das|dos|sr\.?|sra\.?|srs\.?|sras\.?|srta\.?|dr\.?|dra\.?|esp[óo]lio[ \t]+de|massa[ \t]+falida[ \t]+de)[ \t]+)*",
    re.IGNORECASE,
)
_LIGACAO = re.compile(r"(?:\.?[ \t]*[,;][ \t]*|[ \t]+(?:e|E)[ \t]+)")
_SUFIXO_EMPRESA = re.compile(f"[ \\t]*(?:[\\-–][ \\t]*)?(?:ME|EPP|EIRELI|MEI|LTDA\\.?|S/A|S\\.A\\.?)(?![{_L}0-9])")
_ANCORAS_APOS_NOME = re.compile(
    _js(
        f"[ \\t]*[,(–\\-]?[ \\t]*(?:inscrit[oa]s?\\s+no\\s+|portador(?:a|es|as)?\\s+d[oa]\\s+)?(?:CPF|\\[CPF\\]|RG(?![{_L}])|\\[RG\\]|brasileir[oa]s?|casad[oa]s?|solteir[oa]s?|divorciad[oa]s?|vi[úu]v[oa]s?|separad[oa]s?\\s+judicialmente|nascid[oa]s?\\s+em|filh[oa]\\s+de)(?![{_L}])"
    ),
    re.IGNORECASE,
)
_ANCORAS_POSSE = re.compile(
    f"[ \\t]*,[ \\t]*(?:irm[ãa](?:o|os|s)?|espos[oa]|marido|companheir[oa]|genitor(?:a)?|m[ãa]e|pai|sogr[oa]|genro|nora|cunhad[oa]|filh[oa]s?|net[oa]s?|sobrinh[oa]s?|ti[oa]s?|prim[oa]s?|enteado|enteada)[ \\t]+d[oa]s?(?![{_L}])"
    f"|[ \\t]*,[ \\t]*ex-[{_L}]+"
    f"|[ \\t]+(?:e[ \\t]+(?:sua[ \\t]+|seus?[ \\t]+)?(?:fam[íi]lia|filh[oa]s|espos[oa]|marido|companheir[oa])[ \\t]+)?(?:ocupa|ocupam|reside|residem|mora|moram|habita|habitam)[ \\t]+(?:n?[oa][ \\t]+)?(?:im[óo]vel|bem|local|casa|apartamento|unidade)(?![{_L}])",
    re.IGNORECASE,
)
_GATILHOS_POSSE = [
    r"ocupad[oa]s?\s+pel[oa]s?", r"ocupam?\s+(?:o|a)\s+(?:im[óo]vel|bem|unidade|apartamento|casa|local|resid[êe]ncia)",
    r"resid(?:e|em)\s+n[oa]\s+(?:bem|unidade|apartamento|casa|local|resid[êe]ncia)",
    r"moram?\s+n[oa]\s+(?:im[óo]vel|bem|unidade|apartamento|casa|local)", r"habitad[oa]s?\s+por", r"utilizad[oa]s?\s+por",
    r"moradia\s+(?:para|de|d[oa]s?)", r"alugad[oa]s?\s+(?:para|a|ao|[àá])", r"cedid[oa]s?\s+(?:para|a|ao|[àá])",
    r"(?:de\s+)?responsabilidade\s+d[eoa]s?", r"(?:movid|propost|ajuizad)[oa]s\s+por",
    "irm[ãa](?:o|os|s)?", "espos[oa]s?", "marido", "companheir[oa]s?", "conviventes?", "genitor(?:a|es)?", "m[ãa]e",
    "pai", "sogr[oa]s?", "genro", "nora", "cunhad[oa]s?", "enteado", "enteada",
]
_ROTULOS_POSSE = [r"ocupa[çc][ãa]o(?:\s+atual)?", r"situa[çc][ãa]o\s+(?:de|da)\s+ocupa[çc][ãa]o"]
_RE_GATILHOS_POSSE = _regex_papeis(_GATILHOS_POSSE)
_RE_ROTULOS_POSSE = _regex_papeis(_ROTULOS_POSSE)
_RE_PALAVRA_POSSE = re.compile(f"(?:{_js('|'.join(_GATILHOS_POSSE + _ROTULOS_POSSE))})", re.IGNORECASE)
_RE_EX = re.compile(r"ex-", re.IGNORECASE)
_RE_PONTOS_FINAIS = re.compile(r"\.+\Z")
_RE_CHAR_PALAVRA = re.compile(f"[{_L}{_M}'’.\\-]")
_RE_DUAS_LETRAS_E_PONTO = re.compile(f"[{_L}]{{2}}\\.+\\Z")
# "A x B": o lookbehind (?<=\p{L}[ \t]+) do TypeScript é conferido em `_separadores_de_partes`.
_SEPARADOR_PARTES = re.compile(f"(?<=[ \\t])(?:x|X|vs\\.?|VS\\.?|versus|VERSUS)(?=[ \\t]+[{_LU}])")
_RE_FIM_DE_FRASE = re.compile(r"[.!?;:]\Z")


def _separadores_de_partes(texto: str):
    """Ocorrências de " x ", " vs. " entre duas palavras (letra, espaços, separador, espaços, maiúscula)."""
    for m in _SEPARADOR_PARTES.finditer(texto):
        j = m.start()
        while j > 0 and texto[j - 1] in " \t":
            j -= 1
        if j < m.start() and j > 0 and _RE_LETRA.match(texto[j - 1]):
            yield m


def tem_partes(texto: str) -> bool:
    """Só do exportador (não há no TypeScript): o texto tem "A x B" ou "A vs. B" entre palavras?"""
    return next(_separadores_de_partes(texto), None) is not None


def _sem_pontos_finais(palavra: str) -> str:
    return _RE_PONTOS_FINAIS.sub("", palavra)


def _classificar(palavra: str) -> str:
    sem_ponto = _sem_pontos_finais(palavra)
    if sem_ponto.lower() in _PARTICULAS:
        return "particula"
    if not sem_ponto or not _RE_COMECA_LU.match(sem_ponto[0]):
        return "outra"
    if _RE_EX.match(sem_ponto):
        return "outra"
    if _len16(sem_ponto) < 2 and not palavra.endswith("."):
        return "outra"
    if sem_acento(sem_ponto).upper() in _NAO_NOMES:
        return "outra"
    if _RE_PALAVRA_PAPEL.fullmatch(sem_ponto) or _RE_PALAVRA_PAPEL.fullmatch(palavra):
        return "outra"
    if _RE_PALAVRA_POSSE.fullmatch(sem_ponto):
        return "outra"
    return "nome"


def _fim_da_palavra(palavra: str, inicio: int) -> int:
    sem_ponto = _sem_pontos_finais(palavra)
    return inicio + (len(sem_ponto) if _len16(sem_ponto) >= 2 else len(palavra))


class _Trecho:
    __slots__ = ("inicio", "fim", "palavras")

    def __init__(self, inicio: int, fim: int, palavras: int):
        self.inicio = inicio
        self.fim = fim
        self.palavras = palavras


def _nome_adiante(texto: str, pos: int) -> _Trecho | None:
    cursor = pos
    inicio = fim = -1
    palavras = 0
    while True:
        achado = _PALAVRA.match(texto, cursor)
        if not achado:
            break
        classe = _classificar(achado.group(0))
        if classe == "outra":
            break
        if classe == "particula" and palavras == 0:
            break
        depois = achado.end()
        if classe == "nome":
            if inicio < 0:
                inicio = achado.start()
            fim = _fim_da_palavra(achado.group(0), achado.start())
            palavras += 1
            if fim < depois:
                break
        espaco = _ESPACO_LINHA.match(texto, depois)
        if not espaco:
            break
        cursor = espaco.end()
    return _Trecho(inicio, fim, palavras) if palavras > 0 else None


def _com_sufixo(texto: str, trecho: _Trecho) -> _Trecho:
    sufixo = _SUFIXO_EMPRESA.match(texto, trecho.fim)
    return _Trecho(trecho.inicio, sufixo.end(), trecho.palavras) if sufixo else trecho


def _nomes_adiante(texto: str, pos: int, minimo: int) -> _Trecho | None:
    primeiro = _nome_adiante(texto, pos)
    if not primeiro or primeiro.palavras < minimo:
        return None
    total = _com_sufixo(texto, primeiro)
    while True:
        ligacao = _LIGACAO.match(texto, total.fim)
        if not ligacao:
            break
        proximo = _nome_adiante(texto, ligacao.end())
        if not proximo or proximo.palavras < minimo:
            break
        estendido = _com_sufixo(texto, proximo)
        total.fim = estendido.fim
        total.palavras += estendido.palavras
    return total


def _nome_atras(texto: str, limite: int) -> _Trecho | None:
    fim = limite
    cursor = limite
    inicio = fim_nome = -1
    palavras = 0
    while True:
        fim_palavra = cursor
        while fim_palavra > 0 and texto[fim_palavra - 1] in " \t":
            fim_palavra -= 1
        if fim_palavra == cursor and cursor != fim:
            break
        comeco = fim_palavra
        # charAt do TypeScript: fora do plano básico é meia unidade UTF-16, que nunca é letra
        while comeco > 0 and texto[comeco - 1] <= "￿" and _RE_CHAR_PALAVRA.match(texto[comeco - 1]):
            comeco -= 1
        if comeco == fim_palavra:
            break
        palavra = texto[comeco:fim_palavra]
        if not _RE_LETRA.match(palavra):
            break
        if cursor != fim and _RE_DUAS_LETRAS_E_PONTO.search(palavra):
            break
        classe = _classificar(palavra)
        if classe == "outra":
            break
        if classe == "nome":
            if fim_nome < 0:
                fim_nome = fim_palavra
            inicio = comeco
            palavras += 1
        cursor = comeco
    return _Trecho(inicio, fim_nome, palavras) if palavras > 0 else None


def _intervalos_de_nome(texto: str) -> list[tuple[int, int]]:
    intervalos: list[tuple[int, int]] = []

    def apos_papel(regex: re.Pattern, separador_obrigatorio: bool) -> None:
        for achado in regex.finditer(texto):
            pos = achado.end()
            plural = _SUFIXO_PLURAL.match(texto, pos)
            if plural:
                pos = plural.end()
            separador = _SEPARADOR.match(texto, pos)
            if separador:
                pos = separador.end()
            elif separador_obrigatorio:
                continue
            else:
                espaco = _VIRGULA.match(texto, pos) or _ESPACO_LINHA.match(texto, pos)
                if not espaco:
                    continue
                pos = espaco.end()
            prefixos = _PREFIXOS.match(texto, pos)
            if prefixos:
                pos = prefixos.end()
            nomes = _nomes_adiante(texto, pos, 1 if separador else 2)
            if nomes:
                intervalos.append((nomes.inicio, nomes.fim))

    apos_papel(_RE_PAPEIS, False)
    apos_papel(_RE_PAPEIS_SEPARADOR, True)
    apos_papel(_RE_PAPEIS_RESULTADO, False)

    for achado in _ANCORAS_APOS_NOME.finditer(texto):
        nome = _nome_atras(texto, achado.start())
        if nome and nome.palavras >= 2:
            intervalos.append((nome.inicio, nome.fim))

    for achado in _separadores_de_partes(texto):
        esquerda = _nome_atras(texto, achado.start())
        pos_direita = achado.end()
        espaco = _ESPACO_LINHA.match(texto, pos_direita)
        if espaco:
            pos_direita = espaco.end()
        direita = _nome_adiante(texto, pos_direita)
        if esquerda and direita and esquerda.palavras >= 2 and direita.palavras >= 2:
            intervalos.append((esquerda.inicio, esquerda.fim))
            intervalos.append((direita.inicio, direita.fim))

    apos_papel(_RE_GATILHOS_POSSE, False)
    apos_papel(_RE_ROTULOS_POSSE, True)
    for achado in _ANCORAS_POSSE.finditer(texto):
        if _RE_FIM_DE_FRASE.search(texto[: achado.start()].rstrip(_ESPACOS_JS)):
            continue
        nome = _nome_atras(texto, achado.start())
        if nome and nome.palavras >= 2:
            intervalos.append((nome.inicio, nome.fim))
    return intervalos


def _aplicar_mascara(texto: str, intervalos: list[tuple[int, int]], mascara: str) -> str:
    if not intervalos:
        return texto
    saida = []
    cursor = 0
    for inicio, fim in sorted(intervalos, key=lambda x: x[0]):
        if fim <= cursor:
            continue
        if inicio >= cursor:
            saida.append(texto[cursor:inicio])
            saida.append(mascara)
        cursor = max(cursor, fim)
    saida.append(texto[cursor:])
    return "".join(saida)


def mascarar_nomes(texto: str) -> str:
    """Nomes de pessoas em contexto de parte, papel ou tratamento → "[NOME]"."""
    return _aplicar_mascara(texto, _intervalos_de_nome(texto), MASCARA_NOME)


def mascarar_dados_pessoais(texto: str) -> str:
    """Documentos, contatos, IP e nomes. É a máscara que a Luneta aplica ao gravar títulos e descrições."""
    return mascarar_nomes(mascarar_documentos(texto))


# ---------------------------------------------------------------------------
# Campos que vão ao site sem a máscara de nomes (endereço, bairro, cartório, comitente)
# ---------------------------------------------------------------------------

_PESSOA_NO_CAMPO = re.compile(
    _js(
        f"(?<![{_L}{_M}])(?:(?:"
        + "|".join([
            "deposit[áa]ri", "exequent", "executad", "requerent", "requerid", "reclamant", "reclamad", "embargant", "embargad",
            "agravant", "agravad", "apelant", "apelad", "impugnant", "interessad", "credor", "devedor", "fiduciant",
            "copropriet[áa]ri", "propriet[áa]ri", "possuidor", "ocupant", "ocupad[oa]", "morador", "locat[áa]ri", "locad[oa]",
            "inquilin", "usufrutu[áa]ri", "adquirent", "transmitent", "herdeir", "c[ôo]njuge", "esp[óo]li", "inventariant",
            "meeir", "avalista", "fiador", "outorgant", "outorgad", "cedent", "cession[áa]ri", "promitent", "compromiss[áa]ri",
        ])
        + f")[{_L}]*|(?:"
        + "|".join([
            "autor(?:a|es|as)?", "r[ée]u", "r[ée]us", "r[ée]s", "contra", "s[óo]ci[oa]s?", "titular(?:es)?", "reside(?:m)?",
            "residentes?", r"massa\s+falida", r"de\s+propriedade", r"em\s+nome", "pertencente", r"na\s+posse", r"em\s+poder",
            r"em\s+favor", r"a\s+favor", r"em\s+face", r"movid[oa]\s+por", r"propost[oa]\s+por", r"ajuizad[oa]\s+por",
        ])
        + f")(?![{_L}{_M}]))"
    ),
    re.IGNORECASE,
)
_RE_PONTUACAO_FINAL = re.compile(_js(r"[\s.,;:(–—-]+\Z"))


def campo_sem_pessoa(valor: str | None) -> str | None:
    """Corta onde começa uma pessoa (papel, dono, ocupante, "A x B"); descarta se a máscara ainda mudar algo."""
    if not valor:
        return None
    corte = len(valor)
    achado = _PESSOA_NO_CAMPO.search(valor)
    if achado and achado.start() < corte:
        corte = achado.start()
    partes = next(_separadores_de_partes(valor), None)
    if partes and partes.start() < corte:
        corte = partes.start()
    limpo = texto_ou_nulo(_RE_PONTUACAO_FINAL.sub("", valor[:corte]))
    if not limpo or _len16(limpo) < 2 or not _RE_LETRA.search(limpo):
        return None
    return limpo if mascarar_dados_pessoais(limpo) == limpo else None


def sem_pessoa(valor: str | None) -> str | None:
    """Como o conector dos leiloeiros grava endereço, bairro, cartório e comitente (semPessoa)."""
    texto = texto_ou_nulo(valor)
    limpo = campo_sem_pessoa(texto)
    if not texto or limpo is None:
        return None
    return texto if limpo == _RE_PONTUACAO_FINAL.sub("", texto) else limpo


# Papel de pessoa num campo de lugar ou de comitente: o validador recusa o lote (erro).
PAPEL_DE_PESSOA = re.compile(
    _js(
        f"(?<![{_L}])(?:propriet[áa]ri[oa]s?|executad[oa]s?|exequentes?|devedor(?:a|es|as)?|fiduciantes?|r[ée]us?|r[ée]s|autor(?:a|es|as)?|arrematantes?|depositári[oa]s?|ocupad[oa]s?\\s+(?:por|pel[oa])|reside(?:m|nte)?|c[ôo]njuges?|herdeir[oa]s?|esp[óo]lio|em\\s+face\\s+de|em\\s+nome\\s+de|de\\s+propriedade\\s+de)(?![{_L}])"
    ),
    re.IGNORECASE,
)

_MARCA_PJ = re.compile(
    _js(
        f"(?<![{_L}])(?:s\\.?\\s?/?a\\.?|ltda|eireli|me|epp|banco|bank|caixa|vara|tribunal|tj[a-z]{{2}}|tr[tf][0-9]*|ju[ií]zo|comarca|justi[çc]a|f[óo]rum|prefeitura|munic[íi]pio|estado|uni[ãa]o|governo|secretaria|minist[ée]rio|inss|receita|fazenda|cooperativa|sicoob|sicredi|cr[ée]dito|financeira|fundo|funda[çc][ãa]o|associa[çc][ãa]o|condom[íi]nio|construtora|incorporadora|empreendimentos?|participa[çc][õo]es|holding|companhia|cia|seguradora|administradora|igreja|instituto|universidade|autarquia|empresa|sociedade|cons[óo]rcio|massa\\s+falida)(?![{_L}])"
    ),
    re.IGNORECASE,
)


def comitente_parece_empresa_ou_orgao(nome: str) -> bool:
    return bool(_MARCA_PJ.search(nome))


# ---------------------------------------------------------------------------
# Tipo do imóvel (base/util/classificar.ts e a régua de subcategoria da Leilões Judiciais)
# ---------------------------------------------------------------------------

_REGRAS_TIPO = [
    (re.compile(r"\b(vaga|box|boxe|garagem)\b", re.ASCII), "vaga"),
    (re.compile(r"\b(apartamento|apto|flat|cobertura|kitnet|kitinete|kitchenette|loft|studio|duplex|triplex)\b", re.ASCII), "apartamento"),
    (re.compile(r"\b(imovel rural|rural|fazenda|sitio|chacara|gleba(?! urbana)|haras|granja)\b", re.ASCII), "rural"),
    (re.compile(r"\b(sala|loja|galpao|armazem|deposito|predio|edificio|comercial|escritorio|hotel|pousada|posto|industria|industrial|barracao)\b", re.ASCII), "comercial"),
    (re.compile(r"\b(casa|sobrado|residencia|moradia|bangalo|geminada)\b", re.ASCII), "casa"),
    (re.compile(r"\b(terreno|lote|gleba urbana|quinhao)\b", re.ASCII), "terreno"),
]
_RE_INICIO_TIPO = re.compile("[,;:–(]|\\." + _S)


def _tipo_mais_cedo(texto: str) -> str | None:
    melhor: tuple[int, str] | None = None
    for regex, tipo in _REGRAS_TIPO:
        achado = regex.search(texto)
        if achado and (melhor is None or achado.start() < melhor[0]):
            melhor = (achado.start(), tipo)
    return melhor[1] if melhor else None


def inferir_tipo_imovel(texto: str | None) -> str:
    """Tipo pela palavra de tipo que aparece primeiro (primeiro no trecho antes da vírgula, depois no todo)."""
    if not texto:
        return "outro"
    normal = normalizar_texto(texto)
    inicio = _RE_INICIO_TIPO.split(normal)[0]
    return _tipo_mais_cedo(inicio) or _tipo_mais_cedo(normal) or "outro"


_SUBCATEGORIAS = [
    (re.compile(r"apartament"), "apartamento"),
    (re.compile(r"\bcasas?\b", re.ASCII), "casa"),
    (re.compile(r"terren|\blotes?\b", re.ASCII), "terreno"),
    (re.compile(r"fazend|sitio|chacar|rura"), "rural"),
    (re.compile(r"vaga|garage|\bbox", re.ASCII), "vaga"),
    (re.compile(r"comerc|industr|galp|\bsalas?\b|\blojas?\b|predio", re.ASCII), "comercial"),
]


def tipo_pela_categoria(categoria: str | None) -> str | None:
    """Tipo pela categoria da fonte ("Apartamentos", "Comerciais"...), como a subcategoria da Leilões Judiciais."""
    sub = normalizar_texto(categoria or "")
    for regex, tipo in _SUBCATEGORIAS:
        if regex.search(sub):
            return tipo
    return None


# ---------------------------------------------------------------------------
# A cópia rápida (só o plano básico) para o texto sem caractere fora dele
# ---------------------------------------------------------------------------


def _carregar_copia_rapida():
    especificacao = importlib.util.spec_from_file_location(f"{__name__}_plano_basico", __file__)
    copia = importlib.util.module_from_spec(especificacao)
    copia._LIMITE = 0x10000  # lido no topo do arquivo
    especificacao.loader.exec_module(copia)
    return copia


def _despachar(nome: str):
    lenta = globals()[nome]
    rapida = getattr(_COPIA_RAPIDA, nome)

    def funcao(texto):
        return lenta(texto) if isinstance(texto, str) and _RE_ASTRAL.search(texto) else rapida(texto)

    funcao.__name__ = nome
    funcao.__doc__ = lenta.__doc__
    return funcao


if _LIMITE > 0x10000:
    _COPIA_RAPIDA = _carregar_copia_rapida()
    for _nome in ("mascarar_documentos", "mascarar_nomes", "mascarar_dados_pessoais", "campo_sem_pessoa", "sem_pessoa"):
        globals()[_nome] = _despachar(_nome)
