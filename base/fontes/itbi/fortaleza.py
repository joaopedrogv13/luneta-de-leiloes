"""ITBI de Fortaleza (SEFIN, portal de dados abertos, licença CC-BY). Uso: python fortaleza.py saida/itbi-fortaleza.json

Um CSV único com todas as guias de ITBI ("dados_abertos_itbi_transacoes_imobiliarias.csv", ~95 mil linhas desde 2022).
O arquivo não diz se o imóvel residencial é casa ou apartamento; a Luneta usa a fração ideal do terreno: abaixo de 1
(unidade em condomínio) conta como apartamento, inteira como casa. Uso "Sem" (sem construção) é terreno; comercial
e prestação de serviço são comercial; hotelaria, saúde, ensino, templo etc. ficam de fora.
Valor: VL_BASE_CALCULO (base do imposto: o maior entre o declarado e o venal). Data: a do cadastro da guia de ITBI
(DATA_CADASTRAMENTO_GI_IMOVEL; a da transação só vem em 11% das linhas).
"""
import pandas as pd

from ckan import rodar
from comum import numero_br, principal, sem_acento

FONTE = {
    "nome": "Prefeitura de Fortaleza, Secretaria das Finanças: transações imobiliárias com ITBI (dados abertos)",
    "url": "https://dados.fortaleza.ce.gov.br/dataset/imposto-sobre-transmissao-de-bens-imoveis-itbi",
    "via": "portal de dados abertos de Fortaleza (CKAN)",
    "atribuicao": "Fonte: Prefeitura Municipal de Fortaleza (CC-BY)",
    "observacao": "valor = base de cálculo do ITBI; apartamento x casa pela fração ideal (o arquivo não diz); data = cadastro da guia",
}


def preparar(df):
    uso = df["TIPO_USO_IMOVEL"].map(lambda v: sem_acento(v) if isinstance(v, str) else "")
    fracao = numero_br(df["FRACAO_IDEAL"])
    tipo = pd.Series("fora", index=df.index, dtype=object)
    residencial = uso.str.startswith("residencial")
    tipo[residencial & (fracao < 0.999)] = "apartamento"
    tipo[residencial & (fracao >= 0.999)] = "casa"
    tipo[uso.isin(["comercial", "prestacao"]) | uso.str.startswith("prestacao")] = "comercial"
    tipo[uso == "sem"] = "terreno"
    df = df.copy()
    df["_tipo_imovel"] = tipo
    return df


principal(lambda saida: rodar(
    saida, "Fortaleza", "CE", ["https://dados.fortaleza.ce.gov.br"], FONTE, preparar=preparar,
    forcar={"tipos": ["_tipo_imovel"], "valor": "VL_BASE_CALCULO", "area": "AREA_EDIFICADA", "area_terreno": "AREA_TERRENO", "data": "DATA_CADASTRAMENTO_GI_IMOVEL"},
))
