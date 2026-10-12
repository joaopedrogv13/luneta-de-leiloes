/**
 * Parser da coluna "Descrição" do CSV da Caixa, que é semiestruturada:
 *
 *   "Casa, 0.00 de área total, 240.00 de área privativa, 300.00 de área do terreno,  3 qto(s), WC, 3 sala(s), cozinha."
 *
 * O primeiro pedaço é o tipo; os seguintes, separados por vírgula, são áreas (ponto decimal,
 * "0.00" = não informado), contagens ("N qto(s)", "N vaga(s) de garagem", "N sala(s)",
 * "N lavabo(s)") e itens sem número ("WC", "a.serv", "cozinha"...). No CSV de 08/10/2026 só
 * aparecem 16 pedaços diferentes; o que não for reconhecido vai para `desconhecidos`, para
 * medir a cobertura e perceber quando a Caixa mudar o formato.
 */
import type { TipoImovel } from "../../tipos.ts";
import { inferirTipoImovel } from "../../util/classificar.ts";
import { formatarNumeroBR, lerNumeroBR } from "../../util/numero.ts";
import { colapsarEspacos, normalizarTexto } from "../../util/texto.ts";

export interface DescricaoCaixa {
  /** Rótulo de tipo como a Caixa escreve ("Apartamento", "Gleba Urbana", "Imóvel rural"). */
  tipo_fonte: string | null;
  tipo: TipoImovel;
  area_total: number | null;
  area_privativa: number | null;
  area_terreno: number | null;
  quartos: number | null;
  vagas: number | null;
  salas: number | null;
  lavabos: number | null;
  /** Itens sem número reconhecidos, na forma normalizada ("wc", "area de servico", "cozinha"...). */
  itens: string[];
  /** Pedaços que o parser não reconheceu (texto original). */
  desconhecidos: string[];
}

/** Tipos que a Caixa usa no CSV (medido em 08/10/2026), já sem acento e em minúsculas. */
const TIPOS_CAIXA: Readonly<Record<string, TipoImovel>> = {
  apartamento: "apartamento",
  casa: "casa",
  sobrado: "casa",
  terreno: "terreno",
  "gleba urbana": "terreno",
  gleba: "rural",
  "imovel rural": "rural",
  predio: "comercial",
  comercial: "comercial",
  sala: "comercial",
  loja: "comercial",
  galpao: "comercial",
  outros: "outro",
};

/** Rótulo para o título do anúncio, a partir do tipo da Caixa. */
const ROTULOS_TITULO: Readonly<Record<string, string>> = {
  comercial: "Imóvel comercial",
  sala: "Sala comercial",
  outros: "Imóvel",
  "gleba urbana": "Gleba urbana",
  "imovel rural": "Imóvel rural",
};

/** Itens sem número: forma normalizada (sem acento, minúsculas) → nome canônico. */
const ITENS: Readonly<Record<string, string>> = {
  wc: "wc",
  "wc emp": "wc de empregada",
  "a.serv": "area de servico",
  "a. serv": "area de servico",
  "area de servico": "area de servico",
  cozinha: "cozinha",
  varanda: "varanda",
  sacada: "sacada",
  "varanda/sacada": "varanda",
  terraco: "terraco",
  dce: "dependencia de empregada",
  piscina: "piscina",
  churrasqueira: "churrasqueira",
  quintal: "quintal",
  garagem: "garagem",
  sala: "sala",
};

const AREA = /^([\d.,]+)\s*(?:m2|m²)?\s+de\s+area\s+(total|privativa|util|construida|do\s+terreno)$/;
const CONTAGEM = /^(\d{1,4})\s+(qto|quarto|dorm|dormitorio|vaga|sala|lavabo|wc|banheiro)s?(?:\(s\))?(?:\s+de\s+garagem|\s+na\s+garagem)?$/;

/**
 * Área com ponto decimal ("600.00"). "0.00" é como a Caixa escreve "não informado"; valores
 * abaixo de 1 m² ("0.01") também são marcador, não área.
 */
function lerArea(valor: string): number | null {
  const numero = lerNumeroBR(valor, { decimal: "." });
  return numero !== null && numero >= 1 ? numero : null;
}

