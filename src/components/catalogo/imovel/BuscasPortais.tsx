"use client";

import { useState } from "react";
import type { ImovelDetalhe, Vizinhanca } from "@/lib/catalogo/tipos";
import { criteriosBusca, FOLGA_CRITERIOS, ID_PORTAIS } from "./formato";
import { IconeExterno } from "./icones";
import { NovaAba } from "./partes";

type Nivel = "rua" | "bairro" | "cidade";

const NIVEIS: readonly Nivel[] = ["rua", "bairro", "cidade"];
const TITULO: Record<Nivel, string> = { rua: "Na mesma rua", bairro: "No mesmo bairro", cidade: "Na cidade" };
const CURTO_NIVEL: Record<Nivel, string> = { rua: "Rua", bairro: "Bairro", cidade: "Cidade" };
/** O selo do nível em cada cartão. */
const SELO_NIVEL: Record<Nivel, string> = { rua: "Mesma rua", bairro: "Mesmo bairro", cidade: "Na cidade" };

/**
 * A marca de cor de cada portal: só a sigla sobre uma cor parecida com a da marca, desenhada aqui (sem logotipo
 * baixado, sem foto do anúncio). Decorativa: o nome do portal vem escrito ao lado. As cores são um tom mais escuro que
 * o da marca quando preciso, para a sigla branca ter contraste de pelo menos 4,5:1 (Zap 4,8; Viva Real 4,9; OLX 7,8;
 * QuintoAndar 6,3; Imovelweb 4,9).
 */
const MARCA: Record<string, { sigla: string; cor: string }> = {
  "Zap Imóveis": { sigla: "Z", cor: "#d23c23" },
  "Viva Real": { sigla: "VR", cor: "#1376b5" },
  OLX: { sigla: "OLX", cor: "#6e0ad6" },
  QuintoAndar: { sigla: "QA", cor: "#3554d1" },
  Imovelweb: { sigla: "IW", cor: "#b4560a" },
};

/** A busca geral (todos os sites): uma lupa no lugar da sigla. */
function Lupa() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="8.6" cy="8.6" r="5.2" />
      <path d="m12.6 12.6 4 4" />
    </svg>
  );
}

/**
 * "Veja anúncios parecidos nos portais": um seletor Rua | Bairro | Cidade e, embaixo, um cartão por portal daquele
 * alcance (e a busca geral do Google). Cada cartão tem a marca de cor do portal, o nome, o selo do nível e abre a
 * busca em nova aba; em cima, o resumo dos critérios (tipo, quartos, área e faixa de preço). Só links: a Luneta não
 * copia anúncios nem fotos (rodada 6, decisão 5b).
 */
