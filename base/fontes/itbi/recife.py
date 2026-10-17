"""ITBI do Recife (Secretaria de Finanças, portal de dados abertos, licença ODbL). Uso: python recife.py saida/itbi-recife.json

Um CSV por ano no conjunto "Imposto sobre Transmissão de Bens Imóveis (ITBI)"; usa os 2 anos mais recentes.
"""
from ckan import rodar
from comum import principal

FONTE = {
    "nome": "Prefeitura do Recife, Secretaria de Finanças: transações com ITBI (dados abertos)",
    "url": "https://dados.recife.pe.gov.br/dataset/imposto-sobre-transmissao-de-bens-imoveis-itbi",
    "via": "portal de dados abertos do Recife (CKAN)",
    "atribuicao": "Contém informações da Prefeitura do Recife, disponíveis sob a Open Database License (ODbL)",
    "observacao": "valor e área como a prefeitura publica (ver valor_usado e area_usada)",
}

principal(lambda saida: rodar(saida, "Recife", "PE", ["https://dados.recife.pe.gov.br"], FONTE))
