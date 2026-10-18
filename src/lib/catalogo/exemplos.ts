/**
 * Conjunto "exemplos" (a /assinante, demonstração pública): os 6 exemplos fictícios de
 * src/content/examples.ts no formato do catálogo (ImovelDetalhe).
 *
 * Posição: a sede real de cada cidade (mesmas coordenadas do IBGE que a base usa para a Caixa). Área,
 * quartos, vagas, natureza, pagamento e praças são FICTÍCIOS, coerentes com o título e o preço de cada
 * exemplo. Selos são os dos exemplos (aqui os selos funcionam). As tags são casadas pelo rótulo com os
 * slugs de base/riscos/tags.ts; "Sem dívidas identificadas" e "Documentação regular" não existem no
 * catálogo de tags da base e ficam com slug próprio (ver EXTRAS_TAG).
 *
 * Recebe a lista de exemplos (quem chama importa LISTINGS): assim este módulo roda em Node puro, sem
 * o alias "@/" que src/content/examples.ts usa.
 */
import type { Listing } from "../../content/examples";
import { TAGS } from "../../../base/riscos/tags";
import { diaBrasilia } from "./consulta";
import { localizacaoExemplo } from "./localizacao";
import { linkGoogleMaps } from "./texto";
import type { ImovelDetalhe, ImovelResumo, LocalizacaoImovel, Praca, PracaDetalhe, Selo, Severidade, TagDetalhe, TipoImovel } from "./tipos";

export const FONTE_EXEMPLO = { id: "exemplo", nome: "Exemplo fictício" } as const;

/** Tags dos exemplos que não estão nas 26 da base: slug próprio, sempre como exemplo. */
const EXTRAS_TAG: Record<string, { slug: string; rotulo: string; severidade: Severidade }> = {
  "Sem dívidas identificadas": { slug: "sem-dividas-identificadas", rotulo: "Sem dívidas identificadas", severidade: "positivo" },
  "Documentação regular": { slug: "documentacao-regular", rotulo: "Documentação regular", severidade: "positivo" },
};

interface Ficticio {
  lat: number;
  lon: number;
  cidade: string;
  area: number;
  areaTotal: number | null;
  areaTerreno: number | null;
  quartos: number | null;
  vagas: number | null;
  judicial: boolean;
  financiamento: boolean;
  fgts: boolean;
  parcelamento: boolean;
  ocupacao: "ocupado" | "desocupado" | null;
  descricao: string;
}

/** Dados fictícios por exemplo (chave = id em src/content/examples.ts). Coordenadas: sede do município (IBGE). */
const FICTICIOS: Record<string, Ficticio> = {
  "alvo-sp": {
    lat: -23.5329, lon: -46.6395, cidade: "São Paulo", area: 92, areaTotal: 131, areaTerreno: null, quartos: 3, vagas: 2,
    judicial: true, financiamento: false, fgts: false, parcelamento: true, ocupacao: "desocupado",
    descricao: "Exemplo fictício. Apartamento de 92 m² privativos com 3 quartos (1 suíte), sala para dois ambientes, cozinha, área de serviço e 2 vagas de garagem.",
  },
  "namira-pr": {
    lat: -25.4195, lon: -49.2646, cidade: "Curitiba", area: 110, areaTotal: 110, areaTerreno: 250, quartos: 2, vagas: 2,
    judicial: true, financiamento: false, fgts: false, parcelamento: true, ocupacao: "desocupado",
    descricao: "Exemplo fictício. Casa térrea de 110 m² em terreno de 250 m², com 2 quartos, sala, cozinha, edícula e 2 vagas cobertas.",
  },
  "promissor-ba": {
    lat: -12.9718, lon: -38.5011, cidade: "Salvador", area: 68, areaTotal: 89, areaTerreno: null, quartos: 2, vagas: 1,
    judicial: false, financiamento: true, fgts: true, parcelamento: false, ocupacao: null,
    descricao: "Exemplo fictício. Apartamento de 68 m² privativos com 2 quartos, varanda, cozinha americana e 1 vaga.",
  },
  "semselo-rj": {
    lat: -22.9129, lon: -43.2003, cidade: "Rio de Janeiro", area: 38, areaTotal: 52, areaTerreno: null, quartos: null, vagas: null,
    judicial: true, financiamento: false, fgts: false, parcelamento: false, ocupacao: "ocupado",
    descricao: "Exemplo fictício. Sala comercial de 38 m² privativos com banheiro, em edifício com portaria.",
  },
  "namira-mg": {
    lat: -19.9102, lon: -43.9266, cidade: "Belo Horizonte", area: 45, areaTotal: 61, areaTerreno: null, quartos: 1, vagas: 1,
    judicial: false, financiamento: true, fgts: false, parcelamento: false, ocupacao: "desocupado",
    descricao: "Exemplo fictício. Apartamento de 45 m² privativos com 1 quarto, sala, cozinha e 1 vaga.",
  },
  "semselo-go": {
    lat: -16.6864, lon: -49.2643, cidade: "Goiânia", area: 450, areaTotal: null, areaTerreno: 450, quartos: null, vagas: null,
    judicial: true, financiamento: false, fgts: false, parcelamento: true, ocupacao: null,
    descricao: "Exemplo fictício. Terreno plano de 450 m² (15 × 30 m) em rua asfaltada, sem construção.",
  },
};

