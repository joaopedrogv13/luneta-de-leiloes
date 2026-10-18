"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BotaoFavoritar } from "@/components/catalogo/cartoes/partes";
import { IconeAneis } from "@/components/catalogo/ui/icones";
import { pode } from "@/lib/catalogo/planos";
import { SeverityIcon } from "@/components/niveis/severity";
import { data, dataHora, moeda, MODALIDADE_ROTULO, PRACA_ROTULO } from "@/lib/catalogo/rotulos";
import type { ImovelResumo, Recurso, Severidade } from "@/lib/catalogo/tipos";
import { useImovel } from "./ContextoImovel";
import { fraseDesagio } from "./formato";
import { AnelNota } from "@/components/catalogo/localizacao/visual";
import { IconeAlerta, IconeCadeado, IconeCalculadora, IconeCalendario, IconeCompartilhar, IconeExterno, IconeSetaDireita } from "./icones";
import { CHAVE_BARRA_LANCE, gravarPreferencia, lerPreferencia } from "./preferencias";
import { BotaoRecolher } from "./ResumoRecolhivel";

export interface DadosResumo extends Pick<ImovelResumo, "id" | "titulo" | "lance" | "avaliacao" | "desagio" | "modalidade" | "praca" | "dataPraca" | "coletadoEm"> {
  fonteNome: string;
  /** anúncio na fonte (null nos exemplos fictícios) */
  anuncio: string | null;
  exemplo: boolean;
  /** "em 5 dias", "já passou" (calculado no servidor) */
  falta: { texto: string; passou: boolean } | null;
  /** quantas tags por gravidade (confirmadas) e em revisão (e, delas, as graves); null no plano Lente */
  riscos: { grave: number; atencao: number; positivo: number; info: number; revisao: number; revisaoGrave: number } | null;
  /**
   * Nota de localização, pequena, com o link para a seção: o número (null sem nota ou na cidade pequena), a linha curta
   * e o alerta de área de risco. null no Lente e sem o dado.
   */
  local?: { nota: number | null; aproximada: boolean; linha: string; risco: string | null } | null;
}

/** Id do bloco de ações: a barra do celular aparece quando ele sai da tela. */
const ID_ACOES = "resumo-acoes";

const BOTAO_SECUNDARIO =
  "relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-nevoa/35 px-3.5 text-[13px] leading-none font-medium whitespace-nowrap text-nevoa transition-[background-color,border-color,color,scale] duration-150 ease-luneta hover:border-latao hover:text-luar active:scale-[0.96] motion-reduce:transition-none pointer-fine:min-h-9";

/** Venda direta: preço fixo, sem disputa ("Preço de venda" e "Simular compra", e não "Lance mínimo" e "Simular lance"). */
const precoFixo = (d: Pick<DadosResumo, "modalidade">) => d.modalidade === "venda_direta";

const PLURAL: Record<Severidade, [string, string]> = {
  grave: ["grave", "graves"],
  atencao: ["atenção", "atenção"],
  positivo: ["positivo", "positivos"],
  info: ["informativo", "informativos"],
};

function Compartilhar({ titulo, className = "", icone = false }: { titulo: string; className?: string; /** só o ícone, num botão redondo de 44 px */ icone?: boolean }) {
  const { avisar } = useImovel();
  const compartilhar = async () => {
    const url = window.location.href.split("#")[0]!;
    // no toque (celular, tablet), a folha de compartilhar do sistema (WhatsApp, mensagens...) vem primeiro
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: titulo, url });
      } catch {
        // a pessoa fechou a folha: nada a fazer
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      avisar("Link copiado.");
      return;
    } catch {
      // sem acesso à área de transferência: tenta o compartilhar do sistema
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: titulo, url });
        return;
      }
    } catch {
      return; // a pessoa cancelou
    }
    avisar("Não deu para copiar: copie o endereço na barra do navegador.");
  };
  if (icone) {
    return (
      <button
        type="button"
        onClick={compartilhar}
        title="Compartilhar"
        className={`inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-nevoa/30 bg-tinta/80 text-nevoa transition-[border-color,color,scale] duration-150 ease-luneta hover:border-latao hover:text-luar active:scale-[0.92] motion-reduce:transition-none ${className}`}
      >
        <IconeCompartilhar tamanho={17} />
        <span className="sr-only">Compartilhar (link desta página)</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={compartilhar} className={`${BOTAO_SECUNDARIO} ${className}`}>
      <IconeCompartilhar tamanho={15} />
      Compartilhar
      <span className="sr-only"> (link desta página)</span>
    </button>
  );
}

