"""Medição da nota de localização: grava base/saida/localizacao/medicao-nota.md.

- situação dos imóveis (calculada, aproximada, sem nota e o motivo), por precisão e por porte da cidade;
- distribuição das notas dos imóveis (as células, por construção, ficam uniformes: média ponderada perto de 50);
- cobertura por cidade: porte, OSM (pontos de ônibus contra as faces com ponto no Censo, estações, parques), BATER e o
  que ficou de fora da nota;
- validação com o ITBI (C11): correlação de Spearman entre a nota (e cada componente) no ponto de cada rua do ITBI e o
  preço mediano pago por m² nessa rua, nas 5 capitais com ITBI. Isso NÃO valida o interior.

Não publica nome nem endereço: só contagens, códigos e estatísticas.
"""
from __future__ import annotations

import collections
import math
import time
from pathlib import Path

import numpy as np

COMPONENTES = ["servicos", "transporte", "renda", "infra", "comercio", "lazer"]
ROTULO = {"servicos": "Serviços", "transporte": "Transporte", "renda": "Renda", "infra": "Infraestrutura", "comercio": "Comércio",
          "lazer": "Lazer"}
MOTIVO_TEXTO = {"cidade": "endereço só na cidade", "rural": "imóvel rural", "pequena": "cidade pequena (terços)",
                "sem_cidade": "cidade fora da base de cálculo", "poucas_celulas": "poucas células perto do bairro",
                "sem_ponto": "sem dado no ponto"}
PORTES = [(20_000, "menos de 20 mil"), (50_000, "20 a 50 mil"), (100_000, "50 a 100 mil"), (500_000, "100 a 500 mil"), (math.inf, "mais de 500 mil")]
MIN_RUAS = 30
MIN_TRANSACOES = 5


def pct(n: int, total: int) -> str:
    return f"{100 * n / total:.1f}%".replace(".", ",") if total else "—"


def num(n) -> str:
    return f"{n:,}".replace(",", ".")


def dec(x: float | None, casas: int = 2) -> str:
    return "—" if x is None or not math.isfinite(x) else f"{x:.{casas}f}".replace(".", ",")


def porte(moradores: int) -> str:
    for limite, nome in PORTES:
        if moradores < limite:
            return nome
    return PORTES[-1][1]


def spearman(a: list[float], b: list[float]) -> float | None:
    x = np.asarray(a, dtype=float)
    y = np.asarray(b, dtype=float)
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 10:
        return None
    from scipy.stats import spearmanr

    r = spearmanr(x[ok], y[ok]).statistic
    return float(r) if math.isfinite(r) else None


