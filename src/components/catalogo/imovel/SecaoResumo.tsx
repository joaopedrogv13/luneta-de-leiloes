import { dataHora, moeda, MODALIDADE_ROTULO, normalizar, OCUPACAO_ROTULO, PRACA_ROTULO, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import type { ImovelDetalhe } from "@/lib/catalogo/tipos";
import { Descricao } from "./Descricao";
import { AREA_HECTARE, areaDetalhada, ehExemplo, faltaParaPraca, fraseDesagio, naoInformado, numeroDaPraca, precoPorArea, rotuloNumeroPraca } from "./formato";
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
  IconeDocumento,
  IconeEtiqueta,
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
import { Fato, GradeFatos, Secao, Subtitulo } from "./partes";

const I = 16;

function simNao(v: boolean | null, sim: string, nao: string) {
  return v === null ? { valor: naoInformado(), vazio: true } : { valor: v ? sim : nao, vazio: false };
}

/** Quartos e vagas não se aplicam a terreno (e quartos, nem a rural/comercial quando a fonte não diz). */
const comQuartos = (i: ImovelDetalhe) => i.tipo === "apartamento" || i.tipo === "casa" || i.quartos !== null;
const comVagas = (i: ImovelDetalhe) => i.tipo !== "terreno" || i.vagas !== null;
const comPrivativa = (i: ImovelDetalhe) => i.tipo !== "terreno" || i.areaPrivativa !== null;

/**
 * Seção 1, "Resumo": a grade de fatos (o imóvel, preço, venda e pagamento, documentação e processo), todas
 * as praças com data e valor e a descrição completa do anúncio. O que a fonte não informa aparece como
 * "não informado pela fonte", nunca adivinhado.
 */
export function SecaoResumo({ imovel: i, agora }: { imovel: ImovelDetalhe; agora: number }) {
  const exemplo = ehExemplo(i);
  const area = (v: number | null, genero: "m" | "f" = "f") => (v !== null && v > 0 ? { valor: areaDetalhada(v), vazio: false } : { valor: naoInformado(genero), vazio: true });
  const privativa = area(i.areaPrivativa);
  const total = area(i.areaTotal);
  const terreno = area(i.areaTerreno);
  const fin = simNao(i.financiamento, "Aceita", "Não aceita");
  const fgts = simNao(i.fgts, "Aceita", "Não aceita");
  const parc = simNao(i.parcelamento, "Aceita", "Não aceita");
  const desagio = fraseDesagio(i.desagio);
  const pracaAtual = numeroDaPraca(i.praca);
  const pracas = [...i.pracas].sort((a, b) => a.numero - b.numero);
  // a partir de 10 ha, o preço por área sai por hectare (precoPorArea): o rótulo acompanha
  const porArea = i.area !== null && i.area >= AREA_HECTARE ? "por hectare" : "por m²";

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
                valor={i.quartos !== null ? String(i.quartos) : naoInformado()}
                vazio={i.quartos === null}
              />
            )}
            {comVagas(i) && (
              <Fato
                icone={<IconeVaga tamanho={I} />}
                rotulo="Vagas de garagem"
                valor={i.vagas !== null ? String(i.vagas) : naoInformado("f")}
                vazio={i.vagas === null}
              />
            )}
          </GradeFatos>
        </div>

        <div>
          <Subtitulo className="mb-3">Preço</Subtitulo>
          <GradeFatos rotulo="Preço">
            <Fato icone={<IconeEtiqueta tamanho={I} />} rotulo="Lance mínimo" valor={moeda(i.lance)} />
            <Fato
              icone={<IconeAvaliacao tamanho={I} />}
              rotulo="Avaliação"
              valor={i.avaliacao !== null ? moeda(i.avaliacao) : naoInformado("f")}
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
              rotulo={`Lance ${porArea}`}
              valor={i.lanceM2 !== null ? precoPorArea(i.lanceM2, i.area) : "sem a área, não dá para calcular"}
              vazio={i.lanceM2 === null}
            />
            <Fato
              icone={<IconeRegua tamanho={I} />}
              rotulo={`Avaliação ${porArea}`}
              valor={i.avaliacaoM2 !== null ? precoPorArea(i.avaliacaoM2, i.area) : "sem a área ou a avaliação, não dá para calcular"}
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
              valor={i.praca ? PRACA_ROTULO[i.praca] : naoInformado("f")}
              vazio={!i.praca}
              nota={i.dataPraca ? dataHora(i.dataPraca) : i.praca ? "data não informada pela fonte" : undefined}
            />
            <Fato icone={<IconeBanco tamanho={I} />} rotulo="Financiamento" {...fin} />
            <Fato icone={<IconeCarteira tamanho={I} />} rotulo="Uso do FGTS" {...fgts} />
            <Fato icone={<IconeParcelas tamanho={I} />} rotulo="Parcelamento" {...parc} nota={i.parcelamento && i.condicoesPagamento ? i.condicoesPagamento : undefined} />
            <Fato
              icone={<IconeChave tamanho={I} />}
              rotulo="Ocupação"
              valor={i.ocupacao ? OCUPACAO_ROTULO[i.ocupacao] : naoInformado("f")}
              vazio={!i.ocupacao}
              nota={i.ocupacao ? undefined : "Na dúvida, considere que pode estar ocupado"}
            />
            <Fato
              icone={<IconeBalanca tamanho={I} />}
              rotulo="Natureza"
              valor={i.judicial === null ? naoInformado("f") : i.judicial ? "Judicial" : "Extrajudicial"}
              vazio={i.judicial === null}
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
                                <span className="sr-only">Lance mínimo: </span>
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
          <GradeFatos rotulo="Documentação e processo">
            <Fato
              icone={<IconeDocumento tamanho={I} />}
              rotulo="Matrícula e cartório"
              valor={i.matricula || i.cartorio ? [i.matricula ? `Matrícula ${i.matricula}` : null, i.cartorio].filter(Boolean).join(" · ") : naoInformado("f")}
              vazio={!i.matricula && !i.cartorio}
            />
            <Fato icone={<IconePasta tamanho={I} />} rotulo="Processo" valor={i.numeroProcesso ?? naoInformado()} vazio={!i.numeroProcesso} />
            <Fato icone={<IconeLeiloeiro tamanho={I} />} rotulo="Leiloeiro" valor={i.leiloeiro ?? naoInformado()} vazio={!i.leiloeiro} />
            <Fato icone={<IconePredio tamanho={I} />} rotulo="Comitente (quem vende)" valor={i.comitente ?? naoInformado()} vazio={!i.comitente} />
          </GradeFatos>
        </div>

        <div>
          <Subtitulo className="mb-3">Descrição do anúncio</Subtitulo>
          {i.descricao ? <Descricao texto={i.descricao} /> : <p className="text-[15px] text-nevoa">Descrição {naoInformado("f")}.</p>}
        </div>
      </div>
    </Secao>
  );
}
