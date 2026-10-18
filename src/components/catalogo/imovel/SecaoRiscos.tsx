import { SeverityIcon } from "@/components/niveis/severity";
import { AVISO_CLASSIFICACAO } from "@/content/avisos";
import { conteudoTag, SEVERIDADE_ORDEM } from "@/components/catalogo/tags/conteudo";
import { TagClicavel } from "@/components/catalogo/tags/TagClicavel";
import { Seal } from "@/components/ui/Seal";
import { SELO_ROTULO, SEVERIDADE_ROTULO } from "@/lib/catalogo/rotulos";
import type { ImovelDetalhe, Plano, Severidade, TagDetalhe } from "@/lib/catalogo/tipos";
import type { ChaveGlossario } from "@/content/glossario";
import { RecursoLuneta } from "@/components/catalogo/planos/RecursoLuneta";
import { PRODUTO } from "@/lib/catalogo/produto";
import { pode } from "@/lib/catalogo/planos";
import { IconeInfo } from "./icones";
import { Secao, Subtitulo } from "./partes";
import { BotaoTermo } from "./Termo";

/** Tags que têm um termo no glossário: o (i) ao lado explica o termo (a pílula explica a tag). */
const TERMO_DA_TAG: Record<string, ChaveGlossario> = { "direito-preferencia": "direito_preferencia" };

const GRUPO: Record<Severidade, string> = {
  grave: "Riscos graves",
  atencao: "Pontos de atenção",
  positivo: "Pontos positivos",
  info: "Informativos",
};

const TOM_TITULO: Record<Severidade, string> = {
  grave: "text-grave-texto",
  atencao: "text-aten",
  positivo: "text-pos",
  info: "text-nevoa",
};

export { AVISO_CLASSIFICACAO };

/** Uma tag por linha: a pílula (abre a explicação com a evidência) e o "O que é" ao lado, para ler sem clicar. */
function LinhaTag({ tag }: { tag: TagDetalhe }) {
  const c = conteudoTag(tag);
  return (
    <li className="grid gap-x-4 gap-y-1.5 border-t border-nevoa/10 py-3 first:border-t-0 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="min-w-0">
          <TagClicavel tag={tag} tamanho="md" />
        </div>
        {TERMO_DA_TAG[tag.slug] && <BotaoTermo termo={TERMO_DA_TAG[tag.slug]!} className="shrink-0" />}
      </div>
      <p className="text-sm leading-relaxed text-nevoa sm:pt-1.5 sm:text-[13.5px]">
        {tag.emRevisao && <span className={`font-semibold ${TOM_TITULO[tag.severidade]}`}>{SEVERIDADE_ROTULO[tag.severidade]}, se confirmada. </span>}
        {c.oQueE}
      </p>
    </li>
  );
}

/**
 * Seção 2, "Riscos e alertas". Luneta: as tags confirmadas agrupadas por gravidade (cada uma clicável, com
 * evidência, origem e confiança), um bloco à parte com as tags em revisão, o selo (ou "Selo em análise") com
 * o porquê e o aviso de que a classificação não é garantia. Lente: a chamada da Luneta (RecursoLuneta, com as
 * pílulas desenhadas; as tags nem chegam ao navegador).
 */
export function SecaoRiscos({ imovel: i, plano, selosDesligados }: { imovel: ImovelDetalhe; plano: Plano; selosDesligados: boolean }) {
  if (!pode(plano, "tags")) {
    return (
      <Secao id="riscos" titulo="Riscos e alertas" sobretitulo="Análise automática">
        <div id="tags" className="scroll-mt-3">
          <RecursoLuneta
            recurso="tags"
            titulo="Tags de risco e selo deste imóvel"
            texto={
              PRODUTO.leituraDoEdital
                ? "Ocupação, dívidas que passam ao arrematante, ações judiciais, matrícula e mais, com o trecho do anúncio que levou a cada alerta, e o selo quando o imóvel passa nos critérios."
                : "Os alertas que os dados da fonte já mostram (financiamento, direito de preferência do devedor, deságio e praça), com a origem de cada um, e o selo quando o imóvel passa nos critérios."
            }
          />
        </div>
        <Aviso />
      </Secao>
    );
  }

  const confirmadas = i.tags.filter((t) => !t.emRevisao);
  const revisao = i.tags.filter((t) => t.emRevisao);
  const grupos = SEVERIDADE_ORDEM.map((s) => ({ s, tags: confirmadas.filter((t) => t.severidade === s) })).filter((g) => g.tags.length > 0);
  const pendente = selosDesligados || i.seloPendente;

  return (
    <Secao
      id="riscos"
      titulo="Riscos e alertas"
      sobretitulo="Análise automática"
      descricao="Toque ou clique numa tag para ver o que ela quer dizer, o trecho que a originou e a confiança da leitura."
    >
      <div id="tags" className="scroll-mt-3 space-y-6">
        {grupos.length === 0 ? (
          <p className="rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 text-[14px] leading-relaxed text-nevoa">
            Nenhuma tag confirmada nos dados da fonte{revisao.length ? "; veja as em revisão abaixo" : ""}. Isso não quer dizer que não haja riscos: confira o edital.
          </p>
        ) : (
          grupos.map((g) => (
            <div key={g.s}>
              <Subtitulo className={`mb-1 flex items-center gap-2 ${TOM_TITULO[g.s]}`}>
                <SeverityIcon severity={g.s} size={13} />
                {GRUPO[g.s]}
                <span className="text-nevoa tabular-nums">({g.tags.length})</span>
              </Subtitulo>
              <ul aria-label={GRUPO[g.s]}>
                {g.tags.map((t) => (
                  <LinhaTag key={t.slug} tag={t} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {revisao.length > 0 && (
        <div className="mt-7 rounded-3xl border border-dashed border-nevoa/45 px-4 pt-4 pb-1 sm:px-5">
          <Subtitulo className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="6" cy="6" r="4.4" strokeDasharray="2.1 1.7" />
            </svg>
            Em revisão <span className="tabular-nums">({revisao.length})</span>
          </Subtitulo>
          <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-nevoa sm:text-[13.5px]">
            Calculadas automaticamente e ainda sem leitura humana: podem estar erradas. Não trate como fato; use como pista para ler o edital.
          </p>
          <ul aria-label="Tags em revisão" className="mt-2">
            {revisao.map((t) => (
              <LinhaTag key={t.slug} tag={t} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-7 flex gap-4 rounded-3xl border border-nevoa/15 bg-tinta p-5">
        <Seal level={pendente ? 0 : i.selo} size={52} />
        <div className="min-w-0">
          <h3 className="font-display text-[18px] leading-snug font-bold text-luar">
            {pendente ? "Selo em análise" : i.selo === 0 ? "Sem selo" : `Selo ${SELO_ROTULO[i.selo]}`}
          </h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-nevoa">
            {i.porQueSelo || (pendente ? "Os critérios dos selos ainda estão em definição com o advogado." : "")}
          </p>
        </div>
      </div>

      <Aviso />
    </Secao>
  );
}

function Aviso() {
  return (
    <p className="mt-5 flex gap-2.5 text-sm leading-relaxed text-nevoa sm:text-[13px]">
      <IconeInfo tamanho={16} className="mt-0.5 text-nevoa" />
      {AVISO_CLASSIFICACAO}
    </p>
  );
}
