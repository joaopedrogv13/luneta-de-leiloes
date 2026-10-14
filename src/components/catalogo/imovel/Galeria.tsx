"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject, type UIEvent } from "react";
import { IlustracaoTipo } from "@/components/catalogo/cartoes/Ilustracao";
import { useDialog } from "@/components/catalogo/ui/useDialog";
import type { TipoImovel } from "@/lib/catalogo/tipos";
import { IconeFechar, IconeSetaDireita, IconeSetaEsquerda, IconeTelaCheia } from "./icones";

/** Fundo da moldura (o mesmo da foto dos cartões): aparece atrás do desenho quando não há foto. */
const FUNDO =
  "radial-gradient(120% 70% at 50% 108%, rgba(201,162,77,.16), transparent 62%), linear-gradient(180deg, rgba(var(--fog-rgb),.13), rgba(var(--fog-rgb),.03) 70%), var(--noite)";

/** Vidro escuro dos botões sobre a foto: fixo nos dois temas (a foto manda no fundo). */
const VIDRO = "bg-[#070b16]/72 text-white ring-1 ring-white/15 hover:bg-[#070b16]/88";

const SEM_BARRA = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Fotos que já falharam nesta visita (a página que volta não pede de novo). */
const FALHAS = new Set<string>();

const reduzMovimento = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Vai até a foto `i` de uma trilha com rolagem por encaixe (uma foto por largura). */
function rolarPara(trilha: HTMLElement | null, i: number, suave = true) {
  if (!trilha) return;
  trilha.scrollTo({ left: i * trilha.clientWidth, behavior: suave && !reduzMovimento() ? "smooth" : "auto" });
}

/** Índice da foto visível numa trilha. */
const indiceDa = (trilha: HTMLElement) => (trilha.clientWidth > 0 ? Math.round(trilha.scrollLeft / trilha.clientWidth) : 0);

/** Prazo para uma rolagem animada chegar à foto pedida (depois disso, a posição da trilha volta a mandar). */
const PRAZO_ANIMACAO = 1000;

/**
 * Índice da foto de uma trilha com encaixe (uma foto por largura), ligado à rolagem: deslizar com o dedo muda o
 * índice. Numa ida pedida pelo programa (setas, miniaturas, teclado), as fotos do meio do caminho não mexem no
 * contador nem na miniatura marcada: o índice vai direto para o destino.
 */
function useTrilha(inicial: number, total: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(inicial);
  const destino = useRef<number | null>(null);
  const prazo = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(prazo.current), []);

  const ir = (i: number, suave = true) => {
    const alvo = ((i % total) + total) % total;
    setIndice(alvo);
    const t = ref.current;
    if (!t) return;
    const anima = suave && !reduzMovimento();
    window.clearTimeout(prazo.current);
    destino.current = anima ? alvo : null;
    if (anima) {
      prazo.current = window.setTimeout(() => {
        destino.current = null;
        if (ref.current) setIndice(indiceDa(ref.current));
      }, PRAZO_ANIMACAO);
    }
    rolarPara(t, alvo, anima);
  };

  const aoRolar = (e: UIEvent<HTMLDivElement>) => {
    const i = indiceDa(e.currentTarget);
    if (destino.current !== null) {
      if (i !== destino.current) return;
      destino.current = null;
      window.clearTimeout(prazo.current);
    }
    setIndice(i);
  };

  return { ref, indice, ir, aoRolar };
}

/**
 * O desenho do tipo num quadro 4:3 centralizado: na moldura larga do computador ele não estica nem corta
 * (as laterais ficam com o fundo da moldura).
 */
function Desenho({ tipo }: { tipo: TipoImovel }) {
  return (
    <span aria-hidden="true" className="absolute inset-y-0 left-1/2 block aspect-[4/3] h-full max-w-full -translate-x-1/2">
      <IlustracaoTipo tipo={tipo} />
    </span>
  );
}

/**
 * Foto direto da fonte (nada de baixar ou re-hospedar): <img> simples, sem referrer, com o desenho do tipo
 * no lugar se ela falhar. `ajuste` "contain" mostra a foto inteira (a moldura tem o fundo desfocado atrás).
 */
