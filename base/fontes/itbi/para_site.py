"""Converte os resultados do workflow (itbi-*.json, formato de agregar.py) nos arquivos que o site lê.

  git fetch origin coletas-dados && git archive origin/coletas-dados itbi | tar -x -C /tmp/coletas
  python3 base/fontes/itbi/para_site.py --de /tmp/coletas/itbi [--para base/saida/site/itbi]

Saída: <para>/<uf>-<cidade>.json.gz (ex.: sp-sao-paulo.json.gz), gzip nível 9 e mtime zero (mesmo conteúdo, mesmos
bytes), com {formato: "luneta-itbi", versao: 1} acrescentados. Confere o formato antes de gravar (arquivo
incompleto é recusado e nada é gravado) e tira os "bairros" que são torre, bloco ou edifício (o arquivo de SP mistura
o complemento no bairro). Só stdlib (roda sem pandas).
"""
import argparse
import glob
import gzip
import io
import json
import os
import re
import sys
import unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from normalizar import bairro_valido  # noqa: E402

TIPOS = {"apartamento", "casa", "terreno", "comercial"}
PADRAO = os.path.join(AQUI, "..", "..", "saida", "site", "itbi")


def slug(texto):
    t = unicodedata.normalize("NFD", texto)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def conferir_estat(e, onde):
    for campo in ("n", "media", "mediana", "p25", "p75"):
        if not isinstance(e.get(campo), (int, float)):
            raise ValueError(f"{onde}: '{campo}' ausente ou não numérico")
    if not (e["p25"] <= e["mediana"] <= e["p75"]):
        raise ValueError(f"{onde}: quartis fora de ordem")


def conferir_tipos(tipos, onde):
    if not isinstance(tipos, dict):
        raise ValueError(f"{onde}: tipos ausentes")
    for tipo, e in tipos.items():
        if tipo not in TIPOS:
            raise ValueError(f"{onde}: tipo desconhecido {tipo!r}")
        conferir_estat(e, f"{onde}/{tipo}")


def converter(d):
    for campo in ("cidade", "uf", "fonte", "cidade_tipos", "bairros", "ruas"):
        if campo not in d:
            raise ValueError(f"campo '{campo}' ausente")
    if not re.fullmatch(r"[A-Z]{2}", d["uf"]):
        raise ValueError(f"UF inválida {d['uf']!r}")
    fonte = d["fonte"]
    periodo = fonte.get("periodo")
    if not (isinstance(periodo, list) and len(periodo) == 2 and all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", p or "") for p in periodo)):
        raise ValueError(f"período inválido {periodo!r}")
    if not isinstance(fonte.get("transacoes"), int) or not fonte.get("nome") or not fonte.get("url", "").startswith("https://"):
        raise ValueError("fonte sem nome, url https ou total de transações")
    conferir_tipos(d["cidade_tipos"], "cidade")
    bairros = {}
    for chave, b in d["bairros"].items():
        if not bairro_valido(chave):
            continue
        conferir_tipos(b.get("tipos"), f"bairro {chave}")
        bairros[chave] = b
    for chave, r in d["ruas"].items():
        conferir_tipos(r.get("tipos"), f"rua {chave}")
    return {"formato": "luneta-itbi", "versao": 1, **{k: d[k] for k in ("cidade", "uf", "fonte", "cidade_tipos")}, "bairros": bairros, "ruas": d["ruas"]}


def gravar_gz(caminho, valor):
    bruto = json.dumps(valor, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", compresslevel=9, mtime=0, filename="") as g:
        g.write(bruto)
    temporario = f"{caminho}.{os.getpid()}.tmp"
    with open(temporario, "wb") as f:
        f.write(buffer.getvalue())
    os.replace(temporario, caminho)
    return len(buffer.getvalue())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--de", required=True, help="pasta com itbi-*.json (resultado do workflow)")
    ap.add_argument("--para", default=PADRAO, help="pasta do site (padrão base/saida/site/itbi)")
    a = ap.parse_args()
    arquivos = sorted(glob.glob(os.path.join(a.de, "itbi-*.json")))
    if not arquivos:
        print(f"nenhum itbi-*.json em {a.de}")
        return 1
    convertidos = []
    for arq in arquivos:
        with open(arq, encoding="utf-8") as f:
            d = json.load(f)
        try:
            convertidos.append(converter(d))
        except ValueError as e:
            print(f"RECUSADO {arq}: {e}")
            return 1
    os.makedirs(a.para, exist_ok=True)
    for c in convertidos:
        nome = f"{c['uf'].lower()}-{slug(c['cidade'])}.json.gz"
        tamanho = gravar_gz(os.path.join(a.para, nome), c)
        f = c["fonte"]
        print(f"{nome}: {f['transacoes']} transações de {f['periodo'][0]} a {f['periodo'][1]}, {len(c['bairros'])} bairros, {len(c['ruas'])} ruas, {tamanho // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
