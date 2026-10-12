/**
 * Formato bruto da API da Leilões Judiciais (search_leiloes / get_leilao_details), com os
 * nomes e tipos vistos na sonda de 11/10/2026 (catálogo de fontes §3.2). A API não documenta o
 * esquema dos resultados, então tudo é opcional e conferido na normalização.
 *
 * LGPD: `nm_usuario` e `id_usuario` (e qualquer campo de usuário, e-mail, CPF/CNPJ, IP ou lances)
 * NÃO fazem parte deste tipo de propósito. O conector apaga esses campos assim que a resposta
 * chega (ver `semCamposPessoais`), antes de qualquer outra etapa.
 */

export interface FotoLJ {
  /** Nome do arquivo, ex.: "I_28963_951615_A.webp". */
  nm_path?: string | null;
  nu_ordem?: number | null;
  imovel_id?: number | null;
  /** Tamanhos publicados: thumb 107x80, thumb_pequena 196x146, thumb_media 327x244, thumb_grande 640x480. */
  tamanho?: Record<string, unknown> | null;
  /** URL pronta (na sonda, sempre no tamanho thumb_pequena). */
  nm_path_completo?: string | null;
  /** Prefixo ao qual se acrescenta "<tamanho>/<nm_path>". */
  nm_path_incompleto?: string | null;
}

export interface AnexoLJ {
  id?: number | null;
  /** Rótulo: "EDITAL", "MATRÍCULA 13.942", "AVALIAÇÃO", "LAUDO DE AVALIAÇÃO"... */
  nm?: string | null;
  nm_path?: string | null;
  /** PDF no bucket S3 público da fonte. */
  nm_path_completo?: string | null;
}

export interface AlertaLJ {
  statusliberacaoextra_id?: number | null;
  nm?: string | null;
  /** HTML com a regra de habilitação (ex.: "necessário estar habilitado para o TRT-2"). */
  nm_alerta?: string | null;
}

export interface LoteLJ {
  /** Número do lote dentro do leilão ("96"). */
  nu?: string | number | null;
  lote_id?: number | string | null;
  leilao_id?: number | string | null;
  imovel_id?: number | string | null;
  nm_titulo_lote?: string | null;
  nm_titulo_leilao?: string | null;
  /** HTML com processo, matrícula, cartório, observações, avaliação e partes (estas mascaradas). */
  nm_descricao?: string | null;
  /** "2026-09-17 13:05:50-03". Pode estar no passado com status ainda "Aberto para Lance". */
  dt_fechamento?: string | null;
  vl_venda?: string | number | null;
  /** Na sonda, igual à avaliação do texto em 7 de 7 lotes conferíveis. Usar com cautela. */
  vl_lanceminimo?: string | number | null;
  /** Lance inicial da praça em vigor. */
  vl_lanceinicial?: string | number | null;
  vl_incremento?: string | number | null;
  /** Preenchido quando há 2ª praça (ver regra de praça na normalização). */
  vl_lanceinicialsegundoleilao?: string | number | null;
  /** Maior lance até agora. */
  vl_lance?: string | number | null;
  nu_parcelas?: number | null;
  vl_percentualentrada?: number | null;
  /** <iframe> do Google Street View; a URL traz latitude e longitude. */
  iframe_streetview?: string | null;
  indice_correcao?: string | null;
  nm_cidade?: string | null;
  nm_estado?: string | null;
  nu_qtdelances?: number | null;
  nm_statuslote?: string | null;
  statuslote_id?: number | null;
  nm_url_leiloeiro?: string | null;
  nm_leiloeiro?: string | null;
  nm_subcategoria?: string | null;
  nm_categoria?: string | null;
  nm_segmento?: string | null;
  bn_exibeavaliacao?: boolean | null;
  fotos?: FotoLJ[] | null;
  anexos?: AnexoLJ[] | null;
  usuariovistorialotexstatusliberacaoextra?: AlertaLJ[] | null;
  /** Campos não previstos ficam acessíveis, mas a normalização só lê os de cima. */
  [campo: string]: unknown;
}

/** O que `coletar` entrega a `normalizar`: o lote e o contexto da coleta. */
export interface LoteColetado {
  lote: LoteLJ;
  /**
   * Quando a resposta foi obtida (ISO 8601 UTC). Base para decidir se o fechamento já passou;
   * não vai para o banco (mudaria o hash a cada coleta).
   */
  coletado_em: string;
  /** Busca que trouxe o lote ("apartamento@SP"), para depuração. */
  consulta?: string | null;
  /** O lote foi completado com get_leilao_details (--detalhes). */
  detalhado?: boolean;
  /** HEAD da foto de capa no tamanho grande (--detalhes); `status` null = falha de rede. */
  capa?: { url: string; status: number | null; em: string } | null;
}
