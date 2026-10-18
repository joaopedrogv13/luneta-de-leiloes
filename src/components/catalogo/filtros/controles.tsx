"use client";

/**
 * Os controles de cada filtro, ligados a Filtros: os mesmos nos pop-ups rápidos (aplicam na hora) e no
 * painel "Todos os filtros" (mexem no rascunho). Cada um recebe os filtros atuais, as facetas e um
 * `aplicar` (ver useAplicador).
 */
import { useId, useState, type ReactNode } from "react";
import {
  NATUREZA_ROTULO,
  OCUPACAO_FILTRO_ROTULO,
  cidadeDaChave,
  definirBairros,
  definirCidades,
  definirUfs,
  nomeCidade,
  nomeCurto,
  nomeTag,
  nomeUf,
  removerFiltro,
  type FormatoFaixa,
} from "@/lib/catalogo/filtros-rotulos";
import { MODALIDADE_ROTULO, PRACA_ROTULO, SELO_ROTULO, TIPO_ROTULO, numero } from "@/lib/catalogo/rotulos";
import { NAO_INFORMADO, type Facetas, type Filtros, type OpcaoFaceta, type Severidade } from "@/lib/catalogo/tipos";
import { CampoFaixa, type AtalhoFaixa } from "../ui/CampoFaixa";
import { Chips, type OpcaoChip } from "../ui/Chips";
import { AJUDA, CAMPO, ROTULO } from "../ui/estilos";
import { IconeSeveridade } from "../ui/icones";
import { SelecaoMultipla, type OpcaoSelecao } from "../ui/SelecaoMultipla";
import { TriEstado } from "../ui/TriEstado";
import type { Aplicar } from "./useAplicador";

export interface PropsControle {
  f: Filtros;
  facetas: Facetas;
  aplicar: Aplicar;
}

/** Junta as opções das facetas com as escolhidas que não vieram nelas (contagem 0, mas visíveis para desmarcar). */
function comEscolhidas(opcoes: readonly OpcaoFaceta[], escolhidas: readonly string[] | undefined, rotular: (v: string) => string): OpcaoFaceta[] {
  const saida = [...opcoes];
  const tem = new Set(opcoes.map((o) => o.valor));
  for (const v of escolhidas ?? []) if (!tem.has(v)) saida.push({ valor: v, rotulo: rotular(v), total: 0 });
  return saida;
}

