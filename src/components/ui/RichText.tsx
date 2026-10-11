import { Fragment } from "react";

/**
 * Placeholder visível para dados que ainda não existem (ex.: "[X]", "[49]").
 * Borda tracejada em latão + rótulo acessível, para ninguém publicar sem perceber.
 */
export function Placeholder({ children }: { children: string }) {
  return (
    <span
      data-placeholder
      title="Placeholder: substituir pelo valor real antes de publicar"
      className="mx-[0.08em] inline-block rounded-[0.3em] border border-dashed border-latao-texto/80 bg-latao/10 px-[0.25em] font-[inherit] leading-[1.1] text-latao-texto"
    >
      {children}
    </span>
  );
}

/** Renderiza um texto do blueprint trocando trechos entre colchetes por <Placeholder>. */
export function RichText({ text }: { text: string }) {
  // split com grupo de captura: índices ímpares são os trechos "[...]".
  const parts = text.split(/(\[[^\]]+\])/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Placeholder key={i}>{part}</Placeholder>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Remove os colchetes para usos em texto puro (atributos, JSON-LD). */
export function plain(text: string) {
  return text.replace(/\[([^\]]+)\]/g, "$1");
}
