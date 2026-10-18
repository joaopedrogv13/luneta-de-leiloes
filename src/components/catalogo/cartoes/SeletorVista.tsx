"use client";

import type { ReactNode } from "react";
import type { Vista } from "@/lib/catalogo/url";
import { IconeGrade, IconeLista, IconeMapa } from "./icones";

const ALTURA = "min-h-11 pointer-fine:min-h-9";

const OPCOES: { valor: Vista; rotulo: string; icone: ReactNode }[] = [
  { valor: "lista", rotulo: "Lista", icone: <IconeLista /> },
  { valor: "cards", rotulo: "Cards", icone: <IconeGrade /> },
];

/**
 * Como ver os imóveis: controle segmentado "Lista | Cards" (botões com aria-pressed, ícone + texto) e, ao
 * lado, o botão "Mapa" que liga e desliga o mapa. O ativo usa o latão (único acento do site).
 */
export function SeletorVista({
  vista,
  onVista,
  mapa,
  onMapa,
  semMapa = false,
  semMapaCelular = false,
  apenasAlternar = false,
  rotuloClassName = "",
  className = "",
}: {
  vista: Vista;
  onVista: (v: Vista) => void;
  mapa: boolean;
  onMapa: (visivel: boolean) => void;
  /** esconde o botão do mapa (ex.: tela onde o mapa não cabe) */
  semMapa?: boolean;
  /** esconde o botão do mapa só no celular (lá o mapa tem o botão flutuante) */
  semMapaCelular?: boolean;
  /** só o botão redondo que troca para a outra vista (o do celular), sem o resto */
  apenasAlternar?: boolean;
  /** classes dos rótulos ("max-lg:sr-only": só os ícones em telas médias; o nome continua para leitores de tela) */
  rotuloClassName?: string;
  className?: string;
}) {
  const outra = OPCOES.find((o) => o.valor !== vista)!;
  if (apenasAlternar) {
    return (
      <button
        type="button"
        onClick={() => onVista(outra.valor)}
        aria-label={`Ver em ${outra.rotulo.toLowerCase()}`}
        title={`Ver em ${outra.rotulo.toLowerCase()}`}
        className={`inline-flex size-12 cursor-pointer items-center justify-center rounded-full border border-nevoa/25 bg-tinta text-luar transition-colors duration-150 hover:border-nevoa/55 ${className}`}
      >
        {outra.icone}
      </button>
    );
  }
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* celular (com semMapaCelular): um botão só, que troca para a outra vista (a linha do total e de "Ordenar"
          não tem lugar para o controle inteiro) */}
      {semMapaCelular && (
        <button
          type="button"
          onClick={() => onVista(outra.valor)}
          aria-label={`Ver em ${outra.rotulo.toLowerCase()}`}
          title={`Ver em ${outra.rotulo.toLowerCase()}`}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-nevoa/25 bg-tinta text-luar transition-colors duration-150 hover:border-nevoa/55 sm:hidden"
        >
          {outra.icone}
        </button>
      )}
      <div role="group" aria-label="Ver os imóveis em" className={`inline-flex rounded-full border border-nevoa/25 bg-tinta p-1 ${semMapaCelular ? "max-sm:hidden" : ""}`}>
        {OPCOES.map((o) => {
          const ativo = vista === o.valor;
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={ativo}
              title={o.rotulo}
              onClick={() => onVista(o.valor)}
              className={`inline-flex ${ALTURA} cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13px] leading-none font-medium transition-[background-color,color,box-shadow] duration-150 ease-luneta motion-reduce:transition-none ${
                ativo
                  ? "bg-latao/15 text-latao-texto shadow-[inset_0_0_0_1px_rgba(201,162,77,.55)]"
                  : "text-nevoa hover:bg-nevoa/10 hover:text-luar"
              }`}
            >
              {o.icone}
              <span className={rotuloClassName}>{o.rotulo}</span>
            </button>
          );
        })}
      </div>
      {!semMapa && (
        <button
          type="button"
          aria-pressed={mapa}
          title="Mapa"
          onClick={() => onMapa(!mapa)}
          className={`inline-flex ${ALTURA} cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13px] leading-none font-medium transition-[background-color,border-color,color] duration-150 ease-luneta motion-reduce:transition-none ${semMapaCelular ? "max-sm:hidden" : ""} ${
            mapa ? "border-latao/70 bg-latao/15 text-latao-texto" : "border-nevoa/25 bg-tinta text-nevoa hover:border-nevoa/55 hover:text-luar"
          }`}
        >
          <IconeMapa />
          <span className={rotuloClassName}>Mapa</span>
          <span aria-hidden="true" className={`ml-0.5 inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors duration-150 ${mapa ? "bg-latao" : "bg-nevoa/30"}`}>
            <span className={`size-3 rounded-full bg-tinta shadow-sm transition-transform duration-150 ease-luneta motion-reduce:transition-none ${mapa ? "translate-x-3" : ""}`} />
          </span>
        </button>
      )}
    </div>
  );
}
