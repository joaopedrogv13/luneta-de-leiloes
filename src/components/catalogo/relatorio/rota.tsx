import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "@/content/site";
import { carregarImovel } from "@/components/catalogo/imovel/carregar";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";
import { tituloDocumento } from "./dados";
import { Relatorio } from "./Relatorio";

type Parametros = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Uma leitura por requisição para o layout, os metadados e a página (a mesma da página do imóvel). */
const carregar = carregarImovel;

async function lerEntrada({ params, searchParams }: Parametros) {
  const [{ id: bruto }, sp] = await Promise.all([params, searchParams]);
  let id = bruto;
  try {
    id = decodeURIComponent(bruto);
  } catch {
    /* fica o id como veio */
  }
  const primeiro = (k: string) => [sp[k]].flat()[0];
  const plano: Plano = primeiro("plano") === "lente" ? "lente" : "luneta";
  return { id, plano, imprimir: primeiro("imprimir") === "1" };
}

/**
 * Metadados do relatório: nunca indexado (nem na /assinante). O título vira o nome do arquivo quando a pessoa salva
 * em PDF ("Relatório Luneta - Casa em São Gonçalo-RJ - 1444419640129").
 */
export async function metadadosRelatorio(conjunto: Conjunto, entrada: Parametros): Promise<Metadata> {
  const { id, plano } = await lerEntrada(entrada);
  const pagina = await carregar(conjunto, id, plano);
  const robots = { index: false, follow: false };
  if (!pagina) return { title: `Imóvel não encontrado | ${SITE.name}`, robots };
  return { title: tituloDocumento(pagina.imovel), description: `Relatório de simulação do imóvel ${pagina.imovel.titulo}.`, robots };
}

/** A página do relatório: id inexistente dá 404 (o layout da rota do imóvel já confere antes). */
export async function renderizarRelatorio(conjunto: Conjunto, entrada: Parametros) {
  const { id, plano, imprimir } = await lerEntrada(entrada);
  const pagina = await carregar(conjunto, id, plano);
  if (!pagina) notFound();
  return <Relatorio key={pagina.imovel.id} conjunto={conjunto} plano={plano} pagina={pagina} imprimir={imprimir} />;
}
