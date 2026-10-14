/**
 * Classes de layout compartilhadas pela linha da lista e pelo seu esqueleto (sem "use client": o esqueleto
 * pode ser desenhado num componente de servidor, como um loading.tsx).
 */

/**
 * Grade da linha (também usada pelo esqueleto, para nada pular quando os imóveis chegam), pela largura da
 * própria lista (container query). A coluna da foto soma a margem de 12 px da foto.
 * - compacta (< 36rem, celular): foto de 128 px (8.75rem) à esquerda; ao lado, o preço e, embaixo dele,
 *   título, local e fatos (uns 150 px por imóvel: 4 a 5 por tela);
 * - média (36–56rem, a lista ao lado do mapa no notebook): foto de 256, 280 e 328 px (16.75, 18.25 e
 *   21.25rem); ao lado, o preço e, embaixo, título, local, fatos, praça, tags e selo; o coração no canto;
 * - larga (≥ 56rem): foto de 328 e 360 px, informações e tags no meio, coluna de preço à direita (15–16rem)
 *   com selo e Favoritar no pé.
 */
export const GRADE_LINHA =
  "grid grid-cols-[8.75rem_minmax(0,1fr)] grid-rows-[auto_1fr] [grid-template-areas:'foto_preco'_'foto_info'] @xl:grid-cols-[16.75rem_minmax(0,1fr)] @2xl:grid-cols-[18.25rem_minmax(0,1fr)] @3xl:grid-cols-[21.25rem_minmax(0,1fr)] @4xl:grid-cols-[21.25rem_minmax(0,1fr)_15rem] @4xl:[grid-template-areas:'foto_info_preco'_'foto_info_rodape'] @5xl:grid-cols-[23.25rem_minmax(0,1fr)_16rem]";

/** Foto da linha: solta dentro do cartão (margem de 12 px), 4:3 e presa ao topo. */
export const FOTO_LINHA = "my-3 ml-3 self-start rounded-xl [grid-area:foto] @max-xl:rounded-lg";
