/**
 * Configuração comum do radar de editais: janela de datas e listas lidas do ambiente.
 *
 * A CLI só repassa --uf, --arquivo, --limite e --detalhes aos conectores; o período e as
 * listas (tribunais, municípios, termos) vêm de variáveis de ambiente, lidas na hora da coleta:
 *
 *   LUNETA_RADAR_DESDE=AAAA-MM-DD   início da janela (padrão: véspera de ATE)
 *   LUNETA_RADAR_ATE=AAAA-MM-DD     fim da janela (padrão: hoje em Brasília)
 *   LUNETA_RADAR_DIAS=N             tamanho padrão da janela quando DESDE falta (padrão 1 = ontem e hoje)
 *
 * Ex.: LUNETA_RADAR_DESDE=2026-10-01 LUNETA_RADAR_ATE=2026-10-08 npm run base:coletar -- pncp
 */
import { dataExiste, hojeBrasilia } from "../../util/data.ts";

export interface Janela {
  /** Primeiro dia, "AAAA-MM-DD". */
  desde: string;
  /** Último dia, "AAAA-MM-DD" (inclusive). */
  ate: string;
}

export type Ambiente = Readonly<Record<string, string | undefined>>;

/** Janela máxima aceita (a API do PNCP recusa períodos acima de 365 dias). */
export const MAX_DIAS_JANELA = 365;

function ehDia(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return m !== null && dataExiste(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Soma `n` dias (pode ser negativo) a "AAAA-MM-DD". */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dias entre duas datas "AAAA-MM-DD" (ate − desde). */
export function diferencaDias(desde: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

/** "2026-10-08" → "20261008" (formato do PNCP). */
export function diaCompacto(dia: string): string {
  return dia.replaceAll("-", "");
}

/** Todos os dias da janela, em ordem. */
export function diasDaJanela(janela: Janela): string[] {
  const dias: string[] = [];
  for (let dia = janela.desde; dia <= janela.ate; dia = somarDias(dia, 1)) dias.push(dia);
  return dias;
}

/** Confere formato, ordem e tamanho da janela; lança erro com mensagem clara. */
export function validarJanela(janela: Janela, maxDias = MAX_DIAS_JANELA): Janela {
  if (!ehDia(janela.desde)) throw new Error(`Início da janela inválido (use AAAA-MM-DD): ${janela.desde}`);
  if (!ehDia(janela.ate)) throw new Error(`Fim da janela inválido (use AAAA-MM-DD): ${janela.ate}`);
  if (janela.desde > janela.ate) throw new Error(`Janela invertida: ${janela.desde} é depois de ${janela.ate}.`);
  const dias = diferencaDias(janela.desde, janela.ate) + 1;
  if (dias > maxDias) throw new Error(`Janela de ${dias} dias passa do limite de ${maxDias}; divida em períodos menores.`);
  return janela;
}

/**
 * Janela da coleta: LUNETA_RADAR_DESDE/ATE, senão os últimos LUNETA_RADAR_DIAS dias (padrão:
 * ontem e hoje, em Brasília). A sobreposição de um dia entre execuções diárias é proposital:
 * editais repetidos só renovam `ultima_vez_em`.
 */
export function janelaDoAmbiente(agora: Date, ambiente: Ambiente = process.env, maxDias = MAX_DIAS_JANELA): Janela {
  const ate = ambiente.LUNETA_RADAR_ATE?.trim() || hojeBrasilia(agora);
  if (!ehDia(ate)) throw new Error(`Fim da janela inválido (use AAAA-MM-DD): ${ate}`);
  const diasTexto = ambiente.LUNETA_RADAR_DIAS?.trim();
  const dias = diasTexto ? Number(diasTexto) : 1;
  if (!Number.isInteger(dias) || dias < 0) throw new Error(`LUNETA_RADAR_DIAS precisa ser inteiro >= 0: ${diasTexto}`);
  const desde = ambiente.LUNETA_RADAR_DESDE?.trim() || somarDias(ate, -dias);
  return validarJanela({ desde, ate }, maxDias);
}

/**
 * LUNETA_RADAR_ROBOTS=1 liga a checagem de robots.txt também nas APIs documentadas do radar
 * (desligada por padrão: ver o topo de comum.ts). Útil se a revisão jurídica preferir.
 */
export function robotsLigado(ambiente: Ambiente): boolean {
  return /^(1|sim|true)$/i.test(ambiente.LUNETA_RADAR_ROBOTS?.trim() ?? "");
}

/** Lista separada por vírgula, ponto e vírgula ou espaço; vazia se a variável faltar. */
export function listaDoAmbiente(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** Lista separada só por vírgula ou ponto e vírgula (para termos com espaço, como "hasta pública"). */
export function termosDoAmbiente(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}
