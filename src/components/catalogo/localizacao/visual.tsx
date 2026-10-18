/**
 * Peças visuais da nota de localização, sem estado (servem ao servidor e ao navegador): o anel da nota, a barra de
 * uma parte, os terços da cidade pequena e a régua de 0 a 100. A página do imóvel, o resumo lateral, a chamada do
 * Lente e a página pública do método usam as mesmas.
 *
 * A cor é sempre o latão (o acento do site): uma nota baixa não é "perigo", é o entorno comparado com a cidade.
 * Imports relativos, sem "@/" nas funções puras.
 */
import { notaNaEscala, TERCO_CURTO, type Terco } from "../../../lib/catalogo/nota-texto";

/**
 * Anel da nota: trilho cinza e o arco de latão até a nota (pathLength 100). Aproximada: o arco da faixa, mais claro,
 * e o "~" antes do número. `texto` troca o número do meio (a chamada do Lente usa "██").
 */
export function AnelNota({
  nota,
  faixa = null,
  aproximada = false,
  tamanho = 112,
  texto,
  legenda = "de 100",
  className = "",
}: {
  nota: number | null;
  faixa?: readonly [number, number] | null;
  aproximada?: boolean;
  /** lado em px */
  tamanho?: number;
  texto?: string;
  /** a linha pequena sob o número ("de 100"); vazia some */
  legenda?: string;
  className?: string;
}) {
  const n = nota === null ? 0 : notaNaEscala(nota);
  const lo = faixa ? notaNaEscala(Math.min(faixa[0], faixa[1])) : null;
  const hi = faixa ? notaNaEscala(Math.max(faixa[0], faixa[1])) : null;
  const mini = tamanho < 56;
  const traco = mini ? 4.5 : 3.4;
  // o arco começa no topo (rotação de −90°) e corre no sentido do relógio
  return (
    <span aria-hidden="true" className={`relative inline-grid shrink-0 place-items-center ${className}`} style={{ width: tamanho, height: tamanho }}>
      <svg viewBox="0 0 40 40" width={tamanho} height={tamanho} className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth={traco} className="text-nevoa/18" />
        {lo !== null && hi !== null && hi > lo && (
          <circle
            cx="20"
            cy="20"
            r="17"
            fill="none"
            stroke="currentColor"
            strokeWidth={traco}
            pathLength={100}
            strokeDasharray={`${hi - lo} 100`}
            strokeDashoffset={-lo}
            className="text-latao/55"
          />
        )}
        {nota !== null && (
          <circle
            cx="20"
            cy="20"
            r="17"
            fill="none"
            stroke="currentColor"
            strokeWidth={traco}
            strokeLinecap="round"
            pathLength={100}
            // a faixa da aproximada: só um ponto no meio dela; a calculada: o arco até a nota
            strokeDasharray={aproximada ? "0.01 100" : `${Math.max(0.01, n)} 100`}
            strokeDashoffset={aproximada ? -n : 0}
            className="text-latao"
            style={aproximada ? { strokeWidth: traco * 1.9 } : undefined}
          />
        )}
      </svg>
      <span className="relative flex flex-col items-center leading-none">
        <span
          className="font-display font-bold tracking-[-0.03em] text-luar tabular-nums"
          style={{ fontSize: mini ? Math.round(tamanho * 0.36) : Math.round(tamanho * 0.32) }}
        >
          {texto ?? (nota === null ? "—" : `${aproximada ? "~" : ""}${n}`)}
        </span>
        {!mini && legenda && <span className="mt-1 text-[11px] font-medium tracking-[0.04em] text-nevoa">{legenda}</span>}
      </span>
    </span>
  );
}

/** Barra horizontal de uma parte (0 a 100). Sem nota: o trilho tracejado. */
export function BarraParte({ nota, className = "" }: { nota: number | null; className?: string }) {
  if (nota === null) {
    return <span aria-hidden="true" className={`block h-2 rounded-full border border-dashed border-nevoa/35 ${className}`} />;
  }
  const n = notaNaEscala(nota);
  return (
    <span aria-hidden="true" className={`relative block h-2 overflow-hidden rounded-full bg-nevoa/15 ${className}`}>
      <span className="absolute inset-y-0 left-0 rounded-full bg-latao" style={{ width: `${Math.max(2, n)}%` }} />
    </span>
  );
}

/** Os três terços da cidade pequena, com o da posição aceso e o rótulo dele. */
export function TercosParte({ terco, className = "" }: { terco: Terco | null; className?: string }) {
  const ordem: Terco[] = ["baixo", "medio", "alto"];
  return (
    <span aria-hidden="true" className={`grid grid-cols-3 gap-1 ${className}`}>
      {ordem.map((t) => (
        <span key={t} className={`block h-2 rounded-full ${t === terco ? "bg-latao" : "bg-nevoa/15"}`} title={TERCO_CURTO[t]} />
      ))}
    </span>
  );
}

/**
 * Régua de 0 a 100 com a marca da nota (ou a faixa da aproximada) e as pontas escritas. A página do método usa como
 * ilustração; `rotulo` é o texto da marca.
 */
export function ReguaNota({ nota, faixa = null, rotulo, className = "" }: { nota: number; faixa?: readonly [number, number] | null; rotulo?: string; className?: string }) {
  const n = notaNaEscala(nota);
  return (
    <div aria-hidden="true" className={`relative pt-9 pb-6 ${className}`}>
      <div className="relative h-3 rounded-full bg-[linear-gradient(90deg,rgba(var(--fog-rgb),.16),rgba(201,162,77,.55))]">
        {faixa && (
          <span
            className="absolute inset-y-[-3px] rounded-full border border-latao/70 bg-latao/25"
            style={{ left: `${notaNaEscala(Math.min(...faixa))}%`, width: `${Math.abs(faixa[1] - faixa[0])}%` }}
          />
        )}
        <span className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-tinta bg-latao shadow-[0_0_0_2px_#c9a24d]" style={{ left: `${n}%` }} />
        {rotulo && (
          // a etiqueta cresce para dentro da régua (da marca para a esquerda na metade de cima, para a direita na de
          // baixo): nunca sai do cartão, nem no celular
          <span
            className="absolute -top-8 rounded-full bg-luar px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-noite tabular-nums"
            style={n >= 50 ? { right: `max(0px, calc(${100 - n}% - 14px))` } : { left: `max(0px, calc(${n}% - 14px))` }}
          >
            {rotulo}
          </span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-between text-[11px] font-medium text-nevoa tabular-nums">
        {[0, 25, 50, 75, 100].map((t) => (
          <span key={t} className="w-6 text-center first:text-left last:text-right">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Prévia desenhada (não real) para a chamada do Lente: anel com "██" e quatro barras, borrados. */
export function PreviaNotaBorrada({ className = "" }: { className?: string }) {
  const larguras = ["78%", "52%", "64%", "36%"];
  return (
    <div aria-hidden="true" className={`flex items-center gap-4 opacity-70 blur-[3px] select-none ${className}`}>
      <AnelNota nota={72} tamanho={84} texto="██" legenda="" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {larguras.map((w, k) => (
          <div key={k} className="flex items-center gap-3">
            <span className="block h-2.5 w-20 shrink-0 rounded-full bg-nevoa/30" />
            <span className="relative block h-2 flex-1 overflow-hidden rounded-full bg-nevoa/15">
              <span className="absolute inset-y-0 left-0 rounded-full bg-latao/80" style={{ width: w }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
