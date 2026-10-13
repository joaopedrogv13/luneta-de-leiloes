/**
 * Sinais de texto usados por mais de uma regra: quem paga as dívidas, dívidas declaradas,
 * gravames declarados e venda do imóvel inteiro com reserva da cota do coproprietário
 * (art. 843 do CPC). Regex em minúsculas e sem acento, aplicados por cláusula (apoio.ts).
 *
 * Contrassinal de dívida vale só para a PARTE da cláusula em que aparece: num edital atual a
 * mesma frase costuma dizer "os débitos de IPTU sub-rogam-se no preço (art. 130 do CTN), e os
 * condominiais, propter rem, são do arrematante" (Tema 1.134/STJ para tributo, propter rem
 * para condomínio). A cláusula é partida nos conectivos (", e os", "mas", "bem como"...).
 */
import { lerNumeroBR } from "../../util/numero.ts";
import { achados, clausulaCondicional, negado, ressalvado, type Achado, type Clausula } from "./apoio.ts";

// ---------------------------------------------------------------------------
// Partes de uma cláusula
// ---------------------------------------------------------------------------

/**
 * Conectivos que, dentro de uma cláusula, passam a falar de outra dívida ou de outro
 * responsável. "cabendo/ficando" ficam na parte seguinte ("..., cabendo ao arrematante...").
 */
const CONECTIVO =
  /,\s*(?:e|mas|porem|contudo|todavia|entretanto|enquanto(?:\s+que)?|ao passo que|ja|sendo que|bem como|assim como)\s+|\s+(?:mas|porem|contudo|todavia|entretanto|enquanto(?:\s+que)?|ao passo que|bem como|assim como)\s+|,\s*(?=(?:cabendo|ficando|devendo)\s)|\s+e\s+(?=(?:os|as|o|a)\s+(?:debitos?|dividas?|condominia\w*|encargos?|tributos?|despesas|cotas|taxas|iptu)\b)/g;

/** Uma cláusula partida nos conectivos; cada parte tem o formato de cláusula (mesmo texto). */
export function partesDaClausula(cl: Clausula): Clausula[] {
  const partes: Clausula[] = [];
  let inicio = 0;
  const fechar = (fim: number): void => {
    if (fim > inicio) partes.push({ texto: cl.texto, inicio: cl.inicio + inicio, fim: cl.inicio + fim, n: cl.n.slice(inicio, fim) });
  };
  for (const m of cl.n.matchAll(CONECTIVO)) {
    fechar(m.index);
    inicio = m.index + m[0].length;
  }
  fechar(cl.n.length);
  return partes.length > 0 ? partes : [cl];
}

/** O achado feito numa parte, com a cláusula inteira como contexto (para o trecho). */
function naClausula(a: Achado, cl: Clausula): Achado {
  return { ...a, clausula: cl, antes: cl.n.slice(0, a.inicio - cl.inicio), depois: cl.n.slice(a.fim - cl.inicio) };
}

/** A parte da cláusula que contém o achado. */
function parteDe(a: Achado): Clausula {
  return partesDaClausula(a.clausula).find((p) => p.inicio <= a.inicio && a.inicio < p.fim) ?? a.clausula;
}

// ---------------------------------------------------------------------------
// Quem paga
// ---------------------------------------------------------------------------

/** Arrematante e sinônimos, inclusive "arrematante(s)" e "do(s) arrematante(s)". */
export const ARREMATANTE = String.raw`(?:arrematante(?:\(s\)|s)?|adquirente(?:\(s\)|s)?|comprador(?:\(es\)|es|a|as)?|licitantes? vencedor(?:es|a)?)`;
const DE_QUEM = String.raw`d[oa](?:\(s\)|s)?\s+${ARREMATANTE}`;

/** "por conta do arrematante", "suportadas pelo adquirente", "caberá ao arrematante", "o arrematante arcará". */
export const RESPONSABILIDADE_DO_ARREMATANTE = new RegExp(
  [
    String.raw`(?:por conta|a cargo|responsabilidade(?:\s+(?:exclusiva|integral|inteira|unica|solidaria))?)\s+${DE_QUEM}`,
    String.raw`(?:suportad|assumid|arcad|pag|quitad|custead)[oa]s?(?:\s+integralmente)?\s+pel[oa]s?\s+${ARREMATANTE}`,
    String.raw`(?:cabera|caberao|cabe|cabendo|compete|competira|competindo)\s+ao\s+${ARREMATANTE}`,
    String.raw`\b(?:o|a|os|as)\s+${ARREMATANTE}\s+(?:arcara|arcarao|devera arcar|deverao arcar|assumira|assumirao|pagara|pagarao|respondera|responderao|sera responsavel|serao responsaveis|ficara responsavel|ficarao responsaveis)`,
  ].join("|"),
);

