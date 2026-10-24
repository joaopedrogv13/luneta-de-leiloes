/**
 * GET /api/catalogo/pontos/itens?conjunto=previa|exemplos&versao=<v>&k=12,34[&plano=lente]  →  { ks: number[], itens: ImovelResumo[] }
 *
 * O cartão do mapa de verdade: os imóveis nas posições `k` (até 40, na ordem pedida; `ks` diz as aceitas), com o plano
 * aplicado (no Lente, sem tags, selo e nota). `versao` é a de PontosCompactos.conjunto: se a instância carregou outra lista, 409 (o
 * navegador pede os pontos de novo). Sem cache (a resposta depende do plano, como /api/catalogo).
 */
import type { NextRequest } from "next/server";
import { itensPorPosicao, lerConjunto } from "@/lib/catalogo/servidor";
import { lerPlano } from "@/lib/catalogo/planos";

const CABECALHOS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } as const;
const MAXIMO = 40;

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const conjunto = lerConjunto(p.get("conjunto"));
  const versao = p.get("versao");
  if (!conjunto || !versao) {
    return Response.json({ erro: "Informe o conjunto e a versão dos pontos." }, { status: 400, headers: CABECALHOS });
  }
  const ks = (p.get("k") ?? "")
    .split(",")
    .slice(0, MAXIMO)
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 0);
  try {
    const r = await itensPorPosicao(conjunto, versao, ks, lerPlano(p.get("plano")));
    if (r === null) return Response.json({ erro: "Os pontos do mapa são de outra versão do catálogo." }, { status: 409, headers: CABECALHOS });
    return Response.json(r, { headers: CABECALHOS });
  } catch (e) {
    console.error("api/catalogo/pontos/itens:", e);
    return Response.json({ erro: "Não foi possível carregar o imóvel. Tente de novo em instantes." }, { status: 503, headers: CABECALHOS });
  }
}
