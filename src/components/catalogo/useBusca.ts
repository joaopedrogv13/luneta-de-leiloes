"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { filtrosIguais, limparVazios } from "@/lib/catalogo/filtros-rotulos";
import type { Conjunto, Filtros, Ordem, Plano, PontoMapa, ResultadoBusca } from "@/lib/catalogo/tipos";
import { chaveMapa, consultaContagem, consultaLista, consultaMapa, urlApi, type PedidoLista } from "./app/consultas";
import type { Consulta } from "./filtros/tipos";

/**
 * Estado da busca do catálogo no navegador: o pedido (filtros, ordem, página, plano), a página de
 * resultados e os pontos do mapa, buscados na API (/api/catalogo) a cada mudança.
 *
 * - A primeira pintura vem do servidor (`servidor`); daí em diante, cada mudança pede a API com
 *   AbortController (o pedido anterior é cancelado). Texto da busca mudando seguido espera 300 ms (a
 *   primeira mudança vai na hora: o campo só aplica o texto no Enter).
 * - Enquanto carrega, a lista anterior continua na tela (`carregando`); sem nada para mostrar (voltar do
 *   navegador para uma busca que não está no cache), `resultado` é null e o app mostra os esqueletos.
 * - Cache por consulta (lista, mapa, contagem): voltar a uma busca já vista é instantâneo.
 * - O mapa vem num pedido à parte e só quando está visível (`mapaVisivel`): a lista chega antes, e trocar de
 *   página ou de ordem não pede o mapa de novo.
 */

/** Um resultado com o plano em que foi pedido (os cartões desenham conforme o plano dos dados). */
export interface ResultadoExibido {
  chave: string;
  plano: Plano;
  resultado: ResultadoBusca;
}

/** Cache pequeno (o mais antigo sai primeiro) que avisa quem o usa quando algo entra. */
class Guardado<T> {
  private itens = new Map<string, T>();
  private ouvintes = new Set<() => void>();
  constructor(private limite: number) {}
  get(chave: string): T | undefined {
    return this.itens.get(chave);
  }
  set(chave: string, valor: T) {
    this.itens.delete(chave);
    this.itens.set(chave, valor);
    while (this.itens.size > this.limite) {
      const maisAntigo = this.itens.keys().next().value;
      if (maisAntigo === undefined) break;
      this.itens.delete(maisAntigo);
    }
    for (const avisar of this.ouvintes) avisar();
  }
  assinar = (avisar: () => void) => {
    this.ouvintes.add(avisar);
    return () => {
      this.ouvintes.delete(avisar);
    };
  };
}

// Por conjunto e plano dentro da própria chave; vivem enquanto a aba estiver aberta (sobrevivem a ir ao
// imóvel e voltar). O mapa do Brasil inteiro tem ~700 KB: poucos guardados.
const cacheLista = new Guardado<ResultadoExibido>(40);
const cacheMapa = new Guardado<PontoMapa[]>(6);
const cacheContagem = new Guardado<Consulta>(80);

/** Espera (ms) quando o texto da busca muda várias vezes seguidas. */
const ESPERA_TEXTO = 300;

export class ErroApi extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

async function pedirJson<T>(url: string, sinal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal: sinal, headers: { accept: "application/json" } });
  if (!r.ok) {
    let mensagem = "Não foi possível carregar os imóveis.";
    try {
      const corpo = (await r.json()) as { erro?: string };
      if (corpo.erro) mensagem = corpo.erro;
    } catch {
      // corpo sem JSON: fica a mensagem padrão
    }
    throw new ErroApi(mensagem, r.status);
  }
  return (await r.json()) as T;
}

const textoDoErro = (e: unknown) =>
  e instanceof ErroApi
    ? e.message
    : "Sem conexão com o servidor. Confira a internet e tente de novo.";

export interface OpcoesBusca {
  conjunto: Conjunto;
  /** o que o servidor desenhou (resultado null: o servidor não conseguiu buscar) */
  servidor: { pedido: PedidoLista; resultado: ResultadoBusca | null };
  /** o pedido para começar: o do servidor ou, ao voltar pelo navegador, o da URL */
  pedidoInicial: PedidoLista;
  selosDesligados: boolean;
  mapaVisivel: boolean;
}

