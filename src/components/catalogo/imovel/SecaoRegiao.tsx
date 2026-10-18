import { numero } from "@/lib/catalogo/rotulos";
import type { ImovelDetalhe, ReferenciaM2, Vizinhanca } from "@/lib/catalogo/tipos";
import { BuscasPortais } from "./BuscasPortais";
import { Expansor } from "./Expansor";
import { FontesPrecos } from "./FontesPrecos";
import {
  alvoDaReferencia,
  AREA_HECTARE,
  compararComMedia,
  diferencaCurta,
  ehExemplo,
  fonteDaReferencia,
  frasePercentil,
  linhasLeiloes,
  logradouro,
  lugarDoRecorte,
  mediaDe,
  NIVEIS_COMPARACAO,
  ondeRecorte,
  periodoCurto,
  precoPorArea,
  predicadoComparacao,
  referenciaLeiloes,
  referenciaPrincipal,
  referenciasItbi,
  ROTULO_ESCOPO,
  TIPO_NA_FRASE,
  type NivelComparacao,
} from "./formato";
import { GraficoM2 } from "./GraficoM2";
import { IconeInfo } from "./icones";
import { MaisDados } from "./MaisDados";
import { Secao } from "./partes";

/**
 * Selo de 5 níveis da comparação (muito abaixo · abaixo · na média · acima · muito acima): o segmento do nível
 * aceso. Para o leitor de tela, uma frase só. No celular, só o rótulo do nível aceso aparece embaixo.
 */
