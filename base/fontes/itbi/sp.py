"""ITBI da cidade de São Paulo (Secretaria Municipal da Fazenda), lido com a biblioteca dadosimob (MIT).

Últimos 12 meses de compra e venda do imóvel inteiro (sp.clean(only_sales=True) + preco_m2 preenchido).
Uso: python sp.py saida/itbi-sp.json
"""
import json
import sys
from datetime import date

import pandas as pd
from dadosimob.itbi import sp

from agregar import agregar

TIPOS = {"apartamento": "apartamento", "casa": "casa", "terreno": "terreno", "comercial": "comercial", "industrial": "comercial"}

ano = date.today().year
frames = []
for a in (ano - 1, ano):
    try:
        df = sp.clean(sp.read(a), only_sales=True)
        frames.append(df)
        print(f"SP {a}: {len(df)} vendas", flush=True)
    except Exception as erro:  # o arquivo do ano corrente pode ainda não existir
        print(f"SP {a}: sem arquivo ({erro})", flush=True)
df = pd.concat(frames, ignore_index=True)
print("colunas:", list(df.columns), flush=True)
df = pd.DataFrame({
    "tipo": df["tipo_imovel"].map(TIPOS),
    "preco_m2": pd.to_numeric(df["preco_m2"], errors="coerce"),
    "data": pd.to_datetime(df["data_transacao"], errors="coerce", dayfirst=True),
    "bairro": df.get("bairro", pd.Series(dtype=str)).fillna(""),
    "rua": df.get("logradouro", pd.Series(dtype=str)).fillna(""),
})
df = df[df["tipo"].notna() & df["data"].notna()]
resultado = agregar(df, "São Paulo", "SP", {
    "nome": "Prefeitura de São Paulo, Secretaria Municipal da Fazenda: transações com ITBI pago (dados abertos)",
    "url": "https://prefeitura.sp.gov.br/web/fazenda/w/acesso_a_informacao/31501",
    "via": "biblioteca dadosimob (MIT)",
    "observacao": "área construída do IPTU (não a área útil); só compra e venda do imóvel inteiro",
})
with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(resultado, f, ensure_ascii=False)
print(f"SP: {resultado['fonte']['transacoes']} transações, {len(resultado['bairros'])} bairros, {len(resultado['ruas'])} ruas", flush=True)
