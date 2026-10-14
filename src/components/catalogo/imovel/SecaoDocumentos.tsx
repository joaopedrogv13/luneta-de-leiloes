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
 * Seções 6 e 7: documentos e links (anúncio, edital, matrícula, laudo, leiloeiro, mapa...), cada um com ícone
 * do tipo, descrição e o aviso de nova aba; e os dados da fonte (quem publicou, quando coletamos, quando a
 * fonte gerou a lista e o id do imóvel lá).
 */
export function SecaoDocumentos({ imovel: i }: { imovel: ImovelDetalhe }) {
  const links = ordenarLinks(i.links);
  const exemplo = ehExemplo(i);
  const idFonte = idNaFonte(i.id);

  return (
    <>
      <Secao id="documentos" titulo="Documentos e links" descricao="Tudo abre no site de origem, em nova aba. Leia o edital antes de qualquer lance.">
        {exemplo && (
          <p className="mb-3 flex gap-2.5 text-[13.5px] leading-relaxed text-nevoa">
            <IconeInfo tamanho={16} className="mt-0.5" />
            Exemplo fictício: não há edital, matrícula nem anúncio reais.
          </p>
        )}
        {links.length === 0 ? (
          <p className="rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 text-[14px] leading-relaxed text-nevoa">
            A fonte não publicou links nem documentos deste imóvel. Procure o edital no site do leiloeiro ou da fonte.
          </p>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
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
                    <span className="mt-1 block text-[12.5px] leading-snug break-words text-nevoa">
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
      </Secao>

      <Secao id="fonte" titulo="Dados da fonte">
        <dl className="grid gap-x-6 gap-y-4 rounded-3xl border border-nevoa/15 bg-tinta p-5 sm:grid-cols-2">
          <div>
            <dt className="text-[12.5px] text-nevoa">Fonte</dt>
            <dd className="mt-1 text-[15px] font-semibold text-luar">{i.fonte.nome}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-nevoa">Coletado em</dt>
            <dd className="mt-1 text-[15px] font-semibold text-luar tabular-nums">{data(i.coletadoEm)}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-nevoa">Gerado na fonte em</dt>
            <dd className={`mt-1 text-[15px] ${i.geradoNaFonteEm ? "font-semibold text-luar tabular-nums" : "text-nevoa"}`}>
              {i.geradoNaFonteEm ? data(i.geradoNaFonteEm) : exemplo ? "não se aplica (exemplo fictício)" : naoInformado("f")}
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-nevoa">Id na fonte</dt>
            <dd className={`mt-1 text-[15px] ${idFonte ? "font-semibold text-luar tabular-nums" : "text-nevoa"}`}>
              {idFonte ?? (exemplo ? "não se aplica (exemplo fictício)" : naoInformado())}
            </dd>
          </div>
        </dl>
        <p className="mt-4 flex gap-2.5 text-[13.5px] leading-relaxed font-medium text-luar">
          <IconeInfo tamanho={16} className="mt-0.5 text-aten" />
          Preços, praças e datas mudam: confira sempre o edital no site da fonte.
        </p>
      </Secao>
    </>
  );
}
