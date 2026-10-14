"use client";

import Link from "next/link";
import { useState, type CSSProperties, type FocusEvent, type Ref } from "react";
import type { PontoMapa } from "@/lib/catalogo/tipos";
import { TIPO_ROTULO, desagio, moedaCurta, numero, plural } from "@/lib/catalogo/rotulos";
import s from "./mapa.module.css";

type Destaque = PontoMapa["destaques"][number];

/** Foto da fonte (sem baixar nem re-hospedar), com um desenho no lugar quando falha ou não existe. */
function Miniatura({ src, classe = "h-12 w-16 rounded-xl" }: { src: string | null; classe?: string }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-nevoa/12 ${classe}`}>
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-nevoa/70">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 4l9 6.5" />
          <path d="M5 9.5V20h14V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      </span>
      {src && !falhou && (
        // eslint-disable-next-line @next/next/no-img-element -- a foto fica na fonte: o next/image a baixaria e re-hospedaria
        <img
          src={src}
          alt=""
          width={64}
          height={48}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(true)}
          className="relative size-full object-cover"
        />
      )}
    </span>
  );
}

const LISTA = "min-h-14 flex-1 overflow-y-auto overscroll-contain";
const comDesagio = (d: Destaque) => d.desagio !== null && d.desagio > 0;

/**
 * Um destaque: miniatura, título, lance e deságio (link para a página do imóvel). Compacto (mapa baixo ou
 * celular): miniatura menor, título em uma linha e lance/deságio na mesma linha do tipo, para os três
 * caberem num mapa de 320 px sem perder o título.
 */
function LinhaDestaque({ d, href, compacto }: { d: Destaque; href?: string; compacto: boolean }) {
  const preco = (
    <>
      <span className="font-display font-bold text-luar">{moedaCurta(d.lance)}</span>
      {comDesagio(d) && <span className="font-semibold text-latao-texto">{desagio(d.desagio!)}</span>}
    </>
  );
  const corpo = compacto ? (
    <>
      <Miniatura key={d.foto ?? "sem-foto"} src={d.foto} classe="h-10 w-14 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-snug font-medium text-luar">{d.titulo}</span>
        <span className="mt-0.5 flex items-baseline gap-2 text-xs whitespace-nowrap tabular-nums">
          {preco}
          <span className="min-w-0 truncate text-nevoa">{TIPO_ROTULO[d.tipo]}</span>
        </span>
      </span>
    </>
  ) : (
    <>
      <Miniatura key={d.foto ?? "sem-foto"} src={d.foto} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] leading-snug font-medium text-luar">{d.titulo}</span>
        <span className="mt-0.5 block truncate text-xs text-nevoa">
          {TIPO_ROTULO[d.tipo]}
          {d.bairro ? ` · ${d.bairro}` : ""}
        </span>
        <span className="mt-1 flex items-baseline gap-2 text-[13px] tabular-nums">{preco}</span>
      </span>
    </>
  );
  const classe = `flex items-center gap-3 text-left ${compacto ? "px-3 py-1" : "px-4 py-2.5"}`;
  return href ? (
    <Link
      href={href}
      prefetch={false}
      className={`${classe} rounded-xl transition-colors duration-150 hover:bg-nevoa/10 focus-visible:-outline-offset-2`}
      aria-label={rotuloDestaque(d)}
    >
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

const rotuloDestaque = (d: Destaque) =>
  `${d.titulo}: lance ${moedaCurta(d.lance)}${comDesagio(d) ? `, deságio de ${d.desagio}%` : ""}`;

function Fechar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fechar"
      className="absolute top-1 right-1 grid size-11 place-items-center rounded-full text-nevoa transition-colors hover:bg-nevoa/12 hover:text-luar pointer-fine:top-2 pointer-fine:right-2 pointer-fine:size-9"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}

export interface CartaoMapaProps {
  /** cidades do cartão, da maior para a menor (uma = cartão da cidade; várias = grupo) */
  membros: PontoMapa[];
  total: number;
  lanceMin: number;
  desagioMax: number | null;
  /** o cartão foi aberto por clique/toque (fica aberto até fechar) */
  fixo: boolean;
  /** mapa baixo ou celular: destaques e listas mais justos */
  compacto?: boolean;
  /** mapa estreito: folha presa embaixo do mapa, na largura toda (em vez de ancorada na bolha) */
  docado?: boolean;
  id: string;
  ref: Ref<HTMLDivElement>;
  estilo: CSSProperties;
  hrefImovel?: (id: string) => string;
  onSelecionarCidade?: (p: PontoMapa) => void;
  /** `teclado`: ativado por Enter/Espaço (o foco segue para o mapa aproximado) */
  onAproximar: (teclado: boolean) => void;
  onFechar: () => void;
  onEntrar: () => void;
  onSair: () => void;
  onBlur: (e: FocusEvent<HTMLDivElement>) => void;
}

/**
 * Cartão do mapa: cidade (contagem, menor lance, maior deságio, até 3 destaques com foto e "Ver só esta
 * cidade") ou grupo (as 5 maiores cidades e "Aproximar"). Fica dentro da área do mapa (floating-ui).
 */
export function CartaoMapa({
  membros,
  total,
  lanceMin,
  desagioMax,
  fixo,
  compacto = false,
  docado = false,
  id,
  ref,
  estilo,
  hrefImovel,
  onSelecionarCidade,
  onAproximar,
  onFechar,
  onEntrar,
  onSair,
  onBlur,
}: CartaoMapaProps) {
  const grupo = membros.length > 1;
  const cidade = membros[0];
  const nome = grupo ? `${numero(membros.length)} cidades próximas` : `${cidade.cidade}/${cidade.uf}`;
  const temDesagio = desagioMax !== null && desagioMax > 0;

  return (
    <div
      ref={ref}
      id={id}
      data-cartao
      role="dialog"
      aria-label={grupo ? `Grupo de ${nome}` : nome}
      tabIndex={-1}
      style={estilo}
      onPointerEnter={onEntrar}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") onSair();
      }}
      onFocus={onEntrar}
      onBlur={onBlur}
      className={`${s.cartao} absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-nevoa/20 bg-tinta text-luar transition-[opacity,translate] focus-visible:outline-offset-2 duration-150 starting:opacity-0 motion-reduce:transition-none ${
        docado ? "inset-x-2 bottom-2 starting:translate-y-2" : "top-0 left-0 w-[min(312px,calc(100%-16px))]"
      }`}
    >
      <div className={`px-4 ${compacto ? "pt-3" : "pt-3.5"} ${fixo ? "pr-12" : ""}`}>
        <p className="font-display text-[17px] leading-tight font-bold tracking-tight text-luar">{nome}</p>
        <p className={`text-[13px] text-nevoa tabular-nums ${compacto ? "mt-0.5" : "mt-1"}`}>{plural(total, "imóvel", "imóveis")}</p>
      </div>
      {fixo && <Fechar onClick={onFechar} />}
      <dl className={`flex flex-wrap items-center gap-1.5 px-4 text-xs tabular-nums ${compacto ? "mt-2" : "mt-2.5"}`}>
        <div className="flex items-baseline gap-1 rounded-full bg-nevoa/10 px-2.5 py-1">
          <dt className="text-nevoa">a partir de</dt>
          <dd className="font-display font-bold text-luar">{moedaCurta(lanceMin)}</dd>
        </div>
        {temDesagio && (
          <div className="flex items-baseline gap-1 rounded-full bg-latao/15 px-2.5 py-1">
            <dt className="text-latao-texto">deságio de até</dt>
            <dd className="font-display font-bold text-latao-texto">{desagioMax}%</dd>
          </div>
        )}
      </dl>

      {/* lista com rolagem própria: num mapa baixo o cartão encolhe e pelo menos um item continua visível */}
      {grupo ? (
        <div className={LISTA}>
          <p className={`px-4 text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase ${compacto ? "mt-2.5" : "mt-3.5"}`}>Maiores cidades</p>
          <ul className="mt-1 px-1 pb-1">
            {membros.slice(0, 5).map((m) => {
              const conteudo = (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    {m.cidade}
                    <span className="text-nevoa">/{m.uf}</span>
                  </span>
                  <span className="shrink-0 text-nevoa tabular-nums">{plural(m.total, "imóvel", "imóveis")}</span>
                </>
              );
              return (
                <li key={m.chave}>
                  {onSelecionarCidade ? (
                    <button
                      type="button"
                      onClick={() => onSelecionarCidade?.(m)}
                      aria-label={`Ver só ${m.cidade}/${m.uf} (${plural(m.total, "imóvel", "imóveis")})`}
                      title={`Ver só ${m.cidade}/${m.uf}`}
                      className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] transition-colors hover:bg-nevoa/10 focus-visible:-outline-offset-2 ${compacto ? "pointer-fine:min-h-9" : "pointer-fine:min-h-10"}`}
                    >
                      {conteudo}
                      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-nevoa/60 transition-colors group-hover:text-latao-texto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </button>
                  ) : (
                    <div className="flex min-h-10 items-center gap-3 px-3 text-[13px]">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {membros.length > 5 && (
            <p className="px-4 pb-1 text-xs text-nevoa">
              e mais {plural(membros.length - 5, "cidade", "cidades")}
            </p>
          )}
        </div>
      ) : cidade.destaques.length > 0 ? (
        <div className={LISTA}>
          <p className={compacto ? "sr-only" : "mt-3.5 px-4 text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase"}>
            Maiores deságios
          </p>
          <ul className={compacto ? "mt-1.5 pb-1" : "mt-1 pb-1"}>
            {cidade.destaques.slice(0, 3).map((d) => (
              <li key={d.id} className="px-1">
                <LinhaDestaque d={d} href={hrefImovel?.(d.id)} compacto={compacto} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`border-t border-nevoa/15 px-4 ${compacto ? "py-2" : "py-3"}`}>
        {grupo ? (
          <button type="button" onClick={(e) => onAproximar(e.detail === 0)} className="btn-primary min-h-11! w-full text-sm! pointer-fine:min-h-10!">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" />
            </svg>
            Aproximar
          </button>
        ) : onSelecionarCidade ? (
          <button type="button" onClick={() => onSelecionarCidade?.(cidade)} className="btn-outline min-h-11! w-full text-sm! pointer-fine:min-h-10!">
            Ver só esta cidade
          </button>
        ) : (
          <p className="text-xs text-nevoa">Posição aproximada: centro da cidade.</p>
        )}
      </div>
    </div>
  );
}
