/**
 * Propriedade: imóvel inteiro, cota-parte, só direitos sobre o imóvel.
 *
 * - Só direitos: título que começa com "Direitos" (alta); no texto, "direitos sobre o
 *   apartamento", "direitos aquisitivos/possessórios/de promitente comprador" (média, revisão);
 *   domínio útil, terreno de marinha, aforamento, concessão de uso (média, revisão);
 *   nua-propriedade (baixa, revisão: quem arremata não leva o uso enquanto houver usufruto).
 *   A frase do CTN ("fato gerador seja a propriedade, o domínio útil ou a posse"), as listas de
 *   intimação ("titular de usufruto, enfiteuse...") e os direitos de outra pessoa ("o
 *   arrematante exercerá todos os direitos sobre o imóvel", "o fiduciante perdeu seus direitos")
 *   não contam.
 * - Cota-parte: percentual ou fração ideal DO IMÓVEL ("50% do imóvel", "fração ideal de 50%
 *   do bem"), "metade ideal", "parte ideal", "cota-parte" (média, revisão). A fração ideal do
 *   terreno na descrição de uma unidade em condomínio ("cabendo-lhe a fração ideal de 2,57% no
 *   terreno", "correspondendo-lhe a fração ideal de 2,0833% do terreno", "participação de 1,25%
 *   do terreno e coisas comuns") não é cota-parte. Venda com reserva da cota do coproprietário
 *   (art. 843 do CPC) vende o imóvel inteiro: não é cota-parte.
 * - Imóvel inteiro: "não" quando há sinal de cota ou de só direitos; "sim" quando o texto diz
 *   (100% do imóvel, totalidade) ou quando é venda extrajudicial de banco (o banco vende
 *   imóvel próprio), confiança média; no judicial, a ausência de sinal num texto razoável vale
 *   "sim" com confiança baixa e revisão (o dicionário pede "padrão quando não há sinal").
 */
import type { Confianca } from "../../tipos.ts";
import type { DeteccaoRegra, RegraRisco } from "../motor.ts";
import {
  achados,
  clausulaDeIntimacao,
  clausulasDe,
  desconhecido,
  deteccao,
  maisForte,
  negado,
  ressalvado,
  tamanhoDoTexto,
  trechoDe,
  type Achado,
} from "./apoio.ts";
import { CONFIG_RISCOS, type ConfigRiscos } from "./config.ts";
import { VENDA_COM_RESERVA_DE_COTA, vendaComReservaDeCota } from "./sinais.ts";

const BEM = String.raw`(?:imovel|bem|apartamento|casa|predio|unidade(?: autonoma)?|lote|terreno|sala|loja|propriedade)`;

const DIREITOS_TEXTO = new RegExp(
  [
    String.raw`\bdireitos?\s+(?:e\s+acoes|aquisitivos?|possessorios?|hereditarios|de\s+(?:compromissari[oa]|promissari[oa]|promitente|cessionari[oa])\s+comprador\w*|decorrentes\s+d[eoa]s?\s+(?:contrato|compromisso|instrumento|escritura|financiamento))`,
    String.raw`\bdireitos?\s+(?:que\s+(?:o|a|os|as)\s+(?:executad[oa]s?|devedor\w*)\s+(?:possui|possuem|detem|tem)\s+|d[oa]s?\s+(?:executad[oa]s?|devedor\w*)\s+)?sobre\s+(?:o\s+|a\s+)?${BEM}\b`,
    String.raw`\bconcessao\s+de\s+(?:direito\s+real\s+de\s+)?uso\b`,
  ].join("|"),
);
/**
 * Os direitos de outra pessoa, não o objeto da venda: "o arrematante exercerá todos os
 * direitos sobre o imóvel", "o devedor fiduciante perdeu seus direitos sobre o imóvel".
 */
const DIREITOS_DE_OUTRO =
  /\b(?:arrematantes?|adquirentes?|compradore?s?|licitantes?|fiduciantes?|fiduciari[oa]s?|credor\w*|perde\w*|perdeu|seus|suas|todos os|todas as|exerce\w*|transfer\w*|transmit\w*|imitid\w*|sub-?rog\w*|investid\w*|plenos?)\s+(?:\w+\s+){0,3}$/;
