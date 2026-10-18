import { numero } from "@/lib/catalogo/rotulos";
import type { CoberturaPrecos, FontePreco } from "@/lib/catalogo/tipos";
import { Expansor } from "./Expansor";
import { LICENCA_A_CONFIRMAR, listaE } from "./formato";
import { IconeExterno } from "./icones";
import { NovaAba } from "./partes";

type Situacao = FontePreco["situacao"];

/** "São Paulo/SP" → "São Paulo" (a lista curta lê melhor sem a UF). */
const semUf = (nome: string) => nome.replace(/\/[A-Z]{2}$/, "");

/**
 * "De onde vêm os preços": de quais cidades a Luneta tem as compras registradas na prefeitura (ITBI) e se a cidade deste
 * imóvel está entre elas. Na tela do cliente, só o que já existe: as cidades sem dado aberto, as de coleta pendente e o
 * FipeZAP (que depende de autorização) ficam no PENDENCIAS.md e na metodologia, não aqui (revisão final da rodada 4,
 * UX-07). "Ver as cidades com compras registradas" abre o período, a quantidade, o que é o valor, a licença e o link
 * de cada uma. A licença não confirmada aparece como tal (R4-VAZ-10).
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
  const temos = cobertura.fontes.filter((f) => f.situacao === ("temos" satisfies Situacao) && f.tipo === "itbi");

  return (
    <div className="rounded-3xl border border-dashed border-nevoa/30 px-4 py-4 sm:px-6 sm:py-5">
      <h3 className="text-[12px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase">De onde vêm os preços</h3>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-nevoa sm:text-[13.5px]">
        <li>
          <span className="font-medium text-luar">Avaliação e lance:</span> os imóveis em leilão na base da Luneta, em todas as cidades.
        </li>
        <li>
          <span className="font-medium text-luar">Compras registradas na prefeitura (ITBI):</span>{" "}
          {temos.length > 0 ? <>temos {listaE(temos.map((f) => semUf(f.nome)))}</> : "ainda nenhuma cidade"}.{" "}
          {cobertura.cidadeTemItbi ? (
            <span className="text-luar">
              {exemplo ? "A cidade deste exemplo" : cidade} está entre elas
              {semComparacao ? (
                <span className="text-nevoa">
                  , mas este imóvel fica fora da comparação{semComparacao.naTabela ? " (o motivo está na tabela acima)" : `: ${semComparacao.motivo.replace(/\.$/, "")}`}
                </span>
              ) : null}
              .
            </span>
          ) : (
            <span>Para {exemplo ? "a cidade deste exemplo" : cidade}, ainda não temos compras registradas.</span>
          )}
        </li>
      </ul>

      {temos.length > 0 && (
        <Expansor rotulo="Ver as cidades com compras registradas" rotuloAberto="Fechar a lista" className="mt-2">
          <ul className="pt-3 pb-1">
            {temos.map((f) => (
              <li key={f.nome} className="grid gap-x-4 gap-y-0.5 border-t border-nevoa/10 py-2 first:border-t-0 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
                <p className={`text-[13.5px] font-medium ${f.nome === cidade ? "text-latao-texto" : "text-luar"}`}>
                  {f.nome}
                  {f.nome === cidade && <span className="text-[12px] font-normal"> · este imóvel</span>}
                </p>
                <p className="text-[13px] leading-snug text-nevoa sm:text-[12.5px]">
                  {f.detalhe}
                  {f.imoveisNaBase !== null && f.imoveisNaBase > 0 && (
                    <span className="tabular-nums">
                      {" "}
                      · {numero(f.imoveisNaBase)} {f.imoveisNaBase === 1 ? "imóvel" : "imóveis"} na base
                    </span>
                  )}
                  <span> · {f.licenca ? `licença ${f.licenca}` : LICENCA_A_CONFIRMAR}</span>
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
        </Expansor>
      )}
    </div>
  );
}
