"use client";

import { useState } from "react";
import type { ImovelDetalhe, Vizinhanca } from "@/lib/catalogo/tipos";
import { IconeExterno } from "./icones";
import { NovaAba } from "./partes";

type Nivel = "rua" | "bairro" | "cidade";

const NIVEIS: readonly Nivel[] = ["rua", "bairro", "cidade"];
const TITULO: Record<Nivel, string> = { rua: "Na mesma rua", bairro: "No mesmo bairro", cidade: "Na cidade" };
const CURTO_NIVEL: Record<Nivel, string> = { rua: "Rua", bairro: "Bairro", cidade: "Cidade" };
/** Nomes curtos nos botões (o nome inteiro vai no título e no texto para leitor de tela). */
const CURTO: Record<string, string> = { "Zap Imóveis": "Zap" };

/**
 * "Veja anúncios parecidos nos portais": um seletor Rua | Bairro | Cidade e, embaixo, os portais daquele alcance
 * (e uma busca geral do Google) numa grade de 3 colunas (6 no computador). Antes eram 3 grupos × 6 botões = 18
 * botões em fila. Só links: a Luneta não copia anúncios.
 */
export function BuscasPortais({ imovel: i, buscas, rua }: { imovel: Pick<ImovelDetalhe, "bairro" | "cidade" | "uf">; buscas: Vizinhanca["buscasExternas"]; rua: string | null }) {
  // dados antigos, sem o nível: a busca leva o bairro quando há bairro
  const nivelDe = (b: Vizinhanca["buscasExternas"][number]): Nivel => b.nivel ?? (i.bairro ? "bairro" : "cidade");
  const grupos = NIVEIS.map((n) => ({ n, links: buscas.filter((b) => nivelDe(b) === n) })).filter((g) => g.links.length > 0);
  const [escolhido, setEscolhido] = useState<Nivel | null>(null);
  if (grupos.length === 0) return null;
  const atual = grupos.find((g) => g.n === escolhido) ?? grupos[0]!;
  const lugar: Record<Nivel, string | null> = { rua, bairro: i.bairro, cidade: `${i.cidade}/${i.uf}` };

  return (
    <div className="rounded-3xl border border-nevoa/15 bg-tinta px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
      <h3 className="font-display text-[17px] leading-snug font-bold tracking-[-0.01em] text-luar">Veja anúncios parecidos nos portais</h3>
      <p className="mt-1 max-w-[64ch] text-sm leading-relaxed text-nevoa sm:text-[13px]">
        Cada botão abre em nova aba
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

      <div className="py-3.5">
        <p className="min-w-0 text-[14px] leading-snug font-semibold text-luar">
          {TITULO[atual.n]}
          {lugar[atual.n] && (
            <span title={lugar[atual.n] ?? undefined} className="block truncate text-[13px] font-normal text-nevoa sm:inline">
              <span className="max-sm:hidden"> · </span>
              {lugar[atual.n]}
            </span>
          )}
        </p>
        <ul aria-label={`Buscas ${TITULO[atual.n].toLowerCase()}`} className="mt-2.5 grid grid-cols-3 gap-1.5 @xl:grid-cols-6">
          {atual.links.map((l) => (
            <li key={l.url} className="min-w-0">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={l.descricao}
                className={`flex min-h-11 w-full items-center justify-center rounded-full border px-2 text-center text-[13px] font-medium no-underline transition-colors pointer-fine:min-h-9 ${
                  l.rotulo === "Google"
                    ? "border-dashed border-nevoa/40 text-nevoa hover:border-latao hover:text-luar"
                    : "border-nevoa/30 text-luar hover:border-latao hover:bg-latao/10"
                }`}
              >
                <span className="truncate">{l.rotulo === "Google" ? "Google" : (CURTO[l.rotulo] ?? l.rotulo)}</span>
                <span className="sr-only">: {l.descricao ?? "busca no Google"}</span>
                <NovaAba />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-nevoa/12 py-3 text-[13px] leading-relaxed text-nevoa sm:text-[12px]">
        A Luneta não copia nem mostra anúncios: a comparação com o preço pedido nos portais fica com você.
      </p>
    </div>
  );
}
