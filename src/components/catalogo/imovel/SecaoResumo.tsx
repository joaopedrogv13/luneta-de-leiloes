import { termoModalidade, type ChaveGlossario } from "@/content/glossario";
import { data, dataHora, moeda, MODALIDADE_ROTULO, normalizar, OCUPACAO_ROTULO, PRACA_ROTULO, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import type { ImovelDetalhe, Praca } from "@/lib/catalogo/tipos";
import { Descricao } from "./Descricao";
import {
  AREA_HECTARE,
  areaDetalhada,
  dominio,
  ehExemplo,
  faltaParaPraca,
  fraseDesagio,
  listaE,
  naoInformado,
  numeroDaPraca,
  precoPorArea,
  registroNaTela,
  rotuloNumeroPraca,
  type RegistroNaTela,
} from "./formato";
import {
  IconeArea,
  IconeAreaTotal,
  IconeAvaliacao,
  IconeBalanca,
  IconeBanco,
  IconeCalendario,
  IconeCarteira,
  IconeCasa,
  IconeChave,
  IconeCheck,
  IconeDocumento,
  IconeEtiqueta,
  IconeExterno,
  IconeLeiloeiro,
  IconeMartelo,
  IconeParcelas,
  IconePasta,
  IconePredio,
  IconeQuarto,
  IconeQueda,
  IconeRegua,
  IconeTerreno,
  IconeVaga,
} from "./icones";
import { Fato, GradeFatos, NovaAba, Secao, Subtitulo } from "./partes";
import { BotaoTermo } from "./Termo";

const I = 16;

/** Quartos, vagas e área privativa não se aplicam a terreno nem a rural (e quartos, nem a comercial quando a fonte não diz). */
const comQuartos = (i: ImovelDetalhe) => i.tipo === "apartamento" || i.tipo === "casa" || i.quartos !== null;
const semUnidade = (i: ImovelDetalhe) => i.tipo === "terreno" || i.tipo === "rural";
const comVagas = (i: ImovelDetalhe) => !semUnidade(i) || i.vagas !== null;
const comPrivativa = (i: ImovelDetalhe) => !semUnidade(i) || i.areaPrivativa !== null;

const TERMO_PRACA: Record<Praca, ChaveGlossario> = { "1": "praca_1", "2": "praca_2", unica: "praca_unica" };

const LINK_INTERNO = "font-medium text-latao-texto underline underline-offset-4 hover:text-luar";

const BOTAO_FONTE =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-nevoa/35 bg-noite/40 px-4 text-[13.5px] font-medium text-luar no-underline transition-colors hover:border-latao hover:bg-latao/10 pointer-fine:min-h-9";

/** Os termos do registro que a ficha traz, cada um com o (i). */
const TERMOS_REGISTRO: { termo: ChaveGlossario; rotulo: string }[] = [
  { termo: "matricula", rotulo: "Matrícula" },
  { termo: "cartorio", rotulo: "Comarca e ofício" },
  { termo: "inscricao_imobiliaria", rotulo: "Inscrição imobiliária" },
  { termo: "averbacao_leiloes_negativos", rotulo: "Averbação dos leilões negativos" },
];

/**
 * Registro "pendente" (Caixa, ficha ainda não lida): a fonte publica matrícula, comarca, ofício, inscrição e
 * averbação na página do imóvel, que a Luneta ainda não leu. Nunca "não informado": aponta para a ficha e para o
 * PDF da matrícula.
 */
function RegistroPendente({ reg, fonte }: { reg: RegistroNaTela; fonte: string }) {
  return (
    <div className="mb-2.5 rounded-2xl border border-nevoa/12 bg-tinta px-3.5 pt-3 pb-4 sm:px-4">
      <p className="flex items-center gap-2 text-[12.5px] leading-snug text-nevoa">
        <IconeDocumento tamanho={I} className="text-nevoa/90" />
        Matrícula, comarca, ofício, inscrição imobiliária e averbação
      </p>
      <p className="mt-1.5 text-[15px] leading-snug font-semibold text-luar sm:text-[16px]">
        Na ficha da {fonte} <span className="font-normal text-nevoa">·</span> <span className="font-medium text-luar/85">ainda não lida pela Luneta</span>
      </p>
      <p className="mt-1 max-w-[62ch] text-[13px] leading-snug text-nevoa">
        A {fonte} publica esses dados na página do imóvel (a ficha), que não vem na lista que a Luneta lê. Abra a ficha para ver os números.
      </p>
      <ul aria-label="O que cada dado quer dizer" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {TERMOS_REGISTRO.map((t) => (
          <li key={t.termo} className="flex items-center gap-1 text-[13px] text-luar/90">
            {t.rotulo}
            <BotaoTermo termo={t.termo} />
          </li>
        ))}
      </ul>
      {(reg.paginaFonte || reg.pdfs.length > 0) && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {reg.paginaFonte && (
            <a href={reg.paginaFonte} target="_blank" rel="noopener noreferrer" className={BOTAO_FONTE}>
              Abrir a ficha no site da {fonte}
              <IconeExterno tamanho={15} className="text-nevoa" />
              <NovaAba />
            </a>
          )}
          {reg.pdfs.slice(0, 1).map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={BOTAO_FONTE}>
              PDF da matrícula
              <IconeExterno tamanho={15} className="text-nevoa" />
              <NovaAba />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Seção 1, "Resumo": a grade de fatos (o imóvel, preço, venda e pagamento, documentação e processo), todas
 * as praças com data e valor e a descrição completa do anúncio. O que a fonte não informa aparece como
 * "não informado pela fonte", nunca adivinhado.
 */
export function SecaoResumo({ imovel: i, agora }: { imovel: ImovelDetalhe; agora: number }) {
  const exemplo = ehExemplo(i);
  // num exemplo fictício não há fonte que deixou de informar: o campo simplesmente não se aplica
  const semDado = (genero: "m" | "f" = "m") => (exemplo ? "não se aplica (exemplo fictício)" : naoInformado(genero));
  const simNao = (v: boolean | null, sim: string, nao: string) => (v === null ? { valor: semDado(), vazio: true } : { valor: v ? sim : nao, vazio: false });
  const area = (v: number | null, genero: "m" | "f" = "f") => (v !== null && v > 0 ? { valor: areaDetalhada(v), vazio: false } : { valor: semDado(genero), vazio: true });
  const privativa = area(i.areaPrivativa);
  const total = area(i.areaTotal);
  const terreno = area(i.areaTerreno);
  const fin = simNao(i.financiamento, "Aceita", "Não aceita");
  const fgts = simNao(i.fgts, "Aceita", "Não aceita");
  const parc = simNao(i.parcelamento, "Aceita", "Não aceita");
  const desagio = fraseDesagio(i.desagio);
  const pracaAtual = numeroDaPraca(i.praca);
  const pracas = [...i.pracas].sort((a, b) => a.numero - b.numero);
  // a partir de 10 ha, o preço por área sai por hectare (precoPorArea): o rótulo acompanha. Por hectare, a conta
  // parte do valor e da área (o R$/m² da base vem arredondado: 13,33 virava 13 e R$ 133.333/ha virava 130.000)
  const hectare = i.area !== null && i.area >= AREA_HECTARE;
  const porArea = hectare ? "por hectare" : "por m²";
  const precoArea = (total: number | null, m2: number) => precoPorArea(hectare && total !== null && i.area ? total / i.area : m2, i.area);

  // documentação: o registro (ficha da Caixa, campos da fonte) e os PDFs de matrícula; o site do leiloeiro
  const reg = registroNaTela(i);
  /** Campo de registro vazio: "não consta na ficha" (lida), "a fonte não publica" ou "não informado pela fonte". */
  const semRegistro = (genero: "m" | "f") => (reg.situacao === "lido" ? "não consta na ficha" : reg.situacao === "nao_publica" ? "a fonte não publica" : semDado(genero));
  const matricula =
    reg.matriculas.length > 1
      ? { valor: `${reg.matriculas.length} matrículas: ${listaE(reg.matriculas)}`, vazio: false }
      : reg.matriculas.length === 1
        ? { valor: `nº ${reg.matriculas[0]}`, vazio: false }
        : { valor: reg.pdfs.length > 0 ? "Número não informado pela fonte" : semRegistro("m"), vazio: true };
  const notaPdfs =
    reg.pdfs.length === 1 ? (
      <a href={reg.pdfs[0]!.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${LINK_INTERNO}`}>
        PDF da matrícula
        <IconeExterno tamanho={13} />
        <NovaAba />
      </a>
    ) : reg.pdfs.length > 1 ? (
      <a href="#documentos" className={LINK_INTERNO}>
        PDFs das {reg.pdfs.length} matrículas em Documentos
      </a>
    ) : undefined;
  const siteLeiloeiro = i.leiloeiro ? null : i.links.find((l) => l.tipo === "leiloeiro");
  // venda direta: a fase de leilão já acabou (preço fixo, sem leiloeiro e, na Caixa, sem processo)
  const vendaDireta = i.modalidade === "venda_direta";
  const semLeiloeiro = vendaDireta && !i.leiloeiro && !siteLeiloeiro;
  const semProcesso = vendaDireta && i.judicial === false && !i.numeroProcesso;

  return (
    <Secao id="resumo" titulo="Resumo do imóvel" sobretitulo="Tudo o que a fonte informa">
      <div className="space-y-8">
        <div>
          <Subtitulo className="mb-3">O imóvel</Subtitulo>
          <GradeFatos rotulo="O imóvel">
            <Fato icone={<IconeCasa tamanho={I} />} rotulo="Tipo" valor={i.tipo === "outro" ? "Outro tipo" : TIPO_ROTULO[i.tipo]} />
            {comPrivativa(i) && <Fato icone={<IconeArea tamanho={I} />} rotulo="Área privativa" {...privativa} />}
            <Fato icone={<IconeAreaTotal tamanho={I} />} rotulo="Área total" {...total} />
            <Fato icone={<IconeTerreno tamanho={I} />} rotulo="Área do terreno" {...terreno} />
            {comQuartos(i) && (
              <Fato
                icone={<IconeQuarto tamanho={I} />}
                rotulo="Quartos"
                valor={i.quartos !== null ? String(i.quartos) : semDado()}
                vazio={i.quartos === null}
              />
            )}
            {comVagas(i) && (
              <Fato
                icone={<IconeVaga tamanho={I} />}
                rotulo="Vagas de garagem"
                valor={i.vagas !== null ? String(i.vagas) : semDado("f")}
                vazio={i.vagas === null}
              />
            )}
          </GradeFatos>
        </div>

        <div>
          <Subtitulo className="mb-3">Preço</Subtitulo>
          <GradeFatos rotulo="Preço">
            <Fato icone={<IconeEtiqueta tamanho={I} />} rotulo={vendaDireta ? "Preço de venda" : "Lance mínimo"} valor={moeda(i.lance)} />
            <Fato
              icone={<IconeAvaliacao tamanho={I} />}
              rotulo="Avaliação"
              valor={i.avaliacao !== null ? moeda(i.avaliacao) : semDado("f")}
              vazio={i.avaliacao === null}
            />
            <Fato
              icone={<IconeQueda tamanho={I} />}
              rotulo="Deságio"
              valor={desagio ? desagio.charAt(0).toUpperCase() + desagio.slice(1) : "sem avaliação para comparar"}
              vazio={!desagio}
            />
            <Fato
              icone={<IconeRegua tamanho={I} />}
              rotulo={`${vendaDireta ? "Preço" : "Lance"} ${porArea}`}
              valor={i.lanceM2 !== null ? precoArea(i.lance, i.lanceM2) : "sem a área, não dá para calcular"}
              vazio={i.lanceM2 === null}
            />
            <Fato
              icone={<IconeRegua tamanho={I} />}
              rotulo={`Avaliação ${porArea}`}
              valor={i.avaliacaoM2 !== null ? precoArea(i.avaliacao, i.avaliacaoM2) : "sem a área ou a avaliação, não dá para calcular"}
              vazio={i.avaliacaoM2 === null}
            />
          </GradeFatos>
        </div>

        <div>
          <Subtitulo className="mb-3">Venda e pagamento</Subtitulo>
          <GradeFatos rotulo="Venda e pagamento">
            <Fato
              icone={<IconeMartelo tamanho={I} />}
              rotulo="Modalidade"
              valor={MODALIDADE_ROTULO[i.modalidade]}
              termo={termoModalidade(i.modalidade, i.modalidadeFonte)}
              nota={
                exemplo
                  ? undefined
                  : i.modalidadeFonte && normalizar(i.modalidadeFonte) !== normalizar(MODALIDADE_ROTULO[i.modalidade])
                    ? `Como a ${i.fonte.nome} chama: “${i.modalidadeFonte}”`
                    : `Fonte: ${i.fonte.nome}`
              }
            />
            <Fato
              icone={<IconeCalendario tamanho={I} />}
              rotulo="Praça atual"
              valor={i.praca ? PRACA_ROTULO[i.praca] : semDado("f")}
              vazio={!i.praca}
              termo={i.praca ? TERMO_PRACA[i.praca] : null}
              nota={i.dataPraca ? dataHora(i.dataPraca) : i.praca ? "data não informada pela fonte" : undefined}
            />
            <Fato icone={<IconeBanco tamanho={I} />} rotulo="Financiamento" {...fin} termo="financiamento" />
            <Fato icone={<IconeCarteira tamanho={I} />} rotulo="Uso do FGTS" {...fgts} termo="fgts" />
            <Fato
              icone={<IconeParcelas tamanho={I} />}
              rotulo="Parcelamento"
              {...parc}
              termo="parcelamento"
              nota={i.parcelamento && i.condicoesPagamento ? i.condicoesPagamento : undefined}
            />
            <Fato
              icone={<IconeChave tamanho={I} />}
              rotulo="Ocupação"
              valor={i.ocupacao ? OCUPACAO_ROTULO[i.ocupacao] : semDado("f")}
              vazio={!i.ocupacao}
              termo="ocupacao"
              nota={i.ocupacao || exemplo ? undefined : "Confira no edital ou visite a região"}
            />
            <Fato
              icone={<IconeBalanca tamanho={I} />}
              rotulo="Natureza"
              valor={i.judicial === null ? semDado("f") : i.judicial ? "Judicial" : "Extrajudicial"}
              vazio={i.judicial === null}
              termo={i.judicial === null ? null : i.judicial ? "judicial" : vendaDireta ? "extrajudicial_venda_direta" : "extrajudicial"}
              nota={i.judicial === null ? undefined : i.judicial ? "Venda determinada pela Justiça" : "Venda direta do credor ou do dono"}
            />
          </GradeFatos>

          <div className="mt-4 rounded-2xl border border-nevoa/12 bg-tinta px-4 py-1">
            <p className="pt-3 pb-1 text-[12.5px] leading-snug text-nevoa">Todas as praças</p>
            {pracas.length === 0 ? (
              <p className="pb-3 text-[15px] text-nevoa">{naoInformado("f").replace("informada", "informadas")}</p>
            ) : (
              <ol>
                {pracas.map((p) => {
                  const atual = p.numero === pracaAtual;
                  const falta = faltaParaPraca(p.data, agora);
                  return (
                    <li key={p.numero} className="flex gap-3 border-t border-nevoa/10 py-3 first:border-t-0">
                      <span
                        aria-hidden="true"
                        className={`mt-[7px] size-2.5 shrink-0 rounded-full ${atual ? "bg-latao shadow-[0_0_0_4px_rgba(201,162,77,.18)]" : "border border-nevoa/60"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-luar">
                            {rotuloNumeroPraca(p.numero)}
                            {atual && (
                              <span className="rounded-full bg-latao/15 px-2 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-latao-texto uppercase ring-1 ring-latao/40">
                                atual
                              </span>
                            )}
                          </p>
                          <p className={`shrink-0 text-right whitespace-nowrap tabular-nums ${p.valorMinimo !== null ? "text-[15px] font-semibold text-luar" : "text-[13px] text-nevoa"}`}>
                            {p.valorMinimo !== null ? (
                              <>
                                <span className="sr-only">{vendaDireta ? "Preço: " : "Lance mínimo: "}</span>
                                {moeda(p.valorMinimo)}
                              </>
                            ) : (
                              "valor não informado"
                            )}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[13px] text-nevoa">
                          {p.data ? (
                            <>
                              <span className="tabular-nums">{dataHora(p.data)}</span>
                              {falta && <span className={falta.passou ? "" : "text-luar/80"}> · {falta.texto}</span>}
                            </>
                          ) : (
                            "data não informada pela fonte"
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div>
          <Subtitulo className="mb-3">Documentação e processo</Subtitulo>
          {reg.situacao === "pendente" && <RegistroPendente reg={reg} fonte={i.fonte.nome} />}
          {reg.situacao === "lido" && (
            <p className="-mt-1 mb-3 text-[13px] leading-snug text-nevoa">
              Lidos na ficha da {i.fonte.nome}
              {reg.lidoEm ? <> em <span className="tabular-nums">{data(reg.lidoEm)}</span></> : null}
              {reg.paginaFonte && (
                <>
                  {" · "}
                  <a href={reg.paginaFonte} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${LINK_INTERNO}`}>
                    Abrir a ficha
                    <IconeExterno tamanho={13} />
                    <NovaAba />
                  </a>
                </>
              )}
            </p>
          )}
          <GradeFatos rotulo="Documentação e processo">
            {reg.situacao !== "pendente" && (
              <>
                <Fato
                  icone={<IconeDocumento tamanho={I} />}
                  rotulo={reg.matriculas.length > 1 ? "Matrículas" : "Matrícula"}
                  valor={matricula.valor}
                  vazio={matricula.vazio}
                  termo="matricula"
                  nota={notaPdfs}
                />
                <Fato
                  icone={<IconeDocumento tamanho={I} />}
                  rotulo="Cartório e comarca"
                  valor={reg.cartorio ?? semRegistro("m")}
                  vazio={!reg.cartorio}
                  termo="cartorio"
                />
                {(reg.situacao === "lido" || reg.inscricao) && (
                  <Fato
                    icone={<IconeEtiqueta tamanho={I} />}
                    rotulo="Inscrição imobiliária"
                    valor={reg.inscricao ?? semRegistro("f")}
                    vazio={!reg.inscricao}
                    termo="inscricao_imobiliaria"
                    nota={reg.inscricao ? "Número do imóvel no IPTU" : undefined}
                  />
                )}
                {(reg.situacao === "lido" || reg.averbacao) && (
                  <Fato
                    icone={<IconeCheck tamanho={I} />}
                    rotulo="Averbação dos leilões negativos"
                    valor={reg.averbacao ?? semRegistro("f")}
                    vazio={!reg.averbacao}
                    termo="averbacao_leiloes_negativos"
                  />
                )}
              </>
            )}
            <Fato
              icone={<IconePasta tamanho={I} />}
              rotulo="Processo"
              valor={i.numeroProcesso ?? (semProcesso ? "Não se aplica (venda extrajudicial)" : semDado())}
              vazio={!i.numeroProcesso && !semProcesso}
            />
            <Fato
              icone={<IconeLeiloeiro tamanho={I} />}
              rotulo="Leiloeiro"
              valor={i.leiloeiro ?? (siteLeiloeiro ? "Nome não informado pela fonte" : semLeiloeiro ? "Não há (venda direta)" : semDado())}
              vazio={!i.leiloeiro && !semLeiloeiro}
              termo="leiloeiro"
              nota={
                siteLeiloeiro ? (
                  // área de toque de 44 px sem mudar a linha (como o (i) do glossário)
                  <a
                    href={siteLeiloeiro.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`relative inline-flex items-center gap-1 before:absolute before:-inset-y-3.5 before:inset-x-0 before:content-[''] pointer-fine:before:hidden ${LINK_INTERNO}`}
                  >
                    Site: {dominio(siteLeiloeiro.url)}
                    <IconeExterno tamanho={13} />
                    <NovaAba />
                  </a>
                ) : undefined
              }
            />
            <Fato icone={<IconePredio tamanho={I} />} rotulo="Comitente (quem vende)" valor={i.comitente ?? semDado()} vazio={!i.comitente} termo="comitente" />
          </GradeFatos>
        </div>

        <div>
          <Subtitulo className="mb-3">Descrição do anúncio</Subtitulo>
          {i.descricao ? <Descricao texto={i.descricao} /> : <p className="text-[15px] text-nevoa">Descrição {semDado("f")}.</p>}
        </div>
      </div>
    </Secao>
  );
}
