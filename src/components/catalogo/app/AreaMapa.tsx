"use client";

import { lazy, Suspense, useEffect, useMemo, useSyncExternalStore } from "react";
import { numero, plural } from "@/lib/catalogo/rotulos";
import type { PontoMapa } from "@/lib/catalogo/tipos";
import { IconeMapa } from "../cartoes/icones";
import s from "../mapa/mapa.module.css";
import type { VarianteMapa } from "../mapa/MapaBrasil";
import { Girando, IconeSeta } from "../ui/icones";
import { useDestaqueDaLista, type LojaDestaque } from "./hooks";

// O mapa (contorno dos 27 estados, câmera, agrupamento) só é baixado quando aparece na tela.
const carregarMapa = () => import("../mapa/MapaBrasil");
const MapaBrasil = lazy(() => carregarMapa().then((m) => ({ default: m.MapaBrasil })));

/** A mesma caixa do mapa (fundo, altura, borda da variante), enquanto ele ou os pontos chegam. */
function Espera({ variante, erro, onTentar, className = "" }: { variante: VarianteMapa; erro?: boolean; onTentar?: () => void; className?: string }) {
  return (
    <div className={`${s.mapa} ${s[variante]} grid place-items-center ${className}`}>
      {erro ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-6 text-center">
          <p className="text-sm text-luar">Não foi possível carregar o mapa.</p>
          <button type="button" onClick={onTentar} className="btn-ghost !min-h-11 !px-4 !text-[13px] pointer-fine:!min-h-10">
            Tentar de novo
          </button>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-[13px] text-nevoa">
          <Girando tamanho={14} />
          Carregando o mapa…
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Faixa recolhida ou aberta (vista Cards): escolha da pessoa, guardada no navegador
// ---------------------------------------------------------------------------

type EstadoFaixa = "auto" | "aberta" | "recolhida";
const CHAVE_FAIXA = "luneta-faixa-mapa";
const ouvintesFaixa = new Set<() => void>();
let faixaEmMemoria: EstadoFaixa = "auto";

function lerFaixa(): EstadoFaixa {
  try {
    const v = window.localStorage.getItem(CHAVE_FAIXA);
    if (v === "aberta" || v === "recolhida") return v;
  } catch {
    // sem armazenamento: vale a escolha desta visita
  }
  return faixaEmMemoria;
}

function guardarFaixa(v: EstadoFaixa) {
  faixaEmMemoria = v;
  try {
    window.localStorage.setItem(CHAVE_FAIXA, v);
  } catch {
    // sem armazenamento: fica na memória
  }
  for (const f of ouvintesFaixa) f();
}

/** "auto" no servidor e enquanto a pessoa não escolheu: o CSS decide (recolhida em tela baixa). */
function useEstadoFaixa(): EstadoFaixa {
  return useSyncExternalStore(
    (avisar) => {
      ouvintesFaixa.add(avisar);
      return () => {
        ouvintesFaixa.delete(avisar);
      };
    },
    lerFaixa,
    () => "auto",
  );
}

/** Cidades com mais imóveis ao lado do mapa (computador): atalho para filtrar e o mesmo destaque do mapa. */
const CIDADES_AO_LADO = 12;

/**
 * Mapa do catálogo no lugar dele (coluna "painel" ao lado da lista ou "faixa" sobre os cards), ligado à
 * lista: o imóvel sob o mouse acende a cidade no mapa, e a cidade sob o mouse no mapa acende os imóveis
 * dela (`onHover`). Enquanto os pontos de uma busca nova chegam, os anteriores ficam com um aviso discreto.
 *
 * Faixa (vista Cards): baixa (220–320 px) para os cards começarem na primeira dobra; no computador, o mapa à
 * esquerda e as cidades com mais imóveis à direita; "Recolher mapa" a deixa numa barra fina ("Mapa · 312
 * cidades · Abrir"), e a escolha fica guardada. Sem escolha, ela começa recolhida em tela baixa (< 860 px).
 */
export function AreaMapa({
  variante,
  pontos,
  carregando,
  erro,
  onTentar,
  loja,
  ufsFoco,
  onSelecionarCidade,
  hrefImovel,
  recolhivel = false,
  className = "",
}: {
  variante: Exclude<VarianteMapa, "mini">;
  pontos: PontoMapa[] | null;
  carregando: boolean;
  erro: boolean;
  onTentar: () => void;
  loja: LojaDestaque;
  ufsFoco?: string[];
  onSelecionarCidade: (p: PontoMapa) => void;
  hrefImovel: (id: string) => string;
  /** faixa: "Recolher mapa" (no computador e no tablet; no celular o botão flutuante cuida disso) */
  recolhivel?: boolean;
  className?: string;
}) {
  // baixa o código do mapa junto com os pontos (não depois deles)
  useEffect(() => {
    void carregarMapa();
  }, []);
  const estado = useEstadoFaixa();

  const mapa = !pontos ? (
    <Espera variante={variante} erro={erro} onTentar={onTentar} className={className} />
  ) : (
    <div className={`relative ${variante === "painel" ? "h-full" : ""}`}>
      <Suspense fallback={<Espera variante={variante} className={className} />}>
        <MapaConectado
          variante={variante}
          pontos={pontos}
          loja={loja}
          ufsFoco={ufsFoco}
          onSelecionarCidade={onSelecionarCidade}
          hrefImovel={hrefImovel}
          className={className}
        />
      </Suspense>
      {(carregando || erro) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-30 flex justify-center px-4">
          {erro ? (
            <button
              type="button"
              onClick={onTentar}
              className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-grave/50 bg-tinta px-4 text-[13px] font-medium text-luar shadow-lg pointer-fine:min-h-10"
            >
              Mapa desatualizado · Tentar de novo
            </button>
          ) : (
            <p role="status" className="inline-flex items-center gap-2 rounded-full border border-nevoa/20 bg-tinta/95 px-3.5 py-2 text-[12.5px] font-medium text-nevoa shadow-lg">
              <Girando tamanho={13} />
              Atualizando o mapa…
            </p>
          )}
        </div>
      )}
    </div>
  );
  if (!recolhivel || variante !== "faixa") return mapa;

  return (
    <div data-faixa={estado} className="group/faixa">
      {/* barra fina (recolhida): no celular nunca (lá o mapa abre e fecha pelo botão flutuante) */}
      <div className="hidden min-h-14 items-center gap-3 rounded-2xl border border-nevoa/20 bg-tinta px-4 py-2 sm:group-data-[faixa=recolhida]/faixa:flex [@media(min-width:40rem)_and_(max-height:859.98px)]:group-data-[faixa=auto]/faixa:flex">
        <IconeMapa className="text-latao-texto" />
        <p className="min-w-0 flex-1 truncate text-sm text-nevoa">
          <span className="font-semibold text-luar">Mapa</span>
          {pontos && (
            <span className="tabular-nums">
              {" "}
              · {plural(pontos.length, "cidade", "cidades")} com imóveis
            </span>
          )}
        </p>
        <button type="button" onClick={() => guardarFaixa("aberta")} className="btn-ghost !min-h-11 shrink-0 !gap-1.5 !px-4 !text-[13px] pointer-fine:!min-h-9">
          Abrir mapa
          <IconeSeta />
        </button>
      </div>
      <div className="sm:group-data-[faixa=recolhida]/faixa:hidden [@media(min-width:40rem)_and_(max-height:859.98px)]:group-data-[faixa=auto]/faixa:hidden">
        <div className="lg:grid lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)] lg:gap-5">
          <div className="relative">
            {mapa}
            <button
              type="button"
              onClick={() => guardarFaixa("recolhida")}
              // canto de baixo à direita: no enquadramento do Brasil é mar (os botões de zoom ficam em cima)
              className={`${s.vidro} absolute right-3 bottom-3 z-30 hidden min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-luar transition-colors hover:text-latao-texto sm:inline-flex`}
            >
              <IconeSeta className="rotate-180" />
              Recolher mapa
            </button>
          </div>
          {pontos && <CidadesAoLado pontos={pontos} loja={loja} onSelecionarCidade={onSelecionarCidade} />}
        </div>
      </div>
    </div>
  );
}

/** As cidades com mais imóveis da busca, ao lado do mapa (só no computador). */
function CidadesAoLado({ pontos, loja, onSelecionarCidade }: { pontos: PontoMapa[]; loja: LojaDestaque; onSelecionarCidade: (p: PontoMapa) => void }) {
  const maiores = useMemo(() => [...pontos].sort((a, b) => b.total - a.total).slice(0, CIDADES_AO_LADO), [pontos]);
  const totalImoveis = useMemo(() => pontos.reduce((n, p) => n + p.total, 0), [pontos]);
  if (!maiores.length) return null;
  return (
    <section aria-labelledby="cidades-ao-lado" className="hidden min-w-0 flex-col rounded-3xl border border-nevoa/15 bg-tinta p-5 lg:flex">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="cidades-ao-lado" className="font-display text-base font-bold text-luar">
          Cidades com mais imóveis
        </h3>
        <p className="text-xs text-nevoa tabular-nums">
          {plural(pontos.length, "cidade", "cidades")} · {plural(totalImoveis, "imóvel", "imóveis")}
        </p>
      </div>
      <p className="mt-1 text-xs text-nevoa">Toque numa cidade para ver só os imóveis dela.</p>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0.5 xl:grid-cols-3">
        {maiores.map((p) => (
          <li key={p.chave} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelecionarCidade(p)}
              onMouseEnter={() => loja.definirDoMapa(p.chave)}
              onMouseLeave={() => loja.definirDoMapa(null)}
              onFocus={() => loja.definirDoMapa(p.chave)}
              onBlur={() => loja.definirDoMapa(null)}
              className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 text-left text-[13.5px] text-luar transition-colors hover:bg-nevoa/[0.08]"
            >
              <span className="min-w-0 truncate">
                {p.cidade}
                <span className="text-nevoa">/{p.uf}</span>
              </span>
              <span className="shrink-0 text-xs text-nevoa tabular-nums">
                {numero(p.total)}
                <span className="sr-only"> {p.total === 1 ? "imóvel" : "imóveis"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lê o destaque da lista direto da loja: passar o mouse nos cartões redesenha só o mapa. */
function MapaConectado({
  loja,
  ...props
}: {
  variante: Exclude<VarianteMapa, "mini">;
  pontos: PontoMapa[];
  loja: LojaDestaque;
  ufsFoco?: string[];
  onSelecionarCidade: (p: PontoMapa) => void;
  hrefImovel: (id: string) => string;
  className?: string;
}) {
  const destaque = useDestaqueDaLista(loja);
  return (
    <MapaBrasil
      {...props}
      destaque={destaque}
      onHover={loja.definirDoMapa}
      rolagem={props.variante === "painel" ? "direta" : "ctrl"}
    />
  );
}
