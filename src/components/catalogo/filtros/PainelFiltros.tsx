"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { chaveFiltros, contarGrupos, filtrosEfetivos, limparVazios, type GrupoFiltro } from "@/lib/catalogo/filtros-rotulos";
import { numero } from "@/lib/catalogo/rotulos";
import type { Facetas, Filtros } from "@/lib/catalogo/tipos";
import { contarFiltros } from "@/lib/catalogo/url";
import { CampoData } from "../ui/CampoData";
import { AJUDA } from "../ui/estilos";
import { Folha, rolarPara } from "../ui/Folha";
import { Girando, IconeCadeado } from "../ui/icones";
import { semMovimento } from "../ui/useAdiado";
import {
  Campo,
  ControleBairros,
  ControleCidades,
  ControleEstados,
  ControleFaixa,
  ControleLista,
  ControleMinimo,
  ControleSelo,
  ControleSimNao,
  ControleTags,
  ControleTipo,
  textoImoveis,
} from "./controles";
import { SELOS_EM_ANALISE } from "./OrdenarPor";
import type { PropsFiltros, SecaoFiltro } from "./tipos";
import type { Aplicar } from "./useAplicador";

export const SECOES: readonly { id: SecaoFiltro; rotulo: string; grupos: readonly GrupoFiltro[] }[] = [
  { id: "local", rotulo: "Localização", grupos: ["uf", "cidade", "bairro"] },
  { id: "tipo", rotulo: "Tipo", grupos: ["tipo"] },
  { id: "valores", rotulo: "Valores", grupos: ["lance", "avaliacao", "desagio", "lanceM2"] },
  { id: "caracteristicas", rotulo: "Características", grupos: ["area", "quartos", "vagas"] },
  { id: "leilao", rotulo: "Leilão", grupos: ["modalidade", "praca", "data"] },
  { id: "condicoes", rotulo: "Condições", grupos: ["financiamento", "fgts", "parcelamento", "ocupacao", "natureza", "fonte"] },
  { id: "riscos", rotulo: "Riscos", grupos: ["semTags", "comTags"] },
  { id: "selo", rotulo: "Selo", grupos: ["selo"] },
  { id: "foto", rotulo: "Foto", grupos: ["comFoto"] },
];

/** Altura das listas de seleção dentro do painel (a folha já rola). */
const ALTURA_LISTA = "max-h-[264px]";

type Resultado = { chave: string; total: number | null; facetas?: Facetas };

/**
 * "Todos os filtros": a Folha com todas as seções e navegação por seção. Trabalha num rascunho: nada
 * muda na lista até "Mostrar N imóveis" (N ao vivo: `consultar`/`contar` com espera de 250 ms, a
 * anterior cancelada). Fechar sem aplicar descarta o rascunho. No plano Lente, Riscos e Selo aparecem
 * travados (abrem o upgrade); com os selos desligados, Selo aparece desabilitado com a explicação.
 */
