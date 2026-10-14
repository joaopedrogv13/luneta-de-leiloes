import Link from "next/link";
import { BACK_TO_SITE } from "@/components/assinante/shared";
import type { EntradaSimulador } from "@/components/simulador";
import type { Conjunto, PaginaImovel as DadosPagina, Plano } from "@/lib/catalogo/tipos";
import { CabecalhoImovel } from "./CabecalhoImovel";
import { ProvedorImovel } from "./ContextoImovel";
import { ehExemplo, faltaParaPraca } from "./formato";
import { Galeria } from "./Galeria";
import { NavSecoes, type SecaoNav } from "./NavSecoes";
import { BarraInferior, ResumoLateral, type DadosResumo } from "./ResumoLateral";
import { RolagemSegura } from "./RolagemSegura";
import { SecaoDocumentos } from "./SecaoDocumentos";
import { SecaoLocalizacao } from "./SecaoLocalizacao";
import { SecaoRegiao } from "./SecaoRegiao";
import { AVISO_CLASSIFICACAO, SecaoRiscos } from "./SecaoRiscos";
import { SecaoResumo } from "./SecaoResumo";
import { SecaoSimulador } from "./SecaoSimulador";
import { TopoImovel } from "./TopoImovel";
import { VoltarBusca } from "./VoltarBusca";

const SECOES: SecaoNav[] = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "riscos", rotulo: "Riscos" },
  { id: "simulador", rotulo: "Simulador" },
  { id: "regiao", rotulo: "Região" },
  { id: "localizacao", rotulo: "Localização" },
  { id: "documentos", rotulo: "Documentos" },
];

/**
 * Página do imóvel (/previa/imovel/[id] e /assinante/imovel/[id]). Componente do servidor: monta o layout e
 * entrega aos pedaços interativos (galeria, resumo, navegação, tags, simulador, mapa, parecidos) só o que
 * cada um usa. O plano já vem aplicado pelo servidor: no Lente não há tags nem selo nos dados.
 *
 * Computador: galeria grande no topo; embaixo, o conteúdo à esquerda e o resumo fixo à direita.
 * Celular: uma coluna (título, resumo, seções) e a barra fixa no pé com o lance e "Ver anúncio".
 */
export function PaginaImovel({ conjunto, plano, pagina, agora }: { conjunto: Conjunto; plano: Plano; pagina: DadosPagina; agora: number }) {
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
    riscos:
      plano === "lente"
        ? null
        : {
            grave: contar((t) => !t.emRevisao && t.severidade === "grave"),
            atencao: contar((t) => !t.emRevisao && t.severidade === "atencao"),
            positivo: contar((t) => !t.emRevisao && t.severidade === "positivo"),
            info: contar((t) => !t.emRevisao && t.severidade === "info"),
            revisao: contar((t) => t.emRevisao),
            revisaoGrave: contar((t) => t.emRevisao && t.severidade === "grave"),
          },
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

      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 pb-16 outline-none sm:px-6 lg:px-8">
        <div className="py-2.5 sm:py-4">
          <VoltarBusca conjunto={conjunto} plano={plano} />
        </div>

        <Galeria
          fotos={i.fotos}
          tipo={i.tipo}
          titulo={i.titulo}
          semFotoTexto={exemplo ? "Exemplo fictício: sem fotos" : "A fonte não publicou fotos deste imóvel"}
        />

        <div className="mt-6 grid gap-x-10 gap-y-6 lg:mt-9 lg:grid-cols-[minmax(0,1fr)_368px] lg:grid-rows-[auto_1fr] xl:gap-x-14 xl:grid-cols-[minmax(0,1fr)_392px]">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <CabecalhoImovel imovel={i} pracaPassou={!!falta?.passou} />
          </div>

          <aside aria-label="Resumo do preço e ações" className="min-w-0 lg:sticky lg:top-[88px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <ResumoLateral d={resumo} />
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            {/* celular deitado (pouca altura): o cabeçalho deixa de ser fixo e a navegação cola no topo */}
            <div
              data-topo-fixo=""
              className="sticky top-14 z-30 -mx-4 border-b border-nevoa/15 bg-noite px-4 py-1.5 sm:top-16 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [@media(max-height:500px)]:top-0"
            >
              <NavSecoes secoes={SECOES} />
            </div>

            <div className="mt-8 [&>*+*]:mt-16 sm:[&>*+*]:mt-20">
              <SecaoResumo imovel={i} agora={agora} />
              <SecaoRiscos imovel={i} plano={plano} selosDesligados={pagina.selosDesligados} />
              <SecaoSimulador imovel={entradaSimulador} referencias={pagina.vizinhanca.referencias} />
              <SecaoRegiao imovel={i} vizinhanca={pagina.vizinhanca} />
              <SecaoLocalizacao imovel={i} />
              <SecaoDocumentos imovel={i} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-nevoa/15 px-4 pt-8 pb-28 text-[13px] leading-relaxed text-nevoa sm:px-6 lg:px-8 lg:pb-12">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-start justify-between gap-x-8 gap-y-4">
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
