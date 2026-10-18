"""IBGE no Actions: confere o que é a variável V06006 dos agregados de renda por setor do Censo 2022 (C6).

O dicionário do censobr para em V06005; os valores da V06006 indicam o rendimento MEDIANO do responsável, mas o rótulo
só entra no site depois de confirmado no arquivo do próprio IBGE. Este script (o FTP do IBGE não abre deste contêiner)
baixa a pasta de renda do responsável, lê o cabeçalho do CSV dentro do ZIP e procura a V06006 em todo dicionário,
planilha, texto ou PDF da pasta (e da pasta geral dos agregados), gravando a linha que a descreve.

    python base/fontes/localizacao/ibge.py --saida base/fontes/localizacao/saida

Saída:
- `ibge-renda.txt`: o que foi baixado (URL, tamanho), os arquivos do ZIP, o cabeçalho do CSV e cada linha que cita
  V06004, V06005 ou V06006;
- `ibge-renda.json`: `{"v06006": {"descricao": "...", "arquivo": "...", "mediana": true} | null, "cabecalho": [...],
  "conferido_em": "AAAA-MM-DD"}`. O nota.py só usa a V06006 quando `v06006.mediana` for true.

Precisa de openpyxl (xlsx) e pypdf (pdf); sem eles, esses formatos ficam de fora (o log diz).
"""
from __future__ import annotations

import argparse
import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

UA = "LunetaDeLeiloes/0.1 (ranking de localização; dados abertos do IBGE; +https://luneta-de-leiloes.vercel.app)"
BASE = "https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/"
PASTA_RENDA = BASE + "Agregados_por_Setores_Censitarios_Rendimento_do_Responsavel/"
ZIP_RENDA = PASTA_RENDA + "Agregados_por_setores_renda_responsavel_BR_csv.zip"
PASTA_GERAL = BASE + "Agregados_por_Setores_Censitarios/"
NOTA_MEDIANA = "https://biblioteca.ibge.gov.br/visualizacao/livros/liv102277.pdf"
VARIAVEIS = ("V06004", "V06005", "V06006")
RE_VAR = re.compile(r"\bV0600[456]\b")
EXTENSOES_DIC = (".xlsx", ".xls", ".ods", ".txt", ".csv", ".pdf", ".docx")
MAX_DIC = 40 * 1024 * 1024


def log(*partes: object) -> None:
    print(*partes, flush=True)


def baixar(url: str, limite: int | None = None, tentativas: int = 3) -> bytes:
    erro: Exception | None = None
    for k in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=180) as r:
                return r.read(limite) if limite else r.read()
        except Exception as e:  # noqa: BLE001 - tenta de novo e devolve o último erro
            erro = e
            log(f"  tentativa {k + 1} de {url} falhou: {type(e).__name__}: {str(e)[:160]}")
            time.sleep(5 * (k + 1))
    assert erro is not None
    raise erro


def listar(url: str) -> list[str]:
    """Arquivos de uma listagem Apache (autoindex)."""
    texto = baixar(url).decode("utf-8", "replace")
    nomes = []
    for href in re.findall(r'href="([^"?#]+)"', texto):
        nome = html.unescape(urllib.parse.unquote(href))
        if nome.startswith(("/", "http", "..")) or nome.endswith("/"):
            continue
        nomes.append(nome)
    return sorted(set(nomes))


def linhas_xlsx(dados: bytes) -> list[str]:
    try:
        import openpyxl
    except ImportError:
        return ["(openpyxl ausente: planilha não lida)"]
    wb = openpyxl.load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
    saida = []
    for ws in wb.worksheets:
        for r in ws.iter_rows(values_only=True):
            celulas = [str(x).strip() for x in r if x is not None and str(x).strip()]
            if celulas:
                saida.append(f"[{ws.title}] " + " | ".join(celulas))
    return saida


