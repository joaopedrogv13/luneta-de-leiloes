/**
 * Posse: ocupado, desocupado, ocupação não informada.
 *
 * Catálogo §4 (Ocupação), com as decisões:
 * - Campo estruturado da fonte (`ocupacao`) vale mais que texto (confiança alta).
 * - Texto: só frases que dizem algo DESTE imóvel ("imóvel ocupado", "ocupado pelo executado",
 *   "Ocupam o imóvel...", "Ocupação Atual: ..."). Frases-modelo de edital ("eventuais
 *   informações acerca de ocupação/invasão/desocupação", "caso o imóvel esteja ocupado") e
 *   "imissão na posse" (que está em todo edital judicial) não contam.
 * - Negação sobre a INFORMAÇÃO ou a GARANTIA ("não há informações se o imóvel está ocupado",
 *   "o leiloeiro não garante que o imóvel esteja desocupado") não é negação da ocupação: é
 *   ressalva, e a frase só confirma que a ocupação não foi informada.
 * - Benfeitoria não é ocupante: "terreno ocupado por edificação", "área ocupada pela construção".
 * - "Situação:" só conta com valor de ocupação explícito ("Situação: Desocupado"); "Situação:
 *   livre de ônus" e "Situação: vaga de garagem" não falam de posse.
 * - "Desocupação por conta do arrematante" e "atualmente servindo de depósito" são sinais
 *   fracos de ocupação: confiança baixa e revisão humana. Quando só há sinal fraco, a ocupação
 *   continua "não informada" (sim, com revisão): sinal fraco não é informação.
 * - Desocupado vindo de texto sempre vai para revisão (a situação muda; dicionário: H).
 * - Sem nenhum sinal: "Ocupação não informada" (confiança alta, no sentido de "a fonte não
 *   diz"), e ocupado/desocupado ficam "desconhecido". O CSV da Caixa nunca informa ocupação, e
 *   o "Situação: Desocupado" da ficha da Caixa está num comentário HTML, que a limpeza descarta.
 * - LGPD: estes trechos são onde ficam nomes de ocupantes; além da máscara de sempre, o motor
 *   aplica a máscara reforçada (`mascararNomesSoltos`) às tags de posse.
 */
import type { Confianca } from "../../tipos.ts";
import type { RegraRisco } from "../motor.ts";
import { achados, clausulasDe, desconhecido, deteccao, maisForte, negado, ressalvado, trechoDe, type Achado, type Clausula } from "./apoio.ts";

const OBJETO = String.raw`(?:imovel|bem|unidade|apartamento|casa|predio|sobrado|sala|loja|galpao|terreno|lote|residencia)`;
const VERBO = String.raw`(?:\s+(?:nao|encontra-se|se encontra|esta|estao|esteja|estejam|acha-se|se acha|permanece|continua|consta como|foi constatad[oa]|encontrava-se|atualmente))*`;
/** Negação dentro da frase achada ("o imóvel não está ocupado") ou logo antes dela. */
const NEGACAO_INTERNA = /\bnao\b/;

const OCUPADO_FORTE = new RegExp(
  [
    String.raw`\b${OBJETO}${VERBO}\s+(?:atualmente\s+)?ocupad[oa]s?\b`,
    String.raw`\bocupad[oa]s?\s+(?:pel[oa]s?|por)\s+`,
    String.raw`\b(?:ocupa|ocupam|reside|residem|mora|moram)\s+(?:n?[oa]\s+)?(?:imovel|bem|local|unidade|apartamento|casa)\b`,
    String.raw`\b${OBJETO}${VERBO}\s+(?:invadid[oa]|locad[oa]|alugad[oa]|arrendad[oa])\b`,
    String.raw`\bocupad[oa]s?\s+por\s+(?:invasores|terceiros|inquilin\w*|locatari\w*)`,
    // Sujeito oculto no começo da cláusula ("Encontra-se ocupado.") e rótulo ("Imóvel: ocupado").
    String.raw`(?:^|:\s*)(?:encontra-se|se encontra|esta|acha-se)\s+(?:atualmente\s+)?ocupad[oa]s?\b`,
    String.raw`\b(?:imovel|bem|obs|observacao|observacoes)\.?\s*:\s*ocupad[oa]s?\b`,
  ].join("|"),
);

