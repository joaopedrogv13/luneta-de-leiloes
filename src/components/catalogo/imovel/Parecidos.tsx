"use client";

import { useRef } from "react";
import { CartaoImovel } from "@/components/catalogo/cartoes/CartaoImovel";
import { rotaImovel } from "@/lib/catalogo/rotas";
import type { ImovelResumo } from "@/lib/catalogo/tipos";
import { useImovel } from "./ContextoImovel";
import { IconeSetaDireita, IconeSetaEsquerda } from "./icones";

const SETA =
  "hidden size-10 cursor-pointer place-items-center rounded-full border border-nevoa/30 text-nevoa transition-colors hover:border-latao hover:text-luar pointer-fine:grid";

/**
 * Imóveis parecidos (mesmo tipo e cidade; área e quartos próximos quando o imóvel os tem): até 6 cartões numa fila que rola de lado,
 * com setas no mouse. Favoritar e tags seguem o plano da página.
 */
export function Parecidos({ itens, rotulo, criterios }: { itens: ImovelResumo[]; rotulo: string; criterios: string }) {
  const { conjunto, plano, ehFavorito, alternarFavorito, pedirLuneta } = useImovel();
  const fila = useRef<HTMLUListElement>(null);
  const rolar = (sentido: 1 | -1) => {
    const ul = fila.current;
    if (!ul) return;
    const passo = (ul.querySelector("li")?.getBoundingClientRect().width ?? 300) + 16;
    ul.scrollBy({ left: sentido * passo, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <p className="text-[13px] leading-snug text-nevoa">
          {itens.length === 1 ? "1 imóvel em leilão" : `${itens.length} imóveis em leilão`} {criterios}; primeiro os do mesmo bairro.
        </p>
        {itens.length > 2 && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => rolar(-1)} aria-label="Ver os anteriores" className={SETA}>
              <IconeSetaEsquerda tamanho={18} />
            </button>
            <button type="button" onClick={() => rolar(1)} aria-label="Ver os próximos" className={SETA}>
              <IconeSetaDireita tamanho={18} />
            </button>
          </div>
        )}
      </div>
      <ul
        ref={fila}
        aria-label={rotulo}
        className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-4 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {itens.map((p) => (
          <li key={p.id} className="w-[min(84vw,300px)] shrink-0 snap-start sm:w-[300px]">
            <CartaoImovel
              imovel={p}
              plano={plano}
              hrefImovel={rotaImovel(conjunto, p.id, plano)}
              favorito={ehFavorito(p.id)}
              onFavoritar={alternarFavorito}
              onUpsell={pedirLuneta}
              tituloComo="h3"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
