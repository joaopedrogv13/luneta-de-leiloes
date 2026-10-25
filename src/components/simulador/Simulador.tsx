"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMidia } from "@/components/catalogo/app/hooks";
import { descricaoReferencia, mediaDe, TIPO_NA_FRASE } from "@/components/catalogo/imovel/formato";
import { Popover } from "@/components/catalogo/ui/Popover";
import { MODALIDADE_ROTULO, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import type { Plano, ReferenciaM2 } from "@/lib/catalogo/tipos";
import { completarModelo } from "@/lib/simulador/completa";
import { lanceDaContaPeloLink, type LanceDetalhe } from "@/lib/simulador/estado";
import { area, moeda, porArea } from "@/lib/simulador/formato";
import { LIMITES, montarModelo, type Modelo } from "@/lib/simulador/premissas";
import { palavrasPreco } from "@/lib/simulador/textos";
import type { Ajustes, EntradaSimulador } from "@/lib/simulador/tipos";
import { AbasSimulador, idAba, useAbaSimulador } from "./AbasSimulador";
import { CartaoResposta } from "./CartaoResposta";
import { ComoUsar } from "./ComoUsar";
import { Aviso, CampoPedido, FOCO_RESULTADO, IconeAtencao, IconeDocumento, IconeInfo } from "./controles";
import { ID_CONTA } from "./Decomposicao";
import { Detalhe, ID_DETALHE } from "./Detalhe";
import { EditorCusto, type AlvoEditor } from "./Editores";
import { useEstadoSimulador } from "./estado";
import { Matriz } from "./Matriz";

export interface SimuladorProps {
  imovel: EntradaSimulador;
  /** referências de R$/m² da região (Vizinhanca.referencias): valor de venda sem avaliação e comparação */
  referencias?: ReferenciaM2[];
  plano: Plano;
  /**
   * opcional: abre o convite à Luneta (no Lente, as tags que alimentam os alertas de dívida não chegam). `abridor`
   * recebe o foco quando o convite fecha.
   */
  aoPedirLuneta?: (abridor: HTMLElement | null) => void;
  /** link do relatório em PDF, sem o plano; padrão: a página atual + "/relatorio" (/previa/imovel/<id>/relatorio). No Lente, ganha "?plano=lente" */
  relatorioHref?: string;
}

export const AVISO_SIMULADOR =
  "Simulação com premissas genéricas, não é recomendação de investimento; confira edital, custos locais e impostos com um profissional.";

/**
 * Simulador de rentabilidade da página do imóvel. De cima para baixo: o cartão-resposta ("Seu lance máximo",
 * com a meta), o que conferir antes de decidir, a tabela de cenários × prazos e o Detalhe da célula escolhida,
 * que é o lugar único de ajuste (cada linha da conta abre o pop-up daquele tipo de despesa). No fim, o
 * relatório em PDF. Celular e tablet (até lg): a tabela, a conta e o gráfico ficam em abas (AbasSimulador; a
 * aberta fica salva), e no celular as perguntas do cartão abrem numa folha: o simulador cabia em ~6,5 telas. Tudo vem de `simulacaoCompleta` (src/lib/simulador/completa.ts), a mesma conta do PDF.
 * Os ajustes ficam no navegador, por imóvel (formato em src/lib/simulador/estado.ts).
 *
 * A conta linha a linha vem sempre fechada (rodada 6, decisão 3) e o estado aberto não é guardado: abre pelo botão
 * dela ou pelos links "Editar custos ↓" do cartão e do "Meu lance" (`abrirConta`), que também trocam para a aba
 * Conta (celular e tablet), rolam até ela e põem o foco no título dela. Cada link abre a conta com o lance da conta
 * ao lado dele (o lance máximo no cartão, o seu lance no "Meu lance"): os custos lidos são os da conta aberta.
 */
export function Simulador({ imovel, referencias, plano, aoPedirLuneta, relatorioHref }: SimuladorProps) {
  const [estado, atualizar] = useEstadoSimulador(imovel.id);
  const modelo = useMemo(() => montarModelo(imovel, estado.ajustes, referencias), [imovel, estado.ajustes, referencias]);
  const r = useMemo(() => completarModelo(modelo, estado), [modelo, estado]);
  const fixo = r.semDisputa;
  const [editor, setEditor] = useState<{ alvo: AlvoEditor; quem: HTMLElement | null } | null>(null);
  const [comoUsar, setComoUsar] = useState(false);
  const [aba, setAba] = useAbaSimulador();
  // a conta linha a linha começa fechada a cada visita; `irParaConta` conta os pedidos de "Editar custos ↓"
  const [contaAberta, setContaAberta] = useState(false);
  const [irParaConta, setIrParaConta] = useState(0);
  // no computador as três partes ficam abertas: sem os papéis de aba
  const computador = useMidia("(min-width: 1024px)", false);
  const caminho = usePathname();
  // o plano da demonstração (?plano=lente) vai no próprio href: vale no clique do meio, em "Abrir em nova aba" e em
  // "Copiar link", que não passam por onClick
  const relatorio = (relatorioHref ?? `${caminho?.replace(/\/$/, "") ?? ""}/relatorio`) + (plano === "lente" ? "?plano=lente" : "");

  const ajustar = (mudar: (a: Ajustes) => Ajustes) =>
    atualizar((e) => {
      const ajustes = mudar(e.ajustes);
      // tirou o cenário personalizado com ele escolhido: a escolha volta ao base (senão, ao criar outro, a
      // célula pularia sozinha para o personalizado)
      const celula = !ajustes.vendaPersonalizada && e.celula.cenario === "personalizado" ? { ...e.celula, cenario: "base" as const } : e.celula;
      return { ...e, ajustes, celula };
    });
  const abrir = (alvo: AlvoEditor, quem: HTMLElement | null) => setEditor({ alvo, quem });
  // a conta abre com o lance da conta ao lado do link ("teto" no cartão, "meu" no "Meu lance"): os mesmos custos
  const abrirConta = (lance: LanceDetalhe) => {
    if (lanceDaContaPeloLink(estado, lance, r.teto !== null) !== estado) atualizar((e) => lanceDaContaPeloLink(e, lance, r.teto !== null));
    setContaAberta(true);
    if (!computador && aba !== "conta") setAba("conta");
    setIrParaConta((n) => n + 1);
  };
  // depois de abrir (e de trocar de aba), rola até o título da conta e põe o foco nele; a rolagem respeita as barras
  // fixas da página (scroll-padding-top, RolagemSegura) e o movimento reduzido
  useEffect(() => {
    if (irParaConta === 0) return;
    const alvo = document.getElementById(ID_CONTA);
    if (!alvo) return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    alvo.scrollIntoView({ block: "start", behavior: suave ? "smooth" : "auto" });
    alvo.focus({ preventScroll: true });
  }, [irParaConta]);

  return (
    <section aria-labelledby="sim-titulo" className="flex w-full min-w-0 flex-col gap-4 text-luar sm:gap-5">
      <header className="px-1">
        <p className="eyebrow">Simulador de rentabilidade</p>
        <h2 id="sim-titulo" className="mt-2.5 font-display text-[26px] leading-[1.1] font-bold tracking-[-0.025em] text-balance sm:text-[32px]">
          {/* venda direta: o preço é fixo (não há disputa), então a pergunta é se vale comprar por ele */}
          {fixo ? (
            <>
              Vale a pena comprar por <span className="whitespace-nowrap tabular-nums">{moeda(imovel.lance)}</span>?
            </>
          ) : (
            "Até quanto vale dar de lance?"
          )}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-nevoa">{resumoImovel(modelo)}</p>
      </header>

      {lanceForaDoNormal(modelo) && (
        <Aviso>
          <strong className="font-semibold">O {palavrasPreco(imovel).minimo} passa de 3 vezes a avaliação.</strong> Quase sempre é erro no anúncio (no preço, na área ou um
          lote com vários imóveis): confira no site da fonte antes de usar a simulação.
        </Aviso>
      )}

      {r.tabela && r.detalhe && r.comLanceMinimo ? (
        <>
          <CartaoResposta
            r={r}
            aoMudarMeta={(meta) => atualizar((e) => ({ ...e, meta }))}
            aoMudarCelula={(celula) => atualizar((e) => ({ ...e, celula }))}
            aoDefinirPersonalizado={(v) => ajustar((a) => ({ ...a, vendaPersonalizada: v }))}
            aoInformarDividas={(n) => ajustar((a) => ({ ...a, dividas: n }))}
            aoAbrirConta={() => abrirConta("teto")}
          />
          <AvisoFixo />
          <Conferir modelo={modelo} ajustar={ajustar} aoEditarDesocupacao={(quem) => abrir({ editor: "desocupacao" }, quem)} />
          <AbasSimulador aba={aba} aoMudar={setAba} className="lg:hidden" />
          <div
            id="sim-painel-tabela"
            role={computador ? undefined : "tabpanel"}
            aria-labelledby={computador ? undefined : idAba("tabela")}
            className={aba === "tabela" ? "" : "max-lg:hidden"}
          >
            <Matriz
              r={r}
              visao={r.visao}
              aoSelecionar={(celula) => atualizar((e) => ({ ...e, celula }))}
              aoMudarVisao={(visao) => atualizar((e) => ({ ...e, visao }))}
              aoMudarMeuLance={(n) => atualizar((e) => ({ ...e, meuLance: n }))}
              aoAjustar={ajustar}
              aoComoUsar={() => setComoUsar(true)}
              aoEditarVenda={() => abrir({ editor: "venda" }, document.activeElement as HTMLElement | null)}
              aoAbrirConta={() => abrirConta("meu")}
            />
          </div>
          <div
            id="sim-detalhe"
            role={computador ? undefined : "tabpanel"}
            aria-labelledby={computador ? undefined : idAba(aba === "tabela" ? "conta" : aba)}
            className={`scroll-mt-28 ${aba === "tabela" ? "max-lg:hidden" : ""}`}
          >
            <Detalhe r={r} aoEditar={abrir} atualizar={atualizar} aba={aba} contaAberta={contaAberta} aoAlternarConta={() => setContaAberta((v) => !v)} />
          </div>
        </>
      ) : (
        <>
          <FaltaVenda modelo={modelo} ajustar={ajustar} />
          <AvisoFixo />
        </>
      )}

      <div className="flex flex-col gap-4 rounded-3xl border border-nevoa/20 bg-tinta p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 max-md:gap-3 max-md:p-4 in-data-[theme=light]:shadow-[0_1px_2px_rgba(15,24,48,.05)]">
        <div className="min-w-0">
          <p className="font-display text-[17px] leading-tight font-bold">Terminou a simulação?</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-nevoa max-md:hidden">
            Exporte um relatório em PDF com tudo: a meta, o lance máximo{fixo ? ", o lucro pelo preço pedido e a margem de segurança" : ""}, a tabela
            de cenários, a conta linha a linha e as premissas. Seus ajustes ficam guardados neste navegador, só para este imóvel.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-nevoa md:hidden">
            Relatório em PDF com a meta, a tabela, a conta e as premissas. Seus ajustes ficam neste navegador.
          </p>
        </div>
        <a
          href={relatorio}
          target="_blank"
          rel="noopener"
          className="btn-primary shrink-0 gap-2"
        >
          <IconeDocumento />
          Exportar PDF
          <span className="sr-only"> (abre em nova aba)</span>
        </a>
      </div>

      {editor && (
        <EditorCusto
          key={`${editor.alvo.editor}-${"extraId" in editor.alvo ? editor.alvo.extraId : ""}`}
          alvo={editor.alvo}
          estado={r.estado}
          atual={r}
          entrada={imovel}
          referencias={referencias}
          plano={plano}
          aoPedirLuneta={
            aoPedirLuneta &&
            (() => {
              // o convite abre no lugar do editor: os dois modais não se empilham (um ficaria atrás do outro e o Esc
              // fecharia os dois). O foco volta, no fim, para quem abriu o editor (o lápis ou "Adicionar custo").
              const quem = editor.quem;
              setEditor(null);
              requestAnimationFrame(() => aoPedirLuneta(quem?.isConnected ? quem : document.getElementById(ID_DETALHE)));
            })
          }
          aoAplicar={(novo) => atualizar(() => novo)}
          aoFechar={() => setEditor(null)}
          fallbackFocus={() => document.getElementById(ID_DETALHE)}
        />
      )}
      {comoUsar && <ComoUsar r={r} onFechar={() => setComoUsar(false)} />}
    </section>
  );
}

/**
 * O aviso de que a simulação não é recomendação. No celular, numa linha (a frase inteira no (i), com o resto):
 * as três linhas em 12,5 px empurravam a tabela para baixo.
 */
function AvisoFixo() {
  return (
    <>
      <p className="flex gap-2 px-1 text-[12.5px] leading-relaxed text-nevoa max-md:hidden">
        <IconeInfo className="mt-0.5 size-3.5" />
        {AVISO_SIMULADOR}
      </p>
      {/* div (e não p): o pop-up do "Saiba mais" nasce aqui dentro */}
      <div className="flex items-center gap-1.5 px-1 text-sm leading-snug text-nevoa md:hidden">
        <IconeInfo className="size-3.5 shrink-0" />
        <span>Simulação, não recomendação de investimento.</span>
        <Popover
          papel="note"
          rotulo="Sobre a simulação"
          largura="min(22rem, calc(100vw - 24px))"
          gatilho={{
            ariaLabel: "Mais sobre a simulação",
            title: "Mais sobre a simulação",
            className:
              "relative -my-2 inline-flex min-h-11 shrink-0 cursor-pointer items-center px-1 text-[13px] font-semibold text-latao-texto underline-offset-4 hover:underline",
            conteudo: "Saiba mais",
          }}
        >
          <p className="p-4 text-sm leading-relaxed text-luar">{AVISO_SIMULADOR}</p>
        </Popover>
      </div>
    </>
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
    `${palavrasPreco(e).minimo} ${moeda(e.lance)}`,
    // o nome padronizado do site; o nome como a fonte chama fica no resumo da página
    MODALIDADE_ROTULO[e.modalidade],
  ];
  return partes.join(" · ");
}

/**
 * "Confira antes de decidir": o que falta ou pesa e pode ser resolvido ali mesmo. A área, quando a fonte não
 * informa; e a reserva de desocupação, só quando o imóvel está ocupado com certeza (fonte ou tag revisada).
 * Desocupado ou ocupação não informada: nada aqui, e nenhuma reserva (a desocupação pode ser acrescentada no
 * Detalhe). As dívidas apontadas são pedidas no próprio cartão-resposta.
 */
function Conferir({
  modelo,
  ajustar,
  aoEditarDesocupacao,
}: {
  modelo: Modelo;
  ajustar: (m: (a: Ajustes) => Ajustes) => void;
  aoEditarDesocupacao: (quem: HTMLElement) => void;
}) {
  const { premissas: p, padrao: d, perfil, entrada: e } = modelo;
  const usaArea = p.reformaModo === "m2" || p.condominio > 0;
  const paraQue = [p.reformaModo === "m2" ? perfil.rotuloReforma.toLowerCase() : null, p.condominio > 0 ? "condomínio" : null].filter(Boolean).join(" e ");
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
  if (modelo.ocupado && p.desocupacao === d.desocupacao && p.desocupacao > 0 && !p.desligados.includes("desocupacao")) {
    itens.push({
      chave: "ocupacao",
      tom: "info",
      texto: <>Imóvel ocupado: reservamos {moeda(p.desocupacao)} para a desocupação, que pode levar meses.</>,
      campo: (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={(ev) => aoEditarDesocupacao(ev.currentTarget)}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-nevoa/30 px-4 text-[13px] font-semibold transition-colors hover:border-latao pointer-fine:min-h-9"
        >
          Ajustar
        </button>
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
              Com a área, usamos a referência da região: {descricaoReferencia(ref)} ({porArea(mediaDe(ref) ?? 0, e.tipo)}).
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
        {palavrasPreco(e).fixo
          ? `Preço pedido: ${moeda(e.lance)}. Assim que houver um valor de venda, aparecem o seu lance máximo, o lucro pelo preço pedido e a tabela de cenários.`
          : `Lance mínimo atual: ${moeda(e.lance)}. Assim que houver um valor de venda, aparecem o seu lance máximo e a tabela de cenários.`}
      </Aviso>
    </div>
  );
}

