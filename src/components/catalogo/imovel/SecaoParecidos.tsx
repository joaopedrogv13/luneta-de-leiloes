import type { ImovelDetalhe, Vizinhanca } from "@/lib/catalogo/tipos";
import { ehExemplo } from "./formato";
import { Parecidos } from "./Parecidos";
import { Secao } from "./partes";

/** Os critérios que de fato valeram para os parecidos: área e quartos só entram quando o imóvel os tem. */
export function criteriosParecidos(i: Pick<ImovelDetalhe, "area" | "quartos">) {
  const extra =
    i.area !== null && i.quartos !== null ? ", com área e quartos próximos" : i.area !== null ? ", com área próxima" : i.quartos !== null ? ", com quartos próximos" : "";
  return `do mesmo tipo e da mesma cidade${extra}`;
}

/** Última seção da página: imóveis parecidos em leilão na base (cartões numa fila que rola de lado). */
export function SecaoParecidos({ imovel: i, vizinhanca: v }: { imovel: ImovelDetalhe; vizinhanca: Vizinhanca }) {
  const exemplo = ehExemplo(i);
  return (
    <Secao id="parecidos" titulo="Imóveis parecidos" sobretitulo="Outros leilões para comparar">
      {v.parecidos.length > 0 ? (
        <Parecidos itens={v.parecidos} rotulo="Imóveis parecidos" criterios={criteriosParecidos(i)} />
      ) : (
        <p className="rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 text-[14px] leading-relaxed text-nevoa">
          {exemplo ? "Exemplo fictício: sem imóveis parecidos na demonstração." : `Nenhum imóvel parecido em leilão agora (${criteriosParecidos(i)}).`}
        </p>
      )}
    </Secao>
  );
}
