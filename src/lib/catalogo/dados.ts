/**
 * Dados do catálogo no servidor, carregados uma vez por instância (Vercel: por função fria) e guardados em memória.
 * Como cada conjunto é montado está em src/lib/catalogo/conjuntos.ts (sem nada do Next, para os testes):
 * - "previa": o instantâneo do banco em base/saida/site, com a nota de localização;
 * - "exemplos": os 6 exemplos fictícios de src/content/examples.ts.
 *
 * SÓ SERVIDOR: lê arquivos e guarda o conjunto inteiro (com tags e selo, sem plano aplicado). O navegador
 * recebe só o que src/lib/catalogo/servidor.ts devolve, com o plano já aplicado.
 * Os arquivos entram nas funções da Vercel por `outputFileTracingIncludes` em next.config.ts.
 */
import "server-only";
import { LISTINGS } from "../../content/examples";
import { carregarExemplos, carregarPrevia, type DadosConjunto } from "./conjuntos";
import { diaBrasilia } from "./consulta";
import { pastaPadrao } from "./instantaneo";
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
    pronto = conjunto === "previa" ? carregarPrevia(pastaPadrao()) : Promise.resolve(carregarExemplos(LISTINGS));
    // erro de leitura não fica guardado: a próxima requisição tenta de novo
    pronto.catch(() => carregados.delete(conjunto));
    carregados.set(conjunto, pronto);
  }
  return pronto;
}
