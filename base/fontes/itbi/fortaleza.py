"""ITBI de Fortaleza (SEFIN, portal de dados abertos, licença CC-BY). Uso: python fortaleza.py saida/itbi-fortaleza.json

Um CSV único com todas as transações ("dados_abertos_itbi_transacoes_imobiliarias.csv"); vale o último ano de dados.
"""
from ckan import rodar
from comum import principal

FONTE = {
    "nome": "Prefeitura de Fortaleza, Secretaria das Finanças: transações imobiliárias com ITBI (dados abertos)",
    "url": "https://dados.fortaleza.ce.gov.br/dataset/imposto-sobre-transmissao-de-bens-imoveis-itbi",
    "via": "portal de dados abertos de Fortaleza (CKAN)",
    "atribuicao": "Fonte: Prefeitura Municipal de Fortaleza (CC-BY)",
    "observacao": "valor e área como a prefeitura publica (ver valor_usado e area_usada)",
}

principal(lambda saida: rodar(saida, "Fortaleza", "CE", ["https://dados.fortaleza.ce.gov.br"], FONTE))
