/**
 * Linha de comando da base. Rode pela raiz do repositório:
 *   npm run base:migrar
 *   npm run base:coletar -- <fonte> [--uf SP] [--arquivo caminho] [--limite 100] [--detalhes]
 *   npm run base:riscos -- [--fonte <id>]
 *   npm run base:exportar -- [--saida caminho] [--limite N]
 *   npm run base:exportar -- --site [--pasta base/saida] [--amostra 60]   (amostra, estatísticas e catálogo em site/)
 *   npm run base:status -- [--json]
 * ou direto: node --experimental-strip-types base/cli.ts <comando> ...
 * Em qualquer comando, --banco <caminho> (ou LUNETA_DB) troca o arquivo do banco.
 */
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { executarColeta, type ResumoColeta } from "./coleta.ts";
import { abrirBanco, CAMINHO_PADRAO, migrar, versaoDoBanco } from "./db.ts";
import { exportar, exportarSite, PASTA_CATALOGO, PASTA_SITE_PADRAO, SAIDA_PADRAO } from "./exportar.ts";
import { APELIDOS, CONECTORES, conferirRegistro, obterConector, resolverIdFonte } from "./fontes/index.ts";
import { rodarRiscos } from "./riscos/motor.ts";
import { formatarStatus, relatorioStatus } from "./status.ts";
import type { Conector } from "./tipos.ts";
import type { ClienteHttp } from "./util/http.ts";
import { normalizarUf } from "./util/uf.ts";

const AJUDA = `Base da Luneta de Leilões

Uso: node --experimental-strip-types base/cli.ts <comando> [opções]

Comandos:
  migrar                              cria ou atualiza o banco (idempotente)
  coletar <fonte> [opções]            coleta uma fonte e grava (transacional); <fonte> é o id
                                      ou o apelido (caixa, leiloesjudiciais, leiloeiros); leiloeiros
                                      lê o JSONL dos coletores (--arquivo) e grava uma fonte por leiloeiro
      --uf <UF>                       só uma UF (marca removidos só nela)
      --arquivo <caminho>             lê arquivo local em vez da rede (sinônimo: --fixture)
      --limite <N>                    para depois de N registros (não marca removidos)
      --detalhes                      também busca páginas de detalhe (mais lento)
  riscos [--fonte <id>]               roda as regras de risco e regrava as tags automáticas
  exportar [--saida <arq>] [--limite <N>]
                                      JSON completo (padrão base/dados/exportacao/imoveis.json)
  exportar --site [--pasta <dir>] [--amostra <N>]
                                      instantâneo para o site (padrão base/saida): amostra-site.json
                                      (até 60 imóveis no formato Listing), estatisticas-uf.json e o
                                      catálogo completo em site/ (lista e detalhes em .json.gz)
  status [--json]                     contagens por fonte, UF, modalidade, tags, fotos e coletas
  fontes                              lista os conectores registrados

Opção geral: --banco <caminho> (padrão base/dados/luneta.db ou LUNETA_DB)`;

export interface DependenciasCli {
  conectores?: readonly Conector[];
  http?: ClienteHttp;
  agora?: Date;
  saida?: (texto: string) => void;
  erro?: (texto: string) => void;
}

function formatarResumo(r: ResumoColeta): string {
  const linhas = [
    `Coleta #${r.coletaId} de ${r.fonteId}: ${r.status}${r.completa ? " (completa: removidos marcados)" : ""}`,
    `  lidos ${r.lidos} · descartados ${r.descartados} · inválidos ${r.invalidos}`,
    `  novos ${r.novos} · atualizados ${r.atualizados} · inalterados ${r.inalterados} · reativados ${r.reativados} · removidos ${r.removidos}${r.antigos ? ` · ignorados (mais antigos) ${r.antigos}` : ""}${r.editais ? ` · editais ${r.editais}` : ""}`,
  ];
  if (r.origem) linhas.push(`  origem: ${r.origem}`);
  if (r.geradoEm) linhas.push(`  gerado na fonte em: ${r.geradoEm}`);
  if (r.erro) linhas.push(`  erro: ${r.erro}`);
  for (const aviso of r.avisos) linhas.push(`  aviso: ${aviso}`);
  return linhas.join("\n");
}

