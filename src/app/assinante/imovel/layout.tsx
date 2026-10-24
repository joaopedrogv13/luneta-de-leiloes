import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE } from "@/content/site";

/**
 * Metadados de reserva das páginas de exemplo: valem para o 404 (o layout de [id] chama notFound() antes de a
 * página gerar os metadados dela, e o not-found desta pasta herda daqui). Quando o exemplo existe, os
 * metadados da página substituem tudo (título, descrição e canonical).
 */
export const metadata: Metadata = {
  title: `Imóvel não encontrado | ${SITE.name}`,
  description: "Este imóvel não está na demonstração da área do assinante.",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function LayoutImoveisAssinante({ children }: { children: ReactNode }) {
  return children;
}
