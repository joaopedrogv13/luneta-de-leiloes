"""Medição e validação da geocodificação: grava base/saida/localizacao/medicao-geocode.md.

- distribuição da precisão (geral, por degrau e motivo, por UF, por porte da cidade), lado a lado com os números da
  verificação (r4-fontes-verificacao.md, regras C2 sem os degraus novos: número 51,1% / rua 7,9% / bairro 24,0% /
  cidade 16,8%);
- validação automática (o que dá para conferir sem ir à rua): numa amostra sorteada de 60 imóveis "numero" e 60
  "rua" (semente fixa), e também em todos os "numero" e "rua":
  1. o ponto cai no polígono do bairro informado (bairros do IBGE 2022, onde o IBGE delimita bairros)?
  2. o setor censitário do ponto (CNEFE) é do mesmo bairro informado (nome do bairro do setor no Censo 2022)?
  3. o número interpolado fica entre dois números vizinhos do CNEFE na mesma rua, perto deles?

Não publica endereço: as listas trazem o id do imóvel, a cidade e o resultado da conferência.
"""
from __future__ import annotations

import collections
import random
import re
import time
from pathlib import Path

import geocodificar as gc
import endereco as en
import entradas as ent

VERIFICACAO = {"numero": 51.1, "rua": 7.9, "bairro": 24.0, "cidade": 16.8}
PESQUISA = {"numero": 54.7, "rua": 12.2, "bairro": 18.5, "cidade": 14.5}
VERIFICACAO_PORTE = {"menos de 20 mil": 46.5, "20 a 50 mil": 47.2, "50 a 100 mil": 51.3, "100 a 500 mil": 73.0, "mais de 500 mil": 80.3}
ORDEM_PORTE = ["menos de 20 mil", "20 a 50 mil", "50 a 100 mil", "100 a 500 mil", "mais de 500 mil", "desconhecido"]
AMOSTRA = 60
SEMENTE = 20261018


def pct(n: int, total: int) -> str:
    return f"{100 * n / total:.1f}%".replace(".", ",") if total else "—"


