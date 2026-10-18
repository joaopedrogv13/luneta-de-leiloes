import Link from "next/link";
import { BACK_TO_SITE } from "@/components/assinante/shared";
import type { EntradaSimulador } from "@/components/simulador";
import { cidadePequena, linhaResumoNota, ondeRisco } from "@/lib/catalogo/nota-texto";
import { pode } from "@/lib/catalogo/planos";
import type { Conjunto, PaginaImovel as DadosPagina, LocalizacaoImovel, Plano } from "@/lib/catalogo/tipos";
import { CabecalhoImovel } from "./CabecalhoImovel";
import { ProvedorImovel } from "./ContextoImovel";
import { ehExemplo, faltaParaPraca } from "./formato";
import { Galeria } from "./Galeria";
import { NavSecoes, type SecaoNav } from "./NavSecoes";
import { BarraInferior, ResumoLateral, type DadosResumo } from "./ResumoLateral";
import { RolagemSegura } from "./RolagemSegura";
import { SecaoDocumentos } from "./SecaoDocumentos";
import { SecaoLocalizacao } from "./SecaoLocalizacao";
import { SecaoParecidos } from "./SecaoParecidos";
import { SecaoRegiao } from "./SecaoRegiao";
import { AVISO_CLASSIFICACAO, SecaoRiscos } from "./SecaoRiscos";
import { SecaoResumo } from "./SecaoResumo";
import { SecaoSimulador } from "./SecaoSimulador";
import { SecaoRegiaoTravada, SecaoSimuladorTravada } from "./SecoesTravadas";
import { TopoImovel } from "./TopoImovel";
import { GradeImovel, LateralRecolhivel, PilulaResumo } from "./ResumoRecolhivel";
import styles from "./imovel.module.css";
import { VoltarBusca } from "./VoltarBusca";

/**
 * Ordem das seções e da navegação: a localização antes do simulador; os parecidos no fim da página. Os dados da
 * fonte viraram o rodapé de Documentos (a âncora #fonte continua valendo). No Lente, as seções inteiras da Luneta
 * (riscos, simulador, região) ganham o cadeado na navegação; a localização não, porque o mapa e o endereço são do Lente.
 */
function secoesDo(plano: Plano): SecaoNav[] {
  return [
    { id: "resumo", rotulo: "Resumo" },
    { id: "riscos", rotulo: "Riscos", travada: !pode(plano, "tags") },
    { id: "localizacao", rotulo: "Localização" },
    { id: "simulador", rotulo: "Simulador", travada: !pode(plano, "simulador") },
    { id: "regiao", rotulo: "Região", travada: !pode(plano, "regiao") },
    { id: "documentos", rotulo: "Documentos" },
    { id: "parecidos", rotulo: "Parecidos" },
  ];
}

/** A nota no resumo da direita: o número (ou "—"), a linha curta e o alerta de área de risco (null no Lente). */
function resumoDaNota(loc: LocalizacaoImovel | null): DadosResumo["local"] {
  if (!loc) return null;
  const pequena = cidadePequena(loc);
  const comNota = !pequena && loc.nota !== null && (loc.situacao === "calculada" || loc.situacao === "aproximada");
  return {
    nota: comNota ? loc.nota : null,
    aproximada: comNota && loc.situacao === "aproximada",
    linha: linhaResumoNota(loc),
    risco: loc.alertas.length > 0 ? ondeRisco(loc.alertas[0]!.distanciaM, loc) : null,
  };
}

