/**
 * A moldura da demonstração "Ajuste o foco": o que a seção mostra antes de o código da demonstração chegar (e se ele
 * não chegar). Componente de servidor: vai pronto no HTML, sem JavaScript. É a mesma casca da demonstração
 * (./Casca.tsx), com os mesmos textos e medidas, só que parada: a troca pela demonstração não muda a altura da página
 * (diferença de 0 px de 360 a 1440 px; scratchpad/r5F/alturas.mjs).
 */
import { CAMPO, CHIP_OFF } from "@/components/catalogo/ui/estilos";
import { IconeAjustes, IconeLupa, IconeSeta } from "@/components/catalogo/ui/icones";
import {
  BOTAO_FILTROS,
  BOTAO_MAIS,
  BOTAO_RAPIDO,
  CascaFoco,
  Contagem,
  LINHA_IMOVEL,
  LISTA,
  LOTE_CELULAR,
  MAPA,
  ORDENAR,
  PLACEHOLDER_BUSCA,
  RODAPE_LISTA,
  SELOS_IMOVEL,
  TOTAL_FICTICIOS,
  type TextosCasca,
} from "./Casca";

/** Os botões rápidos, como a demonstração os mostra antes de qualquer filtro. */
const RAPIDOS_LENTE = ["Estado", "Cidade", "Tipo", "Preço", "Deságio"];
const RAPIDOS_LUNETA = ["Praça", "Quartos", "Área", "Ocupação", "Financiamento", "Nota"];

/** Texto com a altura de linha certa, coberto por uma barra (a moldura ocupa o mesmo espaço que o texto de verdade). */
function Oculto({ children, className = "" }: { children: string; className?: string }) {
  return <span className={`rounded-md bg-nevoa/12 text-transparent ${className}`}>{children}</span>;
}

export function MolduraFoco({ textos }: { textos: TextosCasca & { carregando: string } }) {
  const chip = (nome: string) => (
    <span key={nome} className={`${BOTAO_RAPIDO} snap-start`}>
      {/* a mesma caixa do botão de verdade (o rótulo com altura de linha 1,25) */}
      <span className="py-px leading-[1.25]">{nome}</span>
      <IconeSeta className="text-nevoa" />
    </span>
  );
  return (
    <>
      <p className="sr-only" aria-live="polite">
        {textos.carregando}
      </p>
      <CascaFoco
        inerte
        textos={textos}
        total={TOTAL_FICTICIOS}
        busca={
          <span className="relative min-w-0 flex-1 lg:max-w-[420px]">
            <IconeLupa tamanho={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-nevoa" />
            <span className={`${CAMPO} flex items-center pr-3 pl-10 text-nevoa`}>
              <span className="truncate md:hidden">{PLACEHOLDER_BUSCA[0]}</span>
              <span className="truncate max-md:hidden">{PLACEHOLDER_BUSCA[1]}</span>
            </span>
          </span>
        }
        botaoFiltros={
          <span className={`${BOTAO_FILTROS} ${CHIP_OFF}`}>
            <IconeAjustes tamanho={17} />
            <span className="lg:hidden">Filtros</span>
            <span className="max-lg:hidden">Todos os filtros</span>
          </span>
        }
        rapidosLente={RAPIDOS_LENTE.map(chip)}
        rapidosLuneta={
          <>
            {RAPIDOS_LUNETA.map(chip)}
            <span className={BOTAO_RAPIDO}>
              <span className="size-3.5" />
              Metrô perto
              <span className="rounded bg-nevoa/12 text-xs text-transparent tabular-nums">00</span>
            </span>
          </>
        }
        contagem={<Contagem mostrado={String(TOTAL_FICTICIOS)} total={TOTAL_FICTICIOS} />}
        ordenar={
          <>
            <span className={`${ORDENAR} inline-flex items-center`}>Maior deságio</span>
            <IconeSeta className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-nevoa" />
          </>
        }
        mapa={<div className={`${MAPA} grid-lines bg-noite`} />}
        lista={
          <ul className={`${LISTA} md:overflow-y-hidden`}>
            {Array.from({ length: LOTE_CELULAR }, (_, k) => (
              <li key={k} className={LINHA_IMOVEL}>
                <span className="size-10 shrink-0 rounded-xl bg-nevoa/12 max-sm:hidden" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] leading-snug font-semibold">
                    <Oculto>Apartamento 2 quartos</Oculto>
                  </p>
                  <p className="mt-0.5 truncate text-[13px] leading-snug">
                    <Oculto>64 m² · Bairro · Cidade/UF</Oculto>
                  </p>
                  <p className={SELOS_IMOVEL}>
                    {[56, 64, 48].map((w) => (
                      <span key={w} className="h-[19px] rounded-full bg-nevoa/12" style={{ width: w }} />
                    ))}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-xl leading-none font-bold">
                    <Oculto>−48%</Oculto>
                  </p>
                </div>
              </li>
            ))}
            <li className={RODAPE_LISTA}>
              <span className={`${BOTAO_MAIS} text-transparent`}>Mostrar mais</span>
            </li>
          </ul>
        }
      />
    </>
  );
}
