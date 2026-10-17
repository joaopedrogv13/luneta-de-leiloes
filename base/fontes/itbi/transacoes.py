"""Arquivo de transações de ITBI (uma linha por transação) → colunas que agregar.py lê.

Cada prefeitura dá nomes diferentes às colunas; `padronizar` acha cada uma por palavras do nome (ver `CANDIDATOS`),
imprime no log qual coluna usou para cada papel (para conferir) e devolve o DataFrame padrão:
tipo (apartamento|casa|terreno|comercial), preco_m2, data (datetime), bairro, rua.

Regras:
- valor: o declarado na transação quando houver; senão a base de cálculo; senão a avaliação da prefeitura (o log e o
  campo `valor_usado` dizem qual foi);
- área: a privativa/útil/construída da unidade; para terreno, a do terreno;
- só compra e venda quando o arquivo diz a natureza da transação; transmissão de parte do imóvel (fração < 99%) sai;
- sem coluna de data, vale o ano do arquivo (`ano_padrao`), com a data no meio do ano.
"""
import pandas as pd

from comum import FORA_TIPO, casa_nome, coluna, data_br, log, numero_br, sem_acento, tipo_de

CANDIDATOS = {
    "valor": [
        ("valor", "transacao"), ("valor", "declarado"), ("valor", "venda"), ("valor", "negocio"), ("valor", "operacao"),
        ("valor", "compra"), ("base", "calculo"), ("valor", "avaliacao"), ("valor", "avaliado"), ("valor", "imovel"),
    ],
    "area": [
        ("area", "privativa"), ("area", "util"), ("area", "construida", "adquirida"), ("area", "construida"),
        ("area", "edificada"), ("area", "construcao"), ("area", "unidade"), ("area", "adquirida"),
    ],
    "area_terreno": [("area", "terreno", "adquirida"), ("area", "terreno"), ("area", "lote")],
    # parte do imóvel transmitida (não a fração ideal do terreno, que num apartamento é 0,02)
    "fracao": [("proporcao", "transmitida"), ("percentual", "transmit"), ("perc", "transmit"), ("fracao", "transmit"), ("parte", "transf"), ("parte", "transmit")],
    "data": [
        ("data", "transacao"), ("data", "quitacao"), ("data", "pagamento"), ("data", "escritura"), ("data", "registro"),
        ("data", "lancamento"), ("data", "guia"), ("data", "emissao"), ("data", "cadastro"), ("data",), ("dt",),
    ],
    "ano": [("ano", "transacao"), ("ano", "referencia"), ("ano", "pagamento"), ("ano",)],
    "mes": [("mes", "transacao"), ("mes", "referencia"), ("mes",)],
    "natureza": [("natureza", "transacao"), ("natureza",), ("tipo", "transacao"), ("especie", "transacao"), ("tipo", "operacao")],
    "bairro": [("bairro",)],
    "rua": [("nome", "logradouro"), ("logradouro",), ("endereco",), ("rua",)],
    # do mais específico ao mais geral: o primeiro que classificar a linha vale
    "tipos": [
        ("tipo", "imovel"), ("tipo", "construtivo"), ("tipologia",), ("finalidade",), ("tipo", "unidade"), ("descricao", "uso"),
        ("tipo", "uso"), ("uso",), ("tipo", "construcao"), ("descricao", "tipo"), ("tipo", "ocupacao"), ("destinacao",),
        ("ocupacao",), ("padrao",), ("tipo",),
    ],
}
EVITAR_VALOR = ("financ", "venal", "imposto", "aliquota", "desconto", "iptu", "recolhid", "pago_itbi", "valor_itbi", "m2", "metro")
EVITAR_LUGAR = ("codigo", "cod_", "_cod", "numero", "complemento", "cep", "tipo_logr", "id_")


def _primeira(df, papel, evitar=()):
    return coluna(df, *CANDIDATOS[papel], evitar=evitar)


def _todas(df, papel, evitar=()):
    vistas = []
    for grupo in CANDIDATOS[papel]:
        for c in df.columns:
            if c not in vistas and casa_nome(c, grupo, evitar):
                vistas.append(c)
    return vistas