def linhas_pdf(dados: bytes) -> list[str]:
    try:
        import pypdf
    except ImportError:
        return ["(pypdf ausente: PDF não lido)"]
    saida = []
    leitor = pypdf.PdfReader(io.BytesIO(dados))
    for k, pagina in enumerate(leitor.pages):
        for linha in (pagina.extract_text() or "").splitlines():
            if linha.strip():
                saida.append(f"[p. {k + 1}] {linha.strip()}")
    return saida


def linhas_de(nome: str, dados: bytes) -> list[str]:
    n = nome.lower()
    if n.endswith(".xlsx"):
        return linhas_xlsx(dados)
    if n.endswith(".pdf"):
        return linhas_pdf(dados)
    if n.endswith(".docx"):
        try:
            with zipfile.ZipFile(io.BytesIO(dados)) as z:
                xml = z.read("word/document.xml").decode("utf-8", "replace")
            textos = (re.sub(r"<[^>]+>", "", p).strip() for p in re.sub(r"<w:p[ >]", "\n<w:p ", xml).split("\n"))
            return [t for t in textos if t]
        except Exception as e:  # noqa: BLE001
            return [f"(docx não lido: {e})"]
    if n.endswith((".txt", ".csv")):
        for cod in ("utf-8", "latin-1"):
            try:
                return dados.decode(cod).splitlines()
            except UnicodeDecodeError:
                continue
    return [f"(formato não lido: {nome})"]


def descreve_mediana(texto: str) -> bool:
    t = texto.lower()
    return "median" in t