export function BuscasPortais({
  imovel: i,
  buscas,
  rua,
}: {
  imovel: Pick<ImovelDetalhe, "bairro" | "cidade" | "uf" | "tipo" | "quartos" | "area" | "avaliacao">;
  buscas: Vizinhanca["buscasExternas"];
  rua: string | null;
}) {
  // dados antigos, sem o nível: a busca leva o bairro quando há bairro
  const nivelDe = (b: Vizinhanca["buscasExternas"][number]): Nivel => b.nivel ?? (i.bairro ? "bairro" : "cidade");
  const grupos = NIVEIS.map((n) => ({ n, links: buscas.filter((b) => nivelDe(b) === n) })).filter((g) => g.links.length > 0);
  const [escolhido, setEscolhido] = useState<Nivel | null>(null);
  if (grupos.length === 0) return null;
  const atual = grupos.find((g) => g.n === escolhido) ?? grupos[0]!;
  const lugar: Record<Nivel, string | null> = { rua, bairro: i.bairro, cidade: `${i.cidade}/${i.uf}` };
  const criterios = criteriosBusca(i);
  const folga = `${Math.round(FOLGA_CRITERIOS * 100)}%`;
  // o que a busca do Google não leva (a área e o preço) e fica de guia para filtrar no portal
  const comArea = i.area !== null && criterios.some((c) => c.endsWith("m²"));
  const comPreco = i.avaliacao !== null && criterios.some((c) => c.startsWith("R$"));
  const guia =
    comArea && comPreco
      ? `As faixas de área e de preço (± ${folga} da área e da avaliação deste imóvel) são um guia para filtrar lá.`
      : comArea
        ? `A faixa de área (± ${folga} da área deste imóvel) é um guia para filtrar lá.`
        : comPreco
          ? `A faixa de preço (± ${folga} da avaliação) é um guia para filtrar lá.`
          : null;

  return (
    <div id={ID_PORTAIS} className="scroll-mt-3 rounded-3xl border border-nevoa/15 bg-tinta px-4 pt-4 pb-1 sm:px-6 sm:pt-5">
      <h3 className="font-display text-[17px] leading-snug font-bold tracking-[-0.01em] text-luar">Veja anúncios parecidos nos portais</h3>
      <p className="mt-1 max-w-[64ch] text-sm leading-relaxed text-nevoa sm:text-[13px]">
        Cada cartão abre em nova aba
        <IconeExterno tamanho={13} className="mx-1 inline-block align-[-2px]" />
        uma busca do Google só com anúncios daquele portal, com o tipo, os quartos e o lugar deste imóvel.
      </p>

      {grupos.length > 1 && (
        <div role="group" aria-label="Onde buscar" className="mt-3.5 inline-flex w-full max-w-md gap-1 rounded-2xl border border-nevoa/25 bg-noite p-1">
          {grupos.map(({ n }) => {
            const on = n === atual.n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => setEscolhido(n)}
                className={`inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl px-2 text-[14px] font-semibold transition-colors duration-150 motion-reduce:transition-none pointer-fine:min-h-9 ${
                  on ? "bg-latao text-noite-fixa" : "text-luar hover:bg-nevoa/10"
                }`}
              >
                {CURTO_NIVEL[n]}
                <span className="sr-only"> ({TITULO[n].toLowerCase()})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="pt-3.5 pb-3">
        <p className="min-w-0 text-[14px] leading-snug font-semibold text-luar">
          {TITULO[atual.n]}
          {lugar[atual.n] && (
            <span title={lugar[atual.n] ?? undefined} className="block truncate text-[13px] font-normal text-nevoa sm:inline">
              <span className="max-sm:hidden"> · </span>
              {lugar[atual.n]}
            </span>
          )}
        </p>
        {criterios.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            <span className="sr-only">Para comparar: </span>
            {criterios.map((c, k) => (
              <span
                key={c}
                className="inline-flex items-center rounded-full border border-nevoa/20 bg-noite/60 px-2.5 py-1 text-[12.5px] leading-none whitespace-nowrap text-luar/90 tabular-nums"
              >
                {c}
                {k < criterios.length - 1 && <span className="sr-only">,</span>}
              </span>
            ))}
          </p>
        )}
        <ul aria-label={`Buscas ${TITULO[atual.n].toLowerCase()}`} className="mt-3 grid grid-cols-2 gap-2 @2xl:grid-cols-3">
          {atual.links.map((l) => {
            const geral = l.rotulo === "Google";
            const marca = MARCA[l.rotulo];
            return (
              <li key={l.url} className="min-w-0">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={l.descricao}
                  className={`group flex min-h-14 w-full items-center gap-2 rounded-2xl border px-2.5 py-2 no-underline transition duration-150 ease-luneta motion-reduce:transition-none sm:gap-3 sm:px-3 ${
                    geral
                      ? "border-dashed border-nevoa/35 hover:border-latao/70 hover:bg-latao/[0.06]"
                      : "border-nevoa/20 bg-noite/40 hover:-translate-y-px hover:border-latao/70 hover:bg-latao/[0.07] hover:shadow-[0_6px_18px_-10px_rgba(201,162,77,.55)] motion-reduce:hover:translate-y-0"
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-latao`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-7 shrink-0 items-center justify-center rounded-[10px] font-display text-[10.5px] leading-none font-bold tracking-[0.02em] sm:size-8 sm:rounded-xl sm:text-[11px] ${
                      marca ? "text-white" : "border border-nevoa/30 text-nevoa group-hover:text-latao-texto"
                    }`}
                    style={marca ? { backgroundColor: marca.cor } : undefined}
                  >
                    {marca ? marca.sigla : <Lupa />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-tight font-semibold text-luar min-[400px]:text-[14px]">{geral ? "Busca geral" : l.rotulo}</span>
                    <span className="mt-0.5 block truncate text-[12px] leading-tight text-nevoa">{geral ? "Todos os sites" : SELO_NIVEL[atual.n]}</span>
                  </span>
                  <IconeExterno
                    tamanho={14}
                    className="text-nevoa transition-colors group-hover:text-latao-texto group-focus-visible:text-latao-texto max-sm:hidden"
                  />
                  <span className="sr-only">: {l.descricao ?? "busca no Google"}</span>
                  <NovaAba />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="border-t border-nevoa/12 py-3 text-[13px] leading-relaxed text-nevoa sm:text-[12px]">
        As fotos e o preço pedido ficam no portal: a Luneta só monta a busca e não copia anúncios.
        {guia && ` ${guia}`}
      </p>
    </div>
  );
}
