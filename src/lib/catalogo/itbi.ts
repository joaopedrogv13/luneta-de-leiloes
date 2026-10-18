/**
 * Preço de transações reais (ITBI das prefeituras) para a página do imóvel: referências de R$/m² por rua, bairro e
 * cidade, e a cobertura (de quais cidades a Luneta tem o dado, de quais ainda não).
 *
 * Arquivos: base/saida/site/itbi/<uf>-<cidade>.json.gz, gerados por base/fontes/itbi/para_site.py a partir do
 * workflow base-itbi.yml (formato "luneta-itbi", versão 1; ver base/fontes/itbi/README.md). As chaves de rua e de
 * bairro dos arquivos saem de base/fontes/itbi/normalizar.py, a mesma regra de src/lib/catalogo/lugar.ts.
 *
 * Só Node (fs e zlib), sem nada do Next, como instantaneo.ts (a pasta padrão é base/saida/site/itbi, a mesma de
 * `pastaPadrao()` + "itbi"): o servidor usa por src/lib/catalogo/servidor.ts e os
 * testes leem os arquivos de verdade. Arquivo inválido não derruba a página: fica de fora, com o motivo no log.
 *
 * ReferenciaM2 com fonte "itbi": `media` e `avaliacaoM2` (mediana e quartis) são do PREÇO PAGO por m² nas
 * transações do período (`periodo`); `lanceM2` e `percentilLance` ficam null (não há lance); `amostra` é o número
 * de transações. No Rio, pela reserva (MapServer), a prefeitura publica médias por trecho de rua: os quartis são
 * entre trechos.
 *
 * Área: a base usa a área PRIVATIVA. Onde a prefeitura publica a área construída da unidade com a parte comum do
 * prédio (São Paulo, pelo IPTU, e Fortaleza), o R$/m² de apartamentos e salas sai muito mais baixo e a comparação
 * enganaria: esses tipos ficam sem referência de ITBI (`areaComComum`), com o motivo em `cobertura.semComparacao`.
 * Medido com o instantâneo de 14/10/2026 (mediana da avaliação/m² do imóvel ÷ mediana do ITBI da mesma rua):
 * apartamentos de SP 2,0 e de Fortaleza 1,6; casas de SP 1,1; apartamentos do Rio 0,9, de Porto Alegre 1,1 e do
 * Recife 1,05. O teste dos arquivos reais (itbi.test.ts) confere essa razão em cada cidade e tipo que entra.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { chaveBairro, ruaGenerica } from "./lugar";
import type { CoberturaPrecos, FontePreco, ImovelResumo, ReferenciaM2, TipoImovel, ValorItbi } from "./tipos";
import { chaveCidade, type RuaDoImovel } from "./vizinhanca";

const descompactar = promisify(gunzip);

export const PASTA_ITBI = "itbi";
export const VERSAO_ITBI = 1;

type TipoItbi = Extract<TipoImovel, "apartamento" | "casa" | "terreno" | "comercial">;
const TIPOS_ITBI: readonly TipoItbi[] = ["apartamento", "casa", "terreno", "comercial"];

export interface EstatItbi {
  n: number;
  media: number;
  mediana: number;
  p25: number;
  p75: number;
}
type PorTipo = Partial<Record<TipoItbi, EstatItbi>>;

export interface ArquivoItbi {
  formato: "luneta-itbi";
  versao: number;
  cidade: string;
  uf: string;
  fonte: {
    nome: string;
    url: string;
    via?: string;
    observacao?: string;
    atribuicao?: string;
    licenca?: string | null;
    /** [de, até] (AAAA-MM-DD) */
    periodo: [string, string];
    transacoes: number;
  };
  cidade_tipos: PorTipo;
  bairros: Record<string, { nome: string; tipos: PorTipo }>;
  ruas: Record<string, { nome: string; tipos: PorTipo }>;
}

/** Os arquivos lidos, pela chave da cidade ("SP|sao paulo"), e os que ficaram de fora. */
export interface DadosItbi {
  porCidade: ReadonlyMap<string, ArquivoItbi>;
  recusados: { arquivo: string; motivo: string }[];
}

