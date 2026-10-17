"""Descobre onde estão os arquivos de ITBI de cada prefeitura (portais CKAN e o MapServer do Rio).
Só lê catálogos públicos e imprime o que achou; não baixa os dados. Uso: python explorar.py saida/explorar.json
"""
import json
import sys

import requests

UA = {"User-Agent": "LunetaDeLeiloes/0.1 (+contato)"}
CKAN = {
    "Recife": "https://dados.recife.pe.gov.br",
    "Porto Alegre": "https://dadosabertos.poa.br",
    "Belo Horizonte": "https://dados.pbh.gov.br",
    "Fortaleza": "https://dados.fortaleza.ce.gov.br",
}
saida = {}
for cidade, base in CKAN.items():
    try:
        r = requests.get(f"{base}/api/3/action/package_search", params={"q": "itbi", "rows": 10}, headers=UA, timeout=60)
        dados = r.json()["result"]["results"]
        saida[cidade] = [
            {
                "titulo": p.get("title"),
                "licenca": p.get("license_title"),
                "modificado": p.get("metadata_modified"),
                "recursos": [
                    {"nome": x.get("name"), "formato": x.get("format"), "url": x.get("url"), "modificado": x.get("last_modified") or x.get("created"), "tamanho": x.get("size")}
                    for x in p.get("resources", [])
                ],
            }
            for p in dados
        ]
    except Exception as erro:
        saida[cidade] = {"erro": f"{type(erro).__name__}: {erro}"[:500]}
    print(cidade, "ok" if isinstance(saida[cidade], list) else saida[cidade], flush=True)

rio = {}
for nome, url in {
    "mapserver": "https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Fazenda/ITBI/MapServer?f=json",
    "pagina": "https://fazenda.prefeitura.rio/itbi-valores-medios-por-m2-de-transacoes-imobiliarias-por-trecho-de-logradouro/",
}.items():
    try:
        r = requests.get(url, headers=UA, timeout=60)
        if nome == "mapserver":
            j = r.json()
            rio[nome] = {"camadas": j.get("layers"), "tabelas": j.get("tables")}
            for camada in (j.get("layers") or [])[:6]:
                info = requests.get(url.replace("?f=json", f"/{camada['id']}?f=json"), headers=UA, timeout=60).json()
                rio[f"camada_{camada['id']}"] = {"nome": info.get("name"), "campos": [(c.get("name"), c.get("type")) for c in info.get("fields") or []], "maxRecordCount": info.get("maxRecordCount")}
                amostra = requests.get(url.replace("?f=json", f"/{camada['id']}/query"), params={"where": "1=1", "outFields": "*", "resultRecordCount": 3, "returnGeometry": "false", "f": "json"}, headers=UA, timeout=60).json()
                rio[f"amostra_{camada['id']}"] = amostra.get("features", amostra)
                contagem = requests.get(url.replace("?f=json", f"/{camada['id']}/query"), params={"where": "1=1", "returnCountOnly": "true", "f": "json"}, headers=UA, timeout=60).json()
                rio[f"contagem_{camada['id']}"] = contagem
        else:
            import re
            rio[nome] = sorted(set(re.findall(r'href="([^"]+\.(?:xlsx|xls|csv|ods|zip))"', r.text, flags=re.I)))[:30]
    except Exception as erro:
        rio[nome] = {"erro": f"{type(erro).__name__}: {erro}"[:500]}
    print("Rio", nome, "ok" if "erro" not in rio[nome] else rio[nome], flush=True)
saida["Rio de Janeiro"] = rio

with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(saida, f, ensure_ascii=False, indent=1)