function EscalaNiveis({ nivel }: { nivel: NivelComparacao }) {
  return (
    <div role="img" aria-label={`Nível da comparação: ${NIVEIS_COMPARACAO[nivel].toLowerCase()} (escala de 5: muito abaixo, abaixo, na média, acima, muito acima)`}>
      <div aria-hidden="true" className="grid grid-cols-5 gap-1">
        {NIVEIS_COMPARACAO.map((rotulo, k) => (
          <div key={rotulo} className="min-w-0">
            <span
              className={`block h-2 rounded-full transition-colors ${
                k === nivel ? "bg-latao shadow-[0_0_0_3px_rgba(201,162,77,.18)]" : k === 2 ? "bg-nevoa/30" : "bg-nevoa/18"
              }`}
            />
            {/* celular: só o rótulo aceso, inteiro (nas pontas, alinhado à borda: "Muito acima" não cabe num quinto da
                largura e transborda para dentro, nunca cortado) */}
            <span
              className={`mt-2 text-[12px] leading-tight sm:justify-center ${k === 0 ? "justify-start" : k === 4 ? "justify-end" : "justify-center"} ${
                k === nivel ? "flex font-semibold text-luar" : "hidden text-nevoa sm:flex"
              }`}
            >
              <span className="whitespace-nowrap">{rotulo}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Rua", "Rua e bairro", "Rua, bairro e cidade". */
function listaNiveis(escopos: ReferenciaM2["escopo"][]) {
  const nomes = escopos.map((e, k) => (k === 0 ? ROTULO_ESCOPO[e] : ROTULO_ESCOPO[e].toLowerCase()));
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Junta as linhas vizinhas sem referência e com o mesmo motivo numa só ("Rua e bairro: sem dados suficientes"). */
function juntarSemDados<T extends { escopo: ReferenciaM2["escopo"]; ref: ReferenciaM2 | null; falta: string | null }>(linhas: T[]) {
  const saida: { escopos: ReferenciaM2["escopo"][]; ref: ReferenciaM2 | null; falta: string | null }[] = [];
  for (const l of linhas) {
    const ultima = saida[saida.length - 1];
    if (!l.ref && ultima && !ultima.ref && ultima.falta === l.falta && l.falta === "sem dados suficientes") ultima.escopos.push(l.escopo);
    else saida.push({ escopos: [l.escopo], ref: l.ref, falta: l.falta });
  }
  return saida;
}

/** Linha da tabela: recorte, média e a diferença deste imóvel. */
function Linha({
  rotulo,
  lugar,
  amostra,
  media,
  dif,
  falta,
  destaque,
  m2,
}: {
  rotulo: string;
  lugar: string | null;
  amostra: string | null;
  media: number | null;
  dif: { pct: number; razao: number } | null;
  falta: string | null;
  destaque: boolean;
  m2: (v: number) => string;
}) {
  return (
    <tr className={`border-t border-nevoa/10 align-top ${destaque ? "bg-latao/[0.07] shadow-[inset_3px_0_0_#c9a24d]" : ""}`}>
      <th scope="row" className="py-3 pr-3 pl-4 text-left font-normal sm:pl-6">
        <span className="block text-[14px] leading-snug font-semibold text-luar">
          {rotulo}
          {/* celular: o lugar desce para a linha de baixo, numa linha só (o nome da rua ocupava 3); inteiro no title */}
          {lugar && (
            <span title={lugar} className="block text-[13px] font-normal break-words text-nevoa max-sm:line-clamp-1 sm:inline sm:text-[14px]">
              <span className="hidden sm:inline"> · </span>
              {lugar}
            </span>
          )}
        </span>
        {amostra && <span className="mt-0.5 block text-[13px] leading-snug text-nevoa tabular-nums sm:text-[12px]">{amostra}</span>}
        {destaque && <span className="sr-only"> (usada na frase acima)</span>}
      </th>
      {falta ? (
        <td colSpan={2} className="py-3 pr-4 text-right text-sm leading-snug text-nevoa sm:pr-6 sm:text-[13px]">
          {falta}
        </td>
      ) : (
        <>
          <td className="py-3 pr-3 text-right text-[14px] leading-snug font-semibold whitespace-nowrap text-luar tabular-nums">{media !== null ? m2(media) : "—"}</td>
          <td className="py-3 pr-4 text-right text-[13px] leading-snug whitespace-nowrap text-luar/90 tabular-nums sm:pr-6">{dif ? diferencaCurta(dif) : "—"}</td>
        </>
      )}
    </tr>
  );
}

/**
 * Seção "Preço do m² na região". Primeiro a resposta: uma frase grande sobre a AVALIAÇÃO deste imóvel por m² contra
 * a média da região, com o selo de 5 níveis, e a tabela curta com as médias da rua, do bairro, da cidade e do estado
 * (imóveis em leilão na base) e, à parte, as do preço pago nas compras registradas na prefeitura (ITBI). O gráfico
 * com as faixas fica em "Ver detalhes". Logo abaixo, os anúncios parecidos nos portais (por rua, bairro e cidade) e
 * de onde vêm os preços.
 */
export function SecaoRegiao({ imovel: i, vizinhanca: v }: { imovel: ImovelDetalhe; vizinhanca: Vizinhanca }) {
  const exemplo = ehExemplo(i);
  const refs = v.referencias;
  const tipos = TIPO_NA_FRASE[i.tipo];
  const hectare = i.area !== null && i.area >= AREA_HECTARE;
  const m2 = (valor: number) => precoPorArea(valor, i.area);
  // por hectare, o valor sai do total ÷ área (o R$/m² da base vem arredondado)
  const porArea = (total: number | null, m2Base: number | null) => (m2Base === null ? null : hectare && total !== null && i.area ? total / i.area : m2Base);
  const avaliacao = porArea(i.avaliacao, i.avaliacaoM2);
  const lance = porArea(i.lance, i.lanceM2);
  // o que se compara: a avaliação; sem ela, o lance
  const valor = avaliacao ?? lance;
  const vendaDireta = i.modalidade === "venda_direta";
  const sujeito = avaliacao !== null ? "A avaliação deste imóvel" : vendaDireta ? "O preço de venda deste imóvel" : "O lance mínimo deste imóvel";

  const principal = referenciaPrincipal(refs);
  const comparacao = principal ? compararComMedia(valor, mediaDe(principal)) : null;
  const comparacaoLance = principal && avaliacao !== null ? compararComMedia(lance, mediaDe(principal)) : null;
  // a frase vai pelo preço pago (ITBI) quando há compras suficientes; os leilões ficam numa segunda linha
  const principalItbi = principal?.fonte === "itbi";
  const refLeiloes = principalItbi ? referenciaLeiloes(refs) : null;
  const comparacaoLeiloes = refLeiloes ? compararComMedia(valor, mediaDe(refLeiloes)) : null;
  const leiloes = linhasLeiloes(refs);
  const itbi = referenciasItbi(refs);
  const refRua = refs.find((r) => r.escopo === "rua");
  const ruaNome = refRua ? lugarDoRecorte(refRua) : logradouro(i.endereco);
  const temLeiloes = refs.some((r) => fonteDaReferencia(r) === "leiloes");
  const lugarCidade = `${i.cidade}/${i.uf}`;
  const percentil = (() => {
    const r = refs.find((x) => fonteDaReferencia(x) === "leiloes" && x.percentilLance !== null && x.amostra >= 5);
    return r ? frasePercentil(r) : null;
  })();

  const contexto = (r: ReferenciaM2) =>
    r.fonte === "itbi"
      ? `Preço médio pago em ${numero(r.amostra)} ${r.amostra === 1 ? "compra" : "compras"} de ${tipos} registradas na prefeitura (ITBI) ${ondeRecorte(r)}${periodoCurto(r.periodo) ? `, de ${periodoCurto(r.periodo)}` : ""}: `
      : `Média de avaliação de ${numero(r.amostra)} ${tipos} em leilão ${ondeRecorte(r)}: `;

  const faltaLeiloes = (escopo: ReferenciaM2["escopo"], igualA: ReferenciaM2["escopo"] | null) => {
    if (igualA) return `os mesmos imóveis ${igualA === "rua" ? "da rua" : igualA === "bairro" ? "do bairro" : "da cidade"}`;
    // sem o lugar, não há o que comparar (não é falta de imóveis)
    if (escopo === "rua" && !ruaNome) return "a fonte não informa a rua";
    if (escopo === "bairro" && !i.bairro) return "a fonte não informa o bairro";
    return "sem dados suficientes";
  };
  // na linha "Rua", o nome sem o "Rua" do começo ("Rua · Expedicionário...")
  const lugarDe = (escopo: ReferenciaM2["escopo"], r: ReferenciaM2 | null) => {
    const nome = r ? lugarDoRecorte(r) : escopo === "rua" ? ruaNome : escopo === "bairro" ? i.bairro : escopo === "cidade" ? lugarCidade : null;
    return escopo === "rua" && nome ? nome.replace(/^rua\s+/i, "") : nome;
  };

  const semReferencia = !principal;
  // a cidade tem ITBI, mas a comparação não vale para este imóvel (ex.: em São Paulo, a área publicada para apartamentos
  // inclui a parte comum do prédio). Campo novo do contrato (CoberturaPrecos.semComparacao), lido sem depender dele.
  const itbiSemComparacao = (v.cobertura as { semComparacao?: string | null } | undefined)?.semComparacao || null;

  const grupoLeiloes = (
    <tbody>
      <tr className="border-t border-nevoa/15">
        <th scope="rowgroup" colSpan={3} className="bg-nevoa/[0.05] px-4 py-2 text-left text-[13px] font-medium text-nevoa sm:px-6 sm:text-[12px]">
          Imóveis em leilão na base · média de avaliação
        </th>
      </tr>
      {juntarSemDados(
        leiloes.map(({ escopo, ref, igualA }) => ({
          escopo,
          ref,
          falta: ref ? (mediaDe(ref) === null ? "sem avaliações suficientes" : null) : faltaLeiloes(escopo, igualA),
        })),
      ).map(({ escopos, ref, falta }) => (
        <Linha
          key={escopos.join("-")}
          rotulo={listaNiveis(escopos)}
          lugar={escopos.length === 1 ? lugarDe(escopos[0]!, ref) : null}
          amostra={ref ? `${numero(ref.amostra)} ${tipos}` : null}
          media={ref ? mediaDe(ref) : null}
          dif={ref ? compararComMedia(valor, mediaDe(ref)) : null}
          falta={falta}
          destaque={ref !== null && ref === principal}
          m2={m2}
        />
      ))}
    </tbody>
  );
  const grupoItbi = (
    <tbody>
      <tr className="border-t border-nevoa/15">
        <th scope="rowgroup" colSpan={3} className="bg-nevoa/[0.05] px-4 py-2 text-left text-[13px] font-medium text-nevoa sm:px-6 sm:text-[12px]">
          Transações reais (ITBI) · preço médio pago
          {itbi[0]?.periodo && <span className="whitespace-nowrap"> · {periodoCurto(itbi[0].periodo)}</span>}
        </th>
      </tr>
      {itbi.length > 0 ? (
        itbi.map((r) => (
          <Linha
            key={r.escopo}
            rotulo={ROTULO_ESCOPO[r.escopo]}
            lugar={lugarDe(r.escopo, r)}
            amostra={`${numero(r.amostra)} ${r.amostra === 1 ? "compra" : "compras"}`}
            media={mediaDe(r)}
            dif={compararComMedia(valor, mediaDe(r))}
            falta={mediaDe(r) === null ? "sem dados suficientes" : null}
            destaque={r === principal}
            m2={m2}
          />
        ))
      ) : (
        <tr className="border-t border-nevoa/10">
          <td colSpan={3} className="px-4 py-3 text-sm leading-snug text-nevoa sm:px-6 sm:text-[13px]">
            {itbiSemComparacao
              ? itbiSemComparacao
              : v.cobertura?.cidadeTemItbi
              ? `A prefeitura de ${i.cidade} não registra compras de ${tipos} suficientes para comparar.`
              : `Ainda não temos o preço pago nas compras registradas em ${lugarCidade}.${v.cobertura ? " Veja abaixo de quais cidades temos." : ""}`}
          </td>
        </tr>
      )}
    </tbody>
  );

  return (
    <Secao
      id="regiao"
      titulo="Preço do m² na região"
      sobretitulo="Comparação com a região"
      descricao="Médias de avaliação dos imóveis do mesmo tipo em leilão na base e, onde a Luneta tem o dado, do preço pago nas compras registradas na prefeitura (ITBI). Avaliação de leilão não é preço de mercado: use como referência."
    >
      <div className="space-y-6">
        {semReferencia ? (
          <p className="rounded-2xl border border-nevoa/15 bg-tinta px-4 py-3.5 text-[14px] leading-relaxed text-nevoa">
            {exemplo && !temLeiloes
              ? "Exemplo fictício: a demonstração tem poucos imóveis, então não há média de leilões da região para comparar."
              : `Ainda não há ${tipos} suficientes em leilão na base para comparar (pelo menos 3 na rua, 5 no bairro ou na cidade, ou 3 no estado).`}
          </p>
        ) : (
          <div className="rounded-3xl border border-nevoa/15 bg-tinta p-4 sm:p-6">
            {comparacao ? (
              <>
                <p className="font-display text-[21px] leading-snug font-bold tracking-[-0.015em] text-balance text-luar sm:text-[25px]">
                  {sujeito}, <span className="whitespace-nowrap tabular-nums">{m2(valor!)}</span>, {predicadoComparacao(comparacao, alvoDaReferencia(principal))}.
                </p>
                <div className="mt-4 max-w-[34rem]">
                  <EscalaNiveis nivel={comparacao.nivel} />
                </div>
              </>
            ) : (
              <p className="text-[16px] leading-relaxed font-medium text-luar">
                A fonte não informa a área deste imóvel: sem ela não dá para comparar o preço por m². Veja as médias da região abaixo.
              </p>
            )}
            <p className="mt-4 text-[14px] leading-relaxed text-nevoa">
              {contexto(principal)}
              <span className="font-semibold whitespace-nowrap text-luar tabular-nums">{m2(mediaDe(principal)!)}</span>.
            </p>
            {comparacaoLance && lance !== null && (
              <p className="mt-1.5 text-[14px] leading-relaxed text-nevoa">
                Pelo {vendaDireta ? "preço de venda" : "lance mínimo"} (<span className="whitespace-nowrap text-luar tabular-nums">{m2(lance)}</span>), o
                preço por m² {predicadoComparacao(comparacaoLance, alvoDaReferencia(principal))}.
              </p>
            )}
            {refLeiloes && comparacaoLeiloes && (
              <p className="mt-1.5 text-[14px] leading-relaxed text-nevoa">
                Entre os imóveis em leilão, {sujeito.charAt(0).toLowerCase() + sujeito.slice(1)}{" "}
                {predicadoComparacao(comparacaoLeiloes, { artigo: "a", nome: `média de avaliação ${{ rua: "da rua", bairro: "do bairro", cidade: "da cidade", uf: "do estado" }[refLeiloes.escopo]}` })}{" "}
                (<span className="whitespace-nowrap text-luar tabular-nums">{m2(mediaDe(refLeiloes)!)}</span>, {numero(refLeiloes.amostra)} {tipos}).
              </p>
            )}
          </div>
        )}

        {!semReferencia && (
          <MaisDados ate="md" rotulo="Comparar por rua, bairro e cidade" rotuloAberto="Fechar a comparação" className="mt-0!">
            <div className="overflow-hidden rounded-3xl border border-nevoa/15 bg-tinta">
              <table className="w-full border-collapse">
                <caption className="sr-only">
                  Média do preço por {hectare ? "hectare" : "m²"} na rua, no bairro, na cidade e no estado, e a diferença para {valor !== null ? (avaliacao !== null ? "a avaliação" : "o lance") : "este imóvel"} deste imóvel
                </caption>
                <thead>
                  <tr className="text-[11px] leading-tight font-semibold tracking-[0.1em] text-nevoa uppercase">
                    <th scope="col" className="pt-4 pr-3 pb-2.5 pl-4 text-left font-semibold sm:pl-6">
                      Onde
                    </th>
                    <th scope="col" className="pt-4 pr-3 pb-2.5 text-right font-semibold">
                      Média{hectare ? "/ha" : "/m²"}
                    </th>
                    <th scope="col" className="pt-4 pr-4 pb-2.5 text-right font-semibold sm:pr-6">
                      Diferença
                      <span className="sr-only"> {avaliacao !== null ? "desta avaliação" : lance !== null ? "deste lance" : "deste imóvel"}</span>
                    </th>
                  </tr>
                </thead>
                {/* o grupo da referência da frase vem primeiro (o preço pago, quando há compras suficientes) */}
                {principalItbi ? (
                  <>
                    {grupoItbi}
                    {grupoLeiloes}
                  </>
                ) : (
                  <>
                    {grupoLeiloes}
                    {grupoItbi}
                  </>
                )}
              </table>
            </div>
          </MaisDados>
        )}

        {refs.length > 0 && (
          <Expansor rotulo="Ver detalhes: faixas e medianas" rotuloAberto="Fechar os detalhes" className="-mt-2">
            <div className="space-y-4 pt-3">
              <GraficoM2 referencias={refs} area={i.area} lanceTotal={i.lance} avaliacaoTotal={i.avaliacao} />
              {percentil && <p className="text-[14px] leading-relaxed text-nevoa">{percentil}</p>}
              <p className="flex gap-2.5 text-[13px] leading-relaxed text-nevoa">
                <IconeInfo tamanho={16} className="mt-0.5" />
                <span>
                  A média tira os 10% mais baixos e os 10% mais altos de cada recorte; a faixa mostra a metade do meio e o traço, a mediana. A
                  avaliação é a que a fonte publica para o leilão e o lance é o mínimo de hoje: os dois podem estar longe do preço de venda de
                  verdade. O ITBI é o preço declarado na compra, registrado na prefeitura.
                </span>
              </p>
            </div>
          </Expansor>
        )}

        <BuscasPortais imovel={i} buscas={v.buscasExternas} rua={ruaNome} />

        <FontesPrecos cobertura={v.cobertura} cidade={lugarCidade} exemplo={exemplo} semComparacao={itbiSemComparacao ? { motivo: itbiSemComparacao, naTabela: !semReferencia } : null} />
      </div>
    </Secao>
  );
}
