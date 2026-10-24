"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";
import { chaveFiltros, cidadeDaChave, definirBairros, definirCidades, definirUfs, limparVazios, nomeCidade, nomeCurto, nomeUf } from "@/lib/catalogo/filtros-rotulos";
import { normalizar, numero } from "@/lib/catalogo/rotulos";
import type { Facetas, Filtros } from "@/lib/catalogo/tipos";
import { IconeLupa, IconeMapa, IconePino, IconeX } from "../ui/icones";
import type { Consulta } from "./tipos";

type Sugestao =
  | { tipo: "q"; chave: string; rotulo: string }
  | { tipo: "uf" | "cidade" | "bairro"; chave: string; rotulo: string; detalhe: string; total: number; nota?: string };

const POR_GRUPO = { uf: 4, cidade: 6, bairro: 5 } as const;

/** Tela estreita (celular): o texto de ajuda do campo precisa caber ao lado do botão "Filtros". */
const ESTREITA = "(max-width: 30rem)";
/** Abaixo de 390 px (360, 375): nem "Cidade ou bairro" cabe (saía "Cidade ou bai"); fica "Buscar". */
const MUITO_ESTREITA = "(max-width: 389px)";
function useMidiaBusca(consulta: string) {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
const useTelaEstreita = () => useMidiaBusca(ESTREITA);
const GRUPO_ROTULO = { uf: "Estados", cidade: "Cidades", bairro: "Bairros" } as const;

/** 0 começa igual, 1 alguma palavra começa igual, 2 contém; -1 não casa. */
function peso(texto: string, q: string) {
  const t = normalizar(texto);
  if (t.startsWith(q)) return 0;
  if (t.split(/[\s-]+/).some((p) => p.startsWith(q))) return 1;
  return t.includes(q) ? 2 : -1;
}

/**
 * Sugestões de lugar para o texto. `lugares`: facetas de estados e cidades SEM a busca de texto e sem o filtro
 * de lugar (o texto novo vai substituir a busca atual, e uma cidade de outro estado pode entrar); sem elas
 * (ainda chegando), as da busca atual. Os bairros vêm das cidades escolhidas.
 */
function sugerir(texto: string, facetas: Facetas, lugares: Facetas | null, f: Filtros): Sugestao[] {
  const q = normalizar(texto).trim();
  if (!q) return [];
  const saida: Sugestao[] = [{ tipo: "q", chave: "q", rotulo: texto.trim() }];
  const ja = { uf: new Set(f.uf ?? []), cidade: new Set(f.cidade ?? []), bairro: new Set(f.bairro ?? []) };
  const fonte = lugares ?? facetas;

  const ufs = fonte.uf
    .filter((o) => o.total > 0 && !ja.uf.has(o.valor))
    .map((o) => {
      // sigla exata ("mg") vem antes de qualquer nome
      const w = peso(nomeUf(o.valor), q);
      return { o, p: normalizar(o.valor) === q ? 0 : w < 0 ? -1 : w + 1 };
    })
    .filter((x) => x.p >= 0)
    .sort((a, b) => a.p - b.p || b.o.total - a.o.total)
    .slice(0, POR_GRUPO.uf);
  for (const { o } of ufs) saida.push({ tipo: "uf", chave: `uf:${o.valor}`, rotulo: nomeUf(o.valor), detalhe: o.valor, total: o.total });

  const cidades = fonte.cidade
    .filter((o) => o.total > 0 && !ja.cidade.has(o.valor))
    .map((o) => ({ o, p: peso(nomeCurto(o.valor), q) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => a.p - b.p || b.o.total - a.o.total)
    .slice(0, POR_GRUPO.cidade);
  for (const { o } of cidades) {
    const uf = o.valor.split("|")[0];
    // cidade de um estado fora dos escolhidos: escolhê-la acrescenta o estado (definirCidades)
    const nota = ja.uf.size && !ja.uf.has(uf) ? `adiciona ${uf}` : undefined;
    saida.push({ tipo: "cidade", chave: `cidade:${o.valor}`, rotulo: nomeCurto(o.valor), detalhe: uf, total: o.total, nota });
  }

  const bairros = facetas.bairro
    .filter((o) => o.total > 0 && !ja.bairro.has(o.valor))
    .map((o) => ({ o, p: peso(nomeCurto(o.valor), q) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => a.p - b.p || b.o.total - a.o.total)
    .slice(0, POR_GRUPO.bairro);
  for (const { o } of bairros) saida.push({ tipo: "bairro", chave: `bairro:${o.valor}`, rotulo: nomeCurto(o.valor), detalhe: nomeCidade(cidadeDaChave(o.valor)), total: o.total });

  return saida;
}

/**
 * O lugar que o texto nomeia por inteiro ("belo horizonte" → Belo Horizonte/MG): a cidade com esse nome (a de
 * mais imóveis, se houver várias), senão o estado, senão o bairro. null se o texto não é só um nome de lugar.
 */
function lugarExato(texto: string, sugestoes: Sugestao[]): Sugestao | null {
  const q = normalizar(texto).trim().replace(/\s+/g, " ");
  const iguais = sugestoes.filter((s) => s.tipo !== "q" && normalizar(s.rotulo) === q);
  const por = (tipo: Sugestao["tipo"]) =>
    iguais.filter((s) => s.tipo === tipo).sort((a, b) => (b.tipo === "q" || a.tipo === "q" ? 0 : b.total - a.total))[0];
  return por("cidade") ?? por("uf") ?? por("bairro") ?? null;
}

/**
 * Campo de busca da barra: ao digitar, sugere estados (por nome e sigla), cidades e bairros, com quantos
 * imóveis cada um tem. Escolher uma sugestão vira filtro de UF/cidade/bairro. Enter (sem sugestão marcada)
 * com o nome exato de uma cidade ("belo horizonte") aplica a cidade; com outro texto, a busca livre (`q`),
 * que procura em título, endereço, bairro e cidade. "/" foca a busca de qualquer lugar da página.
 */
export function BuscaLocal({
  filtros,
  facetas,
  onChange,
  consultar,
  campoRef,
  className = "",
}: {
  filtros: Filtros;
  facetas: Facetas;
  onChange: (f: Filtros) => void;
  /** total e facetas de outros filtros (as sugestões de lugar não ficam presas à busca e ao estado atuais) */
  consultar?: (f: Filtros, sinal?: AbortSignal) => Promise<Consulta>;
  /** para outros componentes focarem a busca (ex.: depois de "Limpar tudo") */
  campoRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const id = useId();
  const proprio = useRef<HTMLInputElement>(null);
  const campo = campoRef ?? proprio;
  const [texto, setTexto] = useState(filtros.q ?? "");
  const [qAnterior, setQAnterior] = useState(filtros.q);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [focado, setFocado] = useState(false);
  const estreita = useTelaEstreita();
  const muitoEstreita = useMidiaBusca(MUITO_ESTREITA);

  // a busca aplicada mudou por fora (pílula removida, URL): o campo acompanha
  if (filtros.q !== qAnterior) {
    setQAnterior(filtros.q);
    setTexto(filtros.q ?? "");
  }

  // Lugares para sugerir: os mesmos filtros sem o texto e sem o lugar (uma busca de texto antiga, ou o estado
  // escolhido, não escondem a cidade que a pessoa está digitando). Pedido uma vez por conjunto de filtros.
  const baseLugares = limparVazios({ ...filtros, q: undefined, uf: undefined, cidade: undefined, bairro: undefined });
  const chaveLugares = chaveFiltros(baseLugares);
  const [lugares, setLugares] = useState<{ chave: string; facetas: Facetas } | null>(null);
  const precisaLugares = !!consultar && focado && texto.trim() !== "" && lugares?.chave !== chaveLugares;
  const ultimaBase = useRef(baseLugares);
  useEffect(() => {
    ultimaBase.current = baseLugares;
  });
  useEffect(() => {
    if (!precisaLugares || !consultar) return;
    const controle = new AbortController();
    const espera = window.setTimeout(() => {
      consultar(ultimaBase.current, controle.signal).then(
        (r) => setLugares({ chave: chaveLugares, facetas: r.facetas }),
        () => {},
      );
    }, 120);
    return () => {
      window.clearTimeout(espera);
      controle.abort();
    };
  }, [precisaLugares, consultar, chaveLugares]);
  const facetasLugares = lugares?.chave === chaveLugares ? lugares.facetas : null;

  const sugestoes = useMemo(() => sugerir(texto, facetas, facetasLugares, filtros), [texto, facetas, facetasLugares, filtros]);
  const mostrar = aberto && sugestoes.length > 0;

  // "/" foca a busca (fora de campos de texto)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      e.preventDefault();
      campo.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [campo]);

  const aplicarTexto = (t: string) => {
    const limpo = t.trim().slice(0, 120);
    setAberto(false);
    setAtivo(-1);
    if ((filtros.q ?? "") === limpo) return;
    onChange(limparVazios({ ...filtros, q: limpo || undefined }));
  };

  const escolher = (s: Sugestao) => {
    if (s.tipo === "q") return aplicarTexto(s.rotulo);
    // o texto digitado no campo era o caminho até o lugar (e tomou o lugar da busca de texto anterior):
    // nenhum dos dois vira busca livre
    const base = filtros.q ? limparVazios({ ...filtros, q: undefined }) : filtros;
    const valor = s.chave.slice(s.chave.indexOf(":") + 1);
    const novo =
      s.tipo === "uf"
        ? definirUfs(base, [...(base.uf ?? []), valor])
        : s.tipo === "cidade"
          ? definirCidades(base, [...(base.cidade ?? []), valor])
          : definirBairros(base, [...(base.bairro ?? []), valor]);
    setTexto(base.q ?? "");
    setAberto(false);
    setAtivo(-1);
    onChange(novo);
  };

  const onTecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!sugestoes.length) return;
      e.preventDefault();
      setAberto(true);
      const n = sugestoes.length;
      setAtivo((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mostrar && ativo >= 0 && sugestoes[ativo]) return escolher(sugestoes[ativo]);
      // o texto é o nome exato de uma cidade (ou estado, ou bairro) sugerida: vale o lugar, não a busca livre
      const lugar = lugarExato(texto, sugestoes);
      if (lugar) escolher(lugar);
      else aplicarTexto(texto);
    } else if (e.key === "Escape") {
      if (mostrar) {
        // fecha só as sugestões (sem fechar um diálogo em volta, que ouve o Esc no document)
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        setAberto(false);
        setAtivo(-1);
      }
    }
  };

  const listaId = `${id}-sugestoes`;
  const opId = (i: number) => `${id}-s-${i}`;
  // título do grupo antes da primeira sugestão de cada tipo
  const cabecalhos = sugestoes.map((s, i) => (s.tipo !== "q" && (i === 0 || sugestoes[i - 1].tipo !== s.tipo) ? GRUPO_ROTULO[s.tipo] : null));

  return (
    <div className={`relative ${className}`}>
      <IconeLupa className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-nevoa" />
      <input
        ref={campo}
        type="search"
        role="combobox"
        aria-label="Buscar por cidade, bairro, estado ou palavra"
        aria-expanded={mostrar}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={mostrar && ativo >= 0 ? opId(ativo) : undefined}
        placeholder={muitoEstreita ? "Buscar" : estreita ? "Cidade ou bairro" : "Cidade, bairro, estado ou palavra"}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
          setAtivo(-1);
        }}
        onFocus={() => {
          setFocado(true);
          if (texto && texto !== filtros.q) setAberto(true);
        }}
        onBlur={() => {
          setFocado(false);
          setAberto(false);
          setAtivo(-1);
        }}
        onKeyDown={onTecla}
        // 16 px no toque (o Safari do iPhone não dá zoom ao focar); foco com anel de contraste (latão de texto)
        className={`h-12 w-full min-w-0 appearance-none rounded-full border border-nevoa/30 bg-tinta pl-11 text-base pointer-fine:text-[15px] ${texto ? "pr-12" : "pr-4 pointer-fine:pr-12"} text-luar shadow-[0_1px_0_rgba(255,255,255,.03)_inset] transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-nevoa hover:border-nevoa/55 focus:border-latao-texto focus:ring-2 focus:ring-latao-texto/60 focus-visible:outline-none pointer-fine:h-11 [&::-webkit-search-cancel-button]:hidden`}
      />
      {texto ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setTexto("");
            if (filtros.q) onChange(limparVazios({ ...filtros, q: undefined }));
            campo.current?.focus();
          }}
          className="absolute top-1/2 right-1.5 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-nevoa transition-colors hover:bg-nevoa/12 hover:text-luar pointer-fine:size-8"
        >
          <IconeX />
        </button>
      ) : (
        !focado && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-md border border-nevoa/30 px-1.5 py-0.5 font-sans text-[11px] leading-none text-nevoa pointer-fine:inline-block"
          >
            /
          </kbd>
        )
      )}

      <div
        className={`absolute top-full left-0 z-[60] mt-2 w-full max-w-[560px] min-w-[min(400px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-nevoa/25 bg-tinta shadow-[0_18px_60px_rgba(7,11,22,.35)] transition-[opacity,scale] duration-150 ease-luneta starting:scale-[0.98] starting:opacity-0 motion-reduce:transition-none ${
          mostrar ? "" : "hidden"
        }`}
      >
        <ul id={listaId} role="listbox" aria-label="Sugestões" className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain p-1.5">
          {sugestoes.map((s, i) => {
            const cabecalho = cabecalhos[i];
            const on = i === ativo;
            return (
              <li key={s.chave} role="presentation">
                {cabecalho && (
                  <p aria-hidden="true" className="px-3 pt-3 pb-1 text-[11px] leading-none font-semibold tracking-[0.14em] text-nevoa uppercase">
                    {cabecalho}
                  </p>
                )}
                <div
                  id={opId(i)}
                  role="option"
                  aria-selected={on}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => ativo !== i && setAtivo(i)}
                  onClick={() => escolher(s)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-100 ${on ? "bg-nevoa/14" : ""}`}
                >
                  <span aria-hidden="true" className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${on ? "bg-latao/20 text-latao-texto" : "bg-nevoa/10 text-nevoa"}`}>
                    {s.tipo === "q" ? <IconeLupa tamanho={15} /> : s.tipo === "uf" ? <IconeMapa tamanho={15} /> : <IconePino tamanho={15} />}
                  </span>
                  {s.tipo === "q" ? (
                    <span className="min-w-0 flex-1 truncate text-luar">
                      Buscar <strong className="font-semibold">“{s.rotulo}”</strong>
                      <span className="text-nevoa"> em títulos e endereços</span>
                    </span>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-luar">
                        <span className="sr-only">{s.tipo === "uf" ? "Estado: " : s.tipo === "cidade" ? "Cidade: " : "Bairro: "}</span>
                        <span className="font-medium">{s.rotulo}</span>
                        {" "}
                        <span className="ml-1 text-xs text-nevoa">{s.detalhe}</span>
                        {s.nota && <span className="ml-1.5 text-xs text-latao-texto">({s.nota})</span>}
                      </span>
                      <span className="shrink-0 text-xs text-nevoa tabular-nums">
                        <span className="sr-only">, </span>
                        {numero(s.total)}
                        <span className="sr-only"> {s.total === 1 ? "imóvel" : "imóveis"}</span>
                      </span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {/* dica de teclado físico: não aparece no toque (e sobra lugar para mais uma sugestão acima do teclado) */}
        <p className="border-t border-nevoa/15 px-4 py-2.5 text-xs text-nevoa pointer-coarse:hidden">
          <kbd className="font-sans font-semibold text-luar">Enter</kbd> busca o texto · <kbd className="font-sans font-semibold text-luar">↑↓</kbd> escolhe um lugar
        </p>
      </div>
    </div>
  );
}