export const chaveCidadeItbi = (uf: string, cidade: string) => `${uf}|${chaveCidade(cidade)}`;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function estatValida(e: unknown): e is EstatItbi {
  const x = e as EstatItbi;
  return (
    typeof x === "object" && x !== null &&
    [x.n, x.media, x.mediana, x.p25, x.p75].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) &&
    x.p25 <= x.mediana && x.mediana <= x.p75 && x.n >= 1
  );
}

function tiposValidos(t: unknown): t is PorTipo {
  return typeof t === "object" && t !== null && Object.entries(t).every(([tipo, e]) => (TIPOS_ITBI as readonly string[]).includes(tipo) && estatValida(e));
}

/** Confere o arquivo inteiro; devolve o motivo da recusa ou null. */
export function conferirArquivoItbi(a: unknown): string | null {
  const x = a as ArquivoItbi;
  if (typeof x !== "object" || x === null || x.formato !== "luneta-itbi") return "não é um arquivo de ITBI do site";
  if (x.versao !== VERSAO_ITBI) return `formato ${String(x.versao)}; este site lê o ${VERSAO_ITBI}`;
  if (typeof x.cidade !== "string" || !/^[A-Z]{2}$/.test(String(x.uf))) return "cidade ou UF inválida";
  const f = x.fonte;
  if (typeof f !== "object" || f === null || typeof f.nome !== "string" || typeof f.url !== "string" || !f.url.startsWith("https://")) return "fonte sem nome ou url https";
  if (!Array.isArray(f.periodo) || f.periodo.length !== 2 || !f.periodo.every((d) => typeof d === "string" && DATA.test(d))) return "período inválido";
  if (!Number.isInteger(f.transacoes) || f.transacoes < 0) return "total de transações inválido";
  if (!tiposValidos(x.cidade_tipos)) return "estatística da cidade inválida";
  for (const campo of ["bairros", "ruas"] as const) {
    const grupo = x[campo];
    if (typeof grupo !== "object" || grupo === null) return `${campo} ausentes`;
    for (const [chave, v] of Object.entries(grupo)) {
      if (typeof v?.nome !== "string" || !tiposValidos(v.tipos)) return `${campo}: "${chave}" inválido`;
    }
  }
  return null;
}

/**
 * Lê todos os <uf>-<cidade>.json.gz da pasta (sem a pasta: nenhum dado, sem erro). Sem `pasta`, a do instantâneo.
 *
 * Rastreio do build: com o caminho montado em tempo de execução, o build levava o projeto INTEIRO para cada função
 * (src, base/fontes, project/...: 739 arquivos na página do imóvel). Por isso o caminho padrão é escrito por extenso
 * (o rastreio leva só base/saida/site/itbi) e o de teste fica fora do rastreio (`turbopackIgnore`). A pasta também
 * está em `outputFileTracingIncludes` (next.config.ts), como o resto do instantâneo.
 */
export async function lerItbi(pasta?: string): Promise<DadosItbi> {
  const listar = () => (pasta === undefined ? readdir(join(process.cwd(), "base", "saida", "site", "itbi")) : readdir(/* turbopackIgnore: true */ pasta));
  const ler = (nome: string) =>
    pasta === undefined ? readFile(join(process.cwd(), "base", "saida", "site", "itbi", nome)) : readFile(/* turbopackIgnore: true */ join(pasta, nome));
  let nomes: string[];
  try {
    nomes = (await listar()).filter((n) => n.endsWith(".json.gz")).sort();
  } catch {
    return { porCidade: new Map(), recusados: [] };
  }
  const porCidade = new Map<string, ArquivoItbi>();
  const recusados: DadosItbi["recusados"] = [];
  for (const nome of nomes) {
    try {
      const a = JSON.parse((await descompactar(await ler(nome))).toString("utf8")) as unknown;
      const motivo = conferirArquivoItbi(a);
      if (motivo) recusados.push({ arquivo: nome, motivo });
      else porCidade.set(chaveCidadeItbi((a as ArquivoItbi).uf, (a as ArquivoItbi).cidade), a as ArquivoItbi);
    } catch (e) {
      recusados.push({ arquivo: nome, motivo: (e as Error).message });
    }
  }
  for (const r of recusados) console.error(`ITBI (base/saida/site/itbi): ${r.arquivo} ficou de fora: ${r.motivo}`);
  return { porCidade, recusados };
}

