import type { ImovelDetalhe, Vizinhanca } from "@/lib/catalogo/tipos";
import { GraficoM2 } from "./GraficoM2";
import { ehExemplo, fraseComparacao, frasePercentil, lanceForaDaRegiao, TIPO_NA_FRASE } from "./formato";
import { IconeAlerta, IconeExterno, IconeInfo } from "./icones";
import { Parecidos } from "./Parecidos";
import { NovaAba, Secao } from "./partes";

/** Os critérios que de fato valeram para os parecidos: área e quartos só entram quando o imóvel os tem. */
export function criteriosParecidos(i: Pick<ImovelDetalhe, "area" | "quartos">) {
  const extra =
    i.area !== null && i.quartos !== null ? ", com área e quartos próximos" : i.area !== null ? ", com área próxima" : i.quartos !== null ? ", com quartos próximos" : "";
  return `do mesmo tipo e da mesma cidade${extra}`;
}

/**
 * Seção 4, "Preço do m² na região": faixas de R$/m² dos outros imóveis do mesmo tipo em leilão na base
 * (bairro, cidade, estado), a frase direta da comparação e o aviso de que isso não é preço de mercado.
 * Em seguida, "Imóveis parecidos" (cartões da base) e as buscas prontas nos portais (só links).
 */
export function SecaoRegiao({ imovel: i, vizinhanca: v }: { imovel: ImovelDetalhe; vizinhanca: Vizinhanca }) {
  const exemplo = ehExemplo(i);
  const refs = v.referencias;
  const principal = refs.find((r) => r.avaliacaoM2) ?? refs[0];
  const frase = principal ? fraseComparacao(principal) : null;
  const percentil = principal ? frasePercentil(principal) : null;
  const foraDaRegiao = principal ? lanceForaDaRegiao(principal) : false;
  const tipos = TIPO_NA_FRASE[i.tipo];

  return (
    <>
      <Secao
        id="regiao"
        titulo="Preço do m² na região"
        sobretitulo="Comparação com outros leilões"
        descricao="Referência entre imóveis em leilão na base (avaliação da fonte), não é preço de mercado."
      >
        {refs.length === 0 || !principal ? (
          <p className="rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 text-[14px] leading-relaxed text-nevoa">
            {exemplo
              ? "Exemplo fictício: a demonstração tem poucos imóveis, então não há referência de preço da região."
              : `Ainda não há ${tipos} suficientes em leilão na base para comparar (pelo menos 5 no bairro ou na cidade, ou 3 no estado).`}
          </p>
        ) : (
          <div className="space-y-5">
            {foraDaRegiao && (
              <p className="flex items-start gap-2.5 rounded-2xl border border-aten/45 bg-aten/10 px-4 py-3 text-sm leading-snug text-luar">
                <IconeAlerta tamanho={18} className="mt-px shrink-0 text-aten" />
                <span>
                  O lance por m² deste imóvel está muito fora da faixa da região. Pode haver erro no anúncio (no preço ou na área, ou um lote com vários
                  imóveis): confira no site da fonte antes de usar a comparação.
                </span>
              </p>
            )}
            {frase ? (
              // fora da faixa, a comparação ("13.263% maior") não merece o destaque: vai em texto pequeno, depois do aviso
              <p
                className={
                  foraDaRegiao
                    ? "text-[14.5px] leading-relaxed text-nevoa"
                    : "font-display text-[19px] leading-snug font-bold tracking-[-0.01em] text-luar sm:text-[21px]"
                }
              >
                {frase}
              </p>
            ) : (
              <p className="text-[15px] leading-relaxed text-luar">
                A fonte não informa a área deste imóvel: sem ela não dá para comparar o preço por m². Veja abaixo a faixa da região.
              </p>
            )}
            {percentil && !foraDaRegiao && <p className="text-[14.5px] leading-relaxed text-nevoa">{percentil}</p>}
            <GraficoM2 referencias={refs} area={i.area} lanceTotal={i.lance} avaliacaoTotal={i.avaliacao} />
            <p className="flex gap-2.5 text-[13px] leading-relaxed text-nevoa">
              <IconeInfo tamanho={16} className="mt-0.5" />
              <span>
                A avaliação é a que a fonte publica, feita para o leilão; o lance é o mínimo de hoje. Os dois podem estar longe do preço de venda de
                verdade. Use como referência, junto com os anúncios da região.
              </span>
            </p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-dashed border-nevoa/35 px-4 py-3.5">
          <p className="text-[12px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase">Em breve</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-nevoa">
            Preço de transações reais (dados de ITBI das prefeituras) no Rio de Janeiro, em São Paulo, Porto Alegre, Fortaleza, Belo Horizonte e Recife,
            e o índice FipeZAP, com autorização.
          </p>
        </div>
      </Secao>

      <Secao id="parecidos" titulo="Imóveis parecidos">
        {v.parecidos.length > 0 ? (
          <Parecidos itens={v.parecidos} rotulo="Imóveis parecidos" criterios={criteriosParecidos(i)} />
        ) : (
          <p className="rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 text-[14px] leading-relaxed text-nevoa">
            {exemplo
              ? "Exemplo fictício: sem imóveis parecidos na demonstração."
              : `Nenhum imóvel parecido em leilão agora (${criteriosParecidos(i)}).`}
          </p>
        )}

        <div className="mt-8">
          <h3 className="text-[13px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase">Veja anúncios parecidos nos portais</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {v.buscasExternas.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={l.descricao}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-nevoa/30 px-4 text-[13.5px] font-medium text-luar no-underline transition-colors hover:border-latao hover:bg-latao/10 pointer-fine:min-h-9"
                >
                  {l.rotulo}
                  {l.rotulo !== "Google" && <span className="text-[12px] font-normal text-nevoa">· busca no Google</span>}
                  <IconeExterno tamanho={14} className="text-nevoa" />
                  <NovaAba />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-[68ch] text-[12.5px] leading-relaxed text-nevoa">
            Cada botão abre, em nova aba, uma busca do Google só com anúncios daquele portal, com o tipo, os quartos e o local deste imóvel. A Luneta não
            copia nem mostra anúncios: a comparação com preço de mercado fica com você.
          </p>
        </div>
      </Secao>
    </>
  );
}
