"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  arredondarBonito,
  formatarDigitado,
  lerNumeroDigitado,
  mascararDigitando,
  textoFaixa,
  valorCurto,
  type FormatoFaixa,
} from "@/lib/catalogo/filtros-rotulos";
import { numero } from "@/lib/catalogo/rotulos";
import type { Histograma } from "@/lib/catalogo/tipos";
import { CHIP, CHIP_OFF, CHIP_ON } from "./estilos";

export interface AtalhoFaixa {
  rotulo: string;
  min?: number;
  max?: number;
}

type Cursor = "lo" | "hi";
/**
 * Gesto em andamento. No mouse vale na hora (`decidido`); no dedo, só depois que o movimento mostra a
 * intenção de arrastar DE LADO: quem rola a folha começando o gesto em cima do histograma não pode
 * escolher uma faixa sem querer (o rolar vertical fica com o navegador: `touch-action: pan-y`).
 * Toque simples (sem arrastar) vale ao soltar.
 */
type Gesto = { x0: number; y0: number; decidido: boolean };
type Arraste =
  | (Gesto & { tipo: Cursor; p0: number; noCursor: boolean })
  | (Gesto & { tipo: "barras"; ancora: number; desfazer: boolean; moveu: boolean });

/** Movimento horizontal (px) que transforma um toque em arraste. */
const INTENCAO = 8;

/** O dedo andou mais de lado que para cima/baixo, e o bastante? */
function intencaoLateral(g: Gesto, e: PointerEvent) {
  const dx = Math.abs(e.clientX - g.x0);
  const dy = Math.abs(e.clientY - g.y0);
  return dx >= INTENCAO && dx > dy;
}

const ADORNO: Record<FormatoFaixa, { antes?: string; depois?: string }> = {
  moeda: { antes: "R$" },
  moedaM2: { antes: "R$", depois: "/m²" },
  pct: { depois: "%" },
  m2: { depois: "m²" },
};

const maiusc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Posição (0…n, em barras) ↔ valor, linear dentro de cada barra (as barras podem ter larguras diferentes). */
function criarEscala(h: Histograma | null) {
  const L = h?.limites ?? [];
  const n = Math.max(0, L.length - 1);
  const valor = (p: number) => {
    if (!n) return 0;
    const q = Math.max(0, Math.min(n, p));
    const i = Math.min(n - 1, Math.floor(q));
    return L[i] + (q - i) * (L[i + 1] - L[i]);
  };
  const posicao = (v: number) => {
    if (!n) return 0;
    if (v <= L[0]) return 0;
    if (v >= L[n]) return n;
    let i = 0;
    while (i < n - 1 && v > L[i + 1]) i++;
    const largura = L[i + 1] - L[i];
    return i + (largura > 0 ? (v - L[i]) / largura : 0);
  };
  return { n, valor, posicao, L };
}

/**
 * Faixa de valores com histograma (lance, avaliação, deságio, R$/m², área):
 * - barrinhas com quantos imóveis há em cada faixa; tocar numa barra escolhe aquela faixa, arrastar
 *   sobre várias escolhe o intervalo (tocar de novo na mesma desfaz);
 * - dois cursores (teclado: setas, PageUp/PageDown, Home/End); no canto esquerdo = sem mínimo, no
 *   direito = sem máximo;
 * - campos mínimo/máximo para digitar ("300 mil", "1,5 mi", "300.000"), com R$, m² ou % no campo;
 * - atalhos ("até R$ 200 mil").
 * Emite `onChange` a cada mudança; quem usa decide se espera (pop-ups esperam 300 ms) ou não (rascunho).
 */
