/**
 * Gera scripts/prints/fotos-candidatas.json com as fotos da VITRINE e da fila dela, para o roteiro "fotos" do workflow
 * de prints (scripts/prints/fotos.mjs) baixar e montar as folhas de contato.
 *
 * A fila respeita a variedade da vitrine (src/lib/catalogo/vitrine.ts): escolhe os 10, tira-os (como se a foto de cada
 * um fosse recusada) e escolhe de novo, até juntar QUANTAS fotos. Assim entram, na ordem, as que de fato
 * substituiriam cada vaga. As fotos já recusadas (src/lib/catalogo/vitrine-fotos.ts) ficam de fora sozinhas.
 *
 *   node --import jiti/register scripts/prints/gerar-candidatas.ts             # 40 fotos
 *   QUANTAS=60 node --import jiti/register scripts/prints/gerar-candidatas.ts
 *   git push origin HEAD:acoes-fotos && gh workflow run site-prints.yml --ref acoes-fotos -f roteiro=fotos
 *
 * Depois: olhar as folhas em coletas-dados (prints/<execução>/folha-*.png) e anotar as ruins em vitrine-fotos.ts.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { carregarPrevia } from "../../src/lib/catalogo/conjuntos";
import { pastaPadrao } from "../../src/lib/catalogo/instantaneo";
import { dadosLocalizacao, moradoresDe } from "../../src/lib/catalogo/localizacao";
import { escolherVitrine } from "../../src/lib/catalogo/vitrine";

const QUANTAS = Number(process.env.QUANTAS ?? 40);
const previa = await carregarPrevia(pastaPadrao());
const loc = await dadosLocalizacao();
const agora = new Date();
const opcoes = { agora, moradores: (i: { id: string }) => moradoresDe(loc, i.id) };

const fora = new Set<string>();
const candidatas: Record<string, unknown>[] = [];
for (let volta = 0; candidatas.length < QUANTAS && volta < 50; volta++) {
  const escolhidos = escolherVitrine(previa.itens.filter((i) => !fora.has(i.id)), opcoes);
  if (escolhidos.length === 0) break;
  for (const { item: i, pontos, etapa } of escolhidos) {
    fora.add(i.id);
    candidatas.push({
      id: i.id,
      foto: i.foto,
      grupo: volta === 0 ? "vitrine" : "vitrine-fila",
      tipo: i.tipo,
      titulo: i.titulo,
      bairro: i.bairro,
      cidade: i.cidade,
      uf: i.uf,
      pontos,
      etapa,
    });
  }
}
const destino = join(process.cwd(), "scripts", "prints", "fotos-candidatas.json");
writeFileSync(
  destino,
  JSON.stringify(
    {
      geradoEm: agora.toISOString().slice(0, 10),
      observacao:
        "Fotos da vitrine e da fila dela (URL padrão da Caixa no instantâneo de base/saida/site), geradas por scripts/prints/gerar-candidatas.ts. Só para escolher a olho; nada é re-hospedado no site.",
      candidatas: candidatas.slice(0, QUANTAS),
    },
    null,
    1,
  ) + "\n",
);
console.log(`${Math.min(candidatas.length, QUANTAS)} candidatas em ${destino}`);