def gravar(caminho: Path, res: dict, imoveis: list[dict], tamanhos: dict, usar_v06006: bool, renda_info: dict | None, info_pois: dict,
           segundos: float) -> None:
    R = res["imoveis"]
    C = res["cidades"]
    L: list[str] = []
    w = L.append
    total = len(imoveis)
    w("# Medição da nota de localização")
    w("")
    w(f"Gerado em {time.strftime('%d/%m/%Y %H:%M', time.gmtime())} UTC por `base/fontes/localizacao/nota.py`, em {segundos:.0f} s. "
      f"{num(total)} imóveis do instantâneo, {num(len(C))} cidades. Método: README desta pasta (base/fontes/localizacao/README.md).")
    w("")
    w(f"- Renda: **{'V06006 (mediana por setor, confirmada no dicionário do IBGE)' if usar_v06006 else 'V06004 (média dos responsáveis com rendimento)'}**, valores de 2022."
      + ("" if usar_v06006 else (" A V06006 não foi confirmada como mediana no dicionário do IBGE" + (f" (conferido em {renda_info.get('conferido_em')}: {((renda_info.get('v06006') or {}).get('descricao') or 'sem descrição')[:200]})" if renda_info else " (a etapa ibge ainda não rodou)") + ".")))
    w(f"- OpenStreetMap: {'sim, dados de ' + str((info_pois.get('osm') or {}).get('data')) if res.get('tem_osm') else 'não (transporte só com o ponto de ônibus na face do Censo; lazer fora)'}.")
    if tamanhos:
        w("- Arquivos do site: " + ", ".join(f"`{k}` {v / 1024:.0f} KB" for k, v in tamanhos.items()) + ".")
    w("")

    # ---- situação
    w("## Situação dos imóveis")
    w("")
    sit = collections.Counter(R[i["id"]]["situacao"] for i in imoveis)
    mot = collections.Counter(R[i["id"]]["motivo"] for i in imoveis if R[i["id"]]["situacao"] == "sem_nota")
    w("| Situação | Imóveis | % |")
    w("|---|---|---|")
    for s in ("calculada", "aproximada", "sem_nota"):
        w(f"| {s} | {num(sit.get(s, 0))} | {pct(sit.get(s, 0), total)} |")
    for m, n in mot.most_common():
        w(f"| · sem nota: {MOTIVO_TEXTO.get(m, m)} | {num(n)} | {pct(n, total)} |")
    w("")
    w("Por precisão do ponto:")
    w("")
    w("| Precisão | Imóveis | Calculada | Aproximada | Sem nota |")
    w("|---|---|---|---|---|")
    for p in ("numero", "rua", "bairro", "cidade"):
        xs = [R[i["id"]] for i in imoveis if R[i["id"]]["precisao"] == p]
        c = collections.Counter(x["situacao"] for x in xs)
        w(f"| {p} | {num(len(xs))} | {num(c.get('calculada', 0))} | {num(c.get('aproximada', 0))} | {num(c.get('sem_nota', 0))} |")
    w("")
    w("Por porte da cidade (moradores na grade 2022):")
    w("")
    w("| Porte | Cidades | Imóveis | Com nota (calculada ou aproximada) |")
    w("|---|---|---|---|")
    por_porte = collections.defaultdict(lambda: [0, 0, 0])
    for code, cc in C.items():
        por_porte[porte(cc["moradores"])][0] += 1
    for i in imoveis:
        x = R[i["id"]]
        cc = C.get(x["cidade"])
        if not cc:
            continue
        g = por_porte[porte(cc["moradores"])]
        g[1] += 1
        g[2] += x["situacao"] in ("calculada", "aproximada")
    for _, nome in PORTES:
        g = por_porte[nome]
        w(f"| {nome} | {num(g[0])} | {num(g[1])} | {num(g[2])} ({pct(g[2], g[1])}) |")
    w("")

    # ---- distribuição
    w("## Distribuição das notas")
    w("")
    notas = np.array([R[i["id"]]["nota"] for i in imoveis if R[i["id"]]["situacao"] == "calculada"], dtype=float)
    aprox = np.array([R[i["id"]]["nota"] for i in imoveis if R[i["id"]]["situacao"] == "aproximada"], dtype=float)
    larguras = np.array([R[i["id"]]["faixa"][1] - R[i["id"]]["faixa"][0] for i in imoveis if R[i["id"]]["situacao"] == "aproximada"], dtype=float)
    if len(notas):
        q = np.percentile(notas, [10, 25, 50, 75, 90])
        w(f"Imóveis com nota calculada ({num(len(notas))}): média {dec(notas.mean(), 1)}; p10 {q[0]:.0f}, p25 {q[1]:.0f}, mediana {q[2]:.0f}, p75 {q[3]:.0f}, p90 {q[4]:.0f}.")
        w("")
        hist = np.histogram(notas, bins=[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 101])[0]
        w("| Faixa | " + " | ".join(f"{a}–{a + 9}" if a < 90 else "90–100" for a in range(0, 100, 10)) + " |")
        w("|---|" + "---|" * 10)
        w("| Imóveis | " + " | ".join(num(int(h)) for h in hist) + " |")
        w("")
    if len(aprox):
        w(f"Aproximadas ({num(len(aprox))}): meio da faixa com mediana {np.median(aprox):.0f}; largura da faixa mediana de {np.median(larguras):.0f} pontos (p90 {np.percentile(larguras, 90):.0f}).")
        w("")
    # conferência: as células da cidade ficam uniformes por construção
    medias = []
    for cc in C.values():
        v, p = cc["notas_celulas"], cc["pop_celulas"]
        ok = np.isfinite(v)
        if ok.any() and p[ok].sum() > 0:
            medias.append(float(np.average(v[ok], weights=p[ok])))
    if medias:
        w(f"Conferência: a nota média das células, pesada pelos moradores, fica em {dec(float(np.median(medias)), 1)} na cidade típica (o percentil com ranking médio dá 50 por construção).")
        w("")

    # ---- cobertura
    w("## Cobertura por cidade")
    w("")
    n = len(C)
    pequenas = sum(1 for cc in C.values() if cc["pequena"])
    bater = sum(1 for cc in C.values() if cc["bater"])
    fora = collections.Counter((comp, motivo) for cc in C.values() for comp, motivo in cc["fora"].items())
    onibus_ok = sum(1 for cc in C.values() if "onibus_500" in cc["incluidos"].get("transporte", []))
    estacao = sum(1 for cc in C.values() if "estacao_m" in cc["incluidos"].get("transporte", []))
    parque = sum(1 for cc in C.values() if cc["incluidos"].get("lazer"))
    w(f"- Cidades: {num(n)}; pequenas (menos de 20 mil moradores ou 50 células habitadas, só terços): {num(pequenas)} ({pct(pequenas, n)}).")
    w(f"- Pontos de ônibus do OSM usados (pontos do OSM dentro das células habitadas da cidade em número de pelo menos 10% das "
      f"faces com ponto de ônibus do Censo, e o morador típico com pelo menos 1 ponto mapeado a 500 m): {num(onibus_ok)} cidades "
      f"({pct(onibus_ok, n)}); nas outras, só o Censo.")
    w(f"- Com estação, barca ou terminal mapeado no OSM: {num(estacao)} ({pct(estacao, n)}). Com parque, praça ou parquinho: {num(parque)} ({pct(parque, n)}).")
    w(f"- Com mapeamento de risco do BATER: {num(bater)} ({pct(bater, n)}); nas outras, \"sem mapeamento de risco para esta cidade\" (nunca \"sem risco\").")
    if fora:
        w("- Componentes fora da nota (peso redistribuído): " + "; ".join(f"{ROTULO[c]} ({m}): {num(k)} cidades" for (c, m), k in fora.most_common()) + ".")
    alertas = sum(1 for i in imoveis if R[i["id"]].get("risco_m") is not None)
    w(f"- Imóveis com alerta de área de risco mapeada perto (BATER): {num(alertas)}.")
    dom = res.get("domicilios") or {}
    if dom.get("domicilios"):
        w(f"- Domicílios do CNEFE (cidades da base e vizinhas): {num(dom['domicilios'])}. Com o código de setor fora dos agregados "
          f"de 2022 (o CNEFE grava o setor da malha da coleta): {num(dom['setor_fora_dos_agregados'])} "
          f"({pct(dom['setor_fora_dos_agregados'], dom['domicilios'])}); {num(dom['recuperados_pelo_poligono'])} recebem o setor do "
          f"polígono da malha 2022 em que caem; ficam sem setor {num(dom['sem_setor'])} ({pct(dom['sem_setor'], dom['domicilios'])}).")
    inc = sum(1 for i in imoveis if (R[i["id"]].get("perda") or 0) > 0.30)
    w(f"- Imóveis com mais de 30% dos domicílios do raio sem a renda do setor (setor em sigilo ou sem setor; renda incompleta): {num(inc)}.")
    sem_renda = sum(1 for i in imoveis if R[i["id"]]["situacao"] == "calculada" and R[i["id"]]["comp"].get("renda") is None)
    w(f"- Imóveis com nota calculada sem a parte de renda (nenhum domicílio com dado a 1 km; peso redistribuído): {num(sem_renda)}.")
    w("")
    w("Maiores cidades da base (cobertura do OSM: pontos de ônibus do OSM ÷ faces com ponto de ônibus no Censo):")
    w("")
    w("| Cidade | Moradores | Células | Imóveis | Ônibus OSM/Censo | Estações | Lazer | BATER | Fora |")
    w("|---|---|---|---|---|---|---|---|---|")
    for cc in sorted(C.values(), key=lambda x: -x["imoveis"])[:25]:
        cob = cc["cobertura"]
        w(f"| {cc['nome']}/{cc['uf']} | {num(cc['moradores'])} | {num(cc['celulas'])} | {num(cc['imoveis'])} | {dec(cob.get('onibus_razao'), 2)} | "
          f"{num(int(cob.get('estacoes', 0)))} | {num(int(cob.get('lazer', 0)))} | {'sim' if cc['bater'] else 'não'} | {', '.join(cc['fora']) or '—'} |")
    w("")
    cont = info_pois.get("contagem") or {}
    if cont:
        w("Pontos de serviço lidos (cidades da base e vizinhas): " + ", ".join(f"{k} {num(v)}" for k, v in sorted(cont.items())) + ".")
        w("")

    # ---- validação
    w("## Validação com o ITBI (Spearman)")
    w("")
    w("Para cada rua do ITBI com ponto no CNEFE (nome casado pela mesma normalização do site; nome que se repete a mais de "
      "1,5 km fica fora), a nota foi calculada no ponto da rua como se fosse um imóvel e comparada com o preço mediano pago "
      f"por m² na rua (ruas com pelo menos {MIN_TRANSACOES} transações do tipo). Correlação de postos de Spearman: 1 = a ordem "
      "da nota é a mesma do preço; 0 = sem relação; negativo = puxa contra o preço. O preço NÃO entra na nota (é circular): "
      "serve só para ver se os pesos fazem sentido. **Isso vale para as 5 capitais e não valida a nota no interior (C11).**")
    w("")
    colunas = ["nota", *[f"c_{c}" for c in COMPONENTES]]
    w("| Cidade | Tipo | Ruas | Nota | " + " | ".join(ROTULO[c] for c in COMPONENTES) + " |")
    w("|---|---|---|---|" + "---|" * len(COMPONENTES))
    resumo = collections.defaultdict(list)
    for code, lista in res["validacao"].items():
        cc = C.get(code)
        for tipo in ("apartamento", "casa"):
            pares = [(r, r["tipos"][tipo]["mediana"]) for r in lista if tipo in r["tipos"] and r["tipos"][tipo]["n"] >= MIN_TRANSACOES]
            if len(pares) < MIN_RUAS:
                continue
            precos = [p for _, p in pares]
            linha = []
            for col in colunas:
                rho = spearman([r[col] for r, _ in pares], precos)
                linha.append(rho)
                if rho is not None:
                    resumo[col].append(rho)
            w(f"| {cc['nome'] if cc else code} | {tipo} | {num(len(pares))} | " + " | ".join(dec(x) for x in linha) + " |")
    w("")
    if resumo:
        w("Mediana entre as linhas: " + "; ".join(f"{'nota' if c == 'nota' else ROTULO[c[2:]]} {dec(float(np.median(v)))}" for c, v in resumo.items()) + ".")
        w("")
    # sensibilidade: a nota com outros pesos, nas mesmas ruas
    nomes_alt = sorted({k for lista in res["validacao"].values() for r in lista[:1] for k in r if k.startswith("alt:")})
    if nomes_alt:
        w("### Sensibilidade dos pesos")
        w("")
        w("A mesma validação com a nota recalculada com outros pesos (cada linha é uma cidade e um tipo, como acima). "
          "\"Renda 30\" e \"sem renda\" só servem de comparação: a renda acompanha o preço de perto e pesar mais nela "
          "transformaria a nota numa medida de renda.")
        w("")
        cab = ["Pesos (serviços/transporte/renda/infra/comércio/lazer)", "Mediana", "Mínimo", "Linhas negativas"]
        w("| " + " | ".join(cab) + " |")
        w("|---|---|---|---|")
        pesos_alt = res.get("alternativas") or {}
        for nome in nomes_alt:
            rhos = []
            for code, lista in res["validacao"].items():
                for tipo in ("apartamento", "casa"):
                    pares = [(r, r["tipos"][tipo]["mediana"]) for r in lista if tipo in r["tipos"] and r["tipos"][tipo]["n"] >= MIN_TRANSACOES]
                    if len(pares) < MIN_RUAS:
                        continue
                    rho = spearman([r[nome] for r, _ in pares], [p for _, p in pares])
                    if rho is not None:
                        rhos.append(rho)
            p = pesos_alt.get(nome[4:])
            rotulo = nome[4:] + (f" ({'/'.join(str(p[c]) for c in COMPONENTES)})" if p else "")
            if rhos:
                w(f"| {rotulo} | {dec(float(np.median(rhos)))} | {dec(min(rhos))} | {sum(1 for x in rhos if x < 0)} de {len(rhos)} |")
        w("")
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(L) + "\n", encoding="utf-8")
