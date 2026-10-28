"""
Testes do exportador do PBCV, só com a biblioteca padrão:

    python3 base/leiloeiros/pbcv/testar.py        (no Windows: py base\\leiloeiros\\pbcv\\testar.py)

Monta um leiloes.db mínimo, com o esquema do PBCV (lote, coleta, coleta_fonte, geo_lote, evento) e lotes fictícios,
roda o exportador e confere linha a linha: imóvel à venda, lote não visto na última coleta, suspenso antigo, fonte com
a última coleta em erro, judicial com o nome do executado na descrição, CPF, venda direta, duas praças, "desconhecido"
que é casa, veículo, trator "rural", sem cidade, o número do imóvel na Caixa. Com o Node instalado, o arquivo passa
também pelo validador da Luneta (base/leiloeiros/validar.ts). No fim, a máscara em Python contra os casos
compartilhados com o TypeScript (casos-compartilhados.json, que o pbcv.test.ts confere do lado da Luneta).
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True  # nada de __pycache__ na pasta do projeto

import hashlib  # noqa: E402
import json  # noqa: E402
import shutil  # noqa: E402
import sqlite3  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import unittest  # noqa: E402
from datetime import datetime  # noqa: E402
from pathlib import Path  # noqa: E402

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI))

import exportar as E  # noqa: E402
import regra_imovel  # noqa: E402
import regras_luneta as R  # noqa: E402

AGORA = datetime(2026, 10, 2, 12, 0)  # hora de Brasília, um dia depois da última coleta
AGORA_UTC = "2026-10-02T15:00:00Z"

# O esquema do PBCV (core/db.py), só as tabelas que o exportador lê (e o evento, para a base ficar como a de verdade).
ESQUEMA = """
CREATE TABLE coleta (
    id INTEGER PRIMARY KEY AUTOINCREMENT, iniciada_em TEXT NOT NULL, finalizada_em TEXT, status TEXT NOT NULL DEFAULT 'rodando',
    n_fontes_ok INTEGER DEFAULT 0, n_fontes_erro INTEGER DEFAULT 0, n_lotes INTEGER DEFAULT 0);
CREATE TABLE coleta_fonte (
    coleta_id INTEGER NOT NULL REFERENCES coleta(id), fonte TEXT NOT NULL, status TEXT NOT NULL, n_lotes INTEGER NOT NULL DEFAULT 0,
    duracao_s REAL, erro TEXT, PRIMARY KEY (coleta_id, fonte));
CREATE TABLE lote (
    chave TEXT PRIMARY KEY, fonte TEXT NOT NULL, id_externo TEXT NOT NULL, url TEXT NOT NULL, titulo TEXT, descricao TEXT,
    numero_lote TEXT, tipo_bem TEXT, categoria TEXT, valor_avaliacao REAL, valor_lance_inicial REAL, valor_lance_minimo REAL,
    valor_lance_atual REAL, desconto_pct REAL, comissao_pct REAL, moeda TEXT DEFAULT 'BRL', id_leilao TEXT, titulo_leilao TEXT,
    modalidade TEXT, situacao TEXT, praca_atual INTEGER, data_primeira_praca TEXT, data_segunda_praca TEXT, data_encerramento TEXT,
    numero_processo TEXT, vara TEXT, comarca TEXT, exequente TEXT, executado TEXT, url_tribunal TEXT, matricula TEXT,
    subjudice INTEGER, penhorado INTEGER, logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, uf TEXT,
    cep TEXT, codigo_ibge TEXT, latitude REAL, longitude REAL, endereco_completo TEXT, area_m2 REAL, imagens TEXT,
    documentos TEXT, visitas INTEGER, total_lances INTEGER, leiloeiro TEXT, comitente TEXT, hash_conteudo TEXT NOT NULL,
    problemas TEXT, ativo INTEGER NOT NULL DEFAULT 1, visto_primeiro_em TEXT NOT NULL, visto_ultimo_em TEXT NOT NULL, saiu_em TEXT);