/** Executa a CLI e devolve o código de saída (0 ok, 1 falha da operação, 2 uso incorreto). */
export async function principal(argv: readonly string[], deps: DependenciasCli = {}): Promise<number> {
  const saida = deps.saida ?? ((t: string) => process.stdout.write(t + "\n"));
  const erro = deps.erro ?? ((t: string) => process.stderr.write(t + "\n"));
  const conectores = deps.conectores ?? CONECTORES;

  let args: ReturnType<typeof lerArgs>;
  try {
    args = lerArgs(argv);
  } catch (e) {
    erro(`${(e as Error).message}\n\n${AJUDA}`);
    return 2;
  }
  const { values: v, positionals } = args;
  const [comando, ...resto] = positionals;
  if (v.ajuda || !comando || comando === "ajuda") {
    saida(AJUDA);
    return comando || v.ajuda ? 0 : 2;
  }
  const caminhoBanco = v.banco ? resolve(v.banco) : process.env.LUNETA_DB || CAMINHO_PADRAO;

  switch (comando) {
    case "migrar": {
      const db = abrirBanco(caminhoBanco, { migrar: false });
      try {
        const r = migrar(db);
        saida(
          r.aplicadas.length > 0
            ? `Banco ${caminhoBanco}: versão ${r.de} → ${r.para} (aplicadas: ${r.aplicadas.join(", ")})`
            : `Banco ${caminhoBanco} já está na versão ${versaoDoBanco(db)}.`,
        );
        return 0;
      } finally {
        db.close();
      }
    }

    case "coletar": {
      const id = resto[0];
      if (!id) {
        erro("Informe a fonte: coletar <fonte>. Use `fontes` para ver as disponíveis.");
        return 2;
      }
      const conector = obterConector(id, conectores);
      if (!conector) {
        const disponiveis = conectores.map((c) => c.id).join(", ") || "(nenhum conector registrado em base/fontes/index.ts)";
        erro(`Fonte desconhecida: ${id}. Disponíveis: ${disponiveis}`);
        return 2;
      }
      const uf = v.uf ? normalizarUf(v.uf) : undefined;
      if (v.uf && !uf) {
        erro(`UF inválida: ${v.uf}`);
        return 2;
      }
      const limite = v.limite ? Number(v.limite) : undefined;
      if (limite !== undefined && (!Number.isInteger(limite) || limite <= 0)) {
        erro(`--limite precisa ser um inteiro positivo: ${v.limite}`);
        return 2;
      }
      const controle = new AbortController();
      const cancelar = (): void => {
        erro("Cancelando a coleta (nada será gravado)...");
        controle.abort();
      };
      process.once("SIGINT", cancelar);
      const db = abrirBanco(caminhoBanco);
      try {
        const arquivo = v.arquivo ?? v.fixture;
        const caminho = arquivo ? resolve(arquivo) : undefined;
        // Conector que se desdobra (leiloeiros: uma fonte por leiloeiro do arquivo): uma coleta por parte.
        let alvos: readonly Conector[] = [conector];
        if (conector.desdobrar) {
          try {
            alvos = await conector.desdobrar({ arquivo: caminho, log: (m) => erro(m), sinal: controle.signal, agora: deps.agora });
          } catch (e) {
            erro(`Coleta ${conector.id} falhou: ${(e as Error).message}`);
            return 1;
          }
        }
        let falhou = false;
        for (const alvo of alvos) {
          const resumo = await executarColeta(db, alvo, {
            uf: uf ?? undefined,
            arquivo: caminho,
            limite,
            detalhes: Boolean(v.detalhes),
            http: deps.http,
            agora: deps.agora,
            sinal: controle.signal,
            log: (m) => erro(m),
          });
          saida(formatarResumo(resumo));
          if (resumo.status !== "sucesso" && resumo.status !== "parcial") falhou = true;
          if (controle.signal.aborted) break;
        }
        return falhou ? 1 : 0;
      } finally {
        process.off("SIGINT", cancelar);
        db.close();
      }
    }

    case "riscos": {
      const db = abrirBanco(caminhoBanco);
      try {
        const r = rodarRiscos(db, { fonteId: v.fonte ? resolverIdFonte(v.fonte) : undefined, agora: deps.agora });
        saida(`Riscos: ${r.riscos} tag(s) gravada(s) em ${r.imoveis} imóvel(is).`);
        for (const e of r.erros) erro(`aviso: ${e}`);
        if (r.totalErros > r.erros.length) erro(`(+${r.totalErros - r.erros.length} avisos omitidos)`);
        return 0;
      } finally {
        db.close();
      }
    }

    case "exportar": {
      const limite = v.limite ? Number(v.limite) : undefined;
      if (limite !== undefined && (!Number.isInteger(limite) || limite <= 0)) {
        erro(`--limite precisa ser um inteiro positivo: ${v.limite}`);
        return 2;
      }
      const amostra = v.amostra ? Number(v.amostra) : undefined;
      if (amostra !== undefined && (!Number.isInteger(amostra) || amostra <= 0)) {
        erro(`--amostra precisa ser um inteiro positivo: ${v.amostra}`);
        return 2;
      }
      const db = abrirBanco(caminhoBanco);
      try {
        if (v.site) {
          const pasta = v.pasta ? resolve(v.pasta) : PASTA_SITE_PADRAO;
          const r = exportarSite(db, pasta, { amostra, agora: deps.agora });
          const ufsAmostra = new Set(r.amostra.imoveis.map((i) => i.uf)).size;
          saida(`Amostra para o site: ${r.amostra.total} imóvel(is) de ${ufsAmostra} UF(s) em ${r.arquivos[0]}`);
          saida(`Estatísticas: ${r.estatisticas.brasil.ativos} ativo(s) em ${r.estatisticas.ufs.length} UF(s) em ${r.arquivos[1]}`);
          const kb = (b: number) => `${Math.round(b / 1024).toLocaleString("pt-BR")} KB`;
          saida(
            `Catálogo do site: ${r.catalogo.total} imóvel(is) em ${join(pasta, PASTA_CATALOGO)} `
              + `(lista ${kb(r.catalogo.bytes.lista)}, detalhes ${kb(r.catalogo.bytes.detalhes)} em ${r.catalogo.arquivos.length - 1} pedaços)`,
          );
          return 0;
        }
        const destino = v.saida ? resolve(v.saida) : SAIDA_PADRAO;
        const dados = exportar(db, destino, { limite, agora: deps.agora });
        saida(`Exportados ${dados.total} imóvel(is) para ${destino}`);
        return 0;
      } finally {
        db.close();
      }
    }

    case "status": {
      const db = abrirBanco(caminhoBanco);
      try {
        const relatorio = relatorioStatus(db);
        saida(v.json ? JSON.stringify(relatorio, null, 2) : `${formatarStatus(relatorio)}\nBanco: ${caminhoBanco}`);
        return 0;
      } finally {
        db.close();
      }
    }

    case "fontes": {
      const problemas = conferirRegistro(conectores);
      if (conectores.length === 0) saida("Nenhum conector registrado (base/fontes/index.ts).");
      for (const c of conectores) {
        const apelidos = Object.keys(APELIDOS).filter((a) => APELIDOS[a] === c.id);
        saida(
          `${c.id}\t${c.nome}\t${c.finalidade}\t${c.acesso}${c.capacidades.listaCompleta ? "\tlista completa" : ""}`
            + (apelidos.length ? `\tapelido: ${apelidos.join(", ")}` : ""),
        );
      }
      for (const p of problemas) erro(`problema no registro: ${p}`);
      return problemas.length > 0 ? 1 : 0;
    }

    default:
      erro(`Comando desconhecido: ${comando}\n\n${AJUDA}`);
      return 2;
  }
}

function lerArgs(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      banco: { type: "string" },
      uf: { type: "string" },
      arquivo: { type: "string" },
      fixture: { type: "string" },
      limite: { type: "string" },
      detalhes: { type: "boolean" },
      fonte: { type: "string" },
      saida: { type: "string" },
      site: { type: "boolean" },
      pasta: { type: "string" },
      amostra: { type: "string" },
      json: { type: "boolean" },
      ajuda: { type: "boolean", short: "h" },
    },
  });
}

const executadoDireto = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executadoDireto) {
  principal(process.argv.slice(2)).then(
    (codigo) => {
      process.exitCode = codigo;
    },
    (e: unknown) => {
      process.stderr.write(`Erro: ${(e as Error)?.stack ?? String(e)}\n`);
      process.exitCode = 1;
    },
  );
}
