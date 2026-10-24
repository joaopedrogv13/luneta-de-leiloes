"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { desagio, local, moeda, moedaCurta, numero, plural, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import { posicoesDoLugar, type LugarMapa, type PontosLidos } from "@/lib/catalogo/pontos";
import type { Conjunto, ImovelResumo, Plano } from "@/lib/catalogo/tipos";
import { itensDoMapa, VersaoAntiga } from "./dados";
import { textoPrecisao } from "./geojson";

/** Quantos imóveis o cartão de um lugar com vários mostra (os de maior deságio primeiro). */
const NO_CARTAO = 4;

/** Foto da fonte (sem baixar nem re-hospedar), com o desenho de uma casa quando falha ou não existe. */
function Foto({ src, classe }: { src: string | null; classe: string }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-nevoa/12 ${classe}`}>
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-nevoa/70">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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

function Desagio({ valor }: { valor: number | null }) {
  if (valor === null || valor <= 0) return null;
  return (
    <span className="rounded-full bg-latao/15 px-2 py-0.5 text-[12px] font-semibold text-latao-texto tabular-nums">
      <span aria-hidden="true">{desagio(valor)}</span>
      <span className="sr-only">deságio de {valor}%</span>
    </span>
  );
}

/** Um imóvel no cartão (o lugar tem um só): foto grande, lance, deságio, local e o link. */
function Unico({ i, href }: { i: ImovelResumo; href: string }) {
  return (
    <Link href={href} prefetch={false} className="group/cartao block rounded-[20px] focus-visible:outline-offset-2">
      <Foto src={i.foto} classe="aspect-[16/10] w-full rounded-t-[20px]" />
      <span className="block px-4 pt-3 pb-3.5">
        <span className="flex items-center justify-between gap-2">
          <span className="font-display text-[19px] leading-tight font-bold text-luar tabular-nums">{moeda(i.lance)}</span>
          <Desagio valor={i.desagio} />
        </span>
        <span className="mt-1 block truncate text-[13.5px] font-medium text-luar">{i.titulo}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-nevoa">{local(i)}</span>
        <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-latao-texto group-hover/cartao:underline">
          Ver o imóvel
          <span aria-hidden="true">→</span>
        </span>
      </span>
    </Link>
  );
}

/** Uma linha (lugar com vários imóveis). */
function Linha({ i, href }: { i: ImovelResumo; href: string }) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-nevoa/10 focus-visible:-outline-offset-2"
        aria-label={`${i.titulo}, ${local(i)}: lance ${moedaCurta(i.lance)}${i.desagio !== null && i.desagio > 0 ? `, deságio de ${i.desagio}%` : ""}`}
      >
        <Foto src={i.foto} classe="h-11 w-14 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-luar">{i.titulo}</span>
          <span className="mt-0.5 flex items-baseline gap-2 text-[12.5px] tabular-nums">
            <span className="font-display font-bold text-luar">{moedaCurta(i.lance)}</span>
            {i.desagio !== null && i.desagio > 0 && <span className="font-semibold text-latao-texto">{desagio(i.desagio)}</span>}
            <span className="min-w-0 truncate text-nevoa">{TIPO_ROTULO[i.tipo]}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function Esqueleto({ unico }: { unico: boolean }) {
  return unico ? (
    <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
      <div className="aspect-[16/10] w-full rounded-t-[20px] bg-nevoa/12" />
      <div className="space-y-2 px-4 py-3.5">
        <div className="h-5 w-32 rounded bg-nevoa/15" />
        <div className="h-3.5 w-48 rounded bg-nevoa/12" />
        <div className="h-3.5 w-40 rounded bg-nevoa/10" />
      </div>
    </div>
  ) : (
    <ul aria-hidden="true" className="animate-pulse space-y-2 px-2 motion-reduce:animate-none">
      {[0, 1, 2].map((k) => (
        <li key={k} className="flex items-center gap-3">
          <div className="h-11 w-14 rounded-lg bg-nevoa/12" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 rounded bg-nevoa/15" />
            <div className="h-3 w-1/2 rounded bg-nevoa/10" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Título do lugar com vários imóveis, pela precisão. */
function tituloDoLugar(l: LugarMapa): string {
  switch (l.nivel) {
    case 0:
      return `${plural(l.n, "imóvel", "imóveis")} neste endereço`;
    case 1:
      return `${plural(l.n, "imóvel", "imóveis")} nesta rua`;
    case 2:
      return `${plural(l.n, "imóvel", "imóveis")} ${l.nome ? `em ${l.nome.split(",")[0]}` : "neste bairro"}`;
    default:
      return `${plural(l.n, "imóvel", "imóveis")} sem endereço exato${l.nome ? ` em ${l.nome}` : ""}`;
  }
}

/**
 * O cartão de um lugar do mapa (ao passar o mouse ou tocar): com um imóvel, a foto, o lance, o deságio, o local e o
 * link; com vários (o mesmo prédio, o mesmo ponto de bairro, a sede da cidade), os de maior deságio em linhas, e "Ver
 * todos na lista" (na cidade: filtra pela cidade; nos outros: aproxima até o ponto). A precisão vai sempre escrita: o
 * ponto aproximado nunca parece o endereço.
 */
export function CartaoLugar({
  lugar,
  pontos,
  conjunto,
  plano,
  hrefImovel,
  fixo,
  onFechar,
  onVerNaLista,
  onIdsCarregados,
  onVersaoAntiga,
}: {
  lugar: LugarMapa;
  pontos: PontosLidos;
  conjunto: Conjunto;
  plano: Plano;
  hrefImovel: (id: string) => string;
  /** aberto por clique ou toque: tem o botão Fechar */
  fixo: boolean;
  onFechar: () => void;
  /** "Ver todos na lista": a cidade (chave "UF|Cidade") no nível 3; null nos outros (o mapa aproxima) */
  onVerNaLista: (cidade: string | null) => void;
  /** os ids do lugar (a lista acende os cartões deles) */
  onIdsCarregados?: (ids: string[]) => void;
  onVersaoAntiga: () => void;
}) {
  const ks = posicoesDoLugar(pontos, lugar);
  const pedidos = ks.slice(0, lugar.n === 1 ? 1 : NO_CARTAO);
  const chave = `${pontos.conjunto}|${plano}|${pedidos.join(",")}`;
  const [carregado, setCarregado] = useState<{ chave: string; itens: ImovelResumo[] | null; erro: boolean }>({ chave: "", itens: null, erro: false });
  useEffect(() => {
    const controle = new AbortController();
    itensDoMapa(conjunto, pontos.conjunto, plano, pedidos, controle.signal).then(
      (itens) => {
        setCarregado({ chave, itens, erro: false });
        onIdsCarregados?.(itens.map((i) => i.id));
      },
      (e: unknown) => {
        if (controle.signal.aborted) return;
        if (e instanceof VersaoAntiga) onVersaoAntiga();
        setCarregado({ chave, itens: null, erro: true });
      },
    );
    return () => controle.abort();
    // `pedidos` muda junto com a chave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, conjunto]);
  const itens = carregado.chave === chave ? carregado.itens : null;
  const erro = carregado.chave === chave && carregado.erro;
  const unico = lugar.n === 1;
  const cidade = lugar.nivel === 3 && itens?.[0] ? `${itens[0].uf}|${itens[0].cidade}` : null;

  return (
    <div className="relative w-full overflow-hidden rounded-[20px] border border-nevoa/20 bg-tinta text-left shadow-[0_18px_50px_rgba(0,0,0,.45)] [[data-theme=light]_&]:shadow-[0_14px_40px_rgba(15,24,48,.18)]">
      {fixo && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute top-1.5 right-1.5 z-10 grid size-11 place-items-center rounded-full bg-[#070b16]/70 text-white ring-1 ring-white/15 transition-colors hover:bg-[#070b16]/90 pointer-fine:size-9"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
      {unico ? (
        itens?.[0] ? (
          <Unico i={itens[0]} href={hrefImovel(itens[0].id)} />
        ) : erro ? (
          <p className="px-4 py-5 text-[13px] text-nevoa">Não foi possível carregar este imóvel. Toque de novo para tentar.</p>
        ) : (
          <Esqueleto unico />
        )
      ) : (
        <div className="pt-3.5 pb-2">
          <p className={`px-4 font-display text-[15px] leading-snug font-bold text-luar ${fixo ? "pr-12" : ""}`}>{tituloDoLugar(lugar)}</p>
          <p className="mt-0.5 px-4 text-[12.5px] text-nevoa tabular-nums">a partir de {moedaCurta(lugar.lanceMin)}</p>
          <div className="mt-2 px-2">
            {itens ? (
              <ul className="space-y-0.5">
                {itens.map((i) => (
                  <Linha key={i.id} i={i} href={hrefImovel(i.id)} />
                ))}
              </ul>
            ) : erro ? (
              <p className="px-2 py-2 text-[13px] text-nevoa">Não foi possível carregar os imóveis daqui.</p>
            ) : (
              <Esqueleto unico={false} />
            )}
          </div>
          {lugar.n > NO_CARTAO && (
            <button
              type="button"
              onClick={() => onVerNaLista(cidade)}
              className="mx-4 mt-1.5 inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-latao-texto hover:underline pointer-fine:min-h-8"
            >
              {lugar.nivel === 3 ? `Ver os ${numero(lugar.n)} na lista` : `Aproximar e ver os ${numero(lugar.n)}`}
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      )}
      <p className={`border-t border-nevoa/12 px-4 py-2 text-[12px] leading-snug text-nevoa ${lugar.nivel >= 2 ? "bg-latao/[0.06]" : ""}`}>{textoPrecisao(lugar)}</p>
    </div>
  );
}
