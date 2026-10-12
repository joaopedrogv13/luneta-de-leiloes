import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, Space_Grotesk } from "next/font/google";
import { SITE } from "@/content/site";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: SITE.title,
  description: SITE.description,
  keywords: [...SITE.keywords],
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: "/",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },
  // Fora dos buscadores até o lançamento (SITE.indexable).
  robots: { index: SITE.indexable, follow: SITE.indexable },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#070B16",
  colorScheme: "dark light",
};

// Antes da pintura: marca html.motion (se o sistema não pede menos movimento) e aplica o tema salvo,
// para a cena do hero começar na etapa 1 e o tema claro não piscar ao recarregar.
// Endereço com #âncora: data-cv="all" mede todas as seções desde o início, para o navegador rolar até a
// âncora com as alturas reais, não com as estimativas do content-visibility (InPageLinks desfaz ao montar).
const themeScript = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("motion");if(location.hash.length>1)document.documentElement.dataset.cv="all";var t=localStorage.getItem("luneta-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

// data-scroll-behavior="smooth" (Next 16): o framework desliga o scroll suave durante a troca de página
// (ex.: /assinante → /#planos), e a navegação chega ao destino na hora em vez de "rolar" a página inteira.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      data-theme="dark"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${instrumentSerif.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
