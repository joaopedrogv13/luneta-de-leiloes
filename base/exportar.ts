/**
 * Exportação para o site: um JSON com os imóveis ativos, praças, fotos (URL da fonte),
 * documentos e as tags consolidadas (só as que valem "sim").
 *
 * Fica de fora: imóvel removido ou encerrado, praça que já passou há mais de 1 dia e foto
 * reprovada na verificação. A gravação é atômica (arquivo temporário + rename).
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarImoveis } from "./consultas.ts";
import { lerBool, lerTexto, type Banco } from "./db.ts";
import { consolidarTags, type LinhaRisco } from "./riscos/motor.ts";
import { CATEGORIAS, definicaoTag } from "./riscos/tags.ts";
import type { Confianca, ImovelGravado, ValorRisco } from "./tipos.ts";
import { instanteDe } from "./util/data.ts";
import { truncar } from "./util/texto.ts";

export const SAIDA_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "dados", "exportacao", "imoveis.json");

/** Versão do formato do JSON exportado. Suba quando mudar algo de forma incompatível. */
export const VERSAO_EXPORTACAO = 1;

export interface TagExportada {
  slug: string;
  rotulo: string;
  categoria: string;
  severidade: string;
  confianca: Confianca;
  revisao_pendente: boolean;
  revisada: boolean;
  trecho: string | null;
  origem: string;
}

export interface ImovelExportado {
  id: number;
  fonte: string;
  fonte_nome: string;
  id_na_fonte: string;
  url: string;
  titulo: string;
  tipo: string;
  uf: string;
  cidade: string;
  bairro: string | null;
  endereco: string | null;
  cep: string | null;
  lat: number | null;
  lon: number | null;
  precisao_geo: string | null;
  area_total: number | null;
  area_privativa: number | null;
  area_terreno: number | null;
  quartos: number | null;
  vagas: number | null;
  descricao: string | null;
  modalidade: string;
  modalidade_fonte: string | null;
  judicial: boolean | null;
  aceita_financiamento: boolean | null;
  aceita_fgts: boolean | null;
  aceita_parcelamento: boolean | null;
  leiloeiro: string | null;
  comitente: string | null;
  numero_processo: string | null;
  matricula: string | null;
  cartorio: string | null;
  valor_avaliacao: number | null;
  preco: number | null;
  desconto_pct: number | null;
  praca_atual: number | null;
  data_praca: string | null;
  pracas: ImovelGravado["pracas"];
  fotos: ImovelGravado["fotos"];
  documentos: ImovelGravado["documentos"];
  tags: TagExportada[];
  chave_dedup: string | null;
  primeira_vez_em: string;
  ultima_vez_em: string;
  atualizado_em: string;
}

export interface Exportacao {
  versao: number;
  gerado_em: string;
  total: number;
  imoveis: ImovelExportado[];
}

export interface OpcoesExportar {
  limite?: number;
  agora?: Date;
}

const UM_DIA = 24 * 3600 * 1000;