def num(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def tabela(cabecalho: list[str], linhas: list[list[str]]) -> str:
    saida = ["| " + " | ".join(cabecalho) + " |", "|" + "|".join("---" for _ in cabecalho) + "|"]
    saida += ["| " + " | ".join(str(c) for c in l) + " |" for l in linhas]
    return "\n".join(saida)


def grupo_degrau(degrau: str | None) -> str:
    """"dn03" → "dn" (os níveis do geocodebr juntos); os degraus nossos ficam como estão."""
    return degrau[:2] if degrau and re.fullmatch(r"[dp][a-z]\d\d", degrau) else (degrau or "-")


def distribuicao(itens: list[dict]) -> dict[str, int]:
    c = collections.Counter(i["resultado"]["precisao"] for i in itens)
    return {k: c.get(k, 0) for k in gc.ORDEM_PRECISAO}


# ---------------------------------------------------------------------------------------------------------------------
# Conferências
# ---------------------------------------------------------------------------------------------------------------------


def setores_bairro(caminho: Path, setores: set[str]) -> dict[str, str | None]:
    """Nome do bairro (Censo 2022) de cada setor."""
    import duckdb

    if not caminho.exists() or not setores:
        return {}
    lista = ",".join(s for s in setores if s and s.isdigit())
    return {str(int(c)): n for c, n in duckdb.sql(
        f"SELECT code_tract, name_neighborhood FROM read_parquet('{caminho.as_posix()}') WHERE code_tract IN ({lista})"
    ).fetchall()}


def conferir_setor(p: dict, nomes: dict[str, str | None]) -> str | None:
    setor = p["resultado"].get("setor")
    if not setor or setor not in nomes or not p.get("bairro"):
        return None
    nome = nomes[setor]
    if not nome:
        return "setor sem bairro"
    casado, _ = gc.casar_localidade(gc.formas_do_bairro(p["bairro"]), {en.chave(nome): 1}, None, p.get("cidade"))
    return "mesmo bairro" if casado else "outro bairro"


def conferir_interpolacao(itens: list[dict]) -> dict[str, str]:
    """Para os números interpolados (da*/pa*): os vizinhos do CNEFE na mesma rua e localidade."""
    import duckdb

    alvos = [p for p in itens if (p["resultado"].get("degrau") or "")[:2] in ("da", "pa") and p["analise"].get("numero")
             and p["resultado"].get("logradouro_encontrado")]
    if not alvos:
        return {}
    tabela_num = ent.caminho_por_nome("geocodebr:municipio_logradouro_numero_localidade")
    con = duckdb.connect()
    con.execute("CREATE TEMP TABLE a (id VARCHAR, muni INTEGER, logr VARCHAR, loc VARCHAR, n INTEGER)")
    con.executemany("INSERT INTO a VALUES (?, ?, ?, ?, ?)", [(p["id"], p["code"], p["resultado"]["logradouro_encontrado"],
                                                             p["resultado"].get("localidade_encontrada"), p["analise"]["numero"]) for p in alvos])
    linhas = con.execute(
        f"""SELECT a.id, a.n, t.numero, t.lat, t.lon FROM a JOIN read_parquet('{tabela_num.as_posix()}') t
            ON t.code_muni = a.muni AND t.logradouro = a.logr AND (a.loc IS NULL OR t.localidade = a.loc)"""
    ).fetchall()
    por_id: dict[str, list] = collections.defaultdict(list)
    for i, n, numero, lat, lon in linhas:
        por_id[i].append((numero, lat, lon))
    saida = {}
    for p in alvos:
        pontos = por_id.get(p["id"], [])
        n = p["analise"]["numero"]
        abaixo = [x for x in pontos if x[0] < n]
        acima = [x for x in pontos if x[0] > n]
        if not abaixo or not acima:
            saida[p["id"]] = "além do último número da rua"
            continue
        a = max(abaixo, key=lambda x: x[0])
        b = min(acima, key=lambda x: x[0])
        lat, lon = p["resultado"]["lat"], p["resultado"]["lon"]
        lado = gc.distancia_m(a[1], a[2], b[1], b[2])
        perto = gc.distancia_m(lat, lon, a[1], a[2]) + gc.distancia_m(lat, lon, b[1], b[2]) <= lado + 60
        if not perto:
            saida[p["id"]] = "fora do trecho entre os vizinhos"
        elif b[0] - a[0] <= 200:
            saida[p["id"]] = "entre vizinhos a até 200 números"
        else:
            saida[p["id"]] = "entre vizinhos a mais de 200 números"
    return saida


# ---------------------------------------------------------------------------------------------------------------------
# Relatório
# ---------------------------------------------------------------------------------------------------------------------


def gravar(caminho: Path, imoveis: list[dict], segundos: float, ceps: int = 0) -> dict:
    t0 = time.time()
    total = len(imoveis)
    d = distribuicao(imoveis)
    pop = gc.populacao_por_municipio(ent.caminho_por_nome("censobr:2022_tracts_basico"))
    # conferência no polígono do bairro (feita em geocodificar.py, para todos os pontos)
    poligono: dict[str, tuple[str | None, float | None]] = {p["id"]: p.get("bairro_ibge") or (None, None) for p in imoveis}

    def faixa_poligono(v: tuple[str | None, float | None]) -> str:
        estado, dist = v
        if estado is None:
            return "sem bairro do IBGE"
        if estado == "dentro":
            return "dentro"
        return "fora, até 300 m" if (dist or 0) <= 300 else "fora, 300 m a 1 km" if (dist or 0) <= 1000 else "fora, mais de 1 km"

    random.seed(SEMENTE)
    amostra_numero = random.sample([p for p in imoveis if p["resultado"]["precisao"] == "numero"], min(AMOSTRA, d["numero"]))
    amostra_rua = random.sample([p for p in imoveis if p["resultado"]["precisao"] == "rua"], min(AMOSTRA, d["rua"]))
    nomes_setor = setores_bairro(ent.caminho_por_nome("censobr:2022_tracts_basico"),
                                 {p["resultado"].get("setor") for p in imoveis if p["resultado"]["precisao"] in ("numero", "rua") and p["resultado"].get("setor")})
    interp_todos = conferir_interpolacao([p for p in imoveis if p["resultado"]["precisao"] == "numero"])

    L: list[str] = []
    L.append("# Medição da geocodificação (base/fontes/localizacao)")
    L.append("")
    L.append(f"Gerado em {time.strftime('%d/%m/%Y', time.localtime())} por `geocodificar.py`, com o instantâneo do site "
             f"({num(total)} imóveis) e {num(ceps)} CEP{'s' if ceps != 1 else ''} de ficha. Tempo: {segundos:.0f} s "
             f"(geocodebr, regras, degraus no CNEFE e esta medição). Fonte: IBGE, CNEFE 2022; IPEA, geocodebr 0.2.0 (MIT).")
    L.append("")
    L.append("A precisão diz quão perto o ponto deve estar do imóvel, não garante que esteja certo: o desvio mede a dispersão "
             "dos endereços do CNEFE que casaram, e um casamento errado pode ter desvio pequeno. As regras abaixo existem "
             "para rebaixar os casamentos arriscados.")
    L.append("")
    L.append("## Precisão final")
    L.append("")
    L.append(tabela(["Precisão", "Imóveis", "%", "Verificação (C2)", "Pesquisa (sem C2)", "No site"],
                    [[k, num(d[k]), pct(d[k], total), f"{VERIFICACAO[k]:.1f}%".replace(".", ","), f"{PESQUISA[k]:.1f}%".replace(".", ","),
                      {"numero": "exata", "rua": "rua", "bairro": "bairro", "cidade": "cidade (sede)"}[k]] for k in gc.ORDEM_PRECISAO]))
    L.append("")
    nr = d["numero"] + d["rua"]
    L.append(f"Número ou rua: **{pct(nr, total)}** ({num(nr)}), contra 59,0% na verificação. Na pesquisa, sem as regras C2, "
             "era 66,9%; a diferença para cima vem dos degraus novos (bairro aproximado, variantes do nome, quadra e lote, "
             "raio dos municípios), não de regra mais frouxa.")
    L.append("")
    L.append("Pesquisa: \"sem resultado\" (0,2%) entra em cidade.")
    L.append("")

    L.append("## Por degrau e motivo")
    L.append("")
    c = collections.Counter((p["resultado"]["precisao"], p["resultado"].get("degrau") or "-", p["resultado"].get("motivo") or "-") for p in imoveis)
    L.append(tabela(["Precisão", "Degrau", "Motivo do rebaixamento", "Imóveis", "%"],
                    [[k[0], f"`{k[1]}`", k[2], num(v), pct(v, total)] for k, v in sorted(c.items(), key=lambda kv: (gc.ORDEM_PRECISAO[kv[0][0]], -kv[1]))]))
    L.append("")
    L.append("Degraus: `dn`/`pn` número exato, `da`/`pa` número interpolado, `dl`/`pl` rua, `dc` CEP, `db01` bairro, "
             "`dm01` município (geocodebr; `01` com CEP e localidade, `02` com CEP, `03` com localidade, `04` sem localidade; "
             "`p` = nome parecido pela similaridade de Jaro). `qdlt` quadra e lote no CNEFE, `quadra_numero` o padrão de "
             "Bauru, `rua_interna` rua interna de condomínio, `bairro` rebaixado para o centro da localidade, `municipio` "
             "sem ponto melhor que a sede.")
    L.append("")
    L.append("Motivos: `empate_longe` (candidatos a mais de 1 km entre si), `nome_generico_sem_bairro` (casou sem a "
             "localidade com nome como \"Rua 06\"), `longe_do_bairro` (casou sem a localidade e caiu a mais de max(2 km, "
             "1,5 × desvio) do bairro informado), `desvio_alto` (dispersão acima do limite da precisão), "
             "`so_municipio` (nem rua nem bairro no CNEFE), `fora_do_municipio`, `rural`, `rodovia_km`, "
             "`municipio_desconhecido`.")
    L.append("")
    variantes = collections.Counter(p.get("variante") or 0 for p in imoveis if p["resultado"]["precisao"] in ("numero", "rua"))
    L.append(f"Variante do nome que venceu (numero e rua): principal {num(variantes.get(0, 0))}, outra forma "
             f"(nome antigo, por extenso, algarismo, quadra) {num(sum(v for k, v in variantes.items() if k))}.")
    L.append("")
    interp = collections.Counter((p["resultado"].get("interpolacao"), p["resultado"]["precisao"]) for p in imoveis if p["resultado"].get("interpolacao"))
    if interp:
        nomes_i = {"entre_vizinhos": "entre dois vizinhos", "alem_do_ultimo": "além do último número (ponto do mais perto)", "sem_vizinhos": "sem vizinho"}
        partes = []
        for k, rotulo in nomes_i.items():
            tot = sum(v for (a, _), v in interp.items() if a == k)
            if tot:
                partes.append(f"{rotulo} {num(tot)} (ficaram em numero {num(interp.get((k, 'numero'), 0))})")
        L.append("Números interpolados refeitos (o vencedor de cada imóvel): " + "; ".join(partes) + ".")
        L.append("")
    metodo = collections.Counter(p.get("localidade_metodo") for p in imoveis)
    L.append("Bairro casado com a localidade do CNEFE antes do geocode (C3): " +
             ", ".join(f"{k} {num(v)}" for k, v in metodo.most_common()) + ".")
    L.append("")

    L.append("## Por UF")
    L.append("")
    por_uf = collections.defaultdict(list)
    for p in imoveis:
        por_uf[p["uf"]].append(p)
    linhas = []
    for uf, itens in sorted(por_uf.items(), key=lambda kv: -len(kv[1])):
        du = distribuicao(itens)
        linhas.append([uf, num(len(itens))] + [pct(du[k], len(itens)) for k in gc.ORDEM_PRECISAO] + [pct(du["numero"] + du["rua"], len(itens))])
    L.append(tabela(["UF", "Imóveis", "numero", "rua", "bairro", "cidade", "numero ou rua"], linhas))
    L.append("")

    L.append("## Por porte da cidade (moradores no Censo 2022)")
    L.append("")
    por_porte = collections.defaultdict(list)
    for p in imoveis:
        por_porte[gc.porte(pop.get(p["code"]) if p.get("code") else None)].append(p)
    linhas = []
    for k in ORDEM_PORTE:
        itens = por_porte.get(k, [])
        if not itens:
            continue
        du = distribuicao(itens)
        ref = VERIFICACAO_PORTE.get(k)
        linhas.append([k, num(len(itens))] + [pct(du[x], len(itens)) for x in gc.ORDEM_PRECISAO] +
                      [pct(du["numero"] + du["rua"], len(itens)), f"{ref:.1f}%".replace(".", ",") if ref else "—"])
    L.append(tabela(["Porte", "Imóveis", "numero", "rua", "bairro", "cidade", "numero ou rua", "Verificação (rua ou número)"], linhas))
    L.append("")
    L.append("O viés continua: cidade pequena tem menos rua com nome no CNEFE e mais endereço por quadra e lote. A nota de "
             "localização some justamente no interior; o painel de cobertura precisa dizer isso.")
    L.append("")

    L.append("## Validação")
    L.append("")
    L.append("Sem ir à rua, dá para conferir três coisas. O polígono do bairro e o setor dizem se o ponto caiu no bairro "
             "certo; não dizem se caiu na casa certa. Onde o nome do bairro da Caixa não bate com o do IBGE, a conferência "
             "fica \"sem bairro do IBGE\".")
    L.append("")
    L.append("### 1. Ponto dentro do polígono do bairro informado (IBGE, bairros 2022), todos os imóveis")
    L.append("")
    faixas = ["dentro", "fora, até 300 m", "fora, 300 m a 1 km", "fora, mais de 1 km", "sem bairro do IBGE"]
    linhas = []
    for prec in ("numero", "rua", "bairro"):
        itens = [p for p in imoveis if p["resultado"]["precisao"] == prec]
        cf = collections.Counter(faixa_poligono(poligono[p["id"]]) for p in itens)
        conferidos = sum(cf[f] for f in faixas[:4])
        linhas.append([prec, num(len(itens)), num(conferidos)] + [pct(cf[f], conferidos) for f in faixas[:4]])
    L.append(tabela(["Precisão", "Imóveis", "Com bairro do IBGE", "Dentro", "Fora até 300 m", "Fora 300 m a 1 km", "Fora mais de 1 km"], linhas))
    L.append("")
    linhas = []
    por_degrau = collections.defaultdict(list)
    for p in imoveis:
        if p["resultado"]["precisao"] in ("numero", "rua"):
            por_degrau[grupo_degrau(p["resultado"].get("degrau"))].append(p)
    for k, itens in sorted(por_degrau.items(), key=lambda kv: -len(kv[1])):
        cf = collections.Counter(faixa_poligono(poligono[p["id"]]) for p in itens)
        conferidos = sum(cf[f] for f in faixas[:4])
        if conferidos < 10:
            continue
        distintos = len({(p.get("code"), p["analise"].get("logradouro"), p["analise"].get("numero"), p.get("bairro")) for p in itens})
        linhas.append([f"`{k}`", num(len(itens)), num(distintos), num(conferidos), pct(cf["dentro"], conferidos), pct(cf["fora, até 300 m"], conferidos),
                       pct(cf["fora, 300 m a 1 km"] + cf["fora, mais de 1 km"], conferidos)])
    L.append("Por degrau (numero e rua). Vários imóveis podem ser apartamentos do mesmo prédio: a coluna \"endereços\" conta "
             "rua, número e bairro distintos.")
    L.append("")
    L.append(tabela(["Degrau", "Imóveis", "Endereços", "Com bairro do IBGE", "Dentro", "Fora até 300 m", "Fora mais de 300 m"], linhas))
    L.append("")
    L.append("\"Fora até 300 m\" é quase sempre divisa de bairro (o imóvel do outro lado da rua) ou bairro da Caixa com nome "
             "de loteamento que o IBGE juntou a outro.")
    L.append("")

    L.append("### 2. Amostra sorteada: 60 \"numero\" e 60 \"rua\"")
    L.append("")
    L.append(f"Semente {SEMENTE}. Para cada imóvel: o polígono do bairro (1), o bairro do setor censitário do ponto no Censo "
             "2022 (2) e, nos números interpolados, os vizinhos do CNEFE (3).")
    L.append("")
    resumo_amostra = {}
    for nome, amostra in (("numero", amostra_numero), ("rua", amostra_rua)):
        cp = collections.Counter(faixa_poligono(poligono[p["id"]]) for p in amostra)
        cs = collections.Counter(conferir_setor(p, nomes_setor) or "sem setor ou sem bairro" for p in amostra)
        ci = collections.Counter(interp_todos.get(p["id"]) for p in amostra if p["id"] in interp_todos)
        resumo_amostra[nome] = (cp, cs, ci)
        L.append(f"**{nome}** ({len(amostra)} imóveis, {len({p['cidade'] for p in amostra})} cidades):")
        L.append("")
        L.append(f"- polígono do bairro: " + ", ".join(f"{k} {v}" for k, v in cp.most_common()))
        L.append(f"- bairro do setor: " + ", ".join(f"{k} {v}" for k, v in cs.most_common()))
        if ci:
            L.append(f"- número interpolado ({sum(ci.values())} na amostra): " + ", ".join(f"{k} {v}" for k, v in ci.most_common()))
        L.append("")
        suspeitos = [p for p in amostra if faixa_poligono(poligono[p["id"]]) in ("fora, 300 m a 1 km", "fora, mais de 1 km")
                     or conferir_setor(p, nomes_setor) == "outro bairro"]
        if suspeitos:
            L.append("Suspeitos para conferir à mão (id, cidade, degrau, conferências):")
            L.append("")
            for p in suspeitos:
                r = p["resultado"]
                est, dist = poligono[p["id"]]
                L.append(f"- `{p['id']}` {p['cidade']}/{p['uf']}, `{r.get('degrau')}`, desvio {r.get('desvio_m')} m; polígono: "
                         f"{faixa_poligono((est, dist))}{f' ({dist:.0f} m)' if est == 'fora' else ''}; setor: {conferir_setor(p, nomes_setor) or '—'}")
            L.append("")

    L.append("### 3. Números interpolados, todos os \"numero\"")
    L.append("")
    ci = collections.Counter(interp_todos.values())
    L.append(tabela(["Conferência", "Imóveis"], [[k, num(v)] for k, v in ci.most_common()]))
    L.append("")
    L.append("Conferência independente do cálculo: há número menor e maior na mesma rua (e localidade, quando o casamento "
             "foi com ela) do CNEFE, e o ponto fica no trecho entre os dois (folga de 60 m)? O geocodebr 0.2.0 faz a média de "
             "todos os números da rua pesada por 1/|diferença|, e o ponto de um número além do fim da rua caía perto do meio "
             "dela com desvio de 6 m; geocodificar.py refaz o ponto entre os dois vizinhos (ou no último número, somando a "
             "diferença de numeração ao desvio) e só mantém \"numero\" se o desvio ficar em até 150 m.")
    L.append("")
    L.append("## Ajustes feitos com esta validação (medidos em 18/10/2026)")
    L.append("")
    L.append(tabela(
        ["Passo", "numero", "rua", "bairro", "cidade", "O que mudou"],
        [
            ["C2 + C3 + quadra e lote, raio da malha", "50,8%", "10,7%", "19,0%", "19,4%",
             "2.038 imóveis caíam em `fora_do_municipio`: a malha dá 19 km de raio ao Rio de Janeiro (Santa Cruz fica a 50 km da sede)"],
            ["+ raio medido no CNEFE (base/geo/raios-cnefe.csv, 24 municípios)", "56,8%", "10,9%", "19,0%", "13,3%",
             "o Rio, Macaé, Bertioga, São Sebastião, Guarapari e mais 19 passam a aceitar o ponto certo; o mesmo raio vale na exportação"],
            ["+ interpolação refeita entre os vizinhos do CNEFE", "50,2%", "15,7%", "20,9%", "13,2%",
             "o geocodebr punha o número além do fim da rua perto do meio dela, com desvio de 6 m; 1,4 mil saem de numero"],
            ["+ nome parecido conferido palavra a palavra e polígono do bairro nos casamentos sem localidade", "49,4%", "15,1%", "21,9%", "13,6%",
             "\"RUA ITATINGA\" deixa de casar com \"RUA IPATINGA\"; 59 pontos a mais de 1 km do bairro informado são rebaixados"],
        ],
    ))
    L.append("")
    L.append("Os dois últimos passos rebaixam, não sobem: a validação mostrou que o geocodebr estava otimista no número "
             "interpolado e no nome parecido. Fora deles, os degraus de número e rua ficam 88% a 90% dentro do polígono do "
             "bairro informado; o que sobra fora a mais de 300 m (cerca de 5%) é sobretudo divisa de bairro e nome de "
             "loteamento que o IBGE juntou a outro bairro. Conferir à mão os suspeitos listados acima é o próximo passo.")
    L.append("")
    L.append(f"(Medição em {time.time() - t0:.0f} s.)")
    L.append("")
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(L), encoding="utf-8")
    return {"poligono": poligono, "amostra": resumo_amostra, "interpolacao": ci}
