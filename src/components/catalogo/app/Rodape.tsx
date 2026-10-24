import Link from "next/link";
import { BACK_TO_SITE } from "@/components/assinante/shared";
import { AVISO_CLASSIFICACAO } from "@/content/avisos";
import { data, dataHora, numero, plural } from "@/lib/catalogo/rotulos";
import type { SobreConjunto } from "@/lib/catalogo/tipos";
import { CTA_VITRINE, fraseVitrine } from "@/lib/catalogo/vitrine-textos";

export { AVISO_CLASSIFICACAO };

/** "lista de 08/10/2026" (Caixa publica uma lista por dia) ou "dados de 11/10/2026". */
function quandoDaFonte(f: SobreConjunto["fontes"][number]) {
  if (!f.geradoNaFonteEm) return "data não informada pela fonte";
  return `${f.id === "caixa_csv" ? "lista de" : "dados de"} ${data(f.geradoNaFonteEm)}`;
}

/** Texto da faixa da prévia, com as datas das fontes (completo no computador, curto no celular). */
export function faixaDaPrevia(sobre: SobreConjunto) {
  const fontes = sobre.fontes.map((f) => `${f.nome} (${quandoDaFonte(f)})`);
  const juntas = fontes.length > 1 ? `${fontes.slice(0, -1).join(", ")} e ${fontes[fontes.length - 1]}` : (fontes[0] ?? "");
  return {
    completa: ["Prévia interna com dados reais", juntas, "classificação automática ainda não revisada", "selos desligados"].filter(Boolean).join(" · "),
    curta: "Prévia interna com dados reais · classificação ainda não revisada",
    rotulo: "Aviso de prévia interna",
  };
}

/**
 * Rodapé do catálogo (do servidor, sem JavaScript): o aviso de que a classificação não é garantia, de quem
 * são as fotos e os anúncios e, na prévia, de onde e de quando vêm os dados (total da base e por fonte).
 */
export function RodapeCatalogo({
  sobre,
  total,
  exemplos = false,
  vitrine = null,
}: {
  sobre: SobreConjunto;
  total: number;
  /** só exemplos fictícios (a demonstração sem a base) */
  exemplos?: boolean;
  /** a vitrine da demonstração: imóveis reais da base, mais os exemplos fictícios à parte */
  vitrine?: { mostrados: number; totalBase: number } | null;
}) {
  return (
    <footer className="border-t border-nevoa/15 bg-tinta/40 px-4 pt-10 pb-16 text-[13px] leading-relaxed text-nevoa sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 lg:flex-row lg:justify-between">
        <div className="flex max-w-[72ch] flex-col gap-3">
          <p>
            <strong className="font-semibold text-luar">Aviso:</strong> {AVISO_CLASSIFICACAO}
            {exemplos ? " Os imóveis desta demonstração são exemplos fictícios." : " Preços, praças e datas mudam: confira sempre o edital no site da fonte."}
          </p>
          {vitrine && (
            <p>
              <strong className="font-semibold text-luar">{fraseVitrine(vitrine.mostrados, vitrine.totalBase)}</strong> {CTA_VITRINE} Os exemplos
              fictícios, à parte, servem para ver os selos; as fotos deles são ilustrativas, de imóveis reais parecidos.
            </p>
          )}
          <p>
            Fotos e anúncios pertencem às fontes. A foto aparece direto do site de origem (a Luneta não copia nem guarda imagens) e, se não carregar,
            fica um desenho no lugar.
          </p>
          <Link href={BACK_TO_SITE} prefetch={false} className="inline-flex min-h-11 items-center self-start font-medium text-latao-texto underline-offset-4 hover:text-luar hover:underline pointer-fine:min-h-8">
            <span aria-hidden="true">←&nbsp;</span>Voltar ao site
          </Link>
        </div>

        {/* sem fontes (o catálogo não carregou no servidor): nada de "0 imóveis na base" */}
        {!exemplos && sobre.fontes.length > 0 && (
          <section aria-labelledby="sobre-dados" className="lg:min-w-[340px]">
            <h2 id="sobre-dados" className="text-[11px] leading-none font-semibold tracking-[0.14em] text-nevoa uppercase">
              Sobre os dados
            </h2>
            <p className="mt-3 font-display text-2xl leading-none font-bold text-luar tabular-nums">
              {numero(total)} <span className="font-sans text-sm font-medium text-nevoa">imóveis ativos na base</span>
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {sobre.fontes.map((f) => (
                <li key={f.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-luar">{f.nome}</span>
                  <span className="tabular-nums">{plural(f.total, "imóvel", "imóveis")}</span>
                  <span aria-hidden="true">·</span>
                  <span>{quandoDaFonte(f)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs">Instantâneo da base gerado em {dataHora(sobre.geradoEm)} (horário de Brasília).</p>
          </section>
        )}
      </div>
    </footer>
  );
}
