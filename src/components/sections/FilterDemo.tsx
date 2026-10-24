"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { TextosFoco } from "./foco/FocoDemo";

/**
 * A demonstração "Ajuste o foco" (150 imóveis fictícios, filtros da prévia, lista e mapinha) só vem quando a seção
 * chega perto da tela: nem o código nem os dados entram no carregamento da landing (o LCP não muda). Até lá, e
 * enquanto o pedaço chega, fica a moldura (`children`, foco/Moldura.tsx: componente de servidor, já no HTML), com as
 * mesmas medidas da demonstração pronta: a troca não muda a altura da página. Um `import()` simples, sem o
 * next/dynamic: o carregador dele custava ~3,6 KB (gzip) no JS inicial da landing.
 */
const carregar = () => import("./foco/FocoDemo").then((m) => m.FocoDemo);

/** Quanto antes da seção (px) o pedaço começa a vir: ele chega antes de a pessoa rolar até lá. */
const ANTECEDENCIA = "1200px 0px";

export function FilterDemo({ textos, children }: { textos: TextosFoco; children: ReactNode }) {
  const ancora = useRef<HTMLDivElement>(null);
  const [perto, setPerto] = useState(false);
  const [Demo, setDemo] = useState<ComponentType<{ textos: TextosFoco }> | null>(null);
  useEffect(() => {
    const el = ancora.current;
    if (!el) return;
    let vivo = true;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        obs.disconnect();
        setPerto(true);
        carregar().then(
          (c) => vivo && setDemo(() => c),
          // sem rede (ou o pedaço falhou): a moldura fica, sem quebrar a página
          () => vivo && setPerto(false),
        );
      },
      { rootMargin: ANTECEDENCIA },
    );
    obs.observe(el);
    return () => {
      vivo = false;
      obs.disconnect();
    };
  }, []);
  return <div ref={ancora}>{Demo ? <Demo textos={textos} /> : <div className={perto ? "motion-safe:animate-pulse" : ""}>{children}</div>}</div>;
}
