"use client";

import { ListaTags } from "../tags/ListaTags";
import { ARTIGO, LinkTitulo, Local, SUPERFICIE } from "./CartaoImovel";
import { FotoImovel } from "./FotoImovel";
import { FOTO_LINHA, GRADE_LINHA } from "./grade";
import { BlocoPreco, BotaoFavoritar, Fatos, LinhaPraca, mostrarSelo, SeloImovel, type PropsImovel } from "./partes";

/**
 * Linha da lista: a mesma informação do cartão, com a foto à esquerda. O layout segue a largura da própria
 * lista (container query), não a da tela: com o mapa aberto ao lado, a lista estreita e a linha se ajusta
 * sozinha (ver GRADE_LINHA). A foto é sempre 4:3.
 * - compacta (celular): foto pequena, preço, título, local e fatos; o coração no canto (4 a 5 imóveis por tela);
 * - média (notebook com o mapa): foto grande, e ao lado tudo, até as tags e o selo; a linha tem a altura da
 *   foto (2 a 3 imóveis por tela);
 * - larga: coluna de preço à direita, com o selo e "Favoritar" no pé.
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
  const selo = mostrarSelo(imovel, plano);
  return (
    <article
      data-imovel={imovel.id}
      onMouseEnter={() => onHover?.(imovel.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`${ARTIGO} @container`}
    >
      <div className={`${SUPERFICIE(ativo)} ${GRADE_LINHA}`}>
        {/* no compacto, a foto é pequena: sem os selos por cima (o deságio está no preço) e sem o texto do aviso */}
        <FotoImovel imovel={imovel} eager={eager} className={FOTO_LINHA} enxutaNoCompacto />

        <div className="min-w-0 pt-3 pr-3 pl-3 [grid-area:preco] @xl:px-5 @xl:pt-5 @xl:pr-16 @4xl:pt-6 @4xl:pr-6 @4xl:pl-2">
          <BlocoPreco imovel={imovel} tamanho="lg" alinhamento="linha" compacto />
        </div>

        <div className="flex min-w-0 flex-col px-3 pt-1.5 pb-3 [grid-area:info] @xl:px-5 @xl:pt-3 @xl:pb-5 @4xl:pt-6 @4xl:pr-4">
          <LinkTitulo imovel={imovel} hrefImovel={hrefImovel} onHover={onHover} como={tituloComo} className="text-[15px] @xl:text-[17px] @4xl:text-lg" />
          <Local imovel={imovel} compacto className="mt-1 @xl:mt-1.5" />
          <Fatos imovel={imovel} className="mt-2 @xl:mt-3.5" />
          <LinhaPraca imovel={imovel} className="mt-3 @max-xl:hidden" />
          {/* tags (até 3 + "+N") e selo dentro da coluna: a linha fica com a altura da foto */}
          <ListaTags
            tags={imovel.tags}
            plano={plano}
            limite={3}
            onUpsell={onUpsell}
            hrefEvidencia={`${hrefImovel}#tags`}
            rotulo={`Tags de risco: ${imovel.titulo}`}
            className="mt-3.5 @max-xl:hidden"
          />
          {selo && (
            <div className="mt-3.5 @max-xl:hidden @4xl:hidden">
              <SeloImovel imovel={imovel} plano={plano} tamanho={24} />
            </div>
          )}
        </div>

        {/* larga: selo e Favoritar no pé da coluna do preço */}
        <div className="hidden px-6 pt-3 pb-5 pl-2 [grid-area:rodape] @4xl:flex @4xl:flex-col @4xl:items-end @4xl:justify-end @4xl:gap-3">
          {selo && <SeloImovel imovel={imovel} plano={plano} />}
          <BotaoFavoritar imovel={imovel} plano={plano} favorito={favorito} onFavoritar={onFavoritar} onUpsell={onUpsell} />
        </div>

        {/* compacta e média: o coração no canto de cima */}
        <BotaoFavoritar
          imovel={imovel}
          plano={plano}
          favorito={favorito}
          onFavoritar={onFavoritar}
          onUpsell={onUpsell}
          icone
          className="!absolute top-2 right-2 @xl:top-4 @xl:right-4 @4xl:hidden"
        />
      </div>
    </article>
  );
}
