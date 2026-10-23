#!/usr/bin/env node
/**
 * Roteiros do workflow de prints (.github/workflows/site-prints.yml roda este arquivo do branch escolhido, com o
 * `next start` na porta 3000; o que for gravado em prints-saida/ vai para o branch coletas-dados, pasta prints/<run_id>/).
 *
 *   node scripts/prints/actions.mjs fotos         # baixa as fotos candidatas e monta folhas de contato (fotos.mjs)
 *   node scripts/prints/actions.mjs fotos-site    # a vitrine e os cartões com as fotos de verdade (fotos-site.mjs)
 *
 * Outros roteiros (ex.: "mapa", da frente do mapa) entram aqui como mais um caso.
 */
const roteiro = process.argv[2] ?? process.env.ROTEIRO ?? "fotos";
const resto = process.argv.slice(3);

if (roteiro === "fotos" || roteiro.startsWith("fotos:")) {
  process.argv = [process.argv[0], process.argv[1], roteiro.split(":")[1] ?? "fotos", ...resto];
  await import("./fotos.mjs");
} else if (roteiro === "fotos-site") {
  await import("./fotos-site.mjs");
} else {
  console.log(`roteiro desconhecido: ${roteiro} (use fotos ou fotos-site)`);
  process.exitCode = 1;
}
