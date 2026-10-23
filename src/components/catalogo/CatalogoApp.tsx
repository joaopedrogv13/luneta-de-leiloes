"use client";

import { memo, useCallback, useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { UpgradeModal } from "@/components/assinante/UpgradeModal";
import { filtrosEfetivos, filtrosIguais, gruposForaDoPlano, limparVazios, pilulas, recursoDoGrupo, removerGrupos } from "@/lib/catalogo/filtros-rotulos";
import { ordemPermitida, pode, RECURSO_DA_ORDEM } from "@/lib/catalogo/planos";
import { TOAST_FAVORITADO } from "@/lib/catalogo/produto";
import { chaveUltimaBusca, rotaImovel, ROTA_LISTA } from "@/lib/catalogo/rotas";
import { ORDEM_PADRAO, type CaixaGeo, type Conjunto, type Facetas, type Filtros, type ImovelResumo, type Ordem, type Plano, type PontoMapa, type Recurso, type ResultadoBusca } from "@/lib/catalogo/tipos";
import { nivelDaPrecisao } from "@/lib/catalogo/pontos";
import { plural } from "@/lib/catalogo/rotulos";
import { quartosDaBusca, rotuloQuartosDaBusca, semQuartos } from "@/lib/catalogo/texto";
import { lerBusca, type CameraMapa, type Vista } from "@/lib/catalogo/url";
import { AreaMapa } from "./app/AreaMapa";
import { AvisoForaDoPlano, AvisoLente, Toast, type Mensagem } from "./app/Avisos";
import s from "./app/catalogo.module.css";
import { chaveDoEstado, enderecoPagina, type PedidoLista } from "./app/consultas";
import { EstadoVazio } from "./app/EstadoVazio";
import { MapaTelaCheia } from "./app/MapaTelaCheia";
import { criarLojaDestaque, salvarPreferencias, useAcesoPeloMapa, useMidia, usePreferencias, type LojaDestaque } from "./app/hooks";
import { Paginacao } from "./app/Paginacao";
import { CHAVE_TELA, CONSULTA_BARRA_COMPACTA, CONSULTA_BARRA_RECOLHE, CONSULTA_COMPUTADOR, CONSULTA_CELULAR, type Preferencias } from "./app/preferencias";
import { Cabecalho, type FaixaAviso } from "./Cabecalho";
import { CartaoImovel, LinhaImovel, ListaEsqueletos, SeletorVista } from "./cartoes";
import { IconeLista, IconeMapa } from "./cartoes/icones";
import { BarraFiltros } from "./filtros";
import { ProvedorPedirLuneta } from "./planos/convite";
import { consumirVoltaPropria, depoisDoHistorico } from "./ui/historico";
import { semMovimento } from "./ui/useAdiado";
import { Explorar } from "./mapa-gl/Explorar";
import { FolhaMapa } from "./mapa-gl/FolhaMapa";
import type { Folga } from "./mapa-gl/MapaGL";
import { temWebGL } from "./mapa-gl/webgl";
import { useBusca } from "./useBusca";
import { useFavoritos } from "./useFavoritos";

const TOAST_FAVORITO = TOAST_FAVORITADO;
/** Na prévia os selos estão desligados (critérios pendentes): o aviso não promete o que não aparece. */
const toastPlano = (selosDesligados: boolean) =>
  selosDesligados
    ? "Plano Luneta ativado nesta demonstração: tags de risco, filtros avançados, simulador, preço da região e nota de localização à vista (selos ainda em análise). Nenhuma cobrança foi feita."
    : "Plano Luneta ativado nesta demonstração: tags e selos, filtros avançados, simulador, preço da região e nota de localização à vista. Nenhuma cobrança foi feita.";

/** Facetas vazias (só até a primeira resposta, quando o servidor não conseguiu buscar). */
const FACETAS_VAZIAS: Facetas = {
  uf: [], cidade: [], bairro: [], tipo: [], modalidade: [], praca: [], ocupacao: [], natureza: [], fonte: [], tags: [], selo: [],
  lance: null, avaliacao: null, desagio: null, lanceM2: null, area: null, financiamento: 0, fgts: 0, parcelamento: 0, comFoto: 0,
};

/** Grade dos cards: 1 a 4 colunas pela largura da área (cada cartão com pelo menos 300 px). */
const GRADE_CARDS = "grid grid-cols-1 gap-4 sm:gap-5 @min-[620px]:grid-cols-2 @min-[940px]:grid-cols-3 @min-[1260px]:grid-cols-4";
const LISTA_LINHAS = "flex flex-col gap-3 sm:gap-4";
/** Largura máxima do conteúdo sem a coluna do mapa (a barra de filtros segue a mesma, para as bordas alinharem). */
const LARGURA_LISTA = "max-w-[1180px]";
const LARGURA_CARDS = "max-w-[1680px]";

/** Botão flutuante do mapa no celular: altura + margem de baixo (o foco pelo Tab não para atrás dele). */
const ESPACO_BOTAO_MAPA = 84;

/** Vista de mapa: nada cobre o mapa no computador; no celular, a folha da lista espia embaixo. */
const FOLGA_COLUNA: Folga = { cima: 0, baixo: 0, esq: 0, dir: 0 };
/** Celular: a folha da lista espia embaixo (a altura da espiada vem da folha: menor no celular deitado). */
const folgaDaFolha = (espiada: number): Folga => ({ cima: 0, baixo: espiada, esq: 0, dir: 0 });

/** Os filtros de lugar e o texto: mudando um deles na vista de mapa, a área antiga sai (o mapa enquadra o lugar novo). */
const mudouLugar = (a: Filtros, b: Filtros) =>
  JSON.stringify([a.uf, a.cidade, a.bairro, a.q]) !== JSON.stringify([b.uf, b.cidade, b.bairro, b.q]);
const semArea = (f: Filtros): Filtros => (f.bbox ? limparVazios({ ...f, bbox: undefined }) : f);

export interface PropsCatalogoApp {
  conjunto: Conjunto;
  /** o que o servidor desenhou (a primeira pintura chega pronta, sem esqueleto) */
  servidor: {
    pedido: PedidoLista;
    /** null: o servidor não conseguiu buscar (o app mostra o erro e tenta pela API) */
    resultado: ResultadoBusca | null;
    /** chave do estado da URL que o servidor leu (chaveDoEstado) */
    chaveUrl: string;
    vista: Vista | null;
    mapa: boolean | null;
    /** câmera da vista de mapa na URL */
    camera?: CameraMapa | null;
  };
  /** preferência de vista e mapa do cookie (a do localStorage vale depois da hidratação) */
  preferencias: Preferencias;
  /** palpite do servidor pelo navegador (vista padrão e mapa na primeira pintura) */
  palpiteCelular: boolean;
  selosDesligados: boolean;
  /** título (h1, no cabeçalho) e a linha sob ele */
  textos: { titulo: string; area: string };
  /** faixa de aviso acima do cabeçalho (prévia interna; exemplos fictícios) */
  faixa?: FaixaAviso | null;
  /** rodapé (do servidor) */
  rodape: ReactNode;
}

/**
 * App do catálogo (/previa com os dados reais e /assinante com os exemplos): cabeçalho, barra de filtros fixa,
 * lista ou cards, mapa ligado à lista, paginação, favoritos e a demonstração Lente × Luneta.
 *
 * Estado na URL: trocar de página, aplicar o painel "Todos os filtros", buscar um texto e escolher a cidade no
 * mapa criam uma entrada no histórico (o "voltar" do navegador volta à busca anterior, sem sair do catálogo);
 * os ajustes dos pop-ups rápidos só substituem a entrada atual. O "Voltar à busca" da página do imóvel usa a
 * última URL guardada no sessionStorage. A vista e o mapa seguem a escolha da pessoa (salva no navegador) ou
 * o padrão do aparelho: lista com o mapa ao lado no computador, cards no celular.
 */
export function CatalogoApp({ conjunto, servidor, preferencias, palpiteCelular, selosDesligados, textos, faixa, rodape }: PropsCatalogoApp) {
  // Ao voltar pelo navegador, o Next pode montar a página antiga (do cache) com a URL nova: vale a URL.
  // Na hidratação a URL é a que o servidor leu, e o estado é o do servidor (o HTML bate).
  const [inicio] = useState(() => {
    const doServidor = { pedido: servidor.pedido, vista: servidor.vista, mapa: servidor.mapa, camera: servidor.camera ?? null };
    if (typeof window === "undefined") return doServidor;
    const e = lerBusca(new URLSearchParams(window.location.search));
    if (chaveDoEstado(e) === servidor.chaveUrl) return doServidor;
    return { pedido: { filtros: e.filtros, ordem: e.ordem, pagina: e.pagina, plano: e.plano }, vista: e.vista, mapa: e.mapa, camera: e.camera };
  });

  // ---- vista e mapa: escolha explícita (URL ou botão) > preferência salva > padrão do aparelho ----
  const [vistaEscolhida, setVistaEscolhida] = useState<Vista | null>(inicio.vista);
  const [mapaEscolhido, setMapaEscolhido] = useState<boolean | null>(inicio.mapa);
  const pref = usePreferencias(preferencias);
  const celular = useMidia(CONSULTA_CELULAR, palpiteCelular);
  const computador = useMidia(CONSULTA_COMPUTADOR, !palpiteCelular);
  // a largura medida vai num cookie: da próxima página em diante, o servidor desenha a vista certa (UX-12)
  useEffect(() => {
    try {
      document.cookie = `${CHAVE_TELA}=${celular ? "c" : "g"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // cookies bloqueados: fica o palpite pelo navegador
    }
  }, [celular]);
  const vista: Vista = vistaEscolhida ?? pref.vista ?? (celular ? "cards" : "lista");
  /** vista de mapa (o mapa de verdade); `glFalhou`: sem WebGL, ela mostra o mapa do Brasil em SVG no lugar */
  const emMapa = vista === "mapa";
  const [glFalhou, setGlFalhou] = useState(false);
  /** a lista na vista de mapa usa as linhas (compactas na coluna estreita: mais imóveis à vista); a vista para onde o botão do celular volta */
  const [vistaAnterior, setVistaAnterior] = useState<Exclude<Vista, "mapa">>(() => (pref.vista === "lista" || pref.vista === "cards" ? pref.vista : celular ? "cards" : "lista"));
  const vistaLista: Exclude<Vista, "mapa"> = emMapa ? "lista" : vista;
  /** câmera da vista de mapa (vai para a URL a cada parada) */
  const [cameraMapa, setCameraMapa] = useState<CameraMapa | null>(inicio.camera);
  /** voltar/avançar no navegador: a câmera daquela entrada (um objeto novo a cada vez; o mapa aberto pula para ela) */
  const [cameraRestaurada, setCameraRestaurada] = useState<CameraMapa | null>(null);
  /** null = padrão do aparelho (o CSS decide na primeira pintura: visível a partir de lg) */
  const mapaPedido = mapaEscolhido ?? pref.mapa;
  const mapaVisivel = emMapa ? glFalhou : (mapaPedido ?? computador);
  const mapaNaColuna = (vista === "lista" || emMapa) && computador;
  /** celular: o mapa em tela cheia, aberto pelo botão flutuante (não muda a preferência salva) */
  const [mapaCheio, setMapaCheio] = useState(false);
  const telaCheia = mapaCheio && celular;

  const busca = useBusca({
    conjunto,
    servidor: { pedido: servidor.pedido, resultado: servidor.resultado },
    pedidoInicial: inicio.pedido,
    selosDesligados,
    mapaVisivel: mapaVisivel || telaCheia,
  });
  const { pedido } = busca;
  const plano = pedido.plano;
  const lente = plano === "lente";
  /**
   * Na vista de mapa, o resultado novo (a cada parada do mapa, com "Buscar ao mover o mapa") é desenhado em segundo
   * plano (useDeferredValue): medido com a CPU 4× mais lenta (celular), o desenho da lista, da barra e das facetas novas
   * logo depois de soltar o dedo caiu de 215–260 ms numa tarefa só para 105–140 ms. Nas outras vistas, vem na hora.
   */
  const exibidoAgora = busca.exibido;
  const exibidoAdiado = useDeferredValue(exibidoAgora);
  const exibido = emMapa ? exibidoAdiado : exibidoAgora;
  /** o resultado na tela ainda é o anterior (o novo está sendo desenhado): conta como carregando */
  const desenhando = exibido !== exibidoAgora;
  const resultado = exibido?.resultado ?? null;
  const facetas = resultado?.facetas ?? FACETAS_VAZIAS;
  const total = resultado?.total ?? 0;

  // ---- URL, histórico e última busca (para o "Voltar à busca" da página do imóvel) ----
  const caminho = ROTA_LISTA[conjunto];
  const endereco = enderecoPagina(caminho, { ...pedido, vista: vistaEscolhida, mapa: mapaEscolhido, camera: emMapa ? cameraMapa : null });
  /** a próxima mudança de URL cria uma entrada no histórico ("push") ou substitui a atual */
  const proximaEntrada = useRef<"push" | "replace">("replace");
  const marcarEntrada = useCallback(() => {
    proximaEntrada.current = "push";
  }, []);
  const enderecoAtual = useRef(endereco);
  useEffect(() => {
    enderecoAtual.current = endereco;
    const modo = proximaEntrada.current;
    proximaEntrada.current = "replace";
    // a folha de filtros pode estar saindo do histórico (history.back): a URL nova vai depois dela
    depoisDoHistorico(() => {
      const url = enderecoAtual.current;
      if (window.location.pathname + window.location.search === url) return;
      if (modo === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(window.history.state, "", url);
    });
    try {
      window.sessionStorage.setItem(chaveUltimaBusca(conjunto), endereco);
    } catch {
      // sem sessionStorage: o "Voltar à busca" leva à lista sem filtros
    }
  }, [endereco, conjunto]);
  const hrefPagina = (p: number) => enderecoPagina(caminho, { ...pedido, pagina: p, vista: vistaEscolhida, mapa: mapaEscolhido, camera: emMapa ? cameraMapa : null });

  // "voltar" e "avançar" do navegador: a busca da URL volta para a tela
  const { restaurar } = busca;
  useEffect(() => {
    const aoNavegar = () => {
      if (consumirVoltaPropria()) return; // a folha de filtros saiu do histórico: não há o que restaurar
      if (window.location.pathname !== caminho) return;
      const e = lerBusca(new URLSearchParams(window.location.search));
      restaurar({ filtros: e.filtros, ordem: e.ordem, pagina: e.pagina, plano: e.plano });
      setVistaEscolhida(e.vista);
      setMapaEscolhido(e.mapa);
      if (e.camera) {
        setCameraMapa(e.camera);
        setCameraRestaurada(e.camera);
      }
    };
    window.addEventListener("popstate", aoNavegar);
    return () => window.removeEventListener("popstate", aoNavegar);
  }, [caminho, restaurar]);

  // ---- partes fixas (cabeçalho no computador + barra de filtros): alturas e sombra quando colada ----
  // --cab-h: onde a barra para (abaixo do cabeçalho fixo; 0 no celular e em tela baixa); --topo-h: cabeçalho +
  // barra (a coluna do mapa começa ali e ocupa o resto da tela; o foco do Tab para abaixo disso); --faixa-v:
  // quanto da faixa de aviso ainda aparece acima do cabeçalho fixo (só no topo da página).
  const raiz = useRef<HTMLDivElement>(null);
  const cabecalho = useRef<HTMLElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const barraVisivel = useRef<HTMLDivElement>(null);
  const sentinela = useRef<HTMLDivElement>(null);
  const topoFixo = useRef(0);
  const cabFixo = useRef(0);
  const [colada, setColada] = useState(false);
  /** a barra sai de cena ao rolar para baixo e volta ao rolar para cima (celular, tablet, tela baixa) */
  const [recolhida, setRecolhida] = useState(false);
  /**
   * Colada em tela de tablet ou baixa: uma linha só (busca, total, ordenar, filtros). A altura cheia fica
   * reservada (transparente, sem receber cliques) para a lista não pular quando a barra encolhe.
   */
  const [compacta, setCompacta] = useState<{ altura: number } | null>(null);
  useEffect(() => {
    const r = raiz.current;
    const b = barra.current;
    const v = barraVisivel.current;
    const c = cabecalho.current;
    const marco = sentinela.current;
    if (!r || !b || !v || !c || !marco) return;
    const html = document.documentElement;
    const antes = html.style.scrollPaddingTop;
    const recolheMq = window.matchMedia(CONSULTA_BARRA_RECOLHE);
    const compactaMq = window.matchMedia(CONSULTA_BARRA_COMPACTA);
    let quadro = 0;
    let ultimoY = window.scrollY;
    let faixaAntes = -1;
    let compactaAgora = false;
    const verColada = () => {
      quadro = 0;
      // o marco (1 px logo acima da barra) passou por baixo do cabeçalho fixo: a barra está colada
      const estaColada = marco.getBoundingClientRect().bottom < cabFixo.current + 0.5;
      setColada(estaColada);
      // Faixa de aviso ainda à vista acima do cabeçalho fixo (topo da página): a coluna do mapa encolhe o
      // mesmo tanto, para caber inteira na tela (com a legenda) desde a primeira pintura.
      // Com o cabeçalho que rola junto (tela baixa, como 1366×768), o que ainda está à vista dele também conta: sem isso a
      // coluna do mapa passava ~110 px do pé da tela (legenda, escala e créditos fora da tela até rolar).
      const faixa = Math.max(0, Math.round(cabFixo.current ? c.getBoundingClientRect().top : c.getBoundingClientRect().bottom));
      if (faixa !== faixaAntes) {
        faixaAntes = faixa;
        r.style.setProperty("--faixa-v", `${faixa}px`);
      }
      // nunca muda com algo aberto ou em uso dentro dela (pop-up de filtro, busca digitando)
      const ativo = document.activeElement;
      const emUso = !!b.querySelector("[aria-expanded=true]") || (b.contains(ativo) && ativo instanceof HTMLInputElement);
      const querCompacta = estaColada && compactaMq.matches;
      if (querCompacta !== compactaAgora && !emUso) {
        compactaAgora = querCompacta;
        setCompacta(querCompacta ? { altura: Math.round(v.getBoundingClientRect().height) } : null);
      }
      const y = window.scrollY;
      const dy = y - ultimoY;
      if (Math.abs(dy) < 6) return;
      ultimoY = y;
      // recolhe no celular, no toque e em tela baixa, e sempre que a barra ocupa mais de 1/4 da tela
      const recolhe = recolheMq.matches || v.offsetHeight > window.innerHeight * 0.25;
      setRecolhida(recolhe && estaColada && dy > 0 && y > marco.offsetTop + 240 && !emUso && !b.contains(ativo));
    };
    const medir = () => {
      const cab = getComputedStyle(c).position === "sticky" ? Math.round(c.getBoundingClientRect().height) : 0;
      const topo = cab + Math.round(v.getBoundingClientRect().height);
      topoFixo.current = topo;
      cabFixo.current = cab;
      r.style.setProperty("--cab-h", `${cab}px`);
      r.style.setProperty("--topo-h", `${topo}px`);
      html.style.scrollPaddingTop = `${topo + 16}px`;
      verColada();
    };
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(verColada);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(v);
    ro.observe(c);
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", medir);
      html.style.scrollPaddingTop = antes;
    };
  }, []);

  // ---- celular e tablet na vista de mapa: o mapa abaixo da barra e a lista numa folha por cima ----
  const mapaNaFolha = emMapa && !glFalhou && !computador;

  // ---- paginação à vista (o botão flutuante do mapa sai do caminho dela e do rodapé) ----
  const fimDaLista = useRef<HTMLDivElement>(null);
  const [fimVisivel, setFimVisivel] = useState(false);
  useEffect(() => {
    const el = fimDaLista.current;
    if (!el) return;
    // 96 px antes de a paginação entrar na tela o botão já saiu (ele ocupa os ~70 px de baixo)
    const io = new IntersectionObserver(([e]) => setFimVisivel(e.isIntersecting || e.boundingClientRect.top < 0), {
      threshold: 0,
      rootMargin: "0px 0px 96px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const botaoMapaVisivel = !fimVisivel;
  // celular, com o botão do mapa na tela: o foco pelo Tab nunca para atrás dele (scroll-padding embaixo)
  useEffect(() => {
    if (!celular || !botaoMapaVisivel) return;
    const html = document.documentElement;
    const antes = html.style.scrollPaddingBottom;
    html.style.scrollPaddingBottom = `${ESPACO_BOTAO_MAPA}px`;
    return () => {
      html.style.scrollPaddingBottom = antes;
    };
  }, [celular, botaoMapaVisivel]);

  // ---- rolagem até o topo da lista ----
  const tituloLista = useRef<HTMLHeadingElement>(null);
  const irAoTopo = useCallback((focar: boolean) => {
    const alvo = document.getElementById("resultados");
    if (!alvo) return;
    alvo.scrollIntoView({ block: "start", behavior: semMovimento() ? "auto" : "smooth" });
    if (focar) tituloLista.current?.focus({ preventScroll: true });
  }, []);
  /** Filtro ou ordem novos com a pessoa lá embaixo na lista: volta ao começo dela (o foco fica onde está). */
  const subirSeRolou = useCallback(() => {
    const alvo = document.getElementById("resultados");
    if (alvo && alvo.getBoundingClientRect().top < topoFixo.current) irAoTopo(false);
  }, [irAoTopo]);

  const { mudarFiltros: aplicarFiltros, mudarOrdem: aplicarOrdem } = busca;
  // Os filtros e a ordem em vigor: a tela só sobe quando a busca muda de fato (um pop-up que fecha sem
  // mudança não mexe na rolagem). Quem decide se o pedido muda é o useBusca (sobre o estado mais recente).
  const vigente = useRef(busca.pedido);
  useEffect(() => {
    vigente.current = busca.pedido;
  }, [busca.pedido]);
  const mudarFiltros = useCallback(
    (f: Filtros) => {
      const mudou = !filtrosIguais(vigente.current.filtros, f);
      // texto novo na busca é como uma pesquisa nova: entra no histórico
      if (mudou && (f.q ?? "") !== (vigente.current.filtros.q ?? "")) marcarEntrada();
      aplicarFiltros(f);
      if (mudou) subirSeRolou();
    },
    [aplicarFiltros, subirSeRolou, marcarEntrada],
  );
  /** O painel "Todos os filtros" aplicado ("Mostrar N imóveis"): entra no histórico. */
  const aplicarPainel = useCallback(
    (f: Filtros) => {
      if (!filtrosIguais(vigente.current.filtros, f)) marcarEntrada();
      mudarFiltros(f);
    },
    [mudarFiltros, marcarEntrada],
  );
  /**
   * Na vista de mapa a barra de filtros trabalha sem a área do mapa (ela é da chave "Buscar ao mover o mapa"): o que a
   * barra muda volta com a área atual, menos quando muda o lugar ou o texto (aí a área sai, e o mapa enquadra o novo).
   */
  const comArea = useCallback(
    (f: Filtros): Filtros => {
      const atual = vigente.current.filtros;
      return atual.bbox && !mudouLugar(atual, f) ? { ...f, bbox: atual.bbox } : semArea(f);
    },
    [],
  );
  const mudarFiltrosMapa = useCallback((f: Filtros) => mudarFiltros(comArea(f)), [mudarFiltros, comArea]);
  const aplicarPainelMapa = useCallback((f: Filtros) => aplicarPainel(comArea(f)), [aplicarPainel, comArea]);
  /** "Buscar nesta área" (ou a câmera parou com a chave ligada): a lista passa a mostrar só a área; sem subir a tela. */
  const mudarArea = useCallback(
    (area: CaixaGeo | null) => aplicarFiltros(limparVazios({ ...vigente.current.filtros, bbox: area ?? undefined })),
    [aplicarFiltros],
  );
  const onOrdem = useCallback(
    (o: Ordem) => {
      const mudou = vigente.current.ordem !== o;
      aplicarOrdem(o);
      if (mudou) subirSeRolou();
    },
    [aplicarOrdem, subirSeRolou],
  );
  const irParaPagina = (p: number) => {
    if (p !== pedido.pagina) marcarEntrada();
    busca.irParaPagina(p);
    irAoTopo(true);
  };

  // ---- vista e mapa (salvos no navegador e na URL) ----
  const escolherVista = (v: Vista) => {
    if (v === vista) return;
    if (v === "mapa") {
      // o mapa é um modo de explorar: entra no histórico (o "voltar" volta à lista) e não vira a preferência salva
      if (vista !== "mapa") setVistaAnterior(vista);
      marcarEntrada();
      setRecolhida(false);
      setVistaEscolhida("mapa");
      return;
    }
    setVistaEscolhida(v);
    salvarPreferencias({ vista: v });
  };
  const escolherMapa = (visivel: boolean) => {
    setMapaEscolhido(visivel);
    salvarPreferencias({ mapa: visivel });
  };
  /**
   * Botão flutuante do celular: o mapa abre em tela cheia (MapaTelaCheia); "Ver lista" fecha e a lista está no
   * mesmo ponto (o diálogo trava a rolagem atrás). Com o mapa já em faixa no topo da lista (escolha salva, ou
   * ?mapa=1), o botão o esconde.
   */
  const alternarMapaCelular = () => {
    // com WebGL, o mapa de verdade (vista de mapa, com a lista na folha); sem ele, o mapa do Brasil em tela cheia
    if (!mapaVisivel && temWebGL()) escolherVista("mapa");
    else if (!mapaVisivel) setMapaCheio(true);
    else escolherMapa(false);
  };

  // ---- avisos, upgrade e favoritos ----
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const avisar = useCallback((texto: string) => setMensagem({ id: Date.now(), texto }), []);
  const [upgradeAberto, setUpgradeAberto] = useState(false);
  const [recursoUpgrade, setRecursoUpgrade] = useState<Recurso | null>(null);
  const abridorUpgrade = useRef<HTMLElement | null>(null);
  const lunetaRef = useRef<HTMLButtonElement>(null);
  /** a janela da Luneta, com o texto do recurso travado que a abriu (sem recurso: o texto padrão) */
  const onUpsell = useCallback((quem: HTMLElement | null, recurso?: Recurso | null) => {
    abridorUpgrade.current = quem;
    setRecursoUpgrade(recurso ?? null);
    setUpgradeAberto(true);
  }, []);
  const fecharUpgrade = useCallback(() => setUpgradeAberto(false), []);
  const mudarPlano = busca.mudarPlano;
  const assinar = (origem: "modal" | "aviso") => {
    mudarPlano("luneta");
    setUpgradeAberto(false);
    avisar(toastPlano(selosDesligados));
    // o aviso do Lente some com a troca: o foco vai para o botão "Luneta" do cabeçalho, agora ativo
    if (origem === "aviso") requestAnimationFrame(() => lunetaRef.current?.focus({ preventScroll: true }));
  };

  const { ehFavorito, alternar } = useFavoritos(conjunto);
  const onFavoritar = useCallback(
    (id: string) => {
      if (alternar(id)) avisar(TOAST_FAVORITO);
    },
    [alternar, avisar],
  );

  // ---- lista ↔ mapa ----
  const [loja] = useState(criarLojaDestaque);
  const planoDosDados = exibido?.plano ?? plano;
  const hrefImovel = useCallback((id: string) => rotaImovel(conjunto, id, planoDosDados), [conjunto, planoDosDados]);
  const filtros = pedido.filtros;
  const verSoCidade = useCallback(
    (p: PontoMapa) => {
      marcarEntrada();
      mudarFiltros(limparVazios({ ...filtros, uf: undefined, cidade: [p.chave], bairro: undefined }));
      loja.definirDoMapa(null);
    },
    [filtros, mudarFiltros, loja, marcarEntrada],
  );
  // com cidade escolhida, o mapa enquadra os resultados (não o estado inteiro)
  const ufsFoco = filtros.cidade?.length ? undefined : filtros.uf;

  const mapa = (variante: "painel" | "faixa", className = "") => (
    <AreaMapa
      variante={variante}
      pontos={busca.pontos}
      carregando={busca.carregandoMapa && busca.pontos !== null}
      erro={busca.erroMapa}
      onTentar={busca.tentarMapaDeNovo}
      loja={loja}
      ufsFoco={ufsFoco}
      onSelecionarCidade={verSoCidade}
      hrefImovel={hrefImovel}
      className={className}
      recolhivel={variante === "faixa"}
      // o mapa resumido leva ao mapa de verdade (no celular, o botão flutuante já leva)
      onExplorar={emMapa || glFalhou ? undefined : () => escolherVista("mapa")}
    />
  );

  // Onde o mapa fica. Na primeira pintura (padrão do aparelho ainda não conhecido), o CSS decide:
  // coluna a partir de lg; no celular, só se a pessoa ligou o mapa. Na vista de mapa, nunca em faixa.
  const classeColuna = mapaPedido === false ? "hidden" : "hidden lg:block";
  const classeFaixa = emMapa
    ? "hidden"
    : vista === "lista"
      ? mapaPedido === true
        ? "lg:hidden"
        : "hidden"
      : mapaPedido === true
        ? ""
        : mapaPedido === null
          ? "hidden lg:block"
          : "hidden";
  const comColuna = vista === "lista" && mapaPedido !== false;
  const largura = comColuna || emMapa ? "" : vista === "lista" ? LARGURA_LISTA : LARGURA_CARDS;

  // ---- vista de mapa (o mapa de verdade) ----
  /** Sem WebGL (ou o contexto caiu): no computador, o mapa do Brasil na coluna; no celular, em tela cheia. */
  const mapaFalhou = useCallback(() => {
    setGlFalhou(true);
    if (!window.matchMedia(CONSULTA_COMPUTADOR).matches) {
      setVistaEscolhida(vistaAnterior);
      setMapaCheio(true);
    }
  }, [vistaAnterior]);
  const filtrarCidadeDoMapa = useCallback(
    (chave: string) => {
      marcarEntrada();
      mudarFiltros(limparVazios({ ...vigente.current.filtros, uf: undefined, cidade: [chave], bairro: undefined, bbox: undefined }));
    },
    [mudarFiltros, marcarEntrada],
  );
  const explorar = (folga: Folga, compactoMapa: boolean) => (
    <Explorar
      conjunto={conjunto}
      plano={plano}
      filtros={filtros}
      camera={cameraMapa}
      cameraRestaurada={cameraRestaurada}
      folga={folga}
      compacto={compactoMapa}
      loja={loja}
      hrefImovel={hrefImovel}
      onCamera={setCameraMapa}
      onArea={mudarArea}
      onFiltrarCidade={filtrarCidadeDoMapa}
      onFalhou={mapaFalhou}
      totalLista={resultado ? total : null}
    />
  );

  const itens = resultado?.itens ?? [];
  const pilulasValendo = filtrosEfetivos(filtros, plano, selosDesligados);
  // um link da Luneta aberto no Lente (filtros avançados, ordem por nota...): o servidor ignora, e a tela avisa
  const gruposFora = gruposForaDoPlano(filtros, plano);
  const ordemFora = ordemPermitida(pedido.ordem, plano) ? null : pedido.ordem;
  // "2 quartos" escrito na busca é o filtro de quartos (Luneta): o servidor ignora essa parte no Lente (R4-VAZ-06)
  const quartosFora = filtros.q && !pode(plano, "filtrosAvancados") ? quartosDaBusca(filtros.q) : [];
  const recursosFora = new Set<Recurso>([
    ...gruposFora.map((g) => recursoDoGrupo(g) ?? "filtrosAvancados"),
    ...(quartosFora.length ? (["filtrosAvancados"] as const) : []),
    ...(ordemFora && RECURSO_DA_ORDEM[ordemFora] ? [RECURSO_DA_ORDEM[ordemFora]!] : []),
  ]);
  const semResultado = resultado !== null && !busca.carregando && !desenhando && total === 0;

  /** A página de resultados (avisos, lista, paginação): na coluna da lista, sozinha, ou na folha do mapa (celular). */
  const secao = (classeSecao: string) => (
    <section id="resultados" aria-labelledby="titulo-resultados" className={classeSecao}>
      <h2 id="titulo-resultados" ref={tituloLista} tabIndex={-1} className="sr-only">
        {resultado ? `Resultados, página ${resultado.pagina} de ${resultado.totalPaginas}` : "Resultados"}
      </h2>

      <div className={`mx-auto flex flex-col gap-5 ${largura}`}>
        {lente && <AvisoLente onAssinar={() => assinar("aviso")} />}

        {(gruposFora.length > 0 || ordemFora || quartosFora.length > 0) && (
          <AvisoForaDoPlano
            filtros={[
              ...pilulas(filtros, facetas)
                .filter((p) => gruposFora.includes(p.grupo))
                .map((p) => p.rotulo),
              ...quartosFora.map((c) => `${rotuloQuartosDaBusca(c)} (na busca)`),
            ]}
            ordem={ordemFora}
            onConhecer={(el) => onUpsell(el, recursosFora.size === 1 ? [...recursosFora][0] : null)}
            onTirar={() => {
              if (gruposFora.length || quartosFora.length) {
                const sem = gruposFora.length ? removerGrupos(filtros, gruposFora) : filtros;
                const q = quartosFora.length && sem.q ? semQuartos(sem.q) : sem.q;
                mudarFiltros(limparVazios({ ...sem, q: q || undefined }));
              }
              if (ordemFora) onOrdem(ORDEM_PADRAO);
            }}
          />
        )}

        {mapaVisivel && !mapaNaColuna ? <div className={classeFaixa}>{mapa("faixa")}</div> : null}

        {busca.erro && (
          <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-grave/45 bg-grave/[0.07] px-4 py-3">
            <p className="min-w-[200px] flex-1 text-sm text-luar">
              <strong className="font-semibold">Não foi possível {resultado ? "atualizar a lista" : "carregar os imóveis"}.</strong> {busca.erro}
            </p>
            <button type="button" onClick={busca.tentarDeNovo} className="btn-ghost !min-h-11 !px-4 !text-[13px] pointer-fine:!min-h-10">
              Tentar de novo
            </button>
          </div>
        )}

        {/* destino do "Pular para os resultados": a lista, depois do mapa em faixa */}
        <div id="lista-imoveis" tabIndex={-1} className="scroll-mt-[calc(var(--topo-h)+16px)] outline-none">
          {itens.length === 0 ? (
            // nada a mostrar ainda: esqueletos (primeira carga sem dados, ou saindo do estado vazio
            // para a busca nova); com erro, só o aviso acima; pronto e sem nada, o estado vazio
            busca.erro ? null : semResultado && emMapa && filtros.bbox ? (
              <VazioNaArea onBuscaInteira={() => mudarArea(null)} />
            ) : semResultado ? (
              <EstadoVazio
                filtros={pilulasValendo}
                nomes={facetas}
                contar={busca.contar}
                onChange={emMapa ? mudarFiltrosMapa : mudarFiltros}
                onLimparTudo={() => mudarFiltros({})}
              />
            ) : (
              <div className="@container">
                <ListaEsqueletos vista={vistaLista} quantidade={6} className={vistaLista === "cards" ? GRADE_CARDS : LISTA_LINHAS} />
              </div>
            )
          ) : (
            // lista anterior esmaecida enquanto a nova chega, ou se a nova falhou (o aviso diz que não atualizou)
            <div aria-busy={busca.carregando || desenhando} data-desatualizada={busca.erro ? "" : undefined} className={`${s.lista} @container`}>
              <ListaImoveis
                itens={itens}
                vista={vistaLista}
                plano={planoDosDados}
                conjunto={conjunto}
                ehFavorito={ehFavorito}
                onFavoritar={onFavoritar}
                onUpsell={onUpsell}
                loja={loja}
                pularForaDaTela={emMapa}
              />
            </div>
          )}
        </div>

        {/* a paginação entrando na tela tira o botão flutuante do mapa do caminho */}
        <div ref={fimDaLista} aria-hidden="true" className="h-px" />
        {resultado && total > 0 && (
          <Paginacao
            pagina={resultado.pagina}
            totalPaginas={resultado.totalPaginas}
            porPagina={resultado.porPagina}
            total={total}
            hrefDe={hrefPagina}
            onIr={irParaPagina}
            onTopo={() => irAoTopo(true)}
          />
        )}
      </div>
    </section>
  );

  return (
    // os RecursoLuneta de dentro (painel de filtros) abrem a mesma janela da Luneta
    <ProvedorPedirLuneta value={onUpsell}>
      <div
        ref={raiz}
        className="[--cab-h:0px] [--faixa-v:0px] [--topo-h:136px] lg:[--topo-h:125px] [@media(min-width:64rem)_and_(min-height:50.0625rem)]:[--cab-h:65px] [@media(min-width:64rem)_and_(min-height:50.0625rem)]:[--topo-h:190px]"
      >
        <a
          href="#lista-imoveis"
          className="fixed top-2 left-2 z-[70] -translate-y-24 rounded-full bg-latao px-4 py-2.5 text-sm font-semibold text-noite-fixa transition-transform focus:translate-y-0 focus-visible:outline-noite-fixa"
        >
          Pular para os resultados
        </a>
        {emMapa && !glFalhou && (
          // no computador o mapa vem depois dos 24 cartões (~50 paradas do Tab): este atalho vai direto a ele
          <a
            href="#mapa-explorar"
            onClick={(e) => {
              const canvas = document.querySelector<HTMLElement>("#mapa-explorar .maplibregl-canvas");
              if (!canvas) return;
              e.preventDefault();
              canvas.focus();
            }}
            className="fixed top-2 left-2 z-[70] -translate-y-24 rounded-full bg-latao px-4 py-2.5 text-sm font-semibold text-noite-fixa transition-transform focus:translate-y-0 focus-visible:outline-noite-fixa"
          >
            Pular para o mapa
          </a>
        )}

        <Cabecalho
          plano={plano}
          onPlano={mudarPlano}
          titulo={textos.titulo}
          area={textos.area}
          faixa={faixa}
          lunetaRef={lunetaRef}
          cabecalhoRef={cabecalho}
        />

        <main id="conteudo">
          <div ref={sentinela} aria-hidden="true" className="h-px" />
          {/* a barra (sticky): por fora, só a posição, o recolher e a altura reservada quando compacta (transparente
              e sem receber cliques); por dentro, a superfície visível */}
          <div
            ref={barra}
            data-colada={colada ? "" : undefined}
            data-recolhida={recolhida ? "" : undefined}
            onFocusCapture={() => setRecolhida(false)}
            style={compacta ? { minHeight: compacta.altura } : undefined}
            className={`group/barra sticky top-[var(--cab-h)] z-30 transition-[translate] duration-200 ease-luneta data-[recolhida]:-translate-y-[calc(100%+2px)] motion-reduce:transition-none ${compacta ? "pointer-events-none" : ""}`}
          >
            <div
              ref={barraVisivel}
              className="pointer-events-auto relative border-b border-transparent bg-noite/90 px-4 py-2.5 backdrop-blur-md sm:py-3 transition-[box-shadow,border-color] duration-200 ease-luneta group-data-[colada]/barra:border-nevoa/15 group-data-[colada]/barra:shadow-[0_12px_30px_-14px_rgba(0,0,0,.7)] group-data-[recolhida]/barra:shadow-none motion-reduce:transition-none sm:px-6 lg:px-8 [[data-theme=light]_&]:group-data-[colada]/barra:shadow-[0_10px_28px_-14px_rgba(15,24,48,.28)]"
            >
              <div className={`mx-auto ${largura}`}>
                <BarraFiltros
                  // na vista de mapa, a área do mapa fica com a chave "Buscar ao mover o mapa" (sem pílula aqui)
                  filtros={emMapa ? semArea(filtros) : filtros}
                  facetas={facetas}
                  total={total}
                  carregando={busca.carregando}
                  plano={plano}
                  selosDesligados={selosDesligados}
                  ordem={pedido.ordem}
                  onOrdem={onOrdem}
                  onChange={emMapa ? mudarFiltrosMapa : mudarFiltros}
                  onAplicarPainel={emMapa ? aplicarPainelMapa : aplicarPainel}
                  onUpsell={onUpsell}
                  contar={busca.contar}
                  consultar={busca.consultar}
                  compacta={!!compacta}
                  // celular: Lista | Cards num ícone no fim da linha da busca (na linha do total, em 360 px, ele
                  // caía sozinho numa terceira linha)
                  acoesBusca={<SeletorVista vista={vista} onVista={escolherVista} mapa={mapaVisivel} onMapa={escolherMapa} anterior={vistaAnterior} apenasAlternar />}
                  acoes={
                    <SeletorVista
                      vista={vista}
                      onVista={escolherVista}
                      mapa={mapaVisivel}
                      onMapa={escolherMapa}
                      anterior={vistaAnterior}
                      // no celular o mapa tem o botão flutuante: aqui só Lista | Cards, em ícones de 44 px
                      semMapaCelular
                      // em telas médias e no celular só os ícones (o nome fica para leitores de tela e na dica do mouse)
                      rotuloClassName="max-lg:sr-only"
                    />
                  }
                />
              </div>
              <div aria-hidden="true" data-ativo={busca.carregando ? "" : undefined} className={s.progresso} />
            </div>
          </div>

          {mapaNaFolha ? (
            // celular e tablet: o mapa abaixo da barra e a lista numa folha que se puxa por cima dele
            <FolhaMapa
              barra={barraVisivel}
              mapa={(espiada) => explorar(folgaDaFolha(espiada), true)}
              titulo={
                <span className="block">
                  <span className="block font-display text-[16px] leading-tight font-bold text-luar tabular-nums">
                    {resultado ? plural(total, "imóvel", "imóveis") : "Imóveis"}
                    {filtros.bbox ? " nesta área" : ""}
                  </span>
                  <span className="block text-[12.5px] text-nevoa">{filtros.bbox ? "A lista segue o mapa" : "Toda a busca"}</span>
                </span>
              }
            >
              {secao("min-w-0 pt-1")}
            </FolhaMapa>
          ) : emMapa ? (
            // computador: a lista em cards à esquerda e o mapa de verdade (ou o do Brasil, sem WebGL) à direita
            <div className="lg:grid lg:grid-cols-[minmax(400px,42%)_minmax(0,1fr)] xl:grid-cols-[minmax(440px,40%)_minmax(0,1fr)]">
              {secao("min-w-0 px-4 pt-3 pb-16 sm:px-6 sm:pt-5 lg:px-6")}
              <div className="sticky top-[var(--topo-h)] hidden h-[calc(100svh-var(--topo-h)-var(--faixa-v))] self-start border-l border-nevoa/12 lg:block">
                {glFalhou ? mapa("painel") : explorar(FOLGA_COLUNA, false)}
              </div>
            </div>
          ) : (
            // coluna do mapa: ~40% (36% em 1024 px, para a linha ainda caber com a foto ao lado)
            <div className={comColuna ? "lg:grid lg:grid-cols-[minmax(0,1fr)_36%] xl:grid-cols-[minmax(0,1fr)_40%]" : ""}>
              {secao("min-w-0 px-4 pt-3 pb-16 sm:px-6 sm:pt-5 lg:px-8")}
              {vista === "lista" && (
                <div className={`${classeColuna} sticky top-[var(--topo-h)] h-[calc(100svh-var(--topo-h)-var(--faixa-v))] self-start border-l border-nevoa/12`}>
                  {mapaVisivel && mapaNaColuna ? mapa("painel") : null}
                </div>
              )}
            </div>
          )}
        </main>

        {rodape}

        <MapaTelaCheia aberto={telaCheia} onFechar={() => setMapaCheio(false)} cidades={busca.pontos?.length ?? null} total={total}>
          {mapa("painel", "h-full")}
        </MapaTelaCheia>

        {/* Celular: o mapa liga e desliga num botão flutuante (a barra fixa fica com duas linhas só); sai do caminho
            quando a paginação aparece. Abaixo dos pop-ups (z-20): um pop-up de filtro, de ordem ou de tag que desce
            até o pé da tela fica por cima dele, e o botão some enquanto houver um aberto. */}
        {!emMapa && (
        <button
          type="button"
          onClick={alternarMapaCelular}
          className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 inline-flex min-h-12 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full bg-luar px-5 text-[15px] font-semibold text-noite shadow-[0_14px_36px_rgba(0,0,0,.45)] transition-[opacity,translate,scale] duration-200 ease-luneta active:scale-[0.96] motion-reduce:transition-none sm:hidden [body:has([data-popover])_&]:pointer-events-none [body:has([data-popover])_&]:opacity-0 ${
            botaoMapaVisivel ? "" : "pointer-events-none translate-y-4 opacity-0"
          }`}
          tabIndex={botaoMapaVisivel ? undefined : -1}
          aria-hidden={!botaoMapaVisivel || undefined}
        >
          {mapaVisivel ? <IconeLista /> : <IconeMapa />}
          {mapaVisivel ? "Esconder mapa" : "Ver no mapa"}
        </button>
        )}

        <UpgradeModal open={upgradeAberto} recurso={recursoUpgrade} openerRef={abridorUpgrade} onClose={fecharUpgrade} onUpgrade={() => assinar("modal")} />
        <Toast mensagem={mensagem} />
      </div>
    </ProvedorPedirLuneta>
  );
}