/** Dívida do imóvel (não custo da transferência: ITBI, registro e comissão ficam de fora). */
export const DIVIDA_DO_IMOVEL =
  /\b(?:debitos?|dividas?|condomin\w*|iptu|propter rem|tributos?\s+(?:atrasad|vencid|em aberto|anteriores|devidos|pendentes)\w*|(?:despesas|encargos|contribuicoes|taxas|cotas)\s+(?:em aberto|condominia\w*|atrasad\w*|vencid\w*|pendentes|em atraso|de condominio)|saldo (?:remanescente|devedor))/;

/** Encargos FUTUROS (depois da arrematação) não são dívida que passa. */
const ENCARGO_FUTURO =
  /\b(?:apos|a partir d[ao]?)\s+(?:a\s+)?(?:data\s+d[ao]\s+)?(?:efetivacao\s+d[ao]\s+)?(?:arrematacao|imissao|posse|entrega|assinatura|registro)|\bposteriores?\s+a\s+(?:arrematacao|data)|\bvincend\w*/;

/** Contrassinais: sub-rogação no preço, isenção, art. 130 do CTN, art. 908 §1º do CPC. */
export const CONTRASSINAL_DIVIDA = new RegExp(
  [
    String.raw`\bsub-?\s?r+og\w*`,
    String.raw`\bisent[oa]s?\b|\bisencao\b`,
    String.raw`\bdesembaracad[oa]s?\b`,
    String.raw`\blivres?\s+(?:e\s+desembaracad[oa]s?\s+)?de\s+(?:quaisquer\s+)?(?:onus|debitos|dividas)`,
    String.raw`\bart(?:igo)?\.?\s*130\b[^;]{0,60}\bctn\b|\bctn\b[^;]{0,30}\bart(?:igo)?\.?\s*130\b`,
    String.raw`\b908\s*,?\s*(?:§|par\w*)\s*(?:1|unico)`,
    String.raw`\bnao serao transferid\w*`,
    String.raw`\bnao acarretando obrigacao`,
    String.raw`\bmeramente informativ\w*`,
    String.raw`\b(?:aquisicao|arrematacao)\s+(?:sera\s+)?(?:considerada\s+)?(?:como\s+)?originaria`,
  ].join("|"),
);

const SOBRE_VEICULO = /\bveicul\w*|\bipva\b|orgaos? de transito|\bdetran\b/;
const DISTANCIA_MAXIMA = 160;
/** "livre de ônus" só é contrassinal de dívida quando fala da venda ("será vendido/entregue livre de ônus"). */
const CONTEXTO_DE_VENDA = /\b(?:arremat\w*|adquir\w*|aquisic\w*|entreg\w*|transmit\w*|transfer\w*|alienad[oa]s?|vendid[oa]s?|vend[ae]\w*|leiload[oa]s?)\b/;
/** "eventuais débitos" sem dizer de quê: texto genérico (lista de despesas), não dívida do imóvel. */
const DIVIDA_GENERICA = /^(?:debitos?|dividas?)$/;
const HESITACAO_ANTES = /\b(?:eventua(?:l|is)|eventualmente|porventura|possive(?:l|is))\s+(?:\w+\s+)?$/;
const DIVIDA_DO_IMOVEL_G = new RegExp(DIVIDA_DO_IMOVEL.source, "g");

export interface AnaliseDividaPassa {
  /** Cláusulas que põem dívida do imóvel na conta do arrematante (sem contrassinal na mesma parte da cláusula). */
  positivos: Achado[];
  /** Cláusulas com sub-rogação, isenção ou "não serão transferidos". */
  contrassinais: Achado[];
  /** O positivo é a regra-padrão da ficha da Caixa (limite de 10% da avaliação)? */
  caixaPadrao: boolean;
}

/**
 * Há dívida do imóvel perto do achado (dentro de `cl`)? "Eventuais débitos" sem objeto não
 * conta; "eventuais débitos de condomínio" conta (o objeto é específico).
 */