/** Valor de uma chave do próprio objeto (rua chamada "constructor" não pega o do protótipo). */
function proprio<V>(objeto: Readonly<Record<string, V>> | Partial<Record<string, V>> | undefined, chave: string): V | undefined {
  return objeto && Object.hasOwn(objeto, chave) ? objeto[chave] : undefined;
}

/** Configuração da cidade do arquivo (CIDADES_ITBI), ou undefined para uma cidade fora da lista. */
function configDe(uf: string, cidade: string): CidadeItbi | undefined {
  const chave = chaveCidadeItbi(uf, cidade);
  return CIDADES_ITBI.find((c) => chaveCidadeItbi(c.uf, c.cidade) === chave);
}

/** A área deste tipo, no arquivo da cidade, inclui a parte comum do prédio? (então não compara) */
export function areaComComum(arquivo: Pick<ArquivoItbi, "uf" | "cidade">, tipo: TipoImovel): boolean {
  return (configDe(arquivo.uf, arquivo.cidade)?.areaComComum as readonly string[] | undefined)?.includes(tipo) ?? false;
}

/** Arquivo de ITBI da cidade do imóvel, ou null. */
export function itbiDaCidade(dados: DadosItbi, i: Pick<ImovelResumo, "uf" | "cidade">): ArquivoItbi | null {
  return dados.porCidade.get(chaveCidadeItbi(i.uf, i.cidade)) ?? null;
}

/**
 * Referências de preço pago por m² (ITBI) para o imóvel: rua (quando a rua do endereço casa com a do ITBI e não é
 * um nome que se repete na cidade), bairro e cidade, do mesmo tipo. Vazio fora das cidades com ITBI, para
 * rural/outro e para os tipos cuja área no arquivo inclui a parte comum do prédio (`areaComComum`).
 */
export function referenciasItbi(arquivo: ArquivoItbi | null, imovel: ImovelResumo, rua: RuaDoImovel | null = null): ReferenciaM2[] {
  if (!arquivo || !(TIPOS_ITBI as readonly string[]).includes(imovel.tipo)) return [];
  const tipo = imovel.tipo as TipoItbi;
  if (areaComComum(arquivo, tipo)) return [];
  const lugar = `${imovel.cidade}/${imovel.uf}`;
  const bairro = chaveBairro(imovel.bairro);
  const valorItbi = configDe(arquivo.uf, arquivo.cidade)?.tipoValor;
  const candidatos: { escopo: ReferenciaM2["escopo"]; nome: string; e: EstatItbi | undefined }[] = [
    { escopo: "rua", nome: `${rua?.nome}, ${lugar}`, e: rua && !ruaGenerica(rua.chave) ? proprio(proprio(arquivo.ruas, rua.chave)?.tipos, tipo) : undefined },
    { escopo: "bairro", nome: `${imovel.bairro}, ${lugar}`, e: bairro ? proprio(proprio(arquivo.bairros, bairro)?.tipos, tipo) : undefined },
    { escopo: "cidade", nome: lugar, e: proprio(arquivo.cidade_tipos, tipo) },
  ];
  return candidatos.flatMap(({ escopo, nome, e }): ReferenciaM2[] =>
    e
      ? [{
          escopo,
          fonte: "itbi",
          periodo: arquivo.fonte.periodo,
          ...(valorItbi ? { valorItbi } : {}),
          media: e.media,
          nome,
          tipo: imovel.tipo,
          amostra: e.n,
          avaliacaoM2: { mediana: e.mediana, p25: e.p25, p75: e.p75 },
          lanceM2: null,
          imovel: { avaliacaoM2: imovel.avaliacaoM2, lanceM2: imovel.lanceM2 },
          percentilLance: null,
        }]
      : [],
  );
}

// ---------------------------------------------------------------------------
// Cobertura: de quais cidades temos o preço de transações reais
// ---------------------------------------------------------------------------

