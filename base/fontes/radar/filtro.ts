/**
 * Filtro "é leilão de imóvel?" do radar de editais, e detector de avisos que não anunciam
 * leilão futuro (resultado, homologação, arrematação).
 *
 * Os quatro radares trazem muito mais do que leilão de imóvel: o PNCP mistura imóveis com
 * veículos e sucata na mesma modalidade, o DJEN traz citações e intimações por edital, o DOU
 * seção 3 traz todo tipo de aviso e o Querido Diário devolve diários inteiros. Este módulo
 * decide, só pelo texto, se o aviso é de leilão (ou praça/hasta pública) de bem imóvel.
 *
 * Como decide (texto sem HTML; as regras rodam em minúsculas sem acento, com as mesmas posições):
 * 1. Precisa de sinal de leilão: "leilão", "leiloeiro", "hasta pública", "1ª/2ª praça",
 *    "praça única", "arrematação/arrematante". No PNCP a modalidade já é leilão
 *    (`leilaoGarantido`).
 * 2. Concessão, permissão ou cessão de uso, locação e arrendamento sem menção a venda ou
 *    alienação ficam de fora: não é compra do imóvel.
 * 3. Aceita com um sinal forte de imóvel: imóvel, terreno, lote urbano, lote/quadra,
 *    loteamento, edificação, apartamento, casa, sobrado, residência, unidade habitacional,
 *    sala comercial, galpão, fazenda, gleba, chácara, sítio, prédio, unidade autônoma, vaga de
 *    garagem, hectares, domínio útil, área urbana/pública/remanescente/rural, próprio
 *    municipal, bem dominical.
 * 4. Leilão com bens móveis (veículo, sucata, mercadorias...): o sinal forte só conta se
 *    estiver no OBJETO do leilão, não numa frase de local. Não contam "vistoriados no galpão",
 *    "que se encontra no imóvel", "sessão no prédio da Prefeitura", "Local: Edifício Sede".
 *    Termos que também nomeiam lugar (galpão, prédio, terreno, casa, fazenda, edificação,
 *    residência, área pública, lotes) precisam ainda de uma palavra de objeto antes, na mesma
 *    oração ("leilão de", "alienação de", "lote 02 –", "bem:").
 * 5. Sem sinal forte, aceita com dois sinais fracos (área total/privativa, metragem em m²,
 *    matrícula, benfeitorias, loja, sala nº, IPTU) desde que não haja sinal de bem móvel.
 *    "Área" sozinha nunca conta: "área técnica", "área de atuação", "área do pátio" e "área de
 *    vistoria" aparecem em todo tipo de edital.
 *
 * Falsos amigos com exceção: "Fazenda" de órgão ("Ministério/Secretaria da/de Fazenda",
 * "Fazenda Nacional/Pública", "perante a Fazenda" sem nome próprio), "Casa Civil", "Casa do
 * Leiloeiro", nome de lugar ("bairro Casa Verde", "Rua Fazenda Velha"), "sítio eletrônico",
 * "praça" como logradouro (só conta com ordinal: "1ª praça"), "lote" de leilão (só conta "lote
 * urbano", "lote 12 da quadra 3", "lotes de propriedade do Município"...), "leilão eletrônico"
 * (não é bem eletrônico) e "vaga para 1 veículo" (não é bem móvel). É heurística, coberta por
 * testes com textos reais (amostras arquivadas) e construídos (fixtures/corpus); na dúvida,
 * prefere descartar.
 */
import { colapsarEspacos, dobrarCaixaEAcento, semAcento, semHtml } from "../../util/texto.ts";

export interface Sinal {
  /** Nome curto do sinal, ex.: "apartamento". */
  rotulo: string;
  /** Posição no texto analisado (`AnaliseLeilaoImovel.texto`). */
  inicio: number;
  fim: number;
}

export interface AnaliseLeilaoImovel {
  /** É leilão de imóvel. */
  aceito: boolean;
  /** Explicação curta da decisão (vai para logs e testes). */
  motivo: string;
  /** Texto analisado: o original sem HTML (as posições dos sinais valem nele). */
  texto: string;
  leilao: Sinal[];
  /** Sinais fortes de imóvel que contam (no objeto do leilão). */
  imovelForte: Sinal[];
  /** Sinais fortes que não contam: só aparecem como local dos bens móveis ou da sessão. */
  imovelLocal: Sinal[];
  imovelFraco: Sinal[];
  /** Sinais de bem móvel (veículo, sucata, semovente...). */
  moveis: Sinal[];
  /** Concessão/locação sem venda. */
  usoSemVenda: Sinal[];
}

export interface OpcoesFiltro {
  /** A fonte já garante que é leilão (ex.: modalidade "Leilão" no PNCP). */
  leilaoGarantido?: boolean;
}

/** Um achado de regex, com o texto original e o dobrado (minúsculas sem acento). */
interface Achado {
  original: string;
  dobrado: string;
  inicio: number;
  fim: number;
}

