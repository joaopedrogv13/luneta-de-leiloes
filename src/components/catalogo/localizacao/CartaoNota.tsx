"use client";

import Link from "next/link";
import { Popover } from "@/components/catalogo/ui/Popover";
import {
  cidadePequena,
  fraseFaixa,
  frasePartePercentil,
  frasePercentil,
  NOTA_NAO_GARANTIA,
  notaNaEscala,
  OSM_ATRIBUICAO,
  pontoMedido,
  resumoTercos,
  rotaMetodoLocal,
  SEM_DADO_COMPONENTE,
  seloPrecisao,
  SOBRE_COMPONENTE,
  TERCO_CURTO,
  TERCO_FRASE,
  textoRiscoSemAlerta,
  type SeloPrecisao,
} from "@/lib/catalogo/nota-texto";
import { numero } from "@/lib/catalogo/rotulos";
import type { ComponenteLocal, LocalizacaoImovel } from "@/lib/catalogo/tipos";
import { IconeAlerta, IconeEscudo, IconeExterno, IconeFechar, IconeInfo, IconePino, IconeSetaDireita } from "../imovel/icones";
import { AnelNota, BarraParte, TercosParte } from "./visual";

const ROTULO = "text-[11px] leading-none font-semibold tracking-[0.14em] text-nevoa uppercase";
const CARTAO =
  "@container rounded-3xl border border-nevoa/15 bg-tinta p-4 sm:p-6 [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_12px_32px_-14px_rgba(15,24,48,.16)]";

/** Botão de fechar dos pop-ups da nota (44 px no dedo, 36 no mouse). */
function Fechar({ onClick, rotulo }: { onClick: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className="-mt-1.5 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-nevoa transition-colors hover:bg-nevoa/10 hover:text-luar pointer-fine:size-9"
    >
      <IconeFechar tamanho={18} />
    </button>
  );
}

/**
 * O selo da precisão do ponto: a pílula abre a explicação (por que a nota é exata, aproximada ou não existe). A cor
 * acompanha a precisão só no ícone; o texto diz tudo.
 */
function BotaoPrecisao({ selo }: { selo: SeloPrecisao }) {
  const tom = selo.nivel === "boa" ? "text-pos" : selo.nivel === "media" ? "text-latao-texto" : "text-aten";
  return (
    <Popover
      papel="note"
      rotulo={`Precisão do endereço: ${selo.rotulo}`}
      posicao="bottom-start"
      largura="min(24rem, calc(100vw - 24px))"
      gatilho={{
        className: (aberto) =>
          `group/sel inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full border px-3.5 text-left text-[13.5px] leading-snug font-medium transition-colors duration-150 pointer-fine:min-h-9 ${
            aberto ? "border-latao bg-latao/12 text-luar" : "border-nevoa/30 text-luar hover:border-nevoa/60 hover:bg-nevoa/[0.06]"
          }`,
        conteudo: (
          <>
            <IconePino tamanho={16} className={tom} />
            <span className="min-w-0">{selo.rotulo}</span>
            <IconeInfo tamanho={15} className="text-nevoa transition-colors group-hover/sel:text-luar" />
          </>
        ),
        title: "Como o endereço foi localizado",
      }}
    >
      {({ fechar }) => (
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className={`${ROTULO} text-latao-texto!`}>Precisão do endereço</p>
              <p className="mt-1.5 font-display text-[17px] leading-snug font-bold text-luar">{selo.rotulo}</p>
            </div>
            <Fechar onClick={fechar} rotulo="Fechar explicação" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-luar">{selo.explicacao}</p>
        </div>
      )}
    </Popover>
  );
}

/** "Fonte: ... (dados de 17/10/2026)" do OpenStreetMap, quando a nota usou o OSM. */
function dataOsm(loc: LocalizacaoImovel): string | null {
  const f = loc.fontes.find((x) => /OpenStreetMap/i.test(x.nome));
  const m = f ? /dados de ([\d/]+)/.exec(f.detalhe) : null;
  return m ? m[1]! : null;
}

