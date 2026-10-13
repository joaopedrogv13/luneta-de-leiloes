/**
 * Relatório de situação da base: contagens por fonte, UF, modalidade e tag, cobertura de
 * fotos e de coordenadas, duplicatas e a última coleta de cada fonte.
 */
import { lerTexto, versaoDoBanco, type Banco } from "./db.ts";
import { agruparDuplicatas } from "./dedup/index.ts";
import { definicaoTag } from "./riscos/tags.ts";
import { formatarNumeroBR } from "./util/numero.ts";

export interface UltimaColeta {
  id: number;
  iniciada_em: string;
  terminada_em: string | null;
  status: string;
  completa: boolean;
  escopo_uf: string | null;
  gerado_na_fonte_em: string | null;
  lidos: number;
  novos: number;
  atualizados: number;
  removidos: number;
  invalidos: number;
  erro: string | null;
}

export interface StatusFonte {
  id: string;
  nome: string;
  ativos: number;
  encerrados: number;
  removidos: number;
  editais: number;
  ultimaColeta: UltimaColeta | null;
}

export interface RelatorioStatus {
  versaoBanco: number;
  totais: { imoveis: number; ativos: number; editais: number; coletas: number };
  fontes: StatusFonte[];
  porUf: Array<{ uf: string; ativos: number }>;
  porModalidade: Array<{ modalidade: string; ativos: number }>;
  porTag: Array<{ tag: string; rotulo: string; imoveis: number; revisaoPendente: number }>;
  fotos: { ativosComFoto: number; ativos: number; percentual: number };
  /** Ativos por precisão da coordenada ("cidade" = sede do município; "sem" = cidade não reconhecida). */
  geo: Array<{ precisao: string; ativos: number }>;
  /** Ativos que dividem a chave_dedup com outro ativo (mesmo imóvel em mais de um anúncio). */
  duplicatas: { grupos: number; imoveis: number; gruposEntreFontes: number };
  /**
   * Mesmo imóvel pela chave_dedup ou pela chave_endereco (dedup/index.ts, `agruparDuplicatas`): junta
   * a fonte com matrícula e a sem matrícula, que nunca dividem a chave_dedup; endereço com duas
   * matrículas diferentes não junta ninguém e é contado à parte.
   */
  mesmoImovel: { grupos: number; imoveis: number; gruposEntreFontes: number; enderecosComMatriculasDiferentes: number };
}

function contagem(db: Banco, sql: string, ...parametros: Array<string | number>): number {
  return Number(db.prepare(sql).get(...parametros)?.n ?? 0);
}