interface Regra {
  rotulo: string;
  regex: RegExp;
  /** Confere o achado no contexto (falsos amigos). `false` = não é sinal. */
  aceitar?: (a: Achado) => boolean;
  /** Termo que também nomeia lugar: com bens móveis, só conta com palavra de objeto antes. */
  ambiguo?: boolean;
}

interface SinalInterno extends Sinal {
  ambiguo: boolean;
}

// ---------------------------------------------------------------------------
// Contexto em volta do achado
// ---------------------------------------------------------------------------

function antes(a: Achado, n: number): string {
  return a.dobrado.slice(Math.max(0, a.inicio - n), a.inicio);
}

function depois(a: Achado, n: number): string {
  return a.dobrado.slice(a.fim, a.fim + n);
}

/** Palavras de função: depois de "Fazenda", não são nome próprio ("A FAZENDA SERÁ..."). */
const PALAVRAS_FUNCAO = new Set(
  (
    "E OU O A OS AS AO AOS DE DA DO DAS DOS NO NA NOS NAS EM SERA SERAO DEVERA DEVERAO PODERA PODERAO " +
    "PARA POR PELO PELA PELOS PELAS QUE COM SEM SOBRE ATE NAO SE FICA FICAM COMO QUANTO ONDE"
  ).split(" "),
);

/** Nome de lugar logo antes ("bairro Casa Verde", "Rua da Fazenda", "Loteamento Chácara..."). */
const TOPONIMO_ANTES =
  /\b(?:bairro|vila|jardim|rua|r\.|avenida|av\.?|travessa|tv\.?|alameda|estrada|rodovia|praca|largo|parque|distrito|setor|localidade|comunidade|povoado|loteamento)\s+(?:d[aeo]s?\s+)?$/;

/** Rótulo de local logo antes ("Local: Edifício Sede", "Local do leilão: auditório do prédio"). */
const ROTULO_LOCAL_ANTES =
  /\blocal(?:\s+d[aoe]s?\s+(?:leil(?:ao|oes)|sessao|vistoria|visitacao|retirada|bens|evento|realizacao|pregao|hasta|praca|exposicao|entrega))?\s*:\s*(?:[^\s.;:,]+\s+){0,3}$/;

/** Endereço rotulado logo antes; só vale como local em leilão com bens móveis. */
const ENDERECO_ANTES = /\benderecos?\s*:\s*(?:[^\s.;:,]+\s+){0,3}$/;

/**
 * Preposição de lugar logo antes, com qualificador e "pátio do", "cais da"... opcionais:
 * "no galpão", "no pátio do imóvel", "no antigo prédio", "em área pública". A palavra do meio
 * não pode ser do próprio leilão ("em leilão do imóvel", "na forma do edital").
 */
const LOCATIVO_ANTES = new RegExp(
  "\\b(?:no|na|nos|nas|num|numa|em|ao|aos|junto\\s+ao?|dentro\\s+d[oa]|defronte\\s+a[oa]?|perante)\\s+" +
    "(?:(?:mesmo|mesma|antigo|antiga|atual|proprio|propria|referido|referida|citado|citada|um|uma|seu|sua)\\s+)?" +
    "(?:(?!(?:leil|hasta|praca|lote|venda|aliena|forma|modalidade|regime|condic|estado|ambito|termo|caso|qualidade|valor|" +
    "prazo|data|dia|processo|autos|edital)[a-z]*\\s)[a-z]+\\s+(?:d[aeo]s?\\s+|n[ao]s?\\s+))?$",
);

/** O evento acontece no lugar ("sessão no prédio", "vistoria no galpão"): o lugar não é o objeto. */
const EVENTO_NO_LOCAL =
  /\b(?:sessao|sessoes|realizad[oa]s?|realizar(?:-se-a)?|ocorrera|acontecera|vistori\w*|visita\w*|retirad[oa]s?|retirar|expost[oa]s?|exposicao|depositad[oa]s?|guardad[oa]s?|armazenad[oa]s?|recolhid[oa]s?|estacionad[oa]s?|removid[oa]s?)\b/;

/** Rótulo de local antes, na mesma oração ("Local do leilão: Parque de Exposições, galpão 2"). */
const ROTULO_LOCAL_NA_ORACAO = /\b(?:local|endereco|vistoria|visitacao|retirada)\b[^:]{0,30}:/;

/**
 * Palavra que põe o termo no objeto do leilão: "leilão de", "alienação de", "venda de", "Lote
 * 02 –", "Bem:", "descrição", "direitos sobre". "Leilão" sozinho não basta ("leilão a realizar-se
 * na sede do Fórum, prédio anexo").
 */
const OBJETO =
  /\b(?:lotes?|bem|bens|objeto|aliena\w*\s+d[aeo]s?|venda\s+d[aeo]s?|vender|leil(?:ao|oes)\s+(?:(?:judicial|publico|eletronico|presencial|extrajudicial)\s+)?d[aeo]s?|hasta\s+publica\s+d[aeo]s?|arremat\w*|descri\w*|direitos?|imove(?:l|is)|compost[oa]s?|constituid[oa]s?|consistente)\b/;

