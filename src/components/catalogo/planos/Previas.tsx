import type { ComponentType } from "react";
import type { Recurso } from "@/lib/catalogo/tipos";

/**
 * Prévias DESENHADAS dos recursos da Luneta, para a chamada do Lente (RecursoLuneta). São formas fixas, as mesmas em
 * todo imóvel: nenhum número, nome ou texto do recurso de verdade (no Lente o servidor nem manda o dado), e nada que
 * mude de um imóvel para outro. Quem desenha borra, esmaece e esconde de leitores de tela.
 */

const traco = "block rounded-full bg-nevoa/30";
const trilho = "block rounded-full bg-nevoa/15";

/** Simulador: o cartão "Dê no máximo R$ ███" e a tabela de cenários × prazos (3 × 4). */
function Simulador() {
  const celulas = [1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1];
  return (
    <div className="flex items-start gap-4">
      <div className="flex w-[46%] min-w-0 flex-col gap-2.5 rounded-2xl border border-nevoa/30 p-3.5">
        <span className={`${traco} h-2 w-20`} />
        <span className="block h-6 w-[80%] rounded-lg bg-luar/35" />
        <span className={`${trilho} h-2 w-[60%]`} />
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">
        {celulas.map((ok, k) => (
          <span key={k} className={`block h-7 rounded-lg ${ok ? "bg-pos/30" : "bg-grave/25"} ${k === 5 ? "ring-2 ring-latao/70" : ""}`} />
        ))}
      </div>
    </div>
  );
}

/** Região: a régua de 5 níveis com um aceso e as linhas da tabela rua · bairro · cidade · estado. */
function Regiao() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid max-w-[22rem] grid-cols-5 gap-1">
        {[0, 1, 2, 3, 4].map((k) => (
          <span key={k} className={`block h-2 rounded-full ${k === 1 ? "bg-latao" : "bg-nevoa/25"}`} />
        ))}
      </div>
      {["w-[38%]", "w-[46%]", "w-[30%]", "w-[24%]"].map((w, k) => (
        <div key={k} className="flex items-center justify-between gap-4">
          <span className={`${traco} h-2.5 ${w}`} />
          <span className={`${trilho} h-2.5 w-16`} />
        </div>
      ))}
    </div>
  );
}

/** Portais: a fileira de botões de busca. */
function Portais() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <span key={k} className="block h-10 rounded-xl border border-nevoa/35 bg-nevoa/10" />
      ))}
    </div>
  );
}

/** Nota de localização: o anel (sem número) e as barras das partes da nota. */
function Localizacao() {
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 84 84" width="76" height="76" className="shrink-0">
        <circle cx="42" cy="42" r="34" fill="none" strokeWidth="8" className="stroke-nevoa/20" />
        <circle cx="42" cy="42" r="34" fill="none" strokeWidth="8" pathLength={1} strokeDasharray="0.68 1" strokeLinecap="round" transform="rotate(-90 42 42)" className="stroke-latao" />
        <rect x="28" y="36" width="28" height="12" rx="6" className="fill-luar/35" />
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {["78%", "52%", "64%", "36%", "58%"].map((w, k) => (
          <div key={k} className="flex items-center gap-3">
            <span className={`${traco} h-2 w-16 shrink-0`} />
            <span className={`relative ${trilho} h-2 flex-1 overflow-hidden`}>
              <span className="absolute inset-y-0 left-0 rounded-full bg-latao/80" style={{ width: w }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Uma folha A4 em miniatura (cabeçalho, número grande, linhas e, na segunda, a tabelinha). */
function Folha({ tabela = false }: { tabela?: boolean }) {
  return (
    <div className="flex aspect-[210/297] w-[68px] shrink-0 flex-col gap-1.5 rounded-[4px] border border-nevoa/35 bg-luar/[0.06] p-2">
      <span className="block h-1 w-1/2 rounded-full bg-latao/70" />
      {tabela ? (
        <div className="grid grid-cols-4 gap-0.5">
          {Array.from({ length: 12 }, (_, k) => (
            <span key={k} className={`block h-2 rounded-[2px] ${k % 3 ? "bg-pos/30" : "bg-grave/25"}`} />
          ))}
        </div>
      ) : (
        <span className="block h-3 w-[85%] rounded-sm bg-luar/30" />
      )}
      {["w-full", "w-[90%]", "w-[70%]", "w-[80%]"].map((w, k) => (
        <span key={k} className={`${trilho} h-1 ${w}`} />
      ))}
    </div>
  );
}

/** Relatório: duas folhas A4 em miniatura e as linhas do sumário. */
function Relatorio() {
  return (
    <div className="flex items-start gap-3">
      <Folha />
      <Folha tabela />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1 max-[379px]:hidden">
        {["w-[70%]", "w-[55%]", "w-[62%]", "w-[40%]"].map((w, k) => (
          <span key={k} className={`${traco} h-2 ${w}`} />
        ))}
      </div>
    </div>
  );
}

/** Tags: pílulas de larguras fixas (não entregam quais nem quantas tags o imóvel tem). */
function Tags() {
  return (
    <div className="flex flex-wrap gap-2">
      {["w-36", "w-28", "w-44", "w-24", "w-32", "w-40", "w-28"].map((w, k) => (
        <span key={k} className={`block h-[34px] shrink-0 rounded-full border border-nevoa/50 bg-nevoa/15 ${w}`} />
      ))}
    </div>
  );
}

/** Selos: três anéis (o desenho do selo, sem o nível) e o nome. */
function Selos() {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 40 40" width="40" height="40" className="shrink-0 stroke-latao" fill="none" strokeWidth="2.5">
        <circle cx="20" cy="20" r="18" />
        <circle cx="20" cy="20" r="11" />
        <circle cx="20" cy="20" r="3" className="fill-latao" stroke="none" />
      </svg>
      <span className={`${traco} h-3 w-24`} />
    </div>
  );
}

/** Filtros avançados: controles de faixa e marcadores. */
function Filtros() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-1">
        {[30, 55, 80, 65, 45, 70, 35, 50, 25, 40].map((h, k) => (
          <span key={k} className="block w-4 rounded-t bg-nevoa/25" style={{ height: h * 0.4 }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {["w-24", "w-32", "w-20", "w-28", "w-16"].map((w, k) => (
          <span key={k} className={`block h-9 rounded-full border border-nevoa/40 bg-nevoa/10 ${w}`} />
        ))}
      </div>
    </div>
  );
}

const PREVIA: Partial<Record<Recurso, ComponentType>> = {
  simulador: Simulador,
  relatorio: Relatorio,
  regiao: Regiao,
  portais: Portais,
  localizacao: Localizacao,
  tags: Tags,
  selos: Selos,
  filtrosAvancados: Filtros,
};

/** O desenho de um recurso (os que não têm desenho próprio usam os marcadores dos filtros). */
export function PreviaRecurso({ recurso }: { recurso: Recurso }) {
  const Desenho = PREVIA[recurso] ?? Filtros;
  return <Desenho />;
}
