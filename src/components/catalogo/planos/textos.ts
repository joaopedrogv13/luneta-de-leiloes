/**
 * Textos da trava do plano Lente (src/lib/catalogo/planos.ts tem a regra e o texto curto de cada recurso).
 * - CONVITE: a janela "Estes recursos são da Luneta" (UpgradeModal), por recurso. O título termina em "da Luneta." (a tela
 *   põe "Luneta" em itálico latão); o preço entra depois do texto, com o placeholder visível.
 * - Sem imports com "@/": o teste de vazamento do Lente (src/lib/catalogo/pagina.test.ts) lê estes textos.
 */
import type { Recurso } from "../../../lib/catalogo/tipos";
import { FILTROS_AVANCADOS_CURTO } from "../../../lib/catalogo/planos";
import { FAVORITOS_CHAMADA, FAVORITOS_ROTULO, PRODUTO } from "../../../lib/catalogo/produto";

export interface TextoConvite {
  /** o começo do título: "O simulador é da" (+ " Luneta.") */
  titulo: string;
  texto: string;
}

/** A janela sem recurso (o aviso do topo da lista, "Conhecer a Luneta" do resumo). */
export const CONVITE_PADRAO: TextoConvite = {
  titulo: "Estes recursos são da",
  texto: `Tags de risco e selos, simulador de lance máximo, preço do m² da região, nota de localização, relatório em PDF, filtros avançados, ${FAVORITOS_ROTULO} e prioridade para falar com um especialista.`,
};

export const CONVITE: Record<Recurso, TextoConvite> = {
  tags: {
    titulo: "Tags de risco e selos são da",
    texto: PRODUTO.leituraDoEdital
      ? "Ocupação, dívidas, ações judiciais e matrícula em cada leilão, com o trecho de onde veio cada alerta."
      : "Os alertas que os dados da fonte já mostram (financiamento, direito de preferência do devedor, deságio e praça), com a origem de cada um. Ocupação, dívidas e matrícula entram quando a Luneta ler a página e o edital de cada leilão.",
  },
  selos: {
    titulo: "Os selos são da",
    texto: "Promissor, Na Mira e Alvo: os imóveis que passam nos critérios da Luneta, com o porquê de cada selo.",
  },
  favoritos: {
    titulo: "Favoritos são da",
    texto: FAVORITOS_CHAMADA,
  },
  simulador: {
    titulo: "O simulador é da",
    texto: "Descubra até quanto vale dar de lance para a sua meta, com os custos do leilão, três cenários de venda e o relatório em PDF.",
  },
  relatorio: {
    titulo: "O relatório em PDF é da",
    texto: "O imóvel, a simulação com os seus ajustes, os cenários, a conta linha a linha, o preço da região e os principais alertas, num relatório em folhas A4, pronto para imprimir.",
  },
  regiao: {
    titulo: "O preço da região é da",
    texto: "Compare a avaliação com a média da rua, do bairro e da cidade e, em 5 capitais, com o valor das compras registradas na prefeitura (ITBI). Com buscas prontas nos portais de anúncios.",
  },
  portais: {
    titulo: "As buscas nos portais são da",
    texto: "Anúncios parecidos na mesma rua, no mesmo bairro e na cidade, a um clique, junto com o preço do m² da região.",
  },
  localizacao: {
    titulo: "A nota de localização é da",
    texto: "Uma nota de 0 a 100 para o entorno de cada imóvel com endereço localizado, comparado com o resto da cidade, com cada parte explicada.",
  },
  filtrosAvancados: {
    titulo: "Os filtros avançados são da",
    // a mesma lista da landing e da chamada do painel (FILTROS_PROMETIDOS, em planos.ts)
    texto: `Filtre também por ${FILTROS_AVANCADOS_CURTO}.`,
  },
};

/** O texto da janela para um recurso (ou o padrão). */
export function textoConvite(recurso: Recurso | null | undefined): TextoConvite {
  return recurso ? CONVITE[recurso] : CONVITE_PADRAO;
}

/** "Comparar os planos": a tabela de planos da landing. */
export const ROTA_PLANOS = "/#planos";
