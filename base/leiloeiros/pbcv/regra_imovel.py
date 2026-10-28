"""
Regra "imóvel de verdade" para os lotes do PBCV: título, categoria, os 700 primeiros caracteres da descrição e o
`tipo_bem` do coletor. Veio da análise da base do PBCV (amostra de 200 imóveis novos lidos à mão: 195 certos, 97,5%;
validação com outros 100: 99 certos) e substitui o `tipo_bem`, que o PBCV decide por palavras soltas: 1.103 dos 4.174
"rural" ativos eram trator, implemento, gado ou peça, e 1.263 "desconhecido" eram imóveis.

Ordem de decisão (`classificar`):
  1. lote de teste ("apenas para fins de treinamento") sai;
  2. negativo no título (veículo, máquina, animal, mercadoria, arte, conteúdo de box, "LOC. SALA", "MED. APROX.")
     veta, salvo positivo FORTE no título (apartamento, terreno, fazenda, hectares, matrícula nº...); palavra que
     também é nome de lugar ("Lagoa do Carro", "Mercedes/PR", "Fazenda Cabeça da Vaca") não veta se há positivo;
  3. positivo no título entra (inclusive endereço com número: "Rua X, 116");
  4. categoria forte de imóvel entra (Imóveis, Apartamento, Casas, Terrenos, Fazendas, Rural...);
  5. título genérico ("LOTE 019"): positivo forte na descrição entra se a descrição não tiver negativo;
  6. sem decisão: `tipo_bem` "imovel" do coletor com categoria fraca de imóvel ou sem categoria fica imóvel;
     "rural" sem nenhum sinal sai (o coletor marca "rural" por "agrícola", "gado"...).

"Lote" sozinho nunca conta (é também lote de leilão): só "lote de terreno", "lote urbano/rural", "lote N da quadra M",
"lote de área", "loteamento" e "Lote, Residencial". Só a biblioteca padrão; testes em testar.py.
"""

from __future__ import annotations

import re
import unicodedata


def norm(s) -> str:
    """Minúsculas, sem acento e com a compatibilidade do Unicode (NFKD: "m²" vira "m2", "nº" vira "no")."""
    if s is None or isinstance(s, float):
        return ''
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return s.lower()

def alt(lista: list[str]) -> re.Pattern:
    return re.compile("|".join(f"(?:{p})" for p in lista))

TESTE = re.compile(r"fins\s+de\s+treinamento|apenas\s+para\s+teste|\blote\s+(de\s+)?teste\b|\bteste\s+de\s+lote\b")

CAT_FORTE = re.compile(r"\b(imove|imovei|imobil|imobi|apartament|terren|fazenda|sitio|chacara|gleba|"
                       r"lotes?\s*(urbano|rural)|terrenos?\s*e\s*lotes|galpo|galpa|predio|rura(l|is)\b|area\s+rural|"
                       r"alienacao|vaga\s+de\s+garagem|ponto-comercial|residenciais\b|"
                       r"casas?\b(?!\s*(,|e\b|&|/\s*escrit|de\s+boneca)))")
CAT_FRACA = re.compile(r"\b(instituicao\s+financeira|comerciais\b|comercial\s*/\s*industrial|salas?\b|lojas?\b|compra\s+por\s+proposta|"
                       r"tribunal|judicial|online|leilao)")
CAT_NAO = re.compile(r"\b(veic|carro|moto|caminh|onibus|maquin|trator|agricolas?\b|implement|equipament|sucata|industria|"
                     r"pecas|retro|escavadeira|carregadeira|plantadeira|semeadora|colheitadeira|pulveriz|empilhad|compactador|"
                     r"motoniveladora|telehandler|grades|arados|gado|semovente|bovino|equino|animais|informatica|"
                     r"tecnologia|eletro|movei|mobili|diversos|outros|bens\b|moda|roupas|brinquedos|joias|arte|pintura|quadros|"
                     r"prata|porcelana|cristal|colecion|decorac|utilidades|escritorio)")