const PRACA: Record<string, Praca> = { "1ª praça": "1", "2ª praça": "2", "Praça única": "unica" };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const TIPOS: readonly TipoImovel[] = ["apartamento", "casa", "terreno", "comercial", "rural", "outro"];

/** "14 nov" → a próxima ocorrência (hoje ou depois), às 14h de Brasília, em ISO. */
export function proximaData(dataCurta: string, agora: Date): string | null {
  const m = /^(\d{1,2})\s+([a-z]{3})/.exec(dataCurta.trim().toLowerCase());
  if (!m) return null;
  const mes = MESES.indexOf(m[2]!);
  if (mes < 0) return null;
  const hoje = diaBrasilia(agora)!;
  let ano = Number(hoje.slice(0, 4));
  const dia = (a: number) => `${a}-${String(mes + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  if (dia(ano) < hoje) ano += 1;
  return new Date(`${dia(ano)}T14:00:00-03:00`).toISOString();
}

const DUAS_SEMANAS = 14 * 24 * 3600 * 1000;

const ORDEM_SEVERIDADE: readonly Severidade[] = ["grave", "atencao", "positivo", "info"];
const ORDEM_TAG = new Map<string, number>(TAGS.map((t, k) => [t.slug, k]));

/** Tags do exemplo, na ordem da exportação: gravidade (grave primeiro), depois a ordem do catálogo. */
function tagsDoExemplo(l: Listing): TagDetalhe[] {
  return l.tags.map((t): TagDetalhe => {
    const [base, valor] = t.label.split(" · ");
    const def = TAGS.find((d) => d.rotulo === base);
    const extra = EXTRAS_TAG[t.label];
    const slug = def?.slug ?? extra?.slug ?? base!.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return {
      slug,
      rotulo: def?.rotulo ?? extra?.rotulo ?? base!,
      severidade: def?.severidade ?? extra?.severidade ?? t.severity,
      emRevisao: false,
      confianca: "alta",
      origem: "exemplo",
      evidencia: valor ? `Exemplo fictício: ${valor} em atraso, segundo o edital.` : "Exemplo fictício, para mostrar como a tag aparece.",
    };
  }).sort((a, b) => ORDEM_SEVERIDADE.indexOf(a.severidade) - ORDEM_SEVERIDADE.indexOf(b.severidade) || (ORDEM_TAG.get(a.slug) ?? 99) - (ORDEM_TAG.get(b.slug) ?? 99));
}

/** Converte os exemplos do site para o catálogo. `agora` define as datas das praças (sempre no futuro). */
export function converterExemplos(listings: readonly Listing[], agora: Date = new Date()): ImovelDetalhe[] {
  const coletadoEm = diaBrasilia(agora)!;
  return listings.map((l) => {
    const x = FICTICIOS[l.id];
    if (!x) throw new Error(`exemplos: faltam os dados fictícios de ${l.id} em src/lib/catalogo/exemplos.ts`);
    const [lugar, cidadeUf = ""] = l.place.split(" · ");
    const bairro = cidadeUf ? lugar! : null;
    const praca = l.praca ? PRACA[l.praca] ?? null : null;
    const dataPraca = proximaData(l.date, agora);
    const pracas: PracaDetalhe[] =
      praca === "unica"
        ? [{ numero: 0, data: dataPraca, valorMinimo: l.lance }]
        : praca === "2"
          ? [
              { numero: 1, data: dataPraca ? new Date(Date.parse(dataPraca) - DUAS_SEMANAS).toISOString() : null, valorMinimo: l.avaliacao },
              { numero: 2, data: dataPraca, valorMinimo: l.lance },
            ]
          : [
              { numero: 1, data: dataPraca, valorMinimo: l.lance },
              { numero: 2, data: dataPraca ? new Date(Date.parse(dataPraca) + DUAS_SEMANAS).toISOString() : null, valorMinimo: Math.round(l.avaliacao * 0.5) },
            ];
    const desagio = Math.round(100 * (1 - l.lance / l.avaliacao));
    return {
      id: `ex-${l.id}`,
      titulo: l.title,
      tipo: TIPOS.includes(l.type) ? l.type : "outro",
      uf: l.uf,
      cidade: x.cidade,
      bairro,
      lat: x.lat,
      lon: x.lon,
      precisaoGeo: "cidade",
      area: x.area,
      areaTerreno: x.areaTerreno,
      quartos: x.quartos,
      vagas: x.vagas,
      avaliacao: l.avaliacao,
      lance: l.lance,
      desagio: Object.is(desagio, -0) ? 0 : desagio,
      lanceM2: Math.round(l.lance / x.area),
      avaliacaoM2: Math.round(l.avaliacao / x.area),
      modalidade: "leilao",
      modalidadeFonte: x.judicial ? "Leilão judicial" : "Leilão extrajudicial",
      praca,
      dataPraca,
      financiamento: x.financiamento,
      fgts: x.fgts,
      parcelamento: x.parcelamento,
      ocupacao: x.ocupacao,
      judicial: x.judicial,
      fonte: { ...FONTE_EXEMPLO },
      foto: null,
      totalFotos: 0,
      selo: l.seal as Selo,
      seloPendente: false,
      tags: tagsDoExemplo(l),
      coletadoEm,
      notaLocal: l.localizacao?.nota ?? null,
      endereco: null,
      areaTotal: x.areaTotal,
      areaPrivativa: l.type === "terreno" ? null : x.area,
      descricao: x.descricao,
      fotos: [],
      pracas,
      matricula: null,
      cartorio: null,
      numeroProcesso: null,
      leiloeiro: null,
      comitente: null,
      links: [
        {
          tipo: "mapa",
          rotulo: "Ver a região no Google Maps",
          url: linkGoogleMaps({ endereco: null, bairro, cidade: x.cidade, uf: l.uf }),
          descricao: "Exemplo fictício: o bairro e a cidade são reais, o imóvel não",
        },
      ],
      condicoesPagamento: x.parcelamento ? "Entrada de 25% e o restante em até 30 parcelas (IPCA)" : null,
      geradoNaFonteEm: null,
      porQueSelo: l.why,
      registro: {
        situacao: "na_fonte",
        matriculas: ["00.000 (fictícia)"],
        cartorio: `1º Ofício de Registro de Imóveis de ${x.cidade}/${l.uf} (exemplo)`,
        comarca: `${x.cidade}/${l.uf}`,
        oficio: "1",
        inscricaoImobiliaria: null,
        averbacaoLeiloesNegativos: null,
        paginaFonte: null,
        lidoEm: null,
      },
    };
  });
}

/** O resumo (lista, cartões) de um detalhe: só os campos de ImovelResumo, tags sem a evidência. */
export function resumoDe(d: ImovelDetalhe): ImovelResumo {
  return {
    id: d.id, titulo: d.titulo, tipo: d.tipo, uf: d.uf, cidade: d.cidade, bairro: d.bairro, lat: d.lat, lon: d.lon,
    precisaoGeo: d.precisaoGeo, area: d.area, areaTerreno: d.areaTerreno, quartos: d.quartos, vagas: d.vagas,
    avaliacao: d.avaliacao, lance: d.lance, desagio: d.desagio, lanceM2: d.lanceM2, avaliacaoM2: d.avaliacaoM2,
    modalidade: d.modalidade, modalidadeFonte: d.modalidadeFonte, praca: d.praca, dataPraca: d.dataPraca,
    financiamento: d.financiamento, fgts: d.fgts, parcelamento: d.parcelamento, ocupacao: d.ocupacao, judicial: d.judicial,
    fonte: d.fonte, foto: d.foto, totalFotos: d.totalFotos, selo: d.selo, seloPendente: d.seloPendente,
    tags: d.tags.map(({ slug, rotulo, severidade, emRevisao }) => ({ slug, rotulo, severidade, emRevisao })),
    coletadoEm: d.coletadoEm,
    notaLocal: d.notaLocal,
  };
}

/**
 * Nota de localização FICTÍCIA de cada exemplo (src/content/examples.ts, campo `localizacao`), pelo id do catálogo
 * ("ex-alvo-sp"); o ponto é a sede da cidade do exemplo. Exemplo sem o campo fica sem nota (null).
 */
export function localizacaoDosExemplos(listings: readonly Listing[], agora: Date = new Date()): Map<string, LocalizacaoImovel> {
  const hoje = diaBrasilia(agora)!;
  const saida = new Map<string, LocalizacaoImovel>();
  for (const l of listings) {
    const x = FICTICIOS[l.id];
    if (!x || !l.localizacao) continue;
    saida.set(`ex-${l.id}`, localizacaoExemplo(l.localizacao, { cidade: x.cidade, uf: l.uf, lat: x.lat, lon: x.lon }, hoje));
  }
  return saida;
}
