/**
 * Corpus de teste das regras de risco, com textos REAIS (mascarados) e o valor esperado de
 * cada tag. Rodado por corpus.test.ts; acrescente um caso a cada falso positivo ou negativo
 * encontrado em produção.
 *
 * Origem dos textos:
 * - "lj:<lote_id>": `nm_descricao` de lotes da API Leilões Judiciais, sonda arquivada de
 *   11/10/2026 (busca "apartamento", SP). Trechos recortados.
 * - "caixa:ficha-2026" e "caixa:ficha-2023": fichas reais detalhe-imovel.asp (10005120, de
 *   08/10/2026, e 1444410505954, de 12/2023), só o texto visível do bloco do imóvel.
 * - "caixa:csv": linhas reais do CSV oficial da Caixa de 08/10/2026 (3 linhas).
 * - "edital:tjpa-minuta": minuta de edital de leilão judicial (JEC de Belém/PA), cláusulas-modelo
 *   (referência em Fbc00/dsai-ap1-proj-leiloes-judiciais, SPEC/referencias).
 * - "edital:E1"/"E2"/"E3": frases literais de três editais reais (judicial SP, judicial PE e
 *   extrajudicial Lei 9.514), citadas em sbroggioadv/leiloes-os-marketplace,
 *   context/clausulas-armadilha-de-edital.md. Só a frase do edital, nada do texto do projeto.
 * - real = false: variação construída a partir de um texto real para cobrir um contrassinal ou
 *   uma forma que o material não trouxe. Está marcada para não ser confundida com dado real.
 *
 * LGPD: nomes de partes, proprietários, credores e usufrutuários viraram [NOME]; CPF e CNPJ
 * viraram [CPF]/[CNPJ]; números de processo foram trocados por números fictícios (mantendo o
 * formato); ids de documentos do PJe e endereços (rua e número) dos lotes judiciais foram
 * retirados, para não ligar o texto a quem mora no imóvel. Ficaram áreas, valores, cidades e
 * matrículas (dados do imóvel, públicos no edital), que as regras usam.
 */
import type { CapacidadesFonte, ImovelNormalizado, TextoFonte, ValorRisco } from "../../tipos.ts";
import type { SlugTag } from "../tags.ts";

export interface CasoCorpus {
  id: string;
  /** De onde veio o texto (ver o topo do arquivo). */
  fonte: string;
  /** `false` = variação construída (não é texto copiado de uma fonte). */
  real: boolean;
  titulo?: string;
  descricao?: string;
  textos?: TextoFonte[];
  /** Campos do imóvel que o caso precisa (o resto vem de um imóvel neutro: judicial, sem preço). */
  imovel?: Partial<ImovelNormalizado>;
  fonteId?: string;
  capacidades?: Partial<CapacidadesFonte>;
  /** Valor esperado de cada tag testada. */
  esperado: Partial<Record<SlugTag, ValorRisco>>;
  /** Tags que, além do valor, precisam sair marcadas (true) ou não (false) para revisão humana. */
  revisao?: Partial<Record<SlugTag, boolean>>;
}

const CAIXA = { fonteId: "caixa_csv", imovel: { judicial: false, comitente: "Caixa Econômica Federal" } } as const;

