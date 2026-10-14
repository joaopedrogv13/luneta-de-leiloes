import { Fragment } from "react";

/** Máscaras que a base põe no lugar de dados pessoais (base/util/lgpd.ts) e como cada uma aparece. */
const MASCARAS: Record<string, string> = {
  NOME: "nome omitido",
  CPF: "CPF omitido",
  CNPJ: "CNPJ omitido",
  RG: "RG omitido",
  "E-MAIL": "e-mail omitido",
  IP: "IP omitido",
};

const RE_MASCARA = /\[(NOME|CPF|CNPJ|RG|E-MAIL|IP)\]/g;

/** O texto tem alguma máscara de dado pessoal? */
export const temMascara = (texto: string) => /\[(?:NOME|CPF|CNPJ|RG|E-MAIL|IP)\]/.test(texto);

export const NOTA_LGPD = "Nomes e documentos de pessoas foram omitidos pela Luneta (LGPD). O texto completo está no anúncio da fonte.";

/**
 * Texto da fonte com as máscaras da LGPD ("[NOME]", "[CPF]"...) trocadas por um selo discreto ("nome omitido"),
 * em vez dos colchetes crus, que pareciam um modelo quebrado. O leitor de tela lê o selo como texto.
 */
export function TextoMascarado({ texto }: { texto: string }) {
  const partes = texto.split(RE_MASCARA);
  if (partes.length === 1) return <>{texto}</>;
  return (
    <>
      {partes.map((p, k) =>
        k % 2 === 0 ? (
          <Fragment key={k}>{p}</Fragment>
        ) : (
          <span
            key={k}
            title="Dado pessoal omitido pela Luneta (LGPD)"
            className="mx-px inline-block rounded-md bg-nevoa/12 px-1.5 align-baseline text-[0.86em] leading-[1.45] font-medium whitespace-nowrap text-nevoa ring-1 ring-nevoa/25 ring-inset"
          >
            {MASCARAS[p] ?? "dado omitido"}
          </span>
        ),
      )}
    </>
  );
}