/** Terreno ou solo como "bem" de uma unidade em condomínio ("fração ideal de 2,0833% do terreno"). */
const BEM_TERRENO = /\b(?:terreno|solo)$/;
const UNIDADE_EM_CONDOMINIO =
  /\b(?:coisas comuns|areas? comu(?:m|ns)|participacao|correspondendo-lhe|cabendo-lhe|vinculad[oa]s?|apartamento|apto|unidade autonoma|sala|conjunto|vagas? de garagem|box|pavimento|andar|edificio|bloco|torre)\b/;
const TIPOS_UNIDADE: ReadonlySet<string> = new Set(["apartamento", "vaga"]);
const DOMINIO_UTIL = /\b(?:dominio util|terrenos? de marinha|acrescidos? de marinha|aforamento|aforad[oa]|enfiteuse|enfiteutic\w*|foreiro)\b/;
const NUA_PROPRIEDADE = /\bnua[- ]?propriedade\b/;
const BOILERPLATE = /fato gerador|dominio util ou a posse|\bctn\b/;

const PERCENTUAL_DO_BEM = new RegExp(
  String.raw`\b(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:\([^)]{0,40}\)\s*)?(?:d[oa]s?|sobre\s+o|sobre\s+a|da\s+totalidade\s+d[oa])\s+${BEM}\b`,
);
const FRACAO_DO_BEM = new RegExp(
  [
    String.raw`\b(?:fracao|parte|cota|quota)\s+ideal\s+(?:de\s+|correspondente\s+a\s+)?(?:\d{1,3}(?:[.,]\d+)?\s*%|\d\/\d|metade)\s*(?:\([^)]{0,40}\)\s*)?(?:d[oa]s?|sobre\s+o)\s+${BEM}\b`,
    String.raw`\b(?:metade|\d\/\d)\s+(?:ideal\s+)?d[oa]s?\s+${BEM}\b`,
    String.raw`\bparte ideal\b`,
    String.raw`\b(?:cota|quota)[- ]?partes?\b`,
    String.raw`\b(?:a|da)\s+meacao\s+(?:d[oa]s?\s+)?(?:executad|devedor)`,
  ].join("|"),
);
const FRACAO_IDEAL_SOLTA = /\bfracao ideal\b/;
/** Fração com número: "fração de 50%", "fração ideal 1/12", "parte ideal correspondente a 1/3". */
const FRACAO_NUMERICA = /\b(?:fracao|parte|cota|quota)(?:\s+ideal)?\s+(?:de\s+|correspondente\s+a\s+|equivalente\s+a\s+)?(\d{1,3}(?:[.,]\d+)?\s*%|\d{1,2}\/\d{1,3})/;
/**
 * No título (do lote ou do leilão) não há descrição de apartamento: "Direitos - Apartamento",
 * "Direitos sobre casa", "(Direitos por Alienação/Hipoteca)", "Fração de 50% - Barracão",
 * "Fração ideal 1/12 - Casa", "Parte ideal de terreno com 300m²".
 */