function Foto({
  url,
  alt,
  tipo,
  falhou,
  onFalha,
  prioridade = false,
  ajuste = "contain",
  aviso = true,
  className = "",
}: {
  url: string;
  alt: string;
  tipo: TipoImovel;
  falhou: boolean;
  onFalha: (url: string) => void;
  prioridade?: boolean;
  ajuste?: "contain" | "cover";
  /** "Esta foto não carregou da fonte" sob o desenho (não nas miniaturas) */
  aviso?: boolean;
  className?: string;
}) {
  const [carregou, setCarregou] = useState(false);
  // A foto pode ter carregado (ou falhado) antes da hidratação, quando onLoad/onError ainda não existiam.
  // "complete" sem largura não basta para dizer que falhou: há navegador que dá complete = true numa foto
  // "lazy" que ainda nem começou a baixar. decode() tira a dúvida: rejeita só se a foto quebrou e, numa foto
  // que ainda vai carregar, espera.
  const conferir = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img?.complete) return;
      if (img.naturalWidth > 0) {
        setCarregou(true);
        return;
      }
      img.decode().then(
        () => setCarregou(true),
        () => {
          if (img.isConnected && img.complete && img.naturalWidth === 0) onFalha(url);
        },
      );
    },
    [onFalha, url],
  );
  if (falhou) {
    // só <span>: a foto pode estar dentro de um botão (abrir em tela cheia)
    return (
      <span className={`absolute inset-0 block ${className}`} style={{ background: FUNDO }}>
        <Desenho tipo={tipo} />
        {aviso && (
          <span className="absolute inset-x-0 bottom-[8%] block px-4 text-center text-[13px] leading-snug font-medium text-nevoa">
            Esta foto não carregou do site da fonte
            <span className="sr-only">: {alt}</span>
          </span>
        )}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a foto fica na fonte: o next/image a baixaria e re-hospedaria
    <img
      ref={conferir}
      src={url}
      alt={alt}
      loading={prioridade ? "eager" : "lazy"}
      fetchPriority={prioridade ? "high" : undefined}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onLoad={() => setCarregou(true)}
      onError={() => onFalha(url)}
      className={`absolute inset-0 size-full transition-opacity duration-300 motion-reduce:transition-none ${ajuste === "cover" ? "object-cover" : "object-contain"} ${carregou ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}

/** Fundo desfocado da foto atual: preenche as sobras da moldura sem esticar a foto (fotos da fonte têm ~640 px). */
function Ambiente({ url, ativo }: { url: string | null; ativo: boolean }) {
  if (!url || !ativo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- mesma foto da fonte, só como fundo
    <img
      key={url}
      src={url}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
      draggable={false}
      className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-55 blur-2xl saturate-[1.15] transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none"
    />
  );
}

/**
 * Galeria da página do imóvel: foto grande (a foto inteira, com o fundo desfocado dela mesma), setas,
 * contador, miniaturas (coluna à direita no computador, fila embaixo no celular), deslizar com o dedo e
 * tela cheia (setas ← →, Home/End e Esc). Uma foto só: uma foto grande. Sem foto: o desenho do tipo.
 */
export function Galeria({ fotos, tipo, titulo, semFotoTexto }: { fotos: string[]; tipo: TipoImovel; titulo: string; semFotoTexto: string }) {
  const [falhas, setFalhas] = useState<ReadonlySet<string>>(() => new Set(fotos.filter((f) => FALHAS.has(f))));
  const [telaCheia, setTelaCheia] = useState(false);
  const total = fotos.length;
  const { ref: trilha, indice, ir, aoRolar } = useTrilha(0, total);
  const botaoTelaCheia = useRef<HTMLButtonElement>(null);
  const abridor = useRef<HTMLElement | null>(null);

  const falhar = useCallback((url: string) => {
    FALHAS.add(url);
    setFalhas((f) => (f.has(url) ? f : new Set(f).add(url)));
  }, []);

  const abrir = (el: HTMLElement | null) => {
    abridor.current = el ?? botaoTelaCheia.current;
    setTelaCheia(true);
  };

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") ir(indice + 1);
    else if (e.key === "ArrowLeft") ir(indice - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(total - 1);
    else if (e.key === "Enter") abrir(e.currentTarget);
    else return;
    e.preventDefault();
  };

  // sem foto, ou todas falharam ao carregar da fonte: o desenho do tipo, sem setas nem tela cheia
  const todasFalharam = total > 0 && fotos.every((f) => falhas.has(f));
  if (total === 0 || todasFalharam) {
    const texto = todasFalharam ? (total === 1 ? "A foto não carregou do site da fonte" : "As fotos não carregaram do site da fonte") : semFotoTexto;
    return (
      <div
        role="img"
        aria-label={texto}
        className="relative isolate -mx-4 aspect-[16/10] overflow-hidden sm:mx-0 sm:rounded-3xl sm:border sm:border-nevoa/15 lg:aspect-auto lg:h-[clamp(240px,38vh,380px)]"
        style={{ background: FUNDO }}
      >
        <Desenho tipo={tipo} />
        <p aria-hidden="true" className="absolute inset-x-0 bottom-[8%] px-4 text-center text-[13px] leading-snug font-medium text-nevoa">
          {texto}
        </p>
      </div>
    );
  }

  const varias = total > 1;
  const atual = fotos[indice] ?? null;

  return (
    <section aria-roledescription="carrossel" aria-label={`Fotos do imóvel (${total === 1 ? "1 foto" : `${total} fotos`})`} className={varias ? "lg:grid lg:grid-cols-[minmax(0,1fr)_8.5rem] lg:gap-3" : ""}>
      <div
        className="relative isolate -mx-4 aspect-[4/3] overflow-hidden sm:mx-0 sm:aspect-[16/10] sm:rounded-3xl sm:border sm:border-nevoa/15 lg:aspect-auto lg:h-[clamp(320px,58vh,560px)]"
        style={{ background: FUNDO }}
      >
        <Ambiente url={atual} ativo={!!atual && !falhas.has(atual)} />
        <div
          ref={trilha}
          tabIndex={varias ? 0 : -1}
          role={varias ? "group" : undefined}
          aria-label={varias ? "Fotos: use as setas para passar e Enter para ver em tela cheia" : undefined}
          onKeyDown={varias ? teclas : undefined}
          onScroll={aoRolar}
          className={`relative flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain ${SEM_BARRA} focus-visible:-outline-offset-4`}
        >
          {fotos.map((url, i) => (
            // Clicar na foto abre a tela cheia (atalho do mouse; no teclado, "Tela cheia" ou Enter na trilha).
            <div
              key={url}
              role={varias ? "group" : undefined}
              aria-roledescription={varias ? "foto" : undefined}
              aria-label={varias ? `${i + 1} de ${total}` : undefined}
              onClick={falhas.has(url) ? undefined : () => abrir(botaoTelaCheia.current)}
              className={`relative h-full w-full shrink-0 snap-center snap-always ${falhas.has(url) ? "" : "cursor-zoom-in"}`}
            >
              <Foto
                url={url}
                alt={total === 1 ? `Foto do imóvel: ${titulo}` : `Foto ${i + 1} de ${total}: ${titulo}`}
                tipo={tipo}
                falhou={falhas.has(url)}
                onFalha={falhar}
                prioridade={i === 0}
              />
            </div>
          ))}
        </div>

        {varias && (
          <>
            <button
              type="button"
              onClick={() => ir(indice - 1)}
              aria-label="Foto anterior"
              className={`absolute top-1/2 left-3 z-10 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full transition-colors sm:grid ${VIDRO}`}
            >
              <IconeSetaEsquerda />
            </button>
            <button
              type="button"
              onClick={() => ir(indice + 1)}
              aria-label="Próxima foto"
              className={`absolute top-1/2 right-3 z-10 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full transition-colors sm:grid ${VIDRO}`}
            >
              <IconeSetaDireita />
            </button>
          </>
        )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-2">
          {varias ? (
            <p className={`rounded-full px-2.5 py-1.5 text-xs leading-none font-semibold tabular-nums ${VIDRO} hover:bg-[#070b16]/72`}>
              <span className="sr-only">Foto </span>
              {indice + 1}
              <span aria-hidden="true"> / </span>
              <span className="sr-only"> de </span>
              {total}
            </p>
          ) : (
            <span />
          )}
          <button
            ref={botaoTelaCheia}
            type="button"
            onClick={(e) => abrir(e.currentTarget)}
            aria-haspopup="dialog"
            className={`pointer-events-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors pointer-fine:min-h-9 ${VIDRO}`}
          >
            <IconeTelaCheia tamanho={16} />
            Tela cheia
          </button>
        </div>
      </div>

      {varias && (
        <ul
          aria-label="Miniaturas"
          className={`mt-2 flex gap-2 overflow-x-auto pb-1 ${SEM_BARRA} lg:mt-0 lg:h-[clamp(320px,58vh,560px)] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0`}
        >
          {fotos.map((url, i) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                onClick={() => ir(i)}
                aria-label={`Foto ${i + 1} de ${total}`}
                aria-current={i === indice ? "true" : undefined}
                className={`relative block aspect-[4/3] w-20 cursor-pointer overflow-hidden rounded-xl border-2 transition-[border-color,opacity] duration-150 sm:w-24 lg:w-full ${
                  i === indice ? "border-latao opacity-100" : "border-transparent opacity-70 hover:opacity-100"
                }`}
                style={{ background: FUNDO }}
              >
                <Foto url={url} alt="" tipo={tipo} falhou={falhas.has(url)} onFalha={falhar} ajuste="cover" aviso={false} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {telaCheia && (
        <TelaCheia
          fotos={fotos}
          tipo={tipo}
          titulo={titulo}
          inicial={indice}
          falhas={falhas}
          onFalha={falhar}
          abridor={abridor}
          onFechar={(i) => {
            setTelaCheia(false);
            ir(i, false);
          }}
        />
      )}
    </section>
  );
}

/** Tela cheia: diálogo modal (foco preso, Esc fecha, rolagem da página travada). */
function TelaCheia({
  fotos,
  tipo,
  titulo,
  inicial,
  falhas,
  onFalha,
  abridor,
  onFechar,
}: {
  fotos: string[];
  tipo: TipoImovel;
  titulo: string;
  inicial: number;
  falhas: ReadonlySet<string>;
  onFalha: (url: string) => void;
  abridor: RefObject<HTMLElement | null>;
  onFechar: (indice: number) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const total = fotos.length;
  const { ref: trilha, indice, ir, aoRolar } = useTrilha(inicial, total);
  const indiceRef = useRef(inicial);
  useEffect(() => {
    indiceRef.current = indice;
  });

  useDialog({ open: true, dialogRef: caixa, onClose: () => onFechar(indiceRef.current), initialFocusRef: fechar, openerRef: abridor });

  // abre já na foto escolhida, sem animação; e acompanha a largura se a tela girar
  useLayoutEffect(() => {
    const t = trilha.current;
    if (!t) return;
    rolarPara(t, inicial, false);
    const obs = new ResizeObserver(() => rolarPara(t, indiceRef.current, false));
    obs.observe(t);
    return () => obs.disconnect();
  }, [inicial, trilha]);

  return (
    <div
      ref={caixa}
      role="dialog"
      aria-modal="true"
      aria-label={`Fotos em tela cheia: ${titulo}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (total < 2) return;
        if (e.key === "ArrowRight") ir(indice + 1);
        else if (e.key === "ArrowLeft") ir(indice - 1);
        else if (e.key === "Home") ir(0);
        else if (e.key === "End") ir(total - 1);
        else return;
        e.preventDefault();
      }}
      className="fixed inset-0 z-[90] flex flex-col bg-[#05070d] text-white outline-none transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none"
    >
      <div className="flex items-center justify-between gap-4 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 sm:px-6">
        <p aria-live="polite" className="min-w-0 truncate text-sm font-medium text-white/80 tabular-nums">
          {total > 1 ? `Foto ${indice + 1} de ${total}` : "Foto do imóvel"}
          <span className="hidden text-white/50 sm:inline"> · {titulo}</span>
        </p>
        <button
          ref={fechar}
          type="button"
          onClick={() => onFechar(indice)}
          aria-label="Fechar a tela cheia"
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-white"
        >
          <IconeFechar />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* tabIndex -1: o Chrome põe no Tab toda área que rola sem nada focável dentro (aqui, sem nome); as setas
            do teclado já valem no diálogo inteiro */}
        <div
          ref={trilha}
          tabIndex={-1}
          onScroll={aoRolar}
          className={`flex size-full snap-x snap-mandatory overflow-x-auto overscroll-contain outline-none ${SEM_BARRA}`}
        >
          {fotos.map((url, i) => (
            <div key={url} className="relative h-full w-full shrink-0 snap-center snap-always px-2 sm:px-20">
              <div className="relative size-full">
                <Foto url={url} alt={`Foto ${i + 1} de ${total}: ${titulo}`} tipo={tipo} falhou={falhas.has(url)} onFalha={onFalha} prioridade={i === inicial} />
              </div>
            </div>
          ))}
        </div>
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => ir(indice - 1)}
              aria-label="Foto anterior"
              className="absolute top-1/2 left-3 hidden size-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-white sm:grid"
            >
              <IconeSetaEsquerda tamanho={22} />
            </button>
            <button
              type="button"
              onClick={() => ir(indice + 1)}
              aria-label="Próxima foto"
              className="absolute top-1/2 right-3 hidden size-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-white sm:grid"
            >
              <IconeSetaDireita tamanho={22} />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <ul aria-label="Miniaturas" className={`flex justify-center gap-2 overflow-x-auto px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] ${SEM_BARRA}`}>
          {fotos.map((url, i) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                onClick={() => ir(i)}
                aria-label={`Foto ${i + 1} de ${total}`}
                aria-current={i === indice ? "true" : undefined}
                className={`relative block aspect-[4/3] w-16 cursor-pointer overflow-hidden rounded-lg border-2 bg-white/5 transition-[border-color,opacity] duration-150 focus-visible:outline-white sm:w-20 ${
                  i === indice ? "border-latao opacity-100" : "border-transparent opacity-55 hover:opacity-100"
                }`}
              >
                <Foto url={url} alt="" tipo={tipo} falhou={falhas.has(url)} onFalha={onFalha} ajuste="cover" aviso={false} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
