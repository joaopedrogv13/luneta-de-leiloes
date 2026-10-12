/**
 * Posse: ocupado, desocupado, ocupação não informada.
 *
 * Catálogo §4 (Ocupação), com as decisões:
 * - Campo estruturado da fonte (`ocupacao`) vale mais que texto (confiança alta).
 * - Texto: só frases que dizem algo DESTE imóvel ("imóvel ocupado", "ocupado pelo executado",
 *   "Ocupam o imóvel...", "Ocupação Atual: ..."). Frases-modelo de edital ("eventuais
 *   informações acerca de ocupação/invasão/desocupação", "caso o imóvel esteja ocupado") e
 *   "imissão na posse" (que está em todo edital judicial) não contam.
 * - "Desocupação por conta do arrematante" e "atualmente servindo de depósito" são sinais
 *   fracos de ocupação: confiança baixa e revisão humana.
 * - Desocupado vindo de texto sempre vai para revisão (a situação muda; dicionário: H).
 * - Sem nenhum sinal: "Ocupação não informada" (confiança alta, no sentido de "a fonte não
 *   diz"), e ocupado/desocupado ficam "desconhecido". O CSV da Caixa nunca informa ocupação, e
 *   o "Situação: Desocupado" da ficha da Caixa está num comentário HTML, que a limpeza descarta.
 */
import type { Confianca } from "../../tipos.ts";
import type { RegraRisco } from "../motor.ts";
import { achados, clausulasDe, desconhecido, deteccao, maisForte, negado, ressalvado, trechoDe, type Achado, type Clausula } from "./apoio.ts";

const OBJETO = String.raw`(?:imovel|bem|unidade|apartamento|casa|predio|sobrado|sala|loja|galpao|terreno|lote|residencia)`;
const VERBO = String.raw`(?:\s+(?:nao|encontra-se|se encontra|esta|estao|acha-se|se acha|permanece|continua|consta como|foi constatad[oa]|encontrava-se|atualmente))*`;
/** Negação dentro da frase achada ("o imóvel não está ocupado") ou logo antes dela. */
const NEGACAO_INTERNA = /\bnao\b/;

const OCUPADO_FORTE = new RegExp(
  [
    String.raw`\b${OBJETO}${VERBO}\s+(?:atualmente\s+)?ocupad[oa]s?\b`,
    String.raw`\bocupad[oa]s?\s+(?:pel[oa]s?|por)\s+`,
    String.raw`\b(?:ocupa|ocupam|reside|residem|mora|moram)\s+(?:n?[oa]\s+)?(?:imovel|bem|local|unidade|apartamento|casa)\b`,
    String.raw`\b${OBJETO}${VERBO}\s+(?:invadid[oa]|locad[oa]|alugad[oa]|arrendad[oa])\b`,
    String.raw`\bocupad[oa]s?\s+por\s+(?:invasores|terceiros|inquilin\w*|locatari\w*)`,
  ].join("|"),
);

const OCUPACAO_ROTULADA = /\b(?:ocupacao(?:\s+atual)?|situacao(?:\s+(?:de\s+ocupacao|do\s+imovel|da\s+ocupacao))?)\s*:\s*/;

const OCUPADO_FRACO = new RegExp(
  [
    String.raw`\bdesocupacao\b[^;]{0,60}?(?:por conta|a cargo|responsabilidade)\s+d[oa]s?\s+(?:arrematante|adquirente|comprador)`,
    String.raw`\b(?:arrematante|adquirente|comprador)\s+(?:sera|ficara)\s+responsavel\s+pel[ao]s?\s+(?:providencias\s+de\s+)?desocupacao`,
    String.raw`\batualmente\s+(?:servindo|utilizad[oa]|sendo utilizad[oa]|em uso|funcionando|abrigando)\b`,
  ].join("|"),
);

const DESOCUPADO_FORTE = new RegExp(
  String.raw`\b${OBJETO}${VERBO}\s+(?:atualmente\s+)?(?:desocupad[oa]s?|vazi[oa]s?|vag[oa]s?|livre(?:\s+e\s+desimpedid[oa])?\s+de\s+(?:pessoas|ocupantes|moradores))\b`,
);
const DESOCUPADO_SOLTO = /\bdesocupad[oa]s?\b/;

/** Ocupação por benfeitoria, não por gente ("área ocupada pela construção"). */
const OCUPADO_POR_COISA = /^(?:uma?\s+|as?\s+|os?\s+)?(?:construc|edificac|benfeitori|predio|casa|galpao|area|vegetac|mata|rua|via)/;
const SUJEITO_AREA = /\b(?:area|espaco|parte|faixa|superficie|porcao)\s*(?:construida\s*)?$/;

type Lado = "ocupado" | "desocupado";

interface Sinal {
  lado: Lado;
  confianca: Confianca;
  /** Sinal claro sobre este imóvel (sem ele, a tag vai para revisão). */
  forte: boolean;
  achado: Achado;
}

/** "vendidos ocupados ou desocupados", "ocupado/desocupado": frase-modelo, não informa nada. */
const OCUPACAO_INDIFERENTE = /\b(?:des)?ocupad[oa]s?\s*(?:ou|\/|e\/ou)\s*(?:des)?ocupad[oa]s?\b|\bocupacao\s*\/\s*(?:invasao\s*\/\s*)?desocupacao\b/;
/** Ressalva dentro do próprio achado ("a desocupação, se ocupado, correrá por conta..."). */
const RESSALVA_INTERNA = /\bse\s+(?:estiver\s+|houver\s+)?ocupad|\bcaso\b|\beventua|\bse houver\b|\bhavendo\b/;