/** Quebra a descrição em pedaços, sem o ponto final. */
function pedacos(descricao: string): string[] {
  return colapsarEspacos(descricao)
    .split(",")
    .map((p) => p.trim().replace(/[\s.]+$/, ""))
    .filter((p) => p !== "");
}

/** Tipo pelo rótulo da Caixa; desconhecido cai na classificação genérica do núcleo. */
export function tipoDaCaixa(rotulo: string | null | undefined): TipoImovel {
  if (!rotulo) return "outro";
  return TIPOS_CAIXA[normalizarTexto(rotulo)] ?? inferirTipoImovel(rotulo);
}

/** Interpreta a coluna "Descrição". Nunca lança: o que não reconhece vai para `desconhecidos`. */
export function interpretarDescricao(descricao: string | null | undefined): DescricaoCaixa {
  const saida: DescricaoCaixa = {
    tipo_fonte: null,
    tipo: "outro",
    area_total: null,
    area_privativa: null,
    area_terreno: null,
    quartos: null,
    vagas: null,
    salas: null,
    lavabos: null,
    itens: [],
    desconhecidos: [],
  };
  if (!descricao) return saida;
  const partes = pedacos(descricao);
  const [primeira, ...resto] = partes;
  if (primeira && !/^\d/.test(primeira)) {
    saida.tipo_fonte = primeira;
    saida.tipo = tipoDaCaixa(primeira);
  } else if (primeira) {
    resto.unshift(primeira);
  }
  for (const parte of resto) {
    const normal = normalizarTexto(parte);
    const area = AREA.exec(normal);
    if (area) {
      const valor = lerArea(area[1] ?? "");
      const qual = area[2] ?? "";
      if (qual === "privativa" || qual === "util") saida.area_privativa ??= valor;
      else if (qual.startsWith("do")) saida.area_terreno ??= valor;
      else saida.area_total ??= valor;
      continue;
    }
    const contagem = CONTAGEM.exec(normal);
    if (contagem) {
      const n = Number(contagem[1]);
      const qual = contagem[2] ?? "";
      if (qual === "qto" || qual === "quarto" || qual.startsWith("dorm")) saida.quartos ??= n;
      else if (qual === "vaga") saida.vagas ??= n;
      else if (qual === "sala") saida.salas ??= n;
      else if (qual === "lavabo") saida.lavabos ??= n;
      else if (!saida.itens.includes("wc")) saida.itens.push("wc");
      continue;
    }
    const item = ITENS[normal];
    if (item) {
      if (!saida.itens.includes(item)) saida.itens.push(item);
      continue;
    }
    saida.desconhecidos.push(parte);
  }
  return saida;
}

/**
 * Título curto, no estilo do site: "Apartamento 2 quartos", "Terreno 600 m²", "Sala comercial 35 m²".
 * Usa quartos quando houver; senão a área (do terreno para terrenos e glebas).
 */
export function tituloDoImovel(d: Pick<DescricaoCaixa, "tipo_fonte" | "tipo" | "quartos" | "area_privativa" | "area_total" | "area_terreno">): string {
  const chave = d.tipo_fonte ? normalizarTexto(d.tipo_fonte) : "";
  const rotulo = ROTULOS_TITULO[chave] ?? (d.tipo_fonte ? capitalizarPrimeira(d.tipo_fonte) : "Imóvel");
  if (d.quartos) return `${rotulo} ${d.quartos} ${d.quartos === 1 ? "quarto" : "quartos"}`;
  const area = d.tipo === "terreno" || d.tipo === "rural"
    ? (d.area_terreno ?? d.area_total ?? d.area_privativa)
    : (d.area_privativa ?? d.area_total ?? d.area_terreno);
  return area ? `${rotulo} ${formatarNumeroBR(area)} m²` : rotulo;
}

function capitalizarPrimeira(texto: string): string {
  const limpo = colapsarEspacos(texto).toLocaleLowerCase("pt-BR");
  return limpo.charAt(0).toLocaleUpperCase("pt-BR") + limpo.slice(1);
}
