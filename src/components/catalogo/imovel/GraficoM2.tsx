import { moedaCurta, numero } from "@/lib/catalogo/rotulos";
import type { ReferenciaM2 } from "@/lib/catalogo/tipos";
import { AREA_HECTARE, concorda, escalaRegiao, nomeRecorte, posicaoNaEscala, precoPorArea, ROTULO_ESCOPO, TIPO_NA_FRASE } from "./formato";

/** Posição (0–100%) de um valor na escala, presa às bordas. */
const pos = (v: number, min: number, max: number) => `${posicaoNaEscala(v, min, max).pct.toFixed(2)}%`;

/** Seta pequena ao lado de um marcador preso na borda: o valor passa da escala para aquele lado. */
function SetaFora({ lado }: { lado: -1 | 1 }) {
  return (
    <svg
      viewBox="0 0 8 10"
      aria-hidden="true"
      className={`absolute top-1/2 h-2.5 w-2 -translate-y-1/2 text-luar ${lado === 1 ? "left-[calc(100%+3px)]" : "right-[calc(100%+3px)] rotate-180"}`}
    >
      <path d="M1.5 1 6 5 1.5 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Preço do m² na região: uma faixa por recorte (bairro, cidade, estado) numa escala comum. A faixa
 * sombreada é a metade do meio das avaliações por m² dos outros imóveis do mesmo tipo (p25 a p75), o traço é
 * a mediana, e os dois marcadores são este imóvel: lance por m² (ponto cheio) e avaliação por m² (anel).
 * Os números de cada faixa vêm escritos embaixo dela (a tabela do gráfico). Um valor deste imóvel muito
 * longe da região (erro na fonte, quase sempre) não esmaga as faixas: fica preso na borda, com uma seta.
 * Imóvel de 10 ha ou mais: tudo por hectare, como no resto da página.
 */
export function GraficoM2({
  referencias,
  area,
  lanceTotal,
  avaliacaoTotal,
}: {
  referencias: ReferenciaM2[];
  area: number | null;
  /** lance e avaliação do imóvel (R$): por hectare, os marcadores saem deles e não do R$/m² arredondado da base */
  lanceTotal: number;
  avaliacaoTotal: number | null;
}) {
  const hectare = area !== null && area >= AREA_HECTARE;
  const doImovel = referencias[0]?.imovel;
  const lance = doImovel?.lanceM2 == null ? null : hectare && area ? lanceTotal / area : doImovel.lanceM2;
  const avaliacao = doImovel?.avaliacaoM2 == null ? null : hectare && area && avaliacaoTotal !== null ? avaliacaoTotal / area : doImovel.avaliacaoM2;
  const faixas = referencias.map((r) => ({ r, faixa: r.avaliacaoM2 ?? r.lanceM2, deAvaliacao: r.avaliacaoM2 !== null }));
  const escala = escalaRegiao(
    faixas.flatMap(({ faixa }) => (faixa ? [faixa.p25, faixa.p75, faixa.mediana] : [])),
    [...(lance !== null ? [lance] : []), ...(avaliacao !== null ? [avaliacao] : [])],
  );
  if (!escala) return null;
  const { min, max, marcas } = escala;
  const m2 = (v: number) => precoPorArea(v, area);
  const foraLance = lance !== null ? posicaoNaEscala(lance, min, max).fora : 0;
  const foraAvaliacao = avaliacao !== null ? posicaoNaEscala(avaliacao, min, max).fora : 0;
  const foraDaEscala = <span className="font-normal text-nevoa"> (fora da escala)</span>;

  return (
    <figure className="rounded-3xl border border-nevoa/15 bg-tinta p-4 sm:p-6">
      <figcaption className="sr-only">
        Avaliação {hectare ? "por hectare" : "por m²"} {concorda(referencias[0]!.tipo).dos} {concorda(referencias[0]!.tipo).outros}{" "}
        {TIPO_NA_FRASE[referencias[0]!.tipo]} em leilão em cada recorte, comparada ao lance e à
        avaliação {hectare ? "por hectare" : "por m²"} deste imóvel.
      </figcaption>

      <ul aria-label="Legenda" className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] leading-snug text-nevoa">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-2.5 w-6 rounded-full bg-nevoa/35" />
          Metade do meio dos outros imóveis
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-3.5 w-0.5 rounded-full bg-luar" />
          Mediana
        </li>
        {lance !== null && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="block size-3 shrink-0 rounded-full bg-latao-texto" />
            <span>
              Lance deste imóvel: <strong className="font-semibold text-luar tabular-nums">{m2(lance)}</strong>
              {foraLance !== 0 && foraDaEscala}
            </span>
          </li>
        )}
        {avaliacao !== null && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="block size-3.5 shrink-0 rounded-full border-2 border-luar" />
            <span>
              Avaliação deste imóvel: <strong className="font-semibold text-luar tabular-nums">{m2(avaliacao)}</strong>
              {foraAvaliacao !== 0 && foraDaEscala}
            </span>
          </li>
        )}
      </ul>

      <div className="mt-5 space-y-5">
        {faixas.map(({ r, faixa, deAvaliacao }) => (
          <div key={r.escopo}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-[14px] font-semibold text-luar">
                <span className="text-nevoa">{ROTULO_ESCOPO[r.escopo]} · </span>
                {nomeRecorte(r)}
              </p>
              <p className="text-[12.5px] text-nevoa tabular-nums">
                n = {numero(r.amostra)} {TIPO_NA_FRASE[r.tipo]}
              </p>
            </div>
            {faixa && (
              <>
                {/* mx: os marcadores presos na borda e a seta de "fora da escala" não saem da moldura */}
                <div aria-hidden="true" className="relative mx-3 mt-2.5 h-7">
                  <span className="absolute -inset-x-3 top-1/2 h-px -translate-y-1/2 bg-nevoa/30" />
                  <span
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-nevoa/35"
                    style={{ left: pos(faixa.p25, min, max), width: `calc(${pos(faixa.p75, min, max)} - ${pos(faixa.p25, min, max)})`, minWidth: 6 }}
                  />
                  <span className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-luar" style={{ left: pos(faixa.mediana, min, max) }} />
                  {avaliacao !== null && (
                    <span
                      className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-luar bg-tinta/60"
                      style={{ left: pos(avaliacao, min, max) }}
                    >
                      {foraAvaliacao !== 0 && <SetaFora lado={foraAvaliacao} />}
                    </span>
                  )}
                  {lance !== null && (
                    <span
                      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-latao-texto ring-2 ring-tinta"
                      style={{ left: pos(lance, min, max) }}
                    >
                      {foraLance !== 0 && <SetaFora lado={foraLance} />}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-nevoa">
                  {deAvaliacao ? "Avaliações" : "Lances"}: metade entre <span className="text-luar/90 tabular-nums">{m2(faixa.p25)}</span> e{" "}
                  <span className="text-luar/90 tabular-nums">{m2(faixa.p75)}</span> · mediana <span className="text-luar/90 tabular-nums">{m2(faixa.mediana)}</span>
                  {deAvaliacao && r.lanceM2 && (
                    <>
                      {" "}
                      · lances: mediana <span className="text-luar/90 tabular-nums">{m2(r.lanceM2.mediana)}</span>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="relative mx-3 mt-4 h-5">
        <span className="absolute -inset-x-3 top-0 border-t border-nevoa/20" />
        {marcas.map((t, k) => (
          <span
            key={t}
            className={`absolute top-1.5 text-[11px] leading-none whitespace-nowrap text-nevoa tabular-nums ${k === 0 ? "-translate-x-3" : k === marcas.length - 1 ? "-translate-x-[calc(100%-0.75rem)]" : "-translate-x-1/2"}`}
            style={{ left: pos(t, min, max) }}
          >
            {moedaCurta(hectare ? t * 10_000 : t)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-right text-[11px] text-nevoa">{hectare ? "por hectare" : "por m²"}</p>
    </figure>
  );
}