FORTE = [
    r"\bapartament", r"\bkitnet", r"\bquitinete", r"\bsobrado", r"\bterren(o|os)\b", r"\bloteamento\b",
    r"\bimove(l|is)\s+(rural|urbano|residencial|comercial|com|situad|localizad|matriculad|registrad|denominad)",
    r"^\W*(?!.*\bmoveis\s+e\s+imoveis)(\w+\W+){0,4}imove(l|is)\b(?!\s+(moveis|semoventes))",
    r"\bfazenda\b(?!\s+(nacional|publica|estadual|municipal|federal|do\s+estado|da\s+uniao|do\s+municipio|nova|rio\s+grande|vilanova))",
    r"\bchacara", r"\bgleba\b", r"[\d.,]+\s*(hectares|alqueires)\b", r"\bregistro\s+(geral\s+)?de\s+imove",
    r"\boficio\s+de\s+registro", r"\bcartorio\s+de\s+registro", r"\bunidade\s+autonoma", r"\bgalpa", r"\bgalpo",
    r"\bpredio\s+(comercial|residencial|n[o°º.]|\d|com|de\s+(\d|alvenaria|madeira)|situad|localizad)", r"\bedificio\b",
    r"\bmatricula\s*(imobiliaria|n[o°º.]*|sob\s+(o\s+)?n[o°º.]*)\s*[\d.]{3,}",
    r"\bcasas?\s+(residencia|terrea|de\s+(alvenaria|moradia)|n[o°º.]\s*\d|geminada|em\s+condominio|assobradad)",
    r"\barea\s+(de\s+terras?|rural|urbana|do\s+terreno|de\s+terreno|superficial)",
]
P = FORTE + [
    r"\bapto?\b\.?\s*(n[o°º]?\.?\s*)?\d", r"\bapto\b", r"\bstudio\b", r"\bflat\b(?!\s+die)",
    r"(^|[-—|/:,.(]\s*)casas?\b(?!\s*(&|e\s+decorac|claudia|dos\s+sonhos|(de\s+)?(boneca|cachorro|passaro|bomba|maquina|forca|ferramenta|cafe)))",
    r"\bcasas?\s+(de\s+(madeira|campo|praia)|com\s+\d|c/|\d|em\s|situad|localizad)",
    r"\b(uma|01|1)\s+casa\b(?!\s+(dos\s+sonhos|de\s+boneca))",
    r"\blote\s+(de\s+terreno|urbano|residencial|rural|edificado|comercial|de\s+area)",
    r"\blote\s*,\s*(residencial|comercial|industrial|expansao|rural|urbano)",
    r"\blotes?\s+(n[o°º.]*\s*)?\d+[a-z]?\s*[,\-]?\s*(da\s+|de\s+)?(quadra|qd)",
    r"\b(quadra|qd)\.?\s*(n[o°º.]*\s*)?[\da-z]{1,4}\b.{0,30}\b(lote|lt)\b",
    r"^\W*salas?\b", r"\bsalas?\s+(a\.?[ctp]\.|comercia|n[o°º.]*\s*\d|\d|em\s|com\s+\d|c/)", r"\bconjunto\s+comercial",
    r"^\W*lojas?\b", r"\blojas?\s+(de\s+area|a\.?[ctp]\.|n[o°º.]*\s*\d|\d|comercia|terrea|em\s|com\s+\d|c/)",
    r"\bponto\s+comercial", r"\bbarracao\b", r"\bpredio\b", r"\bedificacao", r"\bimove(l|is)\b(?!\s+(moveis|semoventes))",
    r"\bsitio\b(?!\s+(eletronico|www|do\s+leiloeiro|oficial))", r"\bestancia\b", r"\bgranja\b",
    r"\barea\s+(construida|privativa)",
    r"\barea\s*(total|de|com|:)?\s*[\d.,]+\s*(m2|m²|mts|metros|ha\b|has\b|hectares|alqueires)",
    r"\ba\.\s?[ctp]\.\s*[\d.,]+\s*m", r"\bterras\b", r"\bparte\s+(ideal\s+)?de\s+terra", r"\d\s*ha\b", r"\d\s*has\b",
    r"\b(c\.?r\.?i\.?|r\.?g\.?i\.?)\b\s*(de|do|da)\b", r"\bvagas?\s+de\s+garagem", r"\bbox\s+(de\s+garagem|n[o°º.]*\s*\d|\d)",
    r"\bcobertura\s+(duplex|residencial|n[o°º.]|\d)", r"\bresidencia\b", r"\bdireitos\s+(sobre|aquisitivos|possessorios)(?!\s+(o\s+|a\s+)?(carro|moto|veic|automov|caminh))",
    r"\bfracao\s+ideal", r"\bbenfeitoria", r"\bcondominio\s+(residencial|edificio|horizontal|vertical|fechado)",
    r"\bconj(unto)?\.?\s+hab", r"(^|[,|\-—.]\s*)residencial\b(?!\s+(de\s+)?(elevador|portao|ar\b))",
    r"\bestacionamento\b(?!.{0,30}ticket)", r"\bmultipropriedade",
]
P_TITULO = P + [
    r"\b(rua|r\.|avenida|av\.?|travessa|estrada|rodovia|alameda)\s+[a-z][a-z .'-]{2,60},\s*(n\.?|n[o°º]|numero)?\s*\d{1,5}\b",
    r"\b(rua|avenida|av\.|travessa|estrada|rodovia)\s+[a-z].{0,60}\b(n\.?|n[o°º]|numero)\s*\d",
]
FORTE_RE, P_RE, PT_RE = alt(FORTE), alt(P), alt(P_TITULO)

