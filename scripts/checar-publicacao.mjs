#!/usr/bin/env node
/**
 * Checagem de publicação: lista o que ainda não pode ir ao ar.
 *
 *   npm run check:publicacao                                  relatório no terminal
 *   npm run -s check:publicacao -- --json                     o mesmo relatório em JSON (-s tira o cabeçalho do npm)
 *   npm run check:publicacao -- --url http://localhost:3000   também conta [data-placeholder] no HTML
 *
 * Varre o texto do código (strings, templates e texto JSX; comentários ficam de fora) de
 * src/content, src/components e src/app, lido como a página mostra (escapes e entidades interpretados;
 * quebra de linha e recuo viram um espaço), e aponta, com arquivo:linha:coluna e o trecho:
 *   a) placeholders entre colchetes ("[X]", "[49]", "[Leiloeiro 1]"…) e valores null do conteúdo
 *      (STATS: null vira [X] na página);
 *   b) "fictício" em texto visível (informativo: enquanto houver exemplo fictício, ele segue rotulado);
 *   c) notas internas ("a validar", "versão publicada"…).
 * Código de saída: 1 se houver item em a) ou c); 0 caso contrário; 2 em erro de uso ou de rede.
 *
 * Lê o código com o TypeScript que o projeto já usa (devDependency): nenhum pacote novo.
 * Não faz parte do build nem do lint.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/** Pastas varridas: conteúdo, componentes e páginas (metadados e Open Graph também vão ao ar). */
const PASTAS = ["src/content", "src/components", "src/app"];

/** c) Frases que só fazem sentido para a equipe. Acento opcional; maiúsculas não importam. */
const NOTAS = [
  /(?<!\p{L})a\s+validar(?!\p{L})/giu,
  /(?<!\p{L})vers[ãa]o\s+publicada/giu,
  /(?<!\p{L})devem?\s+ser\s+validad\p{L}*/giu,
  /(?<!\p{L})ainda\s+n[ãa]o\s+envia\p{L}*/giu,
  /(?<!\p{L})convite\s+ao\s+upgrade(?!\p{L})/giu,
  /(?<!\p{L})sugerid\p{L}*/giu,
  // aviso de demonstração da confirmação do formulário (FINAL_CTA.successText)
  /(?<!\p{L})envio\s+for\s+ligado/giu,
];

/** b) "fictício", "fictícios", "fictícia"… */
const FICTICIO = /(?<!\p{L})fict[íi]ci[oa]s?(?!\p{L})/giu;

