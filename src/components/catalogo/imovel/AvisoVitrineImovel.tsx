import Link from "next/link";
import { SeloCancelamento } from "@/components/ui/SeloCancelamento";
import { BOTAO_VITRINE, CTA_VITRINE, fraseImovelVitrine } from "@/lib/catalogo/vitrine-textos";
import { ROTA_PLANOS } from "../planos/textos";

/**
 * Faixa no topo da página de um imóvel REAL da vitrine da demonstração (/assinante/imovel/caixa-…): "Este é um dos 10
 * imóveis reais da vitrine, de 21.230 na base", o convite e o botão para os planos, com o cancelamento grátis.
 * Componente do servidor, sem JavaScript. Não aparece nos exemplos fictícios nem na prévia.
 */
export function AvisoVitrineImovel({ mostrados, totalBase }: { mostrados: number; totalBase: number }) {
  return (
    <aside
      aria-label="Vitrine da demonstração"
      className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-2xl border border-latao/45 bg-tinta px-4 py-3 max-sm:mt-4 sm:px-5 [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_8px_24px_-12px_rgba(15,24,48,.14)]"
    >
      <p className="min-w-[220px] flex-1 text-[13.5px] leading-normal text-nevoa">
        <strong className="font-semibold text-luar">{fraseImovelVitrine(mostrados, totalBase)}</strong> {CTA_VITRINE}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 max-sm:w-full">
        <Link href={ROTA_PLANOS} prefetch={false} className="btn-primary !min-h-11 !px-5 !text-[13.5px] max-sm:w-full pointer-fine:!min-h-10">
          {BOTAO_VITRINE}
        </Link>
        <SeloCancelamento variante="linha" className="!text-[12.5px]" />
      </div>
    </aside>
  );
}