export const CORPUS: readonly CasoCorpus[] = [
  // -------------------------------------------------------------------------
  // Leilões Judiciais (sonda de 11/10/2026)
  // -------------------------------------------------------------------------
  {
    id: "lj-218898-observacoes",
    fonte: "lj:218898",
    real: true,
    titulo: "Apartamento nº 21 c/ 165,555m² - São Paulo/SP",
    descricao:
      "LOTE 096 – 12:11H) (Proc. 1000000-11.2020.5.02.0090 - 90ª VT São Paulo/SP) O IMÓVEL DE MATRÍCULA Nº 147.300 DO 6º CARTÓRIO DE REGISTRO DE IMÓVEIS DE SÃO PAULO/SP. " +
      "DESCRIÇÃO: O apartamento nº 21, localizado no 2º andar ou 4º pavimento do Edifício Jardins de Guadalupe, com a área útil de 165,555m², a área comum de 269,861m², a área total de 435,416m² e a participação no terreno e coisas comuns do condomínio de 12,5000%, estando-lhe vinculados 1 depósito localizado no 2º subsolo, e 3 vagas de garagem. " +
      "OBSERVAÇÕES: 1) Há indisponibilidade. 2) Há outras penhoras. 3) Eventuais despesas cartorárias decorrentes do registro da arrematação, inclusive a baixa de eventuais gravames (cancelamento de penhoras e/ou indisponibilidades), poderão ficar a cargo do arrematante, na forma do art. 320-G do Provimento CNJ n° 149/2023, ressalvada eventual decisão do Juízo da Execução em sentido contrário, na forma do art. 320-C do Provimento CNJ n° 149/2023. " +
      "4) Nos termos do art. 79, §§ 6º e 7º da Consolidação das Normas da Corregedoria (provimento GP/CR nº 04/2026), o adquirente ficará isento dos débitos tributários cujo fato gerador seja a propriedade, o domínio útil ou a posse dos bens e direitos adquiridos em leilão judicial ou por iniciativa particular, inscritos ou não na dívida ativa, bem como dos débitos não tributários de natureza propter rem relativos ao referido bem, que se sub-rogarão no preço da aquisição, observada a ordem de preferência. " +
      "VALOR DA AVALIAÇÃO: R$ 1.700.000,00 (um milhão e setecentos mil reais). EXEQUENTE: [NOME] EXECUTADO(A)(S): [NOME]; [NOME]; [NOME]",
    imovel: { area_privativa: 165.555, area_total: 435.416 },
    esperado: {
      "matricula-pendencia": "sim",
      "penhora-outros-credores": "sim",
      "custos-extras-altos": "sim",
      "divida-passa-arrematante": "nao",
      "iptu-em-atraso": "desconhecido",
      "condominio-em-atraso": "desconhecido",
      "so-direitos": "desconhecido",
      "cota-parte": "desconhecido",
      "direito-preferencia": "desconhecido",
      "ocupacao-nao-informada": "sim",
      "ocupado": "desconhecido",
      "area-divergente": "desconhecido",
    },
    revisao: { "penhora-outros-credores": false, "custos-extras-altos": true, "matricula-pendencia": true },
  },
  {
    id: "lj-218848-ocupacao-e-cotas-em-dia",
    fonte: "lj:218848",
    real: true,
    descricao:
      "DESCRIÇÃO: Imóvel: O APARTAMENTO nº 162, localizado no 16º pavimento do EDIFÍCIO [nome], com a área privativa real de 143,809m², nela incluída a área correspondente as vagas nºs 93P/94P/95M, e área total real de 261,578m², cabendo-lhe a fração ideal de 2,5763% no terreno descrito na matrícula nº 105.211. " +
      'OBSERVAÇÕES: 1) Certificou o oficial de justiça que: " Ocupam o imóvel, como moradoras, a executada, (...) e sua irmã, (...) Residem no imóvel há mais de vinte anos"; 2) Há indisponibilidades; 3) Há outras penhoras; 4) Há bloqueios; ' +
      "5) A unidade autônoma encontra-se em dia com o pagamento das cotas vencidas até o dia 20 de março de 2026; " +
      '6) Consignou em despacho o juízo da execução que: " a) nos termos do parágrafo único do art. 130 do CTN e art. 110 da Consolidação dos Provimentos da CGJT, sendo hipótese de sub-rogação dos débitos no preço, fica o bem imóvel arrematado nesta hasta pública desembaraçado das dívidas tributárias e fiscais de qualquer órgão da Administração Pública, inscritas ou não na dívida pública, geradas até a data da arrematação, de forma que esses encargos não serão transferidos aos arrematantes; ' +
      "c) as despesas de transferência do bem penhorado, que não se enquadrem na previsão das alíneas antecedentes, tais como: custo de registro no Cartório de Registro de Imóveis, ITBI, transferência junto a órgão de trânsito, entre outras, correrão por conta do arrematante.\"",
    esperado: {
      ocupado: "sim",
      desocupado: "nao",
      "ocupacao-nao-informada": "nao",
      "condominio-em-atraso": "nao",
      "iptu-em-atraso": "desconhecido",
      "divida-passa-arrematante": "nao",
      "penhora-outros-credores": "sim",
      "matricula-pendencia": "sim",
      "cota-parte": "desconhecido",
      "imovel-inteiro": "sim",
    },
    revisao: { ocupado: false, "imovel-inteiro": true },
  },
  {
    id: "lj-218903-hipoteca-e-penhoras-em-outros-processos",
    fonte: "lj:218903",
    real: true,
    descricao:
      "DESCRIÇÃO: o APARTAMENTO nº 91, localizado no 9º andar do Edifício Daniela, com a área útil de 212,50m², a área comum de 62,19m², e a área total de 274,69m², a área ideal no terreno de 43,701421m² e a fração ideal no terreno de 4,284.453%. " +
      "OBSERVAÇÕES: 1) Imóvel objeto de HIPOTECA (os efeitos da arrematação no caso de hipoteca e alienação fiduciária, serão apreciados e decididos pelo(a) Juiz(a) Da Vara de origem, nos termos do art. 85º da Consolidação das Normas da Corregedoria (provimento GP/CR nº 04/2026); 2) Imóvel objeto de PENHORAS e INDISPONIBILIDADES em outros processos; " +
      "3) Nos termos do art. 79, §§ 6º e 7º da Consolidação das Normas da Corregedoria (provimento GP/CR nº 04/2026), o adquirente ficará isento dos débitos tributários cujo fato gerador seja a propriedade, o domínio útil ou a posse dos bens e direitos adquiridos em leilão judicial ou por iniciativa particular, inscritos ou não na dívida ativa, bem como dos débitos não tributários de natureza propter rem relativos ao referido bem, que se sub-rogarão no preço da aquisição, observada a ordem de preferência. Imóvel AVALIADO em R$ 2.700.000,00.",
    esperado: {
      "matricula-pendencia": "sim",
      "penhora-outros-credores": "sim",
      "cota-parte": "desconhecido",
      "so-direitos": "desconhecido",
      "direito-preferencia": "desconhecido",
      "divida-passa-arrematante": "nao",
    },
  },
  {
    id: "lj-222141-saldo-condominial-e-agravo-decidido",
    fonte: "lj:222141",
    real: true,
    titulo: "Apto - 240,80m² - Box 9-10 e 20 - São Caetano do Sul/SP",
    descricao:
      "Apartamento no 152, 15º Andar, do Ed. Chartres, c/ área total 271,11m² (área útil 240,80m² e comum 30,31m²), possuindo o mesmo 5 dormitórios, sendo 2 suítes, 2º CRI 13.941. Imóvel localizado em São Caetano do Sul/SP. (Proc. 0000001-22.2018.8.26.0565) " +
      "(O IMÓVEL PODE SER PARCELADO COM 25% DE ENTRADA E O RESTANTE EM ATÉ 30 MESES) OBS.: O empreendimento é composto por 15 (quinze) pavimentos e 2 (dois) apartamentos por andar. " +
      "OBS.: CASO O VALOR OBTIDO COM A ARREMATAÇÃO NÃO SEJA SUFICIENTE PARA A QUITAÇÃO INTEGRAL DOS DÉBITOS CONDOMINIAIS, O SALDO REMANESCENTE SERÁ DE RESPONSABILIDADE DO(S) ARREMATANTE(S), CONFORME DETERMINADO NO ACÓRDÃO PROFERIDO NO AGRAVO DE INSTRUMENTO Nº 2000001-33.2023.8.26.0000.",
    imovel: { area_privativa: 240.8, area_total: 271.11, aceita_parcelamento: true },
    esperado: {
      "divida-passa-arrematante": "sim",
      "condominio-em-atraso": "sim",
      "leilao-com-recurso": "desconhecido",
      "aceita-financiamento": "desconhecido",
      "area-divergente": "desconhecido",
      "acao-judicial": "desconhecido",
    },
    revisao: { "divida-passa-arrematante": true, "condominio-em-atraso": true },
  },
  {
    id: "lj-217032-iptu-condominio-e-art-1345",
    fonte: "lj:217032",
    real: true,
    descricao:
      "OBSERVAÇÕES: 1) Há indisponibilidades; 2) Há outras penhoras; 3) Consta na Av. 9 hipoteca vencida e não baixada; 4) Há débitos de IPTU em aberto no valor de R$ R$15.977,92 e inscrição na dívida ativa até a data de 25/05/2026; 5) Há débitos de condomínio no valor de R$ 1.029.830,79 até a data de 22/06/2026; " +
      '6) Consignou em despacho o juízo da execução que: " Compete ao interessado no(s) bem(ns) pesquisa dos valores de débitos junto aos diversos Órgãos, sendo certo que a este Juízo só deve informar os ônus de que tenha conhecimento, ou seja, aqueles constantes dos autos, pelo que reputo desnecessária qualquer outro tipo de diligência neste sentido. Não se admitirá retratação sob alegação de existência de eventuais obrigações propter rem. ' +
      'Aplica-se o preceito do art. 1.345 do Código Civil, isto é, o débito em relação ao condomínio, inclusive multas e juros moratórios, fica a cargo do adquirente. Todas as despesas em aberto serão suportadas pelo arrematante." Valor Total da Avaliação do Imóvel em R$ 2.300.000 (dois milhões e trezentos mil reais).',
    imovel: { valor_avaliacao: 2300000, preco: 920000 },
    esperado: {
      "iptu-em-atraso": "sim",
      "condominio-em-atraso": "sim",
      "divida-passa-arrematante": "sim",
      "custos-extras-altos": "sim",
      "penhora-outros-credores": "sim",
      "matricula-pendencia": "sim",
      "desagio-alto": "sim",
      "desagio-baixo": "nao",
    },
  },
  {
    id: "lj-222069-direitos-sobre-apartamento",
    fonte: "lj:222069",
    real: true,
    titulo: "Direitos - Apartamento - 160,780m² - 03 Vagas - São Paulo/SP",
    descricao:
      "Direitos sobre o apartamento nº 161, com a área privativa de 160,780m² e a área comum de 311,966m², perfazendo a área total de 472,746m², localizado no 16º pavimento da TORRE “G-3”, designada “EDIFÍCIO STRELITZIA”, situado no Bairro Morumbi, contando com 03 vagas para guarda de automóveis. " +
      "(Proc. 1000002-44.2022.8.26.0224) Obs.2: O referido imóvel encontra-se registrado em nome de [NOME] ([CNPJ]) e [NOME] ([CNPJ]).",
    imovel: { area_privativa: 160.78, area_total: 472.746 },
    esperado: { "so-direitos": "sim", "imovel-inteiro": "nao", "cota-parte": "desconhecido", "area-divergente": "desconhecido" },
    revisao: { "so-direitos": false },
  },
  {
    id: "lj-221879-terreno-sem-benfeitoria-com-casa-e-hipoteca",
    fonte: "lj:221879 (item 4.1)",
    real: true,
    descricao:
      "Lote c/ 03 Imóveis Urbanos: 4.1) Lote de terreno n. 05, quadra D, com frente para a rua Projetada Seis, do Parque Cesarino Borba, em Iracemápolis/SP, desta comarca e 2ª circunscrição, sem benfeitoria alguma, com área superficial de 250,00 m², medindo 10,00 metros na frente e nos fundos. AVALIAÇÃO: 730.000,00 Identificação: Matrícula: 15081 - 2º Cartório – LIMEIRA/SP. " +
      "Ônus/Observação: R.12 Hipoteca em favor de [NOME], para garantia de dívida de R$ 800.000,00. Obs. Conforme diligências do Oficial de Justiça em 05.12.2017, sobre referido imóvel foi construído um prédio residencial, contendo sala, cozinha, área de serviço, despensa, dois quartos, uma suíte, banheiro social e na área externa garagem coberta para três carros, num total aproximado de 205 m² de construção em bom estado, padrão alto. Proprietários: [NOME].",
    esperado: { "construcao-irregular": "sim", "matricula-pendencia": "sim", "penhora-outros-credores": "desconhecido" },
    revisao: { "construcao-irregular": true },
  },
  {
    id: "lj-221879-nua-propriedade-e-art-843",
    fonte: "lj:221879 (item 4.2)",
    real: true,
    descricao:
      "4.2) Lote de terreno sob o nº 19 da quadra 13, da Estância Balneária Tupy, Itanhaém/SP, encerrando a área de 282,60 m². AVALIAÇÃO: 390.000,00 Identificação: Matrícula: 110394 - 1º Cartório – ITANHAÉM/SP. Ônus/Observação: Obs. Conforme diligência do Sr. Oficial de Justiça em 17/04/2018: O imóvel é um terreno de esquina, há 100 metros da praia, com uma casa térrea de alvenaria. " +
      "Obs. 2 - A penhora recai sobre 100% da nua-propriedade do imóvel, NÃO PODERÁ ser arrematado por lance inferior a 75% da avaliação para garantia da quota-parte do coproprietário não executado. R.09 - Usufruto vitalício em favor de [NOME], CPF [CPF]; AV.10 - INDISPONIBILIDADE DE BENS - PROC. 0000003-55.2015.5.15.0014. Proprietários: [NOME]. " +
      "Obs.: O Lance Mínimo foi calculado considerando os termos do Art. 843, do CPC/2015, ou seja, reservando a cota parte do coproprietário ou cônjuge alheio à execução.",
    esperado: {
      "so-direitos": "sim",
      "cota-parte": "nao",
      "imovel-inteiro": "nao",
      "direito-preferencia": "sim",
      "matricula-pendencia": "sim",
      "penhora-outros-credores": "desconhecido",
    },
    revisao: { "so-direitos": true, "direito-preferencia": true },
  },
  {
    id: "lj-221879-so-art-843",
    fonte: "lj:221879 (item 4.2, sem a frase da nua-propriedade)",
    real: false,
    descricao:
      "4.2) Lote de terreno sob o nº 19 da quadra 13, da Estância Balneária Tupy, Itanhaém/SP, encerrando a área de 282,60 m². AVALIAÇÃO: 390.000,00. " +
      "Obs.: O Lance Mínimo foi calculado considerando os termos do Art. 843, do CPC/2015, ou seja, reservando a cota parte do coproprietário ou cônjuge alheio à execução.",
    esperado: { "imovel-inteiro": "sim", "cota-parte": "nao", "so-direitos": "desconhecido", "direito-preferencia": "sim" },
    revisao: { "imovel-inteiro": true },
  },
  {
    id: "lj-218901-ocupacao-atual-e-condominio-propter-rem",
    fonte: "lj:218901",
    real: true,
    descricao:
      "DESCRIÇÃO: O APARTAMENTO DUPLEX SOB Nº 133, localizado no 13º andar do empreendimento [nome], contendo área real privativa de 165,915 m2, área real comum de 132,479 m2 e área real total de 298,394 m2, correspondendo-lhe a fração ideal de terreno de 3,0361% e coeficiente de proporcionalidade de 0,030361. " +
      'OBSERVAÇÕES: 1) Certificou o Oficial de Justiça que: " Endereço atualizado: [endereço do imóvel] (...) Ocupação Atual: O próprio executado"; 2) Há outra penhora; 3) Há indisponibilidades; 4) Consta na Av. 3 Alienação Fiduciária, Não Baixada, (Conforme documento nos autos, o débito encontra-se quitado); 5) Há débitos condominiais (R$ 8.146,15 até 20/01/2025); ' +
      '6) Conforme despacho do juízo da execução : "(...) fica registrada a isenção dos débitos tributários anteriores à arrematação do bem em hasta pública, pois é considerada como aquisição originária, inexistindo relação jurídica entre o arrematante e o anterior proprietário do bem, sendo certo que os débitos anteriores à arrematação subrogam-se no preço da hasta, por aplicação do artigo 130, parágrafo único do CTN em interpretação que se estende aos bens móveis e semoventes. ' +
      "No mais, ressalte-se que os débitos condominiais não se incluem para fixação do Lance mínimo e são de responsabilidade do adquirente (obrigação propter rem) nos termos do art. 1.345 do CC;",
    imovel: { valor_avaliacao: 1150000, preco: 805000 },
    esperado: {
      ocupado: "sim",
      "penhora-outros-credores": "sim",
      "matricula-pendencia": "sim",
      "condominio-em-atraso": "sim",
      "divida-passa-arrematante": "sim",
      "iptu-em-atraso": "desconhecido",
      "direito-preferencia": "desconhecido",
      "cota-parte": "desconhecido",
      "custos-extras-altos": "desconhecido",
    },
    revisao: { "divida-passa-arrematante": true },
  },
  {
    id: "lj-220169-benfeitoria-nao-averbada-e-parcelamento",
    fonte: "lj:220169",
    real: true,
    titulo: "Ed. Comercial - Terreno c/ 484m² - Presidente Prudente/SP",
    descricao:
      "Prédio Comercial c/ 481,16m², composto por salas para depósito, barracão aos fundos, dois apartamentos (piso superior), terreno c/ 484m², lotes nº 12 e 13, quadra 04, Vila Industrial, em Presidente Prudente/SP. CRI local nº 22.215. (Proc. 1000004-66.2023.8.26.0482). (O IMÓVEL PODE SER PARCELADO COM 25% DE ENTRADA E O RESTANTE EM ATÉ 30 MESES) " +
      "Obs.1: Conforme Laudo de Avaliação, trata-se de um PRÉDIO COMERCIAL DE ALVENARIA, medindo 481,16m², aparentemente com mais de 35 anos de construção. O imóvel praticamente sem manutenção, sem pintura há muitos anos. Atualmente servindo de depósito de caixas e materiais. (benfeitoria não averbada na matrícula imobiliária). " +
      "Obs.2: As benfeitorias acima descritas não se encontram averbadas na matrícula do imóvel, ficando a cargo do arrematante a adoção de todas as providências necessárias à sua regularização perante os órgãos competentes, bem como o pagamento de eventuais despesas, custas, taxas, emolumentos e demais encargos incidentes.",
    imovel: { area_terreno: 484, aceita_parcelamento: true },
    esperado: {
      "construcao-irregular": "sim",
      "custos-extras-altos": "sim",
      ocupado: "sim",
      "aceita-financiamento": "desconhecido",
      "area-divergente": "desconhecido",
      "divida-passa-arrematante": "desconhecido",
    },
    revisao: { ocupado: true, "construcao-irregular": true },
  },
  {
    id: "lj-221884-sem-sinais",
    fonte: "lj:221884",
    real: true,
    descricao:
      "Lote c/ 02 Imóveis: 5.1) Lote nº 07 da Quadra \"FR\" do loteamento \"TERRAS DE SANTA CRISTINA - GLEBA VII\", situado no perímetro urbano de Paranapanema-SP, com área de 450,00m². AVALIAÇÃO: 55.125,00 Identificação: Matrícula: 75522 - Cartório – AVARÉ/SP. Proprietários: [NOME]. " +
      "5.2) Apartamento nº 302, situado no 3º andar ou 5º pavimento do Condomínio Edifício \"Leonardo da Vinci\". AVALIAÇÃO: 1.400.000,00 Identificação: Matrícula: 71167 – 1º Cartório – AMERICANA/SP. Proprietários: [NOME]. (Proc. 0000005-77.2015.5.15.0086 - DIVEX - Piracicaba)",
    textos: [
      {
        origem: "alerta",
        texto:
          "Para enviar lances nesse lote é necessário estar liberado para o TRT 15. OS DOCUMENTOS PODERÃO SER ENVIADOS COMO ANEXO NO CADASTRO OU ENCAMINHADOS POR E-MAIL. APÓS O ENVIO DA DOCUMENTAÇÃO, OBRIGATORIAMENTE É NECESSÁRIO ENTRAR EM CONTATO PELO TELEFONE DISPONIBILIZADO NA PLATAFORMA DO LEILOEIRO.",
      },
      { origem: "titulo_leilao", texto: "LEILÃO DO TRT DA 15ª REGIÃO DE PIRACICABA/SP – HASTA PÚBLICA UNIFICADA Nº 03/2026" },
    ],
    esperado: {
      "ocupacao-nao-informada": "sim",
      ocupado: "desconhecido",
      "condominio-em-atraso": "desconhecido",
      "iptu-em-atraso": "desconhecido",
      "divida-passa-arrematante": "desconhecido",
      "acao-judicial": "desconhecido",
      "penhora-outros-credores": "desconhecido",
      "leilao-com-recurso": "desconhecido",
      "direito-preferencia": "desconhecido",
      "matricula-pendencia": "desconhecido",
      "construcao-irregular": "desconhecido",
      "area-divergente": "desconhecido",
      "cota-parte": "desconhecido",
      "so-direitos": "desconhecido",
      "sem-vistoria": "desconhecido",
      "custos-extras-altos": "desconhecido",
      "primeira-praca": "desconhecido",
      "segunda-praca": "desconhecido",
    },
  },

  // Títulos reais de lotes da página /imoveis e da home da Leilões Judiciais (sonda de 11/10/2026).
  {
    id: "lj-titulo-direitos-apartamento",
    fonte: "lj:titulo",
    real: true,
    titulo: "Cidade Ocidental/GO - Direitos - Apartamento c/ 49,84m²",
    esperado: { "so-direitos": "sim", "imovel-inteiro": "nao", "cota-parte": "desconhecido" },
  },
  {
    id: "lj-titulo-direitos-sobre-casa",
    fonte: "lj:titulo",
    real: true,
    titulo: "Imóvel em leilão",
    textos: [{ origem: "titulo_leilao", texto: "Salvador/BA - Apartamentos - Direitos sobre casa" }],
    esperado: { "so-direitos": "sim" },
  },
  {
    id: "lj-titulo-direitos-por-alienacao",
    fonte: "lj:titulo",
    real: true,
    titulo: "Fazenda Tavares c/ 122,50,00ha - Sacramento/MG (Direitos por Alienação/Hipoteca)",
    esperado: { "so-direitos": "sim" },
  },
  {
    id: "lj-titulo-fracao-50",
    fonte: "lj:titulo",
    real: true,
    titulo: "São José dos Pinhais/PR -- Fração de 50% - Barracão - 328,00m² - Terreno - 422,50m²",
    esperado: { "cota-parte": "sim", "imovel-inteiro": "nao", "so-direitos": "desconhecido" },
    revisao: { "cota-parte": true },
  },
  {
    id: "lj-titulo-fracao-ideal-1-12",
    fonte: "lj:titulo",
    real: true,
    titulo: "São Manuel/SP | Fração ideal 1/12 - Casa - Terreno 198m²",
    esperado: { "cota-parte": "sim" },
  },
  {
    id: "lj-titulo-parte-ideal-de-terreno",
    fonte: "lj:titulo",
    real: true,
    titulo: "Porto Velho/RO | Parte ideal de terreno com 300m²",
    esperado: { "cota-parte": "sim" },
  },
  {
    id: "lj-titulos-sem-sinal",
    fonte: "lj:titulo",
    real: true,
    titulo: "Goiânia/GO - Apartamento - 212,57m²  - Residencial Por do Sol",
    textos: [{ origem: "titulo_leilao", texto: "Louveira/SP | Grande Terreno em Região Industrial c/ 30.591,13m² - Edificações inacabadas" }],
    esperado: { "cota-parte": "desconhecido", "so-direitos": "desconhecido", "construcao-irregular": "desconhecido", "area-divergente": "desconhecido" },
  },

  // -------------------------------------------------------------------------
  // Caixa (ficha e CSV reais)
  // -------------------------------------------------------------------------
  {
    id: "caixa-ficha-2026-despesas",
    fonte: "caixa:ficha-2026",
    real: true,
    ...CAIXA,
    titulo: "Terreno 600 m²",
    descricao: "Terreno, 0.00 de área total, 0.00 de área privativa, 600.00 de área do terreno.",
    textos: [
      {
        origem: "ficha",
        texto:
          "Descrição: . FORMAS DE PAGAMENTO ACEITAS: Exclusivamente à vista (somente recursos próprios). REGRAS PARA PAGAMENTO DAS DESPESAS (caso existam): " +
          "Condomínio: Sob responsabilidade do comprador, até o limite de 10% em relação ao valor de avaliação do imóvel. A CAIXA realizará o pagamento apenas do valor que exceder o limite de 10% do valor de avaliação. " +
          "Tributos: Sob responsabilidade do comprador, quando o débito for inferior a 10% do valor de avaliação. A CAIXA paga integralmente quando o débito for superior a 10% do valor de avaliação.",
      },
    ],
    imovel: { ...CAIXA.imovel, modalidade: "venda_direta", modalidade_fonte: "Venda Direta Online", preco: 50074.26, valor_avaliacao: 150000, area_terreno: 600 },
    esperado: {
      "divida-passa-arrematante": "sim",
      "condominio-em-atraso": "desconhecido",
      "iptu-em-atraso": "desconhecido",
      "aceita-financiamento": "nao",
      "custos-extras-altos": "desconhecido",
      "direito-preferencia": "nao",
      "praca-unica": "sim",
      "desagio-alto": "sim",
      "imovel-inteiro": "sim",
      "ocupacao-nao-informada": "sim",
    },
    revisao: { "divida-passa-arrematante": false },
  },
  {
    id: "caixa-ficha-2026-situacao-em-comentario-html",
    fonte: "caixa:ficha-2026 (HTML)",
    real: true,
    ...CAIXA,
    textos: [
      {
        origem: "ficha",
        texto:
          "<span>Tipo de imóvel: <strong>Terreno        </strong></span><br>\n<!--span>Situação: <strong>Desocupado               </strong></span><br-->\n<span>Número do imóvel: <strong>000001000512-0</strong></span><br>",
      },
    ],
    esperado: { desocupado: "desconhecido", ocupado: "desconhecido", "ocupacao-nao-informada": "sim" },
  },
  {
    id: "caixa-ficha-2023-nao-aceita-financiamento",
    fonte: "caixa:ficha-2023",
    real: true,
    ...CAIXA,
    textos: [
      {
        origem: "ficha",
        texto:
          "Descrição: 2 Quartos, 1 Vaga na Garagem, Varanda/sacada, Área de Serviço, 2 Wc, Sala, Cozinha. . Imóvel NÃO aceita financiamento habitacional. Imóvel NÃO aceita parcelamento. Imóvel NÃO aceita consórcio.",
      },
    ],
    imovel: { ...CAIXA.imovel, modalidade: "venda_online", modalidade_fonte: "Venda Online" },
    esperado: { "aceita-financiamento": "nao", desocupado: "desconhecido", "ocupacao-nao-informada": "sim", "praca-unica": "sim" },
  },

  // -------------------------------------------------------------------------
  // Minuta de edital judicial (cláusulas-modelo): nada aqui é fato sobre um imóvel
  // -------------------------------------------------------------------------
  {
    id: "tjpa-sem-onus-recursos-ou-processos",
    fonte: "edital:tjpa-minuta",
    real: false,
    descricao:
      "Conforme consulta à certidão atualizada do Registro de Imóveis na data 01/08/2026, não há registro ou certificação de ônus, recursos ou processos pendentes incidentes sobre o bem.",
    esperado: { "acao-judicial": "nao", "leilao-com-recurso": "nao", "matricula-pendencia": "nao" },
  },
  {
    id: "tjpa-clausulas-modelo",
    fonte: "edital:tjpa-minuta",
    real: true,
    descricao:
      "EXERCÍCIO DO DIREITO DE PREFERÊNCIA 1. Nas hipóteses em que houver previsão legal do exercício do direito de preferência, este deverá ser exercido em igualdade de condições com eventuais outros licitantes, cabendo ao titular do direito acompanhar o leilão e exercer seu direito de preferência, com base no maior lance. " +
      "9.4 As arrematações nos processos em que constar pendência de recurso estão sujeitas a desfazimento a depender do teor da decisão no recurso pendente nos Tribunais, permanecendo os valores do preço e os pagos a título de honorários de leiloeiro depositados em juízo, em garantia da arrematação, até que os recursos transitem em julgado. " +
      "5. Qualquer que seja a modalidade, assinado o auto pelo(a) juiz(a), pelo(a) arrematante e pelo leiloeiro, a arrematação será considerada perfeita, acabada e irretratável, ainda que venham a ser julgados procedentes os embargos do executado ou a ação autônoma (§4º, do art. 903, do CPC), assegurada a possibilidade de reparação pelos prejuízos sofridos. " +
      "11.2 A ordem de entrega ou mandado de imissão na posse, será expedida depois de efetuado o depósito ou prestadas as garantias do saldo parcelado pelo arrematante, bem como realizado o pagamento da comissão do leiloeiro e das demais despesas da execução. " +
      "13.1 Eventuais informações acerca de ocupação/invasão/desocupação dos imóveis, bem como restrições construtivas, ambientais e outras, deverão ser levantadas pelos interessados na arrematação, posto que não se confundem com ônus, permanecendo mesmo após o leilão. " +
      "13. Para todos os efeitos, considera-se a venda como sendo ad corpus, não cabendo qualquer reclamação posterior em relação as medidas, confrontações e/ou demais peculiaridades das áreas/imóveis, cabendo aos interessados vistoriarem os bens/áreas antes de ofertarem lances no leilão, inclusive no que se refere às edificações existentes nos imóveis, se houver. " +
      "5.1 As ofertas da venda serão apresentadas pelo leiloeiro, ao juízo competente, para análise e não poderão ser inferiores ao valor equivalente a 70% (setenta por cento) do valor da avaliação do bem, acrescida da comissão do leiloeiro de 5% (cinco por cento), seja para pagamento à vista ou parcelado. " +
      "14.1 Em caso de remição/adjudicação ou qualquer fato que venha a suspender o leilão designado, os bens serão tornados indisponíveis para recepção de lances.",
    esperado: {
      "direito-preferencia": "desconhecido",
      "leilao-com-recurso": "desconhecido",
      "acao-judicial": "desconhecido",
      ocupado: "desconhecido",
      desocupado: "desconhecido",
      "ocupacao-nao-informada": "sim",
      "sem-vistoria": "desconhecido",
      "area-divergente": "desconhecido",
      "construcao-irregular": "desconhecido",
      "custos-extras-altos": "desconhecido",
      "matricula-pendencia": "desconhecido",
    },
  },
  {
    id: "tjpa-debitos-anteriores-sub-rogados",
    fonte: "edital:tjpa-minuta",
    real: true,
    descricao:
      "DÉBITOS ANTERIORES 1. A arrematação será considerada originária, sendo subrrogado no preço, quaisquer ônus e débitos que recaiam sobre o bem até a data da efetiva entrega bem ou imissão na posse, inclusive aqueles de natureza proptem rem e condominiais (art. 130, p.u. do CTN c/c art. 908, §1º, do CPC); havendo hipoteca sobre bens imóveis, estas serão levantadas (art. 1.499 do CC); " +
      "12.2 Os ônus e débitos mencionados no presente edital devem ser considerados meramente informativos, não acarretando obrigação do arrematante suportar os mesmos; " +
      "15.1 Caberá ao arrematante arcar com todos os custos e tributos eventualmente incidentes sobre a arrematação e transferência do bem, inclusive, mas não somente, ITBI (junto à Prefeitura Municipal da situação do bem imóvel), ICMS, IRPF e/ou IRPJ, taxas de transferência, dentre outros;",
    esperado: {
      "divida-passa-arrematante": "nao",
      "condominio-em-atraso": "desconhecido",
      "iptu-em-atraso": "desconhecido",
      "matricula-pendencia": "desconhecido",
      ocupado: "desconhecido",
      "custos-extras-altos": "desconhecido",
    },
  },
  {
    id: "tjpa-intimacoes",
    fonte: "edital:tjpa-minuta",
    real: true,
    descricao:
      "1. Caso não sejam encontrados para intimação pessoal, ficam desde já intimados, por este edital, das datas designadas para o 1º e 2º Leilões do bem penhorado e dos demais dados constantes deste expediente: o(s) executado(s), o(s) coproprietário(s), o(s) titular(res) e/ou proprietário(s) de usufruto, uso, habitação, enfiteuse, direito de superfície, concessão de uso especial para fins de moradia ou concessão de direito real de uso, o(s) credor(es) pignoratício(s), hipotecário(s), anticrético(s), fiduciário(s) ou com penhora anteriormente averbada, o(s) promitente(s) comprador(es)/ vendedor(es), a União, o Estado e o Município, no caso de alienação de bem tombado, condômino(s), usufrutuário(s), locatário(s), cônjuge/convivente e o administrador provisório do Espólio.",
    esperado: {
      "penhora-outros-credores": "desconhecido",
      "so-direitos": "desconhecido",
      "cota-parte": "desconhecido",
      "custos-extras-altos": "desconhecido",
      "matricula-pendencia": "desconhecido",
      "primeira-praca": "desconhecido",
      "segunda-praca": "desconhecido",
    },
  },

  // -------------------------------------------------------------------------
  // Frases de editais reais (E1 judicial SP, E2 judicial PE, E3 extrajudicial Lei 9.514)
  // -------------------------------------------------------------------------
  {
    id: "e3-imovel-ocupado-lei-9514",
    fonte: "edital:E3",
    real: true,
    descricao: "Obs: Imóvel ocupado. Desocupação por conta do adquirente, nos termos do art. 30 da lei 9.514/97.",
    imovel: { judicial: false, modalidade_fonte: "Leilão Extrajudicial" },
    esperado: { ocupado: "sim", desocupado: "nao", "ocupacao-nao-informada": "nao", "direito-preferencia": "sim" },
    revisao: { ocupado: false },
  },
  {
    id: "e2-debito-condominial-sub-rogado",
    fonte: "edital:E2",
    real: true,
    descricao:
      "Débito Condominial/Exequendo: R$ 53.374,15 referente aos débitos condominiais (Ago/2025) e R$ 5.337,41 referente aos honorários advocatícios. Eventuais débitos condominiais ficarão sub-rogados no valor da arrematação (artigo 908, §1°, do CPC). Valor da Avaliação: R$ 136.142,37",
    esperado: { "condominio-em-atraso": "sim", "divida-passa-arrematante": "nao" },
  },
  {
    id: "e2-comissao-7",
    fonte: "edital:E2",
    real: true,
    descricao: "COMISSÃO DO LEILOEIRO: O arrematante deverá pagar a título de comissão, o valor correspondente a 7% (sete por cento), sobre o preço de arrematação do bem.",
    esperado: { "custos-extras-altos": "sim" },
  },
  {
    id: "e2-sem-garantia",
    fonte: "edital:E2",
    real: true,
    descricao:
      "OBRIGAÇÕES DO ARREMATANTE: O bem será vendido no estado de conservação em que se encontra, sem garantia, constituindo ônus do interessado verificar suas condições, antes das datas designadas para as alienações judiciais eletrônicas (artigo 9º do Provimento nº 09/2010 do Conselho da Magistratura do Estado de Pernambuco, artigo 18 da Resolução nº 236/2016, CNJ).",
    esperado: { "matricula-pendencia": "desconhecido", "sem-vistoria": "desconhecido", "divida-passa-arrematante": "desconhecido" },
  },
  {
    id: "e1-debitos-catch-all-com-sub-rogacao",
    fonte: "edital:E1",
    real: true,
    descricao:
      'DOS DÉBITOS: Eventuais ônus sobre o imóvel correrão por conta do arrematante, exceto eventuais débitos de IPTU e demais taxas e impostos que serão sub-rogados no valor da arrematação nos termos do Art. 130, "caput" e parágrafo único, do CTN, bem como os débitos de condomínio (propter rem) que também serão subrogados no preço da arrematação, conforme Artigo nº 908, § 1°, CPC. Por fim, eventual hipoteca poderá ser baixada conforme termos do artigo 1.499, do Código Civil, uma vez tendo o referido credor sido intimado.',
    esperado: { "divida-passa-arrematante": "nao", "iptu-em-atraso": "desconhecido", "condominio-em-atraso": "desconhecido", "matricula-pendencia": "desconhecido" },
  },
  {
    id: "e1-penhora-no-rosto-dos-autos",
    fonte: "edital:E1",
    real: true,
    descricao: "Penhora no rosto dos autos sobre eventuais créditos no Processo nº 0000006-88.2024.8.26.0100, em trâmite na 1ª Vara Cível.",
    esperado: { "penhora-outros-credores": "sim" },
  },
  {
    id: "e1-vicio-oculto-e-regularizacao-eventual",
    fonte: "edital:E1",
    real: true,
    descricao:
      "O arrematante adquire os bens no estado de conservação em que os mesmos se encontram e declara que tem pleno conhecimento de suas condições e instalações, nada tendo a reclamar quanto a eventual vício, ainda que oculto, ou defeito decorrente de uso, a qualquer título e a qualquer tempo, assumindo a responsabilidade pela eventual regularização que se fizer necessária.",
    esperado: { "custos-extras-altos": "desconhecido", "construcao-irregular": "desconhecido", "sem-vistoria": "desconhecido" },
  },
  {
    id: "e3-encargos-posteriores",
    fonte: "edital:E3",
    real: true,
    descricao:
      "Todos os tributos e demais encargos, incidentes sobre o imóvel em questão, inclusive encargos condominiais, após a data da efetivação da arrematação são de responsabilidade exclusiva do arrematante.",
    imovel: { judicial: false },
    esperado: { "divida-passa-arrematante": "desconhecido", "condominio-em-atraso": "desconhecido" },
  },
  {
    id: "e3-foro-laudemio-quando-for-o-caso",
    fonte: "edital:E3",
    real: true,
    descricao:
      "Correrão por conta do arrematante, todas as despesas relativas à arrematação do imóvel, tais como, taxas, alvarás, certidões, foro e laudêmio, quando for o caso, escritura, emolumentos cartorários, registros, etc.",
    imovel: { judicial: false },
    esperado: { "custos-extras-altos": "desconhecido", "so-direitos": "nao", "divida-passa-arrematante": "desconhecido" },
  },
  {
    id: "e3-ad-corpus",
    fonte: "edital:E3",
    real: true,
    descricao:
      'A presente venda é feita em caráter "ad corpus", havendo divergência de metragem ou de área, o arrematante não terá direito a exigir do VENDEDOR nenhum complemento de metragem ou de área, o término da venda ou o abatimento do preço do imóvel, sendo responsável por eventual regularização acaso necessária.',
    imovel: { judicial: false },
    esperado: { "area-divergente": "desconhecido", "custos-extras-altos": "desconhecido" },
  },

  // -------------------------------------------------------------------------
  // Variações construídas (contrassinais e formas que o material não trouxe)
  // -------------------------------------------------------------------------
  {
    id: "var-nao-esta-ocupado",
    fonte: "variação",
    real: false,
    descricao: "Conforme auto de constatação, o imóvel não está ocupado.",
    esperado: { desocupado: "sim", ocupado: "nao", "ocupacao-nao-informada": "nao" },
    revisao: { desocupado: true },
  },
  {
    id: "var-desocupado",
    fonte: "variação",
    real: false,
    descricao: "Imóvel desocupado, conforme certidão do oficial de justiça.",
    esperado: { desocupado: "sim", ocupado: "nao" },
    revisao: { desocupado: true },
  },
  {
    id: "var-area-ocupada-pela-construcao",
    fonte: "variação",
    real: false,
    descricao: "Terreno com 300,00 m², sendo a área ocupada pela construção de 120,00 m².",
    esperado: { ocupado: "desconhecido", "ocupacao-nao-informada": "sim" },
  },
  {
    id: "var-ocupado-e-desocupado",
    fonte: "variação",
    real: false,
    descricao: "Imóvel ocupado pelo executado. Na diligência anterior constou imóvel desocupado.",
    esperado: { ocupado: "sim", desocupado: "sim" },
    revisao: { ocupado: true, desocupado: true },
  },
  {
    id: "var-ocupados-ou-desocupados",
    fonte: "variação",
    real: false,
    descricao: "Os imóveis serão vendidos ocupados ou desocupados, no estado em que se encontram.",
    esperado: { ocupado: "desconhecido", desocupado: "desconhecido", "ocupacao-nao-informada": "sim" },
  },
  {
    id: "var-desocupacao-se-ocupado",
    fonte: "variação",
    real: false,
    descricao: "A desocupação do imóvel, se ocupado, correrá por conta do arrematante.",
    esperado: { ocupado: "desconhecido", "ocupacao-nao-informada": "sim" },
  },
  {
    id: "var-intimado-informou-ocupado",
    fonte: "variação",
    real: false,
    descricao: "O executado, intimado, informou que o imóvel está ocupado por inquilino.",
    esperado: { ocupado: "sim" },
  },
  {
    id: "var-debito-condominial-zero",
    fonte: "variação",
    real: false,
    descricao: "Débitos condominiais: R$ 0,00 (nada consta).",
    esperado: { "condominio-em-atraso": "nao" },
  },
  {
    id: "var-agravo-desprovido",
    fonte: "variação",
    real: false,
    descricao: "Agravo de instrumento interposto pelo executado, ao qual o Tribunal negou provimento.",
    esperado: { "leilao-com-recurso": "desconhecido" },
  },
  {
    id: "var-preferencia-coproprietario",
    fonte: "variação",
    real: false,
    descricao: "Fica assegurado ao coproprietário o direito de preferência na arrematação, em igualdade de condições.",
    esperado: { "direito-preferencia": "sim" },
    revisao: { "direito-preferencia": true },
  },
  {
    id: "var-sem-outras-penhoras",
    fonte: "variação",
    real: false,
    descricao: "Não há outras penhoras registradas na matrícula.",
    esperado: { "penhora-outros-credores": "nao" },
  },
  {
    id: "var-embargos-de-terceiro",
    fonte: "variação",
    real: false,
    descricao: "Constam embargos de terceiro opostos pela ex-companheira do executado, ainda pendentes de julgamento.",
    esperado: { "acao-judicial": "sim", "leilao-com-recurso": "desconhecido" },
    revisao: { "acao-judicial": true },
  },
  {
    id: "var-agravo-pendente",
    fonte: "variação",
    real: false,
    descricao: "Há agravo de instrumento interposto pelo executado contra a decisão que designou o leilão.",
    esperado: { "leilao-com-recurso": "sim" },
    revisao: { "leilao-com-recurso": true },
  },
  {
    id: "var-sem-vistoria",
    fonte: "variação",
    real: false,
    descricao: "Não foi possível realizar a vistoria interna; a avaliação foi feita externamente.",
    esperado: { "sem-vistoria": "sim" },
  },
  {
    id: "var-cinquenta-por-cento",
    fonte: "variação",
    real: false,
    descricao: "A penhora recai sobre 50% do imóvel, pertencente ao executado.",
    esperado: { "cota-parte": "sim", "imovel-inteiro": "nao" },
  },
  {
    id: "var-divergencia-de-area",
    fonte: "variação",
    real: false,
    descricao: "Consta do laudo divergência entre a área construída e a área averbada na matrícula.",
    esperado: { "area-divergente": "sim" },
  },
  {
    id: "var-aceita-financiamento-texto",
    fonte: "variação",
    real: false,
    descricao: "Imóvel aceita financiamento bancário, a critério da instituição financeira.",
    imovel: { judicial: false },
    esperado: { "aceita-financiamento": "sim" },
  },
  {
    id: "var-terreno-de-marinha",
    fonte: "variação",
    real: false,
    descricao: "Imóvel situado em terreno de marinha, sob regime de aforamento; o arrematante pagará o laudêmio.",
    esperado: { "so-direitos": "sim", "custos-extras-altos": "sim" },
  },
];