/** Atributo HTML num seletor CSS ("[data-h=lens]", "[href*='#']", "[inert]"): não é placeholder. */
const ATRIBUTO =
  /^\s*(?:data-[\w-]*|aria-[\w-]+|href|src|name|id|class|role|type|value|lang|dir|for|rel|target|style|hidden|inert|open|disabled|checked|selected|tabindex|contenteditable|draggable)\s*(?:[~|^$*]?=\s*(?:"[^"]*"|'[^']*'|[^\s\]]*))?\s*(?:\s[iIsS])?\s*$/;

/** O que sobra de um seletor (ou CSS) sem os colchetes: tags, classes, combinadores, :not(), { … }. Texto tem maiúscula ou acento. */
const RESTO_DE_SELETOR = /^[a-z0-9\s_.#:,>+~*()\-{};%!@'"/=]*$/;

/** Chamadas cujo argumento é código (seletor, regex, atributo), nunca texto da página. */
const SO_CODIGO =
  /^(?:querySelector(?:All)?|closest|matches|RegExp|getAttribute|setAttribute|removeAttribute|hasAttribute|toggleAttribute|matchMedia|getPropertyValue|setProperty|addEventListener|removeEventListener)$/;

/** setAttribute(nome, valor): o valor destes atributos é lido ou mostrado ao visitante. */
const ATRIBUTO_DE_TEXTO = /^(?:aria-[\w-]+|title|alt|placeholder|label|value|content)$/i;

/** Entidades HTML no texto JSX ("a&nbsp;validar" aparece como "a validar"). */
const ENTIDADES = { nbsp: "\u00a0", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Escapes de uma letra em strings e templates ("\n", "\t"…); os demais ("\"", "\[") valem o próprio caractere. */
const ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0" };

const CATEGORIAS = {
  placeholders: { letra: "a", titulo: "Placeholders entre colchetes", bloqueia: true, nota: "bloqueia: troque pelo valor real, lista em PENDENCIAS.md" },
  ficticio: { letra: "b", titulo: "“Fictício” em texto visível", bloqueia: false, nota: "informativo: exemplo fictício segue rotulado até virar caso real" },
  notas: { letra: "c", titulo: "Notas internas visíveis", bloqueia: true, nota: "bloqueia: texto para a equipe, não para o visitante" },
  // placeholder que só aparece quando o valor falta (`?? "[129]"`, `valor === null ? [X] : …`)
  reservas: { letra: "", titulo: "Reservas de placeholder no código", bloqueia: false, nota: "não bloqueiam: só aparecem quando o valor falta" },
};

const AJUDA = `Uso: npm run -s check:publicacao -- [--json] [--url <endereço>]...

  --json            saída em JSON (use npm run -s para o npm não imprimir o cabeçalho)
  --url <endereço>  baixa o HTML renderizado e conta os elementos [data-placeholder]
                    (pode repetir: --url http://localhost:3000 --url http://localhost:3000/assinante)

Código de saída: 1 se houver placeholder ou nota interna; 0 caso contrário; 2 em erro de uso ou de rede.`;

// ---------------------------------------------------------------- argumentos

function erroDeUso(msg) {
  console.error(`checar-publicacao: ${msg}\n\n${AJUDA}`);
  process.exit(2);
}

const opcoes = { json: false, urls: [] };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--json") opcoes.json = true;
  else if (a === "--url" || a.startsWith("--url=")) {
    const valor = a === "--url" ? args[++i] : a.slice("--url=".length);
    if (!valor) erroDeUso("--url precisa de um endereço");
    let url;
    try {
      url = new URL(valor);
    } catch {
      erroDeUso(`endereço inválido: ${valor}`);
    }
    if (!/^https?:$/.test(url.protocol)) erroDeUso(`use http:// ou https:// em --url (${valor})`);
    opcoes.urls.push(url.href);
  } else if (a === "--ajuda" || a === "--help" || a === "-h") {
    console.log(AJUDA);
    process.exit(0);
  } else erroDeUso(`opção desconhecida: ${a}`);
}

let ts;
try {
  ts = (await import("typescript")).default;
} catch {
  console.error("checar-publicacao: o TypeScript do projeto não foi encontrado. Rode npm install (ou npm ci) antes.");
  process.exit(2);
}

// ---------------------------------------------------------------- arquivos

function listarArquivos() {
  const arquivos = [];
  for (const pasta of PASTAS) {
    let nomes;
    try {
      nomes = readdirSync(join(RAIZ, pasta), { recursive: true });
    } catch {
      continue; // pasta ausente: nada a varrer
    }
    for (const nome of nomes) {
      const caminho = `${pasta}/${String(nome).split("\\").join("/")}`;
      if (/\.tsx?$/.test(caminho) && !caminho.endsWith(".d.ts")) arquivos.push(caminho);
    }
  }
  return arquivos.sort();
}

// ---------------------------------------------------------------- texto como a página mostra

/**
 * Interpreta o texto cru de um literal: escapes em strings e templates ("\n", "\x41", "\" no fim da
 * linha), entidades no JSX ("&nbsp;", "&#91;"). Devolve o texto e, para cada caractere, a posição no texto cru.
 */
function interpretar(cru, tipo) {
  let texto = "";
  const pos = [];
  const emitir = (s, k) => {
    for (let u = 0; u < s.length; u++) pos.push(k);
    texto += s;
  };
  for (let k = 0; k < cru.length; ) {
    const c = cru[k];
    if (tipo === "jsx" && c === "&") {
      const m = /^&(?:#(\d{1,7})|#x([\da-f]{1,6})|([a-z]+));/i.exec(cru.slice(k, k + 12));
      const codigo = m && (m[1] ? Number(m[1]) : m[2] ? parseInt(m[2], 16) : -1);
      const ch = !m ? undefined : codigo >= 0 ? (codigo <= 0x10ffff ? String.fromCodePoint(codigo) : undefined) : ENTIDADES[m[3]];
      if (ch !== undefined) {
        emitir(ch, k);
        k += m[0].length;
        continue;
      }
    } else if (tipo !== "jsx" && c === "\\") {
      const m = /^\\(?:x([\da-f]{2})|u([\da-f]{4})|u\{([\da-f]{1,6})\}|(\r\n?|[\n\u2028\u2029])|([\s\S]))/i.exec(cru.slice(k, k + 12));
      const hex = m[1] ?? m[2] ?? m[3];
      emitir(hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : m[4] ? "" : (ESCAPES[m[5]] ?? m[5]), k);
      k += m[0].length;
      continue;
    } else if (tipo === "template" && c === "\r") {
      emitir("\n", k); // o template guarda \r\n como \n
      k += cru[k + 1] === "\n" ? 2 : 1;
      continue;
    }
    emitir(c, k);
    k++;
  }
  return { texto, pos };
}

/** Cada sequência de espaços, tabs e quebras vira um espaço, como no HTML; `mapa` leva cada índice de volta ao texto. */
function normalizar(texto) {
  let plano = "";
  const mapa = [];
  for (let i = 0; i < texto.length; i++) {
    const espaco = /\s/.test(texto[i]);
    if (espaco && plano.endsWith(" ")) continue;
    plano += espaco ? " " : texto[i];
    mapa.push(i);
  }
  mapa.push(texto.length);
  return { plano, mapa };
}

// ---------------------------------------------------------------- colchetes

/** Grupos "[...]" de nível mais externo (colchetes aninhados ficam no mesmo grupo). */
function gruposDeColchete(texto) {
  const grupos = [];
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] !== "[") continue;
    let prof = 0;
    let j = i;
    for (; j < texto.length; j++) {
      // o texto já vem normalizado: um placeholder quebrado em duas linhas ("[Razão\n social]") chega inteiro
      if (texto[j] === "[") prof++;
      else if (texto[j] === "]" && --prof === 0) break;
    }
    if (prof !== 0 || j >= texto.length) continue; // sem fechamento: não é placeholder
    grupos.push({ inicio: i, fim: j + 1, conteudo: texto.slice(i + 1, j) });
    i = j;
  }
  return grupos;
}

