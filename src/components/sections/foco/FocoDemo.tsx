"use client";

import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { gerarImoveis } from "@/lib/demo-foco/dados";
import {
  GRUPOS_LUNETA,
  NOME_GRUPO,
  ORDENS,
  buscar,
  definirUfs,
  gruposAtivos,
  removerGrupo,
  resumoGrupo,
  sugestaoParaVazio,
  type FiltrosFoco,
  type GrupoFoco,
  type OrdemFoco,
} from "@/lib/demo-foco/busca";
import { numero } from "@/lib/catalogo/rotulos";
import { CAMPO, CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/components/catalogo/ui/estilos";
import { BOTAO_FILTROS, BOTAO_MAIS, CascaFoco, Contagem, LOTE_CELULAR, MAPA, ORDENAR, PLACEHOLDER_BUSCA, type TextosCasca } from "./Casca";
import { Folha } from "@/components/catalogo/ui/Folha";
import { IconeAjustes, IconeLupa, IconeSeta, IconeX } from "@/components/catalogo/ui/icones";
import { Popover } from "@/components/catalogo/ui/Popover";
import { semMovimento } from "@/components/catalogo/ui/useAdiado";
import { DICA, com, controleDo, type Mudar, type PropsControle } from "./controles";
import { ListaFoco } from "./ListaFoco";
import { MapaFoco } from "./MapaFoco";

/** Textos da demonstração (src/content/site.ts, FILTERS.demo), vindos da seção (servidor). */
export interface TextosFoco extends TextosCasca {
  nota: string;
}

/** Os 150 imóveis fictícios: gerados uma vez, quando o código da demonstração chega. */
const LISTA = gerarImoveis();

/** Botões rápidos: os do plano Lente e, num grupo com o selo, os da Luneta. */
const RAPIDOS_LENTE: readonly GrupoFoco[] = ["uf", "cidade", "tipo", "lance", "desagio"];
const RAPIDOS_LUNETA: readonly GrupoFoco[] = ["praca", "quartos", "area", "ocupacao", "financiamento", "nota", "metro"];

/** Nome do botão rápido (curto, para caber numa linha). */
const BOTAO: Record<GrupoFoco, string> = { ...NOME_GRUPO, nota: "Nota", metro: "Metrô perto" };

/** Largura do pop-up de cada botão (px). */
const LARGURA: Partial<Record<GrupoFoco, number>> = { uf: 340, cidade: 360, tipo: 380, lance: 420, desagio: 420, area: 420, praca: 340, quartos: 360, ocupacao: 380, financiamento: 340, nota: 380 };

/** As seções do painel "Todos os filtros" (a mesma divisão da prévia). */
const SECOES: readonly { id: string; rotulo: string; grupos: readonly GrupoFoco[]; luneta?: true }[] = [
  { id: "local", rotulo: "Localização", grupos: ["uf", "cidade"] },
  { id: "tipo", rotulo: "Tipo", grupos: ["tipo"] },
  { id: "valores", rotulo: "Valores", grupos: ["lance", "desagio"] },
  { id: "leilao", rotulo: "Leilão", grupos: ["praca"], luneta: true },
  { id: "caracteristicas", rotulo: "Características", grupos: ["quartos", "area"], luneta: true },
  { id: "condicoes", rotulo: "Condições", grupos: ["ocupacao", "financiamento"], luneta: true },
  { id: "entorno", rotulo: "Entorno", grupos: ["nota", "metro"], luneta: true },
];

/** Controles que já trazem o próprio rótulo visível (faixas e Qualquer/Sim/Não). */
const COM_ROTULO: ReadonlySet<GrupoFoco> = new Set(["lance", "desagio", "area", "financiamento"]);

const nada = () => () => {};
function useMidia(consulta: string) {
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
const useNoNavegador = () =>
  useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );

/** A contagem "corre" até o número novo (instantânea com "reduzir movimento"), como na prévia. */
function useContagem(valor: number, ms = 280) {
  const [mostrado, setMostrado] = useState(valor);
  const atual = useRef(valor);
  useEffect(() => {
    const de = atual.current;
    if (de === valor) return;
    const t0 = performance.now();
    const instantaneo = semMovimento();
    let raf = 0;
    const passo = (t: number) => {
      const p = instantaneo ? 1 : Math.min(1, (t - t0) / ms);
      const v = Math.round(de + (valor - de) * (1 - Math.pow(1 - p, 3)));
      atual.current = v;
      setMostrado(v);
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor, ms]);
  return mostrado;
}

/** O aviso para leitores de tela espera a pessoa parar de mexer (arrastar um cursor não vira uma enxurrada de avisos). */
function useAvisoAdiado(texto: string, ms = 700) {
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setAviso(texto), ms);
    return () => window.clearTimeout(t);
  }, [texto, ms]);
  return aviso;
}