function dividaPerto(cl: Clausula, resp: Pick<Achado, "inicio" | "fim">): boolean {
  const ini = Math.max(0, resp.inicio - cl.inicio - DISTANCIA_MAXIMA);
  const fim = Math.min(cl.n.length, resp.fim - cl.inicio + DISTANCIA_MAXIMA);
  for (const m of cl.n.slice(ini, fim).matchAll(DIVIDA_DO_IMOVEL_G)) {
    const pos = ini + m.index;
    if (pos >= resp.inicio - cl.inicio && pos < resp.fim - cl.inicio) continue;
    if (!DIVIDA_GENERICA.test(m[0]) || !HESITACAO_ANTES.test(cl.n.slice(Math.max(0, pos - 30), pos))) return true;
  }
  return false;
}

function contrassinalDaParte(parte: Clausula): Achado | undefined {
  return achados([parte], CONTRASSINAL_DIVIDA).find((a) => !/^livre/.test(a.casado) || CONTEXTO_DE_VENDA.test(parte.n));
}

/**
 * Lê, cláusula a cláusula, quem paga as dívidas do imóvel. O contrassinal (sub-rogação,
 * isenção, art. 130 do CTN...) anula só a parte da cláusula em que está: "o IPTU sub-roga-se
 * no preço, e o condomínio é do arrematante" dá positivo (condomínio) e contrassinal (IPTU).
 * Na mesma parte, o contrassinal vence ("ônus por conta do arrematante, exceto os débitos de
 * IPTU, que se sub-rogam no preço").
 */
export function analisarDividaPassa(cls: readonly Clausula[]): AnaliseDividaPassa {
  const positivos: Achado[] = [];
  const contrassinais: Achado[] = [];
  let caixaPadrao = false;
  for (const cl of cls) {
    if (SOBRE_VEICULO.test(cl.n)) continue;
    const partes = partesDaClausula(cl);
    const contraPorParte = partes.map(contrassinalDaParte);
    const fala = (p: Clausula): boolean => DIVIDA_DO_IMOVEL.test(p.n) || /\bonus\b|\bencargos\b/.test(p.n);
    contraPorParte.forEach((contra, i) => {
      const parte = partes[i];
      // A parte do contrassinal pode não repetir a dívida ("..., e demais tributos, sub-rogam-se no preço").
      if (contra && parte && (fala(parte) || fala(cl))) contrassinais.push(naClausula(contra, cl));
    });
    const algumContra = contraPorParte.some(Boolean);
    for (const resp of achados([cl], RESPONSABILIDADE_DO_ARREMATANTE)) {
      const i = partes.findIndex((p) => p.inicio <= resp.inicio && resp.inicio < p.fim);
      const parte = partes[i] ?? cl;
      if (contraPorParte[i] || ENCARGO_FUTURO.test(parte.n)) continue;
      // Sem contrassinal na cláusula, a dívida pode estar em outra parte dela (comportamento antigo).
      if (!dividaPerto(parte, resp) && (algumContra || !dividaPerto(cl, resp))) continue;
      if (negado(resp)) {
        contrassinais.push(resp);
        break;
      }
      positivos.push(resp);
      if (/ate o limite de 10\s*%|a caixa (?:realizara|paga|pagara)|inferior a 10\s*%/.test(cl.n)) caixaPadrao = true;
      break;
    }
  }
  return { positivos, contrassinais, caixaPadrao };
}

// ---------------------------------------------------------------------------
// Dívidas declaradas (existem, com ou sem valor)
// ---------------------------------------------------------------------------

const VERBO_EXISTE = String.raw`(?:ha|existe|existem|consta|constam|possui|apresenta|apresentam|com|constando|existencia de|registra|registram)`;
// Só "débito/dívida/pendência": "cota condominial de R$ 500" é a mensalidade, não atraso.
const TIPO_DIVIDA = String.raw`(?:debitos?|dividas?|pendencias?(?: financeiras)?)`;
// Valor ou situação de atraso. "Até 2025" e "vencidos até a arrematação" sozinhos não declaram
// dívida (são o período de uma regra de edital: "Débitos de IPTU até 2025: consultar a Prefeitura").
const VALOR_OU_DATA = String.raw`(?:r\$\s*[\d.,]+|em aberto|em atraso|vencid\w* e nao pag\w*|nao pag\w*|inscri\w* (?:na|em) divida ativa)`;

export type TipoDivida = "condominio" | "iptu";

const OBJETO_DIVIDA: Readonly<Record<TipoDivida, string>> = {
  condominio: String.raw`(?:condominia(?:l|is)|de condominio|do condominio|condominio)`,
  iptu: String.raw`(?:de iptu|do iptu|iptu|de imposto predial|tributari[oa]s?|fiscais|municipais|de impostos?)`,
};