/** "Ocupação:", "Ocupação Atual:", "Situação de ocupação:": rótulo próprio de posse. */
const ROTULO_OCUPACAO = /\b(?:ocupacao(?:\s+atual)?|situacao\s+(?:de|da)\s+ocupacao|situacao\s+possessoria)\s*:\s*/;
/** "Situação:" genérico: só vale com valor de ocupação explícito. */
const ROTULO_SITUACAO = /\bsituacao(?:\s+do\s+imovel)?\s*:\s*/;
const ROTULOS = new RegExp(`${ROTULO_OCUPACAO.source}|${ROTULO_SITUACAO.source}`);

const VALOR_DESOCUPADO =
  /^(?:o\s+|a\s+)?(?:imovel\s+|bem\s+)?(?:esta\s+|encontra-se\s+)?(?:desocupad|vazi[oa]\b|vag[oa]\b(?!\s+de\s+garagem)|livre\b(?!\s+(?:e\s+desembaracad\w*\s+)?de\s+(?:onus|gravames|debitos|dividas|quaisquer))|nao\s+ocupad|sem\s+ocupa(?:cao|ntes)|nenhum\s+ocupante|nao\s+ha\s+(?:ocupantes|moradores))/;
const VALOR_OCUPADO =
  /^(?:o\s+|a\s+|os\s+|as\s+)?(?:propri[oa]s?\s+)?(?:imovel\s+|bem\s+)?(?:esta\s+|encontra-se\s+)?(?:ocupad|executad|devedor|proprietari|terceir|inquilin|locatari|locad|alugad|ocupante|morador|familia|invasor|invadid|filh|parente|ex-|\[nome\]|conjuge|irma|espos|marido|companheir)/;
const VALOR_SEM_INFORMACAO = /^(?:nao\s+(?:informad|consta|ha\s+informac|verificad|identificad)|sem\s+informac|desconhecid|a\s+verificar|ignorad|indefinid|nao\s+se\s+sabe)/;
const VALOR_SITUACAO_DESOCUPADO = /^(?:o\s+)?(?:imovel\s+)?(?:esta\s+)?(?:desocupad|vazi[oa]\b|vag[oa]\b(?!\s+de\s+garagem))/;
const VALOR_SITUACAO_OCUPADO = /^(?:o\s+)?(?:imovel\s+)?(?:esta\s+)?ocupad/;

const OCUPADO_FRACO = new RegExp(
  [
    String.raw`\bdesocupacao\b[^;]{0,60}?(?:por conta|a cargo|responsabilidade)\s+d[oa]s?\s+(?:arrematante|adquirente|comprador)`,
    String.raw`\b(?:arrematante|adquirente|comprador)\s+(?:sera|ficara)\s+responsavel\s+pel[ao]s?\s+(?:providencias\s+de\s+)?desocupacao`,
    String.raw`\batualmente\s+(?:servindo|utilizad[oa]|sendo utilizad[oa]|em uso|funcionando|abrigando)\b`,
  ].join("|"),
);

const DESOCUPADO_FORTE = new RegExp(
  [
    String.raw`\b${OBJETO}${VERBO}\s+(?:atualmente\s+)?(?:desocupad[oa]s?|vazi[oa]s?|vag[oa]s?|livre(?:\s+e\s+desimpedid[oa])?\s+de\s+(?:pessoas|ocupantes|moradores))\b`,
    String.raw`(?:^|:\s*)(?:encontra-se|se encontra|esta|acha-se)\s+(?:atualmente\s+)?desocupad[oa]s?\b`,
    String.raw`\b(?:imovel|bem|obs|observacao|observacoes)\.?\s*:\s*(?:desocupad[oa]s?|vazi[oa])\b`,
  ].join("|"),
);
const DESOCUPADO_SOLTO = /\bdesocupad[oa]s?\b/;

