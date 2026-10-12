/**
 * Registro das regras de risco. O motor roda todas, na ordem desta lista.
 *
 * Cada tag é decidida por UMA regra (que olha campo estruturado e texto juntos), para que a
 * consolidação nunca escolha entre "desconhecido" de uma regra e "não" de outra. Toda regra
 * devolve as suas tags em todo imóvel: "sim" com evidência, "não" com contrassinal ou campo da
 * fonte, e "desconhecido" quando a fonte não informa (nunca afirma risco sem evidência).
 *
 * Para acrescentar uma regra:
 * 1. crie ou edite base/riscos/regras/<grupo>.ts exportando `RegraRisco`
 *    (tipos de "../motor.ts" com `import type`; ferramentas de "./apoio.ts" e "./sinais.ts");
 * 2. registre aqui;
 * 3. acrescente casos reais (trechos mascarados) em corpus.ts e teste em <grupo>.test.ts.
 *
 * Critérios: catálogo de fontes §4 com as correções da crítica; decisões e limites em
 * base/riscos/regras/README.md; limiares em config.ts.
 *
 * Selo provisório: NÃO implementado. Os critérios dos selos dependem do advogado parceiro
 * (ver README.md desta pasta).
 */
import type { RegraRisco } from "../motor.ts";
import { REGRAS_CONDICAO } from "./condicao.ts";
import { REGRAS_DIVIDAS } from "./dividas.ts";
import { REGRAS_DOCUMENTACAO } from "./documentacao.ts";
import { REGRAS_JURIDICO } from "./juridico.ts";
import { REGRAS_POSSE } from "./posse.ts";
import { REGRAS_PRACA } from "./praca.ts";
import { REGRAS_PRECO } from "./preco.ts";
import { REGRAS_PROPRIEDADE } from "./propriedade.ts";

export const REGRAS: readonly RegraRisco[] = [
  ...REGRAS_POSSE, // ocupado, desocupado, ocupacao-nao-informada
  ...REGRAS_PRECO, // desagio-alto, desagio-baixo, preco-acima-mercado, custos-extras-altos
  ...REGRAS_DIVIDAS, // condominio-em-atraso, iptu-em-atraso, divida-passa-arrematante
  ...REGRAS_JURIDICO, // acao-judicial, penhora-outros-credores, leilao-com-recurso, direito-preferencia
  ...REGRAS_DOCUMENTACAO, // matricula-pendencia, construcao-irregular, area-divergente
  ...REGRAS_PROPRIEDADE, // imovel-inteiro, cota-parte, so-direitos
  ...REGRAS_CONDICAO, // sem-fotos, sem-vistoria, aceita-financiamento
  ...REGRAS_PRACA, // primeira-praca, segunda-praca, praca-unica
];
