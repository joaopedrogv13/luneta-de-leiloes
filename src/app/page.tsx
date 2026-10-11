import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { MobileCtaBar } from "@/components/MobileCtaBar";

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
        <section id="topo" className="flex min-h-svh items-center px-5 pt-16 sm:px-10">
          <h1 className="font-display text-5xl font-bold tracking-tight">Luneta de Leilões</h1>
        </section>
        {["como-funciona", "niveis", "planos", "advogado", "comecar"].map((id) => (
          <section key={id} id={id} className="section min-h-[60vh]" />
        ))}
      </main>
      <Footer />
      <MobileCtaBar />
    </>
  );
}