def principal(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--saida", required=True)
    a = p.parse_args(argv)
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    rel: list[str] = [f"Conferência da V06006 (renda do responsável, Censo 2022, IBGE) em {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}", ""]
    achados: list[dict] = []
    cabecalho: list[str] = []

    def procurar(origem: str, linhas: list[str]) -> None:
        for l in linhas:
            if RE_VAR.search(l):
                rel.append(f"  {origem}: {l[:500]}")
                for v in re.findall(r"\bV0600[456]\b", l):
                    achados.append({"variavel": v, "arquivo": origem, "linha": l[:500]})

    # 1) o ZIP de renda por setor: membros e cabeçalho do CSV. O nome muda com a data da publicação
    # ("..._BR_20260508_csv.zip"): procura na listagem da pasta, e o nome sem data fica de reserva.
    url_zip = ZIP_RENDA
    try:
        nomes = [n for n in listar(PASTA_RENDA) if re.match(r"Agregados_por_setores_renda_responsavel_BR.*_csv\.zip$", n, re.IGNORECASE)]
        if nomes:
            url_zip = PASTA_RENDA + urllib.parse.quote(sorted(nomes)[-1])
    except Exception as e:  # noqa: BLE001
        rel.append(f"listagem da pasta FALHOU ({type(e).__name__}); tentando o nome sem data")
    try:
        rel.append(f"ZIP: {url_zip}")
        dados = baixar(url_zip)
        rel.append(f"  {len(dados)} bytes")
        with zipfile.ZipFile(io.BytesIO(dados)) as z:
            for info in z.infolist():
                rel.append(f"  membro: {info.filename} ({info.file_size} bytes)")
            for info in z.infolist():
                nome = info.filename
                if nome.lower().endswith(".csv"):
                    with z.open(info) as f:
                        primeira = f.readline().decode("utf-8", "replace").strip()
                        segunda = f.readline().decode("utf-8", "replace").strip()
                    sep = ";" if primeira.count(";") >= primeira.count(",") else ","
                    cabecalho = [c.strip().strip('"') for c in primeira.split(sep)]
                    rel.append(f"  cabeçalho de {nome}: {primeira}")
                    rel.append(f"  primeira linha de dados (setor, sem pessoa): {segunda[:300]}")
                elif nome.lower().endswith(EXTENSOES_DIC) and info.file_size <= MAX_DIC:
                    procurar(f"ZIP/{nome}", linhas_de(nome, z.read(info)))
    except Exception as e:  # noqa: BLE001 - registra e segue para as pastas
        rel.append(f"  FALHOU: {type(e).__name__}: {str(e)[:300]}")

    # 2) as pastas: listagem e dicionários
    for pasta in (PASTA_RENDA, PASTA_GERAL):
        rel.append("")
        rel.append(f"Pasta: {pasta}")
        try:
            nomes = listar(pasta)
        except Exception as e:  # noqa: BLE001
            rel.append(f"  listagem FALHOU: {type(e).__name__}: {str(e)[:300]}")
            continue
        for n in nomes:
            rel.append(f"  arquivo: {n}")
        for n in nomes:
            baixo = n.lower()
            if not baixo.endswith(EXTENSOES_DIC + (".zip",)) or not re.search(r"dicion|leia|nota|metod|renda", baixo):
                continue
            if baixo.endswith(".zip") and baixo.startswith("agregados_por_"):
                continue  # os ZIPs de dados (setores já lido acima; bairros, distritos... não trazem dicionário)
            url = pasta + urllib.parse.quote(n)
            try:
                dados = baixar(url, limite=MAX_DIC + 1)
            except Exception as e:  # noqa: BLE001
                rel.append(f"  {n}: download FALHOU: {type(e).__name__}")
                continue
            if len(dados) > MAX_DIC:
                rel.append(f"  {n}: maior que {MAX_DIC} bytes, não lido")
                continue
            if baixo.endswith(".zip"):
                if "renda" in baixo and pasta == PASTA_RENDA:
                    continue  # o ZIP de dados já foi lido acima
                try:
                    with zipfile.ZipFile(io.BytesIO(dados)) as z:
                        for info in z.infolist():
                            if info.filename.lower().endswith(EXTENSOES_DIC) and not info.filename.lower().endswith(".csv") and info.file_size <= MAX_DIC:
                                procurar(f"{n}/{info.filename}", linhas_de(info.filename, z.read(info)))
                except zipfile.BadZipFile:
                    rel.append(f"  {n}: ZIP inválido")
                continue
            procurar(n, linhas_de(n, dados))

    # 3) a nota metodológica da mediana (biblioteca do IBGE)
    rel.append("")
    rel.append(f"Nota metodológica: {NOTA_MEDIANA}")
    try:
        dados = baixar(NOTA_MEDIANA, limite=MAX_DIC + 1)
        linhas = linhas_pdf(dados)
        rel.append(f"  {len(dados)} bytes, {len(linhas)} linhas de texto")
        procurar("nota-metodologica-01-2026.pdf", linhas)
        for l in linhas[:40]:
            rel.append(f"  | {l[:300]}")
    except Exception as e:  # noqa: BLE001
        rel.append(f"  FALHOU: {type(e).__name__}: {str(e)[:300]}")

    v6 = [x for x in achados if x["variavel"] == "V06006"]
    melhor = next((x for x in v6 if descreve_mediana(x["linha"])), v6[0] if v6 else None)
    resumo = {
        "conferido_em": time.strftime("%Y-%m-%d", time.gmtime()),
        "fonte": url_zip,
        "cabecalho": cabecalho,
        "v06006_no_cabecalho": "V06006" in cabecalho,
        "v06006": ({"descricao": melhor["linha"], "arquivo": melhor["arquivo"], "mediana": descreve_mediana(melhor["linha"])} if melhor else None),
        "achados": achados[:60],
    }
    rel.append("")
    rel.append(f"RESULTADO: V06006 {'descrita como MEDIANA' if melhor and resumo['v06006']['mediana'] else ('citada, mas sem a palavra mediana' if melhor else 'NÃO encontrada em dicionário')}")
    (saida / "ibge-renda.txt").write_text("\n".join(rel) + "\n", encoding="utf-8")
    (saida / "ibge-renda.json").write_text(json.dumps(resumo, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    log("\n".join(rel[-3:]))
    return 0 if cabecalho or achados else 1


if __name__ == "__main__":
    sys.exit(principal())
