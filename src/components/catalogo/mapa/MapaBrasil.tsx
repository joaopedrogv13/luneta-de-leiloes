"use client";

import { autoUpdate, flip, offset, shift, size, useFloating } from "@floating-ui/react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { PontoMapa } from "@/lib/catalogo/tipos";
import { moedaCurta, numero, plural } from "@/lib/catalogo/rotulos";
import { MAPA_ALTURA, MAPA_LARGURA, UFS_MAPA, projetar } from "@/lib/mapa/brasil-ufs";
import {
  agrupar,
  escolherRotulos,
  fatorRaio,
  fonteContagem,
  fonteNumero,
  nomeDoNo,
  textoContagem,
  zoomParaSeparar,
  type NoMapa,
  type PontoProjetado,
} from "./agrupar";
import { CartaoMapa } from "./CartaoMapa";
import {
  CAIXA_BRASIL,
  ZOOM_MAX,
  ZOOM_MIN,
  caixaDasUfs,
  caixaDosPontos,
  cameraBrasil,
  enquadrar,
  enquadrarResultados,
  escalaBase,
  translacao,
  type Camera,
  type Caixa,
  type Folga,
  type Tela,
} from "./geometria";
import { useCameraMapa, type Aviso } from "./useCameraMapa";
import s from "./mapa.module.css";

export type VarianteMapa = "painel" | "faixa" | "mini";

export interface MapaBrasilProps {
  /** cidades com resultado (o mapa mostra o conjunto filtrado inteiro, não só a página) */
  pontos: PontoMapa[];
  /** chave da cidade a acender ("MG|Uberlândia"), vinda do hover num cartão da lista; não move o mapa */
  destaque?: string | null;
  /** UFs filtradas: o mapa enquadra nelas */
  ufsFoco?: string[];
  /** passar o mouse (ou focar) numa cidade do mapa; null ao sair */
  onHover?: (chave: string | null) => void;
  /** "Ver só esta cidade" (ex.: filtrar pela cidade) */
  onSelecionarCidade?: (p: PontoMapa) => void;
  /** link de cada destaque do cartão */
  hrefImovel?: (id: string) => string;
  /**
   * "direta": a roda do mouse aproxima e um dedo arrasta o mapa. "ctrl": mapa no fluxo da página; a roda
   * rola a página e só Ctrl/⌘ + roda aproxima (no toque, dois dedos movem o mapa e um dedo rola a página).
   * Padrão: "direta" no painel; "ctrl" na faixa e na mini, que estão sempre no fluxo da página (com
   * "direta", um dedo no mapa de 320 px do celular prenderia a rolagem da página).
   */
  rolagem?: "direta" | "ctrl";
  /** "painel": coluna lateral (altura do pai); "faixa": ~320–380 px sobre os cards; "mini": página do imóvel */
  variante?: VarianteMapa;
  className?: string;
  /** nome acessível da região */
  rotulo?: string;
  /**
   * "mini": a precisão da posição, na legenda e no nome acessível ("Posição aproximada (centro da cidade)" se
   * omitida, o caso da Caixa). A página do imóvel passa a precisão de verdade (rua, CEP, bairro...).
   */
  notaPosicao?: string;
}

const UFS = Object.entries(UFS_MAPA);
/**
 * Folgas do enquadramento (px): à direita, a coluna de botões; embaixo, a legenda (duas linhas em telas
 * estreitas). Funções fixas por variante: a câmera mede de novo quando a tela muda de tamanho.
 */
const FOLGAS: Record<VarianteMapa, (w: number, h: number) => Folga> = {
  painel: (w) => ({ cima: 24, dir: 68, baixo: w < 560 ? 64 : 52, esq: 24 }),
  faixa: (w) => ({ cima: 16, dir: 62, baixo: w < 560 ? 62 : 44, esq: 16 }),
  mini: (w) => ({ cima: 18, dir: 58, baixo: w < 400 ? 52 : 40, esq: 18 }),
};
/** Margem extra ao enquadrar pontos: a maior bolha não fica cortada na borda. */
const MARGEM_PONTOS = 26;
/** Até quantas bolhas na tela cada uma é um botão no Tab; acima disso, a lista "Cidades com mais imóveis". */
const LIMITE_BOTOES = 60;
const MAIORES_ACESSIVEIS = 20;
/** Bolhas desenhadas além da borda (fração da tela): arrastar não mostra área vazia antes do fim do gesto. */
const MARGEM_DESENHO = 0.6;
/** Nomes das cidades ao lado das bolhas a partir deste zoom. */
const ZOOM_ROTULOS = 2.4;
const ATRASO_FECHAR = 220;
/** Com um cartão aberto, outra bolha só toma o lugar depois de o mouse parar nela (atravessar não troca). */
const ATRASO_TROCAR = 140;

interface Ativo {
  /** id do nó (bolha) onde o cartão se ancora */
  id: string;
  /** cidade dentro de um grupo (lista acessível): o cartão é o da cidade */
  chave?: string;
  /** aberto por clique/toque/Enter: só fecha com Esc, clique fora ou o botão Fechar */
  fixo: boolean;
}

/**
 * "1.234 imóveis"; a partir de 10 mil, o número da bolha ("14 mil imóveis (14.123)"): o nome do botão
 * contém o texto que se vê nele (WCAG 2.5.3, comando de voz).
 */
