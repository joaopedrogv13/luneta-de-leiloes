"""
Exportador do PBCV (Coletor de Leilões do dono, em Python) para a Luneta: lê a base `leiloes.db` do PBCV
(SÓ PARA LEITURA) e grava o JSONL do contrato dos leiloeiros (base/leiloeiros/CONTRATO.md).

    python base/leiloeiros/pbcv/exportar.py --banco C:\\caminho\\luneta-base\\leiloes.db
    python base/leiloeiros/pbcv/exportar.py --banco leiloes.db --saida x.jsonl --fontes portalzuk.com.br,megaleiloes
    python base/leiloeiros/pbcv/exportar.py --banco leiloes.db --desde 2026-09-25 --frequencia semanal

Sem --saida, grava coletas-pc/leiloeiros/pbcv-luneta.jsonl (na pasta do projeto), que o envio da coleta no PC
(`node base/coleta-pc.mjs --so-publicar`) leva ao branch coletas-dados; o resumo vai ao lado
(pbcv-resumo.json). Guia para o dono: base/leiloeiros/pbcv/README.md.

Só a biblioteca padrão do Python 3.9+. O banco é aberto com `mode=ro`: nada é escrito nele.

O que sai (uma carga por arquivo, um leiloeiro por fonte do PBCV):
- uma linha de coleta por fonte (domínio) com pelo menos um imóvel exportado. A carga é completa só
  quando a última coleta da fonte no PBCV (`coleta_fonte`) foi `ok` e trouxe lotes; a saúde vem da última
  coleta (ok, parcial para incompleta/suspeita, bloqueado para 403/429/Cloudflare, quebrado para os outros erros);
- uma linha por imóvel À VENDA DE VERDADE (`motivo_de_fora`): ativo no PBCV, visto na última coleta da
  fonte que trouxe lotes (ok, suspeita ou incompleta) e com a situação aberto ou agendado. Quem é imóvel diz
  a regra da análise (regra_imovel.py: título, categoria, começo da descrição e tipo_bem), não o `tipo_bem`
  sozinho. Lote sem cidade e UF (nem na geo_lote) fica de fora: o contrato exige as duas. O suspenso com
  praça futura vai como "suspenso", só para a Luneta tirá-lo do site.
- o número do imóvel na Caixa (13 dígitos, achado na URL, no título ou na descrição) vai em
  `registro_imovel.numero_caixa`: é a chave que acha o mesmo imóvel na Caixa (a matrícula quase não ajuda).

LGPD: `executado` e `exequente` NUNCA saem. Os nomes dessas colunas são mascarados no título, na
descrição e no título do leilão, e depois vem a mesma máscara da Luneta (regras_luneta.py, tradução fiel
de base/util/lgpd.ts): CPF, CNPJ, RG, e-mail, IP e nomes depois de papéis viram [CPF], [NOME]...
Endereço, bairro, comitente e vara passam pelo corte de pessoa da Luneta (campoSemPessoa).

Valor 0 nunca vira "de graça": avaliação, lance e comissão 0 saem como null (a fonte não informa).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import regra_imovel  # noqa: E402
import regras_luneta as R  # noqa: E402

VERSAO_EXPORTADOR = "1.0.0"
VERSAO_COLETOR = f"pbcv-exportar-{VERSAO_EXPORTADOR}"
BRASILIA = timezone(timedelta(hours=-3))
FUSO = "-03:00"  # o PBCV grava hora local sem fuso; o PC do dono e os sites dos leiloeiros usam a de Brasília
ANO_MINIMO, ANO_MAXIMO = 2015, 2035  # datas fora disso são lixo da fonte (1969-12-31, 2099, 2606)
UFS = {
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ",
    "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
}
RAIZ_LUNETA = Path(__file__).resolve().parents[3]


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def positivo(valor) -> float | None:
    """Dinheiro: só número > 0 (0 e negativo = a fonte não informa)."""
    if valor is None or isinstance(valor, bool):
        return None
    try:
        v = float(valor)
    except (TypeError, ValueError):
        return None
    if v != v or v <= 0 or v > 1e12:  # NaN, zero, negativo, absurdo
        return None
    return round(v, 2)


def texto(valor, maximo: int | None = None) -> str | None:
    t = R.texto_ou_nulo(valor)
    if t is None:
        return None
    return R.truncar(t, maximo) if maximo else t


_RE_DATA = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$")


def data_iso(valor) -> str | None:
    """Data do PBCV ("2026-10-16T14:30:00", hora local) → ISO com fuso; None se ausente ou implausível."""
    if not valor:
        return None
    m = _RE_DATA.match(str(valor).strip())
    if not m:
        return None
    ano, mes, dia = int(m.group(1)), int(m.group(2)), int(m.group(3))
    hora, minuto, segundo = int(m.group(4) or 0), int(m.group(5) or 0), int(m.group(6) or 0)
    if not (ANO_MINIMO <= ano <= ANO_MAXIMO):
        return None
    try:
        datetime(ano, mes, dia, hora, minuto, segundo)
    except ValueError:
        return None
    fuso = m.group(7)
    if fuso == "Z":
        fuso = "+00:00"
    elif fuso and ":" not in fuso:
        fuso = fuso[:3] + ":" + fuso[3:]
    return f"{ano:04d}-{mes:02d}-{dia:02d}T{hora:02d}:{minuto:02d}:{segundo:02d}{fuso or FUSO}"


def url_http(valor, maximo: int = 1000) -> str | None:
    """URL http(s) com host de verdade (o validador usa `new URL` e exige um ponto no host)."""
    if not isinstance(valor, str):
        return None
    bruta = valor.strip()
    if bruta.startswith("//"):
        bruta = "https:" + bruta
    try:
        partes = urlsplit(bruta)
    except ValueError:
        return None
    if partes.scheme.lower() not in ("http", "https") or "." not in (partes.hostname or ""):
        return None
    caminho = quote(partes.path, safe="/%:@!$&'()*+,;=-._~")
    consulta = quote(partes.query, safe="/%:@!$&'()*+,;=?-._~")
    url = urlunsplit((partes.scheme.lower(), partes.netloc, caminho, consulta, ""))
    return url if len(url) <= maximo else None


def ler_json_lista(valor) -> list:
    if not valor:
        return []
    try:
        lista = json.loads(valor)
    except (TypeError, ValueError):
        return []
    return lista if isinstance(lista, list) else []


def sha1(texto_: str) -> str:
    return hashlib.sha1(texto_.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Ids
# ---------------------------------------------------------------------------


def host_da_fonte(fonte: str) -> str:
    host = re.sub(r"^https?://", "", fonte.strip().lower()).split("/")[0]
    return host[4:] if host.startswith("www.") else host


def slug_da_fonte(fonte: str) -> str:
    """Domínio → slug estável: "alemaoleiloeiro.com.br" → "alemaoleiloeiro"; "hammer.lel.br" → "hammer-lel"."""
    host = host_da_fonte(fonte)
    base = host[: -len(".com.br")] if host.endswith(".com.br") else host[:-3] if host.endswith(".br") else host
    slug = re.sub(r"[^a-z0-9]+", "-", R.sem_acento(base)).strip("-")
    if len(slug) > 30:
        slug = slug[:25].rstrip("-") + "-" + sha1(host)[:4]
    if len(slug) < 2:
        slug = f"{slug or 'f'}-{sha1(host)[:4]}"
    return slug


def lote_do_id(id_externo) -> str:
    """Id do lote no contrato: só minúsculas e dígitos, até 40 ("7924-1" → "79241"; UUID → 32 hex)."""
    bruto = str(id_externo).strip().lower()
    if re.fullmatch(r"[a-z0-9]{1,40}", bruto):
        return bruto
    limpo = re.sub(r"[^a-z0-9]", "", R.sem_acento(bruto))
    if 1 <= len(limpo) <= 40:
        return limpo
    return "h" + sha1(bruto)[:24]


# ---------------------------------------------------------------------------
# É imóvel?
# ---------------------------------------------------------------------------


def _dobrar(t: str | None) -> str:
    return R.colapsar_espacos(R.sem_acento(t or "").lower())


def entra_como_imovel(tipo_bem: str | None, titulo: str | None, categoria: str | None, descricao: str | None = None) -> tuple[bool, str]:
    """
    (entra, motivo) pela regra de imóvel da análise do PBCV (regra_imovel.py: título, categoria, começo da
    descrição e o `tipo_bem` do coletor, que sozinho erra: trator "rural", "Item: mesa" "imovel", terreno
    "desconhecido"). O motivo é o passo que decidiu: titulo, forte_titulo, titulo_neg_fraco, categoria,
    descricao e tipo_coletor para os que entram; vetado_<passo> para o imovel/rural do PBCV que a regra tira
    (vetado_neg_titulo, vetado_sem_sinal, vetado_teste); nao_imovel para o resto.
    """
    tb = (tipo_bem or "").strip().lower()
    eh, motivo = regra_imovel.classificar(titulo, categoria, descricao, tb)
    passo = motivo.split(":", 1)[0]
    if eh:
        return True, passo
    return False, (f"vetado_{passo}" if tb in ("imovel", "rural") else "nao_imovel")


def tipo_do_imovel(tipo_bem: str | None, titulo: str | None, categoria: str | None) -> str:
    """Régua da Luneta: a categoria da fonte (como a subcategoria da Leilões Judiciais), senão o título."""
    if (tipo_bem or "").lower() == "rural":
        return "rural"
    return R.tipo_pela_categoria(categoria) or R.inferir_tipo_imovel(titulo)


# ---------------------------------------------------------------------------
# Lugar (IBGE) e LGPD
# ---------------------------------------------------------------------------


def chave_cidade(nome: str) -> str:
    base = re.sub(r"['’‘`´]", "", R.sem_acento(nome).lower())
    return R.colapsar_espacos(re.sub(r"[^a-z0-9]+", " ", base))


class TabelaIbge:
    """Municípios do IBGE da Luneta (base/geo/municipios.csv e apelidos.csv), se o arquivo estiver ao lado."""

    def __init__(self, pasta: Path):
        self.por_codigo: dict[str, tuple[str, str]] = {}
        self.por_nome: dict[tuple[str, str], str] = {}
        arquivo = pasta / "municipios.csv"
        if not arquivo.exists():
            return
        with arquivo.open(encoding="utf-8", newline="") as f:
            for linha in csv.DictReader(f):
                self.por_codigo[linha["codigo_ibge"]] = (linha["uf"], linha["nome"])
                self.por_nome.setdefault((linha["uf"], chave_cidade(linha["nome"])), linha["codigo_ibge"])
        apelidos = pasta / "apelidos.csv"
        if apelidos.exists():
            with apelidos.open(encoding="utf-8", newline="") as f:
                for linha in csv.DictReader(f):
                    self.por_nome.setdefault((linha["uf"], chave_cidade(linha["nome"])), linha["codigo_ibge"])

    @property
    def carregada(self) -> bool:
        return bool(self.por_codigo)

    def pelo_codigo(self, codigo) -> tuple[str, str] | None:
        return self.por_codigo.get(str(codigo).strip()) if codigo else None

    def pelo_nome(self, uf: str, cidade: str) -> tuple[str, str] | None:
        codigo = self.por_nome.get((uf, chave_cidade(cidade)))
        return self.por_codigo.get(codigo) if codigo else None


def lugar(valor, maximo: int) -> str | None:
    """
    Campo que vai ao site sem a máscara de nomes: o corte de pessoa da Luneta e o papel que o validador recusa.
    Com "A x B" (partes de processo), o campo cai inteiro: o corte da Luneta guarda o lado esquerdo, que pode ser o
    nome de uma parte (comitente "FULANO DE TAL X BELTRANO" no PBCV viraria "FULANO DE TAL").
    """
    if isinstance(valor, str) and R.tem_partes(valor):
        return None
    v = R.sem_pessoa(valor)
    for _ in range(3):
        if v is None:
            return None
        papel = R.PAPEL_DE_PESSOA.search(v)
        if not papel:
            break
        v = R.sem_pessoa(v[: papel.start()])
    else:
        return None
    if v is None or R.PAPEL_DE_PESSOA.search(v) or R.mascarar_documentos(v) != v:
        return None
    return R.truncar(v, maximo)


@lru_cache(maxsize=200_000)
def _mascarar_cache(t: str) -> str:
    return R.mascarar_dados_pessoais(t)


def mascarar(t: str) -> str:
    return _mascarar_cache(t) if len(t) <= 2000 else R.mascarar_dados_pessoais(t)


_RE_RESTO_DE_PARTE = re.compile(r"\s*(?:-|–)?\s*(?:cpf|cnpj|rg)\b.*$|\(\d+\)|\be\s+outros?\b|\besp[óo]lio\s+de\b", re.IGNORECASE)
# Além das marcas de empresa da Luneta: conjunto, residencial, edifício (exequente condomínio) não são pessoa.
_PJ_EXTRA = re.compile(r"\b(?:residencial|comercial|conjunto|edificio|habitacional|loteamento|parque|torres?|shopping|clube|igreja|paroquia|mitra|nao|sim)\b")
_PARTICULAS_NOME = {"de", "da", "do", "das", "dos", "e", "d"}


# Firma individual: o nome da empresa é o nome da pessoa ("JOÃO DA SILVA - ME", "MARIA SOUZA EIRELI").
_SUFIXO_FIRMA = re.compile(r"[\s.–-]*\b(?:me|epp|eireli|mei)\.?\s*$", re.IGNORECASE)


def nomes_de_partes(*colunas) -> list[str]:
    """
    Nomes de pessoa das colunas executado/exequente (empresa, banco, condomínio e órgão ficam de fora; da
    firma individual, "FULANO DE TAL - ME", fica o nome da pessoa).
    """
    nomes: list[str] = []
    for coluna in colunas:
        if not coluna:
            continue
        for parte in re.split(r"[;,/]|\s+e\s+|\s+E\s+", str(coluna)):
            parte = _RE_RESTO_DE_PARTE.sub(" ", parte)
            parte = _SUFIXO_FIRMA.sub("", R.colapsar_espacos(parte))
            parte = R.colapsar_espacos(re.sub(r"[^\w\s'’.-]", " ", parte))
            palavras = [p for p in parte.split(" ") if len(p.strip(".")) >= 2]
            fortes = [p for p in palavras if _dobrar(p).strip(".") not in _PARTICULAS_NOME]
            if len(fortes) < 2 or R.comitente_parece_empresa_ou_orgao(parte) or _PJ_EXTRA.search(_dobrar(parte)):
                continue
            nomes.append(" ".join(palavras))
    return sorted(set(nomes), key=len, reverse=True)


def _dobrar_preservando(t: str) -> str:
    """Minúsculas e sem acento, caractere a caractere (o índice no resultado vale no original)."""
    saida = []
    for c in t:
        d = R.sem_acento(c).lower()
        saida.append(d if len(d) == 1 else c)
    return "".join(saida)


def mascarar_partes(t: str, nomes: list[str]) -> tuple[str, int]:
    """Troca por [NOME] cada ocorrência dos nomes das partes (sem diferença de caixa, acento e espaços)."""
    if not t or not nomes:
        return t, 0
    dobrado = _dobrar_preservando(t)
    trechos: list[tuple[int, int]] = []
    for nome in nomes:
        palavras = [re.escape(p) for p in _dobrar_preservando(nome).split(" ") if p]
        regex = re.compile(r"(?<![^\W_])" + r"[\s.,]+".join(palavras) + r"(?![^\W_])")
        trechos.extend((m.start(), m.end()) for m in regex.finditer(dobrado))
    if not trechos:
        return t, 0
    saida, cursor, n = [], 0, 0
    for inicio, fim in sorted(trechos):
        if inicio < cursor:
            cursor = max(cursor, fim)
            continue
        saida.append(t[cursor:inicio])
        saida.append(R.MASCARA_NOME)
        cursor = fim
        n += 1
    saida.append(t[cursor:])
    return "".join(saida), n


def texto_livre(valor, nomes: list[str], maximo: int, com_quebras: bool = False) -> tuple[str | None, int]:
    """Título, descrição, título do leilão: sem HTML, nomes das partes e máscara da Luneta, cortado no limite."""
    if not valor:
        return None, 0
    limpo = R.sem_html(str(valor))
    limpo, n = mascarar_partes(limpo, nomes)
    limpo = mascarar(limpo)
    if com_quebras:
        limpo = re.sub(r"[ \t]+", " ", limpo).strip()
        limpo = limpo or None
    else:
        limpo = R.texto_ou_nulo(limpo)
    if limpo is None:
        return None, n
    return R.truncar(limpo, maximo), n


def rotulo(valor, maximo: int = 80) -> str | None:
    """Rótulo curto (categoria, situação, número do lote): fora se a máscara mudaria algo."""
    t = R.texto_ou_nulo(R.sem_html(str(valor))) if valor is not None else None
    if not t or mascarar(t) != t:
        return None
    return R.truncar(t, maximo)


# ---------------------------------------------------------------------------
# Leiloeiro, comitente, processo, documentos
# ---------------------------------------------------------------------------

_JUNTA = re.compile(r"\b(JUC[A-Z]{1,6}|JCDF)\b[^\d\n]{0,20}?(\d[\d.]*\d|\d)", re.IGNORECASE)
_PREFIXO_LEILOEIRO = re.compile(r"^(?:(?:leiloeir[oa]s?|leil[oõ]es)(?:\s+(?:p[uú]blic[oa]|judicial|rural))?(?:\s+oficial)?|sr\.?|sra\.?|dr\.?|dra\.?)[\s:–-]+", re.IGNORECASE)
_FIM_DO_NOME = re.compile(r"\b(?:JUC[A-Z]{1,6}|JCDF|leiloeir|matr[ií]cula|inscri|reg\.|n[º°]|cpf|cnpj|telefone|tel\.|e-?mail|site)|[-–—,;:(|/@\d]", re.IGNORECASE)


@lru_cache(maxsize=10_000)
def nome_do_leiloeiro(valor) -> tuple[str | None, str | None]:
    """
    Coluna `leiloeiro` do PBCV → (nome do leiloeiro oficial, matrícula na junta):
    "Fulano F. de Tal JUCESP Nº 999 - Leiloeiro oficial..." → ("Fulano F. de Tal", "JUCESP nº 999") (fictício).
    Nome com cara de texto (sem duas palavras, com número, longo demais) fica None.
    """
    t = R.texto_ou_nulo(valor)
    if not t:
        return None, None
    junta_m = _JUNTA.search(t)
    junta = f"{junta_m.group(1).upper()} nº {junta_m.group(2)}" if junta_m else None
    resto = _PREFIXO_LEILOEIRO.sub("", t)
    corte = _FIM_DO_NOME.search(resto)
    nome = R.texto_ou_nulo(resto[: corte.start()] if corte else resto)
    if nome:
        nome = nome.rstrip(" .")
    # A máscara da Luneta mudaria o nome ("... Casado", um sobrenome terminado em "RG"): fica de fora, como
    # qualquer campo que vai ao site sem máscara.
    if not nome or len(nome) > 80 or len(nome.split()) < 2 or mascarar(nome) != nome or not re.search(r"[^\W\d_]{2}", nome):
        nome = None
    return nome, junta


_JUDICIAL = re.compile(r"\b(?:tribunal|tj[a-z]{2}|trt|trf|vara|juizo|justica|comarca|forum|foro|central de (?:avaliacao|hastas|leiloes)|cejusc|juizado)\b")
_BANCO = re.compile(r"\b(?:banco|bank|caixa|itau|unibanco|bradesco|santander|sicoob|sicredi|banrisul|btg|cooperativa de credito|credito|financeira|safra|daycoval|bnb|basa|brb)\b")
_ORGAO = re.compile(
    r"\b(?:prefeitura|municipio|estado d[eoa]|governo|secretaria|ministerio|procuradoria|pgfn|fazenda|comprei|inss|receita|uniao|cdhu|cohab|detran"
    r"|autarquia|companhia de habitacao|departamento|agencia|camara municipal|assembleia|universidade|instituto federal|exercito|marinha|aeronautica)\b"
)


def comitente_da_fonte(valor) -> dict | None:
    """Quem vende: banco, vara, órgão ou empresa. Pessoa física (ou dúvida) → null."""
    nome = lugar(valor, 200)
    if not nome or len(nome) < 2:
        return None
    t = _dobrar(nome)
    if _JUDICIAL.search(t):
        tipo = "judicial"
    elif _BANCO.search(t):
        tipo = "banco"
    elif _ORGAO.search(t):
        tipo = "orgao_publico"
    elif R.comitente_parece_empresa_ou_orgao(nome):
        tipo = "empresa"
    else:
        return None
    return {"nome": nome, "tipo": tipo}


_CNJ = re.compile(r"(?<!\d)(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})(?!\d)")


def processo_cnj(valor) -> str | None:
    """Só o número do processo, no padrão CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO)."""
    if not valor:
        return None
    m = _CNJ.search(str(valor))
    return f"{m.group(1)}-{m.group(2)}.{m.group(3)}.{m.group(4)}.{m.group(5)}.{m.group(6)}" if m else None


_CNJ_TEXTO = r"(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})"
# A regra de processoDoLote (Leilões Judiciais): "(Proc. NNN..." ou "Processo nº NNN...". A descrição cita outros
# processos (penhoras, indisponibilidades, agravos) que não são o da execução: sem o rótulo, nada.
_PROCESSO_NA_DESCRICAO = (
    re.compile(r"\(\s*proc(?:esso)?\.?\s*(?:n[º°o]?\.?\s*)?" + _CNJ_TEXTO, re.IGNORECASE),
    re.compile(r"\bprocesso\s*(?:n[º°o]?\.?\s*)?:?\s*" + _CNJ_TEXTO, re.IGNORECASE),
)


# Número do imóvel na Caixa: "hdnimovel=10119245" na URL do portal, "F8787701662364" (lucasleiloeiro) ou 13 dígitos
# soltos começando por 0, 1 ou 8 (clicleiloes: "N° do imóvel 1444420699441"). A Caixa grava com 13 dígitos e zeros à
# esquerda ("0000010119245"), e é assim que sai. Medido no PBCV: 1.194 lotes à venda com o número, 847 batem com um
# ativo da Caixa na Luneta (a matrícula não serve: a Caixa da Luneta tem matrícula em 1 de 21 mil).
_NUMERO_CAIXA = re.compile(r"hdnimovel=(\d{5,13})|(?<!\d)([018]\d{12})(?!\d)|\bF(\d{13})\b")


def numero_caixa(url, titulo, descricao) -> str | None:
    """Primeiro número de imóvel da Caixa na URL, no título ou no começo da descrição, com 13 dígitos; ou None."""
    for campo in (url, titulo, (descricao or "")[:5000]):
        for m in _NUMERO_CAIXA.finditer(str(campo or "")):
            digitos = next(g for g in m.groups() if g).lstrip("0")
            if digitos:
                return digitos.zfill(13)
    return None


def processo_na_descricao(descricao: str | None) -> str | None:
    if not descricao:
        return None
    for regex in _PROCESSO_NA_DESCRICAO:
        m = regex.search(descricao)
        if m:
            return m.group(1)
    return None


def tipo_documento(tipo: str | None, nome: str | None, url: str) -> str:
    t = (tipo or "").lower()
    alvo = _dobrar(f"{nome or ''} {url}")
    if t == "edital":
        return "edital"
    if t == "matricula":
        return "matricula"
    if t == "avaliacao":
        return "laudo" if "laudo" in alvo else "avaliacao"
    if t == "processo":
        return "processo"
    return "outro"


def documentos_do_lote(valor, nomes: list[str]) -> list[dict]:
    saida, vistos = [], set()
    for d in ler_json_lista(valor):
        if not isinstance(d, dict):
            continue
        url = url_http(d.get("url"))
        if not url or url in vistos:
            continue
        vistos.add(url)
        titulo, _ = texto_livre(d.get("nome"), nomes, 200)
        saida.append({"tipo": tipo_documento(d.get("tipo"), d.get("nome"), url), "titulo": titulo, "url": url})
        if len(saida) >= 50:
            break
    return saida


def fotos_do_lote(valor) -> list[dict]:
    saida, vistos = [], set()
    for f in ler_json_lista(valor):
        url = url_http(f if isinstance(f, str) else (f.get("url") if isinstance(f, dict) else None))
        if not url or url in vistos:
            continue
        vistos.add(url)
        saida.append({"url": url, "ordem": len(saida)})
        if len(saida) >= 60:
            break
    return saida


# ---------------------------------------------------------------------------
# Praças e dinheiro
# ---------------------------------------------------------------------------


def montar_pracas(l: dict, venda_direta: bool) -> dict:
    """
    Praças a partir dos campos do PBCV. Semântica do PBCV (README): valor_lance_inicial = mínimo da 1ª praça;
    valor_lance_minimo = MENOR valor de praça publicado (o piso). Devolve pracas, praca_atual, lance_minimo e
    o que foi descartado (para o resumo).
    """
    d1, d2, enc = data_iso(l["data_primeira_praca"]), data_iso(l["data_segunda_praca"]), data_iso(l["data_encerramento"])
    ini, mn = positivo(l["valor_lance_inicial"]), positivo(l["valor_lance_minimo"])
    pa = l["praca_atual"] if l["praca_atual"] in (1, 2, 3) else None
    notas: list[str] = []
    incoerente = ini is not None and mn is not None and mn > ini + 0.01
    if incoerente:
        notas.append("minimo_maior_que_inicial")

    if venda_direta:
        valor = None if incoerente else (mn if mn is not None else ini)
        data = enc or d1 or d2
        if data is None and valor is None:
            return {"pracas": [], "praca_atual": None, "lance_minimo": None, "notas": notas}
        return {"pracas": [{"numero": 0, "data": data, "valor_minimo": valor}], "praca_atual": 0, "lance_minimo": valor, "notas": notas}

    # O encerramento é a data da praça em vigor quando a fonte não preencheu a dela.
    if pa == 2 and d2 is None and enc and (d1 is None or enc > d1):
        d2 = enc
    if pa == 1 and d1 is None and enc:
        d1 = enc
    if d1 and d2 and d2 <= d1:
        notas.append("datas_fora_de_ordem")
        d2 = None

    dois_valores = ini is not None and mn is not None and mn < ini - 0.01
    if d2 is not None or dois_valores or pa == 2:
        if incoerente:
            v1 = v2 = None
        elif dois_valores:
            v1, v2 = ini, mn
        else:  # um valor só: vai para a praça em vigor; sem ela, para a 1ª (é o que o PBCV chama de inicial)
            unico = ini if ini is not None else mn
            v1, v2 = (None, unico) if (pa == 2 or ini is None) else (unico, None)
        pracas = [{"numero": 1, "data": d1, "valor_minimo": v1}, {"numero": 2, "data": d2, "valor_minimo": v2}]
    elif d1 or enc or ini is not None or mn is not None:
        numero = 1 if (d1 or pa == 1) else 0
        data = d1 if (numero == 1 and d1) else enc
        valor = None if incoerente else (mn if mn is not None else ini)
        pracas = [{"numero": numero, "data": data, "valor_minimo": valor}]
    else:
        return {"pracas": [], "praca_atual": None, "lance_minimo": None, "notas": notas}

    # Leilão online: a data de praça do PBCV às vezes é a abertura, e o lote fica aberto até o encerramento
    # (jmleiloes, tabaleiloes, legisleiloes: 20 a 55 dias depois). A Luneta tira o lote do site 1 dia depois da
    # data da última praça; com a abertura, ele sairia com a disputa ainda aberta. A última praça fica com o
    # encerramento quando ele é posterior a todas as datas.
    ultima = pracas[-1]
    anteriores = [p["data"] for p in pracas[:-1] if p["data"]]
    if enc and (ultima["data"] is None or enc > ultima["data"]) and (not anteriores or enc > max(anteriores)):
        if ultima["data"]:
            notas.append("ultima_praca_no_encerramento")
        ultima["data"] = enc

    numeros = {p["numero"] for p in pracas}
    if all(p["data"] for p in pracas):
        # Todas com data: a Luneta deduz a praça em vigor na importação (mais fresco que o retrato do PBCV).
        return {"pracas": pracas, "praca_atual": None, "lance_minimo": None, "notas": notas}
    atual = pa if pa in numeros else None
    if atual is not None:
        lance = next(p["valor_minimo"] for p in pracas if p["numero"] == atual)
    else:  # sem data para deduzir: o valor da 1ª praça com valor (o maior; nunca promete desconto que não há)
        lance = next((p["valor_minimo"] for p in pracas if p["valor_minimo"] is not None), None)
    return {"pracas": pracas, "praca_atual": atual, "lance_minimo": lance, "notas": notas}


SITUACAO = {"aberto": "ativo", "agendado": "ativo", "suspenso": "suspenso"}


# ---------------------------------------------------------------------------
# Um lote
# ---------------------------------------------------------------------------

COLUNAS = (
    "chave, fonte, id_externo, url, titulo, descricao, numero_lote, tipo_bem, categoria, valor_avaliacao, valor_lance_inicial, "
    "valor_lance_minimo, valor_lance_atual, comissao_pct, id_leilao, titulo_leilao, modalidade, situacao, praca_atual, "
    "data_primeira_praca, data_segunda_praca, data_encerramento, numero_processo, vara, comarca, exequente, executado, matricula, "
    "subjudice, penhorado, logradouro, numero, complemento, bairro, cidade, uf, cep, codigo_ibge, latitude, longitude, "
    "endereco_completo, area_m2, imagens, documentos, leiloeiro, comitente, hash_conteudo, visto_ultimo_em"
)
COLUNAS_GEO = "g.geo_cidade, g.geo_uf, g.geo_codigo_ibge, g.geo_origem_cidade, g.geo_lat, g.geo_lon, g.geo_origem_coord"


class Contagem:
    def __init__(self) -> None:
        self.motivos = Counter()  # por que entrou ou ficou de fora
        self.notas = Counter()  # ajustes feitos em lotes exportados
        self.partes_mascaradas = 0
        self.textos_com_partes = 0


def localizacao(l: dict, ibge: TabelaIbge, contagem: Contagem) -> tuple[str, str] | None:
    """(cidade, uf): o código IBGE da geo_lote (o PBCV casou a cidade, às vezes pelo título), senão o do lote, senão os campos."""
    for codigo, origem in ((l["geo_codigo_ibge"], "geo"), (l["codigo_ibge"], "lote")):
        achado = ibge.pelo_codigo(codigo)
        if achado:
            contagem.notas[f"cidade_ibge_{origem}"] += 1
            return achado[1], achado[0]
    for cidade, uf in ((l["cidade"], l["uf"]), (l["geo_cidade"], l["geo_uf"])):
        uf = (uf or "").strip().upper()
        cidade = R.texto_ou_nulo(cidade)
        if uf in UFS and cidade and len(cidade) >= 2 and R.mascarar_dados_pessoais(cidade) == cidade:
            achado = ibge.pelo_nome(uf, cidade)
            if achado:
                contagem.notas["cidade_ibge_nome"] += 1
                return achado[1], achado[0]
            if not cidade_plausivel(cidade, uf, ibge):
                contagem.notas["cidade_descartada"] += 1
                continue
            contagem.notas["cidade_sem_ibge"] += 1
            return R.truncar(cidade, 120), uf
    return None


_ESTADOS = {
    "acre", "alagoas", "amapa", "amazonas", "bahia", "ceara", "distrito federal", "espirito santo", "goias", "maranhao", "mato grosso",
    "mato grosso do sul", "minas gerais", "para", "paraiba", "parana", "pernambuco", "piaui", "rio de janeiro", "rio grande do norte",
    "rio grande do sul", "rondonia", "roraima", "santa catarina", "sao paulo", "sergipe", "tocantins",
}
# Cidade que não é cidade: rótulo do leilão, do juízo ou do imóvel, pedaço de nome, número.
_NAO_CIDADE = re.compile(
    r"\d|\||\b(?:leilao|leiloes|justica|juizo|foro|forum|comarca|federal|estadual|trabalho|civel|vara|registro|cartorio|imoveis|imovel"
    r"|apartamento|casa|galpao|conjunto|vaga|loteam\w*|condominio|residencial|terreno|sala|loja|lote|quadra|fazenda|sitio|chacara|predio|edificio)\b"
)


def cidade_plausivel(cidade: str, uf: str, ibge: TabelaIbge) -> bool:
    """
    Cidade que não casa com o IBGE na UF: fica (a Luneta ainda tenta distrito e grafia) só se tiver cara de
    nome de lugar. Fora: sigla ou nome de UF, rótulo ("LEILÃO FEDERAL", "Apartamento no Butantã"), número,
    pedaço de palavra ("OESTE", "MIRIM", "LÁ") e município de outra UF ("Guarulhos/TO": a UF está errada).
    """
    chave = chave_cidade(cidade)
    if len(chave) < 3 or chave.upper() in UFS or chave in _ESTADOS or _NAO_CIDADE.search(chave):
        return False
    if len(chave.split()) == 1 and chave in {"oeste", "leste", "norte", "sul", "mirim", "centro", "la", "sao", "santa", "santo"}:
        return False
    return not any(ibge.pelo_nome(outra, cidade) for outra in UFS if outra != uf)


def coordenadas(l: dict) -> tuple[float | None, float | None, str | None]:
    """lat/lon só quando o ponto é bom: o da própria fonte (campo ou mapa da página) ou o CNEFE pelo número."""
    origem = l["geo_origem_coord"]
    precisao = {"lote.latitude": "exata", "mapa-da-pagina": "rua", "cnefe-numero": "rua"}.get(origem or "")
    lat, lon = l["geo_lat"], l["geo_lon"]
    if precisao is None and l["geo_origem_coord"] is None and l["latitude"] is not None:
        lat, lon, precisao = l["latitude"], l["longitude"], "rua"
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None, None, None
    if precisao is None or not (-34 <= lat <= 6 and -74 <= lon <= -28):
        return None, None, None
    return round(lat, 6), round(lon, 6), precisao


def ultima_data(l: dict) -> str | None:
    datas = [d for d in (data_iso(l["data_primeira_praca"]), data_iso(l["data_segunda_praca"]), data_iso(l["data_encerramento"])) if d]
    return max(datas) if datas else None


def motivo_de_fora(l: dict, fonte: dict, desde: str | None, agora_iso: str) -> str | None:
    """
    Por que um imóvel ativo no PBCV não vai à Luneta. `ativo = 1` não quer dizer à venda:
    - não visto na última coleta da fonte que trouxe lotes (historico_de_coletas): zumbi da trava de queda;
    - situação: à venda é só aberto e agendado (None). Suspenso com praça futura volta "suspenso_avisado": vai
      ao arquivo como "suspenso", para a Luneta tirá-lo do site mesmo numa carga incompleta (sem ele, o lote
      já publicado ficaria no ar até a data passar). Encerrado, vendido, desconhecida e suspenso sem praça
      futura ficam de fora (a praça vencida a Luneta já tira sozinha).
    """
    limite = fonte.get("limite_visto")
    visto = l["visto_ultimo_em"] or ""
    if limite is None:
        return "fonte_sem_coleta_com_lotes"
    if visto < limite:
        return "nao_visto_na_ultima_coleta"
    if desde and visto < desde:
        return "antes_de_desde"
    situacao = (l["situacao"] or "desconhecida").lower()
    if situacao in ("aberto", "agendado"):
        return None
    if situacao == "suspenso":
        data = ultima_data(l)
        return "suspenso_avisado" if data and data > agora_iso else "suspenso_sem_data_futura"
    return f"situacao_{situacao}"


def linha_do_lote(l: dict, fonte: dict, motivo: str, ibge: TabelaIbge, contagem: Contagem) -> dict | None:
    url = url_http(l["url"])
    if not url:
        contagem.motivos["fora:url_invalida"] += 1
        return None
    lugar_ = localizacao(l, ibge, contagem)
    if not lugar_:
        contagem.motivos["fora:sem_cidade_uf"] += 1
        return None
    cidade, uf = lugar_

    partes = nomes_de_partes(l["executado"], l["exequente"])
    titulo, n1 = texto_livre(l["titulo"], partes, 300)
    descricao, n2 = texto_livre(l["descricao"], partes, 20000, com_quebras=True)
    leilao_titulo, n3 = texto_livre(l["titulo_leilao"], partes, 500)
    if n1 + n2 + n3:
        contagem.partes_mascaradas += n1 + n2 + n3
        contagem.textos_com_partes += 1
    tipo = tipo_do_imovel(l["tipo_bem"], l["titulo"], l["categoria"])
    if not titulo or len(titulo) < 3:
        titulo = f"{NOME_TIPO[tipo]} em {cidade}/{uf}"
        contagem.notas["titulo_montado"] += 1

    pbcv_modalidade = (l["modalidade"] or "").lower()
    venda_direta = pbcv_modalidade == "venda_direta"
    p = montar_pracas(l, venda_direta)
    for nota in p["notas"]:
        contagem.notas[nota] += 1
    if venda_direta:
        modalidade = "venda_direta"
    elif p["pracas"] or pbcv_modalidade in ("judicial", "extrajudicial"):
        modalidade = "leilao"
    else:
        modalidade = "outro"
    natureza = pbcv_modalidade if pbcv_modalidade in ("judicial", "extrajudicial") else None
    processo = processo_cnj(l["numero_processo"])
    if processo is None and natureza == "judicial":
        processo = processo_na_descricao(l["descricao"])
        if processo:
            contagem.notas["processo_da_descricao"] += 1

    lat, lon, precisao = coordenadas(l)
    numero = R.texto_ou_nulo(l["numero"])
    if numero and (re.fullmatch(r"(?i)s\.?\s*/?\s*n[º°o.]?|sn|sem\s+n[uú]mero|0+", numero) or len(numero) > 20 or R.mascarar_documentos(numero) != numero):
        numero = None
    cep = re.sub(r"\D", "", l["cep"] or "")
    matricula = R.texto_ou_nulo(l["matricula"])
    if matricula and (R.mascarar_documentos(matricula) != matricula or len(matricula) > 120):
        matricula = None
    caixa = numero_caixa(l["url"], l["titulo"], l["descricao"])
    if caixa:
        contagem.notas["numero_caixa"] += 1
    situacao_pbcv = (l["situacao"] or "desconhecida").lower()
    comissao = l["comissao_pct"]
    comissao = round(float(comissao), 2) if isinstance(comissao, (int, float)) and 0 < comissao <= 100 else None

    extras = {
        "tipo_bem_pbcv": l["tipo_bem"],
        "modalidade_pbcv": l["modalidade"],
        "leiloeiro_oficial": nome_do_leiloeiro(l["leiloeiro"])[0],
        "vara": lugar(l["vara"], 200),
        "comarca": lugar(l["comarca"], 120),
        "subjudice": bool(l["subjudice"]) if l["subjudice"] in (0, 1) else None,
        "penhorado": bool(l["penhorado"]) if l["penhorado"] in (0, 1) else None,
    }
    extras = {k: v for k, v in extras.items() if v is not None and v != ""}

    linha = {
        "registro": "imovel",
        "versao_contrato": 1,
        "id": f"{fonte['slug']}:{fonte['lotes'][l['id_externo']]}",
        "leiloeiro": fonte["leiloeiro"],
        "plataforma": None,
        "comitente": comitente_da_fonte(l["comitente"]),
        "url": url,
        "leilao_id": rotulo(l["id_leilao"]),
        "leilao_titulo": leilao_titulo,
        "lote_numero": rotulo(l["numero_lote"]),
        "situacao": SITUACAO.get(situacao_pbcv, "ativo"),
        "situacao_fonte": situacao_pbcv,
        "tipo": tipo,
        "tipo_fonte": rotulo(l["categoria"]),
        "titulo": titulo,
        "descricao": descricao,
        "observacoes": None,
        "endereco": {
            "texto": lugar(l["endereco_completo"], 500),
            "logradouro": lugar(l["logradouro"], 200),
            "numero": numero,
            "complemento": lugar(l["complemento"], 120),
            "bairro": lugar(l["bairro"], 120),
            "cidade": cidade,
            "uf": uf,
            "cep": cep if len(cep) == 8 else None,
        },
        "lat": lat,
        "lon": lon,
        "precisao_geo": precisao,
        "area_privativa": None,
        "area_total": positivo(l["area_m2"]),  # o PBCV não diz qual área é; na dúvida, total (contrato)
        "area_terreno": None,
        "quartos": None,
        "vagas": None,
        "avaliacao": positivo(l["valor_avaliacao"]),
        "lance_minimo": p["lance_minimo"],
        "lance_atual": positivo(l["valor_lance_atual"]),
        "incremento": None,
        "comissao_pct": comissao,
        "pracas": p["pracas"],
        "praca_atual": p["praca_atual"],
        "modalidade": modalidade,
        "modalidade_fonte": None,
        "natureza": natureza,
        "processo": processo,
        "pagamento": None,
        "ocupacao": None,
        "debitos": None,
        "documentos": documentos_do_lote(l["documentos"], partes),
        "fotos": fotos_do_lote(l["imagens"]),
        "registro_imovel": (
            {"matricula": matricula, "cartorio": None, "inscricao_municipal": None, "numero_caixa": caixa} if matricula or caixa else None
        ),
        "extras": extras or None,
    }
    corpo = json.dumps(linha, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    linha["controle"] = {
        "coletado_em": data_iso(l["visto_ultimo_em"]) or fonte["coletado_em"],
        "versao_coletor": VERSAO_COLETOR,
        "hash": hashlib.sha256(corpo.encode("utf-8")).hexdigest(),
    }
    contagem.motivos[f"entra:{motivo}"] += 1
    return linha


NOME_TIPO = {"apartamento": "Apartamento", "casa": "Casa", "terreno": "Terreno", "comercial": "Imóvel comercial", "rural": "Imóvel rural", "vaga": "Vaga de garagem", "outro": "Imóvel"}


# ---------------------------------------------------------------------------
# Fontes e coleta
# ---------------------------------------------------------------------------

_BLOQUEIO = re.compile(r"\b(?:403|429)\b|cloudflare|captcha|desafio|robots|bloque|forbidden|too many requests", re.IGNORECASE)
_SEGREDO = re.compile(r"(?i)((?:token|senha|password|key|chave|cookie|sessao|session|auth)[^=:\s]*\s*[=:]\s*)\S+")


def saude_da_coleta(status: str | None, erro: str | None) -> tuple[str, str | None]:
    s = (status or "").lower()
    if s == "ok":
        return "ok", None
    if s == "incompleta":
        return "parcial", "coleta incompleta no PBCV (paginação ou limite): as saídas não foram apuradas"
    if s == "suspeita":
        return "parcial", "queda abrupta no número de lotes: o PBCV tratou a coleta como suspeita"
    if s == "erro":
        return ("bloqueado" if _BLOQUEIO.search(erro or "") else "quebrado"), erro
    if not s:
        return "parcial", "sem registro de coleta da fonte no PBCV"
    return "quebrado", erro or f"status {s} no PBCV"


def limpar_erro(erro: str | None) -> str | None:
    if not erro:
        return None
    t = R.colapsar_espacos(_SEGREDO.sub(r"\1[omitido]", str(erro)))
    t = re.sub(r"(https?://[^\s?#]+)\?\S*", r"\1?[...]", t)
    t = R.mascarar_dados_pessoais(t)
    return R.truncar(t, 500) or None


def historico_de_coletas(con: sqlite3.Connection) -> dict[str, dict]:
    """
    Por fonte, da coleta_fonte do PBCV: a última coleta (qualquer status) e o limite de frescor dos lotes.

    `ativo = 1` no PBCV não quer dizer "à venda": a trava de queda de 60% mantém ativos os lotes que sumiram
    (fidalgoleiloes: o último ok é de 14/08 e as rodadas seguintes foram "suspeita"; ~1.400 "ativos" de agosto
    que as leituras de setembro não viram). Por isso o lote só sai se foi visto na ÚLTIMA COLETA DA FONTE QUE
    TROUXE LOTES (status ok, suspeita ou incompleta, com n_lotes > 0): `visto_ultimo_em` >= início dela. Coleta
    com erro ou sem lote nenhum não mexe no limite (não leu nada, então não prova que o lote sumiu).

    A carga só é completa quando essa coleta foi ok e é a última da fonte (`completa_possivel`). Se foi suspeita
    ou incompleta, a carga vai como parcial: a Luneta não remove nada, mas também não recebe os zumbis. Fonte
    sem coleta que trouxe lotes (só erro): limite None, nada sai.
    """
    linhas = con.execute(
        "SELECT cf.fonte, cf.coleta_id, cf.status, cf.erro, cf.n_lotes, c.iniciada_em, c.finalizada_em "
        "FROM coleta_fonte cf LEFT JOIN coleta c ON c.id = cf.coleta_id ORDER BY cf.fonte, cf.coleta_id DESC"
    ).fetchall()
    saida: dict[str, dict] = {}
    for fonte, coleta_id, status, erro, n_lotes, iniciada, finalizada in linhas:
        h = saida.get(fonte)
        status = (status or "").lower()
        if h is None:  # a mais recente
            h = saida[fonte] = {
                "status": status, "erro": erro, "n_lotes": n_lotes, "iniciada_em": iniciada, "finalizada_em": finalizada,
                "coleta_id": coleta_id, "limite_visto": None, "limite_de": None, "completa_possivel": False,
            }
        if h["limite_visto"] is not None:
            continue
        if status in ("ok", "suspeita", "incompleta") and (n_lotes or 0) > 0 and iniciada:
            h["limite_visto"] = iniciada
            h["limite_de"] = status
            h["completa_possivel"] = status == "ok" and coleta_id == h["coleta_id"]
    return saida


def carregar_fontes(con: sqlite3.Connection, filtro: set[str] | None) -> dict[str, dict]:
    """Por fonte: a última coleta (coleta_fonte), o limite de frescor dos lotes, o nome do leiloeiro e o site."""
    fontes = historico_de_coletas(con)
    nomes: dict[str, Counter] = defaultdict(Counter)
    for fonte, leiloeiro, n in con.execute("SELECT fonte, leiloeiro, COUNT(*) FROM lote WHERE ativo = 1 GROUP BY fonte, leiloeiro"):
        if leiloeiro:
            nomes[fonte][leiloeiro] += n
    extrai = {
        fonte: (bool(f), bool(d))
        for fonte, f, d in con.execute(
            "SELECT fonte, MAX(imagens IS NOT NULL AND imagens NOT IN ('', '[]')), MAX(documentos IS NOT NULL AND documentos NOT IN ('', '[]')) "
            "FROM lote WHERE ativo = 1 GROUP BY fonte"
        )
    }
    ultimo_visto = dict(con.execute("SELECT fonte, MAX(visto_ultimo_em) FROM lote GROUP BY fonte").fetchall())
    saida: dict[str, dict] = {}
    todas = set(fontes) | set(ultimo_visto)
    # Dois domínios com o mesmo slug ("x.com.br" e "x.net.br" → "x"; "x.br" e "x.com.br"): os dois ganham o
    # sufixo do próprio domínio, para nunca juntar dois leiloeiros numa carga (a Luneta recusaria a 2ª linha de coleta).
    repetidos = {s for s, k in Counter(slug_da_fonte(f) for f in todas).items() if k > 1}
    for fonte in todas:
        slug = slug_da_fonte(fonte)
        if slug in repetidos:
            slug = f"{slug[:25].rstrip('-')}-{sha1(host_da_fonte(fonte))[:4]}"
        if filtro and fonte not in filtro and slug not in filtro and host_da_fonte(fonte) not in filtro:
            continue
        info = fontes.get(fonte, {})
        # O nome que o site mostra é o domínio: estável entre exportações (o nome do leiloeiro nos lotes muda de
        # grafia de um lote para outro) e igual ao que o usuário vê no navegador. O leiloeiro oficial (pessoa,
        # profissional público) vai em extras.leiloeiro_oficial e a matrícula na junta em matricula_junta.
        nome = host_da_fonte(fonte)
        oficiais = {nome_do_leiloeiro(x) for x in nomes.get(fonte, {})} - {(None, None)}
        junta = next(iter(oficiais))[1] if len(oficiais) == 1 else None
        # Fim da coleta: o PBCV grava `visto_ultimo_em` dos lotes ao sincronizar a fonte (no fim da leitura dela);
        # se a última coleta falhou depois disso, vale o início da coleta que falhou.
        datas = [d for d in (data_iso(info.get("iniciada_em")), data_iso(ultimo_visto.get(fonte)), data_iso(info.get("finalizada_em"))) if d]
        fim = max(datas) if datas else None
        saude, erro = saude_da_coleta(info.get("status"), info.get("erro"))
        saida[fonte] = {
            "fonte": fonte,
            "slug": slug,
            "nome": nome,
            "matricula_junta": junta,
            "status": info.get("status"),
            "limite_visto": info.get("limite_visto"),
            "limite_de": info.get("limite_de"),
            "completa_possivel": bool(info.get("completa_possivel")),
            "saude": saude,
            "erro": limpar_erro(erro),
            "iniciado_em": data_iso(info.get("iniciada_em")),
            "coletado_em": fim,
            "extrai": {"fotos": extrai.get(fonte, (False, False))[0], "documentos": extrai.get(fonte, (False, False))[1], "ocupacao": False},
        }
    return saida


def ids_dos_lotes(id_externos: list[str]) -> dict[str, str]:
    """Id do contrato para cada id_externo da fonte, sem repetir (colisão → hash do id original)."""
    saida: dict[str, str] = {}
    usados: Counter = Counter(lote_do_id(i) for i in id_externos)
    for i in id_externos:
        lote = lote_do_id(i)
        if usados[lote] > 1 and lote != str(i).strip().lower():
            lote = "h" + sha1(str(i))[:24]
        saida[i] = lote
    return saida


# ---------------------------------------------------------------------------
# Exportação
# ---------------------------------------------------------------------------


def abrir_somente_leitura(caminho: str) -> sqlite3.Connection:
    arquivo = Path(caminho).resolve()
    if not arquivo.exists():
        raise SystemExit(f"Banco não encontrado: {arquivo}")
    con = sqlite3.connect(f"{arquivo.as_uri()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA query_only = ON")
    return con


def exportar(banco: str, saida: str, fontes_filtro: set[str] | None = None, desde: str | None = None, frequencia: str | None = "mensal", agora: datetime | None = None) -> dict:
    inicio = time.time()
    con = abrir_somente_leitura(banco)
    ibge = TabelaIbge(RAIZ_LUNETA / "base" / "geo")
    fontes = carregar_fontes(con, fontes_filtro)
    contagem = Contagem()
    por_fonte: dict[str, dict] = {}
    agora_iso = (agora or datetime.now(BRASILIA)).strftime("%Y-%m-%dT%H:%M:%S") + FUSO

    colunas = ", ".join(f"lote.{c.strip()}" for c in COLUNAS.split(","))
    tem_geo = con.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'geo_lote'").fetchone() is not None
    if tem_geo:
        sql = f"SELECT {colunas}, {COLUNAS_GEO} FROM lote LEFT JOIN geo_lote g ON g.chave = lote.chave"
    else:  # base anterior à geo_lote
        sql = f"SELECT {colunas}, " + ", ".join(f"NULL AS {c.split('.')[1]}" for c in COLUNAS_GEO.split(", ")) + " FROM lote"
    cursor = con.execute(sql + " WHERE lote.ativo = 1 ORDER BY lote.fonte, lote.id_externo")

    lotes_da_fonte: list[dict] = []
    fonte_atual: str | None = None

    def fechar_fonte() -> None:
        if fonte_atual is None or fonte_atual not in fontes:
            return
        f = fontes[fonte_atual]
        if (f["status"] or "").lower() == "aposentada":
            contagem.motivos["fora:fonte_aposentada"] += len(lotes_da_fonte)
            return
        f["lotes"] = ids_dos_lotes([x["id_externo"] for x in lotes_da_fonte])
        primeiro_url = next((url_http(x["url"]) for x in lotes_da_fonte if url_http(x["url"])), None)
        site = None
        if primeiro_url:
            partes = urlsplit(primeiro_url)
            site = f"{partes.scheme}://{partes.netloc}/"
        f["leiloeiro"] = {"slug": f["slug"], "nome": f["nome"], "site": site or f"https://{host_da_fonte(fonte_atual)}/", "matricula_junta": f["matricula_junta"]}
        linhas: list[dict] = []
        n = Counter()
        for l in lotes_da_fonte:
            entra, motivo = entra_como_imovel(l["tipo_bem"], l["titulo"], l["categoria"], l["descricao"])
            if not entra:
                contagem.motivos[f"fora:{motivo}"] += 1
                continue
            n["imoveis_ativos_pbcv"] += 1
            fora = motivo_de_fora(l, f, desde, agora_iso)
            if fora == "suspenso_avisado":
                # fora do site, mas no arquivo: a Luneta tira do ar o que já tinha publicado
                n["suspensos_com_praca_futura"] += 1
                linha = linha_do_lote(l, f, motivo, ibge, contagem)
                if linha is not None:
                    linhas.append(linha)
                    n["suspensos_avisados"] += 1
                continue
            if fora:
                contagem.motivos[f"fora:{fora}"] += 1
                n[fora] += 1
                continue
            n["a_venda"] += 1
            linha = linha_do_lote(l, f, motivo, ibge, contagem)
            if linha is not None:
                linhas.append(linha)
                n["a_venda_enviados"] += 1
        if n["imoveis_ativos_pbcv"]:
            por_fonte[fonte_atual] = {"fonte": f, "linhas": linhas, "n": n}

    for row in cursor:
        l = dict(row)
        for k, v in l.items():
            # U+FFFD (o "losango com interrogação") é texto que o PBCV leu com a codificação errada: o validador recusa o arquivo inteiro com ele.
            if isinstance(v, str) and "\ufffd" in v:
                l[k] = v.replace("\ufffd", "")
                contagem.notas["caractere_invalido_removido"] += 1
        if l["fonte"] != fonte_atual:
            fechar_fonte()
            fonte_atual = l["fonte"]
            lotes_da_fonte = []
        if fonte_atual not in fontes:
            continue
        lotes_da_fonte.append(l)
    fechar_fonte()

    destino = Path(saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    resumo_fontes = []
    total_linhas = 0
    with destino.open("w", encoding="utf-8", newline="\n") as arq:
        for fonte_id in sorted(por_fonte, key=lambda x: por_fonte[x]["fonte"]["slug"]):
            item = por_fonte[fonte_id]
            f, n, linhas = item["fonte"], item["n"], sorted(item["linhas"], key=lambda x: x["id"])
            # Sem lote: só a linha de coleta, e só quando a fonte quebrou ou foi bloqueada (a Luneta registra o erro
            # e mantém o que já publicou). Carga vazia com saúde ok ou parcial não diz nada.
            if not linhas and f["saude"] not in ("quebrado", "bloqueado"):
                resumo_fontes.append({"fonte": fonte_id, "slug": f["slug"], "enviados": 0, **n, "saude": f["saude"], "completa": False, "linha_de_coleta": False})
                continue
            completa = f["saude"] == "ok" and f["completa_possivel"] and n["antes_de_desde"] == 0
            coleta = {
                "registro": "coleta",
                "versao_contrato": 1,
                "leiloeiro": f["leiloeiro"],
                "plataforma": None,
                "metodo": None,
                "iniciado_em": f["iniciado_em"],
                "coletado_em": f["coletado_em"] or (linhas[0]["controle"]["coletado_em"] if linhas else agora_iso),
                "versao_coletor": VERSAO_COLETOR,
                "completa": completa,
                "total_na_fonte": n["a_venda"] + n["suspensos_avisados"],
                "total_enviados": len(linhas),
                "saude": f["saude"],
                "erro": f["erro"],
                "frequencia": frequencia,
                "extrai": f["extrai"],
                "robots": None,
                "termos": None,
            }
            arq.write(json.dumps(coleta, ensure_ascii=False) + "\n")
            for linha in linhas:
                arq.write(json.dumps(linha, ensure_ascii=False) + "\n")
            total_linhas += len(linhas)
            resumo_fontes.append({"fonte": fonte_id, "slug": f["slug"], "enviados": len(linhas), **n, "saude": f["saude"], "completa": completa, "linha_de_coleta": True})
    con.close()

    slugs = Counter(f["slug"] for f in fontes.values())
    com_linha = [x for x in resumo_fontes if x["linha_de_coleta"]]
    resumo = {
        "arquivo": destino.name,  # só o nome: o resumo vai ao GitHub e não leva a pasta do PC
        "segundos": round(time.time() - inicio, 1),
        "agora": agora_iso,
        "fontes_com_imoveis_ativos_no_pbcv": len(por_fonte),
        "leiloeiros_no_arquivo": len(com_linha),
        "leiloeiros_com_imoveis": sum(1 for x in com_linha if x["enviados"]),
        "imoveis_ativos_no_pbcv": sum(x.get("imoveis_ativos_pbcv", 0) for x in resumo_fontes),
        "imoveis_a_venda": sum(x.get("a_venda", 0) for x in resumo_fontes),
        "imoveis": total_linhas,
        "imoveis_a_venda_no_arquivo": sum(x.get("a_venda_enviados", 0) for x in resumo_fontes if x["linha_de_coleta"]),
        "suspensos_com_praca_futura": sum(x.get("suspensos_com_praca_futura", 0) for x in resumo_fontes),
        "suspensos_avisados": sum(x.get("suspensos_avisados", 0) for x in resumo_fontes if x["linha_de_coleta"]),
        "motivos": dict(sorted(contagem.motivos.items())),
        "ajustes": dict(sorted(contagem.notas.items())),
        "partes_mascaradas": contagem.partes_mascaradas,
        "lotes_com_partes_mascaradas": contagem.textos_com_partes,
        "saude": dict(Counter(x["saude"] for x in com_linha)),
        "completas": sum(1 for x in com_linha if x["completa"]),
        "slugs_repetidos": sorted(s for s, k in slugs.items() if k > 1),
        "ibge_carregado": ibge.carregada,
        "fontes": sorted(resumo_fontes, key=lambda x: (-x["enviados"], x["slug"])),
    }
    return resumo


def formatar_resumo(r: dict, caminho: str | None = None) -> str:
    caminho = caminho or r["arquivo"]
    linhas = [
        f"Arquivo: {caminho} ({r['segundos']} s; referência {r['agora']})",
        f"Imóveis: {r['imoveis_ativos_no_pbcv']} ativos no PBCV, {r['imoveis_a_venda']} à venda (vistos na última coleta que trouxe lotes e em aberto/agendado), "
        f"{r['imoveis']} no arquivo: {r['imoveis_a_venda_no_arquivo']} à venda e {r['suspensos_avisados']} suspensos com praça futura (para sair do site)",
        f"Leiloeiros: {r['leiloeiros_com_imoveis']} com imóveis no arquivo ({r['leiloeiros_no_arquivo']} linhas de coleta); cargas completas: "
        f"{r['completas']}; saúde: " + ", ".join(f"{k} {v}" for k, v in sorted(r["saude"].items())),
        "Entraram: " + ", ".join(f"{k[6:]} {v}" for k, v in r["motivos"].items() if k.startswith("entra:")),
        "Ficaram de fora: " + ", ".join(f"{k[5:]} {v}" for k, v in r["motivos"].items() if k.startswith("fora:")),
        "Ajustes: " + ", ".join(f"{k} {v}" for k, v in r["ajustes"].items()),
        f"LGPD: {r['partes_mascaradas']} nome(s) de executado/exequente mascarado(s) em {r['lotes_com_partes_mascaradas']} lote(s) (antes da máscara da Luneta)",
    ]
    if not r["ibge_carregado"]:
        linhas.append("Aviso: base/geo/municipios.csv não encontrado; as cidades saem como o PBCV gravou")
    if r["slugs_repetidos"]:
        linhas.append("ATENÇÃO: slugs repetidos: " + ", ".join(r["slugs_repetidos"]))
    linhas.append("Maiores: " + ", ".join(f"{x['slug']} {x['enviados']}" for x in r["fontes"][:10]))
    linhas.append(f"Agora valide: node --experimental-strip-types base/leiloeiros/validar.ts --arquivo \"{caminho}\"")
    if Path(caminho).resolve().parent == PASTA_PADRAO.resolve():
        linhas.append("E envie à Luneta: node base/coleta-pc.mjs --so-publicar")
    return "\n".join(linhas)


PASTA_PADRAO = RAIZ_LUNETA / "coletas-pc" / "leiloeiros"


def principal(argv: list[str] | None = None) -> int:
    try:  # terminal do Windows com saída redirecionada (cp1252): um caractere fora da página não derruba o resumo
        sys.stdout.reconfigure(errors="replace")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass
    p = argparse.ArgumentParser(description="Exporta os imóveis à venda do PBCV (leiloes.db) para o JSONL dos leiloeiros da Luneta.")
    p.add_argument("--banco", required=True, help="caminho do leiloes.db do PBCV (aberto só para leitura)")
    p.add_argument("--saida", default=str(PASTA_PADRAO / "pbcv-luneta.jsonl"), help="arquivo JSONL de saída (UTF-8); padrão: coletas-pc/leiloeiros/pbcv-luneta.jsonl")
    p.add_argument("--fontes", help="só estas fontes, separadas por vírgula (domínio ou slug): portalzuk.com.br,megaleiloes")
    p.add_argument("--desde", help="só lotes vistos a partir desta data (AAAA-MM-DD); a carga da fonte com lote mais antigo deixa de ser completa")
    p.add_argument("--frequencia", default="mensal", choices=["diaria", "semanal", "quinzenal", "mensal", "manual"], help="agenda da coleta (padrão: mensal)")
    p.add_argument("--resumo", help="resumo da exportação em JSON, com a conta por fonte (padrão: pbcv-resumo.json ao lado da saída)")
    p.add_argument("--agora", help=argparse.SUPPRESS)  # testes: referência fixa (AAAA-MM-DDTHH:MM, hora de Brasília)
    a = p.parse_args(argv)
    if a.desde and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a.desde):
        p.error("--desde precisa ser AAAA-MM-DD")
    filtro = {x.strip().lower() for x in a.fontes.split(",") if x.strip()} if a.fontes else None
    agora = datetime.strptime(a.agora, "%Y-%m-%dT%H:%M") if a.agora else None
    r = exportar(a.banco, a.saida, filtro, a.desde, a.frequencia, agora)
    resumo = Path(a.resumo) if a.resumo else Path(a.saida).parent / "pbcv-resumo.json"
    resumo.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(formatar_resumo(r, a.saida))
    return 0 if r["imoveis"] > 0 else 1


if __name__ == "__main__":
    sys.exit(principal())
