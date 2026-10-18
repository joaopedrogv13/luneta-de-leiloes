import { RecursoLuneta } from "@/components/catalogo/planos/RecursoLuneta";
import { AVISO_SIMULADOR } from "@/content/avisos";
import { moeda } from "@/lib/catalogo/rotulos";
import type { ImovelDetalhe, Vizinhanca } from "@/lib/catalogo/tipos";
import { FontesPrecos } from "./FontesPrecos";
import { ehExemplo } from "./formato";
import { Secao } from "./partes";

/**
 * As seções da página do imóvel no plano Lente, no lugar das da Luneta e na mesma posição (o título e a âncora da seção
 * continuam: a navegação e os links "#simulador", "#regiao" funcionam igual). Nada aqui usa dado da Luneta: o
 * servidor nem o manda (src/lib/catalogo/planos.ts). As duas são a chamada curta ("faixa"): a chamada grande, com a
 * prévia e o botão dourado, é só a primeira da página (Riscos; revisão final da rodada 4, UX-03).
 */

/** Venda direta: o preço é fixo (não há disputa), então a pergunta do simulador é se vale comprar por ele. */
const precoFixo = (i: Pick<ImovelDetalhe, "modalidade">) => i.modalidade === "venda_direta";

/**
 * "Simulador" no Lente: a chamada do simulador (e do relatório em PDF, que sai dele). O código do simulador nem é
 * carregado (SecaoSimulador, com next/dynamic, só é desenhada na Luneta).
 */
export function SecaoSimuladorTravada({ imovel: i }: { imovel: Pick<ImovelDetalhe, "modalidade" | "lance"> }) {
  const fixo = precoFixo(i);
  return (
    <Secao
      id="simulador"
      sobretitulo="Simulador de rentabilidade"
      titulo={
        fixo ? (
          <>
            Vale a pena comprar por <span className="whitespace-nowrap tabular-nums">{moeda(i.lance)}</span>?
          </>
        ) : (
          "Até quanto vale dar de lance?"
        )
      }
    >
      <RecursoLuneta
        recurso="simulador"
        variante="faixa"
        titulo={null}
        texto={
          fixo
            ? "faça a conta do lucro com as suas premissas: em quanto tempo ele vem e quanto de custo imprevisto ainda cabe na sua meta, com os custos da compra e o relatório em PDF."
            : "até quanto vale dar de lance para a sua meta, com os custos do leilão, três cenários de venda e o relatório em PDF."
        }
        // o mesmo aviso da Luneta: a pergunta do título não é recomendação (R4-VAZ-11)
        extra={<p>{AVISO_SIMULADOR}</p>}
      />
    </Secao>
  );
}

/**
 * "Preço do m² na região" no Lente: a chamada do preço da região e das buscas nos portais. A cobertura de preços é
 * pública e continua: se a cidade tem ITBI, a chamada diz que a Luneta tem compras reais dela, e "De onde vêm os
 * preços" fica embaixo.
 */
export function SecaoRegiaoTravada({ imovel: i, vizinhanca: v }: { imovel: ImovelDetalhe; vizinhanca: Vizinhanca }) {
  const exemplo = ehExemplo(i);
  const cidade = `${i.cidade}/${i.uf}`;
  return (
    <Secao id="regiao" titulo="Preço do m² na região" sobretitulo="Comparação com a região">
      <div className="space-y-6">
        {/* sem o nome: ele repetiria o título da seção ("Preço do m² na região") */}
        <RecursoLuneta
          recurso="regiao"
          variante="faixa"
          titulo={null}
          texto={`a avaliação comparada com a média da rua, do bairro e da cidade${
            v.cobertura?.cidadeTemItbi ? `, e com as compras registradas na prefeitura (ITBI) ${exemplo ? "da cidade deste exemplo" : `de ${cidade}`}` : ""
          }, com buscas prontas nos portais de anúncios.`}
        />
        <FontesPrecos cobertura={v.cobertura} cidade={cidade} exemplo={exemplo} />
      </div>
    </Secao>
  );
}
