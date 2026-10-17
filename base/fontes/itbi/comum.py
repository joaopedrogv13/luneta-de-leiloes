"""Peças comuns dos conectores de ITBI das prefeituras (Recife, Fortaleza, Porto Alegre, Belo Horizonte, Rio).

Cada prefeitura publica um arquivo diferente (CSV em portal CKAN, ZIP com CSV, planilha, MapServer). Aqui ficam:
- `baixar`: GET educado (User-Agent identificado, 3 tentativas, sem contornar bloqueio);
- `recursos_ckan`: arquivos de um conjunto de dados num portal CKAN (busca por "itbi");
- `ler_tabela`: CSV/XLSX/ZIP para DataFrame, com detecção de separador e de codificação;
- `coluna`: acha uma coluna pelo nome (sem acento, minúsculas), por listas de palavras;
- `tipo_de`: "Apartamento", "CASA TERREA", "SALA COMERCIAL"... → apartamento | casa | terreno | comercial (ou None);
- `resumo_colunas`: o que imprimir no log para conferir o arquivo (nomes, tipos, valores dos campos de classificação),
  sem endereço nem número: o log é publicado.

Nenhum conector guarda dado pessoal: só os agregados de agregar.py saem daqui.
"""
import io
import re
import sys
import time
import unicodedata
import zipfile

import pandas as pd
import requests

UA = {"User-Agent": "LunetaDeLeiloes/0.1 (dados abertos de ITBI; +https://luneta-de-leiloes.vercel.app)"}


def log(*partes):
    print(*partes, flush=True)


def baixar(url, params=None, timeout=180, tentativas=3):
    """GET com 3 tentativas (espera 5 s, 15 s). Lança o último erro. 403/429 não são contornados."""
    erro = None
    for k in range(tentativas):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout)
            if r.status_code in (403, 429):
                raise RuntimeError(f"HTTP {r.status_code} em {url} (bloqueio: não contornado)")
            r.raise_for_status()
            return r
        except Exception as e:  # noqa: BLE001 - registra e tenta de novo
            erro = e
            log(f"  tentativa {k + 1} falhou: {type(e).__name__}: {str(e)[:200]}")
            if k + 1 < tentativas:
                time.sleep(5 * (3**k))
    raise erro


def sem_acento(texto):
    t = unicodedata.normalize("NFD", str(texto))
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def chave_coluna(nome):
    return re.sub(r"[^a-z0-9]+", "_", sem_acento(nome)).strip("_")


def coluna(df, *grupos, evitar=()):
    """Primeira coluna cujo nome (sem acento) contém TODAS as palavras de um grupo, testando os grupos em ordem.

    coluna(df, ("valor", "transacao"), ("valor", "declarado")) → "VALOR_TRANSACAO" ou "Valor Declarado" ou None.
    `evitar`: palavras que desqualificam a coluna (ex.: "venal").
    """
    for grupo in grupos:
        palavras = (grupo,) if isinstance(grupo, str) else grupo
        for c in df.columns:
            if casa_nome(c, palavras, evitar):
                return c
    return None


def casa_nome(nome, palavras, evitar=()):
    """Todas as palavras no nome da coluna (palavra de até 3 letras: só inteira, para "ano" não casar "urbano")."""
    k = chave_coluna(nome)
    partes = k.split("_")
    tem = lambda p: (p in partes) if len(p) <= 3 else (p in k)  # noqa: E731
    return all(tem(p) for p in palavras) and not any(e in k for e in evitar)


def numero_br(serie):
    """'1.234,56' / '1234.56' / 1234.56 → float. Vírgula decimal quando houver vírgula."""
    if pd.api.types.is_numeric_dtype(serie):
        return pd.to_numeric(serie, errors="coerce")
    s = serie.astype(str).str.strip().str.replace(r"[R$\s]", "", regex=True)
    tem_virgula = s.str.contains(",", regex=False)
    s = s.where(~tem_virgula, s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False))
    return pd.to_numeric(s, errors="coerce")


def data_br(serie):
    """Datas em DD/MM/AAAA, AAAA-MM-DD (com ou sem hora) ou número serial do Excel."""
    if pd.api.types.is_datetime64_any_dtype(serie):
        return serie
    if pd.api.types.is_numeric_dtype(serie):
        return pd.to_datetime(serie, unit="D", origin="1899-12-30", errors="coerce")
    s = serie.astype(str).str.strip()
    iso = s.str.match(r"^\d{4}-\d{2}-\d{2}")
    saida = pd.to_datetime(s.where(iso), errors="coerce", format="mixed")
    br = pd.to_datetime(s.where(~iso), errors="coerce", dayfirst=True, format="mixed")
    return saida.fillna(br)


TIPOS = [
    ("apartamento", ("apart", "apto", "flat", "cobertura", "kitnet", "quitinete", "conjugado", "studio", "estudio", "duplex", "residencial vertical", "unidade autonoma residencial")),
    ("casa", ("casa", "sobrado", "residencial horizontal", "residencia unifamiliar", "chale", "bangalo")),
    ("terreno", ("terreno", "territorial", "lote", "gleba", "chacara", "sitio")),
    ("comercial", ("sala", "loja", "comerc", "galpao", "galpoes", "industri", "escritorio", "predio", "conjunto comercial", "consultorio", "deposito", "armazem", "hotel", "nao residencial")),
]
FORA = ("garagem", "box", "vaga", "estacionamento", "jazigo", "tumulo", "boxe")