/** Vista de mapa, nenhum imóvel na área visível (com resultados fora dela). */
function VazioNaArea({ onBuscaInteira }: { onBuscaInteira: () => void }) {
  return (
    <div className="rounded-3xl border border-nevoa/15 bg-tinta px-5 py-7 text-center">
      <p className="font-display text-[17px] font-bold text-luar">Nenhum imóvel nesta parte do mapa</p>
      <p className="mx-auto mt-1.5 max-w-[340px] text-[14px] leading-relaxed text-nevoa">
        Afaste o mapa ou arraste para outra região. A lista segue o que está à vista.
      </p>
      <button type="button" onClick={onBuscaInteira} className="btn-outline mt-4 !min-h-11 !px-5 !text-[14px]">
        Ver a busca inteira
      </button>
    </div>
  );
}

/**
 * A página de resultados. Memorizada: o mouse sobre os cartões (que acende o mapa) e a contagem da barra não a
 * redesenham; cada cartão lê da loja só se a cidade dele está acesa pelo mapa.
 */
const ListaImoveis = memo(function ListaImoveis({
  itens,
  vista,
  plano,
  conjunto,
  ehFavorito,
  onFavoritar,
  onUpsell,
  loja,
  pularForaDaTela = false,
}: {
  itens: ImovelResumo[];
  vista: Vista;
  plano: Plano;
  conjunto: Conjunto;
  ehFavorito: (id: string) => boolean;
  onFavoritar: (id: string) => void;
  onUpsell: (quem: HTMLElement, recurso?: Recurso | null) => void;
  loja: LojaDestaque;
  /**
   * Vista de mapa: o navegador não calcula o layout dos cartões fora da tela (content-visibility). No celular a lista
   * fica quase toda escondida sob a folha, e o layout dos 24 cartões novos a cada parada do mapa levava ~140 ms (CPU 4×).
   */
  pularForaDaTela?: boolean;
}) {
  // Página nova sob o mouse parado: o cartão que acendia a cidade saiu sem "pointerleave". O mapa apaga.
  useEffect(() => () => loja.definirDaLista(null), [itens, loja]);
  return (
    <ul aria-label="Imóveis" className={vista === "cards" ? GRADE_CARDS : LISTA_LINHAS}>
      {itens.map((imovel, i) => (
        <li key={imovel.id} className={pularForaDaTela ? "min-w-0 [contain-intrinsic-size:auto_200px] [content-visibility:auto]" : "min-w-0"}>
          <ItemImovel
            imovel={imovel}
            vista={vista}
            plano={plano}
            href={rotaImovel(conjunto, imovel.id, plano)}
            favorito={ehFavorito(imovel.id)}
            onFavoritar={onFavoritar}
            onUpsell={onUpsell}
            loja={loja}
            // primeira dobra: as fotos carregam já (as demais, ao chegar perto da tela)
            eager={i < (vista === "cards" ? 4 : 3)}
          />
        </li>
      ))}
    </ul>
  );
});

