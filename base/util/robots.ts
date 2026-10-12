/**
 * Interpretação de robots.txt conforme a RFC 9309: grupos por user-agent, Allow/Disallow com
 * curingas `*` e `$`, regra mais longa vence e empate favorece Allow. Também lê Crawl-delay
 * (fora da RFC, mas usado por muitos sites) para alongar o intervalo entre requisições.
 */

export interface RegraRobots {
  permitir: boolean;
  padrao: string;
}

export interface GrupoRobots {
  agentes: string[];
  regras: RegraRobots[];
  /** Segundos. */
  crawlDelay: number | null;
}

export interface RobotsTxt {
  grupos: GrupoRobots[];
  sitemaps: string[];
}

/** Interpreta o texto de um robots.txt. Linhas inválidas são ignoradas. */
export function analisarRobots(texto: string): RobotsTxt {
  const grupos: GrupoRobots[] = [];
  const sitemaps: string[] = [];
  let atual: GrupoRobots | null = null;
  let ultimaFoiAgente = false;
  for (const linhaBruta of texto.split(/\r\n|\r|\n/)) {
    const linha = linhaBruta.replace(/#.*$/, "").trim();
    const separador = linha.indexOf(":");
    if (separador <= 0) continue;
    const campo = linha.slice(0, separador).trim().toLowerCase();
    const valor = linha.slice(separador + 1).trim();
    if (campo === "user-agent") {
      if (!atual || !ultimaFoiAgente) {
        atual = { agentes: [], regras: [], crawlDelay: null };
        grupos.push(atual);
      }
      atual.agentes.push(valor.toLowerCase());
      ultimaFoiAgente = true;
      continue;
    }
    ultimaFoiAgente = false;
    if (campo === "sitemap") {
      if (valor) sitemaps.push(valor);
      continue;
    }
    if (!atual) continue;
    if (campo === "allow" || campo === "disallow") {
      if (valor === "") continue;
      atual.regras.push({ permitir: campo === "allow", padrao: valor });
    } else if (campo === "crawl-delay") {
      const segundos = Number(valor.replace(",", "."));
      if (Number.isFinite(segundos) && segundos >= 0) atual.crawlDelay = segundos;
    }
  }
  return { grupos, sitemaps };
}

/**
 * Regras que valem para o robô: as de todos os grupos que citam o token do produto
 * (sem diferenciar maiúsculas); se nenhum citar, as do grupo "*"; se não houver, nenhuma.
 */
export function grupoPara(robots: RobotsTxt, token: string): GrupoRobots {
  const alvo = token.toLowerCase();
  const nomeados = robots.grupos.filter((g) => g.agentes.some((a) => a.split("/")[0]?.trim() === alvo));
  const escolhidos = nomeados.length > 0 ? nomeados : robots.grupos.filter((g) => g.agentes.includes("*"));
  const atrasos = escolhidos.map((g) => g.crawlDelay).filter((d): d is number => d !== null);
  return {
    agentes: escolhidos.flatMap((g) => g.agentes),
    regras: escolhidos.flatMap((g) => g.regras),
    crawlDelay: atrasos.length > 0 ? Math.max(...atrasos) : null,
  };
}

function normalizarCaminho(caminho: string): string {
  // Compara sempre na forma com %XX em maiúsculas e sem codificar o que não precisa.
  try {
    return encodeURI(decodeURI(caminho)).replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
  } catch {
    return caminho;
  }
}

function casaPadrao(padrao: string, caminho: string): boolean {
  const ancorado = padrao.endsWith("$");
  const corpo = normalizarCaminho(ancorado ? padrao.slice(0, -1) : padrao);
  const regex = new RegExp(
    "^" + corpo.split("*").map((parte) => parte.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (ancorado ? "$" : ""),
  );
  return regex.test(caminho);
}

/**
 * `true` se o caminho (com query, ex.: "/busca?q=1") pode ser acessado. A regra de padrão mais
 * longo vence; empate vai para Allow; "/robots.txt" é sempre permitido.
 */
export function robotsPermite(grupo: GrupoRobots, caminhoComQuery: string): boolean {
  const caminho = normalizarCaminho(caminhoComQuery || "/");
  if (caminho === "/robots.txt") return true;
  let melhor: RegraRobots | null = null;
  for (const regra of grupo.regras) {
    if (!casaPadrao(regra.padrao, caminho)) continue;
    if (
      melhor === null ||
      regra.padrao.length > melhor.padrao.length ||
      (regra.padrao.length === melhor.padrao.length && regra.permitir && !melhor.permitir)
    ) {
      melhor = regra;
    }
  }
  return melhor === null || melhor.permitir;
}
