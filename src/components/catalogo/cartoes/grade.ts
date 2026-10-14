/**
 * Classes de layout compartilhadas pela linha da lista e pelo seu esqueleto (sem "use client": o esqueleto
 * pode ser desenhado num componente de servidor, como um loading.tsx).
 */

/**
 * Grade da linha (também usada pelo esqueleto, para nada pular quando os imóveis chegam). A coluna da foto
 * soma a margem de 12 px da foto (16,75rem = foto de 256 px; 18,25rem = 280 px; 20,75rem = 320 px).
 */
export const GRADE_LINHA =
  "grid grid-cols-1 [grid-template-areas:'foto'_'preco'_'info'_'tags'_'rodape'] @xl:grid-cols-[16.75rem_minmax(0,1fr)] @xl:grid-rows-[auto_1fr_auto_auto] @xl:[grid-template-areas:'foto_preco'_'foto_info'_'tags_tags'_'rodape_rodape'] @2xl:grid-cols-[18.25rem_minmax(0,1fr)] @4xl:grid-cols-[18.25rem_minmax(0,1fr)_15rem] @4xl:grid-rows-[auto_1fr] @4xl:[grid-template-areas:'foto_info_preco'_'foto_tags_rodape'] @5xl:grid-cols-[20.75rem_minmax(0,1fr)_16rem]";

/** Foto da linha: em cima e de ponta a ponta no empilhado; solta, 4:3 e presa ao topo da linha média em diante. */
export const FOTO_LINHA = "rounded-t-[23px] [grid-area:foto] @xl:my-3 @xl:ml-3 @xl:self-start @xl:rounded-xl";
