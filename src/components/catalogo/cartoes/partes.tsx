"use client";

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { Seal } from "@/components/ui/Seal";
import { area, local, moeda, moedaCurta, MODALIDADE_ROTULO, numero, PRACA_ROTULO, SELO_ROTULO } from "@/lib/catalogo/rotulos";
import { pode } from "@/lib/catalogo/planos";
import { PRODUTO } from "@/lib/catalogo/produto";
import type { ImovelResumo, Plano, Recurso } from "@/lib/catalogo/tipos";
import { quandoPraca } from "./datas";
import { FavoritoComAlerta } from "./FavoritoAlerta";
import { IconeArea, IconeCadeado, IconeCalendario, IconeCoracao, IconeQuarto, IconeRegua, IconeVaga } from "./icones";

/** Props comuns de cartão e linha. */
export interface PropsImovel {
  imovel: ImovelResumo;
  plano: Plano;
  /** página do imóvel (o cartão inteiro leva até ela) */
  hrefImovel: string;
  favorito: boolean;
  onFavoritar: (id: string) => void;
  /** plano Lente: abre o convite à Luneta; recebe quem abriu, para o foco voltar a ele */
  onUpsell: (opener: HTMLElement, recurso?: Recurso | null) => void;
  /** mouse ou foco no imóvel (destaca o ponto no mapa); null ao sair */
  onHover?: (id: string | null) => void;
  /** destacado (ponto do mapa sob o mouse) */
  ativo?: boolean;
  /** primeira dobra: a foto carrega já */
  eager?: boolean;
}

/** Deságio em texto (o número grande da foto é só visual). */
export function textoDesagio(d: number | null): { curto: string; frase: string } | null {
  if (d === null) return null;
  if (d > 0) return { curto: `−${d}%`, frase: `${d}% abaixo da avaliação` };
  if (d < 0) return { curto: `+${numero(Math.abs(d))}%`, frase: `lance ${numero(Math.abs(d))}% acima da avaliação` };
  return { curto: "0%", frase: "lance igual à avaliação" };
}

/**
 * Preço: lance mínimo grande (o número que importa), avaliação e deságio em texto.
 * `alinhamento="fim"` na coluna da direita da linha.
 */
export function BlocoPreco({
  imovel,
  tamanho = "md",
  alinhamento = "inicio",
  compacto = false,
  desagioNaFoto = false,
}: {
  imovel: Pick<ImovelResumo, "lance" | "avaliacao" | "desagio"> & Partial<Pick<ImovelResumo, "modalidade">>;
  tamanho?: "md" | "lg";
  /** "linha": à esquerda, e à direita quando a linha larga põe o preço na própria coluna (container query) */
  alinhamento?: "inicio" | "fim" | "linha";
  /** num @container estreito (< 36rem: a linha compacta do celular), números menores e a avaliação curta */
  compacto?: boolean;
  /** a foto já mostra o deságio em destaque: no celular, o "· −90%" ao lado da avaliação sai (fica para o leitor de tela) */
  desagioNaFoto?: boolean;
}) {
  // lance acima de 5× a avaliação: quase sempre erro de digitação da fonte (R$ 69,7 milhões num apartamento
  // avaliado em R$ 401 mil); em vez de "17.259% acima da avaliação", o aviso para conferir
  const foraDoPadrao = imovel.avaliacao !== null && imovel.avaliacao > 0 && imovel.lance > 5 * imovel.avaliacao;
  const d = foraDoPadrao ? { curto: "", frase: "valor fora do padrão: confira no anúncio" } : textoDesagio(imovel.desagio);
  const abaixo = !foraDoPadrao && imovel.desagio !== null && imovel.desagio > 0;
  const fim = alinhamento === "fim" ? "text-right" : alinhamento === "linha" ? "@4xl:text-right" : "";
  const fimFlex = alinhamento === "fim" ? "justify-end" : alinhamento === "linha" ? "@4xl:justify-end" : "";
  const valor = moeda(imovel.lance);
  // R$ 10 milhões ou mais: um degrau menor, para caber na coluna de preço da linha e no cartão estreito
  const longo = valor.length > 12;
  const fonte = tamanho === "lg" ? (longo ? "text-[26px]" : "text-[30px]") : longo ? "text-[24px]" : "text-[27px]";
  const menor = compacto ? "@max-xl:text-[21px]" : "";
  return (
    <div className={fim}>
      {/* venda direta: o preço é fixo ("Preço de venda", como na página do imóvel) */}
      <p className={`text-[11px] leading-none font-semibold tracking-[0.12em] text-nevoa uppercase ${compacto ? "@max-xl:text-[10px]" : ""}`}>
        {imovel.modalidade === "venda_direta" ? "Preço de venda" : "Lance mínimo"}
      </p>
      <p className={`mt-1.5 font-display leading-none font-bold tracking-[-0.03em] whitespace-nowrap text-luar tabular-nums ${fonte} ${menor}`}>{valor}</p>
      <p className={`mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px] leading-snug text-nevoa ${fimFlex} ${compacto ? "@max-xl:mt-1 @max-xl:text-xs" : ""}`}>
        {imovel.avaliacao !== null ? (
          <>
            <span>
              Avaliação <span className={`text-luar/85 tabular-nums ${compacto ? "@max-xl:hidden" : ""}`}>{moeda(imovel.avaliacao)}</span>
              {compacto && <span aria-hidden="true" className="hidden text-luar/85 tabular-nums @max-xl:inline">{moedaCurta(imovel.avaliacao)}</span>}
            </span>
            {d && abaixo && (
              // o ponto vai junto do número: se quebrar a linha, não fica um "·" solto no fim
              <span className="font-semibold whitespace-nowrap text-luar">
                <span aria-hidden="true" className={desagioNaFoto ? "max-sm:hidden" : ""}>
                  <span className="mr-1.5 font-normal text-nevoa">·</span>
                  {d.curto}
                </span>
                <span className="sr-only">, {d.frase}</span>
              </span>
            )}
            {/* lance igual ou acima da avaliação: frase inteira, numa linha própria (não cabe ao lado) */}
            {d && !abaixo && (
              <span className="basis-full">
                <span className="sr-only">, </span>
                {d.frase.charAt(0).toUpperCase() + d.frase.slice(1)}
              </span>
            )}
          </>
        ) : (
          <span>Avaliação não informada pela fonte</span>
        )}
      </p>
    </div>
  );
}

