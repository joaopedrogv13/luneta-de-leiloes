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
      {descricao && <div className="mt-2 max-w-[68ch] text-[14.5px] leading-relaxed text-nevoa max-sm:text-[15px]">{descricao}</div>}
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
export interface DadosFato {
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
}

export function Fato({ icone, rotulo, valor, vazio = false, nota, largo = false, termo }: DadosFato) {
  return (
    // celular: cartão mais enxuto (2 por linha mesmo em 360 px)
    <div className={`min-w-0 rounded-2xl border border-nevoa/12 bg-tinta px-3 pt-2.5 pb-3 sm:px-4 sm:pt-3 sm:pb-3.5 ${largo ? "col-span-full" : ""}`}>
      <dt className="flex items-center gap-1.5 text-[12.5px] leading-snug text-nevoa sm:gap-2">
        <span aria-hidden="true" className="shrink-0 text-nevoa/90">
          {icone}
        </span>
        <span className="min-w-0">{rotulo}</span>
      </dt>
      <dd className={`mt-1.5 leading-snug break-words ${vazio ? "text-sm text-nevoa sm:text-[13.5px]" : "text-[15px] font-semibold text-luar tabular-nums sm:text-[16px]"}`}>
        {termo ? <ComTermo valor={valor} termo={termo} /> : valor}
      </dd>
      {nota && <dd className="mt-1 text-[13px] leading-snug break-words text-nevoa sm:text-[12.5px]">{nota}</dd>}
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

/**
 * Grade de fatos pela largura dela mesma (container query), não da tela: 2 colunas (até em 360 px), 3 a partir de
 * 672 px (tablet, computador com o resumo aberto) e 4 a partir de 1.152 px. Com `agrupar`, os campos que a fonte
 * não informa (o valor é um dos textos de `agrupar.valores`, sem nota) saem da grade e viram uma linha só no fim:
 * "Não informados pela fonte: área total, FGTS, parcelamento", cada um com o seu (i). Ocupavam o mesmo espaço dos
 * que têm dado.
 */
export function GradeFatos({
  rotulo,
  fatos,
  agrupar,
}: {
  rotulo: string;
  fatos: (DadosFato | null | false)[];
  agrupar?: { rotulo: string; valores: readonly string[] };
}) {
  const lista = fatos.filter((f): f is DadosFato => !!f);
  const agrupado = (f: DadosFato) => !!agrupar && !!f.vazio && !f.nota && typeof f.valor === "string" && agrupar.valores.includes(f.valor);
  const cheios = lista.filter((f) => !agrupado(f));
  const vazios = lista.filter(agrupado);
  return (
    <div className="@container">
      {cheios.length > 0 && (
        <dl aria-label={rotulo} className="grid grid-cols-2 gap-2 sm:gap-2.5 @2xl:grid-cols-3 @6xl:grid-cols-4">
          {cheios.map((f) => (
            <Fato key={f.rotulo} {...f} />
          ))}
        </dl>
      )}
      {vazios.length > 0 && agrupar && (
        // div (e não p): o pop-up do (i) nasce aqui dentro
        <div className={`text-sm leading-relaxed text-nevoa sm:text-[13.5px] ${cheios.length > 0 ? "mt-2.5" : ""}`}>
          <span className="font-medium text-luar/85">{agrupar.rotulo}:</span>{" "}
          {vazios.map((f, k) => (
            <span key={f.rotulo}>
              {f.termo ? (
                <span className="whitespace-nowrap">
                  {minuscula(f.rotulo)}
                  <BotaoTermo termo={f.termo} className="-my-1 ml-1 align-middle" />
                </span>
              ) : (
                minuscula(f.rotulo)
              )}
              {k < vazios.length - 1 ? ", " : "."}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Área total" → "área total"; siglas ("FGTS") ficam como estão. */
const minuscula = (s: string) => (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** "abre em nova aba", só para leitores de tela (o ícone ↗ mostra o mesmo a quem enxerga). */
export const NovaAba = () => <span className="sr-only"> (abre em nova aba)</span>;