export function relatorioStatus(db: Banco): RelatorioStatus {
  const ativos = contagem(db, "SELECT count(*) AS n FROM imovel WHERE status = 'ativo'");
  const fontes: StatusFonte[] = db
    .prepare(
      `SELECT f.id, f.nome,
         (SELECT count(*) FROM imovel i WHERE i.fonte_id = f.id AND i.status = 'ativo') AS ativos,
         (SELECT count(*) FROM imovel i WHERE i.fonte_id = f.id AND i.status = 'encerrado') AS encerrados,
         (SELECT count(*) FROM imovel i WHERE i.fonte_id = f.id AND i.status = 'removido') AS removidos,
         (SELECT count(*) FROM edital e WHERE e.fonte_id = f.id) AS editais
       FROM fonte f ORDER BY f.id`,
    )
    .all()
    .map((l) => {
      const c = db.prepare(`SELECT * FROM coleta WHERE fonte_id = ? ORDER BY iniciada_em DESC, id DESC LIMIT 1`).get(String(l.id));
      return {
        id: String(l.id),
        nome: String(l.nome),
        ativos: Number(l.ativos),
        encerrados: Number(l.encerrados),
        removidos: Number(l.removidos),
        editais: Number(l.editais),
        ultimaColeta: c
          ? {
              id: Number(c.id),
              iniciada_em: String(c.iniciada_em),
              terminada_em: lerTexto(c.terminada_em),
              status: String(c.status),
              completa: Number(c.completa) === 1,
              escopo_uf: lerTexto(c.escopo_uf),
              gerado_na_fonte_em: lerTexto(c.gerado_na_fonte_em),
              lidos: Number(c.lidos),
              novos: Number(c.novos),
              atualizados: Number(c.atualizados),
              removidos: Number(c.removidos),
              invalidos: Number(c.invalidos),
              erro: lerTexto(c.erro),
            }
          : null,
      };
    });
  const porUf = db
    .prepare("SELECT uf, count(*) AS n FROM imovel WHERE status = 'ativo' GROUP BY uf ORDER BY n DESC, uf")
    .all()
    .map((l) => ({ uf: String(l.uf), ativos: Number(l.n) }));
  const porModalidade = db
    .prepare("SELECT modalidade, count(*) AS n FROM imovel WHERE status = 'ativo' GROUP BY modalidade ORDER BY n DESC")
    .all()
    .map((l) => ({ modalidade: String(l.modalidade), ativos: Number(l.n) }));
  const porTag = db
    .prepare(
      `SELECT r.tag, count(DISTINCT r.imovel_id) AS n,
         count(DISTINCT CASE WHEN r.precisa_revisao = 1 AND r.revisado_por IS NULL THEN r.imovel_id END) AS pendentes
       FROM risco r JOIN imovel i ON i.id = r.imovel_id
       WHERE i.status = 'ativo' AND r.valor = 'sim' GROUP BY r.tag ORDER BY n DESC`,
    )
    .all()
    .map((l) => ({
      tag: String(l.tag),
      rotulo: definicaoTag(String(l.tag))?.rotulo ?? String(l.tag),
      imoveis: Number(l.n),
      revisaoPendente: Number(l.pendentes),
    }));
  const comFoto = contagem(
    db,
    `SELECT count(*) AS n FROM imovel i WHERE i.status = 'ativo'
       AND EXISTS (SELECT 1 FROM foto f WHERE f.imovel_id = i.id AND (f.ok IS NULL OR f.ok = 1))`,
  );
  const geo = db
    .prepare("SELECT coalesce(precisao_geo, 'sem') AS p, count(*) AS n FROM imovel WHERE status = 'ativo' GROUP BY p ORDER BY n DESC, p")
    .all()
    .map((l) => ({ precisao: String(l.p), ativos: Number(l.n) }));
  const dup = db
    .prepare(
      `SELECT count(*) AS grupos, coalesce(sum(n), 0) AS imoveis, coalesce(sum(fontes > 1), 0) AS entre_fontes FROM (
         SELECT chave_dedup, count(*) AS n, count(DISTINCT fonte_id) AS fontes FROM imovel
         WHERE status = 'ativo' AND chave_dedup IS NOT NULL GROUP BY chave_dedup HAVING count(*) > 1)`,
    )
    .get();
  const porImovel = agruparDuplicatas(
    db
      .prepare("SELECT id, fonte_id, chave_dedup, chave_endereco FROM imovel WHERE status = 'ativo' AND (chave_dedup IS NOT NULL OR chave_endereco IS NOT NULL)")
      .all()
      .map((l) => ({ id: Number(l.id), fonte: String(l.fonte_id), chave_dedup: lerTexto(l.chave_dedup), chave_endereco: lerTexto(l.chave_endereco) })),
  );
  return {
    versaoBanco: versaoDoBanco(db),
    totais: {
      imoveis: contagem(db, "SELECT count(*) AS n FROM imovel"),
      ativos,
      editais: contagem(db, "SELECT count(*) AS n FROM edital"),
      coletas: contagem(db, "SELECT count(*) AS n FROM coleta"),
    },
    fontes,
    porUf,
    porModalidade,
    porTag,
    fotos: { ativosComFoto: comFoto, ativos, percentual: ativos > 0 ? Math.round((comFoto / ativos) * 1000) / 10 : 0 },
    geo,
    duplicatas: { grupos: Number(dup?.grupos ?? 0), imoveis: Number(dup?.imoveis ?? 0), gruposEntreFontes: Number(dup?.entre_fontes ?? 0) },
    mesmoImovel: {
      grupos: porImovel.grupos,
      imoveis: porImovel.imoveis,
      gruposEntreFontes: porImovel.gruposEntreFontes,
      enderecosComMatriculasDiferentes: porImovel.enderecosComMatriculasDiferentes,
    },
  };
}

