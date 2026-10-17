/**
 * Baixa as fichas da Caixa (página detalhe-imovel.asp, em HTML) para uma pasta, sem gravar no banco.
 * Serve para ler a ficha (matrícula, comarca, ofício, inscrição imobiliária, regras de despesas...) de
 * onde a rede alcança a Caixa (ex.: GitHub Actions) e depois aplicar no banco local com
 * `LUNETA_CAIXA_FICHAS=<pasta>` (o conector lê as fichas da pasta em vez da rede).
 *
 * Sempre pelo cliente educado da base: User-Agent identificado, robots.txt, 2 s entre páginas,
 * retentativas. Página de desafio anti-robô NÃO é contornada: conta como bloqueio, e 5 bloqueios
 * seguidos param tudo.
 *
 *   node --experimental-strip-types base/fontes/caixa/baixar-fichas.ts --ids 1444419640129,8444402395965 --saida fichas
 *   node --experimental-strip-types base/fontes/caixa/baixar-fichas.ts --uf RJ --quantidade 200 --saida fichas
 *
 * Com --uf, os ids vêm do instantâneo do site (base/saida/site/imoveis.json.gz), na ordem dele.
 * Saída: <saida>/<id13>.html, <saida>/resumo.json ({ ok, bloqueio, falha }) e <saida>/fichas.json (os campos
 * lidos de cada ficha, já com a máscara LGPD do parser: é o que pode ser publicado, sem o HTML da Caixa).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { criarClienteHttp, ErroHttp } from "../../util/http.ts";
import { fichaBloqueada, interpretarFicha } from "./ficha.ts";
import { urlFicha } from "./index.ts";
import { decodificarLista } from "./lista.ts";

const { values: v } = parseArgs({
  options: {
    ids: { type: "string" },
    uf: { type: "string" },
    quantidade: { type: "string" },
    inicio: { type: "string" },
    saida: { type: "string", default: "fichas" },
  },
});

async function idsDoInstantaneo(uf: string, quantidade: number, inicio: number): Promise<string[]> {
  const bruto = JSON.parse(gunzipSync(await readFile("base/saida/site/imoveis.json.gz")).toString("utf8")) as {
    colunas: { id: string[]; uf: string[] };
  };
  const ids: string[] = [];
  bruto.colunas.id.forEach((id, i) => {
    const m = /^caixa-(\d{13})$/.exec(id);
    if (m?.[1] && bruto.colunas.uf[i] === uf) ids.push(m[1]);
  });
  return ids.slice(inicio, inicio + quantidade);
}

const ids = v.ids
  ? v.ids.split(",").map((s) => s.trim().replace(/\D/g, "").padStart(13, "0")).filter((s) => s.length === 13)
  : v.uf
    ? await idsDoInstantaneo(v.uf.toUpperCase(), Number(v.quantidade ?? 50), Number(v.inicio ?? 0))
    : [];
if (ids.length === 0) {
  console.error("Informe --ids <id13,...> ou --uf <UF> [--quantidade N] [--inicio N].");
  process.exit(2);
}

const saida = v.saida ?? "fichas";
await mkdir(saida, { recursive: true });
const http = criarClienteHttp({ intervaloMinimoMs: 2000, log: (m) => console.log(m) });
const resumo = { ok: [] as string[], bloqueio: [] as { id: string; motivo: string }[], falha: [] as { id: string; motivo: string }[] };
const lidas: Record<string, ReturnType<typeof interpretarFicha>> = {};
let bloqueiosSeguidos = 0;

for (const [i, id] of ids.entries()) {
  try {
    const resposta = await http.requisitar(urlFicha(id), {
      cabecalhos: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      validar: (r) => fichaBloqueada(decodificarLista(r.bytes)),
    });
    const html = decodificarLista(resposta.bytes);
    // confere que é mesmo a ficha deste imóvel (exige "Número do imóvel"); só então grava
    const ficha = interpretarFicha(html);
    await writeFile(join(saida, `${id}.html`), resposta.bytes);
    resumo.ok.push(id);
    lidas[id] = ficha;
    bloqueiosSeguidos = 0;
    console.log(`[${i + 1}/${ids.length}] ${id}: ok · matrícula ${ficha.matriculas.join(", ") || "—"} · ${ficha.comarca ?? "sem comarca"}`);
  } catch (erro) {
    const motivo = (erro as Error).message;
    const bloqueio = erro instanceof ErroHttp && (erro.motivo === "robots" || erro.motivo === "conteudo" || erro.status === 403 || erro.status === 429);
    (bloqueio ? resumo.bloqueio : resumo.falha).push({ id, motivo });
    console.log(`[${i + 1}/${ids.length}] ${id}: ${bloqueio ? "BLOQUEIO" : "falha"} · ${motivo}`);
    bloqueiosSeguidos = bloqueio ? bloqueiosSeguidos + 1 : 0;
    if (bloqueiosSeguidos >= 5) {
      console.log("5 bloqueios seguidos: parando (o coletor não contorna anti-robô).");
      break;
    }
  }
}

await writeFile(join(saida, "resumo.json"), JSON.stringify(resumo, null, 1));
await writeFile(join(saida, "fichas.json"), JSON.stringify({ lidas_em: new Date().toISOString(), fichas: lidas }));
console.log(`Fim: ${resumo.ok.length} ok, ${resumo.bloqueio.length} bloqueio(s), ${resumo.falha.length} falha(s).`);
