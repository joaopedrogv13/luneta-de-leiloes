"use client";

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { UpgradeModal } from "@/components/assinante/UpgradeModal";
import { filtrosEfetivos, filtrosIguais, limparVazios } from "@/lib/catalogo/filtros-rotulos";
import { chaveUltimaBusca, rotaImovel, ROTA_LISTA } from "@/lib/catalogo/rotas";
import type { Conjunto, Facetas, Filtros, ImovelResumo, Ordem, Plano, PontoMapa, ResultadoBusca } from "@/lib/catalogo/tipos";
import { lerBusca, type Vista } from "@/lib/catalogo/url";
import { AreaMapa } from "./app/AreaMapa";
import { AvisoLente, Toast, type Mensagem } from "./app/Avisos";
import s from "./app/catalogo.module.css";
import { chaveDoEstado, enderecoPagina, type PedidoLista } from "./app/consultas";
import { EstadoVazio } from "./app/EstadoVazio";
import { criarLojaDestaque, salvarPreferencias, useAcesoPeloMapa, useMidia, usePreferencias, type LojaDestaque } from "./app/hooks";
import { Paginacao } from "./app/Paginacao";
import { CONSULTA_COMPUTADOR, CONSULTA_CELULAR, type Preferencias } from "./app/preferencias";
import { Cabecalho, type FaixaAviso } from "./Cabecalho";
import { CartaoImovel, LinhaImovel, ListaEsqueletos, SeletorVista } from "./cartoes";
import { IconeLista, IconeMapa } from "./cartoes/icones";
import { BarraFiltros } from "./filtros";
import { semMovimento } from "./ui/useAdiado";
import { useBusca } from "./useBusca";
import { useFavoritos } from "./useFavoritos";

const TOAST_FAVORITO = "Você será avisado por e-mail quando a praça mudar (demonstração).";
/** Na prévia os selos estão desligados (critérios pendentes): o aviso não promete o que não aparece. */
const toastPlano = (selosDesligados: boolean) =>
  selosDesligados
    ? "Plano Luneta ativado nesta demonstração: tags de risco à vista (selos ainda em análise). Nenhuma cobrança foi feita."
    : "Plano Luneta ativado nesta demonstração: tags e selos à vista. Nenhuma cobrança foi feita.";

/** Facetas vazias (só até a primeira resposta, quando o servidor não conseguiu buscar). */
const FACETAS_VAZIAS: Facetas = {
  uf: [], cidade: [], bairro: [], tipo: [], modalidade: [], praca: [], ocupacao: [], natureza: [], fonte: [], tags: [], selo: [],
  lance: null, avaliacao: null, desagio: null, lanceM2: null, area: null, financiamento: 0, fgts: 0, parcelamento: 0, comFoto: 0,
};

/** Grade dos cards: 1 a 4 colunas pela largura da área (cada cartão com pelo menos 300 px). */
const GRADE_CARDS = "grid grid-cols-1 gap-4 sm:gap-5 @min-[620px]:grid-cols-2 @min-[940px]:grid-cols-3 @min-[1260px]:grid-cols-4";
const LISTA_LINHAS = "flex flex-col gap-4";

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
 * Estado na URL (history.replaceState: compartilhar o link reabre a mesma busca; o "Voltar à busca" da página
 * do imóvel usa a última URL guardada no sessionStorage). A vista e o mapa seguem a escolha da pessoa
 * (salva no navegador) ou o padrão do aparelho: lista com o mapa ao lado no computador, cards no celular.
 */