N = [
    r"\bplaca\b(?!\s+(de\s+)?(video|mae|solar|rede|eletronica|circuito|cimenticia|de\s+gesso))", r"\bchassi", r"\brenavam",
    r"\b(19[5-9]\d|20[0-3]\d)\s*/\s*(19[5-9]\d|20[0-3]\d)\b(?!\s*/)", r"\b\d{2}/\d{2}\s*[-–]\s*[a-z]",
    r"\bano\s*(de\s+fabricacao|modelo|fab)?\s*:?\s*(19[6-9]\d|20[0-2]\d)\b",
    r"\b(veicul|automove|automovel|carros?\b|motocicl|motos?\b|caminhao|caminhonete|onibus|micro-?onibus|reboque|semirreboque|carreta|carroceria|trator|"
    r"retro\s*-?escavadeira|escavadeira|pa\s+carregadeira|carregadeira|plantadeira|semeadora|semeadeira|adubadeira|colheitadeira|"
    r"pulverizador|implemento|empilhadeira|motoniveladora|rolo\s+compactador|compactador|guindaste|munck|betoneira|gerador|"
    r"grade\s+(aradora|niveladora|agricola)|arado|motor\s+(eletrico|diesel|de\s+popa)|lancha|barco|embarcacao|jet\s*ski|aeronave|helicoptero|"
    r"semovente|bovino|novilh|garrot|bezerr|vacas?\b|bois?\b|touros?\b|equino|cavalos?\b|eguas?\b|cabecas\s+de|"
    r"sucata|secador|desumidificador|envasadora|forno\s+industrial|maquinas?\b|maq\.|lixadeira|urdideira|prensa|torno\b|"
    r"porcelanato|revestimento|azulejo|telhas?\b|piso\s+(ceramic|vinilic|laminad)|pisos\b|grama\b|lona\b|tapetes?\b|carpete|"
    r"toneladas|sacas\s+de|graos\b|racao|pneus?\b|miner)",
    r"\b(fiat|volkswagen|vw/|gm/|chevrolet|ford|honda|toyota|hyundai|renault|peugeot|citroen|nissan|jeep|mitsubishi|kawasaki|"
    r"yamaha|scania|volvo|iveco|m\.?\s*benz|mercedes|caterpillar|komatsu|john\s+deere|massey|new\s+holland|valtra|case\s+\d|land\s+rover)\b",
    r"\b(mesas?|cadeiras?|guarda[- ]roupas?|sofas?|poltronas?|armarios?|estantes?|prateleiras?|vasos?|quadros?|monitor(es)?|notebooks?|"
    r"computador(es)?|impressoras?|celular(es)?|smartphones?|iphone|televis\w*|geladeira|refrigerador|freezer|fogao|micro-?ondas|ventilador(es)?|"
    r"ar[- ]condicionado|roteador(es)?|manequi\w*|bebedouro|itens|pecas|kit|calcas?|camisas?|vestidos?|sapatos?|calcados|brinquedos|bonecas?|"
    r"joias|aneis|relogios?|bijuterias?|berloques?|pulseiras?|pingentes?|colar|perfum\w*|cosmetic\w*|produtos|mercadorias|eletrodomestic\w*|"
    r"utensilios|ferramentas?|colchao|revista|decoracao|equipamentos?|controlador(es)?|cancelas?|abajur|luminarias?|lampadas?|furadeira)\b",
    r"\b(oleo\s+sobre|acrilica\s+sobre|pintura|gravura|litogravura|serigrafia|escultura|antig[oa]s?|seculo\s+x|porcelana|faianca|"
    r"cristal|emoldurad|prata\s+\d|bronze|cobre\s+espesso)",
    r"\bunidades\b(?!\s+(autonomas|habitaciona|residencia|comercia))", r"\bloc\.?\s*(sala|quarto|suite|cozinha|varanda|deposito|banheiro|area)",
    r"\bmed\.?\s*aprox", r"^\W*item\s*:", r"\blote\s+montado", r"\bcaixas?\s+contendo", r"bens\s*:", r"\d\s*m3", r"\b\d\.\d\s+(ha|hb|mpi|flex|turbo|tsi|16v|8v)\b",
]
N_RE = alt(N)
# negativo "fraco": palavra que também é nome de lugar ou adjetivo comum em imóvel ("Lagoa do Carro", "Mercedes/PR",
# "Quadra Fiat", "Fazenda Cabeça da Vaca", "antiga rua", "3 pisos"). Com positivo comum no título, não veta.
N_FRACO = re.compile(r"^(antig[oa]s?|pisos|carros?|mercedes|fiat|vacas?|bois?|touros?|cavalos?|eguas?|bronze|cobre\s+espesso)$")

