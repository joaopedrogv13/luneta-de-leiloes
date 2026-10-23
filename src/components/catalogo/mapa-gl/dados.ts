"use client";

import { useEffect, useState } from "react";
import { canonico } from "@/components/catalogo/app/consultas";
import { filtrosEfetivos } from "@/lib/catalogo/filtros-rotulos";
import { lerPontos, type PontosCompactos, type PontosLidos } from "@/lib/catalogo/pontos";
import type { Conjunto, Filtros, ImovelResumo, Plano } from "@/lib/catalogo/tipos";
import { escreverBusca } from "@/lib/catalogo/url";

/**
 * Os dados do mapa de verdade no navegador:
 * - `usePontos`: os pontos de TODOS os imóveis filtrados (GET /api/catalogo/pontos), sem a área do mapa (o mapa mostra
 *   tudo; a lista é que segue a área). Pedido de novo só quando os filtros ou o plano mudam; as últimas respostas ficam
 *   guardadas (voltar a um filtro já visto é instantâneo).
 * - `itensDoMapa`: os imóveis de um lugar para o cartão (GET /api/catalogo/pontos/itens), pela posição, guardados.
 * Sem maplibre-gl aqui: este módulo entra no app do catálogo, e o pedido dos pontos sai junto com o código do mapa.
 */

const API_PONTOS = "/api/catalogo/pontos";

/**
 * Consulta dos pontos (a chave do cache): conjunto e os filtros que valem no plano, sem a área do mapa. O plano não vai
 * (os pontos não têm nada da Luneta; os filtros dela já saíram aqui no Lente): trocar de Lente para Luneta sem filtro
 * avançado não pede os pontos de novo, e a CDN guarda uma resposta só.
 */
export function consultaPontos(conjunto: Conjunto, filtros: Filtros, plano: Plano): string {
  const f = canonico(filtrosEfetivos(filtros, plano, false));
  delete f.bbox;
  return escreverBusca({ conjunto, filtros: f }).toString();
}

const cache = new Map<string, PontosLidos>();
const LIMITE = 6;
function guardar(chave: string, p: PontosLidos) {
  cache.delete(chave);
  cache.set(chave, p);
  while (cache.size > LIMITE) cache.delete(cache.keys().next().value!);
}

export interface EstadoPontos {
  pontos: PontosLidos | null;
  /** os pontos na tela são de outra busca (ou ainda não chegaram) */
  carregando: boolean;
  erro: boolean;
  tentarDeNovo: () => void;
  /** quanto tempo o último pedido levou (ms, rede + leitura), para a medição de desempenho */
  ms: number | null;
}

/** Pontos dos filtros atuais (os anteriores ficam na tela enquanto os novos chegam). */
export function usePontos(conjunto: Conjunto, filtros: Filtros, plano: Plano, ativo: boolean): EstadoPontos {
  const consulta = consultaPontos(conjunto, filtros, plano);
  const [estado, setEstado] = useState<{ consulta: string; pontos: PontosLidos | null; erro: boolean; ms: number | null }>(() => ({
    consulta,
    pontos: cache.get(consulta) ?? null,
    erro: false,
    ms: null,
  }));
  const [tentativa, setTentativa] = useState(0);
  const guardado = cache.get(consulta);
  // trocou de consulta e ela já está guardada: mostra na hora (estado derivado, sem efeito)
  if (guardado && estado.pontos !== guardado) setEstado({ consulta, pontos: guardado, erro: false, ms: 0 });

  useEffect(() => {
    if (!ativo || cache.has(consulta)) return;
    const controle = new AbortController();
    const t = performance.now();
    fetch(`${API_PONTOS}?${consulta}`, { signal: controle.signal, headers: { accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<PontosCompactos>;
      })
      .then((bruto) => {
        const lidos = lerPontos(bruto);
        guardar(consulta, lidos);
        setEstado({ consulta, pontos: lidos, erro: false, ms: Math.round(performance.now() - t) });
      })
      .catch(() => {
        if (!controle.signal.aborted) setEstado((e) => ({ ...e, consulta, erro: true }));
      });
    return () => controle.abort();
  }, [consulta, ativo, tentativa]);

  return {
    pontos: estado.pontos,
    carregando: ativo && !cache.has(consulta) && !(estado.consulta === consulta && estado.erro),
    erro: estado.consulta === consulta && estado.erro,
    tentarDeNovo: () => setTentativa((n) => n + 1),
    ms: estado.ms,
  };
}

/** Esquece os pontos guardados (a versão do catálogo mudou no servidor). */
export function esquecerPontos() {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Imóveis de um lugar (o cartão do mapa)
// ---------------------------------------------------------------------------

const itens = new Map<string, ImovelResumo>();

export class VersaoAntiga extends Error {}

/** Os imóveis nas posições `ks` (na ordem pedida), do cache ou da API. Lança VersaoAntiga se o catálogo mudou. */
export async function itensDoMapa(conjunto: Conjunto, versao: string, plano: Plano, ks: readonly number[], sinal?: AbortSignal): Promise<ImovelResumo[]> {
  const chave = (k: number) => `${conjunto}|${versao}|${plano}|${k}`;
  const faltam = ks.filter((k) => !itens.has(chave(k)));
  if (faltam.length) {
    const q = new URLSearchParams({ conjunto, versao, k: faltam.join(",") });
    if (plano === "lente") q.set("plano", "lente");
    const r = await fetch(`${API_PONTOS}/itens?${q}`, { signal: sinal, headers: { accept: "application/json" } });
    if (r.status === 409) throw new VersaoAntiga("os pontos são de outra versão do catálogo");
    if (!r.ok) throw new Error(String(r.status));
    const corpo = (await r.json()) as { ks: number[]; itens: ImovelResumo[] };
    corpo.ks.forEach((k, j) => {
      const item = corpo.itens[j];
      if (item) itens.set(chave(k), item);
    });
    while (itens.size > 400) itens.delete(itens.keys().next().value!);
  }
  return ks.flatMap((k) => {
    const i = itens.get(chave(k));
    return i ? [i] : [];
  });
}