export function CatalogoApp({ conjunto, servidor, preferencias, palpiteCelular, selosDesligados, textos, faixa, rodape }: PropsCatalogoApp) {
  // Ao voltar pelo navegador, o Next pode montar a página antiga (do cache) com a URL nova: vale a URL.
  // Na hidratação a URL é a que o servidor leu, e o estado é o do servidor (o HTML bate).
  const [inicio] = useState(() => {
    const doServidor = { pedido: servidor.pedido, vista: servidor.vista, mapa: servidor.mapa };
    if (typeof window === "undefined") return doServidor;
    const e = lerBusca(new URLSearchParams(window.location.search));
    if (chaveDoEstado(e) === servidor.chaveUrl) return doServidor;
    return { pedido: { filtros: e.filtros, ordem: e.ordem, pagina: e.pagina, plano: e.plano }, vista: e.vista, mapa: e.mapa };
  });

  // ---- vista e mapa: escolha explícita (URL ou botão) > preferência salva > padrão do aparelho ----
  const [vistaEscolhida, setVistaEscolhida] = useState<Vista | null>(inicio.vista);
  const [mapaEscolhido, setMapaEscolhido] = useState<boolean | null>(inicio.mapa);
  const pref = usePreferencias(preferencias);
  const celular = useMidia(CONSULTA_CELULAR, palpiteCelular);
  const computador = useMidia(CONSULTA_COMPUTADOR, !palpiteCelular);
  const vista: Vista = vistaEscolhida ?? pref.vista ?? (celular ? "cards" : "lista");
  /** null = padrão do aparelho (o CSS decide na primeira pintura: visível a partir de lg) */
  const mapaPedido = mapaEscolhido ?? pref.mapa;
  const mapaVisivel = mapaPedido ?? computador;
  const mapaNaColuna = vista === "lista" && computador;

  const busca = useBusca({
    conjunto,
    servidor: { pedido: servidor.pedido, resultado: servidor.resultado },
    pedidoInicial: inicio.pedido,
    selosDesligados,
    mapaVisivel,
  });
  const { pedido } = busca;
  const plano = pedido.plano;
  const lente = plano === "lente";
  const exibido = busca.exibido;
  const resultado = exibido?.resultado ?? null;
  const facetas = resultado?.facetas ?? FACETAS_VAZIAS;
  const total = resultado?.total ?? 0;

  // ---- URL e última busca (para o "Voltar à busca" da página do imóvel) ----
  const caminho = ROTA_LISTA[conjunto];
  const endereco = enderecoPagina(caminho, { ...pedido, vista: vistaEscolhida, mapa: mapaEscolhido });
  useEffect(() => {
    if (window.location.pathname + window.location.search !== endereco) window.history.replaceState(null, "", endereco);
    try {
      window.sessionStorage.setItem(chaveUltimaBusca(conjunto), endereco);
    } catch {
      // sem sessionStorage: o "Voltar à busca" leva à lista sem filtros
    }
  }, [endereco, conjunto]);
  const hrefPagina = (p: number) => enderecoPagina(caminho, { ...pedido, pagina: p, vista: vistaEscolhida, mapa: mapaEscolhido });

  // ---- partes fixas (cabeçalho no computador + barra de filtros): alturas e sombra quando colada ----
  // --cab-h: onde a barra para (abaixo do cabeçalho fixo; 0 no celular); --topo-h: cabeçalho + barra
  // (a coluna do mapa começa ali e ocupa o resto da tela; o foco do Tab para abaixo disso); --faixa-v: quanto
  // da faixa de aviso ainda aparece acima do cabeçalho fixo (só no topo da página).
  const raiz = useRef<HTMLDivElement>(null);
  const cabecalho = useRef<HTMLElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const sentinela = useRef<HTMLDivElement>(null);
  const topoFixo = useRef(0);
  const cabFixo = useRef(0);
  const [colada, setColada] = useState(false);
  /** celular: a barra sai de cena ao rolar para baixo e volta ao rolar para cima (a lista ganha a tela) */
  const [recolhida, setRecolhida] = useState(false);
  useEffect(() => {
    const r = raiz.current;
    const b = barra.current;
    const c = cabecalho.current;
    const marco = sentinela.current;
    if (!r || !b || !c || !marco) return;
    const html = document.documentElement;
    const antes = html.style.scrollPaddingTop;
    const celularMq = window.matchMedia(CONSULTA_CELULAR);
    let quadro = 0;
    let ultimoY = window.scrollY;
    let faixaAntes = -1;
    const verColada = () => {
      quadro = 0;
      // o marco (1 px logo acima da barra) passou por baixo do cabeçalho fixo: a barra está colada
      const estaColada = marco.getBoundingClientRect().bottom < cabFixo.current + 0.5;
      setColada(estaColada);
      // Faixa de aviso ainda à vista acima do cabeçalho fixo (topo da página): a coluna do mapa encolhe o
      // mesmo tanto, para caber inteira na tela (com a legenda) desde a primeira pintura.
      const faixa = cabFixo.current ? Math.max(0, Math.round(c.getBoundingClientRect().top)) : 0;
      if (faixa !== faixaAntes) {
        faixaAntes = faixa;
        r.style.setProperty("--faixa-v", `${faixa}px`);
      }
      const y = window.scrollY;
      const dy = y - ultimoY;
      if (Math.abs(dy) < 6) return;
      ultimoY = y;
      // nunca some com algo aberto ou em uso dentro dela (busca digitando, pop-up de filtro)
      const emUso = b.contains(document.activeElement) || !!b.querySelector("[aria-expanded=true]");
      setRecolhida(celularMq.matches && estaColada && dy > 0 && y > marco.offsetTop + 240 && !emUso);
    };
    const medir = () => {
      const cab = getComputedStyle(c).position === "sticky" ? Math.round(c.getBoundingClientRect().height) : 0;
      const topo = cab + Math.round(b.getBoundingClientRect().height);
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
    ro.observe(b);
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

  // ---- rodapé à vista (o botão flutuante do mapa sai do caminho) ----
  const fimDaPagina = useRef<HTMLDivElement>(null);
  const [rodapeVisivel, setRodapeVisivel] = useState(false);
  useEffect(() => {
    const el = fimDaPagina.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setRodapeVisivel(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
      aplicarFiltros(f);
      if (mudou) subirSeRolou();
    },
    [aplicarFiltros, subirSeRolou],
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
    busca.irParaPagina(p);
    irAoTopo(true);
  };

  // ---- vista e mapa (salvos no navegador e na URL) ----
  const escolherVista = (v: Vista) => {
    setVistaEscolhida(v);
    salvarPreferencias({ vista: v });
  };
  const escolherMapa = (visivel: boolean) => {
    setMapaEscolhido(visivel);
    salvarPreferencias({ mapa: visivel });
  };
  /** Botão flutuante do celular: o mapa abre em faixa no topo da lista, e a tela vai até ele. */
  const alternarMapaCelular = () => {
    const ligar = !mapaVisivel;
    escolherMapa(ligar);
    if (ligar) requestAnimationFrame(() => irAoTopo(false));
  };

  // ---- avisos, upgrade e favoritos ----
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const avisar = useCallback((texto: string) => setMensagem({ id: Date.now(), texto }), []);
  const [upgradeAberto, setUpgradeAberto] = useState(false);
  const abridorUpgrade = useRef<HTMLElement | null>(null);
  const lunetaRef = useRef<HTMLButtonElement>(null);
  const onUpsell = useCallback((quem: HTMLElement) => {
    abridorUpgrade.current = quem;
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
      mudarFiltros(limparVazios({ ...filtros, uf: undefined, cidade: [p.chave], bairro: undefined }));
      loja.definirDoMapa(null);
    },
    [filtros, mudarFiltros, loja],
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
    />
  );

  // Onde o mapa fica. Na primeira pintura (padrão do aparelho ainda não conhecido), o CSS decide:
  // coluna a partir de lg; no celular, só se a pessoa ligou o mapa.
  const classeColuna = mapaPedido === false ? "hidden" : "hidden lg:block";
  const classeFaixa =
    vista === "lista" ? (mapaPedido === true ? "lg:hidden" : "hidden") : mapaPedido === true ? "" : mapaPedido === null ? "hidden lg:block" : "hidden";
  const comColuna = vista === "lista" && mapaPedido !== false;

  const itens = resultado?.itens ?? [];
  const pilulasValendo = filtrosEfetivos(filtros, plano, selosDesligados);
  const semResultado = resultado !== null && !busca.carregando && total === 0;

  return (
    <div ref={raiz} className="[--cab-h:0px] [--faixa-v:0px] [--topo-h:136px] lg:[--cab-h:65px] lg:[--topo-h:190px]">
      <a
        href="#resultados"
        className="fixed top-2 left-2 z-[70] -translate-y-24 rounded-full bg-latao px-4 py-2.5 text-sm font-semibold text-noite-fixa transition-transform focus:translate-y-0 focus-visible:outline-noite-fixa"
      >
        Pular para os resultados
      </a>

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
        <div
          ref={barra}
          data-colada={colada ? "" : undefined}
          data-recolhida={recolhida ? "" : undefined}
          onFocusCapture={() => setRecolhida(false)}
          className="sticky top-[var(--cab-h)] z-30 border-b border-transparent bg-noite/90 px-4 py-3 backdrop-blur-md transition-[box-shadow,border-color,translate] duration-200 ease-luneta data-[colada]:border-nevoa/15 data-[colada]:shadow-[0_12px_30px_-14px_rgba(0,0,0,.7)] data-[recolhida]:-translate-y-[calc(100%+2px)] data-[recolhida]:shadow-none motion-reduce:transition-none sm:px-6 lg:px-8 [[data-theme=light]_&]:data-[colada]:shadow-[0_10px_28px_-14px_rgba(15,24,48,.28)]"
        >
          <BarraFiltros
            filtros={filtros}
            facetas={facetas}
            total={total}
            carregando={busca.carregando}
            plano={plano}
            selosDesligados={selosDesligados}
            ordem={pedido.ordem}
            onOrdem={onOrdem}
            onChange={mudarFiltros}
            onUpsell={onUpsell}
            contar={busca.contar}
            consultar={busca.consultar}
            acoes={
              <SeletorVista
                vista={vista}
                onVista={escolherVista}
                mapa={mapaVisivel}
                onMapa={escolherMapa}
                // no celular lista e cards são o mesmo cartão em coluna, e o mapa tem o botão flutuante
                className="max-sm:hidden"
                // em telas médias só os ícones (o nome fica para leitores de tela e na dica do mouse)
                rotuloClassName="max-lg:sr-only"
              />
            }
          />
          <div aria-hidden="true" data-ativo={busca.carregando ? "" : undefined} className={s.progresso} />
        </div>

        {/* coluna do mapa: ~40% (36% em 1024 px, para a linha ainda caber com a foto ao lado) */}
        <div className={comColuna ? "lg:grid lg:grid-cols-[minmax(0,1fr)_36%] xl:grid-cols-[minmax(0,1fr)_40%]" : ""}>
          <section id="resultados" aria-labelledby="titulo-resultados" className="min-w-0 px-4 pt-5 pb-16 sm:px-6 lg:px-8">
            <h2 id="titulo-resultados" ref={tituloLista} tabIndex={-1} className="sr-only">
              {resultado ? `Resultados, página ${resultado.pagina} de ${resultado.totalPaginas}` : "Resultados"}
            </h2>

            <div className={`mx-auto flex flex-col gap-5 ${comColuna ? "" : vista === "lista" ? "max-w-[1180px]" : "max-w-[1680px]"}`}>
              {lente && <AvisoLente onAssinar={() => assinar("aviso")} />}

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

              {itens.length === 0 ? (
                // nada a mostrar ainda: esqueletos (primeira carga sem dados, ou saindo do estado vazio
                // para a busca nova); com erro, só o aviso acima; pronto e sem nada, o estado vazio
                busca.erro ? null : semResultado ? (
                  <EstadoVazio
                    filtros={pilulasValendo}
                    nomes={facetas}
                    contar={busca.contar}
                    onChange={mudarFiltros}
                    onLimparTudo={() => mudarFiltros({})}
                  />
                ) : (
                  <div className="@container">
                    <ListaEsqueletos vista={vista} quantidade={6} className={vista === "cards" ? GRADE_CARDS : LISTA_LINHAS} />
                  </div>
                )
              ) : (
                // lista anterior esmaecida enquanto a nova chega, ou se a nova falhou (o aviso diz que não atualizou)
                <div aria-busy={busca.carregando} data-desatualizada={busca.erro ? "" : undefined} className={`${s.lista} @container`}>
                  <ListaImoveis
                    itens={itens}
                    vista={vista}
                    plano={planoDosDados}
                    conjunto={conjunto}
                    ehFavorito={ehFavorito}
                    onFavoritar={onFavoritar}
                    onUpsell={onUpsell}
                    loja={loja}
                  />
                </div>
              )}

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

          {vista === "lista" && (
            <div className={`${classeColuna} sticky top-[var(--topo-h)] h-[calc(100svh-var(--topo-h)-var(--faixa-v))] self-start border-l border-nevoa/12`}>
              {mapaVisivel && mapaNaColuna ? mapa("painel") : null}
            </div>
          )}
        </div>
      </main>

      <div ref={fimDaPagina}>{rodape}</div>

      {/* celular: o mapa liga e desliga num botão flutuante (a barra fixa fica com duas linhas só);
          sai do caminho quando o rodapé aparece */}
      <button
        type="button"
        onClick={alternarMapaCelular}
        className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-40 inline-flex min-h-12 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full bg-luar px-5 text-[15px] font-semibold text-noite shadow-[0_14px_36px_rgba(0,0,0,.45)] transition-[opacity,translate,scale] duration-200 ease-luneta active:scale-[0.96] motion-reduce:transition-none sm:hidden ${
          rodapeVisivel ? "pointer-events-none translate-y-4 opacity-0" : ""
        }`}
        tabIndex={rodapeVisivel ? -1 : undefined}
        aria-hidden={rodapeVisivel || undefined}
      >
        {mapaVisivel ? <IconeLista /> : <IconeMapa />}
        {mapaVisivel ? "Esconder mapa" : "Ver no mapa"}
      </button>

      <UpgradeModal open={upgradeAberto} openerRef={abridorUpgrade} onClose={fecharUpgrade} onUpgrade={() => assinar("modal")} />
      <Toast mensagem={mensagem} />
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
}: {
  itens: ImovelResumo[];
  vista: Vista;
  plano: Plano;
  conjunto: Conjunto;
  ehFavorito: (id: string) => boolean;
  onFavoritar: (id: string) => void;
  onUpsell: (quem: HTMLElement) => void;
  loja: LojaDestaque;
}) {
  // Página nova sob o mouse parado: o cartão que acendia a cidade saiu sem "pointerleave". O mapa apaga.
  useEffect(() => () => loja.definirDaLista(null), [itens, loja]);
  return (
    <ul aria-label="Imóveis" className={vista === "cards" ? GRADE_CARDS : LISTA_LINHAS}>
      {itens.map((imovel, i) => (
        <li key={imovel.id} className="min-w-0">
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
            eager={i < (vista === "cards" ? 4 : 2)}
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
  onUpsell: (quem: HTMLElement) => void;
  loja: LojaDestaque;
  eager: boolean;
}) {
  const cidade = `${imovel.uf}|${imovel.cidade}`;
  const ativo = useAcesoPeloMapa(loja, cidade);
  const onHover = useCallback((id: string | null) => loja.definirDaLista(id ? cidade : null), [loja, cidade]);
  const props = { imovel, plano, hrefImovel: href, favorito, onFavoritar, onUpsell, onHover, ativo, eager };
  return vista === "cards" ? <CartaoImovel {...props} /> : <LinhaImovel {...props} />;
});