function positivosDe(tipo: TipoDivida): RegExp {
  const objeto = OBJETO_DIVIDA[tipo];
  const lista = [
    String.raw`\b${VERBO_EXISTE}\s+${TIPO_DIVIDA}\s+(?:em aberto\s+|em atraso\s+)?${objeto}`,
    String.raw`\b${TIPO_DIVIDA}\s+${objeto}\b[^;]{0,80}?${VALOR_OU_DATA}`,
  ];
  if (tipo === "condominio") {
    lista.push(
      String.raw`\b(?:condominio|cotas? condominia\w*|taxas? condominia\w*)\s+(?:em atraso|em aberto|atrasad\w*|inadimpl\w*|vencidas e nao pagas|nao pag\w*)`,
      String.raw`\bdebito condominial\b`,
      String.raw`\b(?:o\s+)?(?:condominio|sindic[oa]|administradora)\s+(?:informou|informa|apontou|aponta|declarou|declara|noticiou)\s+(?:\w+\s+){0,2}?${TIPO_DIVIDA}\b`,
    );
  } else {
    lista.push(
      String.raw`\biptu\s+(?:em atraso|em aberto|atrasad\w*|vencid\w*|nao pag\w*)`,
      String.raw`\binscri\w*\s+(?:na|em)\s+divida ativa\b`,
    );
  }
  return new RegExp(lista.join("|"));
}

function negativosDe(tipo: TipoDivida): RegExp {
  const objeto = OBJETO_DIVIDA[tipo];
  const lista = [
    String.raw`\b(?:nao|inexist\w*)\s+(?:ha|existem|existe|constam|consta|possui|foram encontrad\w*)?\s*${TIPO_DIVIDA}\s+${objeto}`,
    String.raw`\bnada consta\b[^;]{0,40}${objeto}`,
  ];
  if (tipo === "condominio") {
    lista.push(String.raw`\bem dia com (?:o pagamento d[ae]s? )?(?:as )?(?:cotas|condominio|taxas|contribuicoes)`, String.raw`\bcondominio\s+(?:quitado|em dia)\b`);
  } else {
    lista.push(
      String.raw`\bcertidao negativa de debitos (?:tributarios|municipais|de iptu|imobiliarios)`,
      String.raw`\biptu\s+(?:quitado|em dia|pago)\b`,
    );
  }
  return new RegExp(lista.join("|"));
}

const POSITIVOS: Readonly<Record<TipoDivida, RegExp>> = { condominio: positivosDe("condominio"), iptu: positivosDe("iptu") };
/**
 * Frases que PRESSUPÕEM a dívida mesmo dentro de uma condição ("caso o valor não seja
 * suficiente para a quitação integral dos débitos condominiais..."): a ressalva é sobre o
 * valor, não sobre a existência da dívida. Confiança baixa.
 */
const PRESSUPOSTOS: Readonly<Record<TipoDivida, RegExp | null>> = {
  condominio:
    /\bquitacao\s+(?:integral\s+)?d[oa]s?\s+debitos?\s+condominia\w*|\bexecucao\s+de\s+(?:cotas|despesas|debitos|taxas)\s+condominia\w*|\bacao\s+de\s+cobranca\s+(?:de\s+)?(?:cotas|despesas|debitos|taxas)\s+condominia\w*/,
  iptu: /\bexecucao\s+fiscal\s+(?:de|do)\s+iptu\b/,
};
const NEGATIVOS: Readonly<Record<TipoDivida, RegExp>> = { condominio: negativosDe("condominio"), iptu: negativosDe("iptu") };
/** Cláusula de isenção/sub-rogação genérica ("inscritos ou não na dívida ativa"): não declara dívida. */
const CLAUSULA_GENERICA_DIVIDA = /inscrit\w* ou nao|\bisent|\bsub-?\s?r+og|\bdesembaracad/;
/** ...a não ser que a frase declare a dívida: verbo de existência ("Há débitos...") ou valor em reais. */
const DECLARA_EXISTENCIA = new RegExp(String.raw`^(?:${VERBO_EXISTE}\s|o\s+condominio|condominio|sindic|administradora)`);

/**
 * Cláusula genérica de sub-rogação ou isenção que não declara dívida nenhuma. Olha só a parte
 * da cláusula do achado ("desembaraçado de débitos fiscais, mas o débito condominial de R$ 40
 * mil fica a cargo do arrematante" declara o condomínio). "Há débitos de IPTU de R$ 8 mil, que
 * se sub-rogam no preço" declara a dívida: IPTU em atraso sai "sim" e só "Dívida passa" sai "não".
 */