/**
 * Área, quartos, vagas e R$/m², com ícones; o que a fonte não informa simplesmente não aparece.
 * O leitor de tela ouve "Área: 241 m²", "5 quartos", "Lance por m²: R$ 3.831/m²" (o prefixo só onde o
 * texto visível não se explica sozinho).
 */
export function Fatos({
  imovel,
  className = "",
}: {
  imovel: Pick<ImovelResumo, "area" | "quartos" | "vagas" | "lanceM2" | "lance">;
  className?: string;
}) {
  const itens: { chave: string; icone: ReactNode; prefixo?: string; texto: string }[] = [];
  if (imovel.area !== null && imovel.area > 0) itens.push({ chave: "area", icone: <IconeArea />, prefixo: "Área: ", texto: area(imovel.area) });
  if (imovel.quartos !== null && imovel.quartos > 0)
    itens.push({ chave: "quartos", icone: <IconeQuarto />, texto: `${imovel.quartos} ${imovel.quartos === 1 ? "quarto" : "quartos"}` });
  if (imovel.vagas !== null && imovel.vagas > 0)
    itens.push({ chave: "vagas", icone: <IconeVaga />, texto: `${imovel.vagas} ${imovel.vagas === 1 ? "vaga" : "vagas"}` });
  // Áreas em hectare (a partir de 10 ha, como em `area`): R$/m² viraria "R$ 1/m²"; o preço vai por hectare.
  if (imovel.area !== null && imovel.area >= AREA_HECTARE) {
    itens.push({ chave: "ha", icone: <IconeRegua />, prefixo: "Lance por hectare: ", texto: `${moeda(Math.round((imovel.lance / imovel.area) * 10_000))}/ha` });
  } else if (imovel.lanceM2 !== null) {
    itens.push({ chave: "m2", icone: <IconeRegua />, prefixo: "Lance por m²: ", texto: `${moeda(imovel.lanceM2)}/m²` });
  }

  if (itens.length === 0) return <p className={`text-[13px] text-nevoa ${className}`}>Área não informada pela fonte</p>;
  return (
    <ul aria-label="Características" className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] leading-none text-luar/90 ${className}`}>
      {itens.map((f) => (
        <li key={f.chave} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-nevoa">{f.icone}</span>
          {f.prefixo && <span className="sr-only">{f.prefixo}</span>}
          <span className="tabular-nums">{f.texto}</span>
        </li>
      ))}
    </ul>
  );
}

/** A partir desta área (10 ha) `area()` mostra hectares; o preço por área acompanha. */
const AREA_HECTARE = 100_000;

/**
 * Hora de referência do navegador, lida uma vez por visita. No servidor e na hidratação vale null (o HTML
 * do servidor e o primeiro desenho do navegador ficam iguais); logo depois entra a hora local.
 */
let agoraCache: number | null = null;
const semAssinatura = () => () => {};
function useAgora(): number | null {
  return useSyncExternalStore(
    semAssinatura,
    () => (agoraCache ??= Date.now()),
    () => null,
  );
}

/** "Leilão · 2ª praça · 19 out" (ou "data não informada", esmaecida; "já passou" quando a data ficou para trás). */
export function LinhaPraca({ imovel, className = "" }: { imovel: Pick<ImovelResumo, "modalidade" | "praca" | "dataPraca">; className?: string }) {
  const agora = useAgora();
  const partes = [MODALIDADE_ROTULO[imovel.modalidade]];
  if (imovel.praca) partes.push(PRACA_ROTULO[imovel.praca]);
  const quando = imovel.dataPraca ? quandoPraca(imovel.dataPraca, agora) : null;
  return (
    <p className={`flex items-start gap-1.5 text-[13px] leading-snug text-nevoa ${className}`}>
      <IconeCalendario className="mt-px text-nevoa" />
      <span className="min-w-0">
        <span className="text-luar/90">{partes.join(" · ")}</span>
        <span aria-hidden="true"> · </span>
        <span className="sr-only">, </span>
        {quando ? (
          <span className="whitespace-nowrap">
            <span className={`font-medium tabular-nums ${quando.passou ? "text-nevoa" : "text-luar/90"}`}>
              <span className="sr-only">praça em </span>
              {quando.texto}
            </span>
            {quando.passou && <span> (já passou)</span>}
          </span>
        ) : (
          // numa linha estreita (lista ao lado do mapa, celular) a forma curta, para não quebrar a linha
          <span className="whitespace-nowrap">
            <span className="@max-2xl:hidden">data não informada</span>
            <span className="hidden @max-2xl:inline">sem data</span>
          </span>
        )}
      </span>
    </p>
  );
}

/**
 * O cartão mostra o selo? Não no plano que não tem selos (Lente: nos cartões, nada de selo, tags ou nota; o convite
 * fica no aviso do topo da lista e na página do imóvel), nem quando ele está "em análise" (na prévia, todos os imóveis:
 * a faixa do topo e "Ordenar" já avisam; repetir "Selo em análise" em cada cartão era ruído).
 */
export function mostrarSelo(imovel: Pick<ImovelResumo, "seloPendente">, plano: Plano) {
  return pode(plano, "selos") && !imovel.seloPendente;
}

/** Complemento do nome acessível de um imóvel: com 24 "Casa 2 quartos" na página, o local e o lance distinguem. */
export function complementoSr(imovel: Pick<ImovelResumo, "bairro" | "cidade" | "uf" | "lance">) {
  return `, ${local(imovel)}, lance ${moeda(imovel.lance)}`;
}

/**
 * Selo do imóvel. Luneta: anéis + nome ("Alvo"), ou "Selo em análise" (critérios pendentes) com o anel
 * tracejado. Lente: nada (o selo nem chega ao navegador; ver mostrarSelo).
 */
export function SeloImovel({ imovel, plano, tamanho = 30 }: { imovel: Pick<ImovelResumo, "selo" | "seloPendente">; plano: Plano; tamanho?: number }) {
  if (!pode(plano, "selos")) return null;
  const pendente = imovel.seloPendente;
  const nivel = pendente ? 0 : imovel.selo;
  const tom = pendente || nivel === 0 ? "text-nevoa" : nivel === 3 ? "text-pos" : "text-latao-texto";
  return (
    <div className="flex items-center gap-2 select-none">
      <Seal level={nivel} size={tamanho} />
      <span className={`text-[11px] leading-none font-semibold tracking-[0.1em] whitespace-nowrap uppercase ${tom}`}>
        <span className="sr-only">Selo: </span>
        {pendente ? "Selo em análise" : SELO_ROTULO[nivel]}
      </span>
    </div>
  );
}

/**
 * Favoritar. Luneta: com o alerta de praça no produto (PRODUTO.alertaPraca, rodada 5), o coração favorita e abre a
 * opção "Avisar por e-mail quando a praça mudar" (FavoritoComAlerta); sem ele, só alterna (aria-pressed; o rótulo fica
 * igual e o coração enche). Lente: cadeado, abre o convite à Luneta. Fica por cima do link do cartão (z-10) e não
 * navega. `icone`: só o coração, num botão redondo de 40 px (44 no toque), para o canto do cartão, como nos portais
 * de imóveis. `abrirComAncora`: na chegada com #alerta-praca, a opção já abre (página do imóvel).
 */
export function BotaoFavoritar({
  imovel,
  plano,
  favorito,
  onFavoritar,
  onUpsell,
  icone = false,
  className = "",
  abrirComAncora = false,
}: {
  /** com o local e o lance, o nome acessível distingue um imóvel do outro na lista */
  imovel: Pick<ImovelResumo, "id" | "titulo"> & Partial<Pick<ImovelResumo, "bairro" | "cidade" | "uf" | "lance">>;
  plano: Plano;
  favorito: boolean;
  onFavoritar: (id: string) => void;
  onUpsell: (opener: HTMLElement, recurso?: Recurso | null) => void;
  icone?: boolean;
  className?: string;
  abrirComAncora?: boolean;
}) {
  // favoritos são da Luneta: no Lente, o cadeado e a janela da Luneta
  const lente = !pode(plano, "favoritos");
  const ligado = !lente && favorito;
  const clicar = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (lente) onUpsell(e.currentTarget, "favoritos");
    else onFavoritar(imovel.id);
  };
  const { cidade, uf, lance } = imovel;
  const complemento = cidade && uf && lance !== undefined ? complementoSr({ bairro: imovel.bairro ?? null, cidade, uf, lance }) : "";
  const classeIcone = (on: boolean) =>
    `relative z-10 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-[background-color,border-color,color,scale] duration-150 ease-luneta active:scale-[0.92] motion-reduce:transition-none pointer-fine:size-10 ${
      on ? "border-latao/80 bg-latao/15 text-latao" : "border-nevoa/30 bg-tinta/80 text-nevoa hover:border-latao hover:text-luar"
    } ${className}`;
  const classeTexto = (on: boolean) =>
    `relative z-10 inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3.5 text-[13px] leading-none font-medium whitespace-nowrap transition-[background-color,border-color,color,scale] duration-150 ease-luneta active:scale-[0.96] motion-reduce:transition-none pointer-fine:min-h-9 ${
      on ? "border-latao/80 bg-latao/15 text-latao-texto hover:bg-latao/22" : "border-nevoa/35 text-nevoa hover:border-latao hover:text-luar"
    } ${className}`;
  if (!lente && PRODUTO.alertaPraca) {
    return (
      <FavoritoComAlerta
        id={imovel.id}
        titulo={imovel.titulo}
        complemento={complemento}
        favorito={favorito}
        onFavoritar={onFavoritar}
        icone={icone}
        classeBotao={icone ? classeIcone : classeTexto}
        abrirComAncora={abrirComAncora}
      />
    );
  }
  if (icone) {
    return (
      <button
        type="button"
        onClick={clicar}
        aria-pressed={lente ? undefined : ligado}
        aria-haspopup={lente ? "dialog" : undefined}
        title={lente ? "Favoritar (plano Luneta)" : ligado ? "Favorito" : "Favoritar"}
        className={classeIcone(ligado)}
      >
        <IconeCoracao cheio={ligado} size={18} />
        {lente && (
          <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 inline-flex size-4 items-center justify-center rounded-full bg-tinta text-latao-texto ring-1 ring-latao/50">
            <IconeCadeado size={9} />
          </span>
        )}
        <span className="sr-only">
          Favoritar{lente ? " (plano Luneta)" : ""}: {imovel.titulo}
          {complemento}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={clicar}
      aria-pressed={lente ? undefined : ligado}
      aria-haspopup={lente ? "dialog" : undefined}
      className={classeTexto(ligado)}
    >
      {lente ? <IconeCadeado size={13} /> : <IconeCoracao cheio={ligado} size={15} className={ligado ? "text-latao" : ""} />}
      Favoritar
      <span className="sr-only">
        {lente ? " (plano Luneta)" : ""}: {imovel.titulo}
        {complemento}
      </span>
    </button>
  );
}
