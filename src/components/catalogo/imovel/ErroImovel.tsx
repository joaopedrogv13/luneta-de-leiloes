"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ROTA_LISTA } from "@/lib/catalogo/rotas";
import type { Conjunto } from "@/lib/catalogo/tipos";
import { TopoSimples } from "./NaoEncontrado";
import { TemaSalvo } from "./TemaSalvo";

/** Falha ao montar a página (dados do catálogo indisponíveis, por exemplo): aviso com "Tentar de novo". */
export function ErroImovel({ conjunto, erro, tentarDeNovo }: { conjunto: Conjunto; erro: Error & { digest?: string }; tentarDeNovo: () => void }) {
  useEffect(() => {
    console.error("página do imóvel:", erro);
  }, [erro]);
  return (
    <div className="flex min-h-svh flex-col">
      <TemaSalvo />
      <TopoSimples />
      <main id="conteudo" className="flex flex-1 items-center justify-center px-5 py-16">
        <div role="alert" className="max-w-[520px] text-center">
          <p className="eyebrow">Algo deu errado</p>
          <h1 className="mt-4 font-display text-[clamp(26px,4vw,38px)] leading-[1.1] font-bold tracking-[-0.03em] text-luar">
            Não consegui abrir este imóvel agora.
          </h1>
          <p className="mx-auto mt-4 max-w-[420px] text-[16px] leading-relaxed text-nevoa">Pode ser uma falha passageira ao ler o catálogo. Tente de novo em instantes.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={tentarDeNovo} className="btn-primary cursor-pointer">
              Tentar de novo
            </button>
            <Link href={ROTA_LISTA[conjunto]} className="btn-ghost">
              Ver os imóveis
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
