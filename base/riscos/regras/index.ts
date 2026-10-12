/**
 * Registro das regras de risco. O motor roda todas, na ordem desta lista.
 *
 * Para acrescentar uma regra:
 * 1. crie base/riscos/regras/<grupo>.ts exportando um ou mais `RegraRisco`
 *    (tipos de "../motor.ts" com `import type`; ferramentas de "../evidencia.ts");
 * 2. importe aqui e acrescente na lista;
 * 3. escreva base/riscos/regras/<grupo>.test.ts com casos reais (trechos mascarados).
 *
 * Grupos sugeridos, na ordem do site: posse, preco, dividas, juridico, documentacao,
 * propriedade, condicao, praca. Critérios e fontes de cada tag: catálogo de fontes, §4.
 */
import type { RegraRisco } from "../motor.ts";

// import { REGRAS_POSSE } from "./posse.ts";              // ocupado, desocupado, ocupacao-nao-informada
// import { REGRAS_PRECO } from "./preco.ts";              // desagio-alto, desagio-baixo, preco-acima-mercado, custos-extras-altos
// import { REGRAS_DIVIDAS } from "./dividas.ts";          // condominio-em-atraso, iptu-em-atraso, divida-passa-arrematante
// import { REGRAS_JURIDICO } from "./juridico.ts";        // acao-judicial, penhora-outros-credores, leilao-com-recurso, direito-preferencia
// import { REGRAS_DOCUMENTACAO } from "./documentacao.ts"; // matricula-pendencia, construcao-irregular, area-divergente
// import { REGRAS_PROPRIEDADE } from "./propriedade.ts";  // imovel-inteiro, cota-parte, so-direitos
// import { REGRAS_CONDICAO } from "./condicao.ts";        // sem-fotos, sem-vistoria, aceita-financiamento
// import { REGRAS_PRACA } from "./praca.ts";              // primeira-praca, segunda-praca, praca-unica

export const REGRAS: readonly RegraRisco[] = [
  // ...REGRAS_POSSE,
  // ...REGRAS_PRECO,
  // ...REGRAS_DIVIDAS,
  // ...REGRAS_JURIDICO,
  // ...REGRAS_DOCUMENTACAO,
  // ...REGRAS_PROPRIEDADE,
  // ...REGRAS_CONDICAO,
  // ...REGRAS_PRACA,
];