export function CampoFaixa({
  rotulo,
  histograma,
  min,
  max,
  onChange,
  formato,
  atalhos = [],
  rotuloVisivel = true,
  unidadeContagem = ["imóvel", "imóveis"],
}: {
  rotulo: string;
  histograma: Histograma | null;
  min?: number;
  max?: number;
  onChange: (min: number | undefined, max: number | undefined) => void;
  formato: FormatoFaixa;
  atalhos?: readonly AtalhoFaixa[];
  /** false no pop-up, que já tem título */
  rotuloVisivel?: boolean;
  unidadeContagem?: readonly [string, string];
}) {
  const id = useId();
  const [lo, setLo] = useState(min);
  const [hi, setHi] = useState(max);
  const [anterior, setAnterior] = useState({ min, max });
  const [textoMin, setTextoMin] = useState(formatarDigitado(min));
  const [textoMax, setTextoMax] = useState(formatarDigitado(max));
  const [focado, setFocado] = useState<Cursor | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState<Cursor | null>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const barras = useRef<HTMLDivElement>(null);
  const arraste = useRef<Arraste | null>(null);

  // valor novo vindo de fora (pílula removida, "Limpar", URL): o controle acompanha
  if (anterior.min !== min || anterior.max !== max) {
    setAnterior({ min, max });
    if (min !== lo || max !== hi) {
      setLo(min);
      setHi(max);
      if (focado !== "lo") setTextoMin(formatarDigitado(min));
      if (focado !== "hi") setTextoMax(formatarDigitado(max));
    }
  }

  const { n, valor, posicao, L } = criarEscala(histograma);
  const totais = histograma?.totais ?? [];
  const maior = Math.max(1, ...totais);
  const posLo = lo === undefined ? 0 : posicao(lo);
  const posHi = hi === undefined ? n : posicao(hi);
  const pct = (p: number) => (n ? (p / n) * 100 : 0);
  const adorno = ADORNO[formato];

  const emitir = (a: number | undefined, b: number | undefined, opts: { manterTexto?: Cursor } = {}) => {
    setLo(a);
    setHi(b);
    if (opts.manterTexto !== "lo") setTextoMin(formatarDigitado(a));
    if (opts.manterTexto !== "hi") setTextoMax(formatarDigitado(b));
    onChange(a, b);
  };

  /** Move um cursor para a posição p (em barras), com valor redondo e sem cruzar o outro. */
  const moverCursor = (qual: Cursor, p: number) => {
    if (!n) return;
    if (qual === "lo") {
      if (p <= 0.02) return emitir(undefined, hi);
      const v = Math.min(arredondarBonito(valor(p), formato), hi ?? Infinity);
      return emitir(v <= L[0] ? undefined : v, hi);
    }
    if (p >= n - 0.02) return emitir(lo, undefined);
    const v = Math.max(arredondarBonito(valor(p), formato), lo ?? -Infinity);
    return emitir(lo, v >= L[n] ? undefined : v);
  };

  const posDoPonteiro = (e: PointerEvent, el: HTMLElement | null) => {
    const r = el?.getBoundingClientRect();
    if (!r || !r.width) return 0;
    return ((e.clientX - r.left) / r.width) * n;
  };

  // ---- trilho e cursores ----
  const focarCursor = (qual: Cursor) => document.getElementById(`${id}-${qual}`)?.focus({ preventScroll: true });

  const noTrilhoDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!n || e.button !== 0) return;
    const p = posDoPonteiro(e, trilho.current);
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-cursor]")?.dataset.cursor as Cursor | undefined;
    const dLo = Math.abs(p - posLo);
    const dHi = Math.abs(p - posHi);
    // o cursor mais perto; empatados (um sobre o outro), o lado do toque decide
    const qual: Cursor = alvo ?? (dLo < dHi ? "lo" : dLo > dHi ? "hi" : p < posLo ? "lo" : "hi");
    const mouse = e.pointerType === "mouse";
    arraste.current = { tipo: qual, p0: p, noCursor: !!alvo, x0: e.clientX, y0: e.clientY, decidido: mouse };
    if (!mouse) return; // dedo: espera a intenção (arrastar de lado) ou o toque simples (ao soltar)
    setArrastando(qual);
    e.currentTarget.setPointerCapture(e.pointerId);
    focarCursor(qual);
    if (!alvo) moverCursor(qual, p);
    e.preventDefault();
  };
  const noTrilhoMove = (e: PointerEvent<HTMLDivElement>) => {
    const a = arraste.current;
    if (!a || a.tipo === "barras") return;
    if (!a.decidido) {
      if (!intencaoLateral(a, e)) return;
      a.decidido = true;
      setArrastando(a.tipo);
      e.currentTarget.setPointerCapture(e.pointerId);
      focarCursor(a.tipo);
    }
    moverCursor(a.tipo, posDoPonteiro(e, trilho.current));
  };
  const noTrilhoUp = () => {
    const a = arraste.current;
    arraste.current = null;
    setArrastando(null);
    // toque simples no trilho (dedo): leva o cursor mais perto até ali
    if (a && a.tipo !== "barras" && !a.decidido) {
      focarCursor(a.tipo);
      if (!a.noCursor) moverCursor(a.tipo, a.p0);
    }
  };
  // o navegador ficou com o gesto (rolagem): nada muda
  const noTrilhoCancel = () => {
    arraste.current = null;
    setArrastando(null);
  };

  const noCursorTecla = (qual: Cursor) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const atual = qual === "lo" ? posLo : posHi;
    let p: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") p = atual + 0.25;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") p = atual - 0.25;
    else if (e.key === "PageUp") p = atual + Math.max(1, n / 5);
    else if (e.key === "PageDown") p = atual - Math.max(1, n / 5);
    else if (e.key === "Home") p = qual === "lo" ? 0 : posLo;
    else if (e.key === "End") p = qual === "lo" ? posHi : n;
    if (p === null) return;
    e.preventDefault();
    // valores redondos podem "grudar" no mesmo número: anda até mudar
    const antes = qual === "lo" ? lo : hi;
    const dir = Math.sign(p - atual) || 1;
    let tentativa = p;
    for (let k = 0; k < 12; k++) {
      const v = tentativa <= 0 ? undefined : tentativa >= n ? undefined : arredondarBonito(valor(tentativa), formato);
      if (v !== antes || tentativa <= 0 || tentativa >= n) break;
      tentativa += dir * 0.25;
    }
    moverCursor(qual, tentativa);
  };

  // ---- barras ----
  const barraDoPonteiro = (e: PointerEvent) => Math.max(0, Math.min(n - 1, Math.floor(posDoPonteiro(e, barras.current))));
  const escolherBarras = (a: number, b: number) => {
    const i = Math.min(a, b);
    const j = Math.max(a, b) + 1;
    // limites redondos (a URL e a pílula ficam legíveis: "R$ 105 mil", não "R$ 103.019")
    emitir(i === 0 ? undefined : arredondarBonito(L[i], formato), j >= n ? undefined : arredondarBonito(L[j], formato));
  };
  const nasBarrasDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!n || e.button !== 0) return;
    const i = barraDoPonteiro(e);
    const jaEra =
      (i === 0 ? lo === undefined : lo === arredondarBonito(L[i], formato)) && (i + 1 >= n ? hi === undefined : hi === arredondarBonito(L[i + 1], formato));
    const mouse = e.pointerType === "mouse";
    arraste.current = { tipo: "barras", ancora: i, desfazer: jaEra, moveu: false, x0: e.clientX, y0: e.clientY, decidido: mouse };
    if (!mouse) return; // dedo: só escolhe ao soltar (toque) ou depois de arrastar de lado
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!jaEra) escolherBarras(i, i);
    e.preventDefault();
  };
  const nasBarrasMove = (e: PointerEvent<HTMLDivElement>) => {
    const i = barraDoPonteiro(e);
    const a = arraste.current;
    if (e.pointerType === "mouse" || a?.decidido) {
      if (sobre !== i) setSobre(i);
    }
    if (!a || a.tipo !== "barras") return;
    if (!a.decidido) {
      if (!intencaoLateral(a, e)) return;
      a.decidido = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setSobre(i);
    }
    if (i !== a.ancora || a.moveu) {
      a.moveu = true;
      escolherBarras(a.ancora, i);
    }
  };
  const nasBarrasUp = () => {
    const a = arraste.current;
    arraste.current = null;
    if (!a || a.tipo !== "barras") return;
    if (!a.decidido) {
      // toque simples (dedo): escolhe a barra, ou desfaz se ela já era a faixa escolhida
      setSobre(null);
      if (a.desfazer) emitir(undefined, undefined);
      else escolherBarras(a.ancora, a.ancora);
      return;
    }
    if (a.desfazer && !a.moveu) emitir(undefined, undefined);
  };
  // o navegador ficou com o gesto (a pessoa estava rolando a página): nada muda
  const nasBarrasCancel = () => {
    arraste.current = null;
    setSobre(null);
  };

  // ---- campos digitáveis ----
  const digitar = (qual: Cursor, texto: string) => {
    const mascarado = mascararDigitando(texto, formato === "pct");
    if (qual === "lo") setTextoMin(mascarado);
    else setTextoMax(mascarado);
    // "300 m" está a caminho de "300 mil": não aplica 300 milhões no meio da digitação (ao sair do
    // campo, "300 m" vale milhões)
    if (/\dm$/i.test(mascarado.replace(/\s/g, ""))) return;
    const v = mascarado.trim() === "" ? undefined : lerNumeroDigitado(mascarado);
    if (mascarado.trim() !== "" && v === undefined) return;
    const a = qual === "lo" ? v : lo;
    const b = qual === "hi" ? v : hi;
    if (a !== undefined && b !== undefined && a > b) {
      // espera terminar de digitar ("3" a caminho de "300.000")
      if (qual === "lo") setLo(v);
      else setHi(v);
      return;
    }
    emitir(a, b, { manterTexto: qual });
  };
  const confirmar = () => {
    setFocado(null);
    const a = textoMin.trim() === "" ? undefined : (lerNumeroDigitado(textoMin) ?? lo);
    const b = textoMax.trim() === "" ? undefined : (lerNumeroDigitado(textoMax) ?? hi);
    if (a !== undefined && b !== undefined && a > b) emitir(b, a);
    else if (a !== lo || b !== hi || textoMin !== formatarDigitado(a) || textoMax !== formatarDigitado(b)) emitir(a, b);
  };

  // ---- textos ----
  const resumo = textoFaixa(lo, hi, formato);
  const leitura =
    sobre !== null && n
      ? `${valorCurto(L[sobre], formato)} a ${valorCurto(L[sobre + 1], formato)} · ${numero(totais[sobre] ?? 0)} ${totais[sobre] === 1 ? unidadeContagem[0] : unidadeContagem[1]}`
      : resumo
        ? maiusc(resumo)
        : formato === "pct"
          ? "Qualquer deságio"
          : "Qualquer valor";
  const textoCursor = (qual: Cursor) => {
    const v = qual === "lo" ? lo : hi;
    if (v === undefined) return qual === "lo" ? "sem mínimo" : "sem máximo";
    return valorCurto(v, formato);
  };
  const ativo = lo !== undefined || hi !== undefined;

  return (
    <div role="group" aria-labelledby={`${id}-rotulo`} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span id={`${id}-rotulo`} className={rotuloVisivel ? "text-[13px] leading-tight font-semibold text-luar" : "sr-only"}>
          {rotulo}
        </span>
        <span
          className={`min-w-0 truncate text-right font-display text-[15px] leading-tight font-semibold tabular-nums transition-colors duration-150 ${
            sobre !== null ? "text-luar" : ativo ? "text-latao-texto" : "text-nevoa"
          } ${rotuloVisivel ? "" : "mr-auto text-left"}`}
          aria-hidden="true"
        >
          {leitura}
        </span>
      </div>

      {n > 0 ? (
        <div className="flex flex-col">
          {/* histograma: só ponteiro (o teclado usa os cursores e os campos) */}
          <div
            ref={barras}
            aria-hidden="true"
            onPointerDown={nasBarrasDown}
            onPointerMove={nasBarrasMove}
            onPointerUp={nasBarrasUp}
            onPointerCancel={nasBarrasCancel}
            onPointerLeave={() => setSobre(null)}
            className="flex h-16 cursor-pointer touch-pan-y items-end gap-[2px] px-0 select-none"
          >
            {totais.map((t, i) => {
              const dentro = Math.min(i + 1, posHi) - Math.max(i, posLo) >= 0.5;
              const h = t > 0 ? Math.max(4, (t / maior) * 100) : 0;
              return (
                <div key={i} className="flex h-full flex-1 items-end">
                  <div
                    style={{ height: `${h}%` }}
                    className={`w-full rounded-t-[3px] transition-[background-color,filter] duration-150 motion-reduce:transition-none ${
                      !ativo
                        ? sobre === i
                          ? "bg-latao/80"
                          : "bg-latao/45"
                        : dentro
                          ? sobre === i
                            ? "bg-latao brightness-110"
                            : "bg-latao"
                          : sobre === i
                            ? "bg-nevoa/55"
                            : "bg-nevoa/30"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* trilho com dois cursores */}
          <div
            ref={trilho}
            onPointerDown={noTrilhoDown}
            onPointerMove={noTrilhoMove}
            onPointerUp={noTrilhoUp}
            onPointerCancel={noTrilhoCancel}
            className="relative mx-0 h-11 cursor-pointer touch-pan-y select-none pointer-fine:h-8"
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-nevoa/25" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-latao"
              style={{ left: `${pct(posLo)}%`, width: `${Math.max(0, pct(posHi) - pct(posLo))}%` }}
            />
            {(["lo", "hi"] as const).map((qual) => {
              const p = qual === "lo" ? posLo : posHi;
              const v = qual === "lo" ? lo : hi;
              return (
                <div
                  key={qual}
                  id={`${id}-${qual}`}
                  data-cursor={qual}
                  role="slider"
                  tabIndex={0}
                  aria-label={`${rotulo}, ${qual === "lo" ? "de" : "até"}`}
                  // o valor escolhido pode ficar fora do histograma desta busca (filtro digitado, URL)
                  aria-valuemin={Math.round(Math.min(L[0], lo ?? L[0], hi ?? L[0]))}
                  aria-valuemax={Math.round(Math.max(L[n], lo ?? L[n], hi ?? L[n]))}
                  aria-valuenow={Math.round(v ?? (qual === "lo" ? L[0] : L[n]))}
                  aria-valuetext={textoCursor(qual)}
                  onKeyDown={noCursorTecla(qual)}
                  style={{ left: `${pct(p)}%`, zIndex: qual === "lo" && posLo > n - 0.5 ? 2 : 1 }}
                  className="group/c absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:outline-none pointer-fine:size-8"
                >
                  <span
                    className={`block size-[22px] rounded-full border-2 border-latao bg-tinta shadow-[0_2px_8px_rgba(7,11,22,.35)] transition-[scale,box-shadow] duration-150 group-hover/c:scale-110 group-focus-visible/c:shadow-[0_0_0_4px_rgba(201,162,77,.35)] motion-reduce:transition-none ${
                      arrastando === qual ? "scale-110 shadow-[0_0_0_6px_rgba(201,162,77,.25)]" : ""
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[11.5px] text-nevoa tabular-nums" aria-hidden="true">
            <span>{valorCurto(L[0], formato)}</span>
            <span>{valorCurto(L[n], formato)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-nevoa">Sem dados suficientes para o gráfico nesta busca: digite os valores.</p>
      )}

      <div className="flex items-end gap-2">
        {(["lo", "hi"] as const).map((qual, k) => (
          <div key={qual} className="contents">
            {k === 1 && (
              <span aria-hidden="true" className="mb-3 text-nevoa pointer-fine:mb-2.5">
                –
              </span>
            )}
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-nevoa">{qual === "lo" ? "De" : "Até"}</span>
              <span className="group/campo relative flex h-11 items-center rounded-xl border border-nevoa/30 bg-noite/40 transition-[border-color,box-shadow] duration-150 focus-within:border-latao focus-within:shadow-[0_0_0_3px_rgba(201,162,77,.22)] hover:border-nevoa/55 pointer-fine:h-10">
                {adorno.antes && <span className="pl-3 text-sm text-nevoa">{adorno.antes}</span>}
                <input
                  type="text"
                  inputMode={formato === "pct" ? "text" : "numeric"}
                  autoComplete="off"
                  enterKeyHint="done"
                  aria-label={`${rotulo}, ${qual === "lo" ? "de" : "até"}`}
                  placeholder="Qualquer"
                  value={qual === "lo" ? textoMin : textoMax}
                  onFocus={() => setFocado(qual)}
                  onBlur={confirmar}
                  onChange={(e) => digitar(qual, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmar();
                    }
                  }}
                  className="h-full w-full min-w-0 bg-transparent px-2 text-[15px] text-luar tabular-nums outline-none placeholder:text-nevoa/75 focus-visible:outline-none pointer-fine:text-sm"
                />
                {adorno.depois && <span className="pr-3 text-sm whitespace-nowrap text-nevoa">{adorno.depois}</span>}
              </span>
            </label>
          </div>
        ))}
      </div>

      {atalhos.length > 0 && (
        <div role="group" aria-label={`Atalhos de ${rotulo.toLowerCase()}`} className="flex flex-wrap gap-2">
          {atalhos.map((a) => {
            const on = a.min === lo && a.max === hi;
            return (
              <button
                key={a.rotulo}
                type="button"
                aria-pressed={on}
                onClick={() => (on ? emitir(undefined, undefined) : emitir(a.min, a.max))}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {a.rotulo}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