/** Selo "Luneta" (filtro do plano Luneta, que funciona nesta demonstração). */
function SeloLuneta({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border border-latao/55 px-1.5 py-[3px] text-[10px] leading-none font-semibold tracking-[0.1em] text-latao-texto uppercase ${className}`}>
      <span className="sr-only">(plano </span>
      {texto}
      <span className="sr-only">)</span>
    </span>
  );
}

/** Corpo do pop-up de um botão rápido: título, frase de apoio, controle e o rodapé com Limpar, total e Pronto. */
function CorpoRapido({ g, p, total, fechar, luneta }: { g: GrupoFoco; p: PropsControle; total: number; fechar: () => void; luneta: string }) {
  const ativo = resumoGrupo(p.f, g) !== null;
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 p-4 pb-5">
        <div className="flex flex-col gap-1">
          <p className={`${EYEBROW} flex items-center gap-2`}>
            {NOME_GRUPO[g]}
            {GRUPOS_LUNETA.has(g) && <SeloLuneta texto={luneta} />}
          </p>
          {DICA[g] && <p className="text-[13px] leading-snug text-nevoa">{DICA[g]}</p>}
        </div>
        {controleDo(g, p, false)}
      </div>
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-nevoa/15 bg-tinta px-4 py-3">
        <button
          type="button"
          disabled={!ativo}
          onClick={() => p.mudar((x) => removerGrupo(x, g))}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-[13px] font-semibold text-luar underline-offset-4 hover:underline disabled:cursor-default disabled:text-nevoa/55 disabled:no-underline pointer-fine:min-h-9"
        >
          Limpar
        </button>
        <span className="ml-auto text-[13px] text-nevoa tabular-nums">
          {numero(total)} {total === 1 ? "imóvel" : "imóveis"}
        </span>
        <button type="button" onClick={fechar} className="btn-primary min-h-11 px-5 text-sm pointer-fine:min-h-9">
          Pronto
        </button>
      </div>
    </div>
  );
}

/**
 * Demonstração dos filtros da landing ("Ajuste o foco. A lista responde na hora."), com 150 imóveis fictícios e as
 * peças dos filtros da prévia:
 * - computador: busca, botões rápidos (os do Lente e, num grupo com o selo, os da Luneta) que abrem um pop-up e
 *   aplicam na hora, "Todos os filtros" (a folha com tudo), o total que corre, "Limpar" e "Ordenar";
 * - celular e tablet: a mesma busca, "Filtros" e os botões rápidos numa linha que rola de lado; cada botão abre a
 *   folha já na seção dele;
 * - a lista (com animação de entrada e de troca de lugar) e o mapinha por estado respondem a cada toque e a cada
 *   arraste, sem rede: filtrar e contar os 150 leva menos de 1 ms (src/lib/demo-foco/busca.ts).
 */
export function FocoDemo({ textos }: { textos: TextosFoco }) {
  const uid = useId();
  const [f, setF] = useState<FiltrosFoco>({});
  const [ordem, setOrdem] = useState<OrdemFoco>("desagio");
  const [destaque, setDestaque] = useState<string | null>(null);
  const [painel, setPainel] = useState<{ aberto: boolean; secao?: string }>({ aberto: false });
  const [mais, setMais] = useState(0);
  const abridor = useRef<HTMLElement | null>(null);
  const corpoPainel = useRef<HTMLDivElement>(null);
  const computador = useMidia("(min-width: 1024px)");
  const largo = useMidia("(min-width: 768px)");
  const noNavegador = useNoNavegador();

  const r = useMemo(() => buscar(LISTA, f, ordem), [f, ordem]);
  // filtro novo: a lista volta ao primeiro lote
  const mudar: Mudar = useCallback((fn) => {
    setF(fn);
    setMais(0);
  }, []);
  const p: PropsControle = { f, r, mudar };
  const ativos = gruposAtivos(f);
  const nAtivos = ativos.filter((g) => g !== "q").length;
  const mostrado = useContagem(r.total);
  const aviso = useAvisoAdiado(`${numero(r.total)} ${r.total === 1 ? "imóvel" : "imóveis"} com esses filtros`);
  // celular: 6 por vez (sem rolagem dentro da página); computador: a lista rola dentro do quadro
  const lote = largo ? 40 : LOTE_CELULAR;
  const limite = lote + mais;

  const limpar = () => mudar(() => ({}));
  const abrirPainel = (opener: HTMLElement | null, secao?: string) => {
    abridor.current = opener;
    setPainel({ aberto: true, secao });
  };

  // a folha abre já na seção do botão tocado
  useEffect(() => {
    if (!painel.aberto || !painel.secao) return;
    const id = requestAnimationFrame(() => {
      const el = document.getElementById(`${uid}-secao-${painel.secao}`);
      if (el && corpoPainel.current) corpoPainel.current.scrollTop = el.offsetTop - 8;
    });
    return () => cancelAnimationFrame(id);
  }, [painel, uid]);

  // A lista e o mapinha desenham com o resultado adiado (useDeferredValue): o botão tocado, o total e a pílula respondem
  // já, e a lista e o mapa vêm logo depois, num desenho que o React pode interromper. Os dois elementos são memorizados
  // (o mesmo objeto enquanto os dados adiados não mudam), para o desenho urgente não passar por eles. No celular com a
  // CPU 4× mais lenta, ligar o "Metrô perto" ia a 160–224 ms (revisão final da rodada 5, R5-TEC-07).
  const rd = useDeferredValue(r);
  const fd = useDeferredValue(f);
  const alternarUf = useCallback(
    (uf: string) => mudar((x) => definirUfs(x, (x.uf ?? []).includes(uf) ? x.uf!.filter((u) => u !== uf) : [...(x.uf ?? []), uf])),
    [mudar],
  );
  const mapaFoco = useMemo(
    () => <MapaFoco itens={rd.itens} ufsEscolhidas={fd.uf ?? []} destaque={destaque} onDestaque={setDestaque} onAlternarUf={alternarUf} className={MAPA} />,
    [rd, fd, destaque, alternarUf],
  );
  const listaFoco = useMemo(() => {
    const sugestao = rd.total === 0 ? sugestaoParaVazio(LISTA, fd) : null;
    const vazio = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[15px] font-semibold text-luar">Nenhum imóvel com esses filtros.</p>
        {sugestao && (
          <button type="button" onClick={() => mudar((x) => removerGrupo(x, sugestao.grupo))} className={`${CHIP} ${CHIP_OFF}`}>
            {sugestao.grupo === "q" ? `Tirar a busca ${resumoGrupo(fd, "q")}` : `Tirar “${resumoGrupo(fd, sugestao.grupo)}”`}
            <span className="text-xs text-nevoa tabular-nums">
              mostra {numero(sugestao.total)}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => mudar(() => ({}))}
          className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
        >
          Limpar todos os filtros
        </button>
      </div>
    );
    const restantes = rd.total - Math.min(limite, rd.total);
    const rodapeLista =
      restantes > 0 ? (
        <button type="button" onClick={() => setMais((m) => m + lote)} className={BOTAO_MAIS}>
          Mostrar mais {numero(Math.min(lote, restantes))}
          <span className="ml-1 text-nevoa tabular-nums">(faltam {numero(restantes)})</span>
        </button>
      ) : rd.total > 0 ? (
        <p className="text-center text-xs text-nevoa">Fim da lista · {textos.selo.toLowerCase()} com imóveis fictícios</p>
      ) : null;
    return <ListaFoco itens={rd.itens} limite={limite} destaque={destaque} onDestaque={setDestaque} rodape={rodapeLista} vazio={vazio} rolaPorDentro={largo} />;
  }, [rd, fd, limite, lote, destaque, largo, mudar, textos.selo]);

  /** Botão rápido: no computador, pop-up ancorado; abaixo de 1024 px, abre a folha na seção do filtro. */
  const botaoRapido = (g: GrupoFoco) => {
    const resumo = resumoGrupo(f, g);
    const ativo = resumo !== null;
    const luneta = GRUPOS_LUNETA.has(g);
    const nome = BOTAO[g];
    const classe = (aberto: boolean) =>
      `${CHIP} ${ativo ? CHIP_ON : CHIP_OFF} shrink-0 gap-1.5 ${ativo ? "pr-12 pointer-fine:pr-9" : "pr-3 pointer-fine:pr-2.5"} ${aberto ? "shadow-[0_0_0_3px_rgba(201,162,77,.22)]" : ""}`;
    const conteudo = (aberto: boolean) => (
      <>
        {/* leading maior que 1: o "truncate" corta o acento das maiúsculas ("Área") com a altura de linha 1 */}
        <span className="max-w-[180px] truncate py-px leading-[1.25] tabular-nums">{resumo ?? nome}</span>
        {!ativo && <IconeSeta className={`text-nevoa transition-transform duration-150 motion-reduce:transition-none ${aberto ? "rotate-180" : ""}`} />}
        {luneta && <span className="sr-only"> (filtro do plano Luneta)</span>}
      </>
    );
    // metrô: um toque liga e desliga (não precisa de pop-up)
    if (g === "metro") {
      return (
        <button
          key={g}
          type="button"
          aria-pressed={!!f.metro}
          onClick={() => mudar((x) => com(x, "metro", x.metro ? undefined : true))}
          className={`${CHIP} ${f.metro ? CHIP_ON : CHIP_OFF} shrink-0 gap-1.5 pr-3 pointer-fine:pr-2.5`}
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3.5 text-latao-texto" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <rect x="2.5" y="1.5" width="7" height="7" rx="2" />
            <path d="M4 10.5 3 11.5M8 10.5l1 1M2.5 5.5h7" />
          </svg>
          {/* o nome não muda com o estado (botão de alternar: o leitor de tela diz "pressionado"; R5-TEC-11) */}
          {nome}
          <span className={`text-xs tabular-nums ${f.metro ? "text-latao-texto" : "text-nevoa"}`}>
            <span className="sr-only">, </span>
            {numero(r.facetas.metro)}
            <span className="sr-only"> imóveis (filtro do plano Luneta)</span>
          </span>
        </button>
      );
    }
    return (
      <span key={g} className="relative inline-flex shrink-0">
        {computador ? (
          <Popover
            rotulo={NOME_GRUPO[g]}
            largura={LARGURA[g]}
            focarAoAbrir={g !== "uf" && g !== "cidade"}
            gatilho={{ ariaLabel: ativo ? `${NOME_GRUPO[g]}: ${resumo}${luneta ? " (filtro do plano Luneta)" : ""}` : undefined, className: classe, conteudo }}
          >
            {({ fechar }) => <CorpoRapido g={g} p={p} total={r.total} fechar={fechar} luneta={textos.luneta} />}
          </Popover>
        ) : (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={ativo ? `${NOME_GRUPO[g]}: ${resumo}${luneta ? " (filtro do plano Luneta)" : ""}` : undefined}
            onClick={(e) => abrirPainel(e.currentTarget, SECOES.find((s) => s.grupos.includes(g))?.id)}
            className={classe(false)}
          >
            {conteudo(false)}
          </button>
        )}
        {ativo && (
          <button
            type="button"
            aria-label={`Limpar ${NOME_GRUPO[g].toLowerCase()}: ${resumo}`}
            title={`Limpar ${NOME_GRUPO[g].toLowerCase()}`}
            onClick={() => mudar((x) => removerGrupo(x, g))}
            className="absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-latao-texto transition-colors duration-150 hover:bg-latao hover:text-noite-fixa pointer-fine:right-1 pointer-fine:size-7"
          >
            <IconeX tamanho={12} />
          </button>
        )}
      </span>
    );
  };

  return (
    <CascaFoco
      textos={textos}
      total={LISTA.length}
      busca={
        <label className="relative min-w-0 flex-1 lg:max-w-[420px]">
          <span className="sr-only">Buscar por cidade, bairro, estado ou tipo</span>
          <IconeLupa tamanho={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-nevoa" />
          <input
            type="text"
            value={f.q ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              mudar((x) => com(x, "q", v ? v : undefined));
            }}
            placeholder={largo ? PLACEHOLDER_BUSCA[1] : PLACEHOLDER_BUSCA[0]}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            // espaço à direita só com o × de limpar
            className={`${CAMPO} ${f.q ? "pr-11" : "pr-3"} pl-10`}
          />
          {f.q && (
            <button
              type="button"
              aria-label="Limpar a busca"
              onClick={() => mudar((x) => com(x, "q", undefined))}
              className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-nevoa transition-colors hover:text-luar pointer-fine:size-8"
            >
              <IconeX />
            </button>
          )}
        </label>
      }
      botaoFiltros={
        <button type="button" aria-haspopup="dialog" aria-expanded={painel.aberto} onClick={(e) => abrirPainel(e.currentTarget)} className={`${BOTAO_FILTROS} ${nAtivos ? CHIP_ON : CHIP_OFF}`}>
          <IconeAjustes tamanho={17} />
          <span className="lg:hidden">Filtros</span>
          <span className="max-lg:hidden">Todos os filtros</span>
          {nAtivos > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-latao px-1.5 text-[11px] font-bold text-noite-fixa tabular-nums">
              {nAtivos}
              <span className="sr-only"> {nAtivos === 1 ? "ativo" : "ativos"}</span>
            </span>
          )}
        </button>
      }
      rapidosLente={RAPIDOS_LENTE.map((g) => (
        <span key={g} className="snap-start">
          {botaoRapido(g)}
        </span>
      ))}
      rapidosLuneta={RAPIDOS_LUNETA.map((g) => botaoRapido(g))}
      contagem={
        <>
          <Contagem mostrado={numero(mostrado)} total={LISTA.length} />
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {aviso}
          </span>
        </>
      }
      limpar={
        ativos.length > 0 && (
          <button type="button" onClick={limpar} className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-[13px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8">
            Limpar filtros
          </button>
        )
      }
      ordenar={
        <>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemFoco)} className={ORDENAR}>
            {ORDENS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
                {o.luneta ? ` · ${textos.luneta}` : ""}
              </option>
            ))}
          </select>
          <IconeSeta className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-nevoa" />
        </>
      }
      mapa={mapaFoco}
      lista={listaFoco}
      rodape={
        <>
          <p className="sr-only">{textos.nota}</p>
      {/* ---- "Todos os filtros" (e, abaixo de 1024 px, cada botão rápido) ---- */}
      {noNavegador && (
        <Folha
          aberto={painel.aberto}
          onFechar={() => setPainel({ aberto: false })}
          titulo="Filtros"
          subtitulo={`${numero(r.total)} de ${LISTA.length} imóveis fictícios`}
          openerRef={abridor}
          corpoRef={corpoPainel}
          rodape={
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!ativos.length}
                onClick={limpar}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-[13px] font-semibold text-luar underline-offset-4 hover:underline disabled:cursor-default disabled:text-nevoa/55 disabled:no-underline"
              >
                Limpar tudo
              </button>
              <button type="button" onClick={() => setPainel({ aberto: false })} className="btn-primary ml-auto min-h-12 px-6 text-[15px]">
                {r.total ? `Ver ${numero(r.total)} ${r.total === 1 ? "imóvel" : "imóveis"}` : "Nenhum imóvel: ajuste os filtros"}
              </button>
            </div>
          }
        >
          <div className="flex flex-col pb-4">
            {SECOES.map((s, k) => (
              <section key={s.id} id={`${uid}-secao-${s.id}`} aria-labelledby={`${uid}-t-${s.id}`} className="flex flex-col gap-5 border-b border-nevoa/12 px-5 py-6 last:border-b-0 md:px-6">
                {s.luneta && !SECOES[k - 1]?.luneta && (
                  <div className="-mt-1 rounded-2xl border border-dashed border-latao/45 bg-latao/[0.05] px-4 py-3 text-[13px] leading-snug text-nevoa">
                    <SeloLuneta texto={textos.luneta} className="mr-2 align-[1px]" />
                    {textos.lunetaAjuda}
                  </div>
                )}
                <h3 id={`${uid}-t-${s.id}`} className={`${EYEBROW} flex items-center gap-2`}>
                  {s.rotulo}
                  {s.luneta && <SeloLuneta texto={textos.luneta} />}
                </h3>
                {s.grupos.map((g) => (
                  <Bloco
                    key={g}
                    // sem rótulo repetido: "Tipo" sob a seção "Tipo"; as faixas e o Qualquer/Sim/Não já trazem o deles
                    rotulo={COM_ROTULO.has(g) || NOME_GRUPO[g] === s.rotulo ? undefined : NOME_GRUPO[g]}
                    ajuda={DICA[g]}
                    ajudaDepois={COM_ROTULO.has(g)}
                  >
                    {controleDo(g, { ...p, noPainel: true })}
                  </Bloco>
                ))}
              </section>
            ))}
          </div>
        </Folha>
      )}
        </>
      }
    />
  );
}

/** Um filtro no painel: rótulo, frase de apoio e o controle (a frase vai depois quando o controle traz o rótulo). */
function Bloco({ rotulo, ajuda, ajudaDepois = false, children }: { rotulo?: string; ajuda?: string; ajudaDepois?: boolean; children: ReactNode }) {
  const frase = ajuda && <p className={`text-xs leading-snug text-nevoa ${ajudaDepois ? "" : "-mt-1"}`}>{ajuda}</p>;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {rotulo && <span className="text-[13px] leading-tight font-semibold text-luar">{rotulo}</span>}
      {!ajudaDepois && frase}
      {children}
      {ajudaDepois && frase}
    </div>
  );
}