/**
 * Celular: Favoritar e Compartilhar como ícones de 44 px ao lado do título (no cartão do preço, eram uma linha
 * inteira de botões).
 */
export function AcoesTitulo({
  imovel,
  className = "",
}: {
  imovel: Pick<ImovelResumo, "id" | "titulo" | "bairro" | "cidade" | "uf" | "lance">;
  className?: string;
}) {
  const { plano, ehFavorito, alternarFavorito, pedirLuneta } = useImovel();
  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <BotaoFavoritar imovel={imovel} plano={plano} favorito={ehFavorito(imovel.id)} onFavoritar={alternarFavorito} onUpsell={pedirLuneta} icone />
      <Compartilhar titulo={imovel.titulo} icone />
    </div>
  );
}

/** Uma linha do resumo que é da Luneta (plano Lente): abre a janela com o texto do recurso. */
function LinhaTravada({ recurso, titulo, texto }: { recurso: Recurso; titulo: string; texto: string }) {
  const { pedirLuneta } = useImovel();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(e) => pedirLuneta(e.currentTarget, recurso)}
      className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1 text-left text-sm transition-colors hover:bg-nevoa/[0.07]"
    >
      <span>
        <span className="block font-medium text-luar">{titulo}</span>
        <span className="mt-1 block text-[13px] text-nevoa">{texto}</span>
      </span>
      <IconeCadeado tamanho={16} className="text-latao-texto" />
    </button>
  );
}

/**
 * Resumo fixo da coluna direita (no celular, logo abaixo do título): lance mínimo, avaliação e deságio,
 * praça e data, "Ver anúncio na fonte", "Simular lance", Favoritar (Luneta) e Compartilhar, e o resumo dos
 * riscos com link para a seção.
 * - Celular: a parte de baixo do "cartão de decisão" (o cabeçalho é a de cima); "Ver anúncio" e "Simular" lado a
 *   lado; Favoritar e Compartilhar ficam ao lado do título.
 * - Tablet em pé: na largura toda, com duas colunas por dentro (preço e praça | ações) e os riscos embaixo.
 */
