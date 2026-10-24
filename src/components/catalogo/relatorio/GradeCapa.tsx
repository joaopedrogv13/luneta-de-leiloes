"use client";

import { useCallback, useState, type ReactNode } from "react";
import { estiloRecorte } from "@/lib/catalogo/recorte";
import type { RecorteFoto } from "@/lib/catalogo/tipos";
import s from "./relatorio.module.css";

type EstadoFoto = "sem" | "carregando" | "ok" | "falhou";

/**
 * O quadro de fatos da capa e, ao lado, a foto principal direto da fonte (<img> simples, sem referrer; nunca
 * baixada nem re-hospedada). Se a foto não carregar (rede, bloqueio do site da fonte), ela some e o quadro ocupa a
 * largura toda: no relatório, um buraco ou um desenho no lugar da foto não ajudam.
 */
export function GradeCapa({
  foto,
  legenda,
  ilustrativa = false,
  recorte = null,
  children,
}: {
  foto: string | null;
  legenda: string;
  /** foto ilustrativa (exemplo fictício): a legenda diz, e o texto alternativo também */
  ilustrativa?: boolean;
  /** recorte da foto ilustrativa (a marca do canto fica fora) */
  recorte?: RecorteFoto | null;
  children: ReactNode;
}) {
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
          {/* com recorte, o zoom fica dentro da moldura (o canto com a marca da vistoria sai) */}
          <span style={recorte ? { display: "block", overflow: "hidden", borderRadius: 3 } : { display: "contents" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- foto da fonte, sem otimização nem cópia (direito de imagem) */}
            <img
              ref={conferir}
              src={foto}
              alt={ilustrativa ? "Foto ilustrativa, de um imóvel real parecido" : "Foto principal do imóvel, publicada pela fonte"}
              style={estiloRecorte(recorte)}
              referrerPolicy="no-referrer"
              decoding="async"
              onLoad={() => setEstado("ok")}
              onError={() => setEstado("falhou")}
            />
          </span>
          <figcaption>{legenda}</figcaption>
        </figure>
      )}
    </div>
  );
}
