/**
 * Ícones de linha da página do imóvel (quadro 20×20, traço 1,6, cantos redondos, cor do texto). Sempre
 * decorativos: o texto ao lado (visível ou só para leitor de tela) diz o que cada um é.
 */
import type { ReactNode } from "react";
import type { TipoLink } from "@/lib/catalogo/tipos";

type P = { className?: string; tamanho?: number };

function Svg({ className = "", tamanho = 20, children }: P & { children: ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export const IconeCasa = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 9.2 10 3.8l6.5 5.4" />
    <path d="M5.2 8v8.2h9.6V8" />
    <path d="M8.4 16.2v-4.4h3.2v4.4" />
  </Svg>
);

/** Estação de metrô, trem ou VLT: o vagão de frente, sobre os trilhos. */
export const IconeTrilho = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="2.8" width="10" height="11" rx="2.6" />
    <path d="M5 9.2h10" />
    <path d="M7.6 11.6h.01M12.4 11.6h.01" />
    <path d="m7.2 13.8-2.2 3.4M12.8 13.8l2.2 3.4M6.1 15.8h7.8" />
  </Svg>
);

/** Área privativa: planta com cotas. */
export const IconeArea = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 7V3.5H7M13 3.5h3.5V7M16.5 13v3.5H13M7 16.5H3.5V13" />
    <path d="M7 13l6-6" opacity=".6" />
  </Svg>
);

/** Área total: dois retângulos sobrepostos. */
export const IconeAreaTotal = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="10" height="10" rx="1.5" />
    <path d="M7 16.5h8a1.5 1.5 0 0 0 1.5-1.5V7" opacity=".7" />
  </Svg>
);

/** Terreno: lote com marcos. */
export const IconeTerreno = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 15.5 6 8.5h8l3.5 7z" strokeDasharray="2.4 1.8" />
    <path d="M6 8.5V4.2l2.6 1-2.6 1" />
  </Svg>
);

export const IconeQuarto = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 15.5V5.5M2.5 11.5h15v4M17.5 11.5V10a2 2 0 0 0-2-2H9v3.5" />
    <circle cx="5.6" cy="9.1" r="1.4" />
  </Svg>
);

export const IconeVaga = (p: P) => (
  <Svg {...p}>
    <path d="M3 14V10.6l1.7-4.1a1.2 1.2 0 0 1 1.1-.7h8.4a1.2 1.2 0 0 1 1.1.7L17 10.6V14z" />
    <path d="M3 10.6h14M5.2 14v1.8M14.8 14v1.8" />
  </Svg>
);

/** R$/m²: régua. */
export const IconeRegua = (p: P) => (
  <Svg {...p}>
    <path d="M2.4 13.3 13.3 2.4l4.3 4.3L6.7 17.6z" />
    <path d="M6.3 9.4l1.6 1.6M8.7 7l2.2 2.2M11.1 4.6l1.6 1.6" />
  </Svg>
);

/** Lance / preço: etiqueta. */
export const IconeEtiqueta = (p: P) => (
  <Svg {...p}>
    <path d="M10.6 2.8H16a1.2 1.2 0 0 1 1.2 1.2v5.4l-7.6 7.6a1.2 1.2 0 0 1-1.7 0L3 12.1a1.2 1.2 0 0 1 0-1.7z" />
    <circle cx="13.6" cy="6.4" r="1.2" />
  </Svg>
);

/** Avaliação: prancheta com visto. */
export const IconeAvaliacao = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3.5" width="12" height="14" rx="1.8" />
    <path d="M7.5 3.5v-1h5v1M7.2 10.6l2 2 3.8-4" />
  </Svg>
);

/** Deságio: seta para baixo. */
export const IconeQueda = (p: P) => (
  <Svg {...p}>
    <path d="M3 5.5l5 5 3-3 6 6" />
    <path d="M17 9.5v4h-4" />
  </Svg>
);

/** Modalidade (leilão): martelo. */
export const IconeMartelo = (p: P) => (
  <Svg {...p}>
    <path d="M9.2 3.4l4.9 4.9M6.6 6l4.9 4.9M8 4.8l4.9 4.9" />
    <path d="M10.5 9.7 16.6 15.8a1.3 1.3 0 0 1-1.8 1.8L8.7 11.5" />
    <path d="M2.8 17.2h6" />
  </Svg>
);