const ItemImovel = memo(function ItemImovel({
  imovel,
  vista,
  plano,
  href,
  favorito,
  onFavoritar,
  onUpsell,
  loja,
  eager,
}: {
  imovel: ImovelResumo;
  vista: Vista;
  plano: Plano;
  href: string;
  favorito: boolean;
  onFavoritar: (id: string) => void;
  onUpsell: (quem: HTMLElement, recurso?: Recurso | null) => void;
  loja: LojaDestaque;
  eager: boolean;
}) {
  const cidade = `${imovel.uf}|${imovel.cidade}`;
  const ativo = useAcesoPeloMapa(loja, cidade, imovel.id);
  const { lat, lon } = imovel;
  const nivel = nivelDaPrecisao(imovel.precisaoGeo);
  const onHover = useCallback(
    (id: string | null) => {
      loja.definirDaLista(id ? cidade : null);
      // mapa de verdade: o lugar deste imóvel ganha o destaque (anel; no bairro, a área: nunca um ponto exato)
      loja.definirImovel(id && lat !== null && lon !== null ? { id, lat, lon, nivel } : null);
    },
    [loja, cidade, lat, lon, nivel],
  );
  const props = { imovel, plano, hrefImovel: href, favorito, onFavoritar, onUpsell, onHover, ativo, eager };
  return vista === "cards" ? <CartaoImovel {...props} /> : <LinhaImovel {...props} />;
});
