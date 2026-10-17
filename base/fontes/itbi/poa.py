"""ITBI de Porto Alegre (SMF, dadosabertos.poa.br). Uso: python poa.py saida/itbi-porto-alegre.json

Um ZIP por ano no conjunto "ITBI" (o de "Imunidades e Benefícios Fiscais" fica de fora); usa os 2 anos mais
recentes. Colunas lidas: finalidade_construcao (APARTAMENTO, RESIDENCIA ISOLADA, SALA COMERCIAL...; vagas de
estacionamento e apart-hotel ficam de fora), base_de_calculo (a estimativa fiscal da prefeitura), área construída
privativa, perc_transmitido (só 100%) e data_pagamento (guia paga: a transação aconteceu; estimativa sem pagamento
fica de fora). Sem construção e com terreno: terreno. Licença no portal: Creative Commons Attribution (a confirmar
com a prefeitura).
"""
import pandas as pd

from ckan import rodar
from comum import numero_br, principal

FONTE = {
    "nome": "Prefeitura de Porto Alegre, Secretaria Municipal da Fazenda: transações com ITBI (dados abertos)",
    "url": "https://dadosabertos.poa.br/dataset/itbi",
    "via": "portal de dados abertos de Porto Alegre (CKAN)",
    "atribuicao": "Fonte: Prefeitura Municipal de Porto Alegre",
    "observacao": "valor = base de cálculo (estimativa fiscal); área construída privativa; só guias pagas",
}


def preparar(df):
    df = df.copy()
    sem_construcao = df["finalidade_construcao"].isna() & ~(numero_br(df["area_constr_total"]) > 0) & (numero_br(df["area_total_terreno"]) > 0)
    df["_tipo_terreno"] = pd.Series(None, index=df.index, dtype=object).where(~sem_construcao, "TERRENO")
    return df


principal(lambda saida: rodar(
    saida, "Porto Alegre", "RS", ["https://dadosabertos.poa.br"], FONTE, preparar=preparar,
    forcar={"tipos": ["finalidade_construcao", "_tipo_terreno"], "valor": "base_de_calculo", "data": "data_pagamento", "fracao": "perc_transmitido"},
))