/** A "palavra" (sem espaço) em volta do grupo: o que vem antes e depois dele. */
function vizinhanca(texto, { inicio, fim }) {
  const ini = texto.lastIndexOf(" ", inicio) + 1;
  const f = texto.indexOf(" ", fim);
  return { antes: texto.slice(ini, inicio), depois: texto.slice(fim, f === -1 ? texto.length : f) };
}

/**
 * Valor arbitrário do Tailwind: text-[13px], md:grid-cols-[1fr_auto], bg-latao/[0.08], [&_p]:mt-2,
 * [grid-area:1/1]. Exige a forma de uma classe: "instagram.com/[perfil]" ou "Lote-[N]" são texto.
 */
function eTailwind(texto, grupo) {
  const { conteudo } = grupo;
  // o Tailwind usa "_" no lugar de espaço; acento é texto, salvo entre aspas (content-['→'])
  if (/[^\x21-\x7e]/.test(conteudo) && !/^(['"]).*\1$/.test(conteudo)) return false;
  const { antes, depois } = vizinhanca(texto, grupo);
  const variantes = /^(?:(?:[a-z0-9-]+|\[[^\]]+\])(?:\/[\w-]+)?:)*!?$/; // "md:", "[&_p]:", "group-hover/x:"
  if (/^[&@]/.test(conteudo)) return variantes.test(antes) && depois.startsWith(":"); // variante arbitrária
  if (/^-{0,2}[a-z][a-z0-9-]*:./.test(conteudo)) return variantes.test(antes); // propriedade arbitrária
  const utilitario = /^(?:(?:[a-z0-9-]+|\[[^\]]+\])(?:\/[\w-]+)?:)*!?-?[a-z][a-z0-9-]*([-/])$/.exec(antes);
  if (!utilitario) return false;
  // "/[...]" é modificador de opacidade ou de altura de linha: só número ou var()
  return utilitario[1] === "-" || /^(?:[\d.]+[a-z%]*|var\(.+\))$/.test(conteudo);
}

/** Atributo de seletor CSS: "[data-h=lens]", "a[href], [tabindex]:not([tabindex='-1'])". Texto com "[name]" não. */
function eSeletor(texto, grupo, grupos) {
  if (!ATRIBUTO.test(grupo.conteudo)) return false;
  let resto = "";
  let k = 0;
  for (const g of grupos) {
    resto += texto.slice(k, g.inicio);
    k = g.fim;
  }
  return RESTO_DE_SELETOR.test(resto + texto.slice(k));
}

/** `codigo`: o texto pode ser código (classe, seletor). Em src/content e no texto JSX, todo colchete vai para a página. */
function ePlaceholder(texto, grupo, grupos, codigo) {
  const { conteudo } = grupo;
  if (!conteudo.trim()) return false; // "[]", "[ ]"
  if (!codigo) return true;
  if (conteudo.includes("[")) return false; // aninhado: seletor ou variante do Tailwind
  return !eSeletor(texto, grupo, grupos) && !eTailwind(texto, grupo);
}

// ---------------------------------------------------------------- leitura de um arquivo

const espacos = (s) => s.replace(/\s+/g, " ");

/** Marca de expressão de template no recorte: `Total: [X] de ${…} leilões`. */
const EXPRESSAO = "${…}";

/** Recorte do texto em volta do achado, numa linha só (até ~96 caracteres). */
function recorte(texto, indice, tamanho) {
  const LIMITE = 96;
  const plano = espacos(texto).trim();
  if (plano.length <= LIMITE) return plano;
  const pos = espacos(texto.slice(0, indice)).trimStart().length; // índice do achado no texto sem quebras
  const ini = Math.max(0, Math.min(Math.max(pos - 36, pos + tamanho - LIMITE), plano.length - LIMITE));
  const fim = Math.min(plano.length, ini + LIMITE);
  return `${ini > 0 ? "…" : ""}${plano.slice(ini, fim).trim()}${fim < plano.length ? "…" : ""}`;
}

function nomeDaChamada(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return "";
}

function eNulo(expr) {
  while (expr && (ts.isAsExpression(expr) || ts.isParenthesizedExpression(expr) || ts.isSatisfiesExpression(expr))) {
    expr = expr.expression;
  }
  return expr?.kind === ts.SyntaxKind.NullKeyword;
}

function varrerArquivo(arquivo) {
  const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
  const kind = arquivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true, kind);
  const eConteudo = arquivo.startsWith("src/content/");
  const achados = [];

  const posicao = (abs) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(abs);
    return { linha: line + 1, coluna: character + 1 };
  };

  function adicionar(categoria, abs, achado, trecho) {
    achados.push({ categoria, arquivo, ...posicao(abs), achado, trecho });
  }

  /** Nome do atributo JSX em que a string está (`title="…"`, `className={cond ? "…" : "…"}`), ou "". */
  function atributoJsx(no) {
    for (let n = no.parent; n && !ts.isSourceFile(n); n = n.parent) {
      if (ts.isJsxAttribute(n)) return n.name.getText(sf);
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || ts.isFunctionLike(n)) break;
    }
    return "";
  }

  /** String que é código, não texto da página: import, tipo, chave, seletor, className… */
  function foraDoTexto(no) {
    const pai = no.parent;
    if (
      ts.isImportDeclaration(pai) ||
      ts.isExportDeclaration(pai) ||
      ts.isExternalModuleReference(pai) ||
      ts.isLiteralTypeNode(pai) ||
      ts.isExpressionStatement(pai) // diretivas como "use client"
    ) {
      return true;
    }
    if ("name" in pai && pai.name === no) return true; // chave de objeto, membro de enum
    if (ts.isElementAccessExpression(pai) && pai.argumentExpression === no) return true;
    if ((ts.isCallExpression(pai) || ts.isNewExpression(pai)) && pai.arguments?.includes(no)) {
      const chamada = nomeDaChamada(pai.expression);
      // setAttribute("aria-label", "Preço [49]"): o nome é código; o valor de aria-*, title, alt… é texto
      if (chamada === "setAttribute" && pai.arguments[1] === no) {
        const nome = pai.arguments[0];
        return ts.isStringLiteralLike(nome) && !ATRIBUTO_DE_TEXTO.test(nome.text);
      }
      if (SO_CODIGO.test(chamada)) return true;
    }
    return atributoJsx(no) === "className";
  }

  /** Classe ou seletor podem aparecer aqui? Não em src/content (tudo passa pelo RichText) nem em title, alt… */
  function podeSerCodigo(no) {
    if (eConteudo) return false;
    const atributo = atributoJsx(no);
    return !atributo || /class/i.test(atributo); // fora de atributo JSX, ou em accentClass, iconClassName…
  }

  /** Em `x === null` (ou == null / undefined), true; em `x !== null`, false; senão, null. */
  function testaNulo(cond) {
    if (!ts.isBinaryExpression(cond)) return null;
    const nulo = (e) => e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === "undefined");
    if (!nulo(cond.left) && !nulo(cond.right)) return null;
    const op = cond.operatorToken.kind;
    if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken) return true;
    if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) return false;
    return null;
  }

  /** Placeholder de reserva: só aparece quando o valor falta (`?? "[129]"`, `valor === null ? [X] : …`). */
  function eReserva(no) {
    let filho = no;
    for (let n = no.parent; n && !ts.isSourceFile(n) && !ts.isFunctionLike(n) && !ts.isBlock(n); filho = n, n = n.parent) {
      if (ts.isBinaryExpression(n) && n.right === filho) {
        const op = n.operatorToken.kind;
        if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return true;
        if (op === ts.SyntaxKind.AmpersandAmpersandToken && testaNulo(n.left) === true) return true;
      }
      if (ts.isConditionalExpression(n) && filho !== n.condition) {
        const nulo = testaNulo(n.condition);
        if (nulo !== null && (filho === n.whenTrue) === nulo) return true;
      }
    }
    return false;
  }

  /**
   * Lê uma parte de um texto: o texto cru, a posição onde ele começa no arquivo, o tipo ("string",
   * "template" ou "jsx") e, fora do JSX, o texto que o TypeScript já interpretou (`esperado`), para conferir.
   */
  function ler({ cru, base, tipo, esperado }) {
    let { texto, pos } = interpretar(cru, tipo);
    if (esperado !== undefined && texto !== esperado) {
      // escape que a leitura não cobre (octal antigo…): fica o texto do TypeScript, com coluna aproximada
      texto = esperado;
      pos = Array.from({ length: texto.length }, (_, i) => Math.min(i, cru.length));
    }
    return { texto, pos, base };
  }

  /**
   * Analisa as partes de um texto (uma só, ou os pedaços de um template entre as expressões), já
   * normalizado como a página mostra. `contexto` é o texto em volta, usado só no recorte; `codigo` diz
   * se o texto pode ser classe ou seletor.
   */
  function analisar(no, partes, { contexto, codigo }) {
    const lidas = partes.map(ler);
    const inteiro = contexto?.inteiro ?? lidas.map((p) => p.texto).join(EXPRESSAO);
    const reserva = eReserva(no);
    let deslocamento = contexto?.inicio ?? 0;
    for (const { texto, pos, base } of lidas) {
      const { plano, mapa } = normalizar(texto);
      const registrar = (categoria, inicio, fim) => {
        const achado = plano.slice(inicio, fim);
        const i = mapa[inicio]; // índice no texto interpretado
        adicionar(categoria, base + pos[i], achado, recorte(inteiro, deslocamento + i, achado.length));
      };

      const grupos = gruposDeColchete(plano);
      for (const grupo of grupos) {
        if (ePlaceholder(plano, grupo, grupos, codigo)) registrar(reserva ? "reservas" : "placeholders", grupo.inicio, grupo.fim);
      }
      for (const m of plano.matchAll(FICTICIO)) registrar("ficticio", m.index, m.index + m[0].length);
      for (const re of NOTAS) for (const m of plano.matchAll(re)) registrar("notas", m.index, m.index + m[0].length);
      deslocamento += texto.length + EXPRESSAO.length;
    }
  }

  /** Texto JSX com os irmãos, para o recorte: "Exemplo fictício: {…} em {…}, com {…}% de deságio…". */
  function contextoJsx(no) {
    const pai = no.parent;
    const irmaos = ts.isJsxElement(pai) || ts.isJsxFragment(pai) ? pai.children : [no];
    let inteiro = "";
    let inicio = 0;
    for (const filho of irmaos) {
      if (filho === no) inicio = inteiro.length;
      inteiro += ts.isJsxText(filho) ? interpretar(filho.text, "jsx").texto : ts.isJsxExpression(filho) ? "{…}" : "<…>";
    }
    return { inteiro, inicio };
  }

  function parteDoTemplate(literal) {
    // TemplateHead "`…${", TemplateMiddle "}…${", TemplateTail "}…`"
    const ini = literal.getStart(sf) + 1;
    const fim = ts.isTemplateTail(literal) ? literal.end - 1 : literal.end - 2;
    return { cru: fonte.slice(ini, fim), base: ini, tipo: "template", esperado: literal.text };
  }

  function visitar(no) {
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) {
      const ini = no.getStart(sf) + 1;
      const cru = fonte.slice(ini, no.end - 1);
      // no atributo JSX (title="…") não há escape com "\", mas há entidade (&nbsp;)
      const parte = ts.isJsxAttribute(no.parent)
        ? { cru, base: ini, tipo: "jsx" }
        : { cru, base: ini, tipo: ts.isStringLiteral(no) ? "string" : "template", esperado: no.text };
      if (!foraDoTexto(no)) analisar(no, [parte], { codigo: podeSerCodigo(no) });
      return;
    }
    if (ts.isTemplateExpression(no)) {
      const partes = [no.head, ...no.templateSpans.map((s) => s.literal)].map(parteDoTemplate);
      if (!foraDoTexto(no)) analisar(no, partes, { codigo: podeSerCodigo(no) });
      for (const span of no.templateSpans) visitar(span.expression);
      return;
    }
    if (ts.isJsxText(no)) {
      if (!no.containsOnlyTriviaWhiteSpaces) {
        const parte = { cru: fonte.slice(no.pos, no.end), base: no.pos, tipo: "jsx" };
        analisar(no, [parte], { contexto: contextoJsx(no), codigo: false });
      }
      return;
    }
    // No conteúdo, null marca dado que ainda não existe (ex.: STATS.items[].value): a página mostra [X].
    if (eConteudo && ts.isPropertyAssignment(no) && eNulo(no.initializer)) {
      const objeto = ts.isObjectLiteralExpression(no.parent) ? espacos(no.parent.getText(sf)) : espacos(no.getText(sf));
      adicionar("placeholders", no.initializer.getStart(sf), "null → [X]", objeto.length <= 96 ? objeto : espacos(no.getText(sf)));
    }
    ts.forEachChild(no, visitar);
  }

  visitar(sf);
  return achados.sort((a, b) => a.linha - b.linha || a.coluna - b.coluna);
}

