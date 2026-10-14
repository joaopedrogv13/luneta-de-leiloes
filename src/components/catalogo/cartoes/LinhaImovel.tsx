"use client";

import { ListaTags } from "../tags/ListaTags";
import { ARTIGO, LinkTitulo, Local, SUPERFICIE } from "./CartaoImovel";
import { FotoImovel } from "./FotoImovel";
import { FOTO_LINHA, GRADE_LINHA } from "./grade";
import { BlocoPreco, BotaoFavoritar, Fatos, LinhaPraca, SeloImovel, type PropsImovel } from "./partes";

/**
 * Linha da lista: a mesma informação do cartão, com a foto grande à esquerda. O layout segue a largura
 * da própria lista (container query), não a da tela: com o mapa aberto ao lado, a lista estreita e a linha
 * se ajusta sozinha. A foto é sempre 4:3.
 * - estreita (< 36rem, ex.: celular): cartão empilhado, igual ao da grade;
 * - média (36–56rem): foto de 256 px (280 px a partir de 42rem) à esquerda com preço, título, local, fatos e
 *   praça ao lado; tags e rodapé (selo e Favoritar) na largura toda, por baixo;
 * - larga (≥ 56rem): foto de 280 px (320 px a partir de 64rem), informações e tags no meio, e uma coluna de
 *   preço de largura fixa à direita (15–16rem: o meio nunca é espremido) com selo + Favoritar embaixo.
 */
export function LinhaImovel({
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
      className={`${ARTIGO} @container`}
    >
      <div className={`${SUPERFICIE(ativo)} ${GRADE_LINHA}`}>
        {/* a foto fica sempre 4:3: a partir da linha média, solta dentro do cartão (margem de 12 px) e presa ao
            topo; se o texto ao lado for mais alto, sobra cartão embaixo, em vez de esticar e cortar a foto */}
        <FotoImovel imovel={imovel} eager={eager} className={FOTO_LINHA} />

        <div className="px-5 pt-4 [grid-area:preco] @xl:pt-5 @4xl:pt-6 @4xl:pr-6 @4xl:pl-2">
          <BlocoPreco imovel={imovel} tamanho="lg" alinhamento="linha" />
        </div>

        <div className="flex min-w-0 flex-col px-5 pt-4 [grid-area:info] @xl:pt-3.5 @xl:pb-1 @4xl:pt-6 @4xl:pr-4 @4xl:pb-0">
          <LinkTitulo imovel={imovel} hrefImovel={hrefImovel} onHover={onHover} como={tituloComo} className="@4xl:text-lg" />
          <Local imovel={imovel} className="mt-1.5" />
          <Fatos imovel={imovel} className="mt-3.5" />
          <LinhaPraca imovel={imovel} className="mt-3" />
        </div>

        {/* tags numa faixa própria: na linha média passa por baixo da foto e usa a largura toda */}
        <div className="min-w-0 px-5 pt-4 [grid-area:tags] @4xl:pt-4 @4xl:pr-4 @4xl:pb-5">
          <ListaTags
            tags={imovel.tags}
            plano={plano}
            limite={4}
            onUpsell={onUpsell}
            hrefEvidencia={`${hrefImovel}#tags`}
            rotulo={`Tags de risco: ${imovel.titulo}`}
          />
        </div>

        {/* selo e Favoritar: rodapé com divisória (empilhado e média); na larga, no pé da coluna do preço */}
        <div className="px-5 pt-4 pb-4 [grid-area:rodape] @4xl:flex @4xl:items-end @4xl:justify-end @4xl:pt-3 @4xl:pr-6 @4xl:pb-5 @4xl:pl-2">
          <div className="flex items-center justify-between gap-3 border-t border-nevoa/12 pt-3.5 @4xl:flex-col @4xl:items-end @4xl:justify-end @4xl:gap-3 @4xl:border-t-0 @4xl:pt-0">
            <SeloImovel imovel={imovel} plano={plano} />
            <BotaoFavoritar imovel={imovel} plano={plano} favorito={favorito} onFavoritar={onFavoritar} onUpsell={onUpsell} />
          </div>
        </div>
      </div>
    </article>
  );
}
