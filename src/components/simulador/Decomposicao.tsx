"use client";

import type { LanceMaisCustos } from "@/lib/simulador/calculo";
import { moeda } from "@/lib/simulador/formato";
import { IconeLapis } from "./controles";

/**
 * id do título "A conta, linha a linha": os links "Editar custos ↓" abrem a conta, rolam até ele e põem o foco nele
 * (rodada 6, decisão 3).
 */
export const ID_CONTA = "sim-conta-titulo";
/** id da conta aberta (aria-controls do botão "Ver e editar a conta") */
export const ID_CONTA_CORPO = "sim-conta-corpo";

/**
 * "R$ 182.400 + R$ 31.208 = R$ 213.608", com o nome de cada parte embaixo (lance máximo · custos · investidos). A
 * mesma conta no cartão "Seu lance máximo", no "Meu lance" da tabela e na conta fechada (rodada 6, decisões 1 a 3):
 * os custos são os da conta linha a linha, com os ajustes da pessoa (`lanceMaisCustos`, em calculo.ts). A prazo, o
 * total não é o dinheiro investido (o saldo sai da venda): o rótulo vira "no total".
 */
export function Equacao({
  d,
  rotuloLance,
  tamanho = "md",
  className = "",
}: {
  d: LanceMaisCustos;
  /** "lance máximo", "seu lance", "preço" */
  rotuloLance: string;
  tamanho?: "md" | "sm";
  className?: string;
}) {
  const num = tamanho === "md" ? "text-[14px] sm:text-[16px]" : "text-[14px]";
  return (
    <p className={`flex flex-wrap items-start gap-x-2 gap-y-1.5 tabular-nums ${className}`}>
      <Termo valor={moeda(d.lance)} rotulo={rotuloLance} num={num} />
      <span className="inline-flex items-start gap-x-2">
        <Sinal num={num}>+</Sinal>
        <Termo valor={moeda(d.custos)} rotulo="custos" num={num} />
      </span>
      <span className="inline-flex items-start gap-x-2">
        <Sinal num={num}>=</Sinal>
        <Termo valor={moeda(d.total)} rotulo={d.aPrazo ? "no total" : "investidos"} num={num} forte />
      </span>
    </p>
  );
}

function Termo({ valor, rotulo, num, forte = false }: { valor: string; rotulo: string; num: string; forte?: boolean }) {
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className={`leading-tight whitespace-nowrap ${num} ${forte ? "font-bold text-luar" : "font-semibold text-luar"}`}>{valor}</span>
      <span className="mt-0.5 text-[11.5px] leading-tight text-nevoa">{rotulo}</span>
    </span>
  );
}

function Sinal({ children, num }: { children: string; num: string }) {
  return <span className={`leading-tight font-medium text-nevoa ${num}`}>{children}</span>;
}

/**
 * "Editar custos ↓": abre a conta linha a linha, rola até ela (no celular, troca para a aba Conta) e põe o foco nela.
 * Um botão com cara de link (faz uma ação, não navega).
 */
export function LinkEditarCustos({ aoAbrir, texto = "Editar custos", className = "" }: { aoAbrir: () => void; texto?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={`-my-1 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 px-1 text-[13px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8 ${className}`}
    >
      <IconeLapis className="size-3" />
      {texto}
      <span aria-hidden="true">↓</span>
      <span className="sr-only"> (abre a conta linha a linha)</span>
    </button>
  );
}
