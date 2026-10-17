import { numero } from "@/lib/catalogo/rotulos";
import type { CoberturaPrecos, FontePreco } from "@/lib/catalogo/tipos";
import { Expansor } from "./Expansor";
import { listaE } from "./formato";
import { IconeExterno } from "./icones";
import { NovaAba } from "./partes";

type Situacao = FontePreco["situacao"];

const ORDEM: readonly Situacao[] = ["temos", "coleta_pendente", "sem_dado_aberto", "precisa_autorizacao"];

const GRUPO: Record<Situacao, { titulo: string; nota: string }> = {
  temos: { titulo: "Temos os dados", nota: "preço pago nas compras registradas na prefeitura" },
  coleta_pendente: { titulo: "Coleta pendente", nota: "dado aberto; a coleta ainda vai rodar" },
  sem_dado_aberto: { titulo: "Sem dado aberto", nota: "dá para pedir à prefeitura pela Lei de Acesso à Informação" },
  precisa_autorizacao: { titulo: "Precisa de autorização", nota: "uso no site depende de autorização" },
};

/** Marcador de cada situação: o texto diz o mesmo (nada só por cor ou forma). */
function Marca({ s }: { s: Situacao }) {
  const base = "grid size-5 shrink-0 place-items-center rounded-full";
  if (s === "temos")
    return (
      <span aria-hidden="true" className={`${base} bg-latao/20 text-latao-texto`}>
        <svg viewBox="0 0 20 20" width="12" height="12">
          <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (s === "coleta_pendente")
    return (
      <span aria-hidden="true" className={`${base} border border-nevoa/50 text-nevoa`}>
        <svg viewBox="0 0 20 20" width="12" height="12">
          <path d="M10 5.5V10l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  return <span aria-hidden="true" className={`${base} border border-dashed border-nevoa/55`} />;
}

/** "São Paulo/SP" → "São Paulo" (a lista curta lê melhor sem a UF). */
const semUf = (nome: string) => nome.replace(/\/[A-Z]{2}$/, "");

/**
 * "De onde vêm os preços": de quais cidades a Luneta tem o preço de transações reais (ITBI) e de quais ainda não,
 * e o FipeZAP (precisa de autorização). O resumo fica à vista; a lista com período, quantidade, licença e o link da
 * fonte de cada cidade abre em "Ver a situação de cada cidade".
 */
export function FontesPrecos({
  cobertura,
  cidade,
  exemplo,
  semComparacao = null,
}: {
  cobertura: CoberturaPrecos | undefined;
  cidade: string;
  exemplo: boolean;
  /** a cidade tem ITBI, mas este imóvel fica fora da comparação: o motivo, e se ele já aparece na tabela acima */
  semComparacao?: { motivo: string; naTabela: boolean } | null;
}) {
  if (!cobertura || cobertura.fontes.length === 0) return null;
  const por = (s: Situacao) => cobertura.fontes.filter((f) => f.situacao === s);
  const temos = por("temos").filter((f) => f.tipo === "itbi");
  const pendentes = por("coleta_pendente");
  const daCidade = cobertura.fontes.find((f) => f.tipo === "itbi" && f.nome === cidade);

  return (
    <div className="rounded-3xl border border-dashed border-nevoa/30 px-4 py-4 sm:px-6 sm:py-5">
      <h3 className="text-[12px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase">De onde vêm os preços</h3>
      <ul className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-nevoa">
        <li>
          <span className="font-medium text-luar">Avaliação e lance:</span> os imóveis em leilão na base da Luneta, em todas as cidades.
        </li>
        <li>
          <span className="font-medium text-luar">Preço pago (ITBI):</span>{" "}
          {temos.length > 0 ? <>temos {listaE(temos.map((f) => semUf(f.nome)))}</> : "ainda nenhuma cidade"}
          {pendentes.length > 0 && <>; {listaE(pendentes.map((f) => semUf(f.nome)))} com coleta pendente</>}.{" "}
          {cobertura.cidadeTemItbi ? (
            <span className="text-luar">
              {exemplo ? "A cidade deste exemplo" : cidade} está entre as que temos
              {semComparacao ? (
                <span className="text-nevoa">
                  , mas este imóvel fica fora da comparação{semComparacao.naTabela ? " (o motivo está na tabela acima)" : `: ${semComparacao.motivo.replace(/\.$/, "")}`}
                </span>
              ) : null}
              .
            </span>
          ) : (
            <span>
              Para {cidade}, ainda não{daCidade?.situacao === "sem_dado_aberto" ? " (a prefeitura não publica; dá para pedir pela LAI)" : ""}.
            </span>
          )}
        </li>
        {por("precisa_autorizacao").map((f) => (
          <li key={f.nome}>
            <span className="font-medium text-luar">{f.nome}:</span> {f.detalhe}.
          </li>
        ))}
      </ul>

      <Expansor rotulo="Ver a situação de cada cidade" rotuloAberto="Fechar a lista" className="mt-2">
        <div className="space-y-5 pt-3 pb-1">
          {ORDEM.map((s) => {
            const lista = por(s);
            if (lista.length === 0) return null;
            return (
              <div key={s}>
                <p className="flex items-center gap-2 text-[13px] font-semibold text-luar">
                  <Marca s={s} />
                  {GRUPO[s].titulo} <span className="font-normal text-nevoa tabular-nums">({lista.length})</span>
                </p>
                <p className="mt-0.5 pl-7 text-[12.5px] leading-snug text-nevoa">{GRUPO[s].nota}</p>
                <ul className="mt-2 pl-7">
                  {lista.map((f) => (
                    <li key={f.nome} className="grid gap-x-4 gap-y-0.5 border-t border-nevoa/10 py-2 first:border-t-0 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
                      <p className={`text-[13.5px] font-medium ${f.nome === cidade ? "text-latao-texto" : "text-luar"}`}>
                        {f.nome}
                        {f.nome === cidade && <span className="text-[12px] font-normal"> · este imóvel</span>}
                      </p>
                      <p className="text-[12.5px] leading-snug text-nevoa">
                        {s === "sem_dado_aberto" ? "a prefeitura não publica as transações" : f.detalhe}
                        {f.imoveisNaBase !== null && f.imoveisNaBase > 0 && (
                          <span className="tabular-nums">
                            {" "}
                            · {numero(f.imoveisNaBase)} {f.imoveisNaBase === 1 ? "imóvel" : "imóveis"} na base
                          </span>
                        )}
                        {f.licenca && <span> · licença {f.licenca}</span>}
                        {f.url && (
                          <>
                            {" · "}
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 font-medium text-latao-texto underline underline-offset-4 hover:text-luar"
                            >
                              fonte
                              <IconeExterno tamanho={12} />
                              <span className="sr-only"> de {f.nome}</span>
                              <NovaAba />
                            </a>
                          </>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Expansor>
    </div>
  );
}
