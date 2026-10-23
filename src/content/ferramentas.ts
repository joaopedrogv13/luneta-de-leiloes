/**
 * Textos das duas seções novas da landing (rodada 4): "Decida com números" e "Nota de localização". Ficam fora de
 * site.ts porque site.ts vai ao navegador (menu, FAQ e formulário são de cliente) e estas seções são só do servidor.
 *
 * Os números das miniaturas NÃO são digitados aqui: o lance máximo vem do simulador de verdade
 * (src/components/sections/dados-landing.ts), os pesos da nota vêm de PESOS_PADRAO (src/lib/catalogo/localizacao.ts)
 * e as cidades do ITBI vêm dos arquivos de base/saida/site/itbi. O teste src/content/site.test.ts confere os textos que
 * citam números ("5 capitais", "três cenários e quatro prazos") com o código e os dados.
 *
 * Regras: nunca "risco zero"; a nota e a classificação não são garantia; o simulador não é recomendação de
 * investimento; placeholders "[X]" ficam visíveis.
 */
import type { TitleParts } from "@/components/ui/Heading";
import type { ChaveComponenteLocal } from "@/lib/catalogo/tipos";

export const DECIDA = {
  eyebrow: "Ferramentas de decisão · plano Luneta",
  title: ["Achou o imóvel? Agora faça a", "conta", "."] satisfies TitleParts,
  lead: "Na página de cada imóvel, a Luneta faz as contas que você faria numa planilha: até quanto vale dar de lance e quanto custa o metro quadrado ali perto. Cada número mostra de onde veio, e você pode mudar qualquer um.",
  tools: [
    {
      icon: "calc",
      plano: "luneta",
      title: "Seu lance máximo",
      text: "Diga quanto quer ganhar e em quanto tempo pretende vender. O simulador desconta comissão, ITBI, cartório, reforma, condomínio, IPTU e imposto, e mostra o maior lance que ainda atinge a sua meta, em três cenários e quatro prazos.",
    },
    {
      icon: "m2",
      plano: "luneta",
      title: "Preço do m² na região",
      text: "A avaliação comparada com a média dos imóveis do mesmo tipo em leilão na rua, no bairro e na cidade. Em 5 capitais, também com o valor das compras registradas na prefeitura (ITBI).",
    },
    {
      icon: "doc",
      plano: "luneta",
      title: "Relatório em PDF",
      text: "A simulação inteira num relatório em PDF, em folhas A4: resultado, cenários, custos linha a linha, preço da região e alertas. Para guardar, imprimir ou levar a um especialista.",
    },
    {
      icon: "casa",
      plano: "todos",
      title: "A página inteira do imóvel",
      text: "Fotos, mapa, documentos, matrícula e o link do leilão num só lugar, com um (i) que explica cada termo do edital.",
    },
  ],
  planos: { luneta: "Luneta", todos: "Todos os planos" },
  cta: "Assinar Luneta",
  demo: "Ver este exemplo na demonstração",
  /** a página do mesmo exemplo na demonstração, que mostra os mesmos números */
  demoHref: "/assinante/imovel/ex-alvo-sp#simulador",
  card: {
    eyebrow: "Seu lance máximo",
    pdf: "Sai em PDF",
    /** "Para render 20% ao ano, vendendo em 12 meses no cenário base:" (meta, prazo e cenário vêm do simulador) */
    pergunta: (objetivo: string, meses: number, cenario: string) => `Para ${objetivo}, vendendo em ${meses} meses no cenário ${cenario}:`,
    resposta: "Dê no máximo",
    minimo: "Lance mínimo hoje",
    /** "sobram R$ 39.778 acima do lance mínimo" (a margem para disputar o lance) */
    folga: ["sobram", "acima do lance mínimo"],
    matriz: "Cenários e prazos",
    matrizUnidade: "lance máximo, em reais",
    matrizSr: "Lance máximo por cenário e prazo de venda, exemplo fictício. Atinge: o lance máximo fica acima do lance mínimo. Não atinge: nem o lance mínimo dá a meta.",
    atinge: "atinge a meta",
    naoAtinge: "não atinge",
    soBase: "Conservador e otimista: na página do imóvel.",
  },
  regiao: {
    eyebrow: "Preço do m² na região · ilustração",
    title: "A avaliação comparada com a média da rua, do bairro e da cidade",
    niveis: ["Muito abaixo", "Abaixo", "Na média", "Acima", "Muito acima"],
    /** {cidades}: lidas dos arquivos do ITBI; {n}: o total de compras (placeholder até a decisão do dono) */
    itbi: "Em {cidades}, também com o valor de {n} compras registradas na prefeitura (ITBI).",
  },
  /**
   * Publicar o total de compras do ITBI (lido dos arquivos no build, hoje ~203 mil)? Decisão do dono: só depois de
   * confirmar as licenças de São Paulo, do Rio de Janeiro e de Porto Alegre. Enquanto for false, aparece "[X]".
   */
  mostrarTotalItbi: false,
  disclaimerPrefixo: "Exemplo fictício.",
} as const;