/**
 * Página do imóvel (/previa/imovel/[id] e /assinante/imovel/[id]). Componente do servidor: monta o layout e
 * entrega aos pedaços interativos (galeria, resumo, navegação, tags, simulador, mapa, parecidos) só o que
 * cada um usa. O plano já vem aplicado pelo servidor: no Lente não há tags, selo, nota, preço da região nem portais nos
 * dados, e no lugar de cada recurso da Luneta vai a chamada (RecursoLuneta), na mesma posição; o código do simulador nem
 * é carregado.
 *
 * Computador: galeria grande no topo; embaixo, o conteúdo à esquerda e o resumo fixo à direita, que a pessoa pode
 * recolher (o conteúdo ocupa a largura e uma pílula com o lance fica na barra das seções; a escolha fica salva).
 * Tablet em pé: galeria e título lado a lado; o resumo do preço na largura toda, com duas colunas por dentro.
 * Celular: uma coluna (galeria, o "cartão de decisão" com título, preço e ações, seções) e a barra fixa no pé com
 * o lance e "Ver anúncio" (minimizável). O cabeçalho do site sai de cena ao rolar para baixo (TopoImovel).
 * A grade (imovel.module.css) posiciona galeria, cabeçalho, resumo e conteúdo em cada largura.
 */
