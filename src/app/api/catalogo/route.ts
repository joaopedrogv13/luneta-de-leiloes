/**
 * GET /api/catalogo?conjunto=previa|exemplos&<busca>  →  ResultadoBusca (JSON)
 *
 * Mesmos parâmetros da URL da página (src/lib/catalogo/url.ts): uf, cidade, bairro, tipo, faixas,
 * ordem, pagina, plano... mais `porPagina` (1 a 96, padrão 24). `mapa=0` (mapa escondido) devolve
 * `mapa: []`: o mapa do Brasil inteiro é a maior parte da resposta. `facetas=0` (o pedido do mapa) devolve
 * as facetas vazias. Parâmetro desconhecido ou inválido
 * é ignorado, nunca dá erro 500. Sem `conjunto` válido: 400. Fora dos buscadores e sem cache (a
 * resposta depende do plano).
 */
import type { NextRequest } from "next/server";
import { buscaDaUrl, buscar, lerBusca, lerConjunto } from "@/lib/catalogo/servidor";

const CABECALHOS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams;
  const conjunto = lerConjunto(parametros.get("conjunto"));
  if (!conjunto) {
    return Response.json({ erro: 'Informe o conjunto: "previa" ou "exemplos".' }, { status: 400, headers: CABECALHOS });
  }
  try {
    const resultado = await buscar(buscaDaUrl(conjunto, parametros), {
      mapa: lerBusca(parametros).mapa !== false,
      facetas: parametros.get("facetas") !== "0",
    });
    return Response.json(resultado, { headers: CABECALHOS });
  } catch (e) {
    // Dados indisponíveis (arquivo do instantâneo faltando ou de outra versão): 503, com a causa no log.
    console.error("api/catalogo:", e);
    return Response.json({ erro: "Catálogo indisponível no momento. Tente de novo em instantes." }, { status: 503, headers: CABECALHOS });
  }
}
