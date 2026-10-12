import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/content/site";
import { Logo } from "@/components/ui/Logo";
import { Title } from "@/components/ui/Heading";

const TITLE = `Página não encontrada | ${SITE.name}`;
const DESCRIPTION = "O endereço pode ter mudado ou não existir mais.";

// O title do layout é texto fixo (sem template), por isso o nome do site vai aqui.
// O Next responde 404 e injeta "noindex". Robots, canonical, openGraph e twitter do layout falam da home
// ("index", "/", título e descrição dela) e o merge é raso: aqui eles são trocados inteiros, com o título
// e a descrição do 404 e sem URL, para a página não mandar sinais contraditórios. A imagem do card
// continua a da marca (app/opengraph-image.tsx).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  alternates: { canonical: null },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    siteName: SITE.name,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/** Lente vazia (mesmo anel e ponto do LogoMark): o alvo ficou fora do campo de visão. */
function EmptyLens() {
  return (
    <svg viewBox="0 0 128 112" aria-hidden="true" className="mx-auto h-auto w-28 overflow-visible sm:w-32">
      <circle cx="56" cy="56" r="40" fill="rgba(var(--tinta-rgb),0.55)" stroke="#C9A24D" strokeWidth="5" />
      <g stroke="var(--nevoa)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7">
        <path d="M56 22v10M56 80v10M22 56h10M80 56h10" />
        <circle cx="56" cy="56" r="6" fill="none" strokeDasharray="2.5 3" />
      </g>
      <circle cx="116" cy="12" r="6" fill="#C9A24D" className="drop-shadow-[0_0_6px_rgba(201,162,77,0.55)]" />
    </svg>
  );
}

/**
 * 404 do site inteiro (rota inexistente ou notFound()), dentro do layout raiz: fontes, tema salvo e
 * globals.css já vêm de lá. Com um só layout raiz, o Next 16 recomenda app/not-found.tsx
 * (global-not-found é experimental e serve para apps com vários layouts raiz).
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[min(760px,130vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(201,162,77,.12),rgba(var(--luar-rgb),.03)_40%,transparent_65%)]"
      />

      <header className="relative mx-auto flex h-16 w-full max-w-[1280px] items-center px-4 sm:px-8">
        <Link href="/" aria-label="Luneta de Leilões, página inicial" className="inline-flex min-h-11 items-center rounded-md text-luar no-underline">
          <Logo />
        </Link>
      </header>

      <main id="conteudo" className="relative flex flex-1 items-center justify-center px-5 pt-8 pb-24 sm:px-10">
        <div className="max-w-[640px] text-center">
          <EmptyLens />
          <p className="eyebrow mt-8">Erro 404</p>
          <h1 className="mt-5 font-display text-[clamp(32px,5vw,56px)] leading-[1.04] font-bold tracking-[-0.03em] text-luar">
            <Title parts={["Essa página saiu do alcance da", "luneta", "."]} />
          </h1>
          <p className="mx-auto mt-5 max-w-[420px] text-[clamp(15px,1.4vw,18px)] leading-normal text-nevoa">
            O endereço pode ter mudado ou não existir mais.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="btn-primary">
              Voltar ao início
            </Link>
            <Link href="/#planos" className="btn-ghost">
              Ver planos
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