const qtdImoveis = (total: number) =>
  total >= 10_000 ? `${textoContagem(total)} imóveis (${numero(total)})` : plural(total, "imóvel", "imóveis");

const rotuloCidade = (p: Pick<PontoMapa, "cidade" | "uf" | "total" | "lanceMin" | "desagioMax">) =>
  `${p.cidade}/${p.uf}: ${qtdImoveis(p.total)}, a partir de ${moedaCurta(p.lanceMin)}` +
  (p.desagioMax !== null && p.desagioMax > 0 ? `, deságio de até ${p.desagioMax}%` : "");

function rotuloNo(n: NoMapa) {
  if (!n.grupo) return rotuloCidade({ ...n.membros[0], total: n.total, lanceMin: n.lanceMin, desagioMax: n.desagioMax });
  const nomes = n.membros.slice(0, 3).map((m) => `${m.cidade}/${m.uf}`);
  const resto = n.membros.length > 3 ? " e outras" : "";
  return `${qtdImoveis(n.total)} em ${numero(n.membros.length)} cidades próximas: ${nomes.join(", ")}${resto}. Ative para aproximar.`;
}

const seletorNo = (id: string) => `[data-no="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id}"]`;

/**
 * Botão da coluna de controles. "Desativado" usa aria-disabled em vez de disabled: um botão que vira
 * disabled com o foco (ex.: "Aproximar" chegando a 14×) perde o foco para o <body>, e quem usa teclado se perde.
 */
