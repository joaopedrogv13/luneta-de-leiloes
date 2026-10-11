import { SOCIAL } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { RichText } from "@/components/ui/RichText";

/** Prova social: enquanto não houver depoimentos reais, selo de lançamento + garantia. Nada inventado. */
export function Social() {
  return (
    <section aria-labelledby="social-titulo" className="section">
      <div className="container-l">
        <SectionHeading id="social-titulo" eyebrow={SOCIAL.eyebrow} parts={SOCIAL.title} />
        <div className="mt-10 grid gap-4 sm:mt-16 md:grid-cols-2">
          <div data-reveal className="card flex flex-col gap-3 !border-latao/40 p-7 sm:p-8">
            <span className="self-start rounded-full border border-latao px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] text-latao-texto uppercase">
              {SOCIAL.launch}
            </span>
            <p className="mt-2 text-[15px] leading-relaxed text-nevoa">{SOCIAL.launchText}</p>
          </div>
          <div data-reveal className="card flex flex-col gap-3 p-7 sm:p-8">
            <p className="font-display text-[clamp(56px,6vw,80px)] leading-[0.9] font-bold tracking-[-0.05em] text-latao-texto">
              <RichText text={SOCIAL.guarantee} />
            </p>
            <p className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">{SOCIAL.guaranteeTitle}</p>
            <p className="text-[15px] leading-relaxed text-nevoa">{SOCIAL.guaranteeText}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
