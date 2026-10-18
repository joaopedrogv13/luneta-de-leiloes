"use client";

import { useCallback, useState } from "react";
import { numero, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import type { ImovelResumo } from "@/lib/catalogo/tipos";
import { IconeCamera } from "./icones";
import { IlustracaoTipo } from "./Ilustracao";

/** Fotos que já falharam nesta visita: o cartão que volta (filtro, página) vai direto ao desenho, sem pedir de novo. */
const FALHAS = new Set<string>();

/**
 * Vidro escuro dos selos sobre a foto: fixo nos dois temas (a foto é que manda no fundo). Sem backdrop-blur:
 * são 2 ou 3 selos por cartão e 24 cartões por página, e o desfoque de fundo pesa na rolagem do celular;
 * com 78% de opacidade o texto fica legível sobre qualquer foto (branco puro por trás: 9:1).
 */
const VIDRO = "bg-[#070b16]/78 text-white ring-1 ring-white/12";

export type DadosFoto = Pick<ImovelResumo, "foto" | "tipo" | "totalFotos" | "desagio"> & { id?: string };

/**
 * O que dizer quando não há foto, pela causa (nunca afirmar o que não foi conferido): a fonte não publicou,
 * é um exemplo fictício, ou a foto existe na fonte e só não carregou (rede, bloqueio do site da fonte).
 */
function textoSemFoto(imovel: DadosFoto, falhou: boolean): { titulo: string; detalhe?: string } {
  if (falhou) return { titulo: "A foto não carregou do site da fonte", detalhe: "Veja no anúncio, na página do imóvel." };
  if (imovel.id?.startsWith("ex-")) return { titulo: "Exemplo fictício: sem foto" };
  return { titulo: "Sem foto na fonte" };
}

/**
 * Foto do imóvel em proporção fixa (4:3), direto da fonte: <img> simples (nada de baixar ou re-hospedar),
 * preguiçosa, sem referrer, com fade-in ao carregar. Sem foto, ou se ela falhar, entra a ilustração do tipo
 * com o motivo ("Sem foto na fonte", "A foto não carregou do site da fonte", "Exemplo fictício: sem foto";
 * `data-foto` = ausente | falhou | carregando | ok, para medir). Enquanto carrega, a ilustração fica
 * esmaecida por baixo (nunca um buraco em branco).
 *
 * Selos sobrepostos (`selos`): deságio grande no canto superior esquerdo ("+12% acima da avaliação" quando
 * o lance passa da avaliação), tipo no superior direito e "+N fotos" no inferior direito. O deságio aqui é
 * visual (aria-hidden): o bloco de preço do cartão o repete em texto.
 *
 * Dentro de um `group/cartao`, a foto aproxima de leve no hover.
 */
export function FotoImovel({
  imovel,
  selos = true,
  eager = false,
  alt = "",
  enxutaNoCompacto = false,
  className = "",
}: {
  imovel: DadosFoto;
  selos?: boolean;
  /**
   * dentro de um @container estreito (< 36rem: a linha compacta do celular), a foto é pequena: sem os selos
   * por cima e sem o texto do aviso (o preço ao lado já diz o deságio)
   */
  enxutaNoCompacto?: boolean;
  /** primeira dobra: carrega já (o padrão é preguiçoso) */
  eager?: boolean;
  /** texto alternativo; vazio (padrão) quando o título do imóvel já está ao lado */
  alt?: string;
  className?: string;
}) {
  const [falhou, setFalhou] = useState<string | null>(null);
  const [carregou, setCarregou] = useState<string | null>(null);
  const src = imovel.foto && imovel.foto !== falhou && !FALHAS.has(imovel.foto) ? imovel.foto : null;
  const pronta = src !== null && carregou === src;

  const falha = useCallback((s: string | null) => {
    if (!s) return;
    FALHAS.add(s);
    setFalhou(s);
  }, []);
  // A foto pode ter carregado (ou falhado) antes da hidratação, quando onLoad/onError ainda não existiam.
  const conferir = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img?.complete) return;
      const s = img.getAttribute("src");
      if (img.naturalWidth > 0) setCarregou(s);
      else falha(s);
    },
    [falha],
  );

  const semFoto = src === null;
  const falhouAqui = semFoto && !!imovel.foto;
  const aviso = semFoto ? textoSemFoto(imovel, falhouAqui) : null;
  // "+N fotos" só sobre a foto: sobre o desenho ("Sem foto") seria contraditório
  const outras = semFoto ? 0 : Math.max(0, imovel.totalFotos - 1);

  return (
    <div
      data-foto={semFoto ? (falhouAqui ? "falhou" : "ausente") : pronta ? "ok" : "carregando"}
      className={`relative isolate aspect-[4/3] overflow-hidden ${className}`}
      style={{
        background:
          "radial-gradient(120% 70% at 50% 108%, rgba(201,162,77,.16), transparent 62%), linear-gradient(180deg, rgba(var(--fog-rgb),.13), rgba(var(--fog-rgb),.03) 70%), var(--noite)",
      }}
    >
      <IlustracaoTipo
        tipo={imovel.tipo}
        className={`transition-opacity duration-300 motion-reduce:transition-none ${semFoto ? "opacity-100" : "opacity-45"}`}
      />
      {aviso && (
        <p className={`absolute inset-x-0 bottom-[8%] px-4 text-center text-[13px] leading-snug font-medium text-nevoa sm:text-xs ${enxutaNoCompacto ? "@max-xl:sr-only" : ""}`}>
          {aviso.titulo}
          {aviso.detalhe && <span className="mt-0.5 block text-xs font-normal max-[380px]:hidden sm:text-[11px]">{aviso.detalhe}</span>}
        </p>
      )}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- a foto fica na fonte: o next/image a baixaria e re-hospedaria
        <img
          key={src}
          ref={conferir}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setCarregou(src)}
          onError={() => falha(src)}
          className={`absolute inset-0 size-full object-cover transition-[opacity,scale] duration-500 ease-luneta group-hover/cartao:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover/cartao:scale-100 ${
            pronta ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {selos && (
        <div className={enxutaNoCompacto ? "contents @max-xl:hidden" : "contents"}>
          {/* leve sombra no topo e na base: os selos ficam legíveis sobre qualquer foto */}
          {pronta && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,11,22,.38)_0%,transparent_30%,transparent_72%,rgba(7,11,22,.32)_100%)]"
            />
          )}
          <SeloDesagio desagio={imovel.desagio} />
          <span className={`absolute top-3 right-3 rounded-full px-2.5 py-1.5 text-[11px] leading-none font-semibold tracking-[0.04em] ${VIDRO}`}>
            {imovel.tipo === "outro" ? "Outro tipo" : (TIPO_ROTULO[imovel.tipo] ?? "Imóvel")}
          </span>
          {outras > 0 && (
            <span className={`absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] leading-none font-semibold tabular-nums ${VIDRO}`}>
              <IconeCamera size={13} />
              {outras === 1 ? "+1 foto" : `+${numero(outras)} fotos`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Deságio grande sobre a foto (visual; o texto acessível fica no bloco de preço). Número em cima, legenda embaixo. */
function SeloDesagio({ desagio }: { desagio: number | null }) {
  // lance acima de 5× a avaliação (deságio abaixo de −400%): valor fora do padrão, o preço ao lado avisa
  if (desagio === null || desagio < -400) return null;
  const numero_ = desagio > 0 ? `−${desagio}%` : desagio < 0 ? `+${numero(Math.abs(desagio))}%` : "0%";
  const legenda = desagio > 0 ? "deságio" : desagio < 0 ? "acima da avaliação" : "igual à avaliação";
  return (
    <span aria-hidden="true" className={`absolute top-3 left-3 flex flex-col items-start rounded-2xl px-3 pt-2 pb-1.5 ${VIDRO}`}>
      <span
        className={`font-display leading-none font-bold tracking-[-0.03em] tabular-nums ${
          desagio > 0 ? "text-[26px] text-latao-claro" : "text-[20px] text-white"
        }`}
      >
        {numero_}
      </span>
      <span className="mt-1 text-[10px] leading-none font-semibold tracking-[0.12em] whitespace-nowrap text-white/80 uppercase">{legenda}</span>
    </span>
  );
}