/** Ocupação por benfeitoria, não por gente ("terreno ocupado por edificação", "área ocupada pela construção"). */
const OCUPADO_POR_COISA =
  /^(?:uma?\s+|as?\s+|os?\s+)?(?:construc\w*|edificac\w*|benfeitori\w*|predios?|casas?|galp(?:ao|oes)|barrac(?:ao|oes)|areas?|vegetac\w*|matas?|ruas?|vias?|plantac\w*|pastage\w*|lavouras?|culturas?|arvores?|sobrados?|muros?|piscinas?)\b/;
const SUJEITO_AREA = /\b(?:area|espaco|parte|faixa|superficie|porcao)\s*(?:construida\s*)?$/;
/** "imóvel ocupado" sem verbo no meio, e preposição antes ("aquisição do imóvel ocupado"). */
const ADJETIVO_GENERICO = new RegExp(String.raw`^${OBJETO}\s+ocupad[oa]s?$`);
const PREPOSICAO_ANTES = /\b(?:d[oa]s?|de|a[o]?s?|n[oa]s?|em|para|com|pel[oa]s?|sobre)\s+$/;

/** "vendidos ocupados ou desocupados", "ocupado/desocupado": frase-modelo, não informa nada. */
const OCUPACAO_INDIFERENTE = /\b(?:des)?ocupad[oa]s?\s*(?:ou|\/|e\/ou)\s*(?:des)?ocupad[oa]s?\b|\bocupacao\s*\/\s*(?:invasao\s*\/\s*)?desocupacao\b|\bocupad[oa]s?\s+ou\s+nao\b/;
/** Ressalva dentro do próprio achado ("a desocupação, se ocupado, correrá por conta..."). */
// "(?<!-)": o "se" de "encontra-se ocupado" é pronome, não condição.
const RESSALVA_INTERNA = /(?<!-)\bse\s+(?:estiver\s+|houver\s+)?ocupad|\bcaso\b|\beventua|(?<!-)\bse houver\b|\bhavendo\b/;

/**
 * Negação da informação ou da garantia, logo antes da frase de ocupação: "não há informações
 * se o imóvel está ocupado", "o leiloeiro não garante que o imóvel esteja desocupado", "não
 * foi possível verificar se...". A frase vira ressalva (não diz nada sobre a ocupação).
 */
const RESSALVA_INFORMACAO = new RegExp(
  String.raw`\b(?:nao\s+(?:ha|existem?|constam?|temos|possui|dispoe(?:\s+de)?|se\s+tem|foram\s+obtid\w*)\s+(?:\w+\s+){0,3}?(?:informac\w*|noticias?|dados)|sem\s+(?:\w+\s+){0,2}?informac\w*|nao\s+(?:se\s+)?sabe(?:-se)?|desconhece(?:-se|m)?|nao\s+(?:se\s+)?(?:garant\w*|responsabiliz\w*|assegur\w*|afirm\w*|confirm\w*|inform\w*|soube\w*)|nao\s+(?:e|era|sendo|foi|foram)\s+possivel\s+(?:\w+\s+){0,2}?(?:informar|afirmar|precisar|saber|garantir|confirmar|verificar|constatar|apurar|identificar)|sem\s+garantia)\b[^.;]{0,60}?\b(?:se|que|quanto|sobre|acerca)\b[^.;]{0,30}$`,
);
/** O texto diz que não há informação de ocupação ("Não consta informação sobre a ocupação"). */
const SEM_INFORMACAO_DE_POSSE =
  /\b(?:nao\s+(?:ha|existem?|constam?|temos|foram\s+obtid\w*)\s+(?:\w+\s+){0,3}?informac\w*|sem\s+(?:\w+\s+){0,2}?informac\w*|nao\s+(?:se\s+)?sabe(?:-se)?|desconhece-se|nao\s+(?:foi|e)\s+possivel\s+(?:verificar|constatar|apurar|saber|informar))\b[^.;]{0,50}?\b(?:ocupac\w*|ocupad\w*|desocupad\w*|posse|ocupantes?)\b/;

type Lado = "ocupado" | "desocupado";

interface Sinal {
  lado: Lado;
  confianca: Confianca;
  /** Sinal claro sobre este imóvel (sem ele, a tag vai para revisão e a ocupação segue "não informada"). */
  forte: boolean;
  achado: Achado;
}

