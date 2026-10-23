"use client";

/**
 * Os controles de cada filtro da demonstração "Ajuste o foco", com as mesmas peças da prévia (src/components/catalogo/
 * ui: lista com busca, chips com contagem, faixa com barrinhas, Qualquer/Sim/Não). Cada um recebe os filtros, as
 * contagens e um `mudar`, que aplica na hora (a lista e o mapinha respondem a cada toque e a cada arraste).
 */
import type { ReactNode } from "react";
import { CIDADES_COM_METRO } from "@/lib/demo-foco/dados";
import {
  FORMATO,
  NOTAS,
  OCUPACAO_ROTULO,
  PRACA_ROTULO,
  QUARTOS,
  TIPO_ROTULO,
  definirUfs,
  removerGrupo,
  type FiltrosFoco,
  type GrupoFoco,
  type ResultadoFoco,
} from "@/lib/demo-foco/busca";
import { UF_NOME } from "@/lib/catalogo/rotulos";
import { CampoFaixa, type AtalhoFaixa } from "@/components/catalogo/ui/CampoFaixa";
import { Chips, type OpcaoChip } from "@/components/catalogo/ui/Chips";
import { SelecaoMultipla } from "@/components/catalogo/ui/SelecaoMultipla";
import { TriEstado } from "@/components/catalogo/ui/TriEstado";

export type Mudar = (fn: (f: FiltrosFoco) => FiltrosFoco) => void;

export interface PropsControle {
  f: FiltrosFoco;
  r: ResultadoFoco;
  mudar: Mudar;
  /** no painel "Todos os filtros" (folha): listas sem altura máxima no celular */
  noPainel?: boolean;
}

/** Escreve (ou apaga, se vazio) uma chave do filtro. */
export function com<K extends keyof FiltrosFoco>(f: FiltrosFoco, k: K, v: FiltrosFoco[K] | undefined): FiltrosFoco {
  const novo = { ...f };
  if (v === undefined || (Array.isArray(v) && v.length === 0)) delete novo[k];
  else novo[k] = v;
  return novo;
}

/**
 * Listas com busca: no pop-up, caixa que rola por dentro e o foco já na busca (como na prévia); na folha, 8 por vez e
 * sem rolagem dentro da folha no celular.
 */
const lista = (noPainel?: boolean) =>
  noPainel ? { alturaLista: "md:max-h-[264px]", loteInicial: 8 } : { alturaLista: "max-h-[min(42vh,288px)]", focarBusca: true };

export function ControleUf({ f, r, mudar, noPainel }: PropsControle) {
  const opcoes = Object.entries(r.facetas.uf)
    .concat((f.uf ?? []).filter((u) => !(u in r.facetas.uf)).map((u) => [u, 0]))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([uf, total]) => ({ valor: uf, rotulo: UF_NOME[uf] ?? uf, detalhe: uf, total, sinonimos: uf }));
  return (
    <SelecaoMultipla
      rotulo="Estados"
      placeholder="Buscar estado ou sigla"
      opcoes={opcoes}
      selecionados={f.uf ?? []}
      onChange={(v) => mudar((x) => definirUfs(x, v))}
      unidade={["estado", "estados"]}
      {...lista(noPainel)}
    />
  );
}

export function ControleCidade({ f, r, mudar, noPainel }: PropsControle) {
  const opcoes = Object.entries(r.facetas.cidade)
    .concat((f.cidade ?? []).filter((c) => !(c in r.facetas.cidade)).map((c) => [c, 0]))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([chave, total]) => {
      const [uf, nome] = chave.split("|");
      return { valor: chave, rotulo: nome, detalhe: uf, total };
    });
  const ufs = f.uf ?? [];
  return (
    <SelecaoMultipla
      rotulo="Cidades"
      placeholder={ufs.length === 1 ? `Buscar cidade em ${ufs[0]}` : "Buscar cidade"}
      opcoes={opcoes}
      selecionados={f.cidade ?? []}
      onChange={(v) => mudar((x) => com(x, "cidade", v))}
      unidade={["cidade", "cidades"]}
      feminino
      {...lista(noPainel)}
    />
  );
}