const TITULO_DIREITOS = /(?:^|[-–|(]\s*)direitos?\b(?!\s+(?:e\s+deveres|reservados|autorais|humanos))/;
const TITULO_FRACAO = /\bfrac(?:ao|oes)\b|\b(?:parte|cota|quota)\s+ideal\b|\b(?:cota|quota)[- ]?parte\b|\b\d{1,2}(?:[.,]\d+)?\s*%\s*(?:d[oa]s?\s+)?(?:imovel|casa|apartamento|terreno|predio|bem)\b/;
const ORIGENS_TITULO = new Set(["titulo", "titulo_leilao"]);
/** "fração ideal de 2,57% no terreno", "fração ideal de terreno", "no todo do terreno". */
const FRACAO_NO_TERRENO = /^[^;]{0,60}?\b(?:n[oa]|d[oa]|de|sobre o)\s+(?:todo\s+do\s+)?(?:terreno|solo|coisas comuns|area comum)/;
const INTEIRO_EXPLICITO = new RegExp(
  [
    String.raw`\b(?:100\s*%|totalidade|integralidade)\s+(?:\([^)]{0,30}\)\s*)?d[oa]\s+${BEM}\b`,
    String.raw`\bimovel\s+(?:em\s+sua\s+)?(?:totalidade|integralidade)\b`,
    String.raw`\bimovel inteiro\b`,
  ].join("|"),
);

interface Sinal {
  confianca: Confianca;
  origem: string;
  trecho: string;
  revisar: boolean;
}

function sinal(a: Achado, confianca: Confianca, revisar: boolean): Sinal {
  return { confianca, origem: a.texto.origem, trecho: trechoDe(a), revisar };
}

function generico(a: Achado): boolean {
  return ressalvado(a) || negado(a) || clausulaDeIntimacao(a.clausula) || BOILERPLATE.test(a.clausula.n);
}

/** "x% do terreno" na descrição de uma unidade em condomínio é a fração ideal, não cota-parte. */
function fracaoDoTerrenoDaUnidade(a: Achado, tipo: string): boolean {
  return BEM_TERRENO.test(a.casado) && (TIPOS_UNIDADE.has(tipo) || UNIDADE_EM_CONDOMINIO.test(a.clausula.n));
}

export function criarRegraObjeto(config: ConfigRiscos = CONFIG_RISCOS): RegraRisco {
  return {
    id: "propriedade/objeto",
    descricao: "O que está à venda: imóvel inteiro, cota-parte (percentual do imóvel) ou só direitos (título 'Direitos', domínio útil, nua-propriedade).",
    tags: ["imovel-inteiro", "cota-parte", "so-direitos"],
    avaliar({ imovel, textos }) {
      const titulos = textos.filter((t) => ORIGENS_TITULO.has(t.origem));
      const corpo = textos.filter((t) => !ORIGENS_TITULO.has(t.origem));
      const cls = clausulasDe(corpo);
      const reserva843 = vendaComReservaDeCota(cls)[0];

      // Só direitos.
      const direitos: Sinal[] = [];
      const tituloDireitos = titulos.find((t) => TITULO_DIREITOS.test(t.normalizado));
      if (tituloDireitos) direitos.push({ confianca: "alta", origem: tituloDireitos.origem, trecho: tituloDireitos.original, revisar: false });
      // No texto, sempre com revisão: a frase pode falar dos direitos de outra pessoa.
      for (const a of achados(cls, DIREITOS_TEXTO)) if (!generico(a) && !DIREITOS_DE_OUTRO.test(a.antes)) direitos.push(sinal(a, "media", true));
      for (const a of achados(cls, DOMINIO_UTIL)) if (!generico(a)) direitos.push(sinal(a, "media", true));
      for (const a of achados(cls, NUA_PROPRIEDADE)) if (!generico(a)) direitos.push(sinal(a, "baixa", true));

      // Cota-parte.
      const cotas: Sinal[] = [];
      const tituloFracao = titulos.find((t) => TITULO_FRACAO.test(t.normalizado));
      if (tituloFracao) cotas.push({ confianca: "media", origem: tituloFracao.origem, trecho: tituloFracao.original, revisar: true });
      for (const a of achados(cls, PERCENTUAL_DO_BEM)) {
        const pct = Number((a.grupos[1] ?? "").replace(",", "."));
        if (generico(a) || !(pct > 0 && pct < 100) || fracaoDoTerrenoDaUnidade(a, imovel.tipo)) continue;
        cotas.push(sinal(a, "media", true));
      }
      for (const a of achados(cls, FRACAO_NUMERICA)) {
        const bruto = a.grupos[1] ?? "";
        const pct = bruto.includes("%") ? Number(bruto.replace("%", "").replace(",", ".")) : 1;
        if (generico(a) || !(pct > 0 && pct < 100) || FRACAO_NO_TERRENO.test(a.depois) || VENDA_COM_RESERVA_DE_COTA.test(a.clausula.n)) continue;
        cotas.push(sinal(a, "media", true));
      }
      for (const a of achados(cls, FRACAO_DO_BEM)) {
        if (generico(a) || VENDA_COM_RESERVA_DE_COTA.test(a.clausula.n) || fracaoDoTerrenoDaUnidade(a, imovel.tipo)) continue;
        if (/^parte ideal/.test(a.casado) && FRACAO_NO_TERRENO.test(a.depois)) continue;
        cotas.push(sinal(a, "media", true));
      }
      for (const a of achados(cls, FRACAO_IDEAL_SOLTA)) {
        if (generico(a) || FRACAO_NO_TERRENO.test(a.depois) || VENDA_COM_RESERVA_DE_COTA.test(a.clausula.n)) continue;
        if (cotas.some((c) => c.trecho === trechoDe(a))) continue;
        cotas.push(sinal(a, "baixa", true));
      }

      const inteiroExplicito = achados(cls, INTEIRO_EXPLICITO).find((a) => !generico(a) && !/nua[- ]?propriedade/.test(a.depois.slice(0, 20)));
      const direito = direitos.find((d) => d.confianca === "alta") ?? maisForte(direitos);
      const cota = maisForte(cotas);
      const bancoVendeProprio = imovel.judicial === false;
      const saida: DeteccaoRegra[] = [];

      // so-direitos
      if (direito) saida.push(deteccao("so-direitos", "sim", direito.confianca, direito.origem, direito.trecho, direito.revisar));
      else if (inteiroExplicito) saida.push(deteccao("so-direitos", "nao", "media", inteiroExplicito.texto.origem, trechoDe(inteiroExplicito)));
      else if (bancoVendeProprio) saida.push(deteccao("so-direitos", "nao", "media", "campo:judicial", "Venda extrajudicial: o vendedor é dono do imóvel."));
      else saida.push(desconhecido("so-direitos", "A fonte não indica venda só de direitos."));

      // cota-parte
      if (cota) saida.push(deteccao("cota-parte", "sim", cota.confianca, cota.origem, cota.trecho, cota.revisar));
      else if (reserva843) {
        saida.push(
          deteccao(
            "cota-parte",
            "nao",
            "baixa",
            reserva843.texto.origem,
            `${trechoDe(reserva843)} (Art. 843 do CPC: vende-se o imóvel inteiro e a cota do coproprietário é paga em dinheiro.)`,
            true,
          ),
        );
      } else if (inteiroExplicito) saida.push(deteccao("cota-parte", "nao", "media", inteiroExplicito.texto.origem, trechoDe(inteiroExplicito)));
      else if (bancoVendeProprio) saida.push(deteccao("cota-parte", "nao", "media", "campo:judicial", "Venda extrajudicial: o vendedor é dono do imóvel inteiro."));
      else saida.push(desconhecido("cota-parte", "A fonte não indica venda de fração do imóvel."));

      // imovel-inteiro
      const contrario = cota ?? direito;
      if (contrario) {
        saida.push(deteccao("imovel-inteiro", "nao", contrario.confianca, contrario.origem, contrario.trecho, contrario.revisar));
      } else if (inteiroExplicito) {
        saida.push(deteccao("imovel-inteiro", "sim", "media", inteiroExplicito.texto.origem, trechoDe(inteiroExplicito)));
      } else if (reserva843) {
        saida.push(
          deteccao(
            "imovel-inteiro",
            "sim",
            "baixa",
            reserva843.texto.origem,
            `${trechoDe(reserva843)} (Art. 843 do CPC: vende-se o imóvel inteiro.)`,
            true,
          ),
        );
      } else if (bancoVendeProprio) {
        saida.push(deteccao("imovel-inteiro", "sim", "media", "campo:judicial", "Venda extrajudicial de imóvel do próprio vendedor, sem sinal de fração ou de direitos."));
      } else if (tamanhoDoTexto(textos) >= config.textoMinimoParaAusencia) {
        saida.push(deteccao("imovel-inteiro", "sim", "baixa", "ausencia", "O texto não traz sinal de fração nem de venda só de direitos.", true));
      } else {
        saida.push(desconhecido("imovel-inteiro", "Texto curto demais para saber se a venda é do imóvel inteiro."));
      }
      return saida;
    },
  };
}

export const REGRAS_PROPRIEDADE: readonly RegraRisco[] = [criarRegraObjeto()];
