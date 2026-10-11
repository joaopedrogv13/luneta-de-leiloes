import { LISTINGS } from "@/content/examples";
import { AuctionCard } from "@/components/AuctionCard";
import { LensPreviewClient } from "@/components/LensPreviewClient";

const PREVIEW = ["semselo-rj", "alvo-sp", "promissor-ba"].map((id) => LISTINGS.find((l) => l.id === id)!);

function Grid({ locked }: { locked: boolean }) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-3 sm:p-5">
      {PREVIEW.map((l, i) => (
        <div key={l.id} className={i === 2 ? "max-sm:hidden" : ""}>
          <AuctionCard listing={l} locked={locked} compact headingLevel={4} />
        </div>
      ))}
    </div>
  );
}

/** "Por dentro, depois de assinar": a lista nas visões Lente (desfocada) e Luneta. */
export function LensPreview() {
  return <LensPreviewClient lente={<Grid locked />} luneta={<Grid locked={false} />} />;
}