export function ControleTipo({ f, r, mudar }: PropsControle) {
  const opcoes: OpcaoChip[] = (Object.keys(TIPO_ROTULO) as (keyof typeof TIPO_ROTULO)[]).map((t) => ({ valor: t, rotulo: TIPO_ROTULO[t], total: r.facetas.tipo[t] }));
  return <Chips rotulo="Tipo de imóvel" opcoes={opcoes} valor={f.tipo ?? []} onChange={(v) => mudar((x) => com(x, "tipo", v as FiltrosFoco["tipo"]))} />;
}

const ATALHOS: Record<"lance" | "desagio" | "area", AtalhoFaixa[]> = {
  lance: [
    { rotulo: "até R$ 150 mil", max: 150_000 },
    { rotulo: "até R$ 300 mil", max: 300_000 },
    { rotulo: "até R$ 500 mil", max: 500_000 },
    { rotulo: "acima de R$ 1 mi", min: 1_000_000 },
  ],
  desagio: [
    { rotulo: "≥ 30%", min: 30 },
    { rotulo: "≥ 40%", min: 40 },
    { rotulo: "≥ 50%", min: 50 },
  ],
  area: [
    { rotulo: "até 50 m²", max: 50 },
    { rotulo: "50 a 100 m²", min: 50, max: 100 },
    { rotulo: "acima de 100 m²", min: 100 },
  ],
};

const ROTULO_FAIXA = { lance: "Lance mínimo", desagio: "Deságio", area: "Área" } as const;
const CHAVES_FAIXA = { lance: ["lanceMin", "lanceMax"], desagio: ["desagioMin", "desagioMax"], area: ["areaMin", "areaMax"] } as const;

export function ControleFaixa({ f, r, mudar, grupo, rotuloVisivel = true }: PropsControle & { grupo: "lance" | "desagio" | "area"; rotuloVisivel?: boolean }) {
  const [kMin, kMax] = CHAVES_FAIXA[grupo];
  return (
    <CampoFaixa
      rotulo={ROTULO_FAIXA[grupo]}
      rotuloVisivel={rotuloVisivel}
      histograma={r.facetas[grupo]}
      min={f[kMin]}
      max={f[kMax]}
      formato={FORMATO[grupo]}
      atalhos={ATALHOS[grupo]}
      onChange={(min, max) => mudar((x) => com(com(x, kMin, min), kMax, max))}
    />
  );
}

export function ControlePraca({ f, r, mudar }: PropsControle) {
  const opcoes: OpcaoChip[] = (["1", "2", "unica"] as const).map((p) => ({ valor: p, rotulo: PRACA_ROTULO[p], total: r.facetas.praca[p] }));
  return <Chips rotulo="Praça" opcoes={opcoes} ocultarZerados={false} valor={f.praca ?? []} onChange={(v) => mudar((x) => com(x, "praca", v as FiltrosFoco["praca"]))} />;
}

export function ControleQuartos({ f, r, mudar }: PropsControle) {
  const opcoes: OpcaoChip[] = [{ valor: "", rotulo: "Qualquer", neutro: true }, ...QUARTOS.map((n) => ({ valor: String(n), rotulo: `${n}+`, total: r.facetas.quartos[n] }))];
  return (
    <Chips
      rotulo="Quartos (pelo menos)"
      multiplo={false}
      permitirVazio={false}
      ocultarZerados={false}
      opcoes={opcoes}
      valor={[f.quartosMin === undefined ? "" : String(f.quartosMin)]}
      onChange={([v]) => mudar((x) => com(x, "quartosMin", v ? Number(v) : undefined))}
    />
  );
}

