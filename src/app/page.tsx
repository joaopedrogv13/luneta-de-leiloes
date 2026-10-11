import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { MobileCtaBar } from "@/components/MobileCtaBar";
import { HeroScene } from "@/components/hero/HeroScene";

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
        {["como-funciona", "niveis", "planos", "advogado", "comecar"].map((id) => (
          <section key={id} id={id} className="section min-h-[60vh]" />
        ))}
      </main>
      <Footer />
      <MobileCtaBar />
    </>
  );
}
