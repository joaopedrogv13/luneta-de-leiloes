import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE } from "@/content/site";

/**
 * Metadados de reserva das páginas de imóvel: valem para o 404 (o layout de [id] chama notFound() antes de a
 * página gerar os metadados dela, e o not-found desta pasta herda daqui). Quando o imóvel existe, os
 * metadados da página substituem tudo (título, descrição e canonical).
 */
export const metadata: Metadata = {
  title: `Imóvel não encontrado | ${SITE.name}`,
  description: "Este imóvel não está no catálogo: pode ter sido vendido, retirado pela fonte ou o endereço está errado.",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function LayoutImoveisPrevia({ children }: { children: ReactNode }) {
  return children;
}