// ---------------------------------------------------------------- HTML renderizado

async function contarNoHtml(url) {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "checar-publicacao" } });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const html = (await resposta.text())
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "") // payload do RSC também cita data-placeholder
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const porTexto = new Map();
  let total = 0;
  for (const m of html.matchAll(/<[a-z][\w-]*\b(?=[^>]*\sdata-placeholder(?=[\s=/>]))[^>]*>([^<]*)/gi)) {
    total++;
    const texto = espacos(m[1]).trim() || "(vazio)";
    porTexto.set(texto, (porTexto.get(texto) ?? 0) + 1);
  }
  return { url, total, porTexto: [...porTexto].map(([texto, n]) => ({ texto, total: n })) };
}

// ---------------------------------------------------------------- relatório

const arquivos = listarArquivos();
const achados = arquivos.flatMap(varrerArquivo);
const grupos = Object.fromEntries(Object.keys(CATEGORIAS).map((c) => [c, achados.filter((a) => a.categoria === c)]));

const html = [];
let erroDeRede = false;
for (const url of opcoes.urls) {
  try {
    html.push(await contarNoHtml(url));
  } catch (e) {
    erroDeRede = true;
    const causa = e?.cause?.code ?? e?.cause?.message; // ex.: ECONNREFUSED quando o servidor não está no ar
    html.push({ url, erro: `${e instanceof Error ? e.message : String(e)}${causa ? ` (${causa})` : ""}` });
  }
}