/** Conteúdo do pop-up de uma parte: o que é medido, os números com o comum na cidade e a fonte. */
function PainelParte({ c, loc, cidade, fechar }: { c: ComponenteLocal; loc: LocalizacaoImovel; cidade: string; fechar: () => void }) {
  const sobre = SOBRE_COMPONENTE[c.chave];
  // o ponto medido pela precisão, não pela situação: a cidade pequena com o endereço só no bairro também foi medida no
  // centro do bairro (revisão final da rodada 4, M13)
  const ponto = pontoMedido(loc);
  const osm = /OpenStreetMap/.test(sobre.fontes) ? dataOsm(loc) : null;
  const exemplo = loc.fontes.length === 1 && loc.fontes[0]!.nome === "Exemplo fictício";
  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`${ROTULO} text-latao-texto!`}>Parte da nota{c.peso > 0 && !c.terco ? ` · peso ${c.peso}%` : ""}</p>
          <p className="mt-1.5 font-display text-[18px] leading-snug font-bold text-luar">{c.rotulo}</p>
        </div>
        <Fechar onClick={fechar} rotulo="Fechar a explicação da parte" />
      </div>

      <p className="mt-2 text-[15px] leading-snug font-semibold text-luar">
        {c.terco
          ? `Posição: ${TERCO_FRASE[c.terco]}`
          : c.nota === null
            ? SEM_DADO_COMPONENTE.charAt(0).toUpperCase() + SEM_DADO_COMPONENTE.slice(1)
            : frasePartePercentil(c.nota)}
      </p>

      <dl className="mt-3.5 space-y-3.5">
        <div>
          <dt className={ROTULO}>O que é medido</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-luar">{sobre.oQueMede}</dd>
        </div>
        {c.indicadores.length > 0 && (
          <div>
            <dt className={ROTULO}>{ponto.exato ? "Em volta deste imóvel" : `Em volta ${ponto.do}`}</dt>
            <dd className="mt-1.5">
              <ul className="divide-y divide-nevoa/12 rounded-xl border border-nevoa/15">
                {c.indicadores.map((i) => (
                  <li key={i.chave} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-3 py-2 text-[13.5px] leading-snug">
                    <span className="text-nevoa">{i.rotulo}</span>
                    <span className="text-right font-semibold whitespace-nowrap text-luar tabular-nums">{i.valor}</span>
                    {i.comum !== null && (
                      <span className="col-span-2 text-[12.5px] text-nevoa tabular-nums">
                        comum na cidade: <span className="text-luar/90">{i.comum}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {c.nota === null && !c.terco && (
          <div>
            <dt className={ROTULO}>Por que sem dado</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-luar">
              {cidade} não tem esse dado nas fontes usadas (por exemplo, nenhum parque ou estação mapeado). A parte sai da conta e o
              peso dela vai para as outras, na mesma proporção.
            </dd>
          </div>
        )}
        {c.incompleto && (
          <p className="rounded-xl border border-aten/40 bg-aten/[0.07] px-3 py-2 text-[13px] leading-snug text-luar">
            Dado incompleto: mais de 30% dos domicílios em volta estão em pequenas áreas do Censo sem esse número (sigilo do IBGE).
          </p>
        )}
      </dl>

      <p className="mt-3.5 border-t border-nevoa/15 pt-3 text-[12.5px] leading-snug text-nevoa">
        <span className="font-semibold">Fonte:</span> {exemplo ? "valores inventados (exemplo fictício)" : sobre.fontes}
        {osm && !exemplo ? `, dados de ${osm}` : ""}. Raio: {sobre.raio}, em linha reta.
      </p>
    </div>
  );
}

/** Uma parte: rótulo, nota (ou terço) e peso, com a barra; tocar abre o pop-up com os números. */
function LinhaParte({ c, loc, cidade }: { c: ComponenteLocal; loc: LocalizacaoImovel; cidade: string }) {
  const semDado = c.nota === null && !c.terco;
  const valorSr = c.terco ? TERCO_FRASE[c.terco] : semDado ? SEM_DADO_COMPONENTE : `${notaNaEscala(c.nota!)} de 100`;
  return (
    <li className="min-w-0">
      <Popover
        papel="note"
        rotulo={`${c.rotulo}: o que entra na nota`}
        posicao="bottom-start"
        largura="min(26rem, calc(100vw - 24px))"
        className="text-left"
        gatilho={{
          ariaLabel: `${c.rotulo}: ${valorSr}${c.peso > 0 && !c.terco ? `, peso ${c.peso}%` : ""}. Ver o que entra`,
          className: (aberto) =>
            `group/parte -mx-2 block w-[calc(100%+1rem)] cursor-pointer rounded-xl px-2 py-2.5 text-left transition-colors duration-150 ${
              aberto ? "bg-latao/10 ring-1 ring-latao/45" : "hover:bg-nevoa/[0.07]"
            }`,
          conteudo: (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[14.5px] leading-snug font-medium text-luar">{c.rotulo}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {c.terco ? (
                    <span className="text-[13px] font-semibold whitespace-nowrap text-luar">{TERCO_CURTO[c.terco]}</span>
                  ) : semDado ? (
                    <span className="text-[13px] whitespace-nowrap text-nevoa">sem dado</span>
                  ) : (
                    <span className="font-display text-[18px] leading-none font-bold text-luar tabular-nums">{notaNaEscala(c.nota!)}</span>
                  )}
                  <IconeSetaDireita
                    tamanho={14}
                    className="text-nevoa transition-transform duration-150 group-hover/parte:translate-x-0.5 group-aria-expanded/parte:rotate-90 motion-reduce:transition-none"
                  />
                </span>
              </span>
              <span className="mt-2 flex items-center gap-3">
                {c.terco ? <TercosParte terco={c.terco} className="flex-1" /> : <BarraParte nota={c.nota} className="flex-1" />}
                {/* cidade pequena: sem nota final, o peso não diz nada */}
                {!c.terco && (
                  <span className="w-[4.6rem] shrink-0 text-right text-[12.5px] whitespace-nowrap text-nevoa tabular-nums">
                    {semDado ? "peso 0%" : `peso ${c.peso}%`}
                  </span>
                )}
              </span>
              {semDado && <span className="mt-1 block text-[12.5px] leading-snug text-nevoa">{SEM_DADO_COMPONENTE}</span>}
              {/* cidade pequena: sem número de 0 a 100, o número principal do entorno fica à vista */}
              {c.terco && c.indicadores[0] && (
                <span className="mt-1 block text-[12.5px] leading-snug text-nevoa tabular-nums">
                  {c.indicadores[0].rotulo}: <span className="font-medium text-luar/90">{c.indicadores[0].valor}</span>
                </span>
              )}
            </>
          ),
        }}
      >
        {({ fechar }) => <PainelParte c={c} loc={loc} cidade={cidade} fechar={fechar} />}
      </Popover>
    </li>
  );
}

/** A área de risco: o alerta (BATER) ou o que foi conferido, sempre com a ressalva. Nunca "sem risco". */
export function BlocoRisco({ loc }: { loc: LocalizacaoImovel }) {
  if (loc.alertas.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        {loc.alertas.map((a, k) => (
          <div key={k} role="note" className="flex gap-3 rounded-2xl border border-aten/45 bg-aten/[0.08] px-4 py-3.5">
            <IconeAlerta tamanho={20} className="mt-0.5 text-aten" />
            <div className="min-w-0">
              <p className="text-[15px] leading-snug font-semibold text-luar">{a.titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-luar/90">{a.texto}</p>
              <p className="mt-1.5 text-[12.5px] leading-snug text-nevoa">
                Fonte: {a.fonte}.{loc.riscoRaioM !== null ? ` Procuramos até ${numero(loc.riscoRaioM)} m ${pontoMedido(loc).do}.` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }
  const t = textoRiscoSemAlerta(loc);
  return (
    <div className="flex gap-3 rounded-2xl border border-nevoa/15 bg-nevoa/[0.04] px-4 py-3">
      <IconeEscudo tamanho={19} className="mt-0.5 text-nevoa" />
      <div className="min-w-0">
        <p className="text-sm leading-snug font-semibold text-luar">{t.titulo}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-nevoa">{t.texto}</p>
      </div>
    </div>
  );
}

/** Rodapé do cartão: a nota não é garantia (uma vez) e as fontes, com a atribuição do OpenStreetMap. */
function Rodape({ loc, exemplo }: { loc: LocalizacaoImovel; exemplo: boolean }) {
  const usouOsm = loc.fontes.some((f) => /OpenStreetMap/i.test(f.nome));
  return (
    <div className="mt-5 border-t border-nevoa/12 pt-4 text-[12.5px] leading-relaxed text-nevoa">
      <p>{NOTA_NAO_GARANTIA}</p>
      {exemplo ? (
        <p className="mt-2">Exemplo fictício: a nota, as partes e os números foram inventados para mostrar a seção.</p>
      ) : (
        <p className="mt-2">
          <span className="font-semibold">Fontes:</span> IBGE (CNEFE 2022, Censo 2022 e Grade Estatística 2022) · IPEA (geocodebr) · Inep (Censo Escolar)
          · Ministério da Saúde (CNES) · IBGE e Cemaden (áreas de risco, base de 2010)
          {usouOsm && (
            <>
              {" "}
              ·{" "}
              <a href={OSM_ATRIBUICAO.url} target="_blank" rel="noopener noreferrer" className="underline decoration-nevoa/50 underline-offset-2 hover:text-luar">
                {OSM_ATRIBUICAO.texto}
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </>
          )}
          . Cálculo de {dataCurta(loc.geradoEm)}.
        </p>
      )}
    </div>
  );
}

function dataCurta(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Cabeçalho do cartão: o rótulo e, nos exemplos da demonstração, o selo "Exemplo fictício". */
function Topo({ exemplo }: { exemplo: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h3 className={`${ROTULO} text-latao-texto!`}>Nota de localização</h3>
      {exemplo && (
        <span className="inline-flex items-center rounded-full border border-dashed border-nevoa/45 px-2.5 py-1 text-[11.5px] leading-none font-semibold text-nevoa">
          Exemplo fictício
        </span>
      )}
    </div>
  );
}

function ComoCalcula({ id }: { id: string }) {
  return (
    <Link
      href={rotaMetodoLocal(id)}
      prefetch={false}
      className="group/como inline-flex min-h-11 items-center gap-1.5 rounded-full text-[14px] font-semibold text-latao-texto underline-offset-4 hover:text-luar hover:underline pointer-fine:min-h-9"
    >
      Como a nota é calculada
      <IconeSetaDireita tamanho={15} className="transition-transform duration-150 group-hover/como:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

/**
 * O cartão "Nota de localização" da página do imóvel (plano Luneta). Primeiro a resposta: o número grande no anel e a
 * frase ("Melhor localizado que 78% dos moradores de São Gonçalo/RJ"), o selo da precisão do endereço e, logo abaixo, as
 * seis partes com a nota e o peso de cada uma (tocar abre os números, com o comum na cidade, e a fonte). Depois, a área
 * de risco, o link para o método e o rodapé com as fontes.
 * - aproximada (só o bairro): "~59", a faixa no anel e a frase com a faixa;
 * - cidade pequena: sem número de 0 a 100; as partes em terços e o resumo ("acima da maioria");
 * - sem nota: o motivo do servidor e o que dá para ver no lugar.
 */
export function CartaoNota({
  loc,
  id,
  cidade,
  exemplo,
  urlMapa,
}: {
  loc: LocalizacaoImovel;
  /** id do imóvel (o "Voltar" da página do método) */
  id: string;
  /** "Cidade/UF" do imóvel, quando a referência não vier */
  cidade: string;
  exemplo: boolean;
  /** "Abrir no Google Maps" (endereço), para o caso sem nota */
  urlMapa: string;
}) {
  const nomeCidade = loc.referencia?.nome ?? cidade;
  const pequena = cidadePequena(loc);
  const comNota = !pequena && loc.nota !== null && (loc.situacao === "calculada" || loc.situacao === "aproximada");
  const aproximada = comNota && loc.situacao === "aproximada";
  const selo = seloPrecisao(loc, exemplo);
  const mostrarPartes = comNota || pequena;

  return (
    <div className={CARTAO}>
      <Topo exemplo={exemplo} />

      {/* a resposta */}
      {comNota ? (
        <div className="mt-4 flex items-center gap-4 sm:gap-6">
          {/* o anel acompanha a largura do cartão (container), não a da tela */}
          <span className="shrink-0 @md:hidden">
            <AnelNota nota={loc.nota} faixa={aproximada ? loc.faixa : null} aproximada={aproximada} tamanho={92} />
          </span>
          <span className="hidden shrink-0 @md:block">
            <AnelNota nota={loc.nota} faixa={aproximada ? loc.faixa : null} aproximada={aproximada} tamanho={116} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[18px] leading-snug font-bold tracking-[-0.01em] text-balance text-luar @md:text-[22px] @2xl:text-[24px]">
              <span className="sr-only">
                Nota {aproximada ? "aproximada " : ""}
                {notaNaEscala(loc.nota!)} de 100.{" "}
              </span>
              {aproximada && loc.faixa ? fraseFaixa(loc.faixa, nomeCidade) : frasePercentil(loc.nota!, nomeCidade)}.
            </p>
            <p className="mt-1.5 text-[14px] leading-snug text-nevoa">
              {aproximada
                ? `Nota aproximada: ${loc.pontoRuaEspalhada ? "a rua do endereço foi encontrada, mas os endereços dela se espalham demais" : "o endereço foi localizado só no bairro"}. O meio da faixa (${notaNaEscala(loc.nota!)}) vale para ordenar e filtrar.`
                : loc.referencia
                  ? `Comparado com onde moram as ${numero(loc.referencia.moradores)} pessoas da cidade (Censo 2022).`
                  : "Comparado com o resto da cidade."}
            </p>
          </div>
        </div>
      ) : pequena ? (
        <div className="mt-4">
          <p className="font-display text-[18px] leading-snug font-bold tracking-[-0.01em] text-balance text-luar @md:text-[22px]">
            {resumoTercos(loc.componentes, nomeCidade)}
          </p>
          <p className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-nevoa">
            <span className="font-semibold text-luar/90">Cidade pequena, sem nota de 0 a 100.</span> {loc.motivo ?? ""}
          </p>
        </div>
      ) : (
        <SemNota loc={loc} urlMapa={urlMapa} />
      )}

      {/* a precisão do endereço (nos exemplos fictícios, o selo do topo já diz que tudo é inventado) */}
      {selo && !exemplo && (comNota || pequena) && (
        <div className="mt-4">
          <BotaoPrecisao selo={selo} />
        </div>
      )}

      {/* as seis partes */}
      {mostrarPartes && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h4 className="text-[15px] font-semibold text-luar">O que entra na nota</h4>
            <p className="text-[12.5px] text-nevoa">Abra uma parte para ver os números</p>
          </div>
          {!exemplo && loc.precisao !== "numero" && loc.precisao !== null && (
            <p className="mt-1 text-[13px] leading-snug text-nevoa">As partes foram medidas {pontoMedido(loc).no}, não no imóvel exato.</p>
          )}
          <ul className="mt-2 grid gap-x-8 gap-y-0.5 @2xl:grid-cols-2">
            {loc.componentes.map((c) => (
              <LinhaParte key={c.chave} c={c} loc={loc} cidade={nomeCidade} />
            ))}
          </ul>
        </div>
      )}

      {/* área de risco */}
      <div className="mt-5">
        <BlocoRisco loc={loc} />
      </div>

      <div className="mt-3">
        <ComoCalcula id={id} />
      </div>

      <Rodape loc={loc} exemplo={exemplo} />
    </div>
  );
}

/** "2026-10-18" → "18/10/2026" */
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Sem nota: o motivo pronto do servidor e o que dá para ver no lugar. */
function SemNota({ loc, urlMapa }: { loc: LocalizacaoImovel; urlMapa: string }) {
  const pendente = loc.situacao === "pendente";
  return (
    <div className="mt-4">
      <p className="font-display text-[18px] leading-snug font-bold tracking-[-0.01em] text-luar @md:text-[22px]">
        {pendente ? "A nota deste imóvel ainda não foi calculada" : "Sem nota de localização para este imóvel"}
      </p>
      {loc.motivo && <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-nevoa">{loc.motivo}</p>}
      <p className="mt-3 text-[13px] leading-snug font-semibold text-luar">No lugar da nota:</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-[14px] leading-snug text-nevoa">
        <li>
          <a href={urlMapa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-latao-texto underline-offset-4 hover:text-luar hover:underline pointer-fine:min-h-8">
            Veja o endereço no Google Maps
            <IconeExterno tamanho={14} />
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </li>
        <li>
          <a href="#regiao" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-latao-texto underline-offset-4 hover:text-luar hover:underline pointer-fine:min-h-8">
            Compare o preço do m² da região
          </a>
        </li>
        {pendente && <li className="py-1">A nota é recalculada de tempos em tempos (o último cálculo é de {dataBr(loc.geradoEm)}); este imóvel entra no próximo.</li>}
      </ul>
    </div>
  );
}