function clausulaGenerica(a: Achado): boolean {
  const parte = parteDe(a);
  return CLAUSULA_GENERICA_DIVIDA.test(parte.n) && !DECLARA_EXISTENCIA.test(a.casado) && !/\br\$\s*\d/.test(parte.n);
}

export interface DividaDeclarada {
  achado: Achado;
  /** Primeiro valor em R$ da cláusula, se houver. */
  valor: number | null;
  /** A dívida é pressuposta pela frase ("quitação dos débitos condominiais"), não declarada. */
  pressuposta: boolean;
}

/** Primeiro valor em reais depois do início do achado, na mesma cláusula. */
export function valorDaClausula(a: Achado): number | null {
  const resto = a.clausula.n.slice(a.inicio - a.clausula.inicio);
  const m = /r\$\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/.exec(resto);
  return m?.[1] ? lerNumeroBR(m[1], { decimal: "," }) : null;
}

export interface AnaliseDividas {
  positivos: DividaDeclarada[];
  negativos: Achado[];
}

/** Dívidas de condomínio ou de IPTU declaradas como existentes (ou declaradas inexistentes). */
export function dividasDeclaradas(cls: readonly Clausula[], tipo: TipoDivida): AnaliseDividas {
  const positivos: DividaDeclarada[] = [];
  const negativos: Achado[] = [];
  for (const a of achados(cls, NEGATIVOS[tipo])) if (!ressalvado(a)) negativos.push(a);
  for (const a of achados(cls, POSITIVOS[tipo])) {
    if (ressalvado(a) || negado(a)) continue;
    if (clausulaGenerica(a)) continue;
    if (negativos.some((n) => n.clausula === a.clausula)) continue;
    const valor = valorDaClausula(a);
    // "Débitos condominiais: R$ 0,00" diz que não há dívida.
    if (valor === 0) {
      negativos.push(a);
      continue;
    }
    positivos.push({ achado: a, valor, pressuposta: false });
  }
  const pressuposto = PRESSUPOSTOS[tipo];
  if (pressuposto) {
    for (const a of achados(cls, pressuposto)) {
      if (clausulaGenerica(a) || positivos.some((p) => p.achado.clausula === a.clausula)) continue;
      positivos.push({ achado: a, valor: null, pressuposta: true });
    }
  }
  return { positivos, negativos };
}

// ---------------------------------------------------------------------------
// Gravames declarados e art. 843
// ---------------------------------------------------------------------------

const GRAVAMES_DECLARADOS =
  /\b(?:ha|existe[m]?|consta[m]?|com|objeto de|possui)\s+(?:outras?\s+|diversas\s+)?(?:penhoras?|indisponibilidades?|bloqueios?|gravames?|hipotecas?|arrolamentos?)\b|\boutras?\s+penhoras?\b|\b(?:r|av)\.?\s*-?\s*\d{1,3}\b[^;.]{0,30}?\b(?:penhora|indisponibilidade|hipoteca)\b/;

/** O texto declara penhoras, indisponibilidades, hipotecas ou bloqueios sobre o imóvel? */
export function gravamesDeclarados(cls: readonly Clausula[]): Achado[] {
  return achados(cls, GRAVAMES_DECLARADOS).filter((a) => !ressalvado(a) && !negado(a));
}

/**
 * Venda do imóvel inteiro com reserva, em dinheiro, da cota do coproprietário ou da meação do
 * cônjuge que não é executado (art. 843 do CPC). Não é venda de cota-parte; e o coproprietário
 * tem preferência na arrematação em igualdade de condições (art. 843, §1º).
 */
export const VENDA_COM_RESERVA_DE_COTA =
  /\bart(?:igo)?\.?\s*843\b|\breserv\w*\s+(?:a\s+|da\s+)?(?:cota|quota)[- ]?parte|\bgarantia\s+da\s+(?:cota|quota)[- ]?parte|\b(?:reservad|resguardad|preservad)\w*\s+(?:a\s+)?meacao|\b(?:coproprietario|conjuge)\s+(?:nao executad\w*|alheio a execucao)/;

/**
 * Venda com reserva da cota (art. 843) afirmada sobre este imóvel; a regra condicional do modelo
 * ("Caso o bem penhorado seja indivisível, ... (art. 843 do CPC)") não conta.
 */
export function vendaComReservaDeCota(cls: readonly Clausula[]): Achado[] {
  return achados(cls, VENDA_COM_RESERVA_DE_COTA).filter((a) => !ressalvado(a) && !clausulaCondicional(a.clausula));
}
