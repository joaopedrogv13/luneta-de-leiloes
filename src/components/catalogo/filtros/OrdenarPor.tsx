"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ordemEfetiva } from "@/lib/catalogo/filtros-rotulos";
import { ORDEM_ROTULO, ORDENS_LUNETA } from "@/lib/catalogo/rotulos";
import type { Ordem, Plano } from "@/lib/catalogo/tipos";
import { CHIP, CHIP_OFF } from "../ui/estilos";
import { IconeCadeado, IconeCheck, IconeOrdenar, IconeSeta } from "../ui/icones";
import { Popover } from "../ui/Popover";

/** Ordem do menu: as do dia a dia primeiro, as da Luneta no fim. */
const ORDENS: readonly Ordem[] = ["desagio", "lance-asc", "lance-desc", "m2-asc", "area-desc", "data", "recentes", "alertas", "selo"];

const DESCRICAO: Record<Ordem, string> = {
  desagio: "Maior desconto sobre a avaliação primeiro",
  "lance-asc": "Do lance mais baixo ao mais alto",
  "lance-desc": "Do lance mais alto ao mais baixo",
  "m2-asc": "Lance dividido pela área; sem área por último",
  "area-desc": "Imóveis maiores primeiro",
  data: "Praças mais próximas primeiro; sem data por último",
  recentes: "Coletados por último primeiro",
  alertas: "Menos tags graves e de atenção primeiro",
  selo: "Alvo, Na Mira e Promissor primeiro",
  localizacao: "Maior nota de localização primeiro; sem nota por último",
};

export const SELOS_EM_ANALISE = "Selos em análise: critérios em definição";

/**
 * "Ordenar por": lista de ordens num pop-up. No plano Lente, "Menos alertas" e "Melhor selo" aparecem
 * com cadeado e abrem o upgrade; com os selos desligados (prévia), "Melhor selo" fica desabilitado com a
 * explicação. Teclado: ↑↓ andam, Enter/Espaço escolhem, Esc fecha.
 */
export function OrdenarPor({
  ordem,
  onOrdem,
  plano,
  selosDesligados,
  onUpsell,
  compacto = false,
  indisponiveis = {},
  className = "",
}: {
  ordem: Ordem;
  onOrdem: (o: Ordem) => void;
  plano: Plano;
  selosDesligados: boolean;
  onUpsell: (opener: HTMLElement) => void;
  /**
   * Ordens que não mudariam nada nesta busca, com o porquê ("Todos os imóveis desta busca foram coletados no
   * mesmo dia"): aparecem desabilitadas, como "Melhor selo" com os selos em análise.
   */
  indisponiveis?: Partial<Record<Ordem, string>>;
  /** só o ícone e a ordem ("Ordenar:" fica para leitores de tela): a barra compacta */
  compacto?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  const lente = plano === "lente";
  // um link com "Menos alertas" aberto no Lente ordena pelo padrão: o botão mostra a que vale
  const atual = ordemEfetiva(ordem, plano, selosDesligados);

  const escolher = (o: Ordem, fechar: () => void) => {
    const travada = lente && ORDENS_LUNETA.includes(o);
    if (o === "selo" && selosDesligados && !travada) return;
    if (indisponiveis[o] && o !== atual) return;
    fechar();
    const gatilho = caixa.current?.querySelector<HTMLButtonElement>("button");
    if (travada) {
      if (gatilho) onUpsell(gatilho);
      return;
    }
    gatilho?.focus({ preventScroll: true });
    if (o !== atual) onOrdem(o);
  };

  return (
    <span ref={caixa} className={`inline-flex ${className}`}>
      <Popover
        rotulo="Ordenar por"
        posicao="bottom-end"
        largura={340}
        aberto={aberto}
        onAbertoChange={setAberto}
        focarAoAbrir={false}
        gatilho={{
          // sem aria-label: o nome é o texto visível ("Ordenar: Maior deságio"; no celular "Ordenar:" fica só
          // para leitores de tela), para quem usa comando de voz dizer o que vê (WCAG 2.5.3)
          className: (a) => `${CHIP} ${CHIP_OFF} gap-2 ${a ? "border-latao/70" : ""}`,
          conteudo: (a) => (
            <>
              <IconeOrdenar className="text-nevoa" />
              <span className={`text-nevoa ${compacto ? "sr-only" : "max-sm:sr-only baixa:sr-only"}`}>Ordenar:</span>{" "}
              <span className="font-semibold">{ORDEM_ROTULO[atual]}</span>
              <IconeSeta className={`text-nevoa transition-transform duration-150 motion-reduce:transition-none ${a ? "rotate-180" : ""}`} />
            </>
          ),
        }}
      >
        {({ fechar }) => (
          <ListaOrdens ordem={atual} lente={lente} selosDesligados={selosDesligados} indisponiveis={indisponiveis} onEscolher={(o) => escolher(o, fechar)} />
        )}
      </Popover>
    </span>
  );
}

function ListaOrdens({
  ordem,
  lente,
  selosDesligados,
  indisponiveis,
  onEscolher,
}: {
  ordem: Ordem;
  lente: boolean;
  selosDesligados: boolean;
  indisponiveis: Partial<Record<Ordem, string>>;
  onEscolher: (o: Ordem) => void;
}) {
  const lista = useRef<HTMLUListElement>(null);
  // abre com o foco na ordem atual
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>("[aria-selected=true]")?.focus({ preventScroll: true });
  }, []);

  const andar = (e: KeyboardEvent<HTMLUListElement>) => {
    const itens = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role=option]"));
    const i = itens.indexOf(document.activeElement as HTMLElement);
    let j: number | null = null;
    if (e.key === "ArrowDown") j = (i + 1) % itens.length;
    else if (e.key === "ArrowUp") j = (i - 1 + itens.length) % itens.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = itens.length - 1;
    if (j === null) return;
    e.preventDefault();
    itens[j]?.focus();
  };

  return (
    <ul ref={lista} role="listbox" aria-label="Ordenar por" onKeyDown={andar} className="flex flex-col p-1.5">
      {ORDENS.map((o) => {
        const travada = lente && ORDENS_LUNETA.includes(o);
        const on = o === ordem;
        const motivo = !travada && o === "selo" && selosDesligados ? SELOS_EM_ANALISE : !on ? indisponiveis[o] : undefined;
        const desligada = !!motivo;
        return (
          <li
            key={o}
            role="option"
            aria-selected={on}
            aria-disabled={desligada || undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => onEscolher(o)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEscolher(o);
              }
            }}
            // foco: anel de 2 px na cor de texto do latão (contraste ≥ 3:1 nos dois temas)
            className={`group/o flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors duration-100 focus-visible:bg-nevoa/12 focus-visible:ring-2 focus-visible:ring-latao-texto focus-visible:outline-none ${
              desligada ? "cursor-not-allowed" : "hover:bg-nevoa/[0.08]"
            } ${on ? "bg-latao/12" : ""}`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={`flex items-center gap-2 text-sm ${on ? "font-semibold text-luar" : desligada ? "text-nevoa" : "text-luar"}`}>
                {ORDEM_ROTULO[o]}
                {travada && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-[0.1em] text-latao-texto uppercase">
                    <IconeCadeado tamanho={12} />
                    Luneta<span className="sr-only"> (recurso do plano Luneta)</span>
                  </span>
                )}
              </span>
              <span className="text-xs leading-snug text-nevoa">{motivo ?? DESCRICAO[o]}</span>
            </span>
            <span aria-hidden="true" className="mt-0.5 inline-flex size-4 items-center justify-center text-latao-texto">
              {on && <IconeCheck tamanho={14} />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