/** Monta o objeto de exportação (sem gravar arquivo). */
export function montarExportacao(db: Banco, opcoes: OpcoesExportar = {}): Exportacao {
  const agora = opcoes.agora ?? new Date();
  const nomes = new Map(db.prepare("SELECT id, nome FROM fonte").all().map((l) => [String(l.id), String(l.nome)]));
  const riscos = new Map<number, LinhaRisco[]>();
  for (const l of db
    .prepare(
      `SELECT r.imovel_id, r.tag, r.valor, r.confianca, r.precisa_revisao, r.origem, r.trecho, r.regra, r.revisado_por, r.revisado_em
       FROM risco r JOIN imovel i ON i.id = r.imovel_id WHERE i.status = 'ativo'`,
    )
    .all()) {
    const id = Number(l.imovel_id);
    const linha: LinhaRisco = {
      tag: String(l.tag),
      valor: String(l.valor) as ValorRisco,
      confianca: String(l.confianca) as Confianca,
      precisa_revisao: lerBool(l.precisa_revisao) ?? false,
      origem: String(l.origem),
      trecho: lerTexto(l.trecho),
      regra: String(l.regra),
      revisado_por: lerTexto(l.revisado_por),
      revisado_em: lerTexto(l.revisado_em),
    };
    riscos.set(id, [...(riscos.get(id) ?? []), linha]);
  }

  const imoveis: ImovelExportado[] = [];
  for (const i of carregarImoveis(db, { status: ["ativo"] })) {
    if (i.data_praca) {
      const quando = instanteDe(i.data_praca);
      if (quando !== null && quando < agora.getTime() - UM_DIA) continue;
    }
    const tags: TagExportada[] = consolidarTags(riscos.get(i.id) ?? [])
      .filter((t) => t.valor === "sim")
      .map((t) => {
        const def = definicaoTag(t.tag);
        return {
          slug: t.tag,
          rotulo: def?.rotulo ?? t.tag,
          categoria: def ? CATEGORIAS[def.categoria] : "",
          severidade: def?.severidade ?? "info",
          confianca: t.confianca,
          revisao_pendente: t.revisao_pendente,
          revisada: t.revisada,
          trecho: t.trecho,
          origem: t.origem,
        };
      });
    imoveis.push({
      id: i.id,
      fonte: i.fonte_id,
      fonte_nome: nomes.get(i.fonte_id) ?? i.fonte_id,
      id_na_fonte: i.id_na_fonte,
      url: i.url,
      titulo: i.titulo,
      tipo: i.tipo,
      uf: i.uf,
      cidade: i.cidade,
      bairro: i.bairro ?? null,
      endereco: i.endereco ?? null,
      cep: i.cep ?? null,
      lat: i.lat ?? null,
      lon: i.lon ?? null,
      precisao_geo: i.precisao_geo ?? null,
      area_total: i.area_total ?? null,
      area_privativa: i.area_privativa ?? null,
      area_terreno: i.area_terreno ?? null,
      quartos: i.quartos ?? null,
      vagas: i.vagas ?? null,
      descricao: i.descricao ? truncar(i.descricao, 1000) : null,
      modalidade: i.modalidade,
      modalidade_fonte: i.modalidade_fonte ?? null,
      judicial: i.judicial ?? null,
      aceita_financiamento: i.aceita_financiamento ?? null,
      aceita_fgts: i.aceita_fgts ?? null,
      aceita_parcelamento: i.aceita_parcelamento ?? null,
      leiloeiro: i.leiloeiro ?? null,
      comitente: i.comitente ?? null,
      numero_processo: i.numero_processo ?? null,
      matricula: i.matricula ?? null,
      cartorio: i.cartorio ?? null,
      valor_avaliacao: i.valor_avaliacao ?? null,
      preco: i.preco ?? null,
      desconto_pct: i.desconto_pct,
      praca_atual: i.praca_atual ?? null,
      data_praca: i.data_praca,
      pracas: i.pracas,
      fotos: i.fotos.filter((f) => f.ok !== false),
      documentos: i.documentos,
      tags,
      chave_dedup: i.chave_dedup,
      primeira_vez_em: i.primeira_vez_em,
      ultima_vez_em: i.ultima_vez_em,
      atualizado_em: i.atualizado_em,
    });
    if (opcoes.limite && imoveis.length >= opcoes.limite) break;
  }
  return { versao: VERSAO_EXPORTACAO, gerado_em: agora.toISOString(), total: imoveis.length, imoveis };
}

/** Grava a exportação em `caminho` (padrão base/dados/exportacao/imoveis.json). */
export function exportar(db: Banco, caminho: string = SAIDA_PADRAO, opcoes: OpcoesExportar = {}): Exportacao {
  const dados = montarExportacao(db, opcoes);
  mkdirSync(dirname(caminho), { recursive: true });
  const temporario = `${caminho}.${process.pid}.tmp`;
  // Compacto: com ~21 mil imóveis o JSON indentado passa de 40 MB.
  writeFileSync(temporario, JSON.stringify(dados) + "\n", "utf8");
  renameSync(temporario, caminho);
  return dados;
}