export function ControleOcupacao({ f, r, mudar }: PropsControle) {
  const opcoes: OpcaoChip[] = (["desocupado", "ocupado", "nao_informado"] as const).map((o) => ({ valor: o, rotulo: OCUPACAO_ROTULO[o], total: r.facetas.ocupacao[o] }));
  return <Chips rotulo="Ocupação" opcoes={opcoes} ocultarZerados={false} valor={f.ocupacao ?? []} onChange={(v) => mudar((x) => com(x, "ocupacao", v as FiltrosFoco["ocupacao"]))} />;
}

export function ControleFinanciamento({ f, r, mudar }: PropsControle) {
  return (
    <TriEstado
      rotulo="Aceita financiamento"
      valor={f.financiamento}
      totalSim={r.facetas.financiamento}
      onChange={(v) => mudar((x) => com(x, "financiamento", v))}
    />
  );
}

export function ControleNota({ f, r, mudar }: PropsControle) {
  const opcoes: OpcaoChip[] = [{ valor: "", rotulo: "Qualquer", neutro: true }, ...NOTAS.map((t) => ({ valor: String(t), rotulo: `${t} ou mais`, total: r.facetas.nota[t] }))];
  return (
    <Chips
      rotulo="Nota de localização mínima"
      multiplo={false}
      permitirVazio={false}
      ocultarZerados={false}
      opcoes={opcoes}
      valor={[f.notaMin === undefined ? "" : String(f.notaMin)]}
      onChange={([v]) => mudar((x) => com(x, "notaMin", v ? Number(v) : undefined))}
    />
  );
}

export function ControleMetro({ f, r, mudar }: PropsControle) {
  return (
    <Chips
      rotulo="Metrô"
      ocultarZerados={false}
      opcoes={[{ valor: "1", rotulo: "Estação a até 1 km", total: r.facetas.metro }]}
      valor={f.metro ? ["1"] : []}
      onChange={(v) => mudar((x) => com(x, "metro", v.length ? true : undefined))}
    />
  );
}

/** Uma frase de apoio por grupo (pop-up e painel). */
export const DICA: Partial<Record<GrupoFoco, string>> = {
  uf: "Escolha um ou vários estados.",
  cidade: "Escolha uma ou várias cidades.",
  tipo: "Escolha um ou vários tipos.",
  lance: "Lance mínimo pedido na praça atual. Toque nas barrinhas ou arraste.",
  desagio: "Desconto do lance sobre a avaliação.",
  praca: "Na 2ª praça, o lance mínimo costuma cair bastante.",
  quartos: "Pelo menos. Comercial e terreno ficam de fora.",
  area: "Área do imóvel (no terreno, a do lote).",
  ocupacao: "Ocupado ou desocupado, como o leilão informa.",
  financiamento: "Se o leilão aceita pagar com financiamento.",
  nota: "Nota de 0 a 100 para o entorno do imóvel, comparado com o resto da cidade.",
  metro: `Estação a até 1 km do imóvel. Só nas capitais com metrô (${CIDADES_COM_METRO.length} na demonstração).`,
};

/** O controle de cada grupo (pop-up rápido e painel). */
export function controleDo(g: GrupoFoco, p: PropsControle, rotuloVisivel = true): ReactNode {
  switch (g) {
    case "uf":
      return <ControleUf {...p} />;
    case "cidade":
      return <ControleCidade {...p} />;
    case "tipo":
      return <ControleTipo {...p} />;
    case "lance":
    case "desagio":
    case "area":
      return <ControleFaixa {...p} grupo={g} rotuloVisivel={rotuloVisivel} />;
    case "praca":
      return <ControlePraca {...p} />;
    case "quartos":
      return <ControleQuartos {...p} />;
    case "ocupacao":
      return <ControleOcupacao {...p} />;
    case "financiamento":
      return <ControleFinanciamento {...p} />;
    case "nota":
      return <ControleNota {...p} />;
    case "metro":
      return <ControleMetro {...p} />;
    case "q":
      return null;
  }
}

/** Limpa um grupo (botões e pílulas). */
export const limparGrupo = (mudar: Mudar, g: GrupoFoco) => mudar((x) => removerGrupo(x, g));
