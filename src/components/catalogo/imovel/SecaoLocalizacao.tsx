import { CartaoNota } from "@/components/catalogo/localizacao/CartaoNota";
import { ChamadaNotaLuneta } from "@/components/catalogo/localizacao/ChamadaNotaLuneta";
import { local } from "@/lib/catalogo/rotulos";
import { linkGoogleMaps } from "@/lib/catalogo/texto";
import type { ImovelDetalhe, LocalizacaoImovel, PontoMapa } from "@/lib/catalogo/tipos";
import { ehExemplo, legendaPosicao, linkPontoOsm, localRepetido, pontoDaSecao, textoPosicao } from "./formato";
import { IconeExterno, IconePino } from "./icones";
import { MapaLocal } from "./MapaLocal";
import { NovaAba, Secao } from "./partes";

/**
 * Seção 5, "Localização". Primeiro a nota de localização (plano Luneta; no Lente, a chamada com a prévia desenhada no
 * lugar), depois o mapa mini com o ponto e o endereço. O ponto é o mais preciso que houver (o do geocode do CNEFE, que a
 * nota usa, ou o do resumo); com ele, "Ver o ponto no OpenStreetMap" abre a coordenada, e "Abrir no Google Maps" busca o
 * endereço publicado (sem endereço, bairro e cidade).
 */
export function SecaoLocalizacao({
  imovel: i,
  localizacao,
  travada,
}: {
  imovel: ImovelDetalhe;
  /** a nota (null no Lente e quando não há o dado) */
  localizacao: LocalizacaoImovel | null;
  /** o plano não vê a nota (Lente): a chamada da Luneta no lugar */
  travada: boolean;
}) {
  const exemplo = ehExemplo(i);
  const mapa = i.links.find((l) => l.tipo === "mapa");
  const url = mapa?.url ?? linkGoogleMaps({ endereco: i.endereco, bairro: i.bairro, cidade: i.cidade, uf: i.uf });
  // exemplo fictício: o ponto da nota inventada é a sede da cidade, nunca "localizado no número"
  const p = pontoDaSecao(i, exemplo ? null : localizacao);
  const ponto: PontoMapa | null = p
    ? {
        chave: `${i.uf}|${i.cidade}`,
        cidade: i.cidade,
        uf: i.uf,
        lat: p.lat,
        lon: p.lon,
        total: 1,
        lanceMin: i.lance,
        desagioMax: i.desagio,
        destaques: [],
      }
    : null;
  // o ponto vale abrir no mapa quando é melhor que a sede da cidade (e não é o de um exemplo fictício)
  const pontoUtil = p && !exemplo && (p.precisao === "exata" || p.precisao === "rua" || p.precisao === "bairro");

  const nota = travada ? (
    <ChamadaNotaLuneta id={i.id} />
  ) : localizacao ? (
    <CartaoNota loc={localizacao} id={i.id} cidade={`${i.cidade}/${i.uf}`} exemplo={exemplo} urlMapa={url} />
  ) : null;

  return (
    <Secao id="localizacao" titulo="Localização">
      {/* Luneta: a nota é a resposta e vem primeiro; Lente: o mapa e o endereço (abertos) vêm antes da chamada */}
      {nota && !travada && <div className="mb-5">{nota}</div>}
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-start">
        {ponto ? (
          <MapaLocal ponto={ponto} notaPosicao={legendaPosicao(p!.precisao, p!.cnefe)} />
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
          {ponto && (
            <p className="mt-4 text-sm leading-relaxed text-nevoa sm:text-[13.5px]">
              {textoPosicao({ ...i, precisaoGeo: p!.precisao }, p!.cnefe)}. O ponto no mapa não marca o imóvel exato.
            </p>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-outline mt-5 w-full gap-2">
            Abrir no Google Maps
            <IconeExterno tamanho={16} />
            <NovaAba />
          </a>
          <p className="mt-2.5 text-[13px] leading-snug text-nevoa sm:text-[12.5px]">
            {mapa?.descricao ? `${mapa.descricao}.` : i.endereco ? "Busca o endereço publicado pela fonte." : "A fonte não publica o endereço: a busca usa bairro e cidade."}
          </p>
          {pontoUtil && (
            <a
              href={linkPontoOsm(p!.lat, p!.lon, p!.precisao === "bairro")}
              target="_blank"
              rel="noopener noreferrer"
              // texto e ícone em linha (não flex): quebrando em duas linhas, o ícone fica junto da última palavra
              className="mt-1 block py-2.5 text-[14px] leading-snug font-semibold text-latao-texto underline-offset-4 hover:text-luar hover:underline pointer-fine:py-1.5"
            >
              {p!.precisao === "bairro" ? "Ver o centro do bairro no " : "Ver o ponto no "}
              <span className="whitespace-nowrap">
                OpenStreetMap
                <IconeExterno tamanho={15} className="ml-1.5 inline-block align-[-2px]" />
              </span>
              <NovaAba />
            </a>
          )}
        </div>
      </div>
      {nota && travada && <div className="mt-5">{nota}</div>}
    </Secao>
  );
}
