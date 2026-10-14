/**
 * Esqueletos de carregamento (nunca tela em branco): a mesma silhueta do cartão e da linha, pulsando de leve
 * (parado com "reduzir movimento"). São decorativos; quem os usa anuncia o carregamento (ListaEsqueletos já
 * vem com role="status" e o texto para leitores de tela).
 */
import { FOTO_LINHA, GRADE_LINHA } from "./grade";

const BLOCO = "rounded-full bg-nevoa/14";
const PULSO = "animate-pulse motion-reduce:animate-none";
const MOLDURA = "rounded-3xl border border-nevoa/12 bg-tinta [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_8px_24px_-12px_rgba(15,24,48,.14)]";

function FotoVazia({ className = "" }: { className?: string }) {
  return (
    <div className={`relative aspect-[4/3] overflow-hidden bg-nevoa/10 ${className}`}>
      <div className="absolute top-3 left-3 h-[46px] w-[78px] rounded-2xl bg-nevoa/12" />
    </div>
  );
}

function CorpoVazio() {
  return (
    <>
      <div className={`h-2.5 w-24 ${BLOCO}`} />
      <div className={`mt-2.5 h-7 w-40 ${BLOCO}`} />
      <div className={`mt-2.5 h-3 w-52 max-w-full ${BLOCO}`} />
      <div className={`mt-5 h-4 w-full ${BLOCO}`} />
      <div className={`mt-2 h-4 w-2/3 ${BLOCO}`} />
      <div className={`mt-2.5 h-3 w-36 ${BLOCO}`} />
      <div className="mt-4 flex gap-3">
        <div className={`h-3 w-14 ${BLOCO}`} />
        <div className={`h-3 w-10 ${BLOCO}`} />
        <div className={`h-3 w-20 ${BLOCO}`} />
      </div>
      <div className="mt-4 flex gap-1.5">
        <div className={`h-[26px] w-24 ${BLOCO}`} />
        <div className={`h-[26px] w-20 ${BLOCO}`} />
        <div className={`h-[26px] w-16 ${BLOCO}`} />
      </div>
    </>
  );
}

export function EsqueletoCartao({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`${MOLDURA} ${PULSO} flex h-full flex-col ${className}`}>
      <FotoVazia className="rounded-t-[23px]" />
      <div className="flex flex-1 flex-col px-5 pt-4 pb-4">
        <CorpoVazio />
        <div className="mt-auto flex items-center justify-between border-t border-nevoa/10 pt-3.5">
          <div className={`h-3 w-28 ${BLOCO}`} />
          <div className={`h-9 w-28 ${BLOCO}`} />
        </div>
      </div>
    </div>
  );
}

/** Esqueleto da linha: a mesma grade (GRADE_LINHA) e a mesma foto 4:3 da LinhaImovel, nas mesmas larguras. */
export function EsqueletoLinha({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`@container ${className}`}>
      <div className={`${MOLDURA} ${PULSO} ${GRADE_LINHA}`}>
        <FotoVazia className={FOTO_LINHA} />
        <div className="px-5 pt-4 [grid-area:preco] @xl:pt-5 @4xl:flex @4xl:flex-col @4xl:items-end @4xl:pt-6 @4xl:pr-6 @4xl:pl-2">
          <div className={`h-2.5 w-24 ${BLOCO}`} />
          <div className={`mt-2.5 h-7 w-40 ${BLOCO}`} />
          <div className={`mt-2.5 h-3 w-44 max-w-full ${BLOCO}`} />
        </div>
        <div className="px-5 pt-4 [grid-area:info] @xl:pt-3.5 @4xl:pt-6 @4xl:pr-4">
          <div className={`h-4 w-full max-w-80 ${BLOCO}`} />
          <div className={`mt-2 h-4 w-2/3 ${BLOCO}`} />
          <div className={`mt-2.5 h-3 w-36 ${BLOCO}`} />
          <div className="mt-4 flex gap-3">
            <div className={`h-3 w-14 ${BLOCO}`} />
            <div className={`h-3 w-10 ${BLOCO}`} />
            <div className={`h-3 w-20 ${BLOCO}`} />
          </div>
          <div className={`mt-3.5 h-3 w-44 ${BLOCO}`} />
        </div>
        <div className="flex gap-1.5 px-5 pt-4 [grid-area:tags] @4xl:pr-4 @4xl:pb-5">
          <div className={`h-[26px] w-24 ${BLOCO}`} />
          <div className={`h-[26px] w-20 ${BLOCO}`} />
          <div className={`h-[26px] w-16 ${BLOCO}`} />
        </div>
        <div className="px-5 pt-4 pb-4 [grid-area:rodape] @4xl:flex @4xl:items-end @4xl:justify-end @4xl:pt-3 @4xl:pr-6 @4xl:pb-5">
          <div className="flex items-center justify-between border-t border-nevoa/10 pt-3.5 @4xl:flex-col @4xl:items-end @4xl:gap-3 @4xl:border-t-0 @4xl:pt-0">
            <div className={`h-3 w-28 ${BLOCO}`} />
            <div className={`h-9 w-28 ${BLOCO}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Lista de esqueletos já com o anúncio para leitores de tela. `className` monta a grade (colunas, gap):
 * a mesma da lista de verdade, para nada pular quando os imóveis chegam.
 */
export function ListaEsqueletos({
  vista,
  quantidade = 6,
  className = "",
  texto = "Carregando imóveis",
}: {
  vista: "lista" | "cards";
  quantidade?: number;
  className?: string;
  texto?: string;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{texto}</span>
      {Array.from({ length: quantidade }, (_, i) => (vista === "cards" ? <EsqueletoCartao key={i} /> : <EsqueletoLinha key={i} />))}
    </div>
  );
}