function sinaisDePosse(cls: readonly Clausula[]): Sinal[] {
  const sinais: Sinal[] = [];
  const valido = (a: Achado): boolean => !ressalvado(a) && !OCUPACAO_INDIFERENTE.test(a.clausula.n) && !RESSALVA_INTERNA.test(a.casado);

  for (const a of achados(cls, OCUPADO_FORTE)) {
    if (!valido(a)) continue;
    if (OCUPADO_POR_COISA.test(a.depois) && /^ocupad/.test(a.casado)) continue;
    if (SUJEITO_AREA.test(a.antes) && /^ocupad/.test(a.casado)) continue;
    // "não está ocupado" é sinal (fraco) de desocupado.
    if (negado(a) || NEGACAO_INTERNA.test(a.casado)) sinais.push({ lado: "desocupado", confianca: "baixa", forte: false, achado: a });
    else sinais.push({ lado: "ocupado", confianca: "media", forte: true, achado: a });
  }
  for (const a of achados(cls, OCUPACAO_ROTULADA)) {
    if (!valido(a)) continue;
    const valor = a.depois.slice(0, 50);
    if (/^\s*$/.test(valor)) continue;
    if (/^(?:o\s+)?(?:imovel\s+)?(?:esta\s+)?(?:desocupad|livre|vag|vazi|nenhum|nao ha|sem ocupa)/.test(valor)) {
      sinais.push({ lado: "desocupado", confianca: "media", forte: true, achado: a });
    } else if (/^(?:o\s+|a\s+)?(?:propri[oa]\s+)?(?:ocupad|executad|devedor|proprietari|terceir|inquilin|locatari|ocupante|morador|familia|invasor|filh|parente|ex-)/.test(valor)) {
      sinais.push({ lado: "ocupado", confianca: "media", forte: true, achado: a });
    }
  }
  for (const a of achados(cls, OCUPADO_FRACO)) {
    if (!valido(a)) continue;
    sinais.push({ lado: "ocupado", confianca: "baixa", forte: false, achado: a });
  }
  for (const a of achados(cls, DESOCUPADO_FORTE)) {
    if (!valido(a)) continue;
    if (negado(a) || NEGACAO_INTERNA.test(a.casado)) sinais.push({ lado: "ocupado", confianca: "baixa", forte: false, achado: a });
    else sinais.push({ lado: "desocupado", confianca: "media", forte: true, achado: a });
  }
  for (const a of achados(cls, DESOCUPADO_SOLTO)) {
    if (!valido(a)) continue;
    if (sinais.some((s) => s.achado.texto === a.texto && s.achado.inicio <= a.inicio && s.achado.fim >= a.fim)) continue;
    if (OCUPACAO_ROTULADA.test(a.antes.slice(-30))) continue;
    if (negado(a)) sinais.push({ lado: "ocupado", confianca: "baixa", forte: false, achado: a });
    else sinais.push({ lado: "desocupado", confianca: "baixa", forte: false, achado: a });
  }
  return sinais;
}

export const regraOcupacao: RegraRisco = {
  id: "posse/ocupacao",
  descricao: "Ocupação pelo campo estruturado da fonte ou por frases do edital sobre este imóvel; sem sinal, 'Ocupação não informada'.",
  tags: ["ocupado", "desocupado", "ocupacao-nao-informada"],
  avaliar({ imovel, textos }) {
    const sinais = sinaisDePosse(clausulasDe(textos));
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

    if (oc && de) {
      return [
        deteccao("ocupado", "sim", oc.confianca, oc.achado.texto.origem, trechoDe(oc.achado), true),
        deteccao("desocupado", "sim", de.confianca, de.achado.texto.origem, trechoDe(de.achado), true),
        deteccao("ocupacao-nao-informada", "nao", "media", oc.achado.texto.origem, trechoDe(oc.achado)),
      ];
    }
    if (oc) {
      const trecho = trechoDe(oc.achado);
      return [
        deteccao("ocupado", "sim", oc.confianca, oc.achado.texto.origem, trecho, !oc.forte),
        deteccao("desocupado", "nao", oc.confianca, oc.achado.texto.origem, trecho),
        deteccao("ocupacao-nao-informada", "nao", oc.confianca, oc.achado.texto.origem, trecho),
      ];
    }
    if (de) {
      const trecho = trechoDe(de.achado);
      return [
        deteccao("desocupado", "sim", de.confianca, de.achado.texto.origem, trecho, true),
        deteccao("ocupado", "nao", "baixa", de.achado.texto.origem, trecho, true),
        deteccao("ocupacao-nao-informada", "nao", de.confianca, de.achado.texto.origem, trecho),
      ];
    }
    return [
      deteccao("ocupacao-nao-informada", "sim", "alta", "ausencia", "A fonte não informa se o imóvel está ocupado."),
      desconhecido("ocupado", "Sem informação de ocupação na fonte."),
      desconhecido("desocupado", "Sem informação de ocupação na fonte."),
    ];
  },
};

export const REGRAS_POSSE: readonly RegraRisco[] = [regraOcupacao];
