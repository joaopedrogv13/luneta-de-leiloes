import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConviteLuneta } from "@/components/catalogo/planos/convite";
import { RecursoLuneta } from "@/components/catalogo/planos/RecursoLuneta";
import { TemaSalvo } from "@/components/catalogo/imovel/TemaSalvo";
import { LogoMark } from "@/components/ui/Logo";
import { local } from "@/lib/catalogo/rotulos";
import { rotaImovel } from "@/lib/catalogo/rotas";
import type { Conjunto, ImovelDetalhe } from "@/lib/catalogo/tipos";

/** O título da aba (e o nome do arquivo, se alguém salvar a página). */
export const TITULO_RELATORIO_TRAVADO = "Relatório do imóvel (plano Luneta)";

/**
 * /relatorio aberto no plano Lente: uma página simples, sem a simulação, sem a região e sem os alertas (nada da Luneta
 * sai do servidor; o código do relatório e do simulador nem é carregado). Diz o que o relatório traz, volta ao imóvel
 * e abre a janela da Luneta; "Assinar Luneta" (na demonstração, sem pagamento) abre o relatório de verdade.
 */
export function RelatorioTravado({ conjunto, imovel: i }: { conjunto: Conjunto; imovel: Pick<ImovelDetalhe, "id" | "titulo" | "cidade" | "uf" | "bairro"> }) {
  const voltar = `${rotaImovel(conjunto, i.id, "lente")}#simulador`;
  const relatorioLuneta = `${rotaImovel(conjunto, i.id)}/relatorio`;
  return (
    <ConviteLuneta hrefLuneta={relatorioLuneta}>
      <TemaSalvo />
      <header className="border-b border-nevoa/12 bg-noite">
        <div className="mx-auto flex min-h-14 max-w-[760px] items-center gap-3 px-4 sm:min-h-16 sm:px-6">
          <Link href={voltar} prefetch={false} className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-full pr-2 pl-1 text-[14px] font-medium text-nevoa no-underline hover:text-luar">
            <span aria-hidden="true">←</span>
            Voltar ao imóvel
          </Link>
          <span className="ml-auto inline-flex items-center gap-2 text-[15px] font-bold text-luar max-[379px]:hidden">
            <LogoMark />
            <span className="font-display">Luneta</span>
          </span>
          <ThemeToggle />
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-[760px] px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <p className="eyebrow">Relatório em PDF</p>
        <h1 className="mt-2.5 font-display text-[26px] leading-[1.15] font-bold tracking-[-0.02em] text-balance text-luar sm:text-[32px]">Relatório do imóvel</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
          {i.titulo} · {local(i)}
        </p>
        <RecursoLuneta
          recurso="relatorio"
          comoTitulo="h2"
          titulo="O relatório em PDF é do plano Luneta"
          texto="Ele traz o imóvel, o resultado da simulação com os seus ajustes, os cenários, a conta linha a linha, o preço da região e os principais alertas, num relatório em folhas A4, pronto para imprimir."
          className="mt-8"
        />
      </main>
    </ConviteLuneta>
  );
}