interface LeituraPosse {
  sinais: Sinal[];
  /** Frase que diz que a ocupação não é conhecida. */
  semInformacao: Achado | undefined;
}

/** "Terreno ocupado por edificação": o que vem depois de "ocupado por/pelo" é uma benfeitoria. */
function ocupadoPorCoisa(a: Achado): boolean {
  const resto = a.casado + a.depois;
  const m = /\bocupad[oa]s?\s+(?:pel[oa]s?|por)\s+/.exec(resto);
  return m !== null && OCUPADO_POR_COISA.test(resto.slice(m.index + m[0].length));
}

function lerPosse(cls: readonly Clausula[]): LeituraPosse {
  const sinais: Sinal[] = [];
  let semInformacao = achados(cls, SEM_INFORMACAO_DE_POSSE).find((a) => !ressalvado(a));
  const valido = (a: Achado): boolean =>
    !ressalvado(a) &&
    !OCUPACAO_INDIFERENTE.test(a.clausula.n) &&
    !RESSALVA_INTERNA.test(a.casado) &&
    !RESSALVA_INFORMACAO.test(a.antes.slice(-160));
  const sinal = (lado: Lado, confianca: Confianca, forte: boolean, achado: Achado): void => {
    sinais.push({ lado, confianca, forte, achado });
  };

  for (const a of achados(cls, OCUPADO_FORTE)) {
    if (!valido(a) || ocupadoPorCoisa(a)) continue;
    if (SUJEITO_AREA.test(a.antes) && /^ocupad/.test(a.casado)) continue;
    // "para a aquisição do imóvel ocupado" (edital da Caixa): adjetivo depois de preposição, sem
    // verbo nem ocupante, é regra geral do edital, não fato deste imóvel.
    if (ADJETIVO_GENERICO.test(a.casado) && PREPOSICAO_ANTES.test(a.antes) && !/^\s*(?:pel[oa]s?|por)\s/.test(a.depois)) continue;
    // "O imóvel não está ocupado" diz algo deste imóvel: sinal de desocupado (confiança baixa).
    if (negado(a) || NEGACAO_INTERNA.test(a.casado)) sinal("desocupado", "baixa", true, a);
    else sinal("ocupado", "media", true, a);
  }
  for (const a of achados(cls, ROTULOS)) {
    if (!valido(a)) continue;
    const valor = a.depois.slice(0, 60);
    if (ROTULO_OCUPACAO.test(a.casado)) {
      if (VALOR_SEM_INFORMACAO.test(valor)) semInformacao ??= a;
      else if (VALOR_DESOCUPADO.test(valor)) sinal("desocupado", "media", true, a);
      else if (VALOR_OCUPADO.test(valor)) sinal("ocupado", "media", true, a);
    } else if (VALOR_SITUACAO_DESOCUPADO.test(valor)) sinal("desocupado", "media", true, a);
    else if (VALOR_SITUACAO_OCUPADO.test(valor)) sinal("ocupado", "media", true, a);
  }
  for (const a of achados(cls, OCUPADO_FRACO)) {
    if (valido(a)) sinal("ocupado", "baixa", false, a);
  }
  for (const a of achados(cls, DESOCUPADO_FORTE)) {
    if (!valido(a)) continue;
    if (negado(a) || NEGACAO_INTERNA.test(a.casado)) sinal("ocupado", "baixa", true, a);
    else sinal("desocupado", "media", true, a);
  }
  for (const a of achados(cls, DESOCUPADO_SOLTO)) {
    if (!valido(a)) continue;
    if (sinais.some((s) => s.achado.texto === a.texto && s.achado.inicio <= a.inicio && s.achado.fim >= a.fim)) continue;
    if (ROTULOS.test(a.antes.slice(-30))) continue;
    sinal(negado(a) ? "ocupado" : "desocupado", "baixa", false, a);
  }
  return { sinais, semInformacao };
}

