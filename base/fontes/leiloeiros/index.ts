/**
 * Conector `leiloeiros_arquivo` (apelido `leiloeiros`): importa o JSONL que os coletores dos leiloeiros
 * entregam (hoje os Apps Scripts do dono; contrato em base/leiloeiros/CONTRATO.md).
 *
 *   npm run base:coletar -- leiloeiros --arquivo saida.jsonl
 *
 * Só lê arquivo local (não há rede aqui: quem lê os sites é o coletor). O arquivo se desdobra em uma
 * fonte por leiloeiro (`desdobrar`): `ll_<slug com _>`, com o nome do leiloeiro em `fonte.nome` (é o
 * nome que o site mostra no cartão e no filtro de fonte) e o site dele em `fonte.url`. Cada leiloeiro
 * tem a própria coleta no log, a própria data de geração e a própria remoção:
 *
 * - a linha `{"registro": "coleta"}` do leiloeiro diz se a carga é completa. Com `completa: true` e
 *   saúde "ok", o lote ativo que não veio vira `removido` (sai do site), como na Caixa, com a trava de 50%
 *   do núcleo. Sem a linha de coleta, ou com a carga incompleta, nada sai por ter sumido;
 * - vendido, encerrado, suspenso ou cancelado (a situação que o coletor manda) viram `encerrado`;
 * - carga mais antiga que a última gravada do mesmo leiloeiro é recusada (o núcleo compara a
 *   data de geração, que é o `coletado_em` da linha de coleta);
 * - leiloeiro que o coletor declarou "quebrado" ou "bloqueado" e sem lotes fica com a coleta em erro
 *   ("[bloqueado] ..."), e os lotes já publicados continuam como estavam;
 * - linha ilegível no arquivo (JSON quebrado) desliga a remoção de todos os leiloeiros da carga.
 *
 * O id no site é `ll-<slug>-<lote>` (o prefixo da fonte com "_" trocado por "-", regra de
 * base/exportar.ts): o lote só tem letras e dígitos, então dois leiloeiros nunca geram o mesmo id.
 */
import { basename } from "node:path";
import type { Conector } from "../../tipos.ts";
import { lerArquivoTexto } from "../../util/arquivo.ts";
import {
  ACESSO_DO_METODO,
  avisoColetaDeclarada,
  erroDeclarado,
  fonteDoSlug,
  lerJsonl,
  separarId,
  slugValido,
  type LeiloeiroLinha,
  type LinhaColeta,
} from "../../leiloeiros/contrato.ts";
import { examinarColeta } from "../../leiloeiros/validar.ts";
import { normalizarLinha } from "./normalizar.ts";

export const ID_LEILOEIROS = "leiloeiros_arquivo";

export interface GrupoLeiloeiro {
  slug: string;
  /** A linha de coleta do leiloeiro (a primeira válida), ou null. */
  coleta: LinhaColeta | null;
  /** Leiloeiro da linha de coleta ou do primeiro lote. */
  leiloeiro: LeiloeiroLinha | null;
  /** Linhas de imóvel, como vieram (o normalizar confere cada uma). */
  linhas: unknown[];
  /** Linhas de coleta repetidas ou inválidas deste leiloeiro (ignoradas). */
  coletasIgnoradas: number;
}

