import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SITE } from "@/content/site";
import { local, moeda, normalizar, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import { rotaImovel } from "@/lib/catalogo/rotas";
import { paginaImovel } from "@/lib/catalogo/servidor";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";
import { fraseDesagio } from "./formato";
import { PaginaImovel } from "./PaginaImovel";

type Parametros = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** O mesmo carregamento para os metadados e para a página (uma leitura por requisição). */
const carregar = cache((conjunto: Conjunto, id: string, plano: Plano) => paginaImovel(conjunto, id, plano));

function lerId(bruto: string) {
  try {
    return decodeURIComponent(bruto);
  } catch {
    return bruto;
  }
}

async function lerEntrada({ params, searchParams }: Parametros) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const plano: Plano = [sp.plano].flat()[0] === "lente" ? "lente" : "luneta";
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
    `${desagio && i.desagio! > 0 ? ` (${desagio})` : ""}. ${conjunto === "exemplos" ? "Exemplo fictício da demonstração." : `Fonte: ${i.fonte.nome}.`}`;
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

/**
 * Para o layout da rota: id inexistente dá 404 ANTES do esqueleto de carregamento (loading.tsx) começar a ser
 * enviado; depois disso o Next já mandou o status 200. Falha ao ler os dados não decide nada aqui: a página
 * tenta de novo e mostra o erro dela (error.tsx, com "Tentar de novo").
 */
export async function garantirImovel(conjunto: Conjunto, params: Promise<{ id: string }>) {
  const { id } = await params;
  let existe = true;
  try {
    existe = (await carregar(conjunto, lerId(id), "luneta")) !== null;
  } catch {
    // a página mostra o erro
  }
  if (!existe) notFound();
}

/** A página: id inexistente dá 404 (not-found.tsx da rota). */
export async function renderizarImovel(conjunto: Conjunto, entrada: Parametros) {
  const { id, plano } = await lerEntrada(entrada);
  const pagina = await carregar(conjunto, id, plano);
  if (!pagina) notFound();
  // key: indo de um imóvel a outro (cartão de "parecidos"), a página começa do zero (galeria na 1ª foto,
  // descrição fechada); trocar só o plano mantém o estado
  return <PaginaImovel key={pagina.imovel.id} conjunto={conjunto} plano={plano} pagina={pagina} agora={Date.now()} />;
}
