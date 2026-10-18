// Coleta no PC do dono (guia: base/COLETA-NO-PC.md): node base/coleta-pc.mjs [opções]. `npm run coleta:pc` chama este.
//
// Confere a versão do Node antes de abrir o programa em TypeScript (base/coleta-pc.ts): abaixo do 22.6 o Node nem
// reconhece --experimental-strip-types, e a mensagem dele não diz o que fazer. JavaScript simples de propósito: roda em
// qualquer Node.
//
// O guia manda rodar por aqui, sem o npm: no Windows o PowerShell bloqueia o `npm` (política de execução) e engole o
// "--" das opções, e com o npm o Ctrl+C derruba só o shell dele, o terminal volta e a coleta segue gravando por trás.
// Aqui o Ctrl+C chega ao programa (mesmo terminal) e este processo só espera ele terminar de gravar e de enviar.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 6)) {
  console.error(
    `Seu Node é o ${process.versions.node}, e a coleta precisa do 22.6 ou mais novo.\n` +
      "Instale a versão LTS em https://nodejs.org/pt-br/download, feche e abra o terminal e rode de novo.",
  );
  process.exit(1);
}

const aqui = dirname(fileURLToPath(import.meta.url));
// Só as opções que este Node conhece: num Node futuro em que o TypeScript já vem ligado e a opção experimental sumiu,
// passá-la daria "bad option" em vez de rodar.
const aceita = (opcao) => process.allowedNodeEnvironmentFlags.has(opcao);
const opcoesDoNode = [];
if (aceita("--experimental-strip-types")) opcoesDoNode.push("--experimental-strip-types");
if (aceita("--disable-warning")) opcoesDoNode.push("--disable-warning=ExperimentalWarning");
// Confia também nos certificados do sistema (Node 22.15+), como o navegador: um antivírus que inspeciona HTTPS (comum no
// Windows) instala a raiz dele ali, e sem isto o Node recusa todo site seguro. Não muda nada no acesso à Caixa.
if (aceita("--use-system-ca")) opcoesDoNode.push("--use-system-ca");
const filho = spawn(process.execPath, [...opcoesDoNode, join(aqui, "coleta-pc.ts"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, LUNETA_COLETA_PC: "1" },
});
// O Ctrl+C chega direto ao programa (é o mesmo terminal): aqui só esperamos ele terminar de gravar e de enviar.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => filho.kill("SIGTERM"));
filho.on("error", (erro) => {
  console.error(`Não consegui abrir a coleta: ${erro.message}`);
  process.exit(1);
});
filho.on("exit", (codigo, sinal) => process.exit(codigo ?? (sinal ? 130 : 1)));