def padronizar(df, ano_padrao=None, forcar=None):
    """DataFrame da prefeitura → (DataFrame padrão, descrição do que foi usado). `forcar` = {papel: nome da coluna}."""
    forcar = forcar or {}
    c_valor = forcar.get("valor") or _primeira(df, "valor", EVITAR_VALOR)
    c_area = forcar.get("area") or _primeira(df, "area", ("terreno", "lote", "comum", "total_terreno"))
    c_terreno = forcar.get("area_terreno") or _primeira(df, "area_terreno")
    c_fracao = forcar.get("fracao") or _primeira(df, "fracao")
    c_data = forcar.get("data") or _primeira(df, "data", ("nascimento", "construcao", "habite", "atualiza", "carga", "inclusao"))
    c_ano = forcar.get("ano") or _primeira(df, "ano", ("construcao", "constru", "nascimento", "ano_arquivo"))
    c_mes = forcar.get("mes") or _primeira(df, "mes")
    c_natureza = forcar.get("natureza") or _primeira(df, "natureza", ("imovel",))
    c_bairro = forcar.get("bairro") or _primeira(df, "bairro", EVITAR_LUGAR)
    c_rua = forcar.get("rua") or _primeira(df, "rua", EVITAR_LUGAR)
    c_tipos = forcar.get("tipos") or _todas(df, "tipos", ("transacao", "financ", "natureza", "logradouro", "valor", "area", "data", "codigo", "cod_"))
    usadas = {
        "valor": c_valor, "area": c_area, "area_terreno": c_terreno, "fracao": c_fracao, "data": c_data, "ano": c_ano,
        "mes": c_mes, "natureza": c_natureza, "bairro": c_bairro, "rua": c_rua, "tipos": c_tipos,
    }
    log(f"  colunas usadas: {usadas}")
    if not c_valor or not (c_area or c_terreno) or not c_tipos:
        raise RuntimeError(f"faltam colunas essenciais (valor, área ou tipo): {usadas}")

    base = df
    n0 = len(base)
    if c_natureza:
        nat = base[c_natureza].map(lambda v: sem_acento(v) if isinstance(v, str) else "")
        compra = nat.str.contains("compra") & ~nat.str.contains("arremat|leilao|doacao|permuta|dacao|heranca", regex=True)
        if compra.any():
            base = base[compra]
            log(f"  natureza: {len(base)} de {n0} são compra e venda")
        else:
            log(f"  natureza: nenhuma 'compra' em {base[c_natureza].value_counts().head(8).to_dict()}; sem filtro")
    if c_fracao:
        fr = numero_br(base[c_fracao])
        escala = 100 if fr.dropna().quantile(0.9) > 1.5 else 1
        inteiro = fr.isna() | (fr >= 0.99 * escala)
        log(f"  fração: {int((~inteiro).sum())} transmissões parciais fora (escala {escala})")
        base = base[inteiro]

    tipo = pd.Series([None] * len(base), index=base.index, dtype=object)
    for c in c_tipos:
        falta = tipo.isna()
        if not falta.any():
            break
        tipo[falta] = base.loc[falta, c].map(tipo_de)
    log(f"  tipos: {tipo.value_counts(dropna=False).to_dict()}")
    tipo = tipo.where(tipo != FORA_TIPO)

    valor = numero_br(base[c_valor])
    area = numero_br(base[c_area]) if c_area else pd.Series(float("nan"), index=base.index)
    terreno = numero_br(base[c_terreno]) if c_terreno else pd.Series(float("nan"), index=base.index)
    area_usada = area.where(tipo != "terreno", terreno)
    area_usada = area_usada.where(area_usada.notna() & (area_usada > 0), terreno if c_area is None else area)
    preco_m2 = valor / area_usada.where(area_usada >= 5)

    if c_data:
        data = data_br(base[c_data])
    elif c_ano:
        ano = pd.to_numeric(base[c_ano], errors="coerce")
        mes = pd.to_numeric(base[c_mes], errors="coerce").fillna(7) if c_mes else 7
        data = pd.to_datetime(pd.DataFrame({"year": ano, "month": mes, "day": 1}), errors="coerce")
    elif "_ano_arquivo" in base.columns and base["_ano_arquivo"].notna().any():
        ano = pd.to_numeric(base["_ano_arquivo"], errors="coerce")
        data = pd.to_datetime(pd.DataFrame({"year": ano, "month": 7, "day": 1}), errors="coerce")
        log("  sem coluna de data: vale o ano do arquivo (1º de julho)")
    elif ano_padrao:
        data = pd.Series(pd.Timestamp(year=int(ano_padrao), month=7, day=1), index=base.index)
    else:
        raise RuntimeError("sem data, sem ano e sem ano do arquivo")

    saida = pd.DataFrame({
        "tipo": tipo,
        "preco_m2": preco_m2,
        "data": data,
        "bairro": base[c_bairro].fillna("").astype(str) if c_bairro else "",
        "rua": base[c_rua].fillna("").astype(str) if c_rua else "",
    })
    # data impossível (digitação: 2099, 1900) mudaria a janela de 12 meses de agregar.py
    plausivel = (saida["data"] >= pd.Timestamp("2000-01-01")) & (saida["data"] <= pd.Timestamp.now() + pd.Timedelta(days=31))
    saida = saida[saida["tipo"].notna() & saida["data"].notna() & plausivel & saida["preco_m2"].notna()]
    log(f"  {len(saida)} transações com tipo, data e R$/m² (de {n0}); data de {saida['data'].min()} a {saida['data'].max()}")
    if len(saida):
        log(f"  R$/m² por tipo (mediana): {saida.groupby('tipo')['preco_m2'].median().round().to_dict()}")
    return saida, usadas
