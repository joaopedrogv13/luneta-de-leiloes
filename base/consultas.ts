/**
 * Leitura de imóveis gravados, em lote (uma consulta por tabela), para riscos e exportação.
 */
import { lerBool, lerNumero, lerTexto, type Banco, type ValorSql } from "./db.ts";
import type { CapacidadesFonte, Documento, Foto, ImovelGravado, NumeroPraca, Praca, StatusImovel, TextoFonte } from "./tipos.ts";

export interface FiltroImoveis {
  fonteId?: string;
  /** Padrão: todos os status. */
  status?: readonly StatusImovel[];
  /** Ordena por id e corta. */
  limite?: number;
}

function jsonOuNulo<T>(valor: ValorSql | undefined): T | null {
  const texto = lerTexto(valor);
  if (!texto) return null;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

/** Converte uma linha de `imovel` (e filhos já agrupados) no formato de leitura. */
export function linhaParaImovel(
  linha: Record<string, ValorSql>,
  filhos: { pracas?: Praca[]; fotos?: Foto[]; documentos?: Documento[] } = {},
): ImovelGravado {
  const texto = (coluna: string): string | null => lerTexto(linha[coluna]);
  const numero = (coluna: string): number | null => lerNumero(linha[coluna]);
  return {
    registro: "imovel",
    id: Number(linha.id ?? 0),
    fonte_id: String(linha.fonte_id),
    id_na_fonte: String(linha.id_na_fonte),
    url: String(linha.url),
    titulo: String(linha.titulo),
    tipo: String(linha.tipo) as ImovelGravado["tipo"],
    uf: String(linha.uf) as ImovelGravado["uf"],
    cidade: String(linha.cidade),
    cidade_norm: String(linha.cidade_norm),
    bairro: texto("bairro"),
    endereco: texto("endereco"),
    cep: texto("cep"),
    lat: numero("lat"),
    lon: numero("lon"),
    precisao_geo: texto("precisao_geo") as ImovelGravado["precisao_geo"],
    area_total: numero("area_total"),
    area_privativa: numero("area_privativa"),
    area_terreno: numero("area_terreno"),
    quartos: numero("quartos"),
    vagas: numero("vagas"),
    descricao: texto("descricao"),
    textos: jsonOuNulo<TextoFonte[]>(linha.textos) ?? [],
    extras: jsonOuNulo<Record<string, string | number | boolean | null>>(linha.extras) ?? {},
    modalidade: String(linha.modalidade) as ImovelGravado["modalidade"],
    modalidade_fonte: texto("modalidade_fonte"),
    judicial: lerBool(linha.judicial),
    aceita_financiamento: lerBool(linha.aceita_financiamento),
    aceita_fgts: lerBool(linha.aceita_fgts),
    aceita_parcelamento: lerBool(linha.aceita_parcelamento),
    ocupacao: texto("ocupacao") as ImovelGravado["ocupacao"],
    leiloeiro: texto("leiloeiro"),
    comitente: texto("comitente"),
    numero_processo: texto("numero_processo"),
    matricula: texto("matricula"),
    cartorio: texto("cartorio"),
    valor_avaliacao: numero("valor_avaliacao"),
    preco: numero("preco"),
    desconto_pct: numero("desconto_pct"),
    praca_atual: numero("praca_atual") as NumeroPraca | null,
    data_praca: texto("data_praca"),
    pracas: filhos.pracas ?? [],
    fotos: filhos.fotos ?? [],
    documentos: filhos.documentos ?? [],
    status: String(linha.status) as StatusImovel,
    primeira_vez_em: String(linha.primeira_vez_em),
    ultima_vez_em: String(linha.ultima_vez_em),
    atualizado_em: String(linha.atualizado_em),
    gerado_na_fonte_em: texto("gerado_na_fonte_em"),
    removido_em: texto("removido_em"),
    hash_conteudo: String(linha.hash_conteudo),
    chave_dedup: texto("chave_dedup"),
    chave_endereco: texto("chave_endereco"),
  };
}

type Linha = Record<string, ValorSql>;

function agrupar<T>(linhas: Linha[], converter: (l: Linha) => T): Map<number, T[]> {
  const mapa = new Map<number, T[]>();
  for (const linha of linhas) {
    const id = Number(linha.imovel_id);
    const lista = mapa.get(id);
    if (lista) lista.push(converter(linha));
    else mapa.set(id, [converter(linha)]);
  }
  return mapa;
}

/** Carrega imóveis com praças, fotos e documentos. */
export function carregarImoveis(db: Banco, filtro: FiltroImoveis = {}): ImovelGravado[] {
  const condicoes: string[] = [];
  const parametros: ValorSql[] = [];
  if (filtro.fonteId) {
    condicoes.push("fonte_id = ?");
    parametros.push(filtro.fonteId);
  }
  if (filtro.status && filtro.status.length > 0) {
    condicoes.push(`status IN (${filtro.status.map(() => "?").join(", ")})`);
    parametros.push(...filtro.status);
  }
  const onde = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const limite = filtro.limite && filtro.limite > 0 ? ` LIMIT ${Math.floor(filtro.limite)}` : "";
  const selecao = `SELECT id FROM imovel ${onde} ORDER BY id${limite}`;

  const linhas = db.prepare(`SELECT * FROM imovel WHERE id IN (${selecao}) ORDER BY id`).all(...parametros);
  const pracas = agrupar(
    db.prepare(`SELECT * FROM praca WHERE imovel_id IN (${selecao}) ORDER BY imovel_id, numero`).all(...parametros),
    (l): Praca => ({ numero: Number(l.numero) as NumeroPraca, data: lerTexto(l.data), valor_minimo: lerNumero(l.valor_minimo) }),
  );
  const fotos = agrupar(
    db.prepare(`SELECT * FROM foto WHERE imovel_id IN (${selecao}) ORDER BY imovel_id, ordem, id`).all(...parametros),
    (l): Foto => ({
      url: String(l.url),
      ordem: Number(l.ordem),
      tamanho: lerTexto(l.tamanho),
      origem: String(l.origem),
      verificada_em: lerTexto(l.verificada_em),
      ok: lerBool(l.ok),
    }),
  );
  const documentos = agrupar(
    db.prepare(`SELECT * FROM documento WHERE imovel_id IN (${selecao}) ORDER BY imovel_id, id`).all(...parametros),
    (l): Documento => ({
      tipo: String(l.tipo) as Documento["tipo"],
      titulo: lerTexto(l.titulo),
      url: String(l.url),
      publicado_em: lerTexto(l.publicado_em),
    }),
  );
  return linhas.map((linha) => {
    const id = Number(linha.id);
    return linhaParaImovel(linha, { pracas: pracas.get(id), fotos: fotos.get(id), documentos: documentos.get(id) });
  });
}

/** Capacidades de cada fonte gravada. */
export function capacidadesDasFontes(db: Banco): Map<string, CapacidadesFonte> {
  const mapa = new Map<string, CapacidadesFonte>();
  for (const l of db.prepare("SELECT id, publica_fotos, publica_documentos, informa_ocupacao, lista_completa FROM fonte").all()) {
    mapa.set(String(l.id), {
      fotos: lerBool(l.publica_fotos) ?? false,
      documentos: lerBool(l.publica_documentos) ?? false,
      ocupacao: lerBool(l.informa_ocupacao) ?? false,
      listaCompleta: lerBool(l.lista_completa) ?? false,
    });
  }
  return mapa;
}
