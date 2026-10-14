/**
 * Classes compartilhadas dos controles do catálogo (Tailwind). Alvos de toque de 44px no dedo e 36px
 * no mouse (`pointer-fine:`); o latão marca o que está ativo; números em `tabular-nums`.
 */

/** Pílula/chip clicável (filtros, atalhos, botões rápidos). */
export const CHIP =
  "inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-full border px-4 text-[13.5px] leading-none font-medium whitespace-nowrap transition-[background-color,border-color,color,scale,box-shadow] duration-150 ease-luneta active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 motion-reduce:transition-none pointer-fine:min-h-9 pointer-fine:px-3.5";
export const CHIP_OFF = "border-nevoa/30 text-luar hover:border-nevoa/65 hover:bg-nevoa/[0.07]";
export const CHIP_ON = "border-latao bg-latao/15 text-luar hover:bg-latao/20";
/**
 * Escolhido, mas é o "sem filtro" ("Qualquer"): sem destaque (é o padrão; o ✓ e o aria-pressed dizem que está
 * escolhido), para nunca parecer um filtro ativo nem destoar dos chips dourados.
 */
export const CHIP_NEUTRO_ON = "border-nevoa/30 text-luar hover:border-nevoa/65 hover:bg-nevoa/[0.07]";

/**
 * Caixa de texto (busca, mínimo/máximo, datas). 16 px no toque (o Safari do iPhone não dá zoom ao focar) e
 * 14 px no mouse; foco com borda e anel na cor de texto do latão (contraste ≥ 3:1 nos dois temas).
 */
export const CAMPO =
  "h-11 w-full min-w-0 rounded-xl border border-nevoa/30 bg-noite/40 px-3.5 text-base text-luar tabular-nums placeholder:text-nevoa transition-[border-color,box-shadow] duration-150 outline-none hover:border-nevoa/55 focus:border-latao-texto focus:ring-2 focus:ring-latao-texto/60 focus-visible:outline-none pointer-fine:h-10 pointer-fine:text-sm";

/** Rótulo de um campo dentro de uma seção ("Lance mínimo", "Quartos"). */
export const ROTULO = "text-[13px] leading-tight font-semibold text-luar";
/** Texto de apoio abaixo do rótulo. */
export const AJUDA = "text-xs leading-snug text-nevoa";
/** Rótulo de seção em caixa alta (eyebrow). */
export const EYEBROW = "text-[11px] leading-none font-semibold tracking-[0.14em] text-nevoa uppercase";

/** Botão de texto discreto ("Limpar", "Mostrar mais"). */
export const LINK =
  "inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-[13px] font-semibold text-latao-texto underline-offset-4 transition-colors hover:underline disabled:cursor-default disabled:text-nevoa/60 disabled:no-underline pointer-fine:min-h-8";

/** Botão redondo só com ícone (fechar, limpar busca). */
export const BOTAO_ICONE =
  "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-nevoa transition-[background-color,color] duration-150 hover:bg-nevoa/12 hover:text-luar pointer-fine:size-9";

/** Painel flutuante: sombra forte no claro, contorno no escuro. */
export const SOMBRA_PAINEL = "shadow-[0_18px_60px_rgba(7,11,22,.35)]";
