import { LISTINGS } from "@/content/examples";
import { AuctionCard } from "@/components/AuctionCard";
import type { CardInfo } from "./sweep";

/** Maior deságio (com 3 riscos graves), o Alvo e um Promissor: o contraste que vende a Luneta. */
const PREVIEW = ["semselo-rj", "alvo-sp", "promissor-ba"].map((id) => LISTINGS.find((l) => l.id === id)!);

/** Para o contador: risco = tag grave ou de atenção; oportunidade = selo ≥ 1. */
export const PREVIEW_CARDS: CardInfo[] = PREVIEW.map((l) => ({
  seal: l.seal,
  risks: l.tags.map((t) => t.severity === "grave" || t.severity === "atencao"),
}));

/** 3 cartões a partir de lg; 2 abaixo disso (o 3º some). */
export function PreviewGrid({ locked }: { locked: boolean }) {
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
