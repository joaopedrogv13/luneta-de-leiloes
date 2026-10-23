/**
 * "Voltar à apresentação" (rodada 5, ponto 10): quem sai da landing para a demonstração por um link ("Ver este exemplo
 * na demonstração", "Abrir a demonstração completa", a nota de localização…) volta exatamente ao ponto de onde saiu.
 *
 * - Na landing (SaidaDaApresentacao), o clique num link para a demonstração guarda aqui (sessionStorage, só desta aba)
 *   a rolagem, o link clicado e a posição dele na tela, a seção de origem e o destino.
 * - Na demonstração (VoltarApresentacao), o botão fixo só aparece com esse registro (quem entrou direto não o tem: a
 *   sessionStorage é da aba) e, ao voltar, marca `voltando`. Se a entrada do histórico ainda é a primeira depois da
 *   landing, usa history.back(); senão, navega para "/" sem rolar.
 * - De volta à landing, o registro com `voltando` devolve o link clicado ao mesmo lugar da tela (ou a mesma rolagem, se
 *   o link era do menu fixo) e é apagado.
 *
 * Sem imports com "@/": o teste roda em Node.
 */

export const CHAVE_APRESENTACAO = "luneta-apresentacao";
/** Depois disso o registro não vale mais (a pessoa saiu da apresentação faz tempo). */
export const VALIDADE_MS = 12 * 60 * 60 * 1000;
/** Marca, em history.state, a primeira entrada da demonstração depois da landing (para usar history.back()). */
export const MARCA_HISTORICO = "__lunetaApresentacao";

/** Os destinos que contam como "sair da apresentação": a demonstração e a página do método da nota. */
export const PREFIXOS_DESTINO = ["/assinante", "/metodologia"] as const;
/** Seletor dos links da landing para esses destinos (a ordem no documento identifica o link clicado). */
export const SELETOR_LINKS = PREFIXOS_DESTINO.map((p) => `a[href^="${p}"]`).join(",");

export interface SaidaApresentacao {
  v: 1;
  /** quando saiu (Date.now()) */
  em: number;
  /** a rolagem da landing ao sair */
  y: number;
  /** a posição do link clicado entre os links de SELETOR_LINKS (ordem do documento) */
  link: number;
  /** o href do link clicado (confere que é o mesmo link na volta) */
  destino: string;
  /** o topo do link na tela ao sair (px), para devolvê-lo ao mesmo lugar */
  linkTopo: number;
  /** o link estava num bloco fixo (menu): na volta vale a rolagem, não a posição do link */
  fixo: boolean;
  /** a seção de origem (id), para conferência e para o caso de o link sumir */
  secao: string | null;
  /** identifica esta saída (marca a primeira entrada do histórico da demonstração) */
  token: string;
  /** o botão "Voltar à apresentação" foi usado: a landing restaura a posição ao montar */
  voltando?: boolean;
}

/** O destino é uma página da demonstração (ou do método)? Aceita caminho com busca e âncora. */
export function ehDestinoDaApresentacao(href: string): boolean {
  const caminho = href.split(/[?#]/)[0] ?? "";
  return PREFIXOS_DESTINO.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

/** Lê o registro (null se não houver, se estiver quebrado ou vencido). */
export function lerSaida(agora = Date.now(), armazenamento: Pick<Storage, "getItem"> | null = sessao()): SaidaApresentacao | null {
  if (!armazenamento) return null;
  try {
    const bruto = armazenamento.getItem(CHAVE_APRESENTACAO);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Partial<SaidaApresentacao>;
    if (s.v !== 1 || typeof s.em !== "number" || typeof s.y !== "number" || typeof s.destino !== "string" || typeof s.token !== "string") return null;
    if (agora - s.em > VALIDADE_MS || s.em > agora + 60_000) return null;
    return {
      v: 1,
      em: s.em,
      y: Math.max(0, s.y),
      link: typeof s.link === "number" ? s.link : -1,
      destino: s.destino,
      linkTopo: typeof s.linkTopo === "number" ? s.linkTopo : 0,
      fixo: s.fixo === true,
      secao: typeof s.secao === "string" ? s.secao : null,
      token: s.token,
      voltando: s.voltando === true,
    };
  } catch {
    return null;
  }
}

export function gravarSaida(s: SaidaApresentacao, armazenamento: Pick<Storage, "setItem"> | null = sessao()) {
  try {
    armazenamento?.setItem(CHAVE_APRESENTACAO, JSON.stringify(s));
  } catch {
    // sem armazenamento (aba privada, bloqueio): o botão não aparece na demonstração
  }
}

export function apagarSaida(armazenamento: Pick<Storage, "removeItem"> | null = sessao()) {
  try {
    armazenamento?.removeItem(CHAVE_APRESENTACAO);
  } catch {
    // nada a fazer
  }
}

/**
 * Onde rolar a landing na volta: com o link encontrado (mesmo href, fora do menu fixo), o topo dele volta ao mesmo
 * lugar da tela (`topoNoDocumento` é o topo do link medido agora, já com a rolagem); senão, a rolagem guardada. Nunca
 * negativo nem além do fim da página.
 */
export function alvoDaVolta(s: Pick<SaidaApresentacao, "y" | "linkTopo" | "fixo">, topoNoDocumento: number | null, maximo: number): number {
  const y = !s.fixo && topoNoDocumento !== null ? topoNoDocumento - s.linkTopo : s.y;
  return Math.round(Math.min(Math.max(0, y), Math.max(0, maximo)));
}

function sessao(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
