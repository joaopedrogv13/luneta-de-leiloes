import { data } from "@/lib/catalogo/rotulos";
import type { ImovelDetalhe, TipoLink } from "@/lib/catalogo/tipos";
import { dominio, ehExemplo, idNaFonte, naoInformado, ordenarLinks, TIPO_LINK_ROTULO } from "./formato";
import { IconeExterno, IconeInfo, IconeLinkTipo } from "./icones";
import { NovaAba, Secao } from "./partes";

/** O domínio ao lado da descrição só quando acrescenta algo (não num PDF guardado na nuvem, nem repetido). */
function mostrarDominio(descricao: string, url: string, tipo: TipoLink) {
  const d = dominio(url);
  if (tipo === "mapa" || descricao.includes(d)) return false;
  return !/(amazonaws|cloudfront|googleusercontent|blob\.core|storage)\./.test(d);
}

/**
 * Seção 6: documentos e links (anúncio, edital, matrícula, laudo, leiloeiro, mapa...), cada um com ícone do tipo,
 * descrição e o aviso de nova aba; no rodapé, numa linha, os dados da fonte (quem publicou, quando coletamos,
 * quando a fonte gerou a lista e o id do imóvel lá). Antes eram uma seção própria, um cartão grande para 4 dados;
 * a âncora #fonte continua valendo.
 */
export function SecaoDocumentos({ imovel: i }: { imovel: ImovelDetalhe }) {
  const links = ordenarLinks(i.links);
  const exemplo = ehExemplo(i);
  const idFonte = idNaFonte(i.id);

  return (
    <>
      <Secao id="documentos" titulo="Documentos e links" descricao="Tudo abre no site de origem, em nova aba. Leia o edital antes de qualquer lance.">
        {exemplo && (
          <p className="mb-3 flex gap-2.5 text-sm leading-relaxed text-nevoa sm:text-[13.5px]">
            <IconeInfo tamanho={16} className="mt-0.5" />
            Exemplo fictício: não há edital, matrícula nem anúncio reais.
          </p>
        )}
        {links.length === 0 ? (
          <p className="rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 text-[14px] leading-relaxed text-nevoa">
            A fonte não publicou links nem documentos deste imóvel. Procure o edital no site do leiloeiro ou da fonte.
          </p>
        ) : (
          <ul className="grid gap-2.5 @xl:grid-cols-2">
            {links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link flex h-full min-h-16 items-start gap-3.5 rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 no-underline transition-[border-color,background-color] duration-150 hover:border-latao/60 hover:bg-latao/[0.06]"
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ${l.tipo === "anuncio" ? "bg-latao/15 text-latao-texto" : "bg-nevoa/10 text-nevoa"}`}
                  >
                    <IconeLinkTipo tipo={l.tipo} tamanho={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase">{TIPO_LINK_ROTULO[l.tipo]}</span>
                    <span className="mt-1.5 block text-[15px] leading-snug font-semibold break-words text-luar group-hover/link:text-latao-texto">{l.rotulo}</span>
                    <span className="mt-1 block text-sm leading-snug break-words text-nevoa sm:text-[12.5px]">
                      {l.descricao ?? dominio(l.url)}
                      {l.descricao && mostrarDominio(l.descricao, l.url, l.tipo) && <span> · {dominio(l.url)}</span>}
                    </span>
                  </span>
                  <IconeExterno tamanho={16} className="mt-0.5 text-nevoa transition-colors group-hover/link:text-latao-texto" />
                  <NovaAba />
                </a>
              </li>
            ))}
          </ul>
        )}

        {/* os dados da fonte, numa linha de rodapé: "Caixa · coletado em 12/10/2026 · gerado em 08/10/2026 · id 1444…" */}
        <div id="fonte" tabIndex={-1} className="mt-5 scroll-mt-3 border-t border-nevoa/15 pt-4 outline-none">
          <h3 className="sr-only">Dados da fonte</h3>
          <dl className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-relaxed text-nevoa sm:text-[13.5px]">
            <div className="flex gap-1">
              <dt className="sr-only">Fonte</dt>
              <dd className="font-semibold text-luar">{i.fonte.nome}</dd>
            </div>
            <div className="flex gap-1">
              <dt>
                <span aria-hidden="true">· </span>
                coletado em
              </dt>
              {/* exemplo fictício: a data seria a do dia (gerada na hora), não uma coleta */}
              <dd className={exemplo ? "" : "text-luar tabular-nums"}>{exemplo ? "não se aplica (exemplo fictício)" : data(i.coletadoEm)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>
                <span aria-hidden="true">· </span>
                gerado na fonte em
              </dt>
              <dd className={i.geradoNaFonteEm ? "text-luar tabular-nums" : ""}>
                {i.geradoNaFonteEm ? data(i.geradoNaFonteEm) : exemplo ? "não se aplica (exemplo fictício)" : naoInformado("f")}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>
                <span aria-hidden="true">· </span>
                id na fonte
              </dt>
              <dd className={idFonte ? "text-luar tabular-nums" : ""}>{idFonte ?? (exemplo ? "não se aplica (exemplo fictício)" : naoInformado())}</dd>
            </div>
          </dl>
          <p className="mt-3 flex gap-2.5 text-sm leading-relaxed font-medium text-luar sm:text-[13.5px]">
            <IconeInfo tamanho={16} className="mt-0.5 text-aten" />
            Preços, praças e datas mudam: confira sempre o edital no site da fonte.
          </p>
        </div>
      </Secao>
    </>
  );
}
