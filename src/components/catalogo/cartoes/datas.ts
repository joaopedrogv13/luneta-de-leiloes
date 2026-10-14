/**
 * Datas dos cartões (funções puras; imports relativos, sem "@/": o teste roda em Node puro).
 */
import { data, dataCurta } from "../../../lib/catalogo/rotulos";

/**
 * Data da praça para o cartão: "23 out", com o ano quando não é o deste ano ("3 fev 2027") e o aviso
 * "já passou" quando a data ficou para trás (a fonte pode manter a última praça de um leilão encerrado).
 * Datas sem hora (AAAA-MM-DD) valem até o fim do dia em Brasília.
 */
export function quandoPraca(iso: string, agora: number | null): { texto: string; passou: boolean } {
  const curta = dataCurta(iso);
  if (agora === null) return { texto: curta, passou: false };
  const ano = data(iso).slice(-4);
  const anoAgora = data(new Date(agora).toISOString()).slice(-4);
  const quando = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T23:59:59-03:00`) : Date.parse(iso);
  return {
    texto: /^\d{4}$/.test(ano) && ano !== anoAgora ? `${curta} ${ano}` : curta,
    passou: !Number.isNaN(quando) && quando < agora,
  };
}