export function PaginaImovel({
  conjunto,
  plano,
  pagina,
  agora,
  resumoRecolhido = false,
}: {
  conjunto: Conjunto;
  plano: Plano;
  pagina: DadosPagina;
  agora: number;
  /** a pessoa deixou o resumo da direita recolhido (cookie lido pelo servidor) */
  resumoRecolhido?: boolean;
}) {
  const i = pagina.imovel;
  const exemplo = ehExemplo(i);
  const falta = faltaParaPraca(i.dataPraca, agora);
  const contar = (f: (t: (typeof i.tags)[number]) => boolean) => i.tags.filter(f).length;

  const resumo: DadosResumo = {
    id: i.id,
    titulo: i.titulo,
    lance: i.lance,
    avaliacao: i.avaliacao,
    desagio: i.desagio,
    modalidade: i.modalidade,
    praca: i.praca,
    dataPraca: i.dataPraca,
    coletadoEm: i.coletadoEm,
    fonteNome: i.fonte.nome,
    anuncio: i.links.find((l) => l.tipo === "anuncio")?.url ?? null,
    exemplo,
    falta,
    riscos: !pode(plano, "tags")
      ? null
      : {
            grave: contar((t) => !t.emRevisao && t.severidade === "grave"),
            atencao: contar((t) => !t.emRevisao && t.severidade === "atencao"),
            positivo: contar((t) => !t.emRevisao && t.severidade === "positivo"),
            info: contar((t) => !t.emRevisao && t.severidade === "info"),
            revisao: contar((t) => t.emRevisao),
            revisaoGrave: contar((t) => t.emRevisao && t.severidade === "grave"),
          },
    local: resumoDaNota(pagina.localizacao),
  };

  const entradaSimulador: EntradaSimulador = {
    id: i.id,
    tipo: i.tipo,
    titulo: i.titulo,
    area: i.area,
    areaTerreno: i.areaTerreno,
    areaPrivativa: i.areaPrivativa,
    avaliacao: i.avaliacao,
    lance: i.lance,
    modalidade: i.modalidade,
    modalidadeFonte: i.modalidadeFonte,
    fonte: i.fonte,
    ocupacao: i.ocupacao,
    uf: i.uf,
    cidade: i.cidade,
    financiamento: i.financiamento,
    parcelamento: i.parcelamento,
    judicial: i.judicial,
    condicoesPagamento: i.condicoesPagamento,
    tags: i.tags.map((t) => ({ slug: t.slug, emRevisao: t.emRevisao })),
  };

  return (
    <ProvedorImovel conjunto={conjunto} plano={plano} id={i.id}>
      <TopoImovel conjunto={conjunto} plano={plano} id={i.id} />

      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 pb-16 outline-none sm:px-6 lg:px-8 2xl:max-w-[1440px]">
        {/* no celular e em tela baixa, "voltar à busca" é o ícone do cabeçalho */}
        <div className="py-4 max-sm:hidden baixa:hidden">
          <VoltarBusca conjunto={conjunto} plano={plano} />
        </div>

        <GradeImovel recolhidoNoServidor={resumoRecolhido} className="grid md:gap-y-6 sm:baixa:pt-4">
          <div className={`min-w-0 ${styles.galeria}`}>
            <Galeria
              fotos={i.fotos}
              tipo={i.tipo}
              titulo={i.titulo}
              semFotoTexto={exemplo ? "Exemplo fictício: sem fotos" : "A fonte não publicou fotos deste imóvel"}
            />
          </div>

          {/* celular: o cabeçalho é a parte de cima do "cartão de decisão" (o resumo do preço é a de baixo) */}
          <div
            className={`min-w-0 ${styles.cabeca} max-md:mt-4 max-md:rounded-t-3xl max-md:border max-md:border-b-0 max-md:border-nevoa/20 max-md:bg-tinta max-md:px-5 max-md:pt-5 max-md:pb-4 lg:mt-3`}
          >
            <CabecalhoImovel imovel={i} pracaPassou={!!falta?.passou} />
          </div>

          <LateralRecolhivel>
            <ResumoLateral d={resumo} />
          </LateralRecolhivel>

          <div className={`min-w-0 ${styles.conteudo} max-md:mt-6`}>
            {/* celular deitado (pouca altura): o cabeçalho deixa de ser fixo e a navegação cola no topo; celular e
                tablet: com o cabeçalho fora de cena (rolando para baixo), ela sobe para o topo */}
            <div
              data-topo-fixo=""
              className="sticky top-14 z-30 -mx-4 border-b border-nevoa/15 bg-noite px-4 py-1.5 transition-[top] duration-200 ease-luneta motion-reduce:transition-none sm:top-16 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 baixa:top-0 [html[data-topo-recolhido]_&]:top-0"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <NavSecoes secoes={secoesDo(plano)} />
                </div>
                <PilulaResumo lance={i.lance} desagio={i.desagio} precoFixo={i.modalidade === "venda_direta"} />
              </div>
            </div>

            {/* @container: as grades de dentro (fatos do resumo) seguem a largura da coluna, não a da tela */}
            <div className="@container mt-8 [&>*+*]:mt-14 sm:[&>*+*]:mt-20">
              <SecaoResumo imovel={i} agora={agora} />
              <SecaoRiscos imovel={i} plano={plano} selosDesligados={pagina.selosDesligados} />
              <SecaoLocalizacao imovel={i} localizacao={pagina.localizacao} travada={pagina.travas.includes("localizacao")} />
              {pode(plano, "simulador") ? (
                <SecaoSimulador imovel={entradaSimulador} referencias={pagina.vizinhanca.referencias} />
              ) : (
                <SecaoSimuladorTravada imovel={i} />
              )}
              {pode(plano, "regiao") ? <SecaoRegiao imovel={i} vizinhanca={pagina.vizinhanca} /> : <SecaoRegiaoTravada imovel={i} vizinhanca={pagina.vizinhanca} />}
              <SecaoDocumentos imovel={i} />
              <SecaoParecidos imovel={i} vizinhanca={pagina.vizinhanca} />
            </div>
          </div>
        </GradeImovel>
      </main>

      <footer className="border-t border-nevoa/15 px-4 pt-8 pb-28 text-sm leading-relaxed text-nevoa sm:px-6 sm:text-[13px] lg:px-8 lg:pb-12">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-start justify-between gap-x-8 gap-y-4 2xl:max-w-[1440px]">
          <div className="max-w-[72ch] space-y-2">
            <p>
              <strong className="font-semibold text-luar">Aviso:</strong> {AVISO_CLASSIFICACAO}
            </p>
            <p>
              {exemplo
                ? "Exemplos fictícios, para demonstrar a área do assinante."
                : "Fotos e anúncios pertencem às fontes; a foto aparece direto do site de origem e, se não carregar, fica o desenho no lugar."}
            </p>
          </div>
          <Link href={BACK_TO_SITE} prefetch={false} className="inline-flex min-h-11 items-center font-medium text-latao-texto underline-offset-4 hover:text-luar hover:underline">
            <span aria-hidden="true">←&nbsp;</span>Voltar ao site
          </Link>
        </div>
      </footer>

      <BarraInferior d={resumo} />
      <RolagemSegura />
    </ProvedorImovel>
  );
}
