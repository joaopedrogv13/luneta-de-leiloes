"use client";

import { useRef, useState } from "react";
import { Popover } from "@/components/catalogo/ui/Popover";
import { GLOSSARIO, type ChaveGlossario } from "@/content/glossario";
import { IconeFechar, IconeVoltar } from "./icones";

/** Termos ligados a outro: "Veja também" dentro da explicação (troca o conteúdo do mesmo pop-up). */
const RELACIONADOS: Partial<Record<ChaveGlossario, readonly ChaveGlossario[]>> = {
  leilao: ["judicial", "extrajudicial"],
  leilao_sfi: ["direito_preferencia", "averbacao_leiloes_negativos"],
  extrajudicial: ["direito_preferencia"],
  judicial: ["praca_2"],
  praca_1: ["praca_2"],
  matricula: ["cartorio", "averbacao_leiloes_negativos"],
  cartorio: ["matricula"],
  averbacao_leiloes_negativos: ["matricula"],
  leiloeiro: ["comitente"],
  comitente: ["leiloeiro"],
};

/**
 * Botão (i) ao lado de um valor (Venda direta, Extrajudicial, Matrícula...): abre a explicação do glossário
 * (src/content/glossario.ts) num pop-up ancorado: o que é, na prática e, em letra menor, a base legal. O círculo
 * tem 24 px; a área de toque, 44 px (o ::before). A explicação é a do VALOR mostrado: em "Natureza: Extrajudicial"
 * o (i) explica a execução extrajudicial.
 */
export function BotaoTermo({ termo, className = "" }: { termo: ChaveGlossario; className?: string }) {
  const t = GLOSSARIO[termo];
  return (
    <Popover
      papel="note"
      rotulo={`O que é: ${t.titulo}`}
      posicao="bottom-start"
      largura="min(25rem, calc(100vw - 24px))"
      // o pop-up nasce dentro do valor (negrito, sem quebra de linha): volta ao texto normal
      className="text-left font-sans text-sm leading-normal font-normal tracking-normal whitespace-normal normal-case [font-variant-numeric:normal]"
      gatilho={{
        ariaLabel: `O que é ${t.titulo}?`,
        title: `O que é ${t.titulo}?`,
        conteudo: (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="block">
            <circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-55 transition-opacity group-hover/termo:opacity-100 group-aria-expanded/termo:opacity-100" />
            <path d="M12 10.6v6M12 7.4v.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ),
        className: (aberto) =>
          `group/termo relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full align-middle transition-[color,background-color,box-shadow] duration-150 ease-luneta before:absolute before:-inset-2.5 before:content-[''] motion-reduce:transition-none ${
            aberto ? "bg-latao/15 text-latao-texto ring-2 ring-latao/45" : "text-nevoa hover:bg-nevoa/10 hover:text-luar"
          } ${className}`,
      }}
    >
      {({ fechar }) => <PainelTermo inicial={termo} fechar={fechar} />}
    </Popover>
  );
}

const ROTULO = "text-[11px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase";

/** Conteúdo do pop-up: o termo e, se a pessoa abrir um "Veja também", o termo ligado (com "voltar"). */
function PainelTermo({ inicial, fechar }: { inicial: ChaveGlossario; fechar: () => void }) {
  const [pilha, setPilha] = useState<ChaveGlossario[]>([inicial]);
  const titulo = useRef<HTMLParagraphElement>(null);
  const atual = pilha[pilha.length - 1]!;
  const t = GLOSSARIO[atual];
  const anterior = pilha.length > 1 ? GLOSSARIO[pilha[pilha.length - 2]!] : null;
  const relacionados = (RELACIONADOS[atual] ?? []).filter((k) => !pilha.includes(k));
  // trocou de termo: o foco vai para o título novo (o leitor de tela lê o termo aberto)
  const ir = (nova: ChaveGlossario[]) => {
    setPilha(nova);
    requestAnimationFrame(() => titulo.current?.focus({ preventScroll: true }));
  };

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {anterior ? (
            <button
              type="button"
              onClick={() => ir(pilha.slice(0, -1))}
              className="-mt-1 -ml-1 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full px-1 text-[12.5px] font-medium text-latao-texto hover:text-luar"
            >
              <IconeVoltar tamanho={14} />
              {anterior.titulo}
            </button>
          ) : (
            <p className={`${ROTULO} text-latao-texto!`}>Entenda o termo</p>
          )}
          <p ref={titulo} tabIndex={-1} className="mt-1.5 font-display text-lg leading-snug font-bold tracking-[-0.01em] text-luar outline-none">
            {t.titulo}
          </p>
        </div>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar explicação"
          className="-mt-1.5 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-nevoa transition-colors hover:bg-nevoa/10 hover:text-luar pointer-fine:size-9"
        >
          <IconeFechar tamanho={18} />
        </button>
      </div>

      <dl className="mt-3.5 space-y-3.5">
        <div>
          <dt className={ROTULO}>O que é</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-luar">{t.oQueE}</dd>
        </div>
        <div>
          <dt className={ROTULO}>Na prática</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-luar">{t.naPratica}</dd>
        </div>
      </dl>

      {"base" in t && t.base && (
        <p className="mt-3.5 border-t border-nevoa/15 pt-3 text-[12px] leading-snug text-nevoa">
          <span className="font-semibold">Base legal:</span> {t.base}
        </p>
      )}

      {relacionados.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[12px] text-nevoa">Veja também:</span>
          {relacionados.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => ir([...pilha, k])}
              className="inline-flex min-h-8 cursor-pointer items-center rounded-full border border-nevoa/30 px-3 text-[12.5px] font-medium text-luar transition-colors hover:border-latao hover:bg-latao/10"
            >
              {GLOSSARIO[k].titulo}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3.5 text-[12px] leading-snug text-nevoa">Explicação geral, não jurídica: as regras deste imóvel estão no edital.</p>
    </div>
  );
}
