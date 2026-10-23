#!/usr/bin/env node
/**
 * Roteiro "fotos" do workflow de prints (.github/workflows/site-prints.yml → scripts/prints/actions.mjs): baixa as fotos
 * candidatas de scripts/prints/fotos-candidatas.json (URL padrão da Caixa, a mesma que o site mostra num <img>), reduz
 * cada uma a 320 px e monta folhas de contato numeradas em prints-saida/, para a escolha visual das fotos da vitrine e
 * das fotos ilustrativas dos exemplos (rodada 5, frente V).
 *
 * Só para escolher: o site nunca baixa nem re-hospeda foto (ele aponta para a da fonte). Um pedido por vez, com pausa
 * e um User-Agent que diz quem somos. Se a Caixa responder com bloqueio (403, 429, página de desafio em vez de imagem),
 * o roteiro PARA depois de 5 seguidos e grava o motivo: não contornamos anti-robô.
 *
 *   node scripts/prints/fotos.mjs            # todas as candidatas
 *   node scripts/prints/fotos.mjs vitrine    # só um grupo
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const SAIDA = join(RAIZ, "prints-saida");
mkdirSync(SAIDA, { recursive: true });
const { candidatas } = JSON.parse(readFileSync(join(RAIZ, "scripts", "prints", "fotos-candidatas.json"), "utf8"));
const grupo = process.argv[2] && process.argv[2] !== "fotos" ? process.argv[2] : null;
const lista = grupo ? candidatas.filter((c) => c.grupo === grupo) : candidatas;

const PAUSA_MS = 1200;
const AGENTE = "Mozilla/5.0 (compatible; LunetaDeLeiloes-fotos/1.0; +https://luneta-de-leiloes.vercel.app; escolha de fotos, um pedido por vez)";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.log("sharp indisponível: as fotos ficam como vieram e sem folha de contato");
}

const relatorio = [];
const log = (...x) => {
  const linha = x.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
  relatorio.push(linha);
  console.log(linha);
};

/** JPEG, PNG, GIF ou WebP pelos primeiros bytes (uma página de desafio vem como HTML, mesmo com status 200). */
function ehImagem(b) {
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8) return true;
  if (b[0] === 0x89 && b[1] === 0x50) return true;
  if (b.slice(0, 3).toString() === "GIF") return true;
  return b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP";
}

const resultados = [];
let bloqueiosSeguidos = 0;
let parou = null;
for (const [n, c] of lista.entries()) {
  const numero = String(n + 1).padStart(3, "0");
  const r = { numero, id: c.id, grupo: c.grupo, url: c.foto, status: null, bytes: 0, imagem: false, largura: null, altura: null, arquivo: null, erro: null };
  try {
    const resp = await fetch(c.foto, { headers: { "User-Agent": AGENTE, Accept: "image/avif,image/webp,image/*,*/*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    r.status = resp.status;
    const b = Buffer.from(await resp.arrayBuffer());
    r.bytes = b.length;
    r.tipo = resp.headers.get("content-type");
    r.imagem = resp.ok && ehImagem(b);
    if (r.imagem) {
      bloqueiosSeguidos = 0;
      const nome = `foto-${numero}-${c.grupo}-${c.id}.jpg`;
      if (sharp) {
        const img = sharp(b);
        const meta = await img.metadata();
        r.largura = meta.width ?? null;
        r.altura = meta.height ?? null;
        await img.resize({ width: 320 }).jpeg({ quality: 78 }).toFile(join(SAIDA, nome));
      } else {
        writeFileSync(join(SAIDA, nome), b);
      }
      r.arquivo = nome;
    } else {
      r.erro = resp.ok ? `não é imagem (${r.tipo}, ${b.length} bytes): ${b.slice(0, 120).toString().replace(/\s+/g, " ")}` : `HTTP ${resp.status}`;
      if ([401, 403, 429, 503].includes(resp.status) || (resp.ok && /html/i.test(r.tipo ?? ""))) bloqueiosSeguidos++;
    }
  } catch (e) {
    r.erro = String(e).slice(0, 200);
  }
  resultados.push(r);
  log(numero, c.grupo, c.id, r.status, r.imagem ? `ok ${r.largura}x${r.altura} ${r.bytes} B` : `FALHOU ${r.erro}`);
  if (bloqueiosSeguidos >= 5) {
    parou = "5 respostas seguidas de bloqueio (403/429/503 ou página em vez de imagem): parei, sem contornar";
    log("PAROU:", parou);
    break;
  }
  await esperar(PAUSA_MS);
}

// folhas de contato: 4 colunas × 4 linhas de 320 × 240, com o número e o grupo embaixo de cada foto
if (sharp) {
  const boas = resultados.filter((r) => r.arquivo);
  const COL = 4;
  const LIN = 4;
  const W = 320;
  const H = 240;
  const ROT = 26;
  const esc = (t) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  for (let f = 0; f * COL * LIN < boas.length; f++) {
    const fatia = boas.slice(f * COL * LIN, (f + 1) * COL * LIN);
    const camadas = [];
    for (const [k, r] of fatia.entries()) {
      const x = (k % COL) * W;
      const y = Math.floor(k / COL) * (H + ROT);
      const foto = await sharp(join(SAIDA, r.arquivo)).resize({ width: W, height: H, fit: "cover" }).toBuffer();
      camadas.push({ input: foto, left: x, top: y });
      const rotulo = `<svg width="${W}" height="${ROT}"><rect width="100%" height="100%" fill="#0b1020"/><text x="8" y="18" font-family="DejaVu Sans, sans-serif" font-size="14" fill="#f2f4fa">${esc(`${r.numero} · ${r.grupo} · ${r.id.replace("caixa-", "")}`)}</text></svg>`;
      camadas.push({ input: Buffer.from(rotulo), left: x, top: y + H });
    }
    const linhas = Math.ceil(fatia.length / COL);
    await sharp({ create: { width: COL * W, height: linhas * (H + ROT), channels: 3, background: "#0b1020" } })
      .composite(camadas)
      .png()
      .toFile(join(SAIDA, `folha-${String(f + 1).padStart(2, "0")}.png`));
  }
}

const resumo = {
  quando: new Date().toISOString(),
  pedidas: lista.length,
  tentadas: resultados.length,
  imagens: resultados.filter((r) => r.imagem).length,
  parou,
  resultados,
};
writeFileSync(join(SAIDA, "fotos-resultado.json"), JSON.stringify(resumo, null, 1));
writeFileSync(join(SAIDA, "fotos-log.txt"), relatorio.join("\n") + "\n");
log(`fim: ${resumo.imagens} de ${resumo.tentadas} fotos baixadas${parou ? ` (${parou})` : ""}`);