def classificar(titulo, categoria, descricao, tipo_bem) -> tuple[bool, str]:
    """(é imóvel, motivo). O motivo começa pelo passo que decidiu: teste, neg_titulo, forte_titulo, titulo_neg_fraco,
    titulo, categoria, descricao, tipo_coletor ou sem_sinal; depois de ":" vem o trecho que decidiu."""
    # Só o começo da descrição é lido: normalizar 1.400 caracteres basta para os 700 (a descrição inteira tem até 20 mil).
    t, c, d = norm(titulo), norm(categoria), norm(descricao[:1400] if isinstance(descricao, str) else descricao)[:700]
    if TESTE.search(t) or TESTE.search(d):
        return False, 'teste'
    neg_t = N_RE.search(t)
    if neg_t:
        f = FORTE_RE.search(t)
        if f:
            return True, 'forte_titulo:' + f.group(0)
        negs = [m.group(0) for m in N_RE.finditer(t)]
        pt = PT_RE.search(t)
        if pt and all(N_FRACO.match(x.strip()) for x in negs):
            return True, 'titulo_neg_fraco:' + pt.group(0)
        return False, 'neg_titulo:' + neg_t.group(0)
    pos_t = PT_RE.search(t)
    if pos_t:
        return True, 'titulo:' + pos_t.group(0)
    cat_forte = bool(CAT_FORTE.search(c))
    cat_nao = bool(CAT_NAO.search(c)) and not cat_forte
    if cat_forte:
        return True, 'categoria:' + c[:30]
    if not cat_nao:
        pos_d = FORTE_RE.search(d)
        if pos_d and not N_RE.search(d):
            return True, 'descricao:' + pos_d.group(0)
    if tipo_bem == 'imovel' and not cat_nao:
        return True, 'tipo_coletor'
    return False, 'sem_sinal' + (':cat_nao' if cat_nao else '')