def tipo_de(texto):
    """Classifica o tipo do imóvel pelo texto da prefeitura. Garagem/box/vaga e o que não reconhecer: None."""
    if texto is None or (isinstance(texto, float) and pd.isna(texto)):
        return None
    t = " " + re.sub(r"[^a-z0-9]+", " ", sem_acento(texto)).strip() + " "
    if any(f" {f}" in t for f in FORA):
        return None
    for tipo, palavras in TIPOS:
        if any(f" {p}" in t for p in palavras):
            return tipo
    return None


def recursos_ckan(base, consulta="itbi", formatos=("csv", "zip", "xlsx", "xls")):
    """Arquivos dos conjuntos achados por `consulta` num portal CKAN: [{nome, formato, url, licenca, conjunto}]."""
    r = baixar(f"{base}/api/3/action/package_search", params={"q": consulta, "rows": 20}, timeout=60)
    try:
        dados = r.json()["result"]["results"]
    except ValueError:
        raise RuntimeError(f"resposta não é JSON ({r.headers.get('content-type')}): {r.text[:300]!r}")
    saida = []
    for p in dados:
        for x in p.get("resources", []):
            formato = (x.get("format") or x.get("url", "").rsplit(".", 1)[-1]).lower()
            if formato in formatos:
                saida.append({
                    "nome": x.get("name") or "",
                    "formato": formato,
                    "url": x.get("url"),
                    "licenca": p.get("license_title"),
                    "conjunto": p.get("title"),
                    "modificado": x.get("last_modified") or x.get("created"),
                })
    return saida


def anos_no_nome(nome):
    return [int(a) for a in re.findall(r"(?<!\d)(20\d{2})(?!\d)", nome or "")]


def _decodificar(bytes_):
    for cod in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return bytes_.decode(cod), cod
        except UnicodeDecodeError:
            continue
    return bytes_.decode("latin-1", errors="replace"), "latin-1"


def ler_csv(bytes_):
    texto, cod = _decodificar(bytes_)
    primeira = texto.split("\n", 1)[0]
    sep = max([";", ",", "\t", "|"], key=primeira.count)
    df = pd.read_csv(io.StringIO(texto), sep=sep, dtype=str, low_memory=False, on_bad_lines="skip")
    log(f"  CSV: {len(df)} linhas, separador {sep!r}, codificação {cod}")
    return df


def ler_tabela(bytes_, nome=""):
    """CSV, XLSX/XLS ou ZIP (com um ou mais CSV/XLSX dentro, concatenados) → DataFrame de textos."""
    n = nome.lower()
    if bytes_[:2] == b"PK" and not n.endswith((".xlsx", ".xlsm")):
        with zipfile.ZipFile(io.BytesIO(bytes_)) as z:
            internos = [i for i in z.namelist() if i.lower().endswith((".csv", ".txt", ".xlsx", ".xls"))]
            log(f"  ZIP com {z.namelist()[:10]}")
            frames = [ler_tabela(z.read(i), i) for i in internos]
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    if n.endswith((".xlsx", ".xlsm", ".xls")) or bytes_[:2] == b"PK":
        planilhas = pd.read_excel(io.BytesIO(bytes_), sheet_name=None, dtype=str)
        log(f"  planilha com abas {list(planilhas)[:10]}")
        return pd.concat(planilhas.values(), ignore_index=True)
    return ler_csv(bytes_)


CAMPOS_PRIVADOS = ("logradouro", "endereco", "numero", "complemento", "cep", "sql", "inscricao", "matricula", "nome", "cpf", "cnpj", "lat", "lon", "referencia", "indice_cadastral", "cadastro")


def resumo_colunas(df, maximo=12):
    """Nomes das colunas, preenchimento e, para colunas de classificação (sem endereço), os valores mais comuns."""
    log(f"  {len(df)} linhas; colunas: {list(df.columns)}")
    for c in df.columns:
        k = chave_coluna(c)
        cheio = int(df[c].notna().sum())
        if any(p in k for p in CAMPOS_PRIVADOS):
            log(f"    - {c}: {cheio} preenchidos (conteúdo omitido)")
            continue
        unicos = df[c].nunique(dropna=True)
        if unicos <= 60:
            comuns = df[c].value_counts(dropna=True).head(maximo).to_dict()
            log(f"    - {c}: {cheio} preenchidos, {unicos} valores; mais comuns {comuns}")
        else:
            amostra = [str(v)[:30] for v in df[c].dropna().head(3)]
            log(f"    - {c}: {cheio} preenchidos, {unicos} valores; ex. {amostra}")


def gravar(resultado, caminho):
    import json

    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False)
    f = resultado["fonte"]
    log(f"OK: {f['transacoes']} transações de {f['periodo'][0]} a {f['periodo'][1]}, {len(resultado['bairros'])} bairros, {len(resultado['ruas'])} ruas, tipos {list(resultado['cidade_tipos'])}")


def principal(funcao):
    """Roda o conector e sai com código 1 se falhar (a etapa do workflow fica vermelha, as outras seguem)."""
    try:
        funcao(sys.argv[1])
    except Exception as e:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        log(f"FALHOU: {type(e).__name__}: {e}")
        sys.exit(1)
