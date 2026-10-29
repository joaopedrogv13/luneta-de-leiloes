// Atualização diária do site no PC do dono (guia: base/ATUALIZAR-SITE.md): node base/atualizar-site.mjs [opções].
// `npm run site:atualizar` chama este.
//
// Igual ao base/coleta-pc.mjs: JavaScript simples, que roda em qualquer Node, confere a versão antes de abrir o
// programa em TypeScript (base/atualizar-site.ts) e repassa o Ctrl+C. Antes, atualiza o projeto com
// `git pull --ff-only` (só no branch main e sem --sem-atualizar): uma rotina diária com código velho poderia publicar
// um instantâneo num formato que o site novo já não lê.
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 13)) {
  console.error(
    `Seu Node é o ${process.versions.node}, e a atualização do site precisa do 22.13 ou mais novo.\n` +
      "Instale a versão LTS em https://nodejs.org/pt-br/download, feche e abra o terminal e rode de novo.",
  );
  process.exit(1);
}

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const args = process.argv.slice(2);
const pedeAjuda = args.some((a) => a === "--ajuda" || a === "-h" || a === "--help");
const semAtualizar = args.includes("--sem-atualizar") || process.env.npm_config_sem_atualizar === "true";

if (!pedeAjuda && !semAtualizar) {
  const git = (...a) => spawnSync("git", a, { cwd: raiz, encoding: "utf8", windowsHide: true, timeout: 120_000 });
  const ramo = git("rev-parse", "--abbrev-ref", "HEAD");
  if (ramo.status === 0 && ramo.stdout.trim() === "main") {
    const antes = git("rev-parse", "HEAD").stdout.trim();
    const pull = git("-c", "core.autocrlf=false", "pull", "-q", "--ff-only", "origin", "main");
    if (pull.status === 0) {
      const depois = git("rev-parse", "HEAD").stdout.trim();
      console.log(antes === depois ? "Projeto já estava atualizado (git pull)." : "Projeto atualizado (git pull).");
    } else {
      console.log(
        "Aviso: não consegui atualizar o projeto (git pull); sigo com o código que está aqui.\n" +
          `  ${(pull.stderr || pull.stdout || "").trim().split("\n").slice(-2).join(" | ")}`,
      );
    }
  } else if (ramo.status === 0) {
    console.log(`Aviso: o projeto está no branch "${ramo.stdout.trim()}", não no main: não rodei o git pull.`);
  }
}

const aceita = (opcao) => process.allowedNodeEnvironmentFlags.has(opcao);
const opcoesDoNode = [];
if (aceita("--experimental-strip-types")) opcoesDoNode.push("--experimental-strip-types");
if (aceita("--disable-warning")) opcoesDoNode.push("--disable-warning=ExperimentalWarning");
if (aceita("--use-system-ca")) opcoesDoNode.push("--use-system-ca");
const filho = spawn(process.execPath, [...opcoesDoNode, join(aqui, "atualizar-site.ts"), ...args], {
  stdio: "inherit",
  env: { ...process.env, LUNETA_ATUALIZAR_SITE: "1" },
});
process.on("SIGINT", () => {});
process.on("SIGTERM", () => filho.kill("SIGTERM"));
filho.on("error", (erro) => {
  console.error(`Não consegui abrir a atualização: ${erro.message}`);
  process.exit(1);
});
filho.on("exit", (codigo, sinal) => process.exit(codigo ?? (sinal ? 130 : 1)));
