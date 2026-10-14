import Link from "next/link";
import { BACK_TO_SITE } from "@/components/assinante/shared";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/ui/Logo";
import { ROTA_LISTA } from "@/lib/catalogo/rotas";
import type { Conjunto } from "@/lib/catalogo/tipos";
import { TemaSalvo } from "./TemaSalvo";

/** Cabeçalho simples (logo e tema) das telas de exceção da página do imóvel. */
export function TopoSimples() {
  return (
    <header className="border-b border-nevoa/15">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href={BACK_TO_SITE}
          aria-label="Luneta de Leilões, voltar ao site"
          className="inline-flex min-h-11 items-center gap-2.5 rounded-md font-display text-base leading-none font-bold text-luar no-underline"
        >
          <LogoMark />
          Luneta
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Lente vazia (o alvo saiu do campo de visão), no traço do logo. */
function LenteVazia() {
  return (
    <svg viewBox="0 0 128 112" aria-hidden="true" className="h-auto w-24 overflow-visible">
      <circle cx="56" cy="56" r="40" fill="rgba(var(--tinta-rgb),0.55)" stroke="#C9A24D" strokeWidth="5" />
      <g stroke="var(--nevoa)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7">
        <path d="M56 22v10M56 80v10M22 56h10M80 56h10" />
        <circle cx="56" cy="56" r="6" fill="none" strokeDasharray="2.5 3" />
      </g>
    </svg>
  );
}

/** 404 da página do imóvel: o imóvel saiu do catálogo (ou o endereço está errado); leva de volta à lista. */
export function NaoEncontrado({ conjunto }: { conjunto: Conjunto }) {
  return (
    <div className="flex min-h-svh flex-col">
      <TemaSalvo />
      <TopoSimples />
      <main id="conteudo" className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="max-w-[560px] text-center">
          <div className="flex justify-center">
            <LenteVazia />
          </div>
          <p className="eyebrow mt-7">Imóvel não encontrado</p>
          <h1 className="mt-4 font-display text-[clamp(28px,4.4vw,44px)] leading-[1.08] font-bold tracking-[-0.03em] text-luar">
            Este imóvel saiu do alcance da luneta.
          </h1>
          <p className="mx-auto mt-4 max-w-[440px] text-[16px] leading-relaxed text-nevoa">
            {conjunto === "previa"
              ? "Ele pode ter sido vendido, retirado pela fonte ou ter saído na última atualização da base. Confira o endereço ou volte à lista."
              : "Este exemplo não existe na demonstração. Volte à lista para ver os exemplos."}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={ROTA_LISTA[conjunto]} className="btn-primary">
              Ver os imóveis
            </Link>
            <Link href={BACK_TO_SITE} className="btn-ghost">
              Voltar ao site
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