export const NOTA_LOCAL = {
  eyebrow: "Nota de localização · plano Luneta",
  title: ["Um bom negócio também depende do", "entorno", "."] satisfies TitleParts,
  lead: "Para cada imóvel com endereço localizado, uma nota de 0 a 100 que compara o entorno com onde moram as pessoas da mesma cidade. Uma nota 78 quer dizer: melhor localizado que 78% dos moradores. Você vê cada parte da nota e de onde veio cada dado.",
  steps: [
    {
      n: "01",
      title: "Achamos o ponto do imóvel",
      text: "O endereço publicado vira coordenada pelo cadastro de endereços do IBGE (Censo 2022). Achado só no bairro, a nota sai aproximada, com uma faixa. Achado só na cidade, não damos nota.",
    },
    {
      n: "02",
      title: "Medimos o entorno, num raio de 500 m a 1 km",
      text: "Contamos o que há perto e lemos os dados das quadras em volta. Para estação e parque, vale a distância até o mais perto.",
    },
    {
      n: "03",
      title: "Comparamos com a própria cidade",
      text: "Comparamos com onde moram as pessoas da mesma cidade: a nota vale dentro da cidade, não entre cidades.",
    },
  ],
  more: "Como a nota é calculada",
  demo: "Ver esta nota na demonstração",
  /** a página do mesmo exemplo, já na seção da nota (a mesma nota 91 da miniatura) */
  demoHref: "/assinante/imovel/ex-alvo-sp#localizacao",
  card: {
    /** "Melhor localizado que 91% dos moradores de São Paulo/SP" */
    frase: (nota: number, cidade: string) => `Melhor localizado que ${nota}% dos moradores de ${cidade}`,
    deCem: "de 100",
    peso: "peso",
    /** "Comparado com 11,4 milhões de moradores · endereço localizado no número" (moradores do exemplo: os da cidade) */
    comparado: (moradores: string, precisao: string) => `Comparado com ${moradores} · endereço localizado ${precisao}`,
    /** onde o endereço foi achado (LocalizacaoImovel.precisao) */
    precisao: { numero: "no número", rua: "na rua", bairro: "só no bairro", cidade: "só na cidade" },
    /** riscoRaioM do exemplo: "Área de risco: nenhuma mapeada a menos de 100 m do imóvel." */
    risco: (raio: number) => `Área de risco: nenhuma mapeada a menos de ${raio} m do imóvel.`,
    riscoNota: "O mapeamento não cobre tudo: a ausência de área mapeada não quer dizer que não haja risco.",
    /** a cidade do exemplo não tem mapeamento de risco (coberturaRisco false) */
    semMapeamento: "Área de risco: sem mapeamento para esta cidade.",
    /** a cidade tem mapeamento, mas o ponto não é exato o bastante para conferir (riscoRaioM null) */
    semPonto: "Área de risco: a cidade tem áreas mapeadas, mas sem o endereço exato não conferimos.",
  },
  partesTitulo: "As seis partes da nota",
  partesLead: "Os pesos são os mesmos em todas as cidades; quando falta um dado, o peso dele vai para as outras partes, na mesma proporção. A página do imóvel mostra a nota de cada parte e os números por trás dela.",
  /** O que entra em cada parte e de onde vem. O peso não é digitado aqui: vem de PESOS_PADRAO. */
  partes: {
    servicos: { text: "Mercados, farmácias e padarias a até 500 m; escolas e unidades de saúde a até 1 km.", fonte: "IBGE, Inep e Ministério da Saúde" },
    infra: { text: "Domicílios em rua pavimentada, com calçada, com iluminação pública e com esgoto pela rede.", fonte: "Censo 2022, IBGE" },
    transporte: { text: "Estação de metrô, trem, BRT ou barca mais perto e os pontos de ônibus em volta.", fonte: "OpenStreetMap e Censo 2022" },
    renda: { text: "Renda típica dos responsáveis pelos domicílios em volta, em valores de 2022.", fonte: "Censo 2022, IBGE" },
    comercio: { text: "Comércios e serviços a até 1 km: o movimento da região.", fonte: "Cadastro de endereços do IBGE" },
    lazer: { text: "Parque, praça ou parquinho mais perto.", fonte: "OpenStreetMap" },
  } satisfies Record<ChaveComponenteLocal, { text: string; fonte: string }>,
  risco:
    "Áreas de risco ficam fora da nota: quando há uma área de deslizamento ou inundação mapeada no lugar do imóvel ou perto dele, aparece um alerta. Onde não há mapeamento, a página diz isso, porque a ausência de área mapeada não quer dizer que não haja risco.",
  fora: "Também ficam fora o preço do m², que aparece na região do imóvel, e a segurança, que não tem dado aberto por rua. Os pesos foram conferidos com o valor das compras registradas no ITBI em 5 capitais, mas o preço não entra na nota.",
  /** no celular, as duas notas acima numa linha só (UX-05) */
  foraCurto: "Áreas de risco aparecem como alerta, fora da nota; o preço do m² e a segurança também ficam fora.",
  disclaimer:
    "A nota resume dados abertos e pode estar desatualizada ou errada para um endereço. Não é avaliação do imóvel nem garantia: visite o local antes de decidir.",
} as const;
