/**
 * Fotos da Caixa que NÃO servem para a vitrine da demonstração, olhadas uma a uma (roteiro "fotos" do workflow de
 * prints, scripts/prints/fotos.mjs; folhas de contato no branch coletas-dados, prints/<execução>/). O imóvel continua
 * na base e na prévia; só não é escolhido para a vitrine, que é a primeira impressão de quem chega da landing.
 *
 * Motivos: a "foto" é uma página de documento ou do laudo (tabela, coordenadas, colagem com legendas), um mapa de
 * satélite, a Caixa não publica a foto (404), ou a foto não mostra o imóvel (um carro na frente da fachada, entulho ou
 * lixo em primeiro plano, preto e branco, tremida). A lista só cresce com o que foi visto: um imóvel novo entra na
 * vitrine com a foto que tiver, até alguém rodar o roteiro de novo (PENDENCIAS.md, frente V).
 *
 * Chave: o id do imóvel no site ("caixa-<13 dígitos>"). Sem imports: dado puro.
 */
export const FOTOS_RECUSADAS: Readonly<Record<string, string>> = {
  // execução 40042341202 (23/10/2026)
  "caixa-0000010012200": "colagem de páginas do laudo",
  "caixa-0000010208119": "página de documento (tabela com coordenadas), sem foto do imóvel",
  "caixa-0000010140347": "foto dentro de uma página de documento",
  "caixa-0000010163892": "página de documento com coordenadas",
  "caixa-1444416525310": "mapa de satélite, sem foto do imóvel",
  "caixa-0000010278708": "página de documento em preto e branco",
  "caixa-1555534792493": "colagem de fotos do laudo com legendas",
  "caixa-1444416333470": "a Caixa não publica a foto (404)",
  "caixa-0000010218361": "a Caixa não publica a foto (404)",
  "caixa-0000010218354": "página de documento (tabela com coordenadas), sem foto do imóvel",
  "caixa-0000010218369": "página de documento (tabela com coordenadas), sem foto do imóvel",
  // execução 40042911905 (24/10/2026)
  "caixa-0000010139822": "a Caixa não publica a foto (404)",
  "caixa-0000010218625": "a Caixa não publica a foto (404)",
  "caixa-1444417196337": "foto dentro de uma página de documento",
  "caixa-8444405625325": "foto dentro de uma página de documento",
  "caixa-8444414324901": "mapa de satélite, sem foto do imóvel",
  "caixa-8444414122403": "página de documento em preto e branco",
  "caixa-8444416973460": "mapa de satélite, sem foto do imóvel",
  "caixa-8444412922704": "mapa de satélite, sem foto do imóvel",
  "caixa-8444412843294": "mapa de satélite, sem foto do imóvel",
  "caixa-0000010218349": "página de documento (tabela com coordenadas), sem foto do imóvel",
  "caixa-0000010218367": "página de documento (tabela com coordenadas), sem foto do imóvel",
  "caixa-0000010279392": "colagem de páginas do laudo",
  "caixa-0000010284141": "colagem de páginas do laudo",
  "caixa-8444408311755": "uma van estacionada cobre a fachada",
  // execução 40098277361 (24/10/2026): a fila da vitrine que ainda não tinha sido vista
  "caixa-0000010276271": "foto em preto e branco, só o mato do terreno",
  "caixa-0000010276425": "entulho em primeiro plano",
  "caixa-0000010300587": "lixo na calçada em primeiro plano",
  "caixa-8444429706821": "foto pequena e tremida",
  "caixa-1444401903691": "lixo em primeiro plano e um mapa colado na foto",
  "caixa-0000010170509": "página de documento (tabela com coordenadas), sem foto do imóvel",
  "caixa-0000010155583": "colagem de páginas do laudo",
  "caixa-0000010155584": "colagem de páginas do laudo",
  "caixa-0000010155586": "colagem de páginas do laudo",
  "caixa-0000010156622": "colagem de páginas do laudo",
  "caixa-0000010218510": "a Caixa não publica a foto (404)",
  "caixa-0000010218509": "a Caixa não publica a foto (404)",
  "caixa-1555529910432": "a Caixa não publica a foto (404)",
  "caixa-0000010175621": "a Caixa não publica a foto (404)",
};