CREATE TABLE evento (
    id INTEGER PRIMARY KEY AUTOINCREMENT, coleta_id INTEGER NOT NULL REFERENCES coleta(id), chave TEXT NOT NULL, fonte TEXT NOT NULL,
    tipo TEXT NOT NULL, campo TEXT, valor_de TEXT, valor_para TEXT, criado_em TEXT NOT NULL);
CREATE TABLE geo_lote (
    chave TEXT PRIMARY KEY, geo_cidade TEXT, geo_uf TEXT, geo_codigo_ibge TEXT, geo_origem_cidade TEXT, geo_lat REAL, geo_lon REAL,
    geo_precisao TEXT, geo_origem_coord TEXT, geo_dist_km REAL, geo_entrada TEXT, geo_calculado_em TEXT);
"""

COLETA_1 = "2026-09-20T03:00:00"  # ok para todos
COLETA_2 = "2026-10-01T03:00:00"  # a última
VISTO_1 = "2026-09-20T03:40:00"
VISTO_2 = "2026-10-01T03:40:00"

ALFA, BETA, GAMA, DELTA, EPSILON = (
    "alfa-leiloes.com.br", "www.beta-leiloes.com.br", "gama-leiloes.com.br", "delta-leiloes.com.br", "epsilon-leiloes.com.br",
)


def lote(fonte: str, id_externo: str, **campos) -> dict:
    base = {
        "chave": f"{fonte}:{id_externo}", "fonte": fonte, "id_externo": id_externo,
        "url": f"https://{fonte}/lote/{id_externo}", "titulo": "Apartamento 2 quartos, 60 m²", "tipo_bem": "imovel",
        "modalidade": "extrajudicial", "situacao": "aberto", "cidade": "Campinas", "uf": "SP",
        "data_primeira_praca": "2026-10-20T14:00:00", "valor_lance_inicial": 200000.0,
        "hash_conteudo": "h", "ativo": 1, "visto_primeiro_em": VISTO_1, "visto_ultimo_em": VISTO_2,
    }
    base.update(campos)
    return base


def lotes_da_fixture() -> list[dict]:
    return [
        # Imóvel à venda, com duas praças, avaliação, foto repetida, edital, comitente banco e o leiloeiro com a junta
        lote(ALFA, "1001", titulo="Apartamento 2 quartos, 60 m², Vila Fictícia", logradouro="Rua das Flores", numero="100",
             bairro="Vila Fictícia", cep="13010-000", data_segunda_praca="2026-11-05T14:00:00", valor_lance_inicial=300000.0,
             valor_lance_minimo=180000.0, valor_avaliacao=320000.0, comitente="Banco Fictício S.A.",
             leiloeiro="Ana Fictícia Lima - Leiloeira Oficial JUCESP nº 123", id_leilao="L-77", numero_lote="3", area_m2=60.0,
             imagens=json.dumps(["https://alfa-leiloes.com.br/f/1.jpg", "https://alfa-leiloes.com.br/f/1.jpg", "/relativa.jpg"]),
             documentos=json.dumps([{"url": "https://alfa-leiloes.com.br/edital.pdf", "nome": "Edital", "tipo": "edital"}])),
        # Não visto na última coleta (zumbi da trava de queda)
        lote(ALFA, "1002", visto_ultimo_em=VISTO_1),
        # Suspenso com a praça já passada; e suspenso com praça futura (vai como "suspenso", para sair do site)
        lote(ALFA, "1003", situacao="suspenso", data_primeira_praca="2026-09-25T10:00:00"),
        lote(ALFA, "1013", situacao="suspenso", data_primeira_praca="2026-10-30T10:00:00"),
        # Judicial com o nome do executado no título, na descrição e no processo
        lote(ALFA, "1004", modalidade="judicial", titulo="Casa térrea - Executado Ciclano Fictício de Souza",
             executado="CICLANO FICTÍCIO DE SOUZA", exequente="BANCO FICTÍCIO S.A.",
             numero_processo="Processo 0001234-56.2024.8.26.0100 - Banco Fictício x Ciclano Fictício de Souza",
             descricao="Penhora nos autos movidos por Banco Fictício S.A. em face de Ciclano Fictício de Souza. O imóvel é "
                       "ocupado pelo executado e sua família. Vizinho: ciclano ficticio  de souza.",
             vara="2ª Vara Cível de Campinas", comarca="Campinas"),
        # CPF e e-mail: mascarados na descrição; o logradouro com CPF não vai
        lote(ALFA, "1005", descricao="Devedor fiduciante inscrito no CPF 123.456.789-09, contato fulano@exemplo.com.",
             logradouro="Rua X, 10, CPF 123.456.789-09"),
        # Venda direta: uma praça 0 com o preço e o prazo
        lote(ALFA, "1006", modalidade="venda_direta", data_primeira_praca=None, valor_lance_inicial=None,
             valor_lance_minimo=150000.0, data_encerramento="2026-10-25T18:00:00", valor_avaliacao=0.0),
        # "desconhecido" que é casa, com a cidade só na geo_lote
        lote(ALFA, "1007", tipo_bem="desconhecido", titulo="Casa com 3 quartos e quintal, Jardim Fictício", cidade=None, uf=None),
        # Veículo e trator "rural": não são imóveis
        lote(ALFA, "1008", tipo_bem="veiculo", titulo="GM/Corsa 2010/2011 placa ABC1D23"),
        lote(ALFA, "1018", tipo_bem="rural", titulo="Trator Valtra BM 125, ano 2012"),
        # Sem cidade nem UF (nem na geo_lote)
        lote(ALFA, "1009", cidade=None, uf=None),
        # Número do imóvel na Caixa na URL; id com hífen
        lote(ALFA, "1010", url="https://alfa-leiloes.com.br/lote/1010?hdnimovel=10119245"),
        lote(ALFA, "2026-77A", titulo="Terreno de 300 m², Lote 5, Quadra 3"),
        # Beta: visto na coleta ok; a última coleta da fonte deu erro (bloqueio)
        lote(BETA, "9001", visto_ultimo_em="2026-09-20T04:00:00"),
        # Gama: a última coleta foi "suspeita"; o que ela não viu é zumbi
        lote(GAMA, "71", visto_ultimo_em="2026-10-01T04:00:00"),
        lote(GAMA, "72", visto_ultimo_em=VISTO_1),
        # Delta: só coleta incompleta (leu lotes bons, não todos)
        lote(DELTA, "5", visto_ultimo_em="2026-09-20T04:00:00"),
        # Epsilon: nunca trouxe lotes (só erro)
        lote(EPSILON, "1", visto_ultimo_em=VISTO_2),
    ]


def montar_banco(caminho: Path) -> None:
    con = sqlite3.connect(caminho)
    con.executescript(ESQUEMA)
    con.execute("INSERT INTO coleta (id, iniciada_em, finalizada_em, status) VALUES (1, ?, '2026-09-20T05:00:00', 'ok')", (COLETA_1,))
    con.execute("INSERT INTO coleta (id, iniciada_em, finalizada_em, status) VALUES (2, ?, '2026-10-01T05:00:00', 'parcial')", (COLETA_2,))
    cf = [
        (1, ALFA, "ok", 12, None), (2, ALFA, "ok", 11, None),
        (1, BETA, "ok", 1, None), (2, BETA, "erro", 0, "RespostaRecusada: HTTP 403 — desafio Cloudflare; token=abc123segredo"),
        (1, GAMA, "ok", 20, None), (2, GAMA, "suspeita", 1, None),
        (1, DELTA, "incompleta", 1, "coleta parcial: saídas não apuradas"),
        (2, EPSILON, "erro", 0, "TimeoutError: a página não respondeu"),
    ]
    con.executemany("INSERT INTO coleta_fonte (coleta_id, fonte, status, n_lotes, erro) VALUES (?, ?, ?, ?, ?)", cf)
    for l in lotes_da_fixture():
        colunas = ", ".join(l)
        con.execute(f"INSERT INTO lote ({colunas}) VALUES ({', '.join('?' for _ in l)})", list(l.values()))
    con.execute("INSERT INTO geo_lote (chave, geo_cidade, geo_uf, geo_codigo_ibge, geo_origem_cidade) VALUES (?, 'Campinas', 'SP', '3509502', 'titulo')",
                (f"{ALFA}:1007",))
    con.execute("INSERT INTO evento (coleta_id, chave, fonte, tipo, criado_em) VALUES (2, ?, ?, 'ENTROU', ?)", (f"{ALFA}:1001", ALFA, VISTO_2))
    con.commit()
    con.close()


def textos(valor) -> list[str]:
    if isinstance(valor, str):
        return [valor]
    if isinstance(valor, dict):
        return [t for v in valor.values() for t in textos(v)]
    if isinstance(valor, list):
        return [t for v in valor for t in textos(v)]
    return []


def chaves(valor) -> set[str]:
    if isinstance(valor, dict):
        return set(valor) | {c for v in valor.values() for c in chaves(v)}
    if isinstance(valor, list):
        return {c for v in valor for c in chaves(v)}
    return set()


class Exportacao(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.pasta = Path(tempfile.mkdtemp(prefix="pbcv-teste-"))
        cls.banco = cls.pasta / "leiloes.db"
        montar_banco(cls.banco)
        cls.hash_antes = hashlib.sha256(cls.banco.read_bytes()).hexdigest()
        cls.saida = cls.pasta / "saida.jsonl"
        cls.resumo = E.exportar(str(cls.banco), str(cls.saida), agora=AGORA)
        cls.linhas = [json.loads(l) for l in cls.saida.read_text(encoding="utf-8").splitlines() if l.strip()]
        cls.imoveis = {l["id"]: l for l in cls.linhas if l["registro"] == "imovel"}
        cls.coletas = {l["leiloeiro"]["slug"]: l for l in cls.linhas if l["registro"] == "coleta"}

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.pasta, ignore_errors=True)

    def test_banco_so_leitura(self) -> None:
        self.assertEqual(hashlib.sha256(self.banco.read_bytes()).hexdigest(), self.hash_antes)
        con = E.abrir_somente_leitura(str(self.banco))
        with self.assertRaises(sqlite3.OperationalError):
            con.execute("DELETE FROM lote")
        con.close()

    def test_quem_sai_e_quem_fica(self) -> None:
        self.assertEqual(sorted(self.imoveis), sorted([
            "alfa-leiloes:1001", "alfa-leiloes:1004", "alfa-leiloes:1005", "alfa-leiloes:1006", "alfa-leiloes:1007",
            "alfa-leiloes:1010", "alfa-leiloes:1013", "alfa-leiloes:202677a", "beta-leiloes:9001", "gama-leiloes:71", "delta-leiloes:5",
        ]))
        m = self.resumo["motivos"]
        self.assertEqual(m["fora:nao_visto_na_ultima_coleta"], 2, "alfa 1002 e gama 72")
        self.assertEqual(m["fora:suspenso_sem_data_futura"], 1)
        self.assertEqual(m["fora:nao_imovel"], 1, "o Corsa")
        self.assertEqual(m["fora:vetado_neg_titulo"], 1, "o trator 'rural'")
        self.assertEqual(m["fora:sem_cidade_uf"], 1)
        self.assertEqual(m["fora:fonte_sem_coleta_com_lotes"], 1, "epsilon")
        self.assertEqual(self.resumo["suspensos_avisados"], 1)
        self.assertEqual(self.resumo["imoveis"], 11)
        self.assertEqual(self.resumo["imoveis_a_venda_no_arquivo"], 10)

    def test_imovel_com_duas_pracas(self) -> None:
        l = self.imoveis["alfa-leiloes:1001"]
        self.assertEqual(l["pracas"], [
            {"numero": 1, "data": "2026-10-20T14:00:00-03:00", "valor_minimo": 300000.0},
            {"numero": 2, "data": "2026-11-05T14:00:00-03:00", "valor_minimo": 180000.0},
        ])
        self.assertIsNone(l["praca_atual"], "as duas com data: a Luneta deduz a praça em vigor")
        self.assertIsNone(l["lance_minimo"])
        self.assertEqual((l["situacao"], l["situacao_fonte"], l["modalidade"], l["natureza"], l["tipo"]), ("ativo", "aberto", "leilao", "extrajudicial", "apartamento"))
        self.assertEqual(l["avaliacao"], 320000.0)
        self.assertEqual(l["comitente"], {"nome": "Banco Fictício S.A.", "tipo": "banco"})
        self.assertEqual(l["endereco"], {"texto": None, "logradouro": "Rua das Flores", "numero": "100", "complemento": None,
                                         "bairro": "Vila Fictícia", "cidade": "Campinas", "uf": "SP", "cep": "13010000"})
        self.assertEqual(l["fotos"], [{"url": "https://alfa-leiloes.com.br/f/1.jpg", "ordem": 0}], "sem repetida nem relativa")
        self.assertEqual(l["documentos"], [{"tipo": "edital", "titulo": "Edital", "url": "https://alfa-leiloes.com.br/edital.pdf"}])
        self.assertEqual((l["leilao_id"], l["lote_numero"], l["area_total"]), ("L-77", "3", 60.0))
        self.assertEqual(l["leiloeiro"], {"slug": "alfa-leiloes", "nome": "alfa-leiloes.com.br", "site": "https://alfa-leiloes.com.br/",
                                          "matricula_junta": "JUCESP nº 123"})
        self.assertEqual(l["extras"]["leiloeiro_oficial"], "Ana Fictícia Lima")
        self.assertEqual(l["controle"]["coletado_em"], "2026-10-01T03:40:00-03:00")
        self.assertRegex(l["controle"]["hash"], r"^[0-9a-f]{64}$")

    def test_judicial_lgpd_executado_e_exequente_nunca_saem(self) -> None:
        l = self.imoveis["alfa-leiloes:1004"]
        self.assertEqual((l["natureza"], l["processo"]), ("judicial", "0001234-56.2024.8.26.0100"))
        self.assertFalse({"executado", "exequente"} & chaves(l))
        tudo = "\n".join(textos(l)).lower()
        self.assertNotIn("ciclano", tudo)
        self.assertIn("[NOME]", l["titulo"])
        self.assertIn("[NOME]", l["descricao"])
        self.assertEqual(l["extras"]["vara"], "2ª Vara Cível de Campinas")
        self.assertGreaterEqual(self.resumo["partes_mascaradas"], 3)

    def test_cpf_e_email(self) -> None:
        l = self.imoveis["alfa-leiloes:1005"]
        self.assertIn("[CPF]", l["descricao"])
        self.assertIn("[E-MAIL]", l["descricao"])
        self.assertNotIn("123.456.789-09", json.dumps(l, ensure_ascii=False))
        self.assertIsNone(l["endereco"]["logradouro"], "o CPF num campo que vai sem máscara: o campo cai")

    def test_venda_direta(self) -> None:
        l = self.imoveis["alfa-leiloes:1006"]
        self.assertEqual(l["pracas"], [{"numero": 0, "data": "2026-10-25T18:00:00-03:00", "valor_minimo": 150000.0}])
        self.assertEqual((l["praca_atual"], l["lance_minimo"], l["modalidade"], l["natureza"]), (0, 150000.0, "venda_direta", None))
        self.assertIsNone(l["avaliacao"], "avaliação 0 é 'não informa', nunca 'de graça'")

    def test_desconhecido_que_e_casa_com_a_cidade_da_geo(self) -> None:
        l = self.imoveis["alfa-leiloes:1007"]
        self.assertEqual((l["tipo"], l["endereco"]["cidade"], l["endereco"]["uf"]), ("casa", "Campinas", "SP"))
        self.assertEqual(l["extras"]["tipo_bem_pbcv"], "desconhecido")

    def test_suspenso_com_praca_futura_vai_para_sair_do_site(self) -> None:
        self.assertEqual(self.imoveis["alfa-leiloes:1013"]["situacao"], "suspenso")

    def test_numero_da_caixa_e_id_sem_hifen(self) -> None:
        self.assertEqual(self.imoveis["alfa-leiloes:1010"]["registro_imovel"]["numero_caixa"], "0000010119245")
        self.assertIsNone(self.imoveis["alfa-leiloes:1001"]["registro_imovel"])
        self.assertEqual(self.imoveis["alfa-leiloes:202677a"]["tipo"], "terreno")

    def test_linhas_de_coleta(self) -> None:
        alfa, beta, gama, delta, eps = (self.coletas[s] for s in ("alfa-leiloes", "beta-leiloes", "gama-leiloes", "delta-leiloes", "epsilon-leiloes"))
        self.assertEqual((alfa["saude"], alfa["completa"], alfa["total_enviados"], alfa["total_na_fonte"]), ("ok", True, 8, 9))
        self.assertEqual(alfa["coletado_em"], "2026-10-01T05:00:00-03:00")
        self.assertEqual((beta["saude"], beta["completa"], beta["total_enviados"]), ("bloqueado", False, 1), "última coleta em erro: carga não completa")
        self.assertIn("[omitido]", beta["erro"])
        self.assertNotIn("abc123", beta["erro"])
        self.assertEqual((gama["saude"], gama["completa"], gama["total_enviados"]), ("parcial", False, 1))
        self.assertEqual((delta["saude"], delta["completa"], delta["total_enviados"]), ("parcial", False, 1))
        self.assertEqual((eps["saude"], eps["completa"], eps["total_enviados"]), ("quebrado", False, 0), "só a linha de coleta")
        # a linha de coleta vem antes dos lotes do leiloeiro
        visto: set[str] = set()
        for l in self.linhas:
            slug = l["leiloeiro"]["slug"]
            if l["registro"] == "coleta":
                visto.add(slug)
            else:
                self.assertIn(slug, visto)

    def test_validador_da_luneta(self) -> None:
        node = shutil.which("node")
        if not node:
            self.skipTest("sem Node: o validador da Luneta não roda aqui")
        r = subprocess.run(
            [node, "--experimental-strip-types", "--disable-warning=ExperimentalWarning", str(RAIZ / "base" / "leiloeiros" / "validar.ts"),
             "--arquivo", str(self.saida), "--agora", AGORA_UTC, "--json"],
            capture_output=True, text=True, encoding="utf-8", cwd=RAIZ,
        )
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-3000:])
        resultado = json.loads(r.stdout)
        self.assertEqual(resultado["erros"], 0)
        self.assertFalse([p for p in resultado["problemas"] if p["mensagem"].startswith("LGPD")], "nenhum aviso de LGPD")


class Regras(unittest.TestCase):
    def test_coletas_que_trouxeram_lotes(self) -> None:
        pasta = Path(tempfile.mkdtemp(prefix="pbcv-teste-"))
        try:
            montar_banco(pasta / "leiloes.db")
            con = E.abrir_somente_leitura(str(pasta / "leiloes.db"))
            h = E.historico_de_coletas(con)
            con.close()
        finally:
            shutil.rmtree(pasta, ignore_errors=True)
        self.assertEqual((h[ALFA]["limite_visto"], h[ALFA]["limite_de"], h[ALFA]["completa_possivel"]), (COLETA_2, "ok", True))
        self.assertEqual((h[BETA]["limite_visto"], h[BETA]["completa_possivel"]), (COLETA_1, False), "o erro não trouxe lotes")
        self.assertEqual((h[GAMA]["limite_visto"], h[GAMA]["limite_de"]), (COLETA_2, "suspeita"))
        self.assertEqual((h[DELTA]["limite_visto"], h[DELTA]["limite_de"]), (COLETA_1, "incompleta"))
        self.assertIsNone(h[EPSILON]["limite_visto"])

    def test_regra_de_imovel(self) -> None:
        casos = [
            (("Trator Valtra BM 125", None, None, "rural"), False),
            (("Item: Mesa de cabeceira com 2 gavetas | Lote montado", None, None, "imovel"), False),
            (("03 ALMOFADAS. LOC. SALA. 39M²", None, None, "imovel"), False),
            (("Apartamento - Fins de treinamento", None, "Lote apenas para fins de treinamento", "imovel"), False),
            (("QUADRA 26 LOTE Nº06", "Bens diversos", None, "desconhecido"), True),
            ((".'.Lote de Área 843,96m²,Luziânia/GO.'.", None, None, "desconhecido"), True),
            (("Fazenda Cabeça da Vaca, 120 hectares", None, None, "rural"), True),
            (("LOTE 019", None, "Terreno urbano com 300 m², matrícula nº 12.345 do CRI", "desconhecido"), True),
            (("CONSERVADO", "Imóveis", None, "diversos"), True),
            (("GM/Corsa 2010/2011", "Veículos", None, "veiculo"), False),
        ]
        for argumentos, esperado in casos:
            self.assertEqual(regra_imovel.classificar(*argumentos)[0], esperado, argumentos)

    def test_campo_de_lugar_com_partes_cai_inteiro(self) -> None:
        self.assertIsNone(E.lugar("Fulano Fictício de Tal X Beltrano Fictício", 200))
        self.assertIsNone(E.comitente_da_fonte("Fulano Fictício de Tal X Banco Fictício S.A."))
        self.assertEqual(E.lugar("Rua das Flores, 100 - proprietário Fulano Fictício", 200), "Rua das Flores, 100")
        self.assertEqual(E.comitente_da_fonte("Prefeitura Municipal de Campinas"), {"nome": "Prefeitura Municipal de Campinas", "tipo": "orgao_publico"})

    def test_partes_firma_individual_e_empresa(self) -> None:
        self.assertEqual(E.nomes_de_partes("FULANO FICTÍCIO - ME; BANCO FICTÍCIO S.A.", "CONDOMÍNIO EDIFÍCIO FICTÍCIO"), ["FULANO FICTÍCIO"])
        texto, n = E.mascarar_partes("Executado fulano  ficticio, ME.", ["FULANO FICTÍCIO"])
        self.assertEqual((texto, n), ("Executado [NOME], ME.", 1))

    def test_nome_do_leiloeiro_numero_da_caixa_e_datas(self) -> None:
        self.assertEqual(E.nome_do_leiloeiro("Fulano Fictício Pereira JUCESP Nº 844 - Leiloeiro oficial"), ("Fulano Fictício Pereira", "JUCESP nº 844"))
        self.assertEqual(E.nome_do_leiloeiro("LEILÕES"), (None, None))
        self.assertEqual(E.numero_caixa(None, "MESQUITA/RJ — Apartamento (F8787701662364)", None), "8787701662364")
        self.assertEqual(E.numero_caixa(None, "Lote 3", "N° do imóvel 1444420699441"), "1444420699441")
        self.assertIsNone(E.numero_caixa(None, "CNPJ 12345678000195", None))
        self.assertEqual(E.data_iso("2026-10-16T14:30:00"), "2026-10-16T14:30:00-03:00")
        self.assertEqual(E.data_iso("2026-10-16"), "2026-10-16T00:00:00-03:00")
        self.assertIsNone(E.data_iso("1969-12-31T21:00:00"))
        self.assertIsNone(E.data_iso("2026-02-30T10:00:00"))
        self.assertEqual(E.lote_do_id("7924-1"), "79241")
        self.assertEqual(E.slug_da_fonte("www.hammer.lel.br"), "hammer-lel")


class CasosCompartilhados(unittest.TestCase):
    """A máscara em Python dá o mesmo que a do TypeScript (as saídas do JSON são as do TypeScript)."""

    FUNCOES = {
        "mascararDadosPessoais": R.mascarar_dados_pessoais,
        "mascararDocumentos": R.mascarar_documentos,
        "mascararNomes": R.mascarar_nomes,
        "campoSemPessoa": R.campo_sem_pessoa,
        "inferirTipoImovel": R.inferir_tipo_imovel,
    }

    def test_mesma_saida_do_typescript(self) -> None:
        dados = json.loads((AQUI / "casos-compartilhados.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(dados["casos"]), 150)
        for caso in dados["casos"]:
            with self.subTest(funcao=caso["funcao"], entrada=caso["entrada"][:60]):
                self.assertEqual(self.FUNCOES[caso["funcao"]](caso["entrada"]), caso["saida"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