export const regraOcupacao: RegraRisco = {
  id: "posse/ocupacao",
  descricao: "Ocupação pelo campo estruturado da fonte ou por frases do edital sobre este imóvel; sem sinal (ou só com sinal fraco), 'Ocupação não informada'.",
  tags: ["ocupado", "desocupado", "ocupacao-nao-informada"],
  avaliar({ imovel, textos }) {
    const { sinais, semInformacao } = lerPosse(clausulasDe(textos));
    const melhor = (lado: Lado): Sinal | undefined => {
      const lista = sinais.filter((s) => s.lado === lado);
      return lista.find((s) => s.forte) ?? maisForte(lista);
    };
    const oc = melhor("ocupado");
    const de = melhor("desocupado");

    if (imovel.ocupacao === "ocupado" || imovel.ocupacao === "desocupado") {
      const lado = imovel.ocupacao;
      const outro: Lado = lado === "ocupado" ? "desocupado" : "ocupado";
      const contra = lado === "ocupado" ? de : oc;
      const trecho = `Ocupação informada pela fonte em campo próprio: ${lado}.`;
      return [
        deteccao(lado, "sim", "alta", "campo:ocupacao", trecho, Boolean(contra)),
        contra
          ? deteccao(outro, "sim", "baixa", contra.achado.texto.origem, trechoDe(contra.achado), true)
          : deteccao(outro, "nao", "alta", "campo:ocupacao", trecho),
        deteccao("ocupacao-nao-informada", "nao", "alta", "campo:ocupacao", trecho),
      ];
    }

    /** Só sinal fraco: a ocupação continua não informada (com revisão, por causa da pista). */
    const naoInformadaComPista = (s: Sinal) =>
      deteccao(
        "ocupacao-nao-informada",
        "sim",
        "media",
        s.achado.texto.origem,
        `Só há sinal fraco de ${s.lado === "ocupado" ? "ocupação" : "desocupação"} no texto: ${trechoDe(s.achado)}`,
        true,
      );

    if (oc && de) {
      const algumForte = oc.forte || de.forte;
      return [
        deteccao("ocupado", "sim", oc.confianca, oc.achado.texto.origem, trechoDe(oc.achado), true),
        deteccao("desocupado", "sim", de.confianca, de.achado.texto.origem, trechoDe(de.achado), true),
        algumForte
          ? deteccao("ocupacao-nao-informada", "nao", "media", oc.achado.texto.origem, trechoDe(oc.forte ? oc.achado : de.achado))
          : naoInformadaComPista(oc),
      ];
    }
    if (oc) {
      const trecho = trechoDe(oc.achado);
      if (!oc.forte) {
        return [
          deteccao("ocupado", "sim", "baixa", oc.achado.texto.origem, trecho, true),
          desconhecido("desocupado", "O texto só traz sinal fraco de ocupação.", oc.achado.texto.origem),
          naoInformadaComPista(oc),
        ];
      }
      return [
        deteccao("ocupado", "sim", oc.confianca, oc.achado.texto.origem, trecho),
        deteccao("desocupado", "nao", oc.confianca, oc.achado.texto.origem, trecho),
        deteccao("ocupacao-nao-informada", "nao", oc.confianca, oc.achado.texto.origem, trecho),
      ];
    }
    if (de) {
      const trecho = trechoDe(de.achado);
      if (!de.forte) {
        return [
          deteccao("desocupado", "sim", "baixa", de.achado.texto.origem, trecho, true),
          desconhecido("ocupado", "O texto só traz sinal fraco de desocupação.", de.achado.texto.origem),
          naoInformadaComPista(de),
        ];
      }
      return [
        deteccao("desocupado", "sim", de.confianca, de.achado.texto.origem, trecho, true),
        deteccao("ocupado", "nao", "baixa", de.achado.texto.origem, trecho, true),
        deteccao("ocupacao-nao-informada", "nao", de.confianca, de.achado.texto.origem, trecho),
      ];
    }
    const motivo = "Sem informação de ocupação na fonte.";
    return [
      semInformacao
        ? deteccao("ocupacao-nao-informada", "sim", "alta", semInformacao.texto.origem, trechoDe(semInformacao))
        : deteccao("ocupacao-nao-informada", "sim", "alta", "ausencia", "A fonte não informa se o imóvel está ocupado."),
      desconhecido("ocupado", motivo),
      desconhecido("desocupado", motivo),
    ];
  },
};

export const REGRAS_POSSE: readonly RegraRisco[] = [regraOcupacao];