function BotaoControle({ rotulo, onClick, desativado, children }: { rotulo: string; onClick: () => void; desativado?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={desativado ? undefined : onClick}
      aria-disabled={desativado || undefined}
      aria-label={rotulo}
      title={rotulo}
      className="grid size-11 place-items-center text-luar transition-colors duration-150 hover:bg-nevoa/12 hover:text-latao-texto focus-visible:-outline-offset-4 aria-disabled:cursor-default aria-disabled:text-nevoa/45 aria-disabled:hover:bg-transparent pointer-fine:size-9"
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

const IconeEnquadrar = () => (
  <>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    <circle cx="12" cy="12" r="2.6" />
  </>
);

/**
 * Mapa do Brasil do catálogo: estados do IBGE, uma bolha por cidade (agrupadas quando se encostam),
 * zoom e arrasto (roda, pinça, duplo clique, teclado, botões) e cartão ao passar o mouse.
 * Enquadra sozinho quando os pontos ou as UFs filtradas mudam, a não ser que a pessoa já tenha mexido
 * no mapa: aí aparece "Enquadrar resultados".
 */
export function MapaBrasil({
  pontos,
  destaque = null,
  ufsFoco,
  onHover,
  onSelecionarCidade,
  hrefImovel,
  rolagem,
  variante = "painel",
  className = "",
  rotulo,
  notaPosicao = "Posição aproximada (centro da cidade)",
}: MapaBrasilProps) {
  const mini = variante === "mini";
  const modoRolagem = rolagem ?? (variante === "painel" ? "direta" : "ctrl");
  const viewportRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const camadaRef = useRef<HTMLDivElement>(null);
  const cartaoRef = useRef<HTMLDivElement | null>(null);
  const idBase = useId();
  const idInstrucoes = `${idBase}-instrucoes`;
  const idCartao = `${idBase}-cartao`;
  const idLista = `${idBase}-lista`;

  const [auto, setAuto] = useState(true);
  const autoRef = useRef(true);
  const [pendente, setPendente] = useState(false);
  const [ativo, setAtivo] = useState<Ativo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const fecharTimer = useRef<number | undefined>(undefined);
  const trocarTimer = useRef<number | undefined>(undefined);
  const avisoTimer = useRef<number | undefined>(undefined);
  /** quem fixou o cartão (bolha ou item da lista acessível): o foco volta para ele ao fechar */
  const abridor = useRef<HTMLElement | null>(null);
  /** foco devolvido pelo próprio mapa (Esc, Fechar): não reabre a prévia */
  const silenciarFoco = useRef(false);
  /** levar o foco para dentro do cartão quando ele abrir (Enter numa bolha) */
  const focarCartao = useRef(false);
  /** bolha com foco (para devolver o foco se ela sumir ao reagrupar) e cidade a focar depois de "Aproximar" */
  const bolhaFocada = useRef<{ el: HTMLElement; chave: string } | null>(null);
  const refocar = useRef<string | null>(null);

  // ---- câmera ----
  const aplicar = useCallback((vivo: Camera, com: Camera, t: Tela) => {
    const v = translacao(vivo, t);
    gRef.current?.setAttribute("transform", `translate(${v.tx} ${v.ty}) scale(${v.s})`);
    const camada = camadaRef.current;
    if (!camada) return;
    const c = translacao(com, t);
    const r = v.s / c.s;
    const neutro = Math.abs(r - 1) < 1e-9 && Math.abs(v.tx - c.tx) < 0.01 && Math.abs(v.ty - c.ty) < 0.01;
    camada.style.transform = neutro ? "" : `translate(${v.tx - r * c.tx}px, ${v.ty - r * c.ty}px) scale(${r})`;
    camada.style.setProperty("--contra", neutro ? "1" : String(1 / r));
  }, []);

  const avisar = useCallback((a: Aviso) => {
    const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    setAviso(a === "ctrl" ? `Use ${mac ? "⌘" : "Ctrl"} + rolagem para aproximar` : "Use dois dedos para mover o mapa");
    window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 1600);
  }, []);

  const cam = useCameraMapa(viewportRef, {
    folga: FOLGAS[variante],
    rolagem: modoRolagem,
    aplicar,
    aoInteragir: () => {
      autoRef.current = false;
      setAuto(false);
    },
    aoMover: () => {
      window.clearTimeout(fecharTimer.current);
      window.clearTimeout(trocarTimer.current);
      setAtivo(null);
    },
    aoAvisar: avisar,
  });
  const { tela, camera, irPara } = cam;

  useEffect(
    () => () => {
      window.clearTimeout(fecharTimer.current);
      window.clearTimeout(trocarTimer.current);
      window.clearTimeout(avisoTimer.current);
    },
    [],
  );

  // ---- dados ----
  // coordenada inválida não entra (uma só quebraria o enquadramento e o desenho de todas)
  const projetados = useMemo<PontoProjetado[]>(
    () =>
      pontos.flatMap((p) => {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return [];
        const [x, y] = projetar(p.lat, p.lon);
        return [{ ...p, x, y }];
      }),
    [pontos],
  );
  const porChave = useMemo(() => new Map(projetados.map((p) => [p.chave, p])), [projetados]);
  const { maiorCidade, somaTotal } = useMemo(() => {
    let maior = 1;
    let soma = 0;
    for (const p of projetados) {
      if (p.total > maior) maior = p.total;
      soma += p.total;
    }
    return { maiorCidade: maior, somaTotal: soma };
  }, [projetados]);
  const ufsComResultado = useMemo(() => new Set(projetados.map((p) => p.uf)), [projetados]);

  const chaveUfs = (ufsFoco ?? []).map((u) => u.toUpperCase()).join(",");
  const ufMini = mini ? (projetados[0]?.uf ?? "") : "";
  const focoUfs = useMemo(() => {
    const lista = chaveUfs ? chaveUfs.split(",") : ufMini ? [ufMini] : [];
    return lista.filter((u) => UFS_MAPA[u]);
  }, [chaveUfs, ufMini]);
  const focoSet = useMemo(() => new Set(focoUfs), [focoUfs]);

  // o que enquadrar: as UFs filtradas; senão, os pontos (com margem para as bolhas); senão, o Brasil
  const alvo = useMemo<{ caixa: Caixa; margem: number }>(() => {
    const ufs = focoUfs.length ? caixaDasUfs(focoUfs) : null;
    if (ufs) return { caixa: ufs, margem: 0 };
    const pts = caixaDosPontos(projetados);
    return pts ? { caixa: pts, margem: mini ? 0 : MARGEM_PONTOS } : { caixa: CAIXA_BRASIL, margem: 0 };
  }, [focoUfs, projetados, mini]);
  const chaveAlvo = `${alvo.caixa.map((v) => Math.round(v)).join(",")}+${alvo.margem}`;

  // Resultados mudaram com o mapa "na mão" da pessoa: oferece enquadrar (estado derivado no render).
  const [alvoVisto, setAlvoVisto] = useState(chaveAlvo);
  if (alvoVisto !== chaveAlvo) {
    setAlvoVisto(chaveAlvo);
    if (!auto) setPendente(true);
  }

  // Enquadramento automático: na primeira medida (sem animação), quando o alvo muda (animado) e quando
  // a tela muda de tamanho, enquanto a pessoa não mexer no mapa.
  const enquadrado = useRef<{ chave: string; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!tela) return;
    const antes = enquadrado.current;
    if (antes && !autoRef.current) return;
    const mudouAlvo = !antes || antes.chave !== chaveAlvo;
    const mudouTela = !antes || antes.w !== tela.w || antes.h !== tela.h;
    if (!mudouAlvo && !mudouTela) return;
    enquadrado.current = { chave: chaveAlvo, w: tela.w, h: tela.h };
    irPara(enquadrarResultados(alvo.caixa, tela, alvo.margem), { animar: !!antes && mudouAlvo });
  }, [tela, chaveAlvo, alvo, irPara]);

  const aoEnquadrar = () => {
    if (!tela) return;
    autoRef.current = true;
    setAuto(true);
    setPendente(false);
    enquadrado.current = { chave: chaveAlvo, w: tela.w, h: tela.h };
    irPara(enquadrarResultados(alvo.caixa, tela, alvo.margem));
  };
  const brasilInteiro = () => {
    if (tela) irPara(cameraBrasil(tela), { usuario: true });
  };

  // ---- bolhas ----
  const s0 = tela ? escalaBase(tela) : 0;
  const fator = tela ? fatorRaio(tela.w, tela.h) : 1;
  const agruparLigado = !mini && camera.z < ZOOM_MAX - 1e-6;
  const nos = useMemo(
    () => (s0 > 0 ? agrupar(projetados, { escala: s0 * camera.z, maiorCidade, somaTotal, agrupar: agruparLigado, fator }) : []),
    [projetados, s0, camera.z, maiorCidade, somaTotal, agruparLigado, fator],
  );
  const noDaChave = useMemo(() => {
    const m = new Map<string, NoMapa>();
    for (const n of nos) for (const p of n.membros) m.set(p.chave, n);
    return m;
  }, [nos]);
  const noPorId = useMemo(() => new Map(nos.map((n) => [n.id, n])), [nos]);

  const desenho = useMemo(() => {
    if (!tela) return null;
    const { s: k, tx, ty } = translacao(camera, tela);
    const mx = tela.w * MARGEM_DESENHO;
    const my = tela.h * MARGEM_DESENHO;
    const itens: { n: NoMapa; sx: number; sy: number; naTela: boolean }[] = [];
    let visiveis = 0;
    for (const n of nos) {
      const sx = n.x * k + tx;
      const sy = n.y * k + ty;
      if (sx < -mx || sx > tela.w + mx || sy < -my || sy > tela.h + my) continue;
      const naTela = sx >= 0 && sx <= tela.w && sy >= 0 && sy <= tela.h;
      if (naTela) visiveis++;
      itens.push({ n, sx, sy, naTela });
    }
    // as maiores primeiro: ficam por baixo no desenho e vêm antes no Tab
    itens.sort((a, b) => b.n.r - a.n.r || b.n.total - a.n.total);

    const siglas: { uf: string; x: number; y: number }[] = [];
    for (const [uf, u] of UFS) {
      const [x0, y0, x1, y1] = u.caixa;
      if ((x1 - x0) * k < 34 || (y1 - y0) * k < 20) continue;
      const x = u.rotulo[0] * k + tx;
      const y = u.rotulo[1] * k + ty;
      if (x < -20 || y < -20 || x > tela.w + 20 || y > tela.h + 20) continue;
      siglas.push({ uf, x, y });
    }

    const rotulos =
      mini || camera.z >= ZOOM_ROTULOS
        ? escolherRotulos(
            itens.map(({ n, sx, sy }) => ({ id: n.id, sx, sy, r: mini ? 9 : n.r, total: n.total, texto: nomeDoNo(n) })),
            tela.w,
            tela.h,
            mini
              ? { maximo: 1, limiteDir: tela.w - tela.folga.dir }
              : { maximo: 14, considerar: 24, totalMinimo: Math.max(2, maiorCidade * 0.02), limiteDir: tela.w - tela.folga.dir },
          )
        : [];
    return { itens, visiveis, siglas, rotulos, k, tx, ty };
  }, [nos, camera, tela, mini, maiorCidade]);

  const muitos = !mini && !!desenho && desenho.visiveis > LIMITE_BOTOES;
  const maiores = useMemo(() => {
    if (!muitos || !desenho || !tela) return [];
    const { k, tx, ty } = desenho;
    return projetados
      .filter((p) => {
        const x = p.x * k + tx;
        const y = p.y * k + ty;
        return x >= 0 && x <= tela.w && y >= 0 && y <= tela.h;
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, MAIORES_ACESSIVEIS);
  }, [muitos, desenho, tela, projetados]);

  const idDestaque = destaque ? noDaChave.get(destaque)?.id : undefined;

  // ---- cartão ----
  const noAtivo = !mini && ativo ? noPorId.get(ativo.id) : undefined;
  // a bolha do cartão sumiu (dados novos, outro agrupamento): o cartão fecha de vez, não volta sozinho depois
  if (ativo && tela && !noAtivo) setAtivo(null);
  const cidadeAtiva = ativo?.chave ? porChave.get(ativo.chave) : undefined;
  const cartao = noAtivo
    ? cidadeAtiva
      ? { membros: [cidadeAtiva], total: cidadeAtiva.total, lanceMin: cidadeAtiva.lanceMin, desagioMax: cidadeAtiva.desagioMax }
      : { membros: noAtivo.membros, total: noAtivo.total, lanceMin: noAtivo.lanceMin, desagioMax: noAtivo.desagioMax }
    : null;

  // Mapa estreito no celular (ou estreito e baixo): o cartão vira uma folha presa embaixo do mapa, na
  // largura toda. Ancorado na bolha, ao lado não cabe e embaixo/em cima sobram ~150 px: os destaques sumiam.
  const [toque] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true);
  const docado = !mini && !!tela && tela.w < 560 && (tela.h < 560 || toque);
  const alturaMax = tela ? tela.h - 16 : 600;
  const { refs, floatingStyles, isPositioned } = useFloating({
    open: !!cartao && !docado,
    strategy: "absolute",
    placement: "right",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      // troca de lado só por falta de espaço na horizontal: o ajuste vertical fica com o shift, e o cartão
      // continua ao lado da bolha (antes, no mapa baixo, ele ia para baixo e cobria o mapa)
      flip({ padding: 8, crossAxis: false, fallbackPlacements: ["left", "bottom", "top"] }),
      // nunca sai da área do mapa (crossAxis: em último caso, cobre a bolha em vez de sair pela borda)
      shift({ padding: 8, crossAxis: true }),
      // depois do shift: a altura disponível é a da área do mapa, não a de um cartão centrado na bolha
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.min(alturaMax, Math.max(220, availableHeight))}px`;
        },
      }),
    ],
  });

  const agendarFechar = () => {
    window.clearTimeout(fecharTimer.current);
    fecharTimer.current = window.setTimeout(
      () => setAtivo((a) => (a && !a.fixo ? null : a)),
      docado ? ATRASO_FECHAR * 2 : ATRASO_FECHAR,
    );
  };
  const manterAberto = () => window.clearTimeout(fecharTimer.current);
  const fecharCartao = (devolverFoco: boolean) => {
    window.clearTimeout(fecharTimer.current);
    window.clearTimeout(trocarTimer.current);
    const id = ativo?.id;
    setAtivo(null);
    if (!devolverFoco) return;
    const bolha = id ? camadaRef.current?.querySelector<HTMLElement>(seletorNo(id)) : null;
    const destino = abridor.current?.isConnected ? abridor.current : bolha && bolha.tabIndex >= 0 ? bolha : viewportRef.current;
    silenciarFoco.current = true;
    destino?.focus({ preventScroll: true });
    silenciarFoco.current = false;
  };

  const abrir = (el: HTMLElement, a: Ativo) => {
    manterAberto();
    window.clearTimeout(trocarTimer.current);
    refs.setReference(el);
    if (a.fixo) abridor.current = null;
    setAtivo((atual) => (atual && atual.id === a.id && atual.chave === a.chave && atual.fixo && !a.fixo ? atual : a));
  };

  const entrarBolha = (e: PointerEvent<HTMLButtonElement>, n: NoMapa) => {
    if (e.pointerType === "touch" || viewportRef.current?.dataset.arrastando !== undefined) return;
    onHover?.(n.grupo ? null : n.membros[0].chave);
    if (ativo?.fixo && ativo.id !== n.id) return;
    manterAberto();
    const el = e.currentTarget;
    window.clearTimeout(trocarTimer.current);
    if (ativo && ativo.id !== n.id) trocarTimer.current = window.setTimeout(() => abrir(el, { id: n.id, fixo: false }), ATRASO_TROCAR);
    else abrir(el, { id: n.id, fixo: false });
  };
  const sairBolha = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "touch") return;
    window.clearTimeout(trocarTimer.current);
    onHover?.(null);
    agendarFechar();
  };
  const focarBolha = (e: FocusEvent<HTMLButtonElement>, n: NoMapa) => {
    bolhaFocada.current = { el: e.currentTarget, chave: n.membros[0].chave };
    if (silenciarFoco.current) return;
    onHover?.(n.grupo ? null : n.membros[0].chave);
    abrir(e.currentTarget, { id: n.id, fixo: false });
  };
  const desfocar = (e: FocusEvent<HTMLElement>) => {
    bolhaFocada.current = null;
    const para = e.relatedTarget;
    if (para instanceof Node && cartaoRef.current?.contains(para)) return;
    onHover?.(null);
    agendarFechar();
  };
  const clicarBolha = (e: MouseEvent<HTMLButtonElement>, n: NoMapa) => {
    const teclado = e.detail === 0;
    if (n.grupo) {
      aproximar(n, teclado);
      return;
    }
    if (ativo?.id === n.id && ativo.fixo && !ativo.chave) {
      fecharCartao(false);
      return;
    }
    focarCartao.current = teclado;
    abrir(e.currentTarget, { id: n.id, fixo: true });
    abridor.current = e.currentTarget;
  };

  /** Foco no mapa sem abrir cartão (o cartão com o foco vai fechar). */
  const focoNoMapa = () => {
    silenciarFoco.current = true;
    viewportRef.current?.focus({ preventScroll: true });
    silenciarFoco.current = false;
  };

  const aproximar = (n: NoMapa, teclado: boolean) => {
    if (!tela) return;
    const z = zoomParaSeparar(n.membros, escalaBase(tela), camera.z, ZOOM_MAX, { maiorCidade, somaTotal, fator });
    const caixa = caixaDosPontos(n.membros) ?? alvo.caixa;
    // Teclado: o foco segue para a bolha da maior cidade do grupo quando o zoom terminar. Mouse: nada de
    // abrir cartão sozinho depois; se o foco estava no cartão (botão clicado), ele fica no mapa.
    if (cartaoRef.current?.contains(document.activeElement)) focoNoMapa();
    refocar.current = teclado ? n.membros[0].chave : null;
    setAtivo(null);
    // todas as cidades do grupo na tela se couberem nesse zoom; senão, centrado no peso do grupo
    const cabe = enquadrar(caixa, tela, ZOOM_MAX, MARGEM_PONTOS).z >= z;
    irPara(cabe ? enquadrar(caixa, tela, z, MARGEM_PONTOS) : { z, cx: n.x, cy: n.y }, { usuario: true });
  };

  const originais = useMemo(() => new Map(pontos.map((p) => [p.chave, p])), [pontos]);
  const selecionar = (p: PontoMapa) => {
    // o cartão com o foco vai fechar: o foco fica no mapa (não cai no fim da página)
    if (cartaoRef.current?.contains(document.activeElement)) focoNoMapa();
    // pedido explícito de ver a cidade: quando os resultados chegarem, o mapa enquadra neles
    autoRef.current = true;
    setAuto(true);
    setPendente(false);
    setAtivo(null);
    onHover?.(null);
    // o objeto do próprio pai (sem as coordenadas de tela que o mapa acrescenta)
    onSelecionarCidade?.(originais.get(p.chave) ?? p);
  };

  // lista acessível (muitas bolhas): o cartão é o da cidade, ancorado na bolha (ou no grupo) dela
  const focarCidadeDaLista = (p: PontoProjetado) => {
    if (silenciarFoco.current) return;
    const n = noDaChave.get(p.chave);
    const bolha = n && camadaRef.current?.querySelector<HTMLElement>(seletorNo(n.id));
    onHover?.(p.chave);
    if (n && bolha) abrir(bolha, { id: n.id, chave: p.chave, fixo: false });
    else setAtivo(null);
  };
  const clicarCidadeDaLista = (e: MouseEvent<HTMLButtonElement>, p: PontoProjetado) => {
    const n = noDaChave.get(p.chave);
    const bolha = n && camadaRef.current?.querySelector<HTMLElement>(seletorNo(n.id));
    if (!n || !bolha) return;
    focarCartao.current = e.detail === 0;
    abrir(bolha, { id: n.id, chave: p.chave, fixo: true });
    abridor.current = e.currentTarget;
  };

  // foco para dentro do cartão aberto pelo teclado
  useLayoutEffect(() => {
    if (!ativo?.fixo || !focarCartao.current || !(isPositioned || docado)) return;
    focarCartao.current = false;
    cartaoRef.current?.focus({ preventScroll: true });
  }, [ativo, isPositioned, docado]);

  // cartão fixo: clique fora fecha
  const fixo = !!ativo?.fixo;
  useEffect(() => {
    if (!fixo) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || cartaoRef.current?.contains(t) || t.closest("[data-no],[data-cidade]")) return;
      window.clearTimeout(fecharTimer.current);
      setAtivo(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [fixo]);

  // A bolha com foco sumiu ao reagrupar (ou "Aproximar" fechou o cartão): o foco vai para a bolha que
  // agora contém a mesma cidade, ou para o mapa.
  // Com muitas bolhas elas saem da árvore acessível (aria-hidden): a que estava com o foco o passa ao mapa.
  useLayoutEffect(() => {
    const foco = document.activeElement;
    const chave = refocar.current ?? (bolhaFocada.current && !bolhaFocada.current.el.isConnected ? bolhaFocada.current.chave : null);
    if (chave) {
      refocar.current = null;
      bolhaFocada.current = null;
      // a pessoa já foi para outro lugar: não puxa o foco de volta
      if (foco && foco !== document.body && foco !== viewportRef.current && foco.isConnected) return;
      const n = noDaChave.get(chave);
      const el = n ? camadaRef.current?.querySelector<HTMLElement>(seletorNo(n.id)) : null;
      (el && el.tabIndex >= 0 ? el : viewportRef.current)?.focus({ preventScroll: true });
      return;
    }
    if (foco instanceof HTMLElement && foco.tabIndex < 0 && foco.dataset.no !== undefined && camadaRef.current?.contains(foco)) {
      viewportRef.current?.focus({ preventScroll: true });
    }
  }, [noDaChave, desenho]);

  // ---- teclado ----
  const teclas = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      if (!ativo) return;
      e.stopPropagation();
      fecharCartao(!!cartaoRef.current?.contains(document.activeElement) || ativo.fixo);
      return;
    }
    const alvoTecla = e.target as HTMLElement;
    if (alvoTecla.closest("[data-cartao],[data-controles]") || e.altKey || e.ctrlKey || e.metaKey || !tela) return;
    const passo = e.shiftKey ? 0.5 : 0.2;
    switch (e.key) {
      case "+":
      case "=":
        cam.zoomPor(1.6);
        break;
      case "-":
      case "_":
        cam.zoomPor(1 / 1.6);
        break;
      case "ArrowLeft":
        cam.moverPor(tela.w * passo, 0);
        break;
      case "ArrowRight":
        cam.moverPor(-tela.w * passo, 0);
        break;
      case "ArrowUp":
        cam.moverPor(0, tela.h * passo);
        break;
      case "ArrowDown":
        cam.moverPor(0, -tela.h * passo);
        break;
      case "0":
        brasilInteiro();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // ---- desenho ----
  const t = tela ? translacao(camera, tela) : null;
  const pontoMini = mini ? projetados[0] : undefined;
  const nomeRegiao =
    rotulo ??
    (mini && pontoMini
      ? `Mapa: ${pontoMini.cidade}/${pontoMini.uf}, ${notaPosicao.charAt(0).toLowerCase()}${notaPosicao.slice(1)}`
      : "Mapa dos imóveis por cidade");
  const resumo = mini
    ? ""
    : projetados.length
      ? `${plural(projetados.length, "cidade", "cidades")} com ${plural(somaTotal, "imóvel", "imóveis")} no mapa.`
      : "Nenhum imóvel no mapa com esses filtros.";

  return (
    <section
      aria-label={nomeRegiao}
      onKeyDown={teclas}
      data-variante={variante}
      data-zoom={camera.z.toFixed(2)}
      className={`${s.mapa} ${s[variante]} ${className}`}
    >
      <p id={idInstrucoes} className="sr-only">
        {resumo} Arraste ou use as setas para mover; use a roda do mouse{modoRolagem === "ctrl" ? " com Ctrl (ou ⌘)" : ""}, a pinça
        {modoRolagem === "ctrl" ? " com dois dedos" : ""}, o duplo clique ou as teclas + e − para aproximar e afastar; 0 volta ao Brasil inteiro.
        {mini ? "" : " Cada círculo reúne os imóveis de uma cidade; círculos com número e anel são grupos de cidades próximas."}
        {muitos ? " Com muitas cidades na tela, a tecla Tab leva à lista das cidades com mais imóveis." : ""}
      </p>

      <div
        ref={viewportRef}
        tabIndex={0}
        role="group"
        aria-roledescription="mapa"
        aria-label="Área do mapa"
        aria-describedby={idInstrucoes}
        className={`${s.viewport} ${modoRolagem === "ctrl" ? s.cooperativa : s.direta}`}
      >
        <svg
          className="absolute inset-0 size-full"
          viewBox={tela ? `0 0 ${tela.w} ${tela.h}` : `0 0 ${MAPA_LARGURA} ${MAPA_ALTURA}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          <g ref={gRef} transform={t ? `translate(${t.tx} ${t.ty}) scale(${t.s})` : undefined}>
            <g className={s.costa}>
              {UFS.map(([uf, u]) => (
                <path key={uf} d={u.d} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
            <g>
              {UFS.map(([uf, u]) => (
                <path
                  key={uf}
                  d={u.d}
                  className={s.uf}
                  data-ativa={ufsComResultado.has(uf) ? "" : undefined}
                  data-foco={focoSet.has(uf) ? "" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            {focoUfs.length > 0 && (
              <g className={s.contornoFoco}>
                {focoUfs.map((uf) => (
                  <path key={uf} d={UFS_MAPA[uf].d} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )}
          </g>
        </svg>

        <div ref={camadaRef} className={s.camada}>
          {desenho?.siglas.map(({ uf, x, y }) => (
            <span key={uf} aria-hidden="true" className={s.sigla} style={{ left: x, top: y }}>
              {uf}
            </span>
          ))}

          {!mini &&
            desenho?.itens.map(({ n, sx, sy, naTela }) => {
              const tamanho = Math.max(n.r * 2, 24);
              const aceso = n.id === idDestaque || n.id === ativo?.id;
              const contagem = textoContagem(n.total);
              // grupo: sempre com número (o raio já foi feito para caber); cidade: só se couber com folga
              const fonteBase = n.grupo ? (fonteNumero(n.r, contagem) ?? fonteContagem(contagem)) : fonteNumero(n.r, contagem);
              const texto = fonteBase ? contagem : null;
              const fonte = fonteBase ? fonteBase + (n.r >= 22 && contagem.length <= 4 ? 1 : 0) : 0;
              const oculta = muitos || !naTela;
              return (
                <button
                  key={n.id}
                  type="button"
                  data-no={n.id}
                  data-aceso={aceso ? "" : undefined}
                  className={s.bolha}
                  style={{ left: sx, top: sy, width: tamanho, height: tamanho, zIndex: aceso ? 2 : undefined }}
                  aria-label={rotuloNo(n)}
                  aria-hidden={oculta ? true : undefined}
                  tabIndex={oculta ? -1 : undefined}
                  aria-expanded={!n.grupo ? (ativo?.id === n.id && ativo.fixo) : undefined}
                  aria-controls={!n.grupo && ativo?.id === n.id && cartao ? idCartao : undefined}
                  aria-haspopup={n.grupo ? undefined : "dialog"}
                  onMouseDown={(e) => e.preventDefault()}
                  onPointerEnter={(e) => entrarBolha(e, n)}
                  onPointerLeave={sairBolha}
                  onFocus={(e) => focarBolha(e, n)}
                  onBlur={desfocar}
                  onClick={(e) => clicarBolha(e, n)}
                >
                  <span className={s.disco} data-grupo={n.grupo ? "" : undefined} style={{ width: n.r * 2, height: n.r * 2 }}>
                    {texto && (
                      <span className={s.numero} style={{ fontSize: fonte }}>
                        {texto}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

          {mini && pontoMini && t && (
            <span aria-hidden="true" className={s.marco} style={{ left: pontoMini.x * t.s + t.tx, top: pontoMini.y * t.s + t.ty }} />
          )}

          {desenho?.rotulos.map((r) => (
            <span
              key={r.id}
              aria-hidden="true"
              className={s.rotulo}
              style={{
                left: r.x,
                top: r.y,
                transform:
                  r.lado === "dir"
                    ? `scale(var(--contra)) translate(${r.r + 4}px, -50%)`
                    : `scale(var(--contra)) translate(${-(r.r + 4)}px, -50%) translateX(-100%)`,
              }}
            >
              {r.texto}
            </span>
          ))}
        </div>
      </div>

      {muitos && maiores.length > 0 && (
        <div
          className={`${s.vidro} absolute top-3 left-3 z-30 max-h-[calc(100%-1.5rem)] w-[min(280px,calc(100%-5.5rem))] overflow-y-auto rounded-2xl p-2 not-focus-within:sr-only`}
        >
          <p id={idLista} className="px-2 pt-1 pb-2 text-xs font-semibold text-nevoa">
            Cidades com mais imóveis
          </p>
          <ul aria-labelledby={idLista}>
            {maiores.map((p) => (
              <li key={p.chave}>
                <button
                  type="button"
                  data-cidade={p.chave}
                  aria-label={rotuloCidade(p)}
                  aria-haspopup="dialog"
                  aria-expanded={ativo?.chave === p.chave && ativo.fixo}
                  onFocus={() => focarCidadeDaLista(p)}
                  onBlur={desfocar}
                  onClick={(e) => clicarCidadeDaLista(e, p)}
                  className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-[13px] text-luar hover:bg-nevoa/10 focus-visible:-outline-offset-2"
                >
                  <span className="truncate">
                    {p.cidade}
                    <span className="text-nevoa">/{p.uf}</span>
                  </span>
                  <span className="shrink-0 text-nevoa tabular-nums">{numero(p.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendente && !mini && (
        <button
          type="button"
          onClick={aoEnquadrar}
          className={`${s.vidro} absolute top-3 left-1/2 z-30 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border-latao/60! px-4 text-sm font-semibold whitespace-nowrap text-latao-texto shadow-[0_6px_24px_rgba(0,0,0,.18)] transition-colors hover:bg-latao/15 pointer-fine:min-h-10`}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <IconeEnquadrar />
          </svg>
          Enquadrar resultados
        </button>
      )}

      <div data-controles className={`${s.vidro} absolute top-3 right-3 z-30 flex flex-col overflow-hidden rounded-2xl`}>
        <BotaoControle rotulo="Aproximar" onClick={() => cam.zoomPor(1.8)} desativado={camera.z >= ZOOM_MAX - 1e-3}>
          <path d="M12 5v14M5 12h14" />
        </BotaoControle>
        <BotaoControle rotulo="Afastar" onClick={() => cam.zoomPor(1 / 1.8)} desativado={camera.z <= ZOOM_MIN + 1e-3}>
          <path d="M5 12h14" />
        </BotaoControle>
        <span aria-hidden="true" className="mx-2 h-px bg-nevoa/20" />
        <BotaoControle rotulo="Brasil inteiro" onClick={brasilInteiro}>
          <path d="M9 4 3.8 6.1a1 1 0 0 0-.6.9v12.1a.6.6 0 0 0 .8.6L9 17.6l6 2.4 5.2-2.1a1 1 0 0 0 .6-.9V4.9a.6.6 0 0 0-.8-.6L15 6.4 9 4Z" />
          <path d="M9 4v13.6M15 6.4V20" />
        </BotaoControle>
        <BotaoControle rotulo={mini ? "Enquadrar o imóvel" : "Enquadrar resultados"} onClick={aoEnquadrar}>
          <IconeEnquadrar />
        </BotaoControle>
      </div>

      <p className={`${s.vidro} pointer-events-none absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] items-start gap-2 rounded-xl px-2.5 py-1.5 text-[11px] leading-snug text-nevoa sm:max-w-[calc(100%-5.5rem)]`}>
        <svg viewBox="0 0 22 12" className="mt-px h-3 w-[22px] shrink-0" aria-hidden="true">
          <circle cx="4" cy="7" r="3" className="fill-latao" />
          <circle cx="15" cy="6" r="5.4" className="fill-latao" />
        </svg>
        <span>
          {mini ? notaPosicao : "Cada círculo reúne os imóveis de uma cidade · posição aproximada (centro da cidade)"}
        </span>
      </p>

      {!mini && tela && projetados.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center p-6">
          <p className={`${s.vidro} rounded-2xl px-4 py-3 text-center text-sm text-luar`}>Nenhum imóvel no mapa com esses filtros</p>
        </div>
      )}

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-40 grid place-items-center p-6 transition-opacity duration-200 motion-reduce:transition-none ${aviso ? "opacity-100" : "opacity-0"}`}
      >
        <p className="rounded-full border border-[#EAF0FF]/15 bg-noite-fixa/85 px-4 py-2.5 text-center text-sm font-medium text-[#EAF0FF] shadow-lg">{aviso}</p>
      </div>

      {cartao && (
        <CartaoMapa
          ref={(el) => {
            cartaoRef.current = el;
            refs.setFloating(docado ? null : el);
          }}
          id={idCartao}
          membros={cartao.membros}
          total={cartao.total}
          lanceMin={cartao.lanceMin}
          desagioMax={cartao.desagioMax}
          fixo={!!ativo?.fixo}
          docado={docado}
          compacto={docado || (!!tela && tela.h < 440)}
          estilo={docado ? { maxHeight: alturaMax } : { ...floatingStyles, visibility: isPositioned ? undefined : "hidden" }}
          hrefImovel={hrefImovel}
          onSelecionarCidade={onSelecionarCidade ? selecionar : undefined}
          onAproximar={(teclado) => noAtivo && aproximar(noAtivo, teclado)}
          onFechar={() => fecharCartao(true)}
          onEntrar={() => {
            manterAberto();
            // lendo o cartão da cidade, o card dela na lista continua aceso
            onHover?.(cartao.membros.length === 1 ? cartao.membros[0].chave : null);
          }}
          onSair={() => {
            onHover?.(null);
            agendarFechar();
          }}
          onBlur={(e) => {
            const para = e.relatedTarget;
            if (para instanceof Node && (e.currentTarget.contains(para) || (para instanceof Element && para.closest("[data-no],[data-cidade]")))) return;
            if (!ativo?.fixo) agendarFechar();
          }}
        />
      )}
    </section>
  );
}
