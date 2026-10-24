/**
 * Dados do catálogo no servidor, carregados uma vez por instância (Vercel: por função fria) e guardados em memória.
 * Como cada conjunto é montado está em src/lib/catalogo/conjuntos.ts (sem nada do Next, para os testes):
 * - "previa": o instantâneo do banco em base/saida/site, com a nota de localização;
 * - "exemplos" (a /assinante): a vitrine com os ~10 melhores imóveis reais da prévia e os 6 exemplos fictícios de
 *   src/content/examples.ts à parte (conjuntos.ts › montarVitrine). Sem a prévia (instantâneo faltando), ficam só os
 *   exemplos, como antes da rodada 5.
 *
 * SÓ SERVIDOR: lê arquivos e guarda o conjunto inteiro (com tags e selo, sem plano aplicado). O navegador
 * recebe só o que src/lib/catalogo/servidor.ts devolve, com o plano já aplicado.
 * Os arquivos entram nas funções da Vercel por `outputFileTracingIncludes` em next.config.ts.
 */
import "server-only";
import { LISTINGS } from "../../content/examples";
import { carregarExemplos, carregarPrevia, montarVitrine, type DadosConjunto } from "./conjuntos";
import { diaBrasilia } from "./consulta";
import { pastaPadrao } from "./instantaneo";
import { dadosLocalizacao, moradoresDe } from "./localizacao";
import type { Conjunto } from "./tipos";

export type { DadosConjunto };

const carregados = new Map<Conjunto, Promise<DadosConjunto>>();

/** Dia (Brasília) em que os exemplos foram montados: as datas das praças são relativas a ele. */
let diaDosExemplos: string | null = null;

/** Os dados de um conjunto, carregados na primeira chamada desta instância. */
export function dadosDoConjunto(conjunto: Conjunto): Promise<DadosConjunto> {
  if (conjunto === "exemplos") {
    // Exemplos com praça sempre no futuro: remonta quando o dia vira (instância que fica no ar por semanas
    // não deixa a praça dos exemplos vencer, o que os tiraria da busca).
    const hoje = diaBrasilia(new Date());
    if (diaDosExemplos !== hoje) {
      carregados.delete("exemplos");
      diaDosExemplos = hoje;
    }
  }
  let pronto = carregados.get(conjunto);
  if (!pronto) {
    pronto = conjunto === "previa" ? carregarPrevia(pastaPadrao()) : carregarVitrine();
    // erro de leitura não fica guardado: a próxima requisição tenta de novo
    pronto.catch(() => carregados.delete(conjunto));
    carregados.set(conjunto, pronto);
  }
  return pronto;
}

/**
 * A vitrine da /assinante, escolhida a cada carga (e a cada dia, com os exemplos): a prévia já carregada, os moradores
 * de cada cidade pelos arquivos da nota e os exemplos fictícios. Se a prévia não carregar, só os exemplos (a página
 * continua de pé; o motivo vai para o log).
 */
async function carregarVitrine(): Promise<DadosConjunto> {
  const agora = new Date();
  const ficticios = carregarExemplos(LISTINGS, agora);
  try {
    const [previa, loc] = await Promise.all([dadosDoConjunto("previa"), dadosLocalizacao()]);
    const vitrine = montarVitrine(previa, ficticios, { agora, moradores: (i) => moradoresDe(loc, i.id) });
    if (!vitrine.vitrine?.escolhidos.length) console.error("vitrine: nenhum imóvel real passou no critério; ficam só os exemplos");
    return vitrine.vitrine?.escolhidos.length ? vitrine : ficticios;
  } catch (e) {
    console.error(`vitrine: a prévia não carregou (${(e as Error).message}); ficam só os exemplos fictícios`);
    // não guarda o substituto: o próximo pedido tenta a vitrine de novo
    carregados.delete("exemplos");
    return ficticios;
  }
}
