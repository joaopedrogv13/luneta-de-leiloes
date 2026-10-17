/**
 * Pedaços de layout do relatório (sem estado: servem ao servidor e às ilhas do navegador).
 */
import type { ReactNode } from "react";
import s from "./relatorio.module.css";

/** Uma folha A4. Da segunda em diante, o cabeçalho corrido da tela (no PDF ele vem da @page). */
export function Folha({ children, cabecalho, rotulo }: { children: ReactNode; cabecalho?: string; rotulo: string }) {
  return (
    <section className={s.folha} aria-label={rotulo}>
      {cabecalho && (
        <div className={s.cabecaFolha} aria-hidden="true">
          <span>LUNETA DE LEILÕES · RELATÓRIO DE SIMULAÇÃO</span>
          <span>{cabecalho}</span>
        </div>
      )}
      {children}
    </section>
  );
}

/** Seção numerada ("03 Cenários e prazos"), com uma frase opcional embaixo do título. */
export function Secao({
  numero,
  titulo,
  descricao,
  children,
  id,
}: {
  numero: string;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const idTitulo = id ? `${id}-titulo` : undefined;
  return (
    <section className={s.secao} id={id} aria-labelledby={idTitulo}>
      {/* título e frase não se separam, nem ficam sozinhos no pé da página */}
      <div className={s.secaoTopo}>
        <div className={s.secaoCabeca}>
          <span className={s.secaoNumero} aria-hidden="true">
            {numero}
          </span>
          <h2 id={idTitulo} className={s.secaoTitulo}>
            {titulo}
          </h2>
        </div>
        {descricao && <p className={s.secaoDescricao}>{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/** Marca em texto ("Ajustado", "Criado por você", "Retirado"): legível em preto e branco. */
export function Marca({ children, tom = "ajuste" }: { children: ReactNode; tom?: "ajuste" | "neutra" | "alerta" }) {
  const extra = tom === "neutra" ? s.marcaNeutra : tom === "alerta" ? s.marcaAlerta : "";
  return <span className={`${s.marcaAjuste} ${extra}`}>{children}</span>;
}