export function PainelFiltros({
  aberto,
  onFechar,
  secaoInicial,
  openerRef,
  filtros,
  facetas,
  total,
  carregando,
  plano,
  selosDesligados,
  onChange,
  onUpsell,
  contar,
  consultar,
}: PropsFiltros & {
  aberto: boolean;
  onFechar: () => void;
  /** abre já rolado nesta seção */
  secaoInicial?: SecaoFiltro;
  /** quem abriu (o foco volta para ele) */
  openerRef?: RefObject<HTMLElement | null>;
}) {
  const uid = useId();
  const corpo = useRef<HTMLDivElement>(null);
  // o painel parte só do que vale neste plano (no Lente, tags e selo da URL não contam)
  const aplicados = filtrosEfetivos(filtros, plano, selosDesligados);
  const [rascunho, setRascunho] = useState<Filtros>(aplicados);
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  const [jaAbriu, setJaAbriu] = useState(aberto);
  const [secaoAtiva, setSecaoAtiva] = useState<SecaoFiltro>(secaoInicial ?? "local");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // número da abertura: as seções remontam a cada uma (busca das listas vazia, escolhidos no topo)
  const [sessao, setSessao] = useState(0);

  // cada abertura começa um rascunho novo a partir dos filtros aplicados
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setRascunho(aplicados);
      setJaAbriu(true);
      setSecaoAtiva(secaoInicial ?? "local");
      setResultado(null);
      setSessao((s) => s + 1);
    }
  }

  const aplicar = useCallback<Aplicar>((_chave, atualizar) => setRascunho((r) => limparVazios(atualizar(r))), []);

  // ---- contagem ao vivo do rascunho ----
  const chaveRascunho = chaveFiltros(rascunho);
  const igualAplicado = chaveRascunho === chaveFiltros(aplicados);
  const ultimo = useRef({ contar, consultar, rascunho });
  useEffect(() => {
    ultimo.current = { contar, consultar, rascunho };
  });
  useEffect(() => {
    if (!aberto || igualAplicado) return;
    const sinal = new AbortController();
    const chave = chaveRascunho;
    const espera = setTimeout(() => {
      const { contar: c, consultar: q, rascunho: r } = ultimo.current;
      const pedido: Promise<{ total: number; facetas?: Facetas }> = q ? q(r, sinal.signal) : c(r, sinal.signal).then((t) => ({ total: t }));
      pedido.then(
        (res) => !sinal.signal.aborted && setResultado({ chave, total: res.total, facetas: res.facetas }),
        () => !sinal.signal.aborted && setResultado({ chave, total: null }),
      );
    }, 250);
    return () => {
      clearTimeout(espera);
      sinal.abort();
    };
  }, [aberto, igualAplicado, chaveRascunho]);

  const contando = igualAplicado ? carregando : resultado?.chave !== chaveRascunho;
  const totalRascunho = igualAplicado ? total : resultado?.chave === chaveRascunho ? resultado.total : null;
  const falhou = !igualAplicado && resultado?.chave === chaveRascunho && resultado.total === null;
  // o que o botão mostra: o total do rascunho, ou (enquanto conta) o último conhecido
  const mostrado = totalRascunho ?? resultado?.total ?? total;
  const facetasVivas = !igualAplicado && resultado?.facetas ? resultado.facetas : facetas;

  // sem `consultar`, as facetas de cidade são as da busca aplicada: avisa quais estados novos ainda não têm a lista
  const ufsComCidade = new Set(facetasVivas.cidade.map((c) => c.valor.split("|")[0]));
  const ufsSemCidades = (rascunho.uf ?? []).filter((u) => !ufsComCidade.has(u));

  // ---- abrir na seção pedida (ou no topo) e acompanhar a seção visível ----
  useEffect(() => {
    if (!aberto) return;
    const el = corpo.current;
    if (!el) return;
    if (secaoInicial) {
      requestAnimationFrame(() => document.getElementById(`${uid}-${secaoInicial}`)?.scrollIntoView({ block: "start" }));
    } else {
      el.scrollTop = 0;
    }
  }, [aberto, secaoInicial, uid]);

  // enquanto a rolagem pedida pela navegação acontece, a seção marcada é a escolhida (não as do caminho)
  const travaRolagem = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const raiz = corpo.current;
    if (!aberto || !raiz || !jaAbriu) return;
    const visiveis = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visiveis.set((e.target as HTMLElement).dataset.secao ?? "", e.isIntersecting);
        if (travaRolagem.current) return;
        const primeira = SECOES.find((s) => visiveis.get(s.id));
        if (primeira) setSecaoAtiva(primeira.id);
      },
      // -8px no topo: a seção de cima, que só encosta na borda, não conta como visível
      { root: raiz, rootMargin: "-8px 0px -65% 0px", threshold: 0 },
    );
    raiz.querySelectorAll("[data-secao]").forEach((s) => obs.observe(s));
    const soltar = () => {
      if (travaRolagem.current) clearTimeout(travaRolagem.current);
      travaRolagem.current = null;
    };
    raiz.addEventListener("scrollend", soltar);
    return () => {
      obs.disconnect();
      raiz.removeEventListener("scrollend", soltar);
    };
  }, [aberto, jaAbriu]);

  // a navegação (que rola de lado) acompanha a seção atual
  const navLista = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = navLista.current;
    const b = ul?.querySelector<HTMLElement>(`[data-nav="${secaoAtiva}"]`);
    if (!ul || !b) return;
    const esq = b.offsetLeft - 20;
    const dir = b.offsetLeft + b.offsetWidth + 20 - ul.clientWidth;
    if (ul.scrollLeft > esq) ul.scrollTo({ left: esq, behavior: semMovimento() ? "auto" : "smooth" });
    else if (ul.scrollLeft < dir) ul.scrollTo({ left: dir, behavior: semMovimento() ? "auto" : "smooth" });
  }, [secaoAtiva]);

  const irPara = (s: SecaoFiltro) => {
    setSecaoAtiva(s);
    // solta no fim da rolagem (scrollend) ou, sem esse evento, depois de 1,2 s
    if (travaRolagem.current) clearTimeout(travaRolagem.current);
    travaRolagem.current = setTimeout(() => {
      travaRolagem.current = null;
    }, 1200);
    rolarPara(document.getElementById(`${uid}-${s}`));
    // o foco vai junto (teclado e leitor de tela continuam dali, não do topo da navegação)
    document.getElementById(`${uid}-${s}-t`)?.focus({ preventScroll: true });
  };

  const ativos = contarFiltros(rascunho);
  const lente = plano === "lente";
  const props = { f: rascunho, facetas: facetasVivas, aplicar };

  const mostrar = () => {
    if (!igualAplicado) onChange(limparVazios(rascunho));
    onFechar();
  };

  const nav = (
    <nav aria-label="Seções dos filtros" className="relative">
      <ul ref={navLista} className="relative flex gap-1.5 overflow-x-auto px-5 pb-3 [scrollbar-width:none] md:px-6 [&::-webkit-scrollbar]:hidden">
        {SECOES.map((s) => {
          const n = contarGrupos(rascunho, s.grupos);
          const on = secaoAtiva === s.id;
          const travada = lente && (s.id === "riscos" || s.id === "selo");
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                data-nav={s.id}
                aria-current={on ? "true" : undefined}
                onClick={() => irPara(s.id)}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-[background-color,color] duration-150 pointer-fine:min-h-8 ${
                  on ? "bg-luar text-noite" : "text-nevoa hover:bg-nevoa/10 hover:text-luar"
                }`}
              >
                {s.rotulo}
                {travada && <IconeCadeado tamanho={12} className={on ? "" : "text-latao-texto"} />}
                {n > 0 && (
                  <span className={`inline-flex size-[18px] items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${on ? "bg-latao text-noite-fixa" : "bg-latao/20 text-latao-texto"}`}>
                    {n}
                    <span className="sr-only"> {n === 1 ? "filtro ativo" : "filtros ativos"}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-tinta" />
    </nav>
  );

  const rodape = (
    <div className="flex flex-col gap-2">
      {totalRascunho === 0 && !contando && (
        <p className="text-center text-xs leading-snug text-nevoa">Nenhum imóvel com esses filtros. Tente afrouxar uma faixa ou tirar um filtro.</p>
      )}
      {falhou && <p className="text-center text-xs leading-snug text-nevoa">Não deu para contar agora; os filtros valem do mesmo jeito.</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={ativos === 0 || (ativos === 1 && !!rascunho.q)}
          onClick={() => setRascunho((r) => (r.q ? { q: r.q } : {}))}
          className="inline-flex min-h-12 cursor-pointer items-center rounded-full px-4 text-[15px] font-semibold text-luar underline-offset-4 transition-colors hover:underline disabled:cursor-default disabled:text-nevoa/60 disabled:no-underline"
        >
          Limpar
        </button>
        <button type="button" onClick={mostrar} aria-busy={contando || undefined} className="btn-primary flex-1 tabular-nums">
          {contando && <Girando className="text-noite-fixa" />}
          {falhou ? (
            "Mostrar imóveis"
          ) : (
            // enquanto conta, o número anterior fica esmaecido (o botão não pisca nem muda de largura)
            <span className={`transition-opacity duration-150 motion-reduce:transition-none ${contando ? "opacity-60" : ""}`}>Mostrar {textoImoveis(mostrado)}</span>
          )}
        </button>
      </div>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {contando || falhou || totalRascunho === null ? "" : `${textoImoveis(totalRascunho)} com estes filtros`}
      </span>
    </div>
  );

  return (
    <Folha
      aberto={aberto}
      onFechar={onFechar}
      titulo="Filtros"
      subtitulo={ativos ? `${numero(ativos)} ${ativos === 1 ? "ativo" : "ativos"}` : undefined}
      abaixoDoCabecalho={nav}
      rodape={rodape}
      openerRef={openerRef}
      corpoRef={corpo}
      rotuloFechar="Fechar filtros sem aplicar"
    >
      {jaAbriu && (
        <div key={sessao} className="flex flex-col pb-8">
          <Secao uid={uid} id="local" titulo="Localização">
            <Campo rotulo="Estados">
              <ControleEstados {...props} alturaLista={ALTURA_LISTA} />
            </Campo>
            <Campo rotulo="Cidades" ajuda={rascunho.uf?.length ? "Só das cidades dos estados escolhidos." : undefined}>
              <ControleCidades
                {...props}
                alturaLista={ALTURA_LISTA}
                ufsSemCidades={consultar ? undefined : ufsSemCidades}
                vazio={consultar && contando ? "Buscando as cidades…" : undefined}
              />
            </Campo>
            <Campo rotulo="Bairros" ajuda={rascunho.cidade?.length ? "Só dos bairros das cidades escolhidas." : undefined}>
              <ControleBairros
                {...props}
                alturaLista={ALTURA_LISTA}
                semBairros={consultar ? (contando ? "Buscando os bairros…" : "A fonte não informa o bairro dos imóveis destas cidades.") : undefined}
              />
            </Campo>
          </Secao>

          <Secao uid={uid} id="tipo" titulo="Tipo de imóvel">
            <ControleTipo {...props} />
          </Secao>

          <Secao uid={uid} id="valores" titulo="Valores" descricao="O histograma mostra quantos imóveis há em cada faixa. Toque numa barra, arraste ou digite.">
            <ControleFaixa {...props} grupo="lance" />
            <Divisor />
            <ControleFaixa {...props} grupo="avaliacao" />
            <Divisor />
            <ControleFaixa {...props} grupo="desagio" />
            <Divisor />
            <ControleFaixa {...props} grupo="lanceM2" />
          </Secao>

          <Secao uid={uid} id="caracteristicas" titulo="Características">
            <ControleFaixa {...props} grupo="area" />
            <Campo rotulo="Quartos" ajuda="Pelo menos. Anúncios que não informam ficam de fora.">
              <ControleMinimo {...props} grupo="quartos" />
            </Campo>
            <Campo rotulo="Vagas de garagem" ajuda="Pelo menos. Cerca de metade dos anúncios não informa vagas: com o filtro, eles ficam de fora.">
              <ControleMinimo {...props} grupo="vagas" />
            </Campo>
          </Secao>

          <Secao uid={uid} id="leilao" titulo="Leilão">
            <Campo rotulo="Modalidade">
              <ControleLista {...props} chave="modalidade" />
            </Campo>
            <Campo rotulo="Praça" ajuda="“Não informada” são anúncios que não dizem a praça atual.">
              <ControleLista {...props} chave="praca" />
            </Campo>
            <Campo rotulo="Data da praça" ajuda="Muitas fontes não publicam a data: ao filtrar por data, os anúncios sem data ficam de fora.">
              <CampoData
                de={rascunho.dataDe}
                ate={rascunho.dataAte}
                onChange={(de, ate) => aplicar("data", (x) => ({ ...x, dataDe: de, dataAte: ate }))}
              />
            </Campo>
          </Secao>

          <Secao uid={uid} id="condicoes" titulo="Condições">
            <ControleSimNao {...props} chave="financiamento" />
            <ControleSimNao {...props} chave="fgts" />
            <ControleSimNao {...props} chave="parcelamento" />
            <Divisor />
            <Campo rotulo="Ocupação" ajuda="Quase nenhuma fonte informa se o imóvel está ocupado. Na dúvida, trate como ocupado e confira o edital.">
              <ControleLista {...props} chave="ocupacao" />
            </Campo>
            <Campo rotulo="Natureza">
              <ControleLista {...props} chave="natureza" />
            </Campo>
            <Campo rotulo="Fonte">
              <ControleLista {...props} chave="fonte" />
            </Campo>
          </Secao>

          <Secao uid={uid} id="riscos" titulo="Riscos" selo={lente ? "Luneta" : undefined}>
            {lente ? (
              <Travado
                titulo="Filtrar por risco é do plano Luneta"
                texto="Esconda imóveis ocupados, com dívidas ou com ação judicial, e veja só os que têm pontos positivos."
                onUpsell={onUpsell}
              />
            ) : (
              <>
                <Campo rotulo="Esconder imóveis com…" ajuda="Vale também para as tags ainda em revisão.">
                  <ControleTags {...props} modo="semTags" severidades={["grave", "atencao"]} rotulo="Esconder imóveis com" />
                </Campo>
                <Campo rotulo="Só imóveis com…" ajuda="Só conta tag confirmada (as em revisão não entram).">
                  <ControleTags {...props} modo="comTags" severidades={["positivo"]} rotulo="Só imóveis com" />
                </Campo>
                <p className={AJUDA}>A classificação é automática e não é garantia: confira sempre o edital.</p>
              </>
            )}
          </Secao>

          <Secao uid={uid} id="selo" titulo="Selo" selo={lente ? "Luneta" : undefined}>
            {lente ? (
              <Travado
                titulo="Selos são do plano Luneta"
                texto="Promissor, Na Mira e Alvo: os imóveis que passaram nos critérios da Luneta."
                onUpsell={onUpsell}
              />
            ) : selosDesligados ? (
              <div className="flex flex-col gap-3">
                <ControleSelo {...props} desabilitado />
                <p className="rounded-xl border border-nevoa/20 bg-nevoa/[0.06] px-3.5 py-2.5 text-[13px] leading-snug text-nevoa">{SELOS_EM_ANALISE}.</p>
              </div>
            ) : (
              <ControleSelo {...props} />
            )}
          </Secao>

          <Secao uid={uid} id="foto" titulo="Foto">
            <ControleSimNao {...props} chave="comFoto" ajuda="“Com foto”: a fonte publica ao menos uma foto do imóvel." />
          </Secao>
        </div>
      )}
    </Folha>
  );
}

function Secao({
  uid,
  id,
  titulo,
  descricao,
  selo,
  children,
}: {
  uid: string;
  id: SecaoFiltro;
  titulo: string;
  descricao?: string;
  selo?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`${uid}-${id}`}
      data-secao={id}
      aria-labelledby={`${uid}-${id}-t`}
      className="flex scroll-mt-0 flex-col gap-5 border-b border-nevoa/12 px-5 py-6 last:border-b-0 md:px-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${uid}-${id}-t`} tabIndex={-1} className="flex items-center gap-2 font-display text-[17px] leading-tight font-bold tracking-[-0.01em]">
          {titulo}
          {selo && (
            <span className="inline-flex items-center gap-1 rounded-full border border-latao/50 px-2 py-0.5 font-sans text-[10px] font-semibold tracking-[0.1em] text-latao-texto uppercase">
              <IconeCadeado tamanho={11} />
              {selo}
            </span>
          )}
        </h3>
        {descricao && <p className={AJUDA}>{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

function Divisor() {
  return <hr className="border-nevoa/12" />;
}

/** Larguras dos marcadores falsos (as mesmas sempre: não entregam quais nem quantas tags existem). */
const MARCADORES = ["w-24", "w-32", "w-20", "w-28", "w-24", "w-16"] as const;

function Travado({ titulo, texto, onUpsell }: { titulo: string; texto: string; onUpsell: (opener: HTMLElement) => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-latao/35 bg-latao/[0.06] p-4">
      <div aria-hidden="true" className="flex flex-wrap gap-2 opacity-60 blur-[2px] select-none">
        {MARCADORES.map((w, i) => (
          <span key={i} className={`block h-9 rounded-full border border-nevoa/40 bg-nevoa/10 ${w}`} />
        ))}
      </div>
      <div className="mt-4 flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-latao/60 text-latao-texto">
          <IconeCadeado tamanho={16} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm leading-snug font-semibold text-luar">{titulo}</p>
          <p className="text-[13px] leading-snug text-nevoa">{texto}</p>
        </div>
      </div>
      <button type="button" aria-haspopup="dialog" onClick={(e) => onUpsell(e.currentTarget)} className="btn-outline mt-4 w-full">
        Conhecer a Luneta
      </button>
    </div>
  );
}