/** Bloco com rótulo, ajuda e controle. */
export function Campo({ rotulo, ajuda, children, acao }: { rotulo?: string; ajuda?: ReactNode; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {(rotulo || acao) && (
        <div className="flex items-center justify-between gap-3">
          {rotulo && <span className={ROTULO}>{rotulo}</span>}
          {acao}
        </div>
      )}
      {ajuda && <p className={`-mt-1 ${AJUDA}`}>{ajuda}</p>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Localização
// ---------------------------------------------------------------------------

export function opcoesUf(facetas: Facetas, f: Filtros): OpcaoSelecao[] {
  return comEscolhidas(facetas.uf, f.uf, (v) => v).map((o) => ({
    valor: o.valor,
    rotulo: nomeUf(o.valor),
    detalhe: o.valor,
    total: o.total,
    sinonimos: o.rotulo,
  }));
}

export function opcoesCidade(facetas: Facetas, f: Filtros): OpcaoSelecao[] {
  const ufs = new Set(f.uf ?? []);
  const escolhidas = new Set(f.cidade ?? []);
  // escolhida fica sempre na lista (para desmarcar), mesmo de um estado fora da lista de estados
  return comEscolhidas(facetas.cidade, f.cidade, nomeCidade)
    .filter((o) => escolhidas.has(o.valor) || !ufs.size || ufs.has(o.valor.split("|")[0]))
    .map((o) => ({ valor: o.valor, rotulo: nomeCurto(o.valor), detalhe: o.valor.split("|")[0], total: o.total }));
}

export function opcoesBairro(facetas: Facetas, f: Filtros): OpcaoSelecao[] {
  const cidades = new Set(f.cidade ?? []);
  const escolhidos = new Set(f.bairro ?? []);
  const variasCidades = cidades.size > 1 || new Set([...escolhidos].map(cidadeDaChave)).size > 1;
  return comEscolhidas(facetas.bairro, f.bairro, nomeCurto)
    .filter((o) => escolhidos.has(o.valor) || !cidades.size || cidades.has(cidadeDaChave(o.valor)))
    .map((o) => ({
      valor: o.valor,
      rotulo: nomeCurto(o.valor),
      detalhe: variasCidades ? nomeCidade(cidadeDaChave(o.valor)) : undefined,
      total: o.total,
    }));
}

export function ControleEstados({ f, facetas, aplicar, focarBusca, alturaLista, lote }: PropsControle & { focarBusca?: boolean; alturaLista?: string; lote?: number }) {
  return (
    <SelecaoMultipla
      rotulo="Estados"
      placeholder="Buscar estado ou sigla"
      opcoes={opcoesUf(facetas, f)}
      selecionados={f.uf ?? []}
      onChange={(v) => aplicar("uf", (x) => definirUfs(x, v))}
      unidade={["estado", "estados"]}
      focarBusca={focarBusca}
      alturaLista={alturaLista}
      loteInicial={lote}
    />
  );
}

export function ControleCidades({
  f,
  facetas,
  aplicar,
  focarBusca,
  alturaLista,
  ufsSemCidades,
  vazio,
  lote,
}: PropsControle & { focarBusca?: boolean; alturaLista?: string; ufsSemCidades?: string[]; vazio?: string; lote?: number }) {
  const opcoes = opcoesCidade(facetas, f);
  const ufs = f.uf ?? [];
  return (
    <SelecaoMultipla
      rotulo="Cidades"
      placeholder={ufs.length === 1 ? `Buscar cidade em ${ufs[0]}` : "Buscar cidade"}
      opcoes={opcoes}
      selecionados={f.cidade ?? []}
      onChange={(v) => aplicar("cidade", (x) => definirCidades(x, v))}
      unidade={["cidade", "cidades"]}
      feminino
      focarBusca={focarBusca}
      alturaLista={alturaLista}
      loteInicial={lote}
      vazio={vazio}
      aviso={
        ufsSemCidades?.length ? (
          <p className="rounded-xl border border-nevoa/20 bg-nevoa/[0.06] px-3 py-2 text-xs leading-snug text-nevoa">
            As cidades de {ufsSemCidades.join(", ")} aparecem depois de aplicar os filtros.
          </p>
        ) : undefined
      }
    />
  );
}

/**
 * Bairros das cidades escolhidas. `semBairros`: o texto quando as facetas ainda não trazem bairro nenhum
 * (padrão: eles aparecem depois de aplicar; quem tem as facetas do rascunho ou está buscando diz outra coisa).
 */
export function ControleBairros({
  f,
  facetas,
  aplicar,
  alturaLista,
  focarBusca,
  semBairros = "Os bairros das cidades escolhidas aparecem depois de aplicar os filtros.",
  lote,
}: PropsControle & { alturaLista?: string; focarBusca?: boolean; semBairros?: string; lote?: number }) {
  const cidades = f.cidade ?? [];
  if (!cidades.length && !(f.bairro ?? []).length) {
    return (
      <p className="rounded-2xl border border-dashed border-nevoa/30 px-4 py-3.5 text-[13px] leading-snug text-nevoa">
        Escolha uma cidade para ver os bairros.
      </p>
    );
  }
  const opcoes = opcoesBairro(facetas, f);
  const semNenhum = !opcoes.some((o) => o.total > 0) && !(f.bairro ?? []).length;
  return (
    <SelecaoMultipla
      rotulo="Bairros"
      placeholder={cidades.length === 1 ? `Buscar bairro em ${nomeCurto(cidades[0])}` : "Buscar bairro"}
      opcoes={opcoes}
      selecionados={f.bairro ?? []}
      onChange={(v) => aplicar("bairro", (x) => definirBairros(x, v))}
      unidade={["bairro", "bairros"]}
      focarBusca={focarBusca}
      alturaLista={alturaLista}
      loteInicial={lote}
      vazio={semNenhum ? semBairros : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// Tipo e listas de escolha
// ---------------------------------------------------------------------------

export function ControleTipo({ f, facetas, aplicar }: PropsControle) {
  const opcoes: OpcaoChip[] = comEscolhidas(facetas.tipo, f.tipo, (v) => v).map((o) => ({
    valor: o.valor,
    rotulo: TIPO_ROTULO[o.valor as keyof typeof TIPO_ROTULO] ?? o.rotulo,
    total: o.total,
  }));
  return (
    <Chips
      rotulo="Tipo de imóvel"
      opcoes={opcoes}
      valor={f.tipo ?? []}
      onChange={(v) => aplicar("tipo", (x) => ({ ...removerFiltro(x, "tipo"), ...(v.length ? { tipo: v as Filtros["tipo"] } : {}) }))}
    />
  );
}

type ChaveLista = "modalidade" | "praca" | "ocupacao" | "natureza" | "fonte";

const ROTULAR: Record<ChaveLista, (v: string, o?: OpcaoFaceta) => string> = {
  modalidade: (v, o) => MODALIDADE_ROTULO[v as keyof typeof MODALIDADE_ROTULO] ?? o?.rotulo ?? v,
  praca: (v, o) => (v === NAO_INFORMADO ? "Não informada" : (PRACA_ROTULO[v as keyof typeof PRACA_ROTULO] ?? o?.rotulo ?? v)),
  ocupacao: (v, o) => OCUPACAO_FILTRO_ROTULO[v as keyof typeof OCUPACAO_FILTRO_ROTULO] ?? o?.rotulo ?? v,
  natureza: (v, o) => NATUREZA_ROTULO[v as keyof typeof NATUREZA_ROTULO] ?? o?.rotulo ?? v,
  fonte: (v, o) => o?.rotulo ?? v,
};

const NOME_LISTA: Record<ChaveLista, string> = {
  modalidade: "Modalidade",
  praca: "Praça",
  ocupacao: "Ocupação",
  natureza: "Natureza",
  fonte: "Fonte",
};

/** Listas com ordem natural (não pela contagem): 1ª antes de 2ª, "não informada" por último. */
const ORDEM_NATURAL: Partial<Record<ChaveLista, readonly string[]>> = {
  praca: ["1", "2", "unica", NAO_INFORMADO],
  ocupacao: ["desocupado", "ocupado", NAO_INFORMADO],
  natureza: ["judicial", "extrajudicial", NAO_INFORMADO],
};

export function ControleLista({ f, facetas, aplicar, chave }: PropsControle & { chave: ChaveLista }) {
  const escolhidas = (f[chave] ?? []) as string[];
  const ordem = ORDEM_NATURAL[chave];
  const brutas = comEscolhidas(facetas[chave], escolhidas, (v) => ROTULAR[chave](v));
  if (ordem) brutas.sort((a, b) => (ordem.indexOf(a.valor) + 1 || 99) - (ordem.indexOf(b.valor) + 1 || 99));
  const opcoes: OpcaoChip[] = brutas.map((o) => ({
    valor: o.valor,
    rotulo: ROTULAR[chave](o.valor, o),
    total: o.total,
  }));
  return (
    <Chips
      rotulo={NOME_LISTA[chave]}
      opcoes={opcoes}
      valor={escolhidas}
      onChange={(v) => aplicar(chave, (x) => ({ ...removerFiltro(x, chave), ...(v.length ? { [chave]: v } : {}) }))}
    />
  );
}

// ---------------------------------------------------------------------------
// Faixas
// ---------------------------------------------------------------------------

type GrupoFaixa = "lance" | "avaliacao" | "desagio" | "lanceM2" | "area";

const FAIXA: Record<GrupoFaixa, { rotulo: string; formato: FormatoFaixa; min: keyof Filtros; max: keyof Filtros; atalhos: AtalhoFaixa[] }> = {
  lance: {
    rotulo: "Lance mínimo",
    formato: "moeda",
    min: "lanceMin",
    max: "lanceMax",
    atalhos: [
      { rotulo: "até R$ 100 mil", max: 100_000 },
      { rotulo: "até R$ 200 mil", max: 200_000 },
      { rotulo: "até R$ 300 mil", max: 300_000 },
      { rotulo: "até R$ 500 mil", max: 500_000 },
      { rotulo: "R$ 500 mil a 1 mi", min: 500_000, max: 1_000_000 },
      { rotulo: "acima de R$ 1 mi", min: 1_000_000 },
    ],
  },
  avaliacao: {
    rotulo: "Avaliação",
    formato: "moeda",
    min: "avaliacaoMin",
    max: "avaliacaoMax",
    atalhos: [
      { rotulo: "até R$ 200 mil", max: 200_000 },
      { rotulo: "até R$ 500 mil", max: 500_000 },
      { rotulo: "R$ 500 mil a 1 mi", min: 500_000, max: 1_000_000 },
      { rotulo: "acima de R$ 1 mi", min: 1_000_000 },
    ],
  },
  desagio: {
    rotulo: "Deságio",
    formato: "desagio",
    min: "desagioMin",
    max: "desagioMax",
    atalhos: [
      { rotulo: "≥ 20%", min: 20 },
      { rotulo: "≥ 30%", min: 30 },
      { rotulo: "≥ 40%", min: 40 },
      { rotulo: "≥ 50%", min: 50 },
      { rotulo: "≥ 60%", min: 60 },
    ],
  },
  lanceM2: {
    rotulo: "Lance por m²",
    formato: "moedaM2",
    min: "lanceM2Min",
    max: "lanceM2Max",
    atalhos: [
      { rotulo: "até R$ 1 mil/m²", max: 1000 },
      { rotulo: "até R$ 2 mil/m²", max: 2000 },
      { rotulo: "até R$ 3 mil/m²", max: 3000 },
      { rotulo: "até R$ 5 mil/m²", max: 5000 },
    ],
  },
  area: {
    rotulo: "Área",
    formato: "m2",
    min: "areaMin",
    max: "areaMax",
    atalhos: [
      { rotulo: "até 50 m²", max: 50 },
      { rotulo: "50 a 100 m²", min: 50, max: 100 },
      { rotulo: "100 a 200 m²", min: 100, max: 200 },
      { rotulo: "acima de 200 m²", min: 200 },
    ],
  },
};

const HISTOGRAMA: Record<GrupoFaixa, keyof Pick<Facetas, "lance" | "avaliacao" | "desagio" | "lanceM2" | "area">> = {
  lance: "lance",
  avaliacao: "avaliacao",
  desagio: "desagio",
  lanceM2: "lanceM2",
  area: "area",
};

export function ControleFaixa({
  f,
  facetas,
  aplicar,
  grupo,
  adiar = false,
  rotuloVisivel = true,
}: PropsControle & { grupo: GrupoFaixa; adiar?: boolean; rotuloVisivel?: boolean }) {
  const c = FAIXA[grupo];
  return (
    <CampoFaixa
      rotulo={c.rotulo}
      rotuloVisivel={rotuloVisivel}
      histograma={facetas[HISTOGRAMA[grupo]]}
      min={f[c.min] as number | undefined}
      max={f[c.max] as number | undefined}
      formato={c.formato}
      atalhos={c.atalhos}
      onChange={(min, max) =>
        aplicar(
          grupo,
          (x) => {
            const novo: Filtros = { ...removerFiltro(x, grupo) };
            if (min !== undefined) (novo as Record<string, unknown>)[c.min] = min;
            if (max !== undefined) (novo as Record<string, unknown>)[c.max] = max;
            return novo;
          },
          { adiar },
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Quartos e vagas ("pelo menos N")
// ---------------------------------------------------------------------------

export function ControleMinimo({ f, aplicar, grupo }: Omit<PropsControle, "facetas"> & { grupo: "quartos" | "vagas" }) {
  const chave = grupo === "quartos" ? "quartosMin" : "vagasMin";
  const ate = grupo === "quartos" ? 4 : 3;
  const opcoes: OpcaoChip[] = [{ valor: "", rotulo: "Qualquer", neutro: true }];
  for (let n = 1; n <= ate; n++) opcoes.push({ valor: String(n), rotulo: `${n}+` });
  const atual = f[chave];
  return (
    <Chips
      rotulo={grupo === "quartos" ? "Quartos (pelo menos)" : "Vagas (pelo menos)"}
      multiplo={false}
      permitirVazio={false}
      opcoes={opcoes}
      valor={[atual === undefined ? "" : String(atual)]}
      onChange={([v]) => aplicar(grupo, (x) => ({ ...removerFiltro(x, grupo), ...(v ? { [chave]: Number(v) } : {}) }))}
    />
  );
}

// ---------------------------------------------------------------------------
// Sim / não
// ---------------------------------------------------------------------------

const SIM_NAO = {
  financiamento: { rotulo: "Aceita financiamento", rotulos: ["Qualquer", "Sim", "Não"] as const },
  fgts: { rotulo: "Aceita FGTS", rotulos: ["Qualquer", "Sim", "Não"] as const },
  parcelamento: { rotulo: "Aceita parcelamento", rotulos: ["Qualquer", "Sim", "Não"] as const },
  comFoto: { rotulo: "Foto do anúncio", rotulos: ["Qualquer", "Com foto", "Sem foto"] as const },
};

export function ControleSimNao({ f, facetas, aplicar, chave, ajuda }: PropsControle & { chave: keyof typeof SIM_NAO; ajuda?: string }) {
  const c = SIM_NAO[chave];
  return (
    <TriEstado
      rotulo={c.rotulo}
      rotulos={c.rotulos}
      valor={f[chave]}
      totalSim={facetas[chave]}
      ajuda={ajuda}
      onChange={(v) => aplicar(chave, (x) => ({ ...removerFiltro(x, chave), ...(v === undefined ? {} : { [chave]: v }) }))}
    />
  );
}

// ---------------------------------------------------------------------------
// Riscos (tags) e selo: só no plano Luneta
// ---------------------------------------------------------------------------

const COR_SEVERIDADE: Record<Severidade, string> = {
  grave: "text-grave-texto",
  atencao: "text-aten",
  positivo: "text-pos",
  info: "text-nevoa",
};

const PREFIXO_SR: Record<Severidade, string> = {
  grave: "Risco grave: ",
  atencao: "Atenção: ",
  positivo: "Ponto positivo: ",
  info: "Informativo: ",
};

/**
 * Faceta de tag do servidor: `total` conta a tag CONFIRMADA (o que "Só imóveis com…" daria) e, quando
 * vem, `comRevisao` conta confirmada ou em revisão (o que "Esconder imóveis com…" tira). Lido de forma
 * opcional: o contrato pode ainda não trazer o campo.
 */
type TagFaceta = Facetas["tags"][number] & { comRevisao?: number };

export function ControleTags({
  f,
  facetas,
  aplicar,
  modo,
  severidades,
  rotulo,
}: PropsControle & { modo: "semTags" | "comTags"; severidades: readonly Severidade[]; rotulo: string }) {
  const escolhidas = f[modo] ?? [];
  const opcoes: OpcaoChip[] = (facetas.tags as TagFaceta[])
    .filter((t) => severidades.includes(t.severidade))
    .map((t) => ({
      valor: t.valor,
      rotulo: t.rotulo,
      // esconder vale também para as tags em revisão: a contagem é a de quantos saem
      total: modo === "semTags" ? (t.comRevisao ?? t.total) : t.total,
      prefixoSr: PREFIXO_SR[t.severidade],
      icone: <IconeSeveridade severidade={t.severidade} className={COR_SEVERIDADE[t.severidade]} />,
    }));
  for (const v of escolhidas) {
    if (!opcoes.some((o) => o.valor === v)) opcoes.push({ valor: v, rotulo: nomeTag(v, facetas), total: 0 });
  }
  return (
    <Chips
      rotulo={rotulo}
      opcoes={opcoes}
      valor={escolhidas}
      vazio="Nenhum imóvel desta busca tem essas tags."
      onChange={(v) => aplicar(modo, (x) => ({ ...removerFiltro(x, modo), ...(v.length ? { [modo]: v } : {}) }))}
    />
  );
}

export function ControleSelo({ f, facetas, aplicar, desabilitado = false }: PropsControle & { desabilitado?: boolean }) {
  const porValor = new Map(facetas.selo.map((o) => [o.valor, o.total]));
  const opcoes: OpcaoChip[] = (["3", "2", "1"] as const).map((v) => ({
    valor: v,
    rotulo: SELO_ROTULO[Number(v) as 1 | 2 | 3],
    total: desabilitado ? undefined : (porValor.get(v) ?? 0),
  }));
  return (
    <Chips
      rotulo="Selo"
      opcoes={opcoes}
      ocultarZerados={!desabilitado}
      desabilitado={desabilitado}
      valor={(f.selo ?? []).map(String)}
      vazio="Nenhum imóvel com selo nesta busca."
      onChange={(v) => aplicar("selo", (x) => ({ ...removerFiltro(x, "selo"), ...(v.length ? { selo: v.map(Number) as Filtros["selo"] } : {}) }))}
    />
  );
}

// ---------------------------------------------------------------------------
// Nota de localização (Luneta)
// ---------------------------------------------------------------------------

/** Mínimos prontos da nota de localização (o resto, a pessoa digita). */
export const MINIMOS_NOTA = [40, 60, 80] as const;
const ehPronto = (n: number | undefined) => n !== undefined && (MINIMOS_NOTA as readonly number[]).includes(n);

/**
 * Nota de localização mínima: "Qualquer", "40 ou mais", "60 ou mais", "80 ou mais" (com quantos imóveis cada um daria,
 * pela faceta `notaLocal`) ou um valor livre de 1 a 100. Imóvel sem nota não passa no filtro.
 */
export function ControleNotaLocal({ f, facetas, aplicar }: PropsControle) {
  const atual = f.notaLocalMin;
  const contagem = facetas.notaLocal && facetas.notaLocal.length === 101 ? facetas.notaLocal : null;
  const quantos = (t: number) => (contagem ? contagem[Math.min(100, Math.max(0, t))] : undefined);
  const [texto, setTexto] = useState(atual !== undefined && !ehPronto(atual) ? String(atual) : "");
  const [antes, setAntes] = useState(atual);
  // o valor mudou por fora (chip, "Limpar", pílula): o campo acompanha, sem apagar o que a pessoa digita
  if (atual !== antes) {
    setAntes(atual);
    const digitado = texto.trim() === "" ? undefined : Number(texto);
    if (digitado !== atual) setTexto(atual !== undefined && !ehPronto(atual) ? String(atual) : "");
  }
  const definir = (n: number | undefined) =>
    aplicar("notaLocal", (x) => ({ ...removerFiltro(x, "notaLocal"), ...(n !== undefined && n >= 1 ? { notaLocalMin: Math.min(100, Math.round(n)) } : {}) }));
  const opcoes: OpcaoChip[] = [
    { valor: "", rotulo: "Qualquer", neutro: true },
    ...MINIMOS_NOTA.map((t) => ({ valor: String(t), rotulo: `${t} ou mais`, total: quantos(t) })),
  ];
  const escolhido = atual === undefined ? "" : ehPronto(atual) ? String(atual) : "livre";
  const idCampo = useId();
  return (
    <div className="flex flex-col gap-3">
      <Chips
        rotulo="Nota de localização mínima"
        multiplo={false}
        permitirVazio={false}
        ocultarZerados={false}
        opcoes={opcoes}
        valor={[escolhido]}
        onChange={([v]) => {
          setTexto("");
          definir(v ? Number(v) : undefined);
        }}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={idCampo} className="text-[13px] text-nevoa">
          Ou digite a nota mínima (1 a 100):
        </label>
        <input
          id={idCampo}
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          value={texto}
          placeholder="ex.: 70"
          onChange={(e) => {
            const t = e.target.value;
            setTexto(t);
            const n = t.trim() === "" ? undefined : Number(t);
            definir(n !== undefined && Number.isFinite(n) ? n : undefined);
          }}
          className={`${CAMPO} w-28!`}
        />
      </div>
      {atual !== undefined && quantos(atual) !== undefined && (
        <p className={AJUDA} aria-live="polite">
          {textoImoveis(quantos(atual)!)} com nota {atual} ou mais nesta busca.
        </p>
      )}
    </div>
  );
}

/** "12.345 imóveis" para rodapés e avisos. */
export function textoImoveis(n: number) {
  return `${numero(n)} ${n === 1 ? "imóvel" : "imóveis"}`;
}
