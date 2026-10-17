import type { ReactNode } from "react";
import type { ChaveGlossario } from "@/content/glossario";
import { BotaoTermo } from "./Termo";

/**
 * Peças de layout da página do imóvel (sem estado: servem ao servidor e ao navegador).
 * Cada seção é um <section> com h2 (id `<id>-titulo`, focável por programa: o foco volta para ele depois de
 * "Assinar Luneta"). Uma âncora para o título 12 px abaixo da navegação fixa (o resto vem do scroll-padding
 * que RolagemSegura mede).
 */
export function Secao({
  id,
  titulo,
  sobretitulo,
  descricao,
  children,
  className = "",
}: {
  id: string;
  titulo: ReactNode;
  sobretitulo?: string;
  descricao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} data-secao-imovel={id} aria-labelledby={`${id}-titulo`} className={`scroll-mt-3 ${className}`}>
      {sobretitulo && <p className="eyebrow mb-2.5 leading-[1.4]!">{sobretitulo}</p>}
      <h2
        id={`${id}-titulo`}
        tabIndex={-1}
        className="font-display text-[24px] leading-[1.15] font-bold tracking-[-0.02em] text-luar outline-none sm:text-[28px]"
      >
        {titulo}
      </h2>
      {descricao && <div className="mt-2 max-w-[68ch] text-[14.5px] leading-relaxed text-nevoa">{descricao}</div>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Subtítulo dentro de uma seção (h3). */
export function Subtitulo({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h3 id={id} className={`text-[13px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase ${className}`}>
      {children}
    </h3>
  );
}

/**
 * Um fato da grade: ícone, rótulo (dt) e valor (dd); valor ausente sai esmaecido. Com `termo`, o valor ganha ao
 * lado o (i) que abre a explicação do glossário.
 */
export function Fato({
  icone,
  rotulo,
  valor,
  vazio = false,
  nota,
  largo = false,
  termo,
}: {
  icone: ReactNode;
  rotulo: string;
  valor: ReactNode;
  /** a fonte não informa: valor esmaecido, sem negrito */
  vazio?: boolean;
  nota?: ReactNode;
  /** ocupa a linha inteira da grade */
  largo?: boolean;
  /** termo do glossário que explica o valor (o (i) ao lado) */
  termo?: ChaveGlossario | null;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border border-nevoa/12 bg-tinta px-3.5 pt-3 pb-3.5 sm:px-4 ${largo ? "col-span-full" : ""}`}>
      <dt className="flex items-center gap-2 text-[12.5px] leading-snug text-nevoa">
        <span aria-hidden="true" className="text-nevoa/90">
          {icone}
        </span>
        {rotulo}
      </dt>
      <dd className={`mt-1.5 leading-snug break-words ${vazio ? "text-[13.5px] text-nevoa" : "text-[15px] font-semibold text-luar tabular-nums sm:text-[16px]"}`}>
        {termo ? <ComTermo valor={valor} termo={termo} /> : valor}
      </dd>
      {nota && <dd className="mt-1 text-[12.5px] leading-snug break-words text-nevoa">{nota}</dd>}
    </div>
  );
}

/**
 * O valor com o (i) colado à última palavra: os dois vão juntos para a linha de baixo quando o texto quebra (o (i)
 * nunca fica sozinho numa linha nem solto no canto do cartão).
 */
export function ComTermo({ valor, termo }: { valor: ReactNode; termo: ChaveGlossario }) {
  const botao = <BotaoTermo termo={termo} className="-my-1 ml-1.5 align-middle" />;
  if (typeof valor !== "string") {
    return (
      <>
        {valor}
        {botao}
      </>
    );
  }
  const k = valor.trimEnd().lastIndexOf(" ");
  return (
    <>
      {k > 0 ? valor.slice(0, k + 1) : ""}
      <span className="whitespace-nowrap">
        {k > 0 ? valor.slice(k + 1) : valor}
        {botao}
      </span>
    </>
  );
}

/** Grade de fatos (1 coluna no celular estreito, 2 a partir de 380 px, 3 no computador). */
export function GradeFatos({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <dl aria-label={rotulo} className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 lg:grid-cols-3">
      {children}
    </dl>
  );
}

/** "abre em nova aba", só para leitores de tela (o ícone ↗ mostra o mesmo a quem enxerga). */
export const NovaAba = () => <span className="sr-only"> (abre em nova aba)</span>;