export const IconeCalendario = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4.2" width="14" height="13" rx="2.2" />
    <path d="M3 8.4h14M7 2.5v3.4M13 2.5v3.4" />
  </Svg>
);

/** Financiamento: banco. */
export const IconeBanco = (p: P) => (
  <Svg {...p}>
    <path d="M3 7.5 10 3.5l7 4M4 7.5h12" />
    <path d="M5.5 9.5v5M10 9.5v5M14.5 9.5v5M3 16.5h14" />
  </Svg>
);

/** FGTS: carteira. */
export const IconeCarteira = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 6.2V15a1.5 1.5 0 0 0 1.5 1.5h10.5V7.7H5a1.5 1.5 0 0 1-1.5-1.5z" />
    <path d="M3.5 6.2A1.5 1.5 0 0 1 5 4.7h8.5v3" />
    <circle cx="13" cy="12.1" r=".9" fill="currentColor" stroke="none" />
  </Svg>
);

/** Parcelamento: moedas empilhadas. */
export const IconeParcelas = (p: P) => (
  <Svg {...p}>
    <ellipse cx="10" cy="5.5" rx="5.5" ry="2" />
    <path d="M4.5 5.5v3c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-3M4.5 8.5v3c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-3M4.5 11.5v3c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-3" />
  </Svg>
);

/** Ocupação: chave. */
export const IconeChave = (p: P) => (
  <Svg {...p}>
    <circle cx="6.5" cy="10" r="3.3" />
    <path d="M9.8 10h7.4M14.4 10v2.6M16.7 10v1.8" />
  </Svg>
);

/** Natureza judicial: balança. */
export const IconeBalanca = (p: P) => (
  <Svg {...p}>
    <path d="M10 3v14M6 17h8M4 5.5h12" />
    <path d="M4 5.5 2 10.5a2 2 0 0 0 4 0zM16 5.5l-2 5a2 2 0 0 0 4 0z" />
  </Svg>
);

/** Matrícula / documento. */
export const IconeDocumento = (p: P) => (
  <Svg {...p}>
    <path d="M11.5 2.8H6A1.5 1.5 0 0 0 4.5 4.3v11.4A1.5 1.5 0 0 0 6 17.2h8a1.5 1.5 0 0 0 1.5-1.5V6.8z" />
    <path d="M11.5 2.8v4h4M7.5 10.5h5M7.5 13.5h3.5" />
  </Svg>
);

/** Edital: pergaminho com selo. */
export const IconeEdital = (p: P) => (
  <Svg {...p}>
    <path d="M5 3h8.5A1.5 1.5 0 0 1 15 4.5v6M5 3a1.5 1.5 0 0 0-1.5 1.5V6H5M5 3v12.5A1.5 1.5 0 0 0 6.5 17H11" />
    <path d="M7.5 6.5h4.5M7.5 9.5h3" />
    <circle cx="14.6" cy="14" r="2.4" />
    <path d="M13.5 16.1l-.6 1.9 1.7-.8 1.7.8-.6-1.9" />
  </Svg>
);

/** Laudo: lupa sobre documento. */
export const IconeLaudo = (p: P) => (
  <Svg {...p}>
    <path d="M10.5 17H5.5A1.5 1.5 0 0 1 4 15.5v-11A1.5 1.5 0 0 1 5.5 3h6L15 6.5v2" />
    <circle cx="13" cy="13" r="2.6" />
    <path d="M15 15l2 2" />
  </Svg>
);

/** Processo: pasta. */
export const IconePasta = (p: P) => (
  <Svg {...p}>
    <path d="M2.8 6V15a1.5 1.5 0 0 0 1.5 1.5h11.4a1.5 1.5 0 0 0 1.5-1.5V7.8a1.5 1.5 0 0 0-1.5-1.5H10L8.2 4H4.3A1.5 1.5 0 0 0 2.8 5.5z" />
  </Svg>
);

/** Leiloeiro: pessoa com martelo. */
export const IconeLeiloeiro = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="6" r="2.8" />
    <path d="M2.8 16.8a5.2 5.2 0 0 1 10.4 0" />
    <path d="M14.2 6.6l2.6 2.6M13.4 8.8l2.4-2.4" />
  </Svg>
);

/** Comitente: prédio. */
export const IconePredio = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="3" width="11" height="14" rx="1.2" />
    <path d="M7.5 6.5h1.5M11 6.5h1.5M7.5 9.5h1.5M11 9.5h1.5M8.8 17v-3.5h2.4V17" />
  </Svg>
);

