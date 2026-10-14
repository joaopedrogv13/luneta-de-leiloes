"use client";

import { useMemo, useState, type ReactNode } from "react";
import { TIPO_NA_FRASE } from "@/components/catalogo/imovel/formato";
import { MODALIDADE_ROTULO, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import type { Plano, ReferenciaM2 } from "@/lib/catalogo/tipos";
import { matriz, simular } from "@/lib/simulador/calculo";
import { LIMITES, montarModelo, type Modelo } from "@/lib/simulador/premissas";
import { CENARIOS, type Ajustes, type EntradaSimulador } from "@/lib/simulador/tipos";
import { CartaoResposta } from "./CartaoResposta";
import { Aviso, CampoPedido, FOCO_RESULTADO, IconeAtencao, IconeInfo } from "./controles";
import { Detalhe, type BaseDetalhe } from "./Detalhe";
import { ESTADO_INICIAL, useEstadoSimulador } from "./estado";
import { area, moeda, porArea } from "./formato";
import { Matriz } from "./Matriz";
import { Premissas } from "./Premissas";

export interface SimuladorProps {
  imovel: EntradaSimulador;
  /** referências de R$/m² da região (Vizinhanca.referencias): valor de venda sem avaliação e comparação */
  referencias?: ReferenciaM2[];
  plano: Plano;
  /** opcional: abre o convite à Luneta (no Lente, as tags que alimentam os alertas de dívida não chegam) */
  aoPedirLuneta?: () => void;
}

export const AVISO_SIMULADOR =
  "Simulação com premissas genéricas, não é recomendação de investimento; confira edital, custos locais e impostos com um profissional.";

/**
 * Simulador de rentabilidade da página do imóvel. De cima para baixo: o cartão-resposta ("Seu lance
 * máximo"), o que conferir antes de decidir, a matriz cenários × prazos, o detalhamento da célula
 * escolhida e as premissas (tudo editável, padrões conservadores, só o que vale para o tipo).
 * Os ajustes ficam no navegador, por imóvel.
 */
export function Simulador({ imovel, referencias, plano, aoPedirLuneta }: SimuladorProps) {
  const [estado, atualizar] = useEstadoSimulador(imovel.id);
  const modelo = useMemo(() => montarModelo(imovel, estado.ajustes, referencias), [imovel, estado.ajustes, referencias]);
  const p = modelo.premissas;
  const meuLance = estado.meuLance ?? imovel.lance;
  const tabela = useMemo(() => matriz(modelo, estado.meta, meuLance), [modelo, estado.meta, meuLance]);

  const celula = { cenario: estado.celula.cenario, prazo: Math.min(estado.celula.prazo, p.prazos.length - 1) };
  const prazo = p.prazos[celula.prazo];
  const cel = tabela?.[CENARIOS.indexOf(celula.cenario)][celula.prazo] ?? null;
  const teto = cel?.teto ?? null;
  const comLanceMinimo = useMemo(() => simular(modelo, imovel.lance, celula.cenario, prazo), [modelo, imovel.lance, celula.cenario, prazo]);

  // Detalhe: abre com o lance da pessoa (o lance mínimo, se ela não escolheu outro), como o rodapé do cartão;
  // o lance máximo, por definição, sempre dá a meta exata, então detalhá-lo de saída mostraria outro lucro
  const [baseEscolhida, setBaseEscolhida] = useState<BaseDetalhe | null>(null);
  const base: BaseDetalhe = baseEscolhida === "teto" && teto !== null ? "teto" : "meu";
  const simDetalhe = cel ? (base === "teto" ? simular(modelo, teto!, celula.cenario, prazo) : cel.comMeuLance) : null;

  const ajustar = (mudar: (a: Ajustes) => Ajustes) => atualizar((e) => ({ ...e, ajustes: mudar(e.ajustes) }));

  return (
    <section aria-labelledby="sim-titulo" className="flex w-full min-w-0 flex-col gap-4 text-luar sm:gap-5">
      <header className="px-1">
        <p className="eyebrow">Simulador de rentabilidade</p>
        <h2 id="sim-titulo" className="mt-2.5 font-display text-[26px] leading-[1.1] font-bold tracking-[-0.025em] sm:text-[32px]">
          Até quanto vale dar de lance?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-nevoa">{resumoImovel(modelo)}</p>
      </header>

      {lanceForaDoNormal(modelo) && (
        <Aviso>
          <strong className="font-semibold">O lance mínimo passa de 3 vezes a avaliação.</strong> Quase sempre é erro no anúncio (no preço, na área ou um
          lote com vários imóveis): confira no site da fonte antes de usar a simulação.
        </Aviso>
      )}

      {tabela && cel && comLanceMinimo && simDetalhe ? (
        <>
          <CartaoResposta
            modelo={modelo}
            meta={estado.meta}
            celula={celula}
            teto={teto}
            comLanceMinimo={comLanceMinimo}
            aoMudarMeta={(meta) => atualizar((e) => ({ ...e, meta }))}
            aoMudarCelula={(c) => atualizar((e) => ({ ...e, celula: c }))}
            aoInformarDividas={(n) => ajustar((a) => ({ ...a, dividas: n }))}
          />
          <AvisoFixo />
          <Conferir modelo={modelo} ajustar={ajustar} />
          <Matriz
            modelo={modelo}
            celulas={tabela}
            meta={estado.meta}
            visao={estado.visao}
            meuLance={meuLance}
            meuLanceAjustado={estado.meuLance !== null}
            selecionada={celula}
            aoSelecionar={(c) => atualizar((e) => ({ ...e, celula: c }))}
            aoMudarVisao={(v) => {
              setBaseEscolhida(null);
              atualizar((e) => ({ ...e, visao: v }));
            }}
            aoMudarMeuLance={(n) => atualizar((e) => ({ ...e, meuLance: n }))}
          />
          <Detalhe modelo={modelo} sim={simDetalhe} meta={estado.meta} base={base} teto={teto} meuLance={meuLance} aoMudarBase={setBaseEscolhida} />
        </>
      ) : (
        <>
          <FaltaVenda modelo={modelo} ajustar={ajustar} />
          <AvisoFixo />
        </>
      )}

      <Premissas
        modelo={modelo}
        sim={comLanceMinimo}
        plano={plano}
        aoAjustar={ajustar}
        aoRestaurarTudo={() => atualizar((e) => ({ ...e, ajustes: ESTADO_INICIAL.ajustes }))}
        aoPedirLuneta={aoPedirLuneta}
      />
      <p className="px-1 text-[12px] leading-relaxed text-nevoa">Seus ajustes ficam guardados neste navegador, só para este imóvel.</p>
    </section>
  );
}

function AvisoFixo() {
  return (
    <p className="flex gap-2 px-1 text-[12.5px] leading-relaxed text-nevoa">
      <IconeInfo className="mt-0.5 size-3.5" />
      {AVISO_SIMULADOR}
    </p>
  );
}

/** Lance mínimo acima de 3 vezes a avaliação: quase sempre erro na fonte (a mesma régua da seção da região). */
function lanceForaDoNormal({ entrada: e }: Modelo) {
  return e.avaliacao !== null && e.avaliacao > 0 && e.lance > 3 * e.avaliacao;
}

function resumoImovel({ entrada: e, premissas: p, perfil }: Modelo) {
  const partes = [
    perfil.grande && e.tipo === "comercial" ? "Comercial (galpão ou prédio)" : TIPO_ROTULO[e.tipo],
    p.areaEstimada ? `${perfil.rotuloArea} não informada` : area(p.area),
    e.avaliacao ? `avaliação ${moeda(e.avaliacao)}` : "avaliação não informada pela fonte",
    `lance mínimo ${moeda(e.lance)}`,
    // o nome padronizado do site; o nome como a fonte chama fica no resumo da página
    MODALIDADE_ROTULO[e.modalidade],
  ];
  return partes.join(" · ");
}

/**
 * "Confira antes de decidir": o que falta ou pesa e pode ser resolvido ali mesmo (a área). As dívidas apontadas
 * são pedidas no próprio cartão-resposta, junto do número que elas mudam.
 */
function Conferir({ modelo, ajustar }: { modelo: Modelo; ajustar: (m: (a: Ajustes) => Ajustes) => void }) {
  const { premissas: p, padrao: d, perfil, entrada: e } = modelo;
  const usaArea = perfil.modoReforma === "m2" || p.condominio > 0;
  const paraQue = [perfil.modoReforma === "m2" ? perfil.rotuloReforma.toLowerCase() : null, p.condominio > 0 ? "condomínio" : null].filter(Boolean).join(" e ");
  const itens: { chave: string; tom: "atencao" | "info"; texto: ReactNode; campo?: ReactNode }[] = [];

  if (p.areaEstimada && usaArea) {
    itens.push({
      chave: "area",
      tom: "atencao",
      texto: (
        <>
          A fonte não informa a {perfil.rotuloArea}. Usamos {area(perfil.areaTipica)}, um tamanho típico de {TIPO_NA_FRASE[e.tipo]}, para {paraQue}.
        </>
      ),
      campo: (
        <CampoPedido
          placeholder="área"
          sufixo="m²"
          casas={2}
          min={LIMITES.area[0]}
          max={LIMITES.area[1]}
          ariaLabel={`Informar a ${perfil.rotuloArea} em m²`}
          aoConfirmar={(n) => ajustar((a) => ({ ...a, area: n }))}
          larguraCampo="w-full sm:w-32"
        />
      ),
    });
  }
  if (e.ocupacao !== "desocupado" && p.desocupacao === d.desocupacao && p.desocupacao > 0) {
    itens.push({
      chave: "ocupacao",
      tom: "info",
      texto: (
        <>
          {e.ocupacao === "ocupado" ? "Imóvel ocupado" : "Ocupação não informada pela fonte"}: reservamos {moeda(p.desocupacao)} para a desocupação, que pode
          levar meses.
        </>
      ),
    });
  }
  if (itens.length === 0) return null;

  return (
    <section aria-labelledby="sim-conferir-titulo" className="rounded-3xl border border-nevoa/20 bg-tinta px-4 py-3 sm:px-6 sm:py-4">
      <h3 id="sim-conferir-titulo" className="py-1 text-[13px] font-semibold tracking-[0.12em] text-nevoa uppercase">
        Confira antes de decidir
      </h3>
      <ul>
        {itens.map((i) => (
          <li key={i.chave} className="flex flex-col gap-2 border-t border-nevoa/15 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4">
            <p className="flex min-w-0 flex-1 gap-2.5 text-[13.5px] leading-relaxed">
              {i.tom === "atencao" ? <IconeAtencao className="mt-0.5 text-aten" /> : <IconeInfo className="mt-0.5 text-nevoa" />}
              <span>{i.texto}</span>
            </p>
            {i.campo && <div className="pl-[26px] sm:pl-0">{i.campo}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sem avaliação e sem referência (ou sem área): pede o que falta para fazer a conta. */
function FaltaVenda({ modelo, ajustar }: { modelo: Modelo; ajustar: (m: (a: Ajustes) => Ajustes) => void }) {
  const { perfil, entrada: e, referencia: ref } = modelo;
  const precisaArea = modelo.origemVenda.tipo === "nenhuma" && modelo.origemVenda.motivo === "sem-area" && ref;
  return (
    <div className="rounded-3xl border border-latao/45 bg-tinta p-5 sm:p-7">
      <p id={FOCO_RESULTADO} tabIndex={-1} className="text-[13px] font-semibold tracking-[0.12em] text-nevoa uppercase">
        Seu lance máximo
      </p>
      <p className="mt-2 font-display text-[28px] leading-tight font-bold tracking-[-0.02em] sm:text-[34px]">Falta o valor de venda</p>
      <p className="mt-2 text-[14px] leading-relaxed text-nevoa">
        A fonte não informa a avaliação deste imóvel
        {precisaArea ? ` nem a ${perfil.rotuloArea}` : " e não há referência de preço da região"}. Sem um valor de venda não dá para calcular o retorno.
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {precisaArea && (
          <div>
            <label htmlFor="sim-falta-area" className="text-[14px] font-semibold">
              {perfil.rotuloArea.charAt(0).toUpperCase() + perfil.rotuloArea.slice(1)}
            </label>
            <p id="sim-falta-area-ajuda" className="mt-0.5 text-[12.5px] text-nevoa">
              Com a área, usamos a avaliação mediana de {TIPO_NA_FRASE[e.tipo]} em {ref.nome} ({porArea(ref.avaliacaoM2!.mediana, e.tipo)}).
            </p>
            <CampoPedido
              id="sim-falta-area"
              placeholder="área"
              sufixo="m²"
              casas={2}
              min={LIMITES.area[0]}
              max={LIMITES.area[1]}
              descritoPor="sim-falta-area-ajuda"
              aoConfirmar={(n) => ajustar((a) => ({ ...a, area: n }))}
              className="mt-2"
              larguraCampo="w-full sm:w-48"
            />
          </div>
        )}
        <div>
          <label htmlFor="sim-falta-venda" className="text-[14px] font-semibold">
            {precisaArea ? "Ou informe direto por quanto você acha que vende" : "Por quanto você acha que vende?"}
          </label>
          <p id="sim-falta-venda-ajuda" className="mt-0.5 text-[12.5px] text-nevoa">
            Veja anúncios de imóveis parecidos na região. Esse valor vira o cenário base (100%).
          </p>
          <CampoPedido
            id="sim-falta-venda"
            placeholder="valor de venda"
            prefixo="R$"
            min={LIMITES.valorVenda[0]}
            max={LIMITES.valorVenda[1]}
            descritoPor="sim-falta-venda-ajuda"
            aoConfirmar={(n) => ajustar((a) => ({ ...a, valorVenda: n }))}
            className="mt-2"
            larguraCampo="w-full sm:w-56"
          />
        </div>
      </div>
      <Aviso tom="info" className="mt-5">
        Lance mínimo atual: {moeda(e.lance)}. Assim que houver um valor de venda, aparecem o seu lance máximo e a matriz de cenários.
      </Aviso>
    </div>
  );
}