const n = (valor: number): string => formatarNumeroBR(valor);

/** Relatório em texto para o terminal. */
export function formatarStatus(r: RelatorioStatus): string {
  const linhas: string[] = [];
  linhas.push(`Base Luneta (esquema v${r.versaoBanco})`);
  linhas.push(
    `Imóveis: ${n(r.totais.imoveis)} (${n(r.totais.ativos)} ativos) · Editais: ${n(r.totais.editais)} · Coletas registradas: ${n(r.totais.coletas)}`,
  );
  linhas.push("");
  linhas.push("Fontes:");
  if (r.fontes.length === 0) linhas.push("  (nenhuma fonte coletada ainda)");
  for (const f of r.fontes) {
    linhas.push(`  ${f.id} — ${f.nome}`);
    linhas.push(`    ativos ${n(f.ativos)} · encerrados ${n(f.encerrados)} · removidos ${n(f.removidos)}${f.editais ? ` · editais ${n(f.editais)}` : ""}`);
    const c = f.ultimaColeta;
    if (!c) {
      linhas.push("    última coleta: nenhuma");
      continue;
    }
    const escopo = c.escopo_uf ? ` (UF ${c.escopo_uf})` : "";
    const geracao = c.gerado_na_fonte_em ? `, gerado na fonte em ${c.gerado_na_fonte_em}` : "";
    linhas.push(`    última coleta: ${c.iniciada_em} · ${c.status}${c.completa ? " · completa" : ""}${escopo}${geracao}`);
    linhas.push(`      lidos ${n(c.lidos)} · novos ${n(c.novos)} · atualizados ${n(c.atualizados)} · removidos ${n(c.removidos)} · inválidos ${n(c.invalidos)}`);
    if (c.erro) linhas.push(`      erro: ${c.erro}`);
    if (c.status === "executando") linhas.push("      (ainda executando ou interrompida)");
  }
  linhas.push("");
  linhas.push(`Por UF (ativos): ${r.porUf.length ? r.porUf.map((u) => `${u.uf} ${n(u.ativos)}`).join(" · ") : "—"}`);
  linhas.push(`Por modalidade (ativos): ${r.porModalidade.length ? r.porModalidade.map((m) => `${m.modalidade} ${n(m.ativos)}`).join(" · ") : "—"}`);
  linhas.push(`Fotos: ${r.fotos.percentual.toLocaleString("pt-BR")}% dos ativos com ao menos uma foto (${n(r.fotos.ativosComFoto)} de ${n(r.fotos.ativos)})`);
  linhas.push(`Coordenadas (ativos, por precisão): ${r.geo.length ? r.geo.map((g) => `${g.precisao} ${n(g.ativos)}`).join(" · ") : "—"}`);
  linhas.push(`Duplicatas (mesma chave_dedup): ${n(r.duplicatas.grupos)} grupo(s) com ${n(r.duplicatas.imoveis)} anúncios, ${n(r.duplicatas.gruposEntreFontes)} entre fontes diferentes`);
  const m = r.mesmoImovel;
  linhas.push(
    `Mesmo imóvel (chave_dedup ou chave_endereco): ${n(m.grupos)} grupo(s) com ${n(m.imoveis)} anúncios, ${n(m.gruposEntreFontes)} entre fontes diferentes`
      + (m.enderecosComMatriculasDiferentes ? `; ${n(m.enderecosComMatriculasDiferentes)} endereço(s) com matrículas diferentes, não juntados` : ""),
  );
  linhas.push("Tags (imóveis ativos com valor sim):");
  if (r.porTag.length === 0) linhas.push("  (nenhuma tag detectada; rode `riscos` depois de registrar regras)");
  for (const t of r.porTag) {
    linhas.push(`  ${t.rotulo} (${t.tag}): ${n(t.imoveis)}${t.revisaoPendente ? ` · ${n(t.revisaoPendente)} aguardando revisão` : ""}`);
  }
  return linhas.join("\n");
}
