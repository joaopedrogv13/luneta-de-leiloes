/**
 * Datas brasileiras. A base guarda:
 * - dia sem hora como "AAAA-MM-DD";
 * - data e hora como ISO 8601 em UTC ("2026-10-06T13:12:00.000Z").
 * Horários de leilão sem fuso explícito são tratados como horário de Brasília (-03:00).
 */

export const FUSO_BRASILIA = "-03:00";

const MESES: Readonly<Record<string, number>> = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5,
  junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10,
  novembro: 11, nov: 11, dezembro: 12, dez: 12,
};

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Confere se o dia existe (rejeita 31/02, 29/02 fora de ano bissexto etc.). */
export function dataExiste(ano: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (ano < 1900 || ano > 2200 || mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function anoCompleto(ano: number): number {
  return ano < 100 ? 2000 + ano : ano;
}

function dataIso(ano: number, mes: number, dia: number): string | null {
  return dataExiste(ano, mes, dia) ? `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}` : null;
}

/**
 * Lê só o dia, em "AAAA-MM-DD". Aceita "08/10/2026", "8/10/26", "08.10.2026", "08-10-2026",
 * "2026-10-08", "8 de outubro de 2026" e "08 out 2026". Ignora texto e hora ao redor.
 */
export function lerDataBR(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return dataIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(texto);
  if (br) return dataIso(anoCompleto(Number(br[3])), Number(br[2]), Number(br[1]));
  const semAcentos = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const extenso = /(\d{1,2})(?:º|o)?\s*(?:de\s+)?([a-z]{3,9})\.?\s*(?:de\s+)?(\d{4})/.exec(semAcentos);
  if (extenso) {
    const mes = MESES[extenso[2] ?? ""];
    if (mes) return dataIso(Number(extenso[3]), mes, Number(extenso[1]));
  }
  return null;
}

function normalizarFuso(fuso: string): string {
  if (fuso === "Z" || fuso === "z") return "Z";
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(fuso);
  if (!m) return FUSO_BRASILIA;
  return `${m[1]}${m[2]}:${m[3] ?? "00"}`;
}

/**
 * Lê data e hora e devolve ISO 8601 em UTC. Sem hora, devolve só o dia ("AAAA-MM-DD").
 * Aceita "06/10/2026 10:12:00", "06/10/2026 às 10h12", "2026-09-17 13:05:50-03" e ISO completo.
 * Sem fuso explícito, usa `fuso` (padrão: Brasília).
 */
export function lerDataHoraBR(valor: unknown, fuso: string = FUSO_BRASILIA): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  const iso = /(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?/i.exec(texto);
  let ano: number, mes: number, dia: number, hora: number, minuto: number, segundo: number;
  let fusoLido: string | undefined;
  if (iso) {
    [ano, mes, dia, hora, minuto, segundo] = [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6] ?? "0"].map(Number) as [number, number, number, number, number, number];
    fusoLido = iso[7];
  } else {
    if (/\d{4}-\d{2}-\d{2}/.test(texto)) return lerDataBR(texto);
    const br = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)(?:\s*(?:,|as|às|a partir das|-)?\s*(\d{1,2})\s*(?::|h)\s*(\d{2})?(?::(\d{2}))?)?/i.exec(texto);
    if (!br) return lerDataBR(texto);
    if (br[4] === undefined) return dataIso(anoCompleto(Number(br[3])), Number(br[2]), Number(br[1]));
    ano = anoCompleto(Number(br[3]));
    mes = Number(br[2]);
    dia = Number(br[1]);
    hora = Number(br[4]);
    minuto = Number(br[5] ?? "0");
    segundo = Number(br[6] ?? "0");
  }
  if (!dataExiste(ano, mes, dia) || hora > 23 || minuto > 59 || segundo > 59) return null;
  const local = `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}T${doisDigitos(hora)}:${doisDigitos(minuto)}:${doisDigitos(segundo)}`;
  const instante = new Date(local + normalizarFuso(fusoLido ?? fuso));
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

/** Agora em ISO 8601 UTC. */
export function agoraIso(agora: Date = new Date()): string {
  return agora.toISOString();
}

/** Dia corrente em Brasília, "AAAA-MM-DD". */
export function hojeBrasilia(agora: Date = new Date()): string {
  const deslocado = new Date(agora.getTime() - 3 * 3600_000);
  return deslocado.toISOString().slice(0, 10);
}

/**
 * Converte uma data da base ("AAAA-MM-DD" ou ISO) em milissegundos, para comparar.
 * Dia sem hora vale como o fim daquele dia em Brasília (23:59:59), para que uma praça
 * "de hoje" ainda conte como futura durante o dia.
 */
export function instanteDe(data: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const t = new Date(`${data}T23:59:59${FUSO_BRASILIA}`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const t = new Date(data).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Confere o formato aceito pela base: "AAAA-MM-DD" válido ou ISO 8601 com fuso. */
export function ehDataDaBase(valor: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-").map(Number) as [number, number, number];
    return dataExiste(a, m, d);
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(valor) && !Number.isNaN(new Date(valor).getTime());
}