export interface CargaLeiloeiros {
  grupos: GrupoLeiloeiro[];
  /** Linhas que não deu para atribuir a um leiloeiro (JSON quebrado, registro desconhecido, sem slug). */
  ilegiveis: number;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Separa as linhas do JSONL por leiloeiro. A linha de coleta com erro (esquema, completa sem saúde ok,
 * data de coleta no futuro em relação a `agora`) é ignorada: sem ela, nada sai do site por ter sumido.
 */
export function agruparPorLeiloeiro(texto: string, agora: Date = new Date()): CargaLeiloeiros {
  const grupos = new Map<string, GrupoLeiloeiro>();
  let ilegiveis = 0;
  const grupo = (slug: string): GrupoLeiloeiro => {
    let g = grupos.get(slug);
    if (!g) {
      g = { slug, coleta: null, leiloeiro: null, linhas: [], coletasIgnoradas: 0 };
      grupos.set(slug, g);
    }
    return g;
  };
  for (const lida of lerJsonl(texto)) {
    const valor = lida.valor;
    if (lida.erro !== undefined || !ehObjeto(valor)) {
      ilegiveis++;
      continue;
    }
    const leiloeiro = ehObjeto(valor.leiloeiro) ? valor.leiloeiro : null;
    const declarado = leiloeiro?.slug;
    const slug = slugValido(declarado) ? declarado : separarId(valor.id)?.slug;
    if (!slug || (valor.registro !== "imovel" && valor.registro !== "coleta")) {
      ilegiveis++;
      continue;
    }
    const g = grupo(slug);
    if (valor.registro === "coleta") {
      if (g.coleta || examinarColeta(valor, { agora }).some((p) => p.nivel === "erro")) g.coletasIgnoradas++;
      else {
        g.coleta = valor as unknown as LinhaColeta;
        g.leiloeiro = g.coleta.leiloeiro;
      }
    } else {
      g.linhas.push(valor);
      if (!g.leiloeiro && leiloeiro && typeof leiloeiro.nome === "string" && typeof leiloeiro.site === "string") {
        g.leiloeiro = { slug, nome: leiloeiro.nome, site: leiloeiro.site };
      }
    }
  }
  return { grupos: [...grupos.values()].sort((a, b) => a.slug.localeCompare(b.slug)), ilegiveis };
}

function temLista(v: unknown, campo: string, teste: (item: unknown) => boolean = () => true): boolean {
  return ehObjeto(v) && Array.isArray(v[campo]) && (v[campo] as unknown[]).some(teste);
}

/** Data de geração da carga do leiloeiro: o fim da coleta, senão a leitura mais recente de um lote (em UTC). */
function geracaoDaCarga(g: GrupoLeiloeiro): string | undefined {
  const datas = g.coleta
    ? [g.coleta.coletado_em]
    : g.linhas.flatMap((l) => (ehObjeto(l) && ehObjeto(l.controle) && typeof l.controle.coletado_em === "string" ? [l.controle.coletado_em] : []));
  const instantes = datas.map((d) => new Date(d).getTime()).filter((t) => !Number.isNaN(t));
  return instantes.length > 0 ? new Date(Math.max(...instantes)).toISOString() : undefined;
}

/** O conector de um leiloeiro da carga (vira a fonte ll_<slug>). */
export function conectorDoLeiloeiro(g: GrupoLeiloeiro, origem: string, ilegiveisNaCarga = 0): Conector {
  const c = g.coleta;
  const extrai = c?.extrai ?? {
    fotos: g.linhas.some((l) => temLista(l, "fotos")),
    documentos: g.linhas.some((l) => temLista(l, "documentos")),
    ocupacao: g.linhas.some((l) => ehObjeto(l) && ehObjeto(l.ocupacao) && l.ocupacao.origem === "campo"),
  };
  const completa = c !== null && c.completa && c.saude === "ok" && ilegiveisNaCarga === 0;
  return {
    id: fonteDoSlug(g.slug),
    nome: g.leiloeiro?.nome ?? g.slug,
    tipo: "leiloeiro",
    acesso: c?.metodo ? ACESSO_DO_METODO[c.metodo] : "desconhecido",
    finalidade: "vitrine",
    url: g.leiloeiro?.site,
    capacidades: { fotos: extrai.fotos, documentos: extrai.documentos, ocupacao: extrai.ocupacao, listaCompleta: completa },
    async *coletar(op) {
      op.informar({ origem: `${origem}#${g.slug}`, geradoEm: geracaoDaCarga(g), totalNaFonte: c?.total_na_fonte ?? undefined });
      if (c) op.informar({ aviso: avisoColetaDeclarada(c) });
      else op.informar({ aviso: "Sem a linha de coleta do leiloeiro: a remoção fica desligada (nada sai do site por ter sumido da carga)." });
      if (g.coletasIgnoradas > 0) op.informar({ aviso: `${g.coletasIgnoradas} linha(s) de coleta repetida(s) ou inválida(s) ignorada(s).` });
      if (ilegiveisNaCarga > 0 && c?.completa) {
        op.informar({ aviso: `${ilegiveisNaCarga} linha(s) ilegível(is) no arquivo: a remoção fica desligada nesta carga.` });
      }
      if (g.linhas.length === 0 && c && (c.saude === "quebrado" || c.saude === "bloqueado")) throw new Error(erroDeclarado(c.saude, c.erro));
      for (const linha of g.linhas) {
        if (op.sinal?.aborted) return;
        yield linha;
      }
    },
    normalizar: normalizarLinha,
  };
}

export const leiloeirosArquivo: Conector = {
  id: ID_LEILOEIROS,
  nome: "Leiloeiros (JSONL dos coletores)",
  tipo: "leiloeiro",
  acesso: "html",
  finalidade: "vitrine",
  capacidades: { fotos: true, documentos: true, ocupacao: false, listaCompleta: false },
  coletar() {
    throw new Error(
      "leiloeiros_arquivo se desdobra em uma fonte por leiloeiro e não é coletado direto: use `coletar leiloeiros --arquivo saida.jsonl`.",
    );
  },
  normalizar: normalizarLinha,
  async desdobrar(op) {
    if (!op.arquivo) {
      throw new Error("Informe o arquivo: coletar leiloeiros --arquivo saida.jsonl (o JSONL dos coletores; contrato em base/leiloeiros/CONTRATO.md).");
    }
    const texto = await lerArquivoTexto(op.arquivo, "utf-8");
    const { grupos, ilegiveis } = agruparPorLeiloeiro(texto, op.agora);
    if (grupos.length === 0) throw new Error(`Nenhum leiloeiro reconhecido em ${op.arquivo} (${ilegiveis} linha(s) ilegível(is)). Rode o validador: npm run leiloeiros:validar -- --arquivo ${op.arquivo}`);
    op.log(`${grupos.length} leiloeiro(s) em ${op.arquivo}${ilegiveis ? `; ${ilegiveis} linha(s) ilegível(is)` : ""}.`);
    return grupos.map((g) => conectorDoLeiloeiro(g, basename(op.arquivo!), ilegiveis));
  },
};
