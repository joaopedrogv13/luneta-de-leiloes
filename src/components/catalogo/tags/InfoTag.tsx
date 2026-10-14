import Link from "next/link";
import { SeverityIcon } from "@/components/niveis/severity";
import { SEVERIDADE_ROTULO } from "@/lib/catalogo/rotulos";
import type { TagDetalhe, TagResumo } from "@/lib/catalogo/tipos";
import { IconeFechar, IconeSeta } from "../cartoes/icones";
import { CONFIANCA_NIVEL, CONFIANCA_ROTULO, conteudoTag, origemTag, partesEvidencia } from "./conteudo";
import { temMascara, TextoMascarado } from "./TextoMascarado";

/** Cor do texto e do selo redondo por gravidade (os mesmos papéis da Tag). */
export const TOM_SEVERIDADE = {
  grave: { texto: "text-grave-texto", fundo: "bg-grave/12 border-grave/45" },
  atencao: { texto: "text-aten", fundo: "bg-aten/10 border-aten/45" },
  positivo: { texto: "text-pos", fundo: "bg-pos/10 border-pos/45" },
  info: { texto: "text-nevoa", fundo: "bg-nevoa/10 border-nevoa/40" },
} as const;

const temDetalhe = (t: TagResumo | TagDetalhe): t is TagDetalhe => "origem" in t && typeof t.origem === "string";

/**
 * Explicação de uma tag (conteúdo do pop-up e, se quiser, da página do imóvel): gravidade, nome, "O que é",
 * "Na prática" e, com a TagDetalhe, "Por que este imóvel tem esta tag" (evidência, origem e confiança).
 * Tag em revisão ganha o aviso de que foi calculada automaticamente e não é fato.
 */
export function InfoTag({
  tag,
  onFechar,
  hrefEvidencia,
  tituloComo: Titulo = "p",
  className = "",
}: {
  tag: TagResumo | TagDetalhe;
  /** elemento do nome da tag: "p" no pop-up (não mexe na hierarquia de títulos da página); "h3"/"h4" numa página */
  tituloComo?: "p" | "h3" | "h4";
  /** mostra o botão de fechar (pop-up) */
  onFechar?: () => void;
  /** sem a evidência aqui (cartões), link para vê-la na página do imóvel */
  hrefEvidencia?: string;
  className?: string;
}) {
  const c = conteudoTag(tag);
  const tom = TOM_SEVERIDADE[tag.severidade] ?? TOM_SEVERIDADE.info;
  const detalhe = temDetalhe(tag) ? tag : null;
  const origem = detalhe ? origemTag(detalhe.origem) : null;
  const evidencia = detalhe?.evidencia ? partesEvidencia(detalhe.evidencia, detalhe.origem) : { nota: null, trecho: null };
  const nivel = detalhe ? (CONFIANCA_NIVEL[detalhe.confianca] ?? 1) : 0;

  return (
    <div className={`p-4 sm:p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border ${
            tag.emRevisao ? "border-dashed border-nevoa/60 text-nevoa" : `${tom.fundo} ${tom.texto}`
          }`}
        >
          <SeverityIcon severity={tag.severidade} size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] leading-tight font-semibold tracking-[0.12em] uppercase ${tom.texto}`}>
            {SEVERIDADE_ROTULO[tag.severidade]}
            {tag.emRevisao && <span className="tracking-normal normal-case">, se confirmada</span>}
            {c.categoria && <span className="text-nevoa"> · {c.categoria}</span>}
          </p>
          <Titulo className="mt-1 font-display text-lg leading-snug font-bold tracking-[-0.01em] text-luar">{c.rotulo}</Titulo>
        </div>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar explicação"
            className="-mt-1.5 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-nevoa transition-colors hover:bg-nevoa/10 hover:text-luar pointer-fine:size-9"
          >
            <IconeFechar />
          </button>
        )}
      </div>

      {tag.emRevisao && (
        <p className="mt-3.5 rounded-xl border border-dashed border-nevoa/55 bg-nevoa/[0.07] px-3 py-2.5 text-[13px] leading-snug text-luar">
          <strong className="font-semibold">Em revisão.</strong> Calculada automaticamente, aguarda leitura humana: não trate como fato.
        </p>
      )}

      <dl className="mt-4 space-y-3">
        <div>
          <dt className="text-[11px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase">O que é</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-luar">{c.oQueE}</dd>
        </div>
        <div>
          <dt className="text-[11px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase">Na prática</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-luar">{c.naPratica}</dd>
        </div>
      </dl>

      {detalhe && origem && (
        <div className="mt-4 rounded-2xl border border-nevoa/15 bg-noite/55 p-3.5">
          <p className="text-[11px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase">Por que este imóvel tem esta tag</p>
          {evidencia.nota || evidencia.trecho ? (
            <>
              {evidencia.nota && (
                <p className="mt-2.5 text-[13px] leading-relaxed break-words text-luar">
                  <TextoMascarado texto={evidencia.nota} />
                </p>
              )}
              {evidencia.trecho && (
                <blockquote className="mt-2.5 border-l-2 border-latao/70 pl-3 text-[13px] leading-relaxed break-words text-luar">
                  <span aria-hidden="true">“</span>
                  <TextoMascarado texto={evidencia.trecho} />
                  <span aria-hidden="true">”</span>
                </blockquote>
              )}
              {temMascara(`${evidencia.nota ?? ""} ${evidencia.trecho ?? ""}`) && (
                <p className="mt-2 text-[12px] leading-snug text-nevoa">Nomes e documentos de pessoas foram omitidos pela Luneta (LGPD).</p>
              )}
            </>
          ) : (
            <p className="mt-2.5 text-[13px] leading-relaxed text-nevoa">A fonte não traz um trecho que mostre isso; a tag veio da leitura dos dados.</p>
          )}
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs leading-snug text-nevoa">
            <div className="flex flex-wrap gap-x-1">
              <dt>Origem:</dt>
              <dd className="font-medium text-luar">
                {origem.rotulo}
                {origem.detalhe && <span className="font-normal text-nevoa"> ({origem.detalhe})</span>}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>Confiança:</dt>
              <dd className="flex items-center gap-1.5 font-medium text-luar">
                <span aria-hidden="true" className="flex items-end gap-[3px]">
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className={`block w-[4px] rounded-[1px] ${n <= nivel ? "bg-luar/80" : "bg-nevoa/30"}`}
                      style={{ height: 4 + n * 3 }}
                    />
                  ))}
                </span>
                {CONFIANCA_ROTULO[detalhe.confianca] ?? detalhe.confianca}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {!detalhe && hrefEvidencia && (
        <Link
          href={hrefEvidencia}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-0"
        >
          Ver por que este imóvel tem esta tag
          <IconeSeta size={14} />
        </Link>
      )}

      <p className="mt-4 border-t border-nevoa/15 pt-3 text-xs leading-snug text-nevoa">A classificação não é garantia; confira o edital.</p>
    </div>
  );
}
