"use client";

import Link from "next/link";
import { bairroUtil } from "@/lib/catalogo/rotulos";
import { ListaTags } from "../tags/ListaTags";
import { FotoImovel } from "./FotoImovel";
import { IconeLocal } from "./icones";
import { BlocoPreco, BotaoFavoritar, complementoSr, Fatos, LinhaPraca, mostrarSelo, SeloImovel, type PropsImovel } from "./partes";

/**
 * Superfície comum de cartão e linha: borda, fundo, elevação no hover (o <article> não se move, só a
 * superfície, para não "tremer" com o mouse na borda), sombra suave só no tema claro, destaque quando o
 * ponto do mapa está sob o mouse e o anel de foco quando o link do título recebe o foco pelo teclado.
 */
export const SUPERFICIE = (ativo: boolean) =>
  `relative rounded-3xl border bg-tinta transition-[translate,box-shadow,border-color] duration-200 ease-luneta motion-reduce:transition-none group-hover/cartao:-translate-y-1 motion-reduce:group-hover/cartao:translate-y-0 group-hover/cartao:shadow-[0_26px_50px_-24px_rgba(0,0,0,.75)] [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_8px_24px_-12px_rgba(15,24,48,.14)] [[data-theme=light]_&]:group-hover/cartao:shadow-[0_2px_4px_rgba(15,24,48,.05),0_26px_48px_-18px_rgba(15,24,48,.26)] has-[[data-titulo]:focus-visible]:outline-2 has-[[data-titulo]:focus-visible]:outline-offset-[3px] has-[[data-titulo]:focus-visible]:outline-latao-texto ${
    ativo ? "border-latao/75 ring-1 ring-latao/45" : "border-nevoa/15 group-hover/cartao:border-nevoa/35"
  }`;

/** O <article> sobe de camada quando um pop-up dele está aberto (senão o cartão vizinho cobriria o pop-up). */
export const ARTIGO = "group/cartao relative has-[[aria-expanded=true]]:z-30";

/**
 * Link do título: o ::after cobre o cartão inteiro (clicar em qualquer ponto abre o imóvel; no teclado é
 * um único link). Botões internos (tags, Favoritar) ficam por cima (z-10) e não navegam.
 */
export function LinkTitulo({
  imovel,
  hrefImovel,
  onHover,
  como: Como = "h3",
  className = "",
}: Pick<PropsImovel, "imovel" | "hrefImovel" | "onHover"> & { como?: "h2" | "h3"; className?: string }) {
  return (
    <Como className={`font-display text-[17px] leading-snug font-semibold tracking-[-0.01em] text-luar ${className}`}>
      {/* sem prefetch (24 por página, rotas dinâmicas): a página do imóvel é pedida no clique */}
      <Link
        data-titulo
        href={hrefImovel}
        prefetch={false}
        onFocus={() => onHover?.(imovel.id)}
        onBlur={() => onHover?.(null)}
        className="after:absolute after:inset-0 after:z-0 after:rounded-3xl after:content-[''] focus-visible:outline-none"
      >
        <span className="line-clamp-2 transition-colors duration-150 group-hover/cartao:text-latao-texto">{imovel.titulo}</span>
        {/* 24 "Casa 2 quartos" na página: para leitor de tela e comando de voz, o local e o lance distinguem */}
        <span className="sr-only">{complementoSr(imovel)}</span>
      </Link>
    </Como>
  );
}

/**
 * "Bairro · Cidade/UF" numa linha: quando não cabe, quem encolhe (com reticências) é o bairro; a cidade e a UF,
 * o que importa, ficam sempre inteiras. Bairro igual à cidade não se repete.
 */
export function Local({ imovel, className = "" }: Pick<PropsImovel, "imovel"> & { className?: string }) {
  const bairro = bairroUtil(imovel);
  return (
    <p className={`flex min-w-0 items-center gap-1.5 text-[13px] leading-snug text-nevoa ${className}`}>
      <IconeLocal className="shrink-0 text-nevoa" />
      {bairro && <span className="min-w-0 truncate">{bairro}</span>}
      <span className="max-w-full shrink-0 truncate">
        {bairro && <span aria-hidden="true">· </span>}
        {bairro && <span className="sr-only">, </span>}
        {imovel.cidade}/{imovel.uf}
      </span>
    </p>
  );
}

/**
 * Cartão da grade: foto grande em cima (4:3, com deságio, tipo e "+N fotos"), preço (lance mínimo grande,
 * avaliação, deságio) com o coração de Favoritar ao lado, título, local, fatos (área, quartos, vagas, R$/m²),
 * praça e data, até 3 tags clicáveis + "+N" e o selo. O cartão inteiro leva à página do imóvel.
 */
export function CartaoImovel({
  imovel,
  plano,
  hrefImovel,
  favorito,
  onFavoritar,
  onUpsell,
  onHover,
  ativo = false,
  eager = false,
  tituloComo = "h3",
}: PropsImovel & { tituloComo?: "h2" | "h3" }) {
  return (
    <article
      data-imovel={imovel.id}
      onMouseEnter={() => onHover?.(imovel.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`${ARTIGO} h-full`}
    >
      <div className={`${SUPERFICIE(ativo)} flex h-full flex-col`}>
        <FotoImovel imovel={imovel} eager={eager} className="rounded-t-[23px]" />
        <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
          <div className="flex items-start justify-between gap-3">
            <BlocoPreco imovel={imovel} />
            <BotaoFavoritar imovel={imovel} plano={plano} favorito={favorito} onFavoritar={onFavoritar} onUpsell={onUpsell} icone className="-mt-0.5 -mr-1" />
          </div>
          <div className="mt-4">
            <LinkTitulo imovel={imovel} hrefImovel={hrefImovel} onHover={onHover} como={tituloComo} />
            <Local imovel={imovel} className="mt-1.5" />
          </div>
          <Fatos imovel={imovel} className="mt-3.5" />
          <LinhaPraca imovel={imovel} className="mt-3" />
          <ListaTags
            tags={imovel.tags}
            plano={plano}
            limite={3}
            onUpsell={onUpsell}
            hrefEvidencia={`${hrefImovel}#tags`}
            rotulo={`Tags de risco: ${imovel.titulo}`}
            className="mt-4"
          />
          {/* selo no pé (com os selos em análise, na prévia, não aparece: a faixa do topo e "Ordenar" já avisam) */}
          {mostrarSelo(imovel, plano) && (
            <div className="mt-auto pt-4">
              <div className="border-t border-nevoa/12 pt-3.5">
                <SeloImovel imovel={imovel} plano={plano} />
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
