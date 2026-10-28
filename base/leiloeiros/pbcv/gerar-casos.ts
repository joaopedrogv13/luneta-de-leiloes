/**
 * Refaz as saídas de casos-compartilhados.json pelo TypeScript:
 *
 *   node --experimental-strip-types base/leiloeiros/pbcv/gerar-casos.ts
 *
 * Só depois de mudar de propósito a máscara (base/util/lgpd.ts), o campoSemPessoa ou o inferirTipoImovel. Depois,
 * acerte regras_luneta.py até `python3 base/leiloeiros/pbcv/testar.py` passar.
 */
import { regravarCasos } from "./casos.ts";

process.stdout.write(`${regravarCasos()} casos regravados em base/leiloeiros/pbcv/casos-compartilhados.json\n`);
