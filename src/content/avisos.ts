/**
 * Avisos fixos do catálogo, num módulo sem React: a página do imóvel, o rodapé e o relatório em PDF importam daqui.
 * (O relatório importava o aviso de SecaoRiscos.tsx, e com ele os componentes de cliente da página do imóvel: o
 * /relatorio baixava o JavaScript da galeria, dos parecidos e do simulador sem usar.)
 */
export const AVISO_CLASSIFICACAO =
  "A classificação não é garantia: é uma análise automática dos dados publicados pela fonte e não substitui a leitura do edital nem a avaliação de um especialista.";

/**
 * Aviso do simulador. A landing lê daqui; a tela do simulador (src/components/simulador/Simulador.tsx) e o relatório
 * ainda têm a própria cópia, e o teste src/content/site.test.ts confere que as duas dizem o mesmo.
 */
export const AVISO_SIMULADOR =
  "Simulação com premissas genéricas, não é recomendação de investimento; confira edital, custos locais e impostos com um profissional.";
