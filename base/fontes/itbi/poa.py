"""ITBI de Porto Alegre (SMF, dadosabertos.poa.br). Uso: python poa.py saida/itbi-porto-alegre.json

Um ZIP por ano no conjunto "ITBI" (o de "Imunidades e Benefícios Fiscais" fica de fora); usa os 2 anos mais
recentes. Licença no portal: Creative Commons Attribution (a confirmar com a prefeitura).
"""
from ckan import rodar
from comum import principal

FONTE = {
    "nome": "Prefeitura de Porto Alegre, Secretaria Municipal da Fazenda: transações com ITBI (dados abertos)",
    "url": "https://dadosabertos.poa.br/dataset/itbi",
    "via": "portal de dados abertos de Porto Alegre (CKAN)",
    "atribuicao": "Fonte: Prefeitura Municipal de Porto Alegre",
    "observacao": "valor e área como a prefeitura publica (ver valor_usado e area_usada)",
}

principal(lambda saida: rodar(saida, "Porto Alegre", "RS", ["https://dadosabertos.poa.br"], FONTE))