const bloqueios = Object.entries(CATEGORIAS)
  .filter(([c, def]) => def.bloqueia && grupos[c].length > 0)
  .map(([c]) => ({ letra: CATEGORIAS[c].letra, total: grupos[c].length }));
const bloqueia = bloqueios.length > 0;

if (opcoes.json) {
  const categorias = Object.fromEntries(
    Object.entries(CATEGORIAS).map(([c, def]) => [
      c,
      {
        letra: def.letra || null,
        titulo: def.titulo,
        bloqueia: def.bloqueia,
        total: grupos[c].length,
        itens: grupos[c].map(({ arquivo, linha, coluna, achado, trecho }) => ({ arquivo, linha, coluna, achado, trecho })),
      },
    ]),
  );
  const saida = { arquivos: arquivos.length, pastas: PASTAS, bloqueia, categorias };
  if (html.length) saida.html = html;
  console.log(JSON.stringify(saida, null, 2));
} else {
  const plural = (n, palavra) => `${n} ${palavra}${n === 1 ? "" : "s"}`;
  const linhas = [`Checagem de publicação · ${plural(arquivos.length, "arquivo")} em ${PASTAS.join(", ")}`];
  for (const [c, def] of Object.entries(CATEGORIAS)) {
    const itens = grupos[c];
    if (c === "reservas" && itens.length === 0) continue;
    linhas.push("", `${def.letra ? `${def.letra}) ` : ""}${def.titulo}: ${itens.length}${itens.length ? ` (${def.nota})` : ""}`);
    const locais = itens.map((i) => `${i.arquivo}:${i.linha}:${i.coluna}`);
    const larguraLocal = Math.max(0, ...locais.map((l) => l.length));
    const larguraAchado = Math.min(20, Math.max(0, ...itens.map((i) => i.achado.length)));
    itens.forEach((i, k) => {
      linhas.push(`   ${locais[k].padEnd(larguraLocal)}  ${i.achado.padEnd(larguraAchado)}  "${i.trecho}"`);
    });
  }
  if (html.length) {
    linhas.push("", "d) HTML renderizado: elementos [data-placeholder]");
    for (const h of html) {
      if (h.erro) linhas.push(`   ${h.url}  erro: ${h.erro}`);
      else {
        const lista = h.porTexto.map((t) => `${t.texto} ×${t.total}`).join(", ");
        linhas.push(`   ${h.url}  ${h.total}${lista ? `: ${lista}` : ""}`);
      }
    }
  }
  const noHtml = html.reduce((s, h) => s + (h.total ?? 0), 0);
  const bloqueados = bloqueios.reduce((s, b) => s + b.total, 0);
  linhas.push(
    "",
    bloqueia
      ? `Resultado: NÃO PUBLICAR · ${bloqueados} ${bloqueados === 1 ? "item bloqueia" : "itens bloqueiam"} (${bloqueios.map((b) => `${b.letra}: ${b.total}`).join(", ")}).`
      : `Resultado: nenhum placeholder nem nota interna no código.${noHtml ? ` O HTML baixado ainda tem ${noHtml} [data-placeholder]: o servidor está com um build antigo?` : ""}`,
  );
  console.log(linhas.join("\n"));
}

if (erroDeRede) {
  console.error("checar-publicacao: não foi possível baixar todos os endereços de --url.");
  process.exitCode = 2;
} else process.exitCode = bloqueia ? 1 : 0;
