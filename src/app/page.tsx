import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { MobileCtaBar } from "@/components/MobileCtaBar";
import { MotionLayer } from "@/components/MotionLayer";
import { InPageLinks } from "@/components/InPageLinks";
import { SaidaDaApresentacao } from "@/components/apresentacao/SaidaDaApresentacao";
import { HeroScene } from "@/components/hero/HeroScene";
import { Problem } from "@/components/sections/Problem";
import { Solution } from "@/components/sections/Solution";
import { Levels } from "@/components/sections/Levels";
import { Examples } from "@/components/sections/Examples";
import { Pracas } from "@/components/sections/Pracas";
import { Filters } from "@/components/sections/Filters";
import { Decida } from "@/components/sections/Decida";
import { Localizacao } from "@/components/sections/Localizacao";
import { Stats } from "@/components/sections/Stats";
import { Plans } from "@/components/sections/Plans";
import { Lawyer } from "@/components/sections/Lawyer";
import { Social } from "@/components/sections/Social";
import { Faq } from "@/components/sections/Faq";
import { FinalCta } from "@/components/sections/FinalCta";
import { AuctionCard } from "@/components/AuctionCard";
import { LeadForm } from "@/components/LeadForm";
import { LensPreview } from "@/components/LensPreview";
import { PlansTable } from "@/components/PlansTable";
import { FEATURED_EXAMPLES } from "@/content/examples";
import { EXAMPLES } from "@/content/site";
import { JsonLd } from "@/components/JsonLd";

/**
 * Landing na ordem do blueprint (Passo 1 · Estrutura da página), com as duas seções da rodada 4 (Decida com números e
 * Nota de localização) entre Filtros e Dados: achar → decidir → onde fica → a base em números → planos.
 */
export default function Home() {
  return (
    <>
      <a
        href="#conteudo"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-full bg-latao px-4 py-2 text-sm font-semibold text-noite-fixa focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <Nav />
      <main id="conteudo">
        <HeroScene />
        <Problem />
        <Solution>
          <LensPreview />
        </Solution>
        <Levels />
        <Examples>
          <ul className="mt-10 grid items-start gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURED_EXAMPLES.map((l) => (
              <li key={l.id} data-reveal>
                <AuctionCard listing={l} />
                {/* rodada 5, ponto 10: a página do mesmo exemplo na demonstração */}
                {!l.source && (
                  <Link
                    href={EXAMPLES.demoHref(l.id)}
                    prefetch={false}
                    className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold text-latao-texto underline decoration-latao/40 underline-offset-4 hover:text-luar"
                  >
                    {EXAMPLES.demo}
                    <span className="sr-only">: {l.title}, {l.place}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Examples>
        <Pracas />
        <Filters />
        {/* rodada 4: as ferramentas do plano Luneta (fundo tinta e noite, mantendo a alternância) */}
        <Decida />
        <Localizacao />
        <Stats />
        <Plans>
          <PlansTable />
        </Plans>
        <Lawyer />
        <Social />
        <Faq />
        <FinalCta>
          <LeadForm />
        </FinalCta>
      </main>
      <Footer />
      <MobileCtaBar />
      <MotionLayer />
      <InPageLinks />
      {/* depois do InPageLinks: a volta da demonstração rola por último (rodada 5, ponto 10) */}
      <SaidaDaApresentacao />
      <JsonLd />
    </>
  );
}
