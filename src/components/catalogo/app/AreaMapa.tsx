"use client";

import { lazy, Suspense, useEffect } from "react";
import type { PontoMapa } from "@/lib/catalogo/tipos";
import s from "../mapa/mapa.module.css";
import type { VarianteMapa } from "../mapa/MapaBrasil";
import { Girando } from "../ui/icones";
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

/**
 * Mapa do catálogo no lugar dele (coluna "painel" ao lado da lista ou "faixa" sobre os cards), ligado à
 * lista: o imóvel sob o mouse acende a cidade no mapa, e a cidade sob o mouse no mapa acende os imóveis
 * dela (`onHover`). Enquanto os pontos de uma busca nova chegam, os anteriores ficam com um aviso discreto.
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
  className?: string;
}) {
  // baixa o código do mapa junto com os pontos (não depois deles)
  useEffect(() => {
    void carregarMapa();
  }, []);

  if (!pontos) return <Espera variante={variante} erro={erro} onTentar={onTentar} className={className} />;
  return (
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
              className="pointer-events-auto inline-flex min-h-11 items-center pointer-fine:min-h-10 gap-2 rounded-full border border-grave/50 bg-tinta px-4 text-[13px] font-medium text-luar shadow-lg"
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
