/**
 * GET /api/catalogo/pontos?conjunto=previa|exemplos&<filtros>  →  PontosCompactos (src/lib/catalogo/pontos.ts)
 *
 * Os pontos de TODOS os imóveis filtrados para o mapa de verdade (vista de mapa), em colunas compactas (~160 KB com
 * brotli para o Brasil inteiro). Mesmos filtros e plano da lista (src/lib/catalogo/url.ts); a ordem, a página e a área do
 * mapa (`bbox`) não mudam os pontos e são ignoradas. Sem `conjunto` válido: 400.
 *
 * Cache: os pontos não têm nada do plano Luneta (nem tags, nem selo, nem nota), e o plano está na URL (muda só quais
 * filtros valem): a resposta é a mesma para a mesma URL até o próximo deploy. O navegador guarda por 5 minutos; a CDN,
 * por um dia (o deploy novo limpa). Na instância, as últimas respostas ficam prontas na memória, já comprimidas: o
 * `next start` não comprime as rotas de API (só as páginas), e 540 KB de JSON viram ~160 KB com brotli e ~180 KB com
 * gzip (a CDN da Vercel respeita a compressão que vem pronta).
 */
import { brotliCompress, brotliCompressSync, constants, gzipSync } from "node:zlib";
import type { NextRequest } from "next/server";
import { canonico } from "@/components/catalogo/app/consultas";
import { buscaDaUrl, lerConjunto, pontosDoMapa } from "@/lib/catalogo/servidor";
import { escreverBusca } from "@/lib/catalogo/url";

const CABECALHOS = {
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Type": "application/json; charset=utf-8",
  Vary: "Accept-Encoding",
} as const;

/** Uma resposta pronta: o JSON e as versões comprimidas (feitas na primeira vez que alguém pede). */
interface Pronta {
  json: string;
  br?: Buffer;
  /** a versão menor do brotli (qualidade 10, ~12% menor) já foi pedida em segundo plano */
  brMaximo?: boolean;
  gzip?: Buffer;
}

const brotli = (qualidade: number, tamanho: number) => ({
  params: { [constants.BROTLI_PARAM_QUALITY]: qualidade, [constants.BROTLI_PARAM_SIZE_HINT]: tamanho },
});
/** Últimas respostas desta instância, pela busca canônica. */
const prontas = new Map<string, Pronta>();
const LIMITE = 12;

/** O corpo na melhor compressão que o navegador aceita (brotli, gzip ou nenhuma). */
function corpoPara(p: Pronta, aceita: string): { corpo: BodyInit; codificacao: string | null } {
  if (/\bbr\b/.test(aceita)) {
    // a primeira resposta sai rápida (qualidade 6: ~30 ms para o Brasil inteiro); a de qualidade 10 (~0,5 s, 182 → 161 KB)
    // é feita fora da fila, num thread do Node, e vale dos próximos pedidos em diante
    p.br ??= brotliCompressSync(p.json, brotli(6, p.json.length));
    if (!p.brMaximo) {
      p.brMaximo = true;
      brotliCompress(p.json, brotli(10, p.json.length), (erro, menor) => {
        if (!erro) p.br = menor;
      });
    }
    return { corpo: new Uint8Array(p.br), codificacao: "br" };
  }
  if (/\bgzip\b/.test(aceita)) {
    p.gzip ??= gzipSync(p.json, { level: 6 });
    return { corpo: new Uint8Array(p.gzip), codificacao: "gzip" };
  }
  return { corpo: p.json, codificacao: null };
}

export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams;
  const conjunto = lerConjunto(parametros.get("conjunto"));
  if (!conjunto) {
    return Response.json({ erro: 'Informe o conjunto: "previa" ou "exemplos".' }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const busca = buscaDaUrl(conjunto, parametros);
    const filtros = canonico(busca.filtros);
    delete filtros.bbox;
    const chave = escreverBusca({ conjunto, filtros, plano: busca.plano }).toString();
    let pronta = prontas.get(chave);
    if (pronta === undefined) {
      pronta = { json: JSON.stringify(await pontosDoMapa({ ...busca, filtros })) };
      prontas.set(chave, pronta);
      while (prontas.size > LIMITE) prontas.delete(prontas.keys().next().value!);
    }
    const { corpo, codificacao } = corpoPara(pronta, request.headers.get("accept-encoding") ?? "");
    return new Response(corpo, { headers: codificacao ? { ...CABECALHOS, "Content-Encoding": codificacao } : CABECALHOS });
  } catch (e) {
    console.error("api/catalogo/pontos:", e);
    return Response.json({ erro: "O mapa está indisponível no momento. Tente de novo em instantes." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
