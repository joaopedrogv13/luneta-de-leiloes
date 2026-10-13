/**
 * Compatibilidade: as chaves de deduplicação moraram aqui no núcleo e agora ficam em base/dedup/
 * (endereço em partes, município pelo código IBGE, bairro quando o endereço é fraco). Importe de
 * "../dedup/index.ts" em código novo.
 */
export {
  chaveDedup,
  chaveEndereco,
  chaveMatricula,
  normalizarCartorio,
  normalizarEndereco,
  normalizarMatricula,
  type DadosChave,
} from "../dedup/index.ts";
