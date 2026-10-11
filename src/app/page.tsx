import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { MobileCtaBar } from "@/components/MobileCtaBar";
import { MotionLayer } from "@/components/MotionLayer";
import { HeroScene } from "@/components/hero/HeroScene";
import { Problem } from "@/components/sections/Problem";
import { Solution } from "@/components/sections/Solution";
import { Levels } from "@/components/sections/Levels";
import { Examples } from "@/components/sections/Examples";
import { Pracas } from "@/components/sections/Pracas";
import { Filters } from "@/components/sections/Filters";
import { Stats } from "@/components/sections/Stats";
import { Plans } from "@/components/sections/Plans";
import { Lawyer } from "@/components/sections/Lawyer";
import { Social } from "@/components/sections/Social";
import { Faq } from "@/components/sections/Faq";
import { FinalCta } from "@/components/sections/FinalCta";

/** Landing na ordem do blueprint (Passo 1 · Estrutura da página). */
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
        <Solution />
        <Levels />
        <Examples />
        <Pracas />
        <Filters />
        <Stats />
        <Plans />
        <Lawyer />
        <Social />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <MobileCtaBar />
      <MotionLayer />
    </>
  );
}
