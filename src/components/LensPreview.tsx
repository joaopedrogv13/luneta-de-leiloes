import { LISTINGS } from "@/content/examples";
import { AuctionCard } from "@/components/AuctionCard";
import { PorDentro } from "@/components/por-dentro/PorDentro";
import type { CardInfo } from "@/components/por-dentro/sweep";

/** Maior deságio (com 3 riscos graves), o Alvo e um Promissor: o contraste que vende a Luneta. */
const PREVIEW = ["semselo-rj", "alvo-sp", "promissor-ba"].map((id) => LISTINGS.find((l) => l.id === id)!);

/** Para o contador: risco = tag grave ou de atenção; oportunidade = selo ≥ 1. */
const CARDS: CardInfo[] = PREVIEW.map((l) => ({
  seal: l.seal,
  risks: l.tags.map((t) => t.severity === "grave" || t.severity === "atencao"),
}));

/** 3 cartões a partir de lg; 2 abaixo disso (o 3º some). */
function Grid({ locked }: { locked: boolean }) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-5 lg:grid-cols-3">
      {PREVIEW.map((l, i) => (
        <div key={l.id} data-card={i} className={i === 2 ? "max-lg:hidden" : undefined}>
          <AuctionCard listing={l} locked={locked} compact headingLevel={4} />
        </div>
      ))}
    </div>
  );
}

/**
 * "Por dentro, depois de assinar": a mesma lista nas visões Lente (desfocada) e Luneta.
 * As cópias da lista são renderizadas aqui, no servidor; a troca animada vive em PorDentro (cliente).
 */
export function LensPreview() {
  return <PorDentro cards={CARDS} lente={<Grid locked />} luneta={<Grid locked={false} />} lens={<Grid locked={false} />} />;
}
