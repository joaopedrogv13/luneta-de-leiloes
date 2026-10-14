"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cursorDepois, formatarNumero, interpretar, mascarar } from "./mascara";

// ---------------------------------------------------------------------------
// Ícones de linha fina (decorativos: o texto ao lado diz o que é)
// ---------------------------------------------------------------------------

const ICONE = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function IconeOk({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" strokeWidth="1.8" {...ICONE} className={`shrink-0 ${className}`}>
      <path d="M2.3 6.3l2.4 2.4 5-5.2" />
    </svg>
  );
}

export function IconeNao({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" strokeWidth="1.8" {...ICONE} className={`shrink-0 ${className}`}>
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

export function IconeAtencao({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" strokeWidth="1.5" {...ICONE} className={`shrink-0 ${className}`}>
      <path d="M8 1.8l6.6 11.6H1.4z" />
      <path d="M8 6.2v3.3" />
      <circle cx="8" cy="11.6" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function IconeInfo({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" strokeWidth="1.5" {...ICONE} className={`shrink-0 ${className}`}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.2v4" />
      <circle cx="8" cy="4.9" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function IconeSeta({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" strokeWidth="1.6" {...ICONE} className={`shrink-0 ${className}`}>
      <path d="M3.5 5.5L7 9l3.5-3.5" />
    </svg>
  );
}

export function IconeVoltar({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" strokeWidth="1.5" {...ICONE} className={`shrink-0 ${className}`}>
      <path d="M2.6 5.2A5 5 0 1 1 2.4 8.6" />
      <path d="M2.4 2.2v3.2h3.2" />
    </svg>
  );
}

export function IconeCadeado({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" strokeWidth="1.6" {...ICONE} className={`shrink-0 ${className}`}>
      <rect x="2.5" y="6.2" width="9" height="6.3" rx="1.6" />
      <path d="M4.6 6.2V4.4a2.4 2.4 0 0 1 4.8 0v1.8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Campo numérico com máscara pt-BR
// ---------------------------------------------------------------------------

/**
 * Campo de número com máscara pt-BR ("150.000", "11,5"). Enquanto a pessoa digita, o texto fica como ela
 * escreveu (só reagrupado) e o valor vale na hora se estiver dentro da faixa; ao sair do campo (ou Enter),
 * o valor é limitado à faixa. Setas ↑/↓ somam `passo` (Shift: 10×). Vazio ao sair: `aoEsvaziar` (ou volta).
 */
export function CampoNumero({
  id,
  valor,
  aoMudar,
  aoEsvaziar,
  casas = 0,
  min = 0,
  max = 1e12,
  passo,
  prefixo,
  sufixo,
  ariaLabel,
  descritoPor,
  variante = "padrao",
  placeholder,
  className = "",
  larguraMin = 3,
}: {
  id?: string;
  valor: number | null;
  aoMudar: (n: number) => void;
  aoEsvaziar?: () => void;
  casas?: number;
  min?: number;
  max?: number;
  passo?: number;
  prefixo?: string;
  sufixo?: string;
  ariaLabel?: string;
  descritoPor?: string;
  variante?: "padrao" | "inline";
  placeholder?: string;
  className?: string;
  /** largura mínima (em caracteres) na variante inline */
  larguraMin?: number;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const cursor = useRef<number | null>(null);
  // texto ao entrar no campo: sair (ou Enter) sem mexer não grava nada. Sem isso, um valor com mais casas do
  // que o campo mostra (62,4 m² num campo de inteiros, lance com centavos) virava "ajuste" só de passar o Tab.
  const aoEntrar = useRef<string | null>(null);

  // devolve o cursor ao lugar certo depois da máscara reagrupar os milhares
  useLayoutEffect(() => {
    const el = input.current;
    if (cursor.current !== null && el && document.activeElement === el) el.setSelectionRange(cursor.current, cursor.current);
    cursor.current = null;
  });

  const exibido = rascunho ?? (valor === null ? "" : formatarNumero(valor, casas));
  const limitar = (n: number) => Math.min(max, Math.max(min, n));

  const confirmar = (texto: string) => {
    const n = interpretar(texto);
    if (n === null) {
      aoEsvaziar?.();
      return null;
    }
    const c = limitar(n);
    aoMudar(c);
    return c;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (rascunho === null || rascunho === aoEntrar.current) return;
      const c = confirmar(rascunho);
      const texto = c === null ? null : formatarNumero(c, casas);
      aoEntrar.current = texto;
      setRascunho(texto);
      return;
    }
    if (!passo || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const base = interpretar(exibido) ?? valor ?? 0;
    const delta = (e.key === "ArrowUp" ? 1 : -1) * passo * (e.shiftKey ? 10 : 1);
    const c = limitar(Math.round((base + delta) * 1e6) / 1e6);
    aoMudar(c);
    const texto = formatarNumero(c, casas);
    aoEntrar.current = texto;
    setRascunho(texto);
  };

  const lido = rascunho !== null ? interpretar(rascunho) : null;
  const foraDaFaixa = lido !== null && (lido < min || lido > max);
  const inline = variante === "inline";
  const caixa = inline
    ? "h-11 pointer-fine:h-9 rounded-full border border-latao/60 bg-latao/10 px-3 text-latao-texto font-semibold hover:bg-latao/15"
    : "h-11 pointer-fine:h-10 rounded-xl border border-nevoa/30 bg-noite px-3 hover:border-nevoa/50";

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 transition-colors focus-within:border-latao-texto focus-within:ring-2 focus-within:ring-latao/35 ${caixa} ${
        foraDaFaixa ? "!border-grave focus-within:!ring-grave/35" : ""
      } ${className}`}
      title={foraDaFaixa ? `Use um valor entre ${formatarNumero(min, casas)} e ${formatarNumero(max, casas)}` : undefined}
      onClick={() => input.current?.focus()}
    >
      {prefixo && (
        <span className={`shrink-0 text-[13px] ${inline ? "" : "text-nevoa"}`} aria-hidden="true">
          {prefixo}
        </span>
      )}
      <input
        ref={input}
        id={id}
        type="text"
        inputMode={casas > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        aria-describedby={descritoPor}
        aria-invalid={foraDaFaixa || undefined}
        placeholder={placeholder}
        value={exibido}
        onFocus={() => {
          aoEntrar.current = exibido;
          setRascunho(exibido);
        }}
        onBlur={() => {
          if (rascunho !== null && rascunho !== aoEntrar.current) confirmar(rascunho);
          aoEntrar.current = null;
          setRascunho(null);
        }}
        onChange={(e) => {
          const bruto = e.target.value;
          const pos = e.target.selectionStart ?? bruto.length;
          const novo = mascarar(bruto, casas);
          cursor.current = cursorDepois(bruto, pos, novo, casas);
          setRascunho(novo);
          const n = interpretar(novo);
          if (n !== null && n >= min && n <= max) aoMudar(n);
        }}
        onKeyDown={onKeyDown}
        style={inline ? { width: `${Math.max(larguraMin, exibido.length + 0.5)}ch` } : undefined}
        className={`min-w-0 bg-transparent text-[15px] tabular-nums outline-none placeholder:text-nevoa/70 focus-visible:outline-none ${
          inline ? "text-center font-semibold" : "w-full flex-1 text-right font-medium"
        }`}
      />
      {sufixo && (
        <span className={`shrink-0 text-[13px] ${inline ? "" : "text-nevoa"}`} aria-hidden="true">
          {sufixo}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Controle deslizante
// ---------------------------------------------------------------------------

export function Deslizante({
  valor,
  aoMudar,
  min,
  max,
  passo,
  ariaLabel,
  textoValor,
  className = "",
}: {
  valor: number;
  aoMudar: (n: number) => void;
  min: number;
  max: number;
  passo: number;
  ariaLabel: string;
  /** o valor como deve ser lido ("15%") */
  textoValor: string;
  className?: string;
}) {
  const p = max > min ? ((Math.min(max, Math.max(min, valor)) - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={passo}
      value={Math.min(max, Math.max(min, valor))}
      onChange={(e) => aoMudar(Number(e.target.value))}
      aria-label={ariaLabel}
      aria-valuetext={textoValor}
      style={{ "--p": `${p}%` } as CSSProperties}
      className={`deslizante h-11 w-full min-w-0 cursor-pointer appearance-none bg-transparent pointer-fine:h-9 ${CLASSE_DESLIZANTE} ${className}`}
    />
  );
}

/** Trilho em duas cores (preenchido até o valor) e polegar de latão com anel na cor da superfície. */
const CLASSE_DESLIZANTE = [
  "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full",
  "[&::-webkit-slider-runnable-track]:[background:linear-gradient(to_right,#c9a24d_var(--p),color-mix(in_srgb,var(--nevoa)_32%,transparent)_var(--p))]",
  "[&::-webkit-slider-thumb]:-mt-[7px] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
  "[&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-tinta [&::-webkit-slider-thumb]:bg-latao",
  "[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(201,162,77,.6)] [&::-webkit-slider-thumb]:transition-transform",
  "active:[&::-webkit-slider-thumb]:scale-110",
  "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-nevoa/30",
  "[&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-latao",
  "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-tinta [&::-moz-range-thumb]:bg-latao",
  "focus-visible:outline-offset-2",
].join(" ");

// ---------------------------------------------------------------------------
// Grupo de opções (rádio com cara de botões)
// ---------------------------------------------------------------------------

export function Segmentado<T extends string>({
  nome,
  legenda,
  valor,
  opcoes,
  aoMudar,
  legendaVisivel = false,
  tamanho = "md",
  className = "",
}: {
  nome: string;
  legenda: string;
  valor: T;
  opcoes: { valor: T; rotulo: ReactNode; detalhe?: ReactNode }[];
  aoMudar: (v: T) => void;
  legendaVisivel?: boolean;
  tamanho?: "md" | "sm";
  className?: string;
}) {
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className={legendaVisivel ? "mb-2 text-[14px] font-semibold" : "sr-only"}>{legenda}</legend>
      <div className="flex w-full gap-1 rounded-2xl border border-nevoa/25 bg-noite p-1">
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className={`relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl px-2 text-center transition-colors duration-150 select-none has-checked:bg-latao has-checked:text-noite-fixa has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-latao-texto motion-reduce:transition-none ${
              tamanho === "sm" ? "min-h-11 py-1.5 pointer-fine:min-h-9" : "min-h-11 py-2"
            } ${o.valor === valor ? "" : "text-luar hover:bg-nevoa/10"}`}
          >
            {/* invisível mas do tamanho da opção (e não sr-only, de 1 px): ao receber o foco, o navegador rola a
                opção inteira para a vista, respeitando as barras fixas */}
            <input
              type="radio"
              name={nome}
              value={o.valor}
              checked={o.valor === valor}
              onChange={() => aoMudar(o.valor)}
              className="absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-xl opacity-0"
            />
            <span className={`leading-tight font-semibold ${tamanho === "sm" ? "text-[13px]" : "text-[14px]"}`}>{o.rotulo}</span>
            {o.detalhe && <span className={`mt-0.5 text-[11px] leading-tight ${o.valor === valor ? "text-noite-fixa/75" : "text-nevoa"}`}>{o.detalhe}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Interruptor (sim/não)
// ---------------------------------------------------------------------------

export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  descricao,
  id,
}: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: ReactNode;
  descricao?: ReactNode;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span id={`${id}-rotulo`} className="block text-[14px] font-semibold">
          {rotulo}
        </span>
        {descricao && (
          <span id={`${id}-desc`} className="mt-1 block text-[12.5px] leading-relaxed text-nevoa">
            {descricao}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-labelledby={`${id}-rotulo`}
        aria-describedby={descricao ? `${id}-desc` : undefined}
        onClick={() => aoMudar(!ligado)}
        className="grid h-11 w-14 shrink-0 cursor-pointer place-items-center pointer-fine:h-9"
      >
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 rounded-full border transition-colors duration-200 motion-reduce:transition-none ${
            ligado ? "border-latao bg-latao" : "border-nevoa/40 bg-nevoa/15"
          }`}
        >
          <span
            className={`absolute top-1/2 left-0.5 size-[22px] -translate-y-1/2 rounded-full shadow-sm transition-transform duration-200 ease-luneta motion-reduce:transition-none ${
              ligado ? "translate-x-5 bg-noite-fixa" : "bg-luar"
            }`}
          />
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seletor dentro de uma frase ("vendendo em [12 meses ▾]")
// ---------------------------------------------------------------------------

export function SeletorInline<T extends string>({
  valor,
  opcoes,
  aoMudar,
  ariaLabel,
  id,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  aoMudar: (v: T) => void;
  ariaLabel: string;
  id?: string;
}) {
  return (
    <span className="relative inline-flex align-middle">
      <select
        id={id}
        value={valor}
        aria-label={ariaLabel}
        onChange={(e) => aoMudar(e.target.value as T)}
        className="field-sizing-content h-11 cursor-pointer appearance-none rounded-full border border-latao/60 bg-latao/10 pr-8 pl-3 text-[15px] leading-none font-semibold text-latao-texto transition-colors hover:bg-latao/15 focus-visible:border-latao pointer-fine:h-9"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-tinta text-luar">
            {o.rotulo}
          </option>
        ))}
      </select>
      <IconeSeta className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-latao-texto" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Campo com rótulo, ajuda e "voltar ao padrão"
// ---------------------------------------------------------------------------

export function Campo({
  id,
  rotulo,
  ajuda,
  alterado = false,
  padrao,
  aoRestaurar,
  children,
  grupo = false,
  aviso,
}: {
  id: string;
  rotulo: ReactNode;
  ajuda?: ReactNode;
  alterado?: boolean;
  /** o padrão por extenso, para o botão ("5%") */
  padrao?: string;
  aoRestaurar?: () => void;
  children: ReactNode;
  /** vários controles: vira fieldset com legenda em vez de label */
  grupo?: boolean;
  aviso?: ReactNode;
}) {
  const cabecalho = (
    <span className="flex items-center gap-2 text-[14px] leading-snug font-semibold">
      {rotulo}
      {alterado && (
        <span className="inline-flex items-center gap-1 rounded-full bg-latao/15 px-2 py-0.5 text-[11px] font-semibold text-latao-texto">ajustado</span>
      )}
    </span>
  );
  const restaurar = alterado && aoRestaurar && (
    <button
      type="button"
      onClick={aoRestaurar}
      className="-my-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-1 text-[12.5px] font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
    >
      <IconeVoltar />
      voltar ao padrão{padrao ? ` (${padrao})` : ""}
    </button>
  );
  const corpo = (
    <>
      <div className="mt-2.5">{children}</div>
      {aviso && <div className="mt-2.5">{aviso}</div>}
      {ajuda && (
        <p id={`${id}-ajuda`} className="mt-2 text-[12.5px] leading-relaxed text-nevoa">
          {ajuda}
        </p>
      )}
    </>
  );
  if (grupo) {
    return (
      <fieldset className="min-w-0 border-t border-nevoa/15 py-4 first:border-t-0 first:pt-1">
        {/* a legenda precisa ser o primeiro filho do fieldset; flutuando, ela divide a linha com o botão */}
        <legend className="float-left mr-3 py-0.5">{cabecalho}</legend>
        {restaurar && <span className="float-right">{restaurar}</span>}
        <div className="clear-both">{corpo}</div>
      </fieldset>
    );
  }
  return (
    <div className="min-w-0 border-t border-nevoa/15 py-4 first:border-t-0 first:pt-1">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={id}>{cabecalho}</label>
        {restaurar}
      </div>
      {corpo}
    </div>
  );
}

/** Caixa de alerta (atenção) ou informação, sempre com ícone e texto. */
export function Aviso({ tom = "atencao", children, className = "" }: { tom?: "atencao" | "info"; children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] leading-relaxed ${
        tom === "atencao" ? "border-aten/45 bg-aten/10" : "border-nevoa/25 bg-nevoa/8"
      } ${className}`}
    >
      {tom === "atencao" ? <IconeAtencao className="mt-0.5 text-aten" /> : <IconeInfo className="mt-0.5 text-nevoa" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** id do rótulo "Seu lance máximo" (recebe o foco quando o controle que a pessoa usou some da tela). */
export const FOCO_RESULTADO = "sim-resposta";

/** Foca um elemento pelo id, se ele existir. */
export function focar(id: string) {
  document.getElementById(id)?.focus();
}

/**
 * Campo para pedir um dado que falta (área, dívidas, valor de venda): só vale quando a pessoa confirma
 * (botão "Usar" ou Enter). Assim o bloco que pede o dado não some no meio da digitação.
 */
export function CampoPedido({
  id,
  ariaLabel,
  descritoPor,
  prefixo,
  sufixo,
  placeholder,
  min,
  max,
  aoConfirmar,
  casas = 0,
  className = "",
  larguraCampo = "w-full sm:w-44",
}: {
  id?: string;
  ariaLabel?: string;
  descritoPor?: string;
  prefixo?: string;
  sufixo?: string;
  placeholder?: string;
  min: number;
  max: number;
  aoConfirmar: (n: number) => void;
  /** casas decimais aceitas (área: 2) */
  casas?: number;
  className?: string;
  larguraCampo?: string;
}) {
  const [valor, setValor] = useState<number | null>(null);
  return (
    <form
      className={`flex items-center gap-2 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (valor === null) return;
        aoConfirmar(Math.min(max, Math.max(min, valor)));
        // o pedido costuma sumir depois de atendido (e o foco iria para o <body>): leva o foco ao resultado
        requestAnimationFrame(() => {
          const ativo = document.activeElement;
          if (!ativo || ativo === document.body) focar(FOCO_RESULTADO);
        });
      }}
    >
      <CampoNumero
        id={id}
        valor={valor}
        aoMudar={setValor}
        aoEsvaziar={() => setValor(null)}
        casas={casas}
        min={min}
        max={max}
        prefixo={prefixo}
        sufixo={sufixo}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        descritoPor={descritoPor}
        className={`min-w-0 flex-1 sm:flex-none ${larguraCampo}`}
      />
      <button
        type="submit"
        disabled={valor === null}
        className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-xl bg-latao px-4 text-[14px] font-semibold text-noite-fixa transition-opacity disabled:cursor-not-allowed disabled:opacity-40 pointer-fine:h-10"
      >
        Usar
      </button>
    </form>
  );
}
