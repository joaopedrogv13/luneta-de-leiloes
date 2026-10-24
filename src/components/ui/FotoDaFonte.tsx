"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/** Fotos que já falharam nesta visita: o cartão que volta (navegação) vai direto ao desenho, sem pedir de novo. */
const FALHAS = new Set<string>();

/**
 * Foto direto da fonte numa moldura pequena (cartões da landing e o cartão do Alvo no hero): <img> simples, de tamanho
 * fixo (sem CLS), preguiçoso, de baixa prioridade e sem referrer. É uma ilha mínima só para o caso de a foto falhar
 * (imóvel vendido ou retirado, a fonte bloqueando, sem rede): com largura e altura fixas, o Chromium desenha o ícone de
 * imagem quebrada mesmo com `alt=""`. Na falha, a foto sai do DOM (fica o desenho listrado do pai) e o ancestral
 * `[data-foto]` passa a `data-foto="falhou"`, para o rótulo "foto ilustrativa" sumir junto (`group-data-[foto=falhou]`).
 * Sem JavaScript, é a mesma foto (o servidor a entrega pronta).
 */
export function FotoDaFonte({
  src,
  size,
  style,
  className = "",
}: {
  src: string;
  size: number;
  style?: CSSProperties;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(() => FALHAS.has(src));
  // o ancestral marcado com data-foto (o cartão): é nele que o rótulo "foto ilustrativa" lê a falha
  const cartao = useRef<Element | null>(null);

  const falhar = useCallback(() => {
    FALHAS.add(src);
    setFalhou(true);
  }, [src]);

  // A foto pode ter falhado antes da hidratação, quando o onError ainda não existia. "complete" sem largura não basta
  // (uma foto "lazy" que nem começou a baixar também dá complete = true em alguns navegadores): decode() tira a dúvida.
  const conferir = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el) return;
      cartao.current = el.closest("[data-foto]");
      if (!el.complete || el.naturalWidth > 0) return;
      el.decode().then(
        () => undefined,
        () => {
          if (el.isConnected && el.complete && el.naturalWidth === 0) falhar();
        },
      );
    },
    [falhar],
  );
  const marcar = useCallback((el: HTMLElement | null) => {
    if (el) cartao.current = el.closest("[data-foto]");
  }, []);

  useEffect(() => {
    if (falhou) cartao.current?.setAttribute("data-foto", "falhou");
  }, [falhou]);

  // na falha, só um marcador vazio (para achar o cartão quando ele volta numa navegação com a foto já falhada)
  if (falhou) return <span ref={marcar} hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a foto fica na fonte: o next/image a baixaria e re-hospedaria
    <img
      ref={conferir}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={falhar}
      style={style}
      className={className}
    />
  );
}
