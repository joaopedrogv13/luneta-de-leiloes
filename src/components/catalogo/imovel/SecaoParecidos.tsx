import Link from "next/link";
import type { ImovelDetalhe, Vizinhanca } from "@/lib/catalogo/tipos";
import { BOTAO_VITRINE, CTA_VITRINE, fraseParecidosFora } from "@/lib/catalogo/vitrine-textos";
import { MAXIMO_PARECIDOS } from "@/lib/catalogo/vizinhanca";
import { ROTA_PLANOS } from "../planos/textos";
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
  // vitrine da demonstração: os parecidos de fora da vitrine não aparecem; a seção diz quantos são
  const fora = v.parecidosForaDaVitrine ?? 0;
  return (
    <Secao id="parecidos" titulo="Imóveis parecidos" sobretitulo="Outros leilões para comparar">
      {v.parecidos.length > 0 && <Parecidos itens={v.parecidos} rotulo="Imóveis parecidos" criterios={criteriosParecidos(i)} />}
      {fora > 0 ? (
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-latao/45 bg-tinta px-4 py-3.5 ${v.parecidos.length > 0 ? "mt-4" : ""}`}>
          <p className="min-w-[220px] flex-1 text-[14px] leading-relaxed text-nevoa">
            <strong className="font-semibold text-luar">{fraseParecidosFora(fora, MAXIMO_PARECIDOS)}</strong> {CTA_VITRINE}{" "}
            <span className="text-[13px]">({criteriosParecidos(i)})</span>
          </p>
          <Link href={ROTA_PLANOS} prefetch={false} className="btn-outline !min-h-11 !px-4 !text-[13.5px] max-sm:w-full">
            {BOTAO_VITRINE}
          </Link>
        </div>
      ) : (
        v.parecidos.length === 0 && (
          <p className="rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 text-[14px] leading-relaxed text-nevoa">
            {exemplo ? "Exemplo fictício: sem imóveis parecidos na demonstração." : `Nenhum imóvel parecido em leilão agora (${criteriosParecidos(i)}).`}
          </p>
        )
      )}
    </Secao>
  );
}