const ABREVIACOES = new Set(["n", "no", "nº", "art", "arts", "proc", "av", "dr", "dra", "sr", "sra", "srs", "fls", "fl", "ltda", "cia", "p", "pag", "tv", "r", "des", "exmo", "exma", "lt", "qd", "apto", "ap", "s", "a", "min"]);

/** Início da oração que contém `pos` (depois de ";", quebra de linha ou ponto final). */
function inicioDaOracao(texto: string, pos: number): number {
  const limite = Math.max(0, pos - 200);
  for (let i = pos - 1; i >= limite; i--) {
    const c = texto.charAt(i);
    if (c === ";" || c === "\n") return i + 1;
    if ((c === "." || c === "!" || c === "?") && /\s/.test(texto.charAt(i + 1))) {
      const palavra = /([\p{L}º]+)$/u.exec(texto.slice(Math.max(0, i - 12), i))?.[1]?.toLowerCase() ?? "";
      if (c === "." && ABREVIACOES.has(semAcento(palavra))) continue;
      return i + 1;
    }
  }
  return limite;
}

// ---------------------------------------------------------------------------
// Falsos amigos
// ---------------------------------------------------------------------------

function naoEhToponimo(a: Achado): boolean {
  return !TOPONIMO_ANTES.test(antes(a, 40));
}

/** Órgão com "Fazenda" ("Secretaria de Estado de Fazenda", "Ministério da Fazenda", "Vara da Fazenda"). */
const ORGAO_FAZENDA_ANTES =
  /\b(?:ministerio|secretaria|secretario|procuradoria|procurador|receita|juizo|varas?|sefaz|superintendencia|delegacia|departamento|coordenacao|coordenadoria|subsecretaria|conselho|tesouro|controladoria|diretoria|gerencia|inspetoria|agencia|auditoria|corregedoria|exatoria|coletoria|assessoria|chefia|gabinete|camara|turma|tribunal|orgaos?|fiscal|fiscais|auditor(?:es)?|agentes?)\b(?:[\s-]+[a-z]+){0,4}\s+d[aeo]\s+$/;

/**
 * "Fazenda" é imóvel rural quando vem com nome próprio ("Fazenda Santa Rita", "FAZENDA BOA
 * VISTA") ou descrição ("fazenda denominada", "fazenda com 120 ha"), no plural, e nunca depois de
 * órgão ou antes de "Nacional/Pública/Estadual...". "perante a Fazenda" não conta.
 */
