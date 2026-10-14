import { local } from "@/lib/catalogo/rotulos";
import { linkGoogleMaps } from "@/lib/catalogo/texto";
import type { ImovelDetalhe, PontoMapa } from "@/lib/catalogo/tipos";
import { legendaPosicao, localRepetido, textoPosicao } from "./formato";
import { IconeExterno, IconePino } from "./icones";
import { MapaLocal } from "./MapaLocal";
import { NovaAba, Secao } from "./partes";

/**
 * Seção 5, "Localização": o mapa mini com o ponto, a precisão da posição (hoje, na Caixa, o centro da
 * cidade), o endereço e "Abrir no Google Maps" (busca pelo endereço publicado; sem endereço, bairro e cidade).
 */
export function SecaoLocalizacao({ imovel: i }: { imovel: ImovelDetalhe }) {
  const mapa = i.links.find((l) => l.tipo === "mapa");
  const url = mapa?.url ?? linkGoogleMaps({ endereco: i.endereco, bairro: i.bairro, cidade: i.cidade, uf: i.uf });
  const ponto: PontoMapa | null =
    i.lat !== null && i.lon !== null
      ? {
          chave: `${i.uf}|${i.cidade}`,
          cidade: i.cidade,
          uf: i.uf,
          lat: i.lat,
          lon: i.lon,
          total: 1,
          lanceMin: i.lance,
          desagioMax: i.desagio,
          destaques: [],
        }
      : null;

  return (
    <Secao id="localizacao" titulo="Localização">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-start">
        {ponto ? (
          <MapaLocal ponto={ponto} notaPosicao={legendaPosicao(i.precisaoGeo)} />
        ) : (
          <p className="rounded-3xl border border-nevoa/15 bg-tinta px-4 py-6 text-center text-[14px] text-nevoa">A fonte não informa a posição deste imóvel.</p>
        )}
        <div className="rounded-3xl border border-nevoa/15 bg-tinta p-5">
          <p className="flex items-start gap-2.5 text-[15px] leading-snug text-luar">
            <IconePino tamanho={18} className="mt-px text-nevoa" />
            <span className="min-w-0">
              {i.endereco ? <span className="block font-medium">{i.endereco}</span> : <span className="block text-nevoa">Endereço não informado pela fonte</span>}
              {!localRepetido(i) && <span className="mt-0.5 block text-nevoa">{local(i)}</span>}
            </span>
          </p>
          {ponto && <p className="mt-4 text-[13.5px] leading-relaxed text-nevoa">{textoPosicao(i)}. O ponto no mapa não marca o imóvel exato.</p>}
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-outline mt-5 w-full gap-2">
            Abrir no Google Maps
            <IconeExterno tamanho={16} />
            <NovaAba />
          </a>
          <p className="mt-2.5 text-[12.5px] leading-snug text-nevoa">
            {mapa?.descricao ? `${mapa.descricao}.` : i.endereco ? "Busca o endereço publicado pela fonte." : "A fonte não publica o endereço: a busca usa bairro e cidade."}
          </p>
        </div>
      </div>
    </Secao>
  );
}
