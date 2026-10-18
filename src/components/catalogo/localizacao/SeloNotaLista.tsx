import { notaCurta } from "@/lib/catalogo/nota-texto";
import type { ImovelResumo } from "@/lib/catalogo/tipos";

/**
 * Selo pequeno da nota de localização no cartão e na linha da lista: "Local 78" (aproximada: "Local ~45"). Sem nota (e
 * sempre no Lente, em que o servidor não manda a nota), nada aparece.
 */
export function SeloNotaLista({ imovel, className = "" }: { imovel: Pick<ImovelResumo, "notaLocal" | "precisaoGeo">; className?: string }) {
  const n = notaCurta(imovel);
  if (!n) return null;
  return (
    <span
      title={`${n.sr}, comparada com a própria cidade${n.aproximada ? " (endereço localizado só no bairro)" : ""}`}
      className={`inline-flex shrink-0 items-baseline gap-1 rounded-full border border-latao/40 bg-latao/[0.08] px-2 py-[3px] text-[11.5px] leading-none whitespace-nowrap ${className}`}
    >
      <span aria-hidden="true" className="font-medium text-nevoa">
        Local
      </span>
      <span aria-hidden="true" className="font-display font-bold text-luar tabular-nums">
        {n.texto}
      </span>
      <span className="sr-only">{n.sr}</span>
    </span>
  );
}