interface CidadeItbi {
  cidade: string;
  uf: string;
  url: string | null;
  licenca: string | null;
  /** situação enquanto não houver arquivo */
  semArquivo: FontePreco["situacao"];
  detalheSemArquivo: string;
  /** o valor do arquivo: o declarado na compra, a base de cálculo do imposto ou a avaliação da prefeitura */
  valor?: string;
  /** o mesmo, como código (o nome do número na tela) */
  tipoValor?: ValorItbi;
  /** tipos cuja área no arquivo inclui a parte comum do prédio: ficam fora da comparação (ver o topo) */
  areaComComum?: readonly TipoItbi[];
}

const COLETA_PRONTA = "coleta pronta, aguardando rodar";
const LAI = "a prefeitura não publica as transações; dá para pedir pela Lei de Acesso à Informação";

/** A situação de cada cidade (base/fontes/itbi/README.md). Licença null = não confirmada. */
export const CIDADES_ITBI: readonly CidadeItbi[] = [
  {
    cidade: "São Paulo", uf: "SP", url: "https://prefeitura.sp.gov.br/web/fazenda/w/acesso_a_informacao/31501", licenca: null, semArquivo: "coleta_pendente",
    detalheSemArquivo: COLETA_PRONTA, valor: "valor declarado", tipoValor: "declarado", areaComComum: ["apartamento", "comercial"],
  },
  {
    cidade: "Rio de Janeiro", uf: "RJ", url: "https://fazenda.prefeitura.rio/itbi-valores-medios-por-m2-de-transacoes-imobiliarias-por-trecho-de-logradouro/", licenca: null,
    semArquivo: "coleta_pendente", detalheSemArquivo: COLETA_PRONTA, valor: "valor declarado", tipoValor: "declarado",
  },
  {
    cidade: "Porto Alegre", uf: "RS", url: "https://dadosabertos.poa.br/dataset/itbi", licenca: null, semArquivo: "coleta_pendente", detalheSemArquivo: COLETA_PRONTA,
    valor: "base de cálculo da prefeitura", tipoValor: "base_calculo",
  },
  {
    cidade: "Fortaleza", uf: "CE", url: "https://dados.fortaleza.ce.gov.br/dataset/imposto-sobre-transmissao-de-bens-imoveis-itbi", licenca: "CC-BY", semArquivo: "coleta_pendente",
    detalheSemArquivo: COLETA_PRONTA, valor: "base de cálculo da prefeitura", tipoValor: "base_calculo", areaComComum: ["apartamento", "comercial"],
  },
  {
    cidade: "Belo Horizonte", uf: "MG", url: "https://dados.pbh.gov.br/dataset/itbi-relatorios", licenca: "CC-BY", semArquivo: "coleta_pendente",
    detalheSemArquivo: "o portal da prefeitura recusa acesso de servidores fora do Brasil; coleta pronta para rodar de uma rede no Brasil",
  },
  {
    cidade: "Recife", uf: "PE", url: "https://dados.recife.pe.gov.br/dataset/imposto-sobre-transmissao-de-bens-imoveis-itbi", licenca: "ODbL", semArquivo: "coleta_pendente",
    detalheSemArquivo: COLETA_PRONTA, valor: "avaliação da prefeitura para o imposto", tipoValor: "avaliacao_prefeitura",
  },
  ...([["Salvador", "BA"], ["Goiânia", "GO"], ["Brasília", "DF"], ["Curitiba", "PR"], ["Florianópolis", "SC"], ["Campinas", "SP"], ["Niterói", "RJ"]] as const).map(
    ([cidade, uf]): CidadeItbi => ({ cidade, uf, url: null, licenca: null, semArquivo: "sem_dado_aberto", detalheSemArquivo: LAI }),
  ),
];