export function useBusca({ conjunto, servidor, pedidoInicial, selosDesligados, mapaVisivel }: OpcoesBusca) {
  const [pedido, setPedido] = useState<PedidoLista>(pedidoInicial);
  const chave = consultaLista(conjunto, pedido);

  // ---- lista ----
  const [doServidor] = useState<ResultadoExibido | null>(() =>
    servidor.resultado ? { chave: consultaLista(conjunto, servidor.pedido), plano: servidor.pedido.plano, resultado: servidor.resultado } : null,
  );
  const [exibido, setExibido] = useState<ResultadoExibido | null>(() => (doServidor?.chave === chave ? doServidor : null));
  const noCache = useSyncExternalStore(
    cacheLista.assinar,
    () => cacheLista.get(chave) ?? null,
    () => null,
  );
  // o último resultado que chegou fica na tela enquanto o próximo carrega (estado derivado, sem efeito)
  if (noCache && noCache !== exibido) setExibido(noCache);
  const pronto = noCache ?? (exibido?.chave === chave ? exibido : null);

  const [erro, setErro] = useState<{ chave: string; mensagem: string } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const erroAtual = erro?.chave === chave ? erro.mensagem : null;
  const carregando = pronto === null && erroAtual === null;

  // a página do servidor entra no cache (voltar a ela depois não pede a API)
  useEffect(() => {
    if (doServidor && !cacheLista.get(doServidor.chave)) cacheLista.set(doServidor.chave, doServidor);
  }, [doServidor]);

  // Espera do texto (debounce com borda de entrada): uma busca de texto isolada (Enter, sugestão, pílula
  // removida) vai na hora; mudanças seguidas (menos de 300 ms entre elas, alguém digitando) esperam 300 ms
  // depois da última. O mapa usa a mesma espera (e sai depois da lista, que é o que a pessoa lê primeiro).
  const qAnterior = useRef(pedido.filtros.q);
  const ultimaMudancaQ = useRef(-Infinity);
  const espera = useRef(0);
  useEffect(() => {
    const mudouTexto = pedido.filtros.q !== qAnterior.current;
    qAnterior.current = pedido.filtros.q;
    if (mudouTexto) {
      const agora = performance.now();
      espera.current = agora - ultimaMudancaQ.current < ESPERA_TEXTO ? ESPERA_TEXTO : 0;
      ultimaMudancaQ.current = agora;
    } else {
      espera.current = 0;
    }
    if (cacheLista.get(chave)) return;
    const controle = new AbortController();
    const relogio = window.setTimeout(
      () => {
        pedirJson<ResultadoBusca>(urlApi(chave), controle.signal).then(
          (r) => {
            const item: ResultadoExibido = { chave, plano: pedido.plano, resultado: { ...r, mapa: [] } };
            // página além da última (link antigo, filtros mudaram): o servidor devolve a última; a URL acompanha
            if (r.pagina !== pedido.pagina) {
              const ajustada = consultaLista(conjunto, { ...pedido, pagina: r.pagina });
              cacheLista.set(ajustada, { ...item, chave: ajustada });
              setPedido((p) => (consultaLista(conjunto, p) === chave ? { ...p, pagina: r.pagina } : p));
            }
            cacheLista.set(chave, item);
            // voltou a funcionar (de novo nesta busca): o aviso de erro dela sai
            setErro((e) => (e?.chave === chave ? null : e));
          },
          (e: unknown) => {
            if (controle.signal.aborted) return;
            setErro({ chave, mensagem: textoDoErro(e) });
          },
        );
      },
      espera.current,
    );
    return () => {
      window.clearTimeout(relogio);
      controle.abort();
    };
  }, [chave, conjunto, pedido, tentativa]);

  // ---- mapa ----
  const kMapa = chaveMapa(conjunto, pedido.filtros, pedido.plano, selosDesligados);
  const pontosNoCache = useSyncExternalStore(
    cacheMapa.assinar,
    () => cacheMapa.get(kMapa) ?? null,
    () => null,
  );
  const [pontosExibidos, setPontosExibidos] = useState<PontoMapa[] | null>(null);
  if (pontosNoCache && pontosNoCache !== pontosExibidos) setPontosExibidos(pontosNoCache);
  const [erroMapa, setErroMapa] = useState<string | null>(null);
  const [tentativaMapa, setTentativaMapa] = useState(0);
  const erroMapaAtual = erroMapa === kMapa;

  const filtrosMapa = pedido.filtros;
  const planoMapa = pedido.plano;
  useEffect(() => {
    if (!mapaVisivel || cacheMapa.get(kMapa)) return;
    const controle = new AbortController();
    // o relógio da lista (efeito acima, mesma espera) já está na fila: o pedido da lista sai primeiro
    const relogio = window.setTimeout(() => {
      pedirJson<ResultadoBusca>(urlApi(consultaMapa(conjunto, filtrosMapa, planoMapa)), controle.signal).then(
        (r) => {
          cacheMapa.set(kMapa, r.mapa);
          setErroMapa((e) => (e === kMapa ? null : e));
        },
        () => {
          if (!controle.signal.aborted) setErroMapa(kMapa);
        },
      );
    }, espera.current);
    return () => {
      window.clearTimeout(relogio);
      controle.abort();
    };
  }, [conjunto, kMapa, mapaVisivel, filtrosMapa, planoMapa, tentativaMapa]);

  // ---- contagem do painel e do estado vazio (sem mapa, uma página de 1 item) ----
  const plano = pedido.plano;
  const consultar = useCallback(
    async (f: Filtros, sinal?: AbortSignal): Promise<Consulta> => {
      const q = consultaContagem(conjunto, f, plano);
      const guardada = cacheContagem.get(q);
      if (guardada) return guardada;
      const r = await pedirJson<ResultadoBusca>(urlApi(q), sinal);
      const valor = { total: r.total, facetas: r.facetas };
      cacheContagem.set(q, valor);
      return valor;
    },
    [conjunto, plano],
  );
  const contar = useCallback((f: Filtros, sinal?: AbortSignal) => consultar(f, sinal).then((r) => r.total), [consultar]);

  // ---- mudanças (filtros e ordem voltam à página 1) ----
  // Pedido igual ao atual (um pop-up que fecha sem mudar nada, a mesma ordem de novo) não faz nada: nem volta
  // à página 1, nem cancela o pedido que está a caminho.
  const mudarFiltros = useCallback(
    (f: Filtros) =>
      setPedido((p) => {
        const filtros = limparVazios(f);
        return filtrosIguais(p.filtros, filtros) ? p : { ...p, filtros, pagina: 1 };
      }),
    [],
  );
  const mudarOrdem = useCallback((ordem: Ordem) => setPedido((p) => (p.ordem === ordem ? p : { ...p, ordem, pagina: 1 })), []);
  const irParaPagina = useCallback((n: number) => {
    const pagina = Math.max(1, Math.floor(n));
    setPedido((p) => (p.pagina === pagina ? p : { ...p, pagina }));
  }, []);
  const mudarPlano = useCallback((plano: Plano) => setPedido((p) => (p.plano === plano ? p : { ...p, plano })), []);
  const tentarDeNovo = useCallback(() => {
    setErro(null);
    setErroMapa(null);
    setTentativa((n) => n + 1);
    setTentativaMapa((n) => n + 1);
  }, []);
  const tentarMapaDeNovo = useCallback(() => {
    setErroMapa(null);
    setTentativaMapa((n) => n + 1);
  }, []);

  return {
    pedido,
    /** o resultado na tela: o da busca atual ou, enquanto ela carrega, o anterior (null: nada ainda) */
    exibido: pronto ?? exibido,
    /** a busca atual ainda não chegou */
    carregando,
    erro: erroAtual,
    pontos: pontosNoCache ?? pontosExibidos,
    /** os pontos na tela são de outra busca (ou ainda não chegaram) */
    carregandoMapa: mapaVisivel && pontosNoCache === null && !erroMapaAtual,
    erroMapa: erroMapaAtual,
    mudarFiltros,
    mudarOrdem,
    irParaPagina,
    mudarPlano,
    tentarDeNovo,
    tentarMapaDeNovo,
    contar,
    consultar,
  };
}