export const IconePino = (p: P) => (
  <Svg {...p}>
    <path d="M10 17.5s5.7-5.2 5.7-9.4a5.7 5.7 0 0 0-11.4 0c0 4.2 5.7 9.4 5.7 9.4z" />
    <circle cx="10" cy="8.1" r="2" />
  </Svg>
);

/** Link externo genérico. */
export const IconeLink = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 11.5a3.2 3.2 0 0 0 4.6 0l2.6-2.6a3.2 3.2 0 0 0-4.6-4.6l-.9.9" />
    <path d="M11.5 8.5a3.2 3.2 0 0 0-4.6 0l-2.6 2.6a3.2 3.2 0 0 0 4.6 4.6l.9-.9" />
  </Svg>
);

/** "Abre em nova aba": seta para fora da caixa. */
export const IconeExterno = (p: P) => (
  <Svg {...p}>
    <path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5" />
    <path d="M14.5 11.5v3.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5h3.5" />
  </Svg>
);

export const IconeVoltar = (p: P) => (
  <Svg {...p}>
    <path d="M16 10H4M8.5 5.5 4 10l4.5 4.5" />
  </Svg>
);

export const IconeSetaEsquerda = (p: P) => (
  <Svg {...p}>
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </Svg>
);

export const IconeSetaDireita = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </Svg>
);

export const IconeTelaCheia = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" />
  </Svg>
);

export const IconeFechar = (p: P) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Svg>
);

export const IconeCompartilhar = (p: P) => (
  <Svg {...p}>
    <path d="M10 12.5V3M6.5 6.5 10 3l3.5 3.5" />
    <path d="M6.5 9.5H5.2A1.7 1.7 0 0 0 3.5 11.2v4.1A1.7 1.7 0 0 0 5.2 17h9.6a1.7 1.7 0 0 0 1.7-1.7v-4.1a1.7 1.7 0 0 0-1.7-1.7h-1.3" />
  </Svg>
);

export const IconeCheck = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Svg>
);

export const IconeCalculadora = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="2.8" width="11" height="14.4" rx="1.8" />
    <path d="M7 5.8h6v2.4H7zM7.3 11h.1M10 11h.1M12.7 11h.1M7.3 14h.1M10 14h.1M12.7 14h.1" strokeWidth="1.9" />
  </Svg>
);

export const IconeEscudo = (p: P) => (
  <Svg {...p}>
    <path d="M10 2.8 4.2 5v4.6c0 3.6 2.5 6.4 5.8 7.6 3.3-1.2 5.8-4 5.8-7.6V5z" />
    <path d="M7.6 10.1l1.7 1.7 3.2-3.4" />
  </Svg>
);

export const IconeInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 9v4.6M10 6.4v.1" strokeWidth="1.9" />
  </Svg>
);

/** Alerta (triângulo): valor estranho, confira na fonte. */
export const IconeAlerta = (p: P) => (
  <Svg {...p}>
    <path d="M8.7 3.6 2.6 14.4a1.5 1.5 0 0 0 1.3 2.2h12.2a1.5 1.5 0 0 0 1.3-2.2L11.3 3.6a1.5 1.5 0 0 0-2.6 0z" />
    <path d="M10 8v3.6M10 14v.1" strokeWidth="1.9" />
  </Svg>
);

export const IconeCadeado = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="8.8" width="12" height="8.4" rx="2" />
    <path d="M6.8 8.8V6.5a3.2 3.2 0 0 1 6.4 0v2.3" />
  </Svg>
);

/** Ícone de cada tipo de link (documentos). */
export function IconeLinkTipo({ tipo, ...p }: P & { tipo: TipoLink }) {
  switch (tipo) {
    case "anuncio":
      return <IconeEtiqueta {...p} />;
    case "edital":
      return <IconeEdital {...p} />;
    case "matricula":
      return <IconeDocumento {...p} />;
    case "laudo":
      return <IconeLaudo {...p} />;
    case "avaliacao":
      return <IconeAvaliacao {...p} />;
    case "leiloeiro":
      return <IconeLeiloeiro {...p} />;
    case "processo":
      return <IconePasta {...p} />;
    case "mapa":
      return <IconePino {...p} />;
    default:
      return <IconeLink {...p} />;
  }
}
