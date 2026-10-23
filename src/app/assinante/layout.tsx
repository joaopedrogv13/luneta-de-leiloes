import { VoltarApresentacao } from "@/components/apresentacao/VoltarApresentacao";

/**
 * Toda a demonstração (/assinante, a página de cada exemplo e o relatório): o botão "Voltar à apresentação" para quem
 * veio da landing por um link (rodada 5, ponto 10; some no relatório e para quem entrou direto). Depois do conteúdo,
 * no fim da ordem do Tab, como o "Voltar ao site" do rodapé.
 */
export default function LayoutAssinante({ children }: LayoutProps<"/assinante">) {
  return (
    <>
      {children}
      <VoltarApresentacao />
    </>
  );
}