export function ResumoLateral({ d }: { d: DadosResumo }) {
  const { plano, ehFavorito, alternarFavorito, pedirLuneta } = useImovel();
  const desagio = fraseDesagio(d.desagio);
  const abaixo = d.desagio !== null && d.desagio > 0;
  const partesPraca = [MODALIDADE_ROTULO[d.modalidade], d.praca ? PRACA_ROTULO[d.praca] : null].filter(Boolean).join(" · ");

  return (
    <section
      aria-labelledby="resumo-preco-titulo"
      className="relative rounded-3xl border border-nevoa/20 bg-tinta p-5 sm:p-6 max-md:rounded-t-none max-md:border-t-nevoa/12 max-md:pt-4 md:max-lg:grid md:max-lg:grid-cols-[minmax(0,1fr)_17rem] md:max-lg:gap-x-8 [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_12px_32px_-14px_rgba(15,24,48,.18)] max-md:[[data-theme=light]_&]:shadow-[0_12px_32px_-14px_rgba(15,24,48,.18)]"
    >
      <h2 id="resumo-preco-titulo" className="sr-only">
        Preço, praça e ações
      </h2>
      <BotaoRecolher />
      <div className="min-w-0">
        <p className="text-[11px] leading-none font-semibold tracking-[0.14em] text-nevoa uppercase">{precoFixo(d) ? "Preço de venda" : "Lance mínimo"}</p>
        <p className="mt-2 font-display text-[34px] leading-none font-bold tracking-[-0.03em] whitespace-nowrap text-luar sm:text-[38px]">{moeda(d.lance)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm text-nevoa">
          {d.avaliacao !== null ? (
            <span>
              Avaliação <span className="font-medium text-luar/90 tabular-nums">{moeda(d.avaliacao)}</span>
            </span>
          ) : (
            <span>Avaliação não informada pela fonte</span>
          )}
          {desagio && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] leading-none font-semibold ${
                abaixo ? "bg-latao/15 text-latao-texto ring-1 ring-latao/40" : "bg-nevoa/12 text-luar ring-1 ring-nevoa/30"
              }`}
            >
              {abaixo ? `−${d.desagio}%` : desagio.charAt(0).toUpperCase() + desagio.slice(1)}
              {abaixo && <span className="sr-only">, {desagio}</span>}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-start gap-3 border-t border-nevoa/15 pt-4">
          <IconeCalendario tamanho={18} className="mt-0.5 text-nevoa" />
          <div className="min-w-0 text-sm leading-snug">
            <p className="font-medium text-luar">{partesPraca}</p>
            {d.dataPraca ? (
              <p className="mt-1 text-nevoa">
                <span className="text-luar/90 tabular-nums">{dataHora(d.dataPraca)}</span>
                {d.falta && (
                  <span className={d.falta.passou ? "text-aten" : ""}>
                    {" "}
                    · {d.falta.texto}
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-nevoa">Data não informada pela fonte</p>
            )}
          </div>
      </div>
      </div>

      {/* celular: "Ver anúncio" e "Simular" lado a lado (com o nome inteiro para leitores de tela) */}
      <div id={ID_ACOES} className="mt-5 flex flex-col gap-2.5 max-md:mt-4 md:max-lg:mt-0 md:max-lg:self-center">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:flex md:flex-col md:gap-2.5">
          {d.anuncio ? (
            <a href={d.anuncio} target="_blank" rel="noopener noreferrer" className="btn-primary w-full max-md:px-4!">
              {/* um item só no flex do botão (o gap separava "anúncio" de "na fonte") */}
              <span>
                Ver anúncio<span className="max-md:sr-only"> na fonte</span>
              </span>
              <IconeExterno tamanho={17} />
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          ) : (
            <p className="rounded-2xl border border-dashed border-nevoa/35 px-4 py-3 text-center text-[13px] leading-snug text-nevoa max-md:col-span-2 max-md:text-sm">
              Exemplo fictício: não há anúncio real para abrir.
            </p>
          )}
          {pode(plano, "simulador") ? (
            <a href="#simulador" className={`${d.anuncio ? "btn-outline gap-2" : "btn-primary"} w-full max-md:px-4! ${d.anuncio ? "" : "max-md:col-span-2"}`}>
              <IconeCalculadora tamanho={18} />
              <span>
                Simular<span className={d.anuncio ? "max-md:sr-only" : ""}> {precoFixo(d) ? "compra" : "lance"}</span>
              </span>
            </a>
          ) : (
            // Lente: o simulador e o PDF são da Luneta; no lugar de "Simular", o convite (a janela com tudo o que ela tem)
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={(e) => pedirLuneta(e.currentTarget)}
              className={`${d.anuncio ? "btn-outline gap-2" : "btn-primary"} w-full max-md:px-4! ${d.anuncio ? "" : "max-md:col-span-2"}`}
            >
              <IconeAneis tamanho={17} />
              <span>
                <span className={d.anuncio ? "max-md:sr-only" : ""}>Conhecer a </span>Luneta
              </span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 max-md:hidden">
          <BotaoFavoritar
            imovel={d}
            plano={plano}
            favorito={ehFavorito(d.id)}
            onFavoritar={alternarFavorito}
            onUpsell={pedirLuneta}
            className="w-full"
          />
          <Compartilhar titulo={d.titulo} className="w-full" />
        </div>
      </div>

      <div className="mt-5 border-t border-nevoa/15 pt-4 max-md:mt-4 md:max-lg:col-span-2">
        {d.riscos ? (
          <a
            href="#riscos"
            className="group/riscos -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-1 text-sm no-underline transition-colors hover:bg-nevoa/[0.07]"
          >
            <span className="min-w-0">
              <span className="block font-medium text-luar">Riscos e alertas</span>
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-nevoa">
                {(["grave", "atencao", "positivo"] as const).map((s) =>
                  d.riscos![s] > 0 ? (
                    <span key={s} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <SeverityIcon severity={s} size={12} />
                      {d.riscos![s]} {PLURAL[s][d.riscos![s] === 1 ? 0 : 1]}
                    </span>
                  ) : null,
                )}
                {d.riscos.revisao > 0 && (
                  <span>
                    <span className="whitespace-nowrap">{d.riscos.revisao} em revisão</span>
                    {/* um risco grave ainda sem leitura humana não pode sumir no "em revisão" */}
                    {d.riscos.revisaoGrave > 0 && (
                      <span className="font-medium whitespace-nowrap text-grave-texto">
                        {" "}
                        ({d.riscos.revisaoGrave} {d.riscos.revisaoGrave === 1 ? "possível risco grave" : "possíveis riscos graves"})
                      </span>
                    )}
                  </span>
                )}
                {d.riscos.grave + d.riscos.atencao + d.riscos.positivo + d.riscos.revisao === 0 && <span>nenhum alerta nos dados da fonte</span>}
              </span>
            </span>
            <IconeSetaDireita tamanho={16} className="text-nevoa transition-transform duration-150 group-hover/riscos:translate-x-0.5 motion-reduce:transition-none" />
          </a>
        ) : (
          <LinhaTravada recurso="tags" titulo="Riscos e alertas" texto="Tags de risco e selo são do plano Luneta" />
        )}
        {!pode(plano, "localizacao") && <LinhaTravada recurso="localizacao" titulo="Nota de localização" texto="A nota do entorno é do plano Luneta" />}
        {d.local && (
          <a
            href="#localizacao"
            className="group/local -mx-2 mt-1 flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm no-underline transition-colors hover:bg-nevoa/[0.07]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <AnelNota nota={d.local.nota} aproximada={d.local.aproximada} tamanho={40} />
              <span className="min-w-0">
                <span className="block font-medium text-luar">
                  Nota de localização
                  {d.local.nota !== null && (
                    <span className="sr-only">
                      : {d.local.aproximada ? "cerca de " : ""}
                      {d.local.nota} de 100
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-nevoa">{d.local.linha}</span>
                {d.local.risco && (
                  <span className="mt-1 flex items-start gap-1.5 text-[13px] leading-snug font-medium text-aten">
                    <IconeAlerta tamanho={14} className="mt-px" />
                    {d.local.risco.charAt(0).toUpperCase() + d.local.risco.slice(1)}
                  </span>
                )}
              </span>
            </span>
            <IconeSetaDireita tamanho={16} className="shrink-0 text-nevoa transition-transform duration-150 group-hover/local:translate-x-0.5 motion-reduce:transition-none" />
          </a>
        )}
        <p className="mt-3 text-xs leading-snug text-nevoa max-sm:text-[13px]">
          {d.exemplo ? "Exemplo fictício, para mostrar a página." : `Fonte: ${d.fonteNome} · coletado em ${data(d.coletadoEm)}.`} Preços e datas mudam: confira o
          edital.
        </p>
      </div>
    </section>
  );
}

// Barra do lance minimizada: localStorage e, sem ele (aba anônima, bloqueio), a memória desta visita.
const ouvintesBarra = new Set<() => void>();
let barraNaMemoria: boolean | null = null;
function assinarBarra(aviso: () => void) {
  ouvintesBarra.add(aviso);
  return () => {
    ouvintesBarra.delete(aviso);
  };
}
const barraMinimizada = () => barraNaMemoria ?? lerPreferencia(CHAVE_BARRA_LANCE) === "min";
function definirBarraMinimizada(v: boolean) {
  barraNaMemoria = v;
  gravarPreferencia(CHAVE_BARRA_LANCE, v ? "min" : null);
  for (const f of ouvintesBarra) f();
}

/**
 * Celular: barra fixa no pé da tela com o lance e "Ver anúncio" (ou "Simular", nos exemplos; no Lente, "Conhecer a
 * Luneta", porque o simulador é da Luneta). Aparece
 * quando os botões do resumo saem da tela por cima; some de novo quando eles voltam. A pessoa pode minimizá-la
 * (fica uma pílula pequena no canto com o lance, para trazê-la de volta); a escolha fica salva no navegador.
 */
export function BarraInferior({ d }: { d: DadosResumo }) {
  const { plano, pedirLuneta } = useImovel();
  const [visivel, setVisivel] = useState(false);
  // a escolha salva vale depois da hidratação (a barra só aparece depois de rolar: não há o que piscar)
  const minimizada = useSyncExternalStore(assinarBarra, barraMinimizada, () => false);
  useEffect(() => {
    const alvo = document.getElementById(ID_ACOES);
    if (!alvo) return;
    // pela rolagem (e não por IntersectionObserver): um salto de âncora que passa direto pelos botões, sem
    // cruzar a tela, não dispararia o observador
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      setVisivel(alvo.getBoundingClientRect().bottom < 0);
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    agendar();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
    };
  }, []);
  const minimizar = (v: boolean) => {
    definirBarraMinimizada(v);
    // o foco vai para o controle que fica à vista (a pílula, ou o botão de minimizar da barra que voltou)
    requestAnimationFrame(() => document.getElementById(v ? "barra-lance-abrir" : "barra-lance-minimizar")?.focus({ preventScroll: true }));
  };
  const desagio = d.desagio !== null && d.desagio > 0 ? `−${d.desagio}%` : null;
  const barra = visivel && !minimizada;
  const pilula = visivel && minimizada;
  return (
    <>
      <aside
        aria-label={precoFixo(d) ? "Preço e anúncio" : "Lance e anúncio"}
        data-barra-fixa=""
        inert={!barra}
        aria-hidden={!barra}
        // tela baixa (celular deitado): a barra some e o preço fica na pílula da barra das seções (PilulaResumo)
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-nevoa/20 bg-noite/95 pt-3 pr-4 pl-1.5 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md transition-[translate,opacity] duration-200 ease-luneta motion-reduce:transition-none lg:hidden baixa:hidden [[data-theme=light]_&]:shadow-[0_-8px_24px_rgba(15,24,48,.08)] ${
          barra ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-[640px] items-center justify-between gap-2">
          <button
            id="barra-lance-minimizar"
            type="button"
            onClick={() => minimizar(true)}
            aria-label="Minimizar a barra do lance"
            title="Minimizar"
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-nevoa transition-colors hover:bg-nevoa/10 hover:text-luar"
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* o deságio fica na linha do rótulo: ao lado do preço, em 360 px (ou com 7 dígitos), ele ia para baixo do botão */}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] leading-none font-semibold tracking-[0.12em] whitespace-nowrap text-nevoa uppercase">
              {precoFixo(d) ? "Preço" : "Lance mínimo"}
              {desagio && (
                <span className="text-[11px] tracking-normal text-latao-texto normal-case">
                  {" "}
                  · {desagio}
                  <span className="sr-only"> de deságio</span>
                </span>
              )}
            </p>
            <p className="mt-1 font-display text-[clamp(18px,5.6vw,22px)] leading-none font-bold tracking-[-0.02em] whitespace-nowrap text-luar tabular-nums">{moeda(d.lance)}</p>
          </div>
          {d.anuncio ? (
            <a href={d.anuncio} target="_blank" rel="noopener noreferrer" className="btn-primary min-h-11! shrink-0 px-5! text-[14px]! max-[379px]:px-4!">
              Ver anúncio
              <IconeExterno tamanho={16} />
              <span className="sr-only"> na fonte (abre em nova aba)</span>
            </a>
          ) : pode(plano, "simulador") ? (
            <a href="#simulador" className="btn-primary min-h-11! shrink-0 px-5! text-[14px]! max-[379px]:px-4!">
              {precoFixo(d) ? "Simular compra" : "Simular lance"}
            </a>
          ) : (
            // Lente (exemplos, sem anúncio): o simulador é da Luneta
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={(e) => pedirLuneta(e.currentTarget)}
              className="btn-primary min-h-11! shrink-0 px-5! text-[14px]! max-[379px]:px-4!"
            >
              Conhecer a Luneta
            </button>
          )}
        </div>
      </aside>
      <button
        id="barra-lance-abrir"
        type="button"
        onClick={() => minimizar(false)}
        inert={!pilula}
        aria-hidden={!pilula}
        aria-label={`Mostrar a barra do ${precoFixo(d) ? "preço" : "lance"} (${precoFixo(d) ? "preço de venda" : "lance mínimo"} ${moeda(d.lance)})`}
        className={`fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-latao/45 bg-tinta/95 py-1.5 pr-2 pl-4 text-[14px] leading-none text-luar shadow-[0_10px_30px_rgba(7,11,22,.45)] backdrop-blur-md transition-[translate,opacity] duration-200 ease-luneta motion-reduce:transition-none lg:hidden baixa:hidden [[data-theme=light]_&]:shadow-[0_8px_24px_rgba(15,24,48,.16)] ${
          pilula ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[calc(100%+24px)] opacity-0"
        }`}
      >
        <span className="font-display font-bold tracking-[-0.01em] tabular-nums">{moeda(d.lance)}</span>
        {desagio && <span className="text-[12.5px] font-semibold text-latao-texto">{desagio}</span>}
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-nevoa/10 text-nevoa">
          <svg viewBox="0 0 20 20" width="16" height="16">
            <path d="M5 12l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </>
  );
}