export const FIPEZAP: FontePreco = {
  nome: "FipeZAP",
  tipo: "indice",
  situacao: "precisa_autorizacao",
  detalhe: "índice do preço anunciado por m² nas principais cidades; o uso no site depende de autorização da Fipe",
  url: "https://www.fipe.org.br/pt-br/indices/fipezap/",
  licenca: null,
  imoveisNaBase: null,
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2025-09-08" → "set/2025" */
export const mesAno = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

const NOME_TIPO_PLURAL: Record<TipoItbi, string> = { apartamento: "apartamentos", casa: "casas", terreno: "terrenos", comercial: "imóveis comerciais" };
const listaE = (itens: readonly string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);

function detalheComArquivo(a: ArquivoItbi, c: CidadeItbi | undefined): string {
  const [de, ate] = a.fonte.periodo;
  const n = a.fonte.transacoes.toLocaleString("pt-BR");
  // o Rio pela reserva (MapServer) só tem médias por trecho de rua
  const medias = /mapserver/i.test(a.fonte.via ?? "") ? "médias por trecho de rua, " : "";
  const valor = c?.valor ? `; ${c.valor}` : "";
  const fora = c?.areaComComum?.length
    ? `; ${listaE(c.areaComComum.map((t) => NOME_TIPO_PLURAL[t]))} ficam fora da comparação (a área publicada inclui a parte comum do prédio)`
    : "";
  return `${medias}transações de ${mesAno(de)} a ${mesAno(ate)} (${n})${valor}${fora}`;
}

/**
 * Por que este imóvel fica sem o preço pago, numa cidade que tem o ITBI, quando o motivo é o arquivo (e não a falta
 * de compras na rua ou no bairro). null quando não é o caso.
 */
function motivoSemComparacao(dados: DadosItbi, imovel: Pick<ImovelResumo, "uf" | "cidade" | "tipo">): string | null {
  const a = itbiDaCidade(dados, imovel);
  if (!a || !areaComComum(a, imovel.tipo)) return null;
  const tipos = NOME_TIPO_PLURAL[imovel.tipo as TipoItbi];
  return (
    `A área que a prefeitura de ${a.cidade} publica para ${tipos} inclui a parte comum do prédio; com ela, o preço pago ` +
    "por m² sai bem abaixo do da área privativa usada aqui, e a comparação enganaria."
  );
}

/** Imóveis da base por cidade ("SP|sao paulo" → 490). */
export function contarPorCidade(itens: readonly Pick<ImovelResumo, "uf" | "cidade">[]): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const i of itens) {
    const k = chaveCidadeItbi(i.uf, i.cidade);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  return contagem;
}

/**
 * Tabela de cobertura: as cidades com ITBI (temos / coleta pendente), as sem dado aberto e o FipeZAP. Uma cidade
 * com arquivo que não está na lista entra no fim, como "temos". `contagem` null = não mostrar imóveis da base
 * (demonstração com exemplos fictícios).
 */
export function coberturaPrecos(dados: DadosItbi, imovel: Pick<ImovelResumo, "uf" | "cidade" | "tipo">, contagem: ReadonlyMap<string, number> | null): CoberturaPrecos {
  const naBase = (uf: string, cidade: string) => (contagem ? (contagem.get(chaveCidadeItbi(uf, cidade)) ?? 0) : null);
  const vistas = new Set<string>();
  const fontes: FontePreco[] = CIDADES_ITBI.map((c) => {
    const chave = chaveCidadeItbi(c.uf, c.cidade);
    vistas.add(chave);
    const a = dados.porCidade.get(chave);
    return {
      nome: `${c.cidade}/${c.uf}`,
      tipo: "itbi",
      situacao: a ? "temos" : c.semArquivo,
      detalhe: a ? detalheComArquivo(a, c) : c.detalheSemArquivo,
      url: c.url,
      licenca: c.licenca,
      imoveisNaBase: naBase(c.uf, c.cidade),
    };
  });
  for (const [chave, a] of dados.porCidade) {
    if (vistas.has(chave)) continue;
    fontes.push({ nome: `${a.cidade}/${a.uf}`, tipo: "itbi", situacao: "temos", detalhe: detalheComArquivo(a, undefined), url: a.fonte.url, licenca: a.fonte.licenca ?? null, imoveisNaBase: naBase(a.uf, a.cidade) });
  }
  fontes.push(FIPEZAP);
  return { cidadeTemItbi: dados.porCidade.has(chaveCidadeItbi(imovel.uf, imovel.cidade)), semComparacao: motivoSemComparacao(dados, imovel), fontes };
}
