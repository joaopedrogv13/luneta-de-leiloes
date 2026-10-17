"use client";

import { useCallback, useState, type ReactNode } from "react";
import s from "./relatorio.module.css";

type EstadoFoto = "sem" | "carregando" | "ok" | "falhou";

/**
 * O quadro de fatos da capa e, ao lado, a foto principal direto da fonte (<img> simples, sem referrer; nunca
 * baixada nem re-hospedada). Se a foto não carregar (rede, bloqueio do site da fonte), ela some e o quadro ocupa a
 * largura toda: no relatório, um buraco ou um desenho no lugar da foto não ajudam.
 */
export function GradeCapa({ foto, legenda, children }: { foto: string | null; legenda: string; children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoFoto>(foto ? "carregando" : "sem");
  // a foto pode ter carregado (ou falhado) antes da hidratação, quando onLoad/onError ainda não existiam
  const conferir = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return;
    setEstado(img.naturalWidth > 0 ? "ok" : "falhou");
  }, []);
  return (
    <div className={s.capaGrade} data-foto={estado}>
      {children}
      {foto && (
        <figure className={s.foto}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto da fonte, sem otimização nem cópia (direito de imagem) */}
          <img
            ref={conferir}
            src={foto}
            alt="Foto principal do imóvel, publicada pela fonte"
            referrerPolicy="no-referrer"
            decoding="async"
            onLoad={() => setEstado("ok")}
            onError={() => setEstado("falhou")}
          />
          <figcaption>{legenda}</figcaption>
        </figure>
      )}
    </div>
  );
}
