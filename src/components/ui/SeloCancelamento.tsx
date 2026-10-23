import { CANCELAMENTO } from "@/content/site";

/** Escudo com o visto: o mesmo desenho em todos os botões de assinar. */
function IconeEscudo({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M12 3.2 19 6v5.2c0 4.3-2.9 8.1-7 9.6-4.1-1.5-7-5.3-7-9.6V6z" />
      <path d="m8.8 12.1 2.2 2.2 4.3-4.4" />
    </svg>
  );
}

/**
 * Selo "Cancele grátis em até 7 dias" (rodada 5, ponto 13), perto de cada botão de assinar: no hero, nos cartões dos
 * planos, na chamada final e na barra do celular. Componente do servidor (sem estado), usado também por ilhas de cliente.
 * - "pilula": contorno em latão, para ficar sob o botão principal (hero, chamada final);
 * - "linha": só o ícone e o texto, centrado sob o botão de cada plano;
 * - "botao": a segunda linha do botão "Ver planos" da barra do celular (texto curto, na cor do botão).
 * O texto é a regra inteira; não prometer nada além disso (reembolso de outra forma, prazo maior).
 */
export function SeloCancelamento({ variante = "pilula", className = "" }: { variante?: "pilula" | "linha" | "botao"; className?: string }) {
  if (variante === "botao") {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] leading-none font-medium opacity-85 ${className}`}>
        <IconeEscudo size={12} />
        {CANCELAMENTO.curto}
      </span>
    );
  }
  if (variante === "linha") {
    return (
      <p className={`flex items-center gap-1.5 text-[13px] leading-snug font-medium text-luar ${className}`}>
        <span className="text-latao-texto">
          <IconeEscudo size={15} />
        </span>
        {CANCELAMENTO.selo}
      </p>
    );
  }
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full border border-latao/45 bg-latao/10 py-1.5 pr-3.5 pl-2.5 text-[13px] leading-none font-semibold text-luar ${className}`}
    >
      <span className="text-latao-texto">
        <IconeEscudo size={16} />
      </span>
      {CANCELAMENTO.selo}
    </p>
  );
}