function fazendaEhImovel(a: Achado): boolean {
  if (!naoEhToponimo(a) || ORGAO_FAZENDA_ANTES.test(antes(a, 90))) return false;
  const seguinte = depois(a, 40);
  if (/^\s+(?:nacional|publica|estadual|municipal|federal|distrital|do\s+estado|do\s+municipio|da\s+uniao|e\s+(?:planejamento|gestao|administracao|financas|tesouro|economia))\b/.test(seguinte)) return false;
  if (a.dobrado.slice(a.inicio, a.fim).endsWith("s")) return true;
  if (/^\s+(?:denominad|chamad|conhecid|rura(?:l|is)\b|situad|localizad|com\s|de\s+\d|medindo|contendo|registrad|matriculad|n[º°o]\.?\s*\d|\d)/.test(seguinte)) return true;
  const proxima = /^\s+([\p{L}][\p{L}'’-]*)/u.exec(a.original.slice(a.fim, a.fim + 40))?.[1];
  return proxima !== undefined && /^\p{Lu}/u.test(proxima) && !PALAVRAS_FUNCAO.has(semAcento(proxima).toUpperCase());
}

const CASA_INSTITUICAO =
  /^\s+(?:civil|militar|da\s+moeda|de\s+leil(?:ao|oes)|d[oe]s?\s+leiloeiros?|legislativa|de\s+custodia|de\s+detencao|bancaria|loterica|de\s+cambio|da\s+cultura|de\s+cultura|do\s+povo|do\s+cidadao|da\s+crianca|da\s+mulher|de\s+saude|de\s+apoio|de\s+passagem|de\s+acolhimento|de\s+recuperacao|de\s+repouso|de\s+shows?|de\s+espetaculos|lar|abrigo)\b/;

function casaEhImovel(a: Achado): boolean {
  return naoEhToponimo(a) && !CASA_INSTITUICAO.test(depois(a, 30));
}

function residenciaEhImovel(a: Achado): boolean {
  if (!naoEhToponimo(a)) return false;
  if (/\b(?:comprovante|endereco|local|prova|certidao|mudanca|domicilio|declaracao|atestado)\s+d[ae]\s+$/.test(antes(a, 40))) return false;
  if (/\b(?:sua|seu|suas|seus)\s+$/.test(antes(a, 10))) return false;
  return !/^\s+(?:medica|multiprofissional|juridica|artistica|universitaria|fiscal|oficial)\b/.test(depois(a, 30));
}

/** "vaga para 1 veículo", "garagem para 2 automóveis": capacidade de garagem, não bem móvel. */
function veiculoEhBemMovel(a: Achado): boolean {
  return !/\b(?:vagas?|garage(?:m|ns)|estacionamentos?|abrigo|comporta(?:ndo|m)?|capacidade|guarda|box|boxes)\b[^.;]{0,40}$/.test(antes(a, 60));
}

// ---------------------------------------------------------------------------
// Sinais
// ---------------------------------------------------------------------------

const SINAIS_LEILAO: readonly Regra[] = [
  { rotulo: "leilão", regex: /\bleil(?:ao|oes)\b/g },
  { rotulo: "leiloeiro", regex: /\bleiloeir[oa]s?\b/g },
  { rotulo: "hasta pública", regex: /\bhastas?\s+publicas?\b/g },
  { rotulo: "praça", regex: /(?:\b[123]\s*(?:ª|º|°|a|o)?\s*|\b(?:primeira|segunda|terceira)\s+)(?:praca|hasta)\b/g },
  { rotulo: "praça única", regex: /\bpraca\s+unica\b/g },
  { rotulo: "arrematação", regex: /\barremata(?:cao|coes|nte|ntes)\b/g },
];

const SINAIS_IMOVEL_FORTE: readonly Regra[] = [
  { rotulo: "imóvel", regex: /\bimove(?:l|is)\b/g },
  { rotulo: "terreno", regex: /\bterrenos?\b/g, aceitar: naoEhToponimo, ambiguo: true },
  { rotulo: "lote urbano", regex: /\blotes?\s+(?:urbanos?|de\s+terras?|de\s+terrenos?|residenciais|residencial|comerciais|comercial|rurais|rural)\b/g },
  { rotulo: "lote e quadra", regex: /\blotes?\s+(?:n[º°o]?\.?\s*)?\d+[a-z]?\s*(?:,\s*|\s+)(?:d[ao]\s+)?quadras?\b/g },
  {
    rotulo: "lotes de terreno",
    regex:
      /\blotes?\s+(?:de\s+propriedade|pertencentes?|situad[oa]s?|localizad[oa]s?|(?:n|d)[oa]s?\s+(?:loteamento|distrito|bairro|jardim|parque|conjunto|residencial|condominio|setor|quadra|zona|nucleo|vila))\b|\blotes?\s+(?:com\s+(?:a\s+)?area|com\s+\d|medindo|de\s+\d+(?:[.,]\d+)*\s*(?:m2|m²|metros))|\b(?:venda|aliena\w*|doacao|permuta)\s+(?:de|dos?)\s+(?:\d+\s+(?:\([a-z\s]+\)\s+)?)?lotes?\b(?=\s*(?:[.;,]|$)|\s+(?:e|com|medindo)\b)/g,
    ambiguo: true,
  },
  { rotulo: "loteamento", regex: /\bloteamentos?\b/g },
  { rotulo: "edificação", regex: /\bedifica(?:cao|coes)\b/g, ambiguo: true },
  { rotulo: "apartamento", regex: /\bapartamentos?\b|\baptos?\.?\s*(?:n[º°o]?\.?\s*)?\d/g },
  { rotulo: "casa", regex: /\bcasas?\b/g, aceitar: casaEhImovel, ambiguo: true },
  { rotulo: "sobrado", regex: /\bsobrados?\b/g, aceitar: naoEhToponimo },
  { rotulo: "residência", regex: /\bresidencias?\b/g, aceitar: residenciaEhImovel, ambiguo: true },
  { rotulo: "unidade habitacional", regex: /\bunidades?\s+(?:habitaciona(?:l|is)|residencia(?:l|is))\b/g },
  { rotulo: "sala comercial", regex: /\bsalas?\s+comercia(?:l|is)\b/g },
  { rotulo: "galpão", regex: /\bgalp(?:ao|oes)\b/g, aceitar: naoEhToponimo, ambiguo: true },
  { rotulo: "fazenda", regex: /\bfazendas?\b/g, aceitar: fazendaEhImovel, ambiguo: true },
  { rotulo: "gleba", regex: /\bglebas?\b/g, aceitar: naoEhToponimo },
  { rotulo: "chácara", regex: /\bchacaras?\b/g, aceitar: naoEhToponimo },
  {
    rotulo: "sítio",
    regex: /\bsitios?\b(?!\s+(?:eletronic|oficia|institucional|da\s+internet|na\s+internet|na\s+rede|www|https?|do\s+(?:orgao|tribunal|leiloeiro|banco|municipio|ministerio|pncp)|de\s+internet))/g,
    aceitar: naoEhToponimo,
  },
  { rotulo: "prédio", regex: /\bpredios?\b|\bedificios?\b/g, aceitar: naoEhToponimo, ambiguo: true },
  { rotulo: "unidade autônoma", regex: /\bunidades?\s+autonomas?\b/g },
  { rotulo: "vaga de garagem", regex: /\bvagas?\s+(?:de\s+)?garage(?:m|ns)\b/g },
  { rotulo: "área rural", regex: /\bhectares?\b|\balqueires?\b/g },
  { rotulo: "área de imóvel", regex: /\bareas?\s+(?:urbanas?|publicas?|remanescentes?|rura(?:l|is)|de\s+terras?|desafetadas?)\b/g, ambiguo: true },
  { rotulo: "próprio público", regex: /\bpropri(?:o|os)\s+(?:municipa(?:l|is)|estadua(?:l|is)|federa(?:l|is)|publicos?|nacionais?|da\s+uniao)\b/g },
  { rotulo: "bem dominical", regex: /\b(?:bem|bens|imove(?:l|is)|patrimonio|areas?)\s+(?:publicos?\s+)?domin(?:ica|ia)(?:l|is)\b/g },
  { rotulo: "domínio útil", regex: /\bdominio\s+util\b|\baforamento\b|\bterrenos?\s+de\s+marinha\b/g },
];

const SINAIS_IMOVEL_FRACO: readonly Regra[] = [
  { rotulo: "área", regex: /\bareas?\s+(?:total|construida|privativa|util|comum|do\s+terreno|territorial|real)\b/g },
  { rotulo: "metragem", regex: /\b\d+(?:[.,]\d+)*\s*(?:m2|m²|metros?\s+quadrados?)/g },
  { rotulo: "matrícula", regex: /\bmatriculas?\s+(?:sob\s+o\s+)?(?:n[º°o]?s?\.?\s*)?\d/g },
  { rotulo: "benfeitorias", regex: /\bbenfeitorias?\b/g },
  { rotulo: "loja", regex: /\blojas?\b(?!\s+(?:virtual|online|on-line|maconica))/g },
  { rotulo: "sala", regex: /\bsalas?\s+(?:n[º°o]?\.?\s*)?\d+/g },
  { rotulo: "IPTU", regex: /\biptu\b|\binscricao\s+imobiliaria\b/g },
];

const SINAIS_MOVEIS: readonly Regra[] = [
  {
    rotulo: "veículo",
    regex: /\bveiculos?\b|\bautomove(?:l|is)\b|\bmotocicletas?\b|\bcaminh(?:ao|oes|onetes?)\b|\bonibus\b|\breboques?\b|\bsemirreboques?\b|\btratores?\b/g,
    aceitar: veiculoEhBemMovel,
  },
  { rotulo: "sucata", regex: /\bsucatas?\b/g },
  { rotulo: "bens móveis", regex: /\bbens\s+(?:moveis|inserviveis|permanentes)\b|\binserviveis\b/g },
  { rotulo: "semoventes", regex: /\bsemoventes?\b|\bbovinos?\b|\bequinos?\b|\bgado\b/g },
  // "Eletrônico" sozinho não: "leilão eletrônico" é a forma do leilão, não o bem.
  { rotulo: "mercadorias", regex: /\bmercadorias?\b|\bmateriais\b|\bequipamentos?\b|\bmobiliarios?\b|\bcomputadores?\b|\beletro(?:eletronicos?|domesticos?|portateis)\b/g },
  { rotulo: "máquinas", regex: /\bmaquin(?:as|ario|arios)\b/g, aceitar: (a) => !/\bcasas?\s+de\s+$/.test(antes(a, 12)) },
  { rotulo: "aeronaves", regex: /\baeronaves?\b|\bembarca(?:cao|coes)\b|\bnavios?\b/g },
  { rotulo: "madeira", regex: /\bmadeiras?\b/g },
  { rotulo: "joias", regex: /\bjoias?\b|\bsemijoias?\b/g },
];

const SINAIS_USO: readonly Regra[] = [
  { rotulo: "concessão de uso", regex: /\b(?:concessao|permissao|cessao)\s+(?:onerosa\s+|remunerada\s+|gratuita\s+)?(?:de\s+direito\s+real\s+)?de\s+uso\b/g },
  { rotulo: "locação", regex: /\blocacao\b|\barrendamento\b|\baluguel\b/g },
];

const VENDA = /\baliena(?:cao|coes|r)\b|\bvendas?\b|\bvender\b|\barremata/;

const MAX_SINAIS = 40;

function achar(original: string, dobrado: string, regras: readonly Regra[]): SinalInterno[] {
  const sinais: SinalInterno[] = [];
  for (const regra of regras) {
    regra.regex.lastIndex = 0;
    let n = 0;
    for (const achado of dobrado.matchAll(regra.regex)) {
      const a: Achado = { original, dobrado, inicio: achado.index, fim: achado.index + achado[0].length };
      if (regra.aceitar && !regra.aceitar(a)) continue;
      sinais.push({ rotulo: regra.rotulo, inicio: a.inicio, fim: a.fim, ambiguo: regra.ambiguo === true });
      if (++n >= MAX_SINAIS) break;
    }
  }
  return sinais.sort((x, y) => x.inicio - y.inicio);
}

function semInterno(sinais: readonly SinalInterno[]): Sinal[] {
  return sinais.map(({ rotulo, inicio, fim }) => ({ rotulo, inicio, fim }));
}

function rotulos(sinais: readonly Sinal[]): string {
  return [...new Set(sinais.map((s) => s.rotulo))].join(", ");
}

/**
 * O sinal é o lugar do evento, com ou sem bens móveis? "Local: Edifício Sede", "a sessão será
 * realizada no prédio da Prefeitura", "vistoria no galpão".
 */
function localDoEvento(original: string, dobrado: string, s: Sinal): boolean {
  const anterior = antes({ original, dobrado, inicio: s.inicio, fim: s.fim }, 80);
  if (ROTULO_LOCAL_ANTES.test(anterior)) return true;
  return LOCATIVO_ANTES.test(anterior) && EVENTO_NO_LOCAL.test(dobrado.slice(inicioDaOracao(original, s.inicio), s.inicio));
}

/**
 * Com bens móveis no edital: o sinal está no objeto do leilão? Não está quando vem numa frase
 * de local ("no galpão", "Endereço: ..."); termo ambíguo ainda precisa de palavra de objeto antes
 * na mesma oração, sem rótulo de local no meio.
 */
function noObjeto(original: string, dobrado: string, s: SinalInterno): boolean {
  const a: Achado = { original, dobrado, inicio: s.inicio, fim: s.fim };
  const anterior = antes(a, 80);
  if (LOCATIVO_ANTES.test(anterior) || ENDERECO_ANTES.test(anterior)) return false;
  if (!s.ambiguo) return true;
  const oracao = dobrado.slice(inicioDaOracao(original, s.inicio), s.inicio);
  return OBJETO.test(oracao) && !ROTULO_LOCAL_NA_ORACAO.test(oracao);
}

/** Analisa o texto (HTML aceito) e diz se é leilão de imóvel, com os sinais encontrados. */
export function analisarLeilaoImovel(entrada: string, opcoes: OpcoesFiltro = {}): AnaliseLeilaoImovel {
  const texto = semHtml(entrada);
  // Mesmo comprimento do original: as posições dos sinais valem no texto com acentos.
  const dobrado = dobrarCaixaEAcento(texto);
  const leilao = semInterno(achar(texto, dobrado, SINAIS_LEILAO));
  const todos = achar(texto, dobrado, SINAIS_IMOVEL_FORTE);
  const imovelFraco = semInterno(achar(texto, dobrado, SINAIS_IMOVEL_FRACO));
  const moveis = semInterno(achar(texto, dobrado, SINAIS_MOVEIS));
  const uso = semInterno(achar(texto, dobrado, SINAIS_USO));
  const usoSemVenda = uso.length > 0 && !VENDA.test(dobrado) ? uso : [];
  const contam = todos.filter((s) => !localDoEvento(texto, dobrado, s) && (moveis.length === 0 || noObjeto(texto, dobrado, s)));
  const imovelForte = semInterno(contam);
  const imovelLocal = semInterno(todos.filter((s) => !contam.includes(s)));
  const base = { texto, leilao, imovelForte, imovelLocal, imovelFraco, moveis, usoSemVenda };

  if (!opcoes.leilaoGarantido && leilao.length === 0) {
    return { ...base, aceito: false, motivo: "sem menção a leilão, praça ou hasta pública" };
  }
  if (usoSemVenda.length > 0) {
    return { ...base, aceito: false, motivo: `cessão de uso ou locação, não venda (${rotulos(usoSemVenda)})` };
  }
  if (imovelForte.length > 0) {
    const misto = moveis.length > 0 ? `; também cita bens móveis (${rotulos(moveis)})` : "";
    return { ...base, aceito: true, motivo: `leilão de imóvel (${rotulos(imovelForte)})${misto}` };
  }
  const fracos = new Set(imovelFraco.map((s) => s.rotulo));
  if (fracos.size >= 2 && moveis.length === 0) {
    return { ...base, aceito: true, motivo: `leilão com indícios de imóvel (${[...fracos].join(", ")})` };
  }
  const soLocal = imovelLocal.length > 0 ? `; imóvel citado só como local ou fora do objeto (${rotulos(imovelLocal)})` : "";
  if (moveis.length > 0) return { ...base, aceito: false, motivo: `leilão de bens móveis (${rotulos(moveis)})${soLocal}` };
  return { ...base, aceito: false, motivo: `leilão sem sinal claro de imóvel${soLocal}` };
}

/** Atalho: `true` se o texto é aviso de leilão de imóvel. */
export function ehLeilaoDeImovel(texto: string, opcoes: OpcoesFiltro = {}): boolean {
  return analisarLeilaoImovel(texto, opcoes).aceito;
}

// ---------------------------------------------------------------------------
// Avisos que não anunciam leilão futuro
// ---------------------------------------------------------------------------

/** Cabeçalho de aviso que encerra o leilão: sempre descartado (e pode trazer o nome de quem arrematou). */
const CABECALHO_RESULTADO =
  /^\s*(?:(?:aviso|edital|termo|auto|extrato|despacho|ato|portaria|comunicado)\s+(?:de\s+|da\s+|do\s+)?)?(?:resultados?|homologa(?:cao|coes)|adjudica(?:cao|coes)|arremata(?:cao|coes)|extratos?|ratifica(?:cao|coes)|revoga(?:cao|coes)|anula(?:cao|coes)|cancelamento|julgamentos?|intimacao\s+d[ae]\s+arrematacao)\b|^\s*atas?\b/;

/** Cabeçalho que pode trazer data nova: só fica se o texto tiver data de leilão futura. */
const CABECALHO_CONDICIONAL =
  /^\s*(?:(?:aviso|edital|termo|comunicado|nota)\s+(?:de\s+|da\s+|do\s+)?)?(?:retifica(?:cao|coes)|errata|adiamento|suspensao|reabertura|alteracao|prorrogacao|remarcacao|nova\s+data)\b/;
const LEILAO_ENCERRADO =
  /\b(?:leil(?:ao|oes)|pracas?|hastas?)\s+(?:(?:publicos?|judicia(?:l|is)|eletronicos?|presencia(?:l|is))\s+)?(?:n[º°o]?\.?\s*[\d/.-]+\s+)?(?:desert[oa]s?|fracassad[oa]s?|negativ[oa]s?|frustrad[oa]s?)\b/;

/** Título de resultado no meio do texto (diário com vários avisos, edital do DJEN depois do cabeçalho do juízo). */
const TITULO_RESULTADO =
  /\b(?:(?:edital|aviso)\s+de\s+)?(?:resultados?(?:\s+final)?\s+d[oae]s?\s+(?:leil(?:ao|oes)|hastas?|pracas?|julgamento|certame)|resultado\s+de\s+julgamento|(?:termo|aviso|auto)\s+de\s+(?:homologacao|adjudicacao|arrematacao)|ata\s+(?:da\s+sessao\s+(?:publica\s+)?)?d[oe]\s+(?:leil(?:ao|oes)|hasta|praca|julgamento)|intimacao\s+da\s+arrematacao|homologacao\s+(?:e\s+adjudicacao\s+)?d[oe]\s+(?:leil(?:ao|oes)|resultado))\b/g;
/** O título fala do futuro ("o resultado do leilão será publicado"): não é resultado. */
const FALA_DO_FUTURO = /^[^.;]{0,60}?\b(?:sera|serao|devera|deverao|podera|poderao|estara|estarao|ocorrera|se\s+dara|a\s+ser)\b/;

/** Fatos de leilão já realizado, sem precisar de nome depois. */
const FATO_PASSADO: ReadonlyArray<readonly [string, RegExp]> = [
  ["foi arrematado", /\b(?:foi|foram)\s+(?:devidamente\s+)?(?:arrematad[oa]s?|adjudicad[oa]s?|homologad[oa]s?)\b/],
  ["homologado", /\b(?:fica|ficam)\s+homologad[oa]s?\b|\bhomologo\b|\badjudico\b/],
  ["vencedor declarado", /\b(?:sendo|foi|foram)\s+(?:declarad[oa]s?\s+)?vencedor(?:a|es|as)?\b|\bdeclarad[oa]s?\s+vencedor(?:a|es|as)?\b/],
  ["arrematou", /\barrematou\b|\barremataram\b/],
];

/** Quem ganhou, seguido de nome próprio ("arrematado por João...", "adjudicado a Maria..."). */
const GANHADOR: ReadonlyArray<readonly [string, RegExp]> = [
  ["arrematado por", /\barrematad[oa]s?(?:\s+em\s+(?:leilao|hasta\s+publica|praca))?\s+(?:por|pel[oa]s?)\b/g],
  ["adjudicado a", /\badjudicad[oa]s?\s+(?:a|ao|aos|as|em\s+favor\s+de|para|por|pel[oa]s?)\b/g],
  ["vencedor", /\bvencedor(?:a|es|as)?\b\s*[:–-]?/g],
];
const NOME_PROPRIO = /^\s*(?:(?:[Oo]s?|[Aa]s?|S[Rr][Aa]?\.?|D[Rr][Aa]?\.?)\s+)?(\p{Lu}[\p{L}'’.-]+)(?:\s+(?:d[aeo]s?\s+|e\s+)?(\p{Lu}[\p{L}'’.-]+))+/u;
/** Palavras em maiúscula que não são nome (texto todo em caixa alta: "VENCEDOR O LICITANTE QUE..."). */
const NAO_NOME = new Set(
  (
    "QUE QUEM LICITANTE LICITANTES ARREMATANTE ARREMATANTES PROPONENTE PROPONENTES PARTICIPANTE PARTICIPANTES MAIOR " +
    "MELHOR LANCE LANCES VALOR PRECO OFERTA PROPOSTA AQUELE AQUELA LOTE LOTES BEM BENS IMOVEL LEILAO EDITAL " +
    "MUNICIPIO ESTADO UNIAO DO DA DE E O A OS AS POR PELO PELA SERA DEVERA PODERA PARA COM SEM SEU SUA CERTAME"
  ).split(" "),
);

function nomeProprioDepois(original: string, fim: number): boolean {
  const seguinte = original.slice(fim, fim + 80);
  // Texto já mascarado: o nome virou "[NOME]".
  if (/^\s*(?:(?:[Oo]s?|[Aa]s?|S[Rr][Aa]?\.?)\s+)?\[NOME\]/.test(seguinte)) return true;
  const m = NOME_PROPRIO.exec(seguinte);
  if (!m) return false;
  return [m[1], m[2]].every((p) => p !== undefined && !NAO_NOME.has(semAcento(p).toUpperCase()));
}

/**
 * Marcas de resultado de leilão no corpo do texto: título de resultado/ata/homologação (no
 * começo de frase ou em caixa alta), fato passado ("foi arrematado", "fica homologado") e quem
 * ganhou seguido de nome ("arrematado por Fulano", "sendo vencedor FULANO"). Lista vazia = nada.
 */
export function sinaisDeResultado(entrada: string): string[] {
  const original = semHtml(entrada);
  const dobrado = dobrarCaixaEAcento(original);
  const sinais = new Set<string>();
  TITULO_RESULTADO.lastIndex = 0;
  for (const m of dobrado.matchAll(TITULO_RESULTADO)) {
    const trecho = original.slice(m.index, m.index + m[0].length);
    const inicioDeFrase = /(?:^|[\n.;:!?]\s*)$/.test(original.slice(Math.max(0, m.index - 3), m.index)) || m.index === 0;
    const caixaAlta = trecho === trecho.toUpperCase();
    if ((inicioDeFrase || caixaAlta) && !FALA_DO_FUTURO.test(dobrado.slice(m.index + m[0].length))) sinais.add(colapsarEspacos(trecho.toLowerCase()));
  }
  for (const [rotulo, regex] of FATO_PASSADO) if (regex.test(dobrado)) sinais.add(rotulo);
  for (const [rotulo, regex] of GANHADOR) {
    regex.lastIndex = 0;
    for (const m of dobrado.matchAll(regex)) {
      if (nomeProprioDepois(original, m.index + m[0].length)) {
        sinais.add(rotulo);
        break;
      }
    }
  }
  return [...sinais];
}

/** Cabeçalho de resultado, homologação, ata, arrematação, extrato, revogação ou cancelamento. */
export function ehCabecalhoDeResultado(cabecalho: string | null | undefined): boolean {
  return Boolean(cabecalho) && CABECALHO_RESULTADO.test(dobrarCaixaEAcento(colapsarEspacos(semHtml(cabecalho ?? ""))));
}

export interface ContextoAviso {
  /** Texto do aviso (HTML aceito), para procurar marcas de resultado no corpo. */
  texto?: string | null;
  /** Data do leilão já extraída do texto (futura em relação à publicação), se houver. */
  dataLeilao?: string | null;
}

/**
 * Motivo para o radar descartar o aviso, ou `null` se ele pode anunciar leilão futuro:
 * - cabeçalho de resultado, homologação, adjudicação, arrematação, ata, extrato, revogação ou
 *   cancelamento: sempre descartado;
 * - retificação, errata, adiamento, suspensão, reabertura ou leilão deserto/fracassado: só fica
 *   se o texto trouxer data de leilão futura (`dataLeilao`), porque costuma anunciar a data nova;
 * - marcas de resultado no corpo (`sinaisDeResultado`): descartado.
 */
export function motivoSemLeilaoFuturo(cabecalho: string | null | undefined, contexto: ContextoAviso = {}): string | null {
  const cab = cabecalho ? dobrarCaixaEAcento(colapsarEspacos(semHtml(cabecalho))) : "";
  if (ehCabecalhoDeResultado(cabecalho)) return "aviso de resultado, homologação, extrato ou revogação";
  if (cab && (CABECALHO_CONDICIONAL.test(cab) || LEILAO_ENCERRADO.test(cab)) && !contexto.dataLeilao) {
    return "retificação, adiamento ou leilão deserto sem data nova de leilão";
  }
  if (contexto.texto) {
    const sinais = sinaisDeResultado(contexto.texto);
    if (sinais.length > 0) return `aviso de resultado do leilão (${sinais.join(", ")})`;
  }
  return null;
}

/** Atalho: `true` se o aviso não anuncia leilão futuro (ver `motivoSemLeilaoFuturo`). */
export function ehAvisoSemLeilaoFuturo(cabecalho: string | null | undefined, contexto: ContextoAviso = {}): boolean {
  return motivoSemLeilaoFuturo(cabecalho, contexto) !== null;
}
