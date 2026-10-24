import "server-only";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SITE } from "@/content/site";
import { local, moeda, normalizar, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import { lerPlano } from "@/lib/catalogo/planos";
import { rotaImovel } from "@/lib/catalogo/rotas";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";
import { carregarImovel, garantirImovel, lerId } from "./carregar";
import { fraseDesagio } from "./formato";
import { PaginaImovel } from "./PaginaImovel";
import { CHAVE_RESUMO_LATERAL, RECOLHIDO } from "./preferencias";

type Parametros = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** O mesmo carregamento para o layout, os metadados e a página (uma leitura por requisição). */
const carregar = carregarImovel;

async function lerEntrada({ params, searchParams }: Parametros) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const plano: Plano = lerPlano(sp.plano);
  return { id: lerId(id), plano };
}

/**
 * Metadados da página do imóvel: o título do imóvel, uma descrição com local e preço e a URL canônica.
 * /previa: noindex e nofollow sempre (página interna). /assinante: noindex, segue os links quando o site é
 * indexável (igual à lista da demonstração).
 */
export async function metadadosImovel(conjunto: Conjunto, entrada: Parametros): Promise<Metadata> {
  const { id, plano } = await lerEntrada(entrada);
  const robots = conjunto === "previa" ? { index: false, follow: false } : { index: false, follow: SITE.indexable };
  const pagina = await carregar(conjunto, id, plano);
  if (!pagina) return { title: `Imóvel não encontrado | ${SITE.name}`, robots: { index: false, follow: false } };
  const i = pagina.imovel;
  // títulos da Leilões Judiciais já terminam com "Cidade/UF": não repete o local na aba
  const tituloTemCidade = normalizar(i.titulo).includes(normalizar(`${i.cidade}/${i.uf}`));
  const title = `${tituloTemCidade ? i.titulo : `${i.titulo} · ${local(i)}`} | ${SITE.name}`;
  const desagio = fraseDesagio(i.desagio);
  const description =
    `${i.tipo === "outro" ? "Imóvel" : TIPO_ROTULO[i.tipo]} em ${local(i)}: lance mínimo ${moeda(i.lance)}` +
    `${desagio && i.desagio! > 0 ? ` (${desagio})` : ""}. ${i.fonte.id === "exemplo" ? "Exemplo fictício da demonstração." : `Fonte: ${i.fonte.nome}.`}`;
  const url = rotaImovel(conjunto, i.id);
  return {
    title,
    description,
    robots,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: SITE.locale, url, siteName: SITE.name, title, description },
    twitter: { card: "summary", title, description },
  };
}

export { garantirImovel };

/** A página: id inexistente dá 404 (not-found.tsx da rota). */
export async function renderizarImovel(conjunto: Conjunto, entrada: Parametros) {
  const [{ id, plano }, jarra] = await Promise.all([lerEntrada(entrada), cookies()]);
  const pagina = await carregar(conjunto, id, plano);
  if (!pagina) notFound();
  // o resumo da direita recolhido (escolha da pessoa, espelhada no cookie): a primeira pintura já sai assim
  const resumoRecolhido = jarra.get(CHAVE_RESUMO_LATERAL)?.value === RECOLHIDO;
  // key: indo de um imóvel a outro (cartão de "parecidos"), a página começa do zero (galeria na 1ª foto,
  // descrição fechada); trocar só o plano mantém o estado
  return <PaginaImovel key={pagina.imovel.id} conjunto={conjunto} plano={plano} pagina={pagina} agora={Date.now()} resumoRecolhido={resumoRecolhido} />;
}
