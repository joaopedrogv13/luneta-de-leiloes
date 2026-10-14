"use client";

import { multiplicador, type Modelo } from "@/lib/simulador/premissas";
import { CENARIOS, type Celula, type Meta, type Simulacao, type TipoMeta } from "@/lib/simulador/tipos";
import { CampoNumero, FOCO_RESULTADO, IconeAtencao, IconeOk, SeletorInline } from "./controles";
import { meses, moeda, moedaCurta, moedaCurtaSinal, pct, porArea } from "./formato";

export const CENARIO_ROTULO = { conservador: "Conservador", base: "Base", otimista: "Otimista" } as const;

const META_OPCOES: { valor: TipoMeta; rotulo: string }[] = [
  { valor: "roi_aa", rotulo: "% ao ano" },
  { valor: "roi_periodo", rotulo: "% no período" },
  { valor: "lucro", rotulo: "de lucro" },
];

/** A meta por extenso ("20% ao ano", "R$ 50.000 de lucro"). */
export function metaPorExtenso(m: Meta) {
  if (m.tipo === "lucro") return `${moeda(m.valor)} de lucro`;
  return `${pct(m.valor)} ${m.tipo === "roi_aa" ? "ao ano" : "no período"}`;
}

/** De onde vem o valor de venda, curto ("da avaliação", "do valor informado por você"). */
export function baseDaVenda(modelo: Modelo) {
  const o = modelo.origemVenda;
  if (o.tipo === "avaliacao") return "da avaliação";
  if (o.tipo === "referencia") return "da referência da região";
  return "do valor que você informou";
}

/**
 * O cartão-resposta do topo: "Seu lance máximo: R$ X", com a meta, o prazo e o cenário editáveis na própria
 * frase, a régua lance mínimo × teto e o resultado com o lance mínimo atual.
 */
export function CartaoResposta({
  modelo,
  meta,
  celula,
  teto,
  comLanceMinimo,
  aoMudarMeta,
  aoMudarCelula,
}: {
  modelo: Modelo;
  meta: Meta;
  celula: Celula;
  teto: number | null;
  comLanceMinimo: Simulacao;
  aoMudarMeta: (m: Meta) => void;
  aoMudarCelula: (c: Celula) => void;
}) {
  const p = modelo.premissas;
  const lance = modelo.entrada.lance;
  const prazo = p.prazos[celula.prazo];
  const venda = (p.valorVenda ?? 0) * multiplicador(p, celula.cenario);
  const folga = teto !== null ? teto - lance : null;

  const trocarTipo = (tipo: TipoMeta) => {
    if (tipo === meta.tipo) return;
    if (tipo === "lucro") aoMudarMeta({ tipo, valor: Math.max(1000, Math.round((lance * 0.2) / 1000) * 1000) });
    else aoMudarMeta({ tipo, valor: meta.tipo === "lucro" ? 0.2 : meta.valor });
  };

  const resumo =
    teto === null
      ? `Nenhum lance atinge ${metaPorExtenso(meta)} vendendo em ${meses(prazo)} no cenário ${CENARIO_ROTULO[celula.cenario].toLowerCase()}.`
      : `Lance máximo: ${moeda(teto)}, para ${metaPorExtenso(meta)} vendendo em ${meses(prazo)} no cenário ${CENARIO_ROTULO[celula.cenario].toLowerCase()}. ` +
        (folga! >= 0
          ? `O lance mínimo está ${moeda(folga!)} abaixo do seu teto.`
          : `O lance mínimo está ${moeda(-folga!)} acima do seu teto: não atinge sua meta.`);

  return (
    <div className="@container relative overflow-hidden rounded-3xl border border-latao/45 bg-tinta p-5 sm:p-7 in-data-[theme=light]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_12px_32px_rgba(15,24,48,.07)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-[radial-gradient(closest-side,rgba(201,162,77,.18),transparent)]"
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {resumo}
      </p>

      <p id={FOCO_RESULTADO} tabIndex={-1} className="text-[13px] font-semibold tracking-[0.12em] text-nevoa uppercase">
        Seu lance máximo
      </p>
      <p
        className="mt-2 font-display leading-none font-bold tracking-[-0.035em] [--max:44px] sm:[--max:60px]"
        // o número encolhe para caber na largura do cartão ("R$ 17.638.267" num celular de 320 px)
        style={{ fontSize: teto === null ? undefined : `min(var(--max), ${(100 / (moeda(teto).length * 0.6)).toFixed(2)}cqi)` }}
      >
        {teto === null ? <span className="text-[30px] tracking-[-0.02em] text-nevoa sm:text-[38px]">Nenhum lance atinge</span> : moeda(teto)}
      </p>

      <p className="mt-4 text-[15px] leading-[2.9rem] sm:leading-[2.6rem]">
        <span className="whitespace-nowrap">
          <span className="text-nevoa">para ganhar </span>
          <CampoNumero
            variante="inline"
            valor={meta.tipo === "lucro" ? meta.valor : Math.round(meta.valor * 1000) / 10}
            casas={meta.tipo === "lucro" ? 0 : 1}
            min={0}
            max={meta.tipo === "lucro" ? 1e10 : 1000}
            passo={meta.tipo === "lucro" ? 1000 : 1}
            prefixo={meta.tipo === "lucro" ? "R$" : undefined}
            larguraMin={2}
            ariaLabel={meta.tipo === "lucro" ? "Meta de lucro em reais" : `Meta de retorno em % ${meta.tipo === "roi_aa" ? "ao ano" : "no período"}`}
            aoMudar={(n) => aoMudarMeta({ tipo: meta.tipo, valor: meta.tipo === "lucro" ? n : n / 100 })}
          />
        </span>{" "}
        <SeletorInline valor={meta.tipo} opcoes={META_OPCOES} aoMudar={trocarTipo} ariaLabel="Tipo de meta" />{" "}
        <span className="whitespace-nowrap">
          <span className="text-nevoa">vendendo em </span>
          <SeletorInline
            valor={String(celula.prazo)}
            opcoes={p.prazos.map((m, i) => ({ valor: String(i), rotulo: meses(m) }))}
            aoMudar={(v) => aoMudarCelula({ ...celula, prazo: Number(v) })}
            ariaLabel="Prazo de venda"
          />
        </span>{" "}
        <span className="whitespace-nowrap">
          <span className="text-nevoa">no cenário </span>
          <SeletorInline
            valor={celula.cenario}
            opcoes={CENARIOS.map((c) => ({ valor: c, rotulo: CENARIO_ROTULO[c].toLowerCase() }))}
            aoMudar={(c) => aoMudarCelula({ ...celula, cenario: c })}
            ariaLabel="Cenário de venda"
          />
        </span>
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-nevoa">
        Venda por {moeda(venda)}
        {p.areaEstimada ? "" : ` (${porArea(venda / p.area, modelo.entrada.tipo)})`}, {pct(multiplicador(p, celula.cenario), 0)} {baseDaVenda(modelo)}, {meses(prazo)}{" "}
        depois da compra.
      </p>

      <Regua lance={lance} teto={teto} />

      <div className="flex gap-2.5 text-[14px] leading-relaxed">
        {teto === null ? (
          <>
            <IconeAtencao className="mt-0.5 text-aten" />
            <p>
              <strong className="font-semibold">Nenhum lance atinge a meta neste cenário.</strong>{" "}
              <span className="text-nevoa">Tente uma meta menor, outro prazo ou outro cenário, ou revise as premissas abaixo.</span>
            </p>
          </>
        ) : folga! >= 0 ? (
          <>
            <IconeOk className="mt-1 size-3.5 text-pos" />
            <p>
              O lance mínimo atual ({moeda(lance)}) está <strong className="font-semibold">{moeda(folga!)} abaixo do seu teto</strong>
              <span className="text-nevoa">{lance > 0 ? `: dá para subir até ${pct(teto! / lance - 1, 0)} na disputa e ainda atingir a meta.` : "."}</span>
            </p>
          </>
        ) : (
          <>
            <IconeAtencao className="mt-0.5 text-aten" />
            <p>
              O lance mínimo atual ({moeda(lance)}) está <strong className="font-semibold">{moeda(-folga!)} acima do seu teto</strong>
              <span className="text-nevoa">: não atinge sua meta neste cenário.</span>
            </p>
          </>
        )}
      </div>

      <div className="mt-5 border-t border-nevoa/15 pt-4">
        <p className="text-[12px] font-medium text-nevoa">Com o lance mínimo atual ({moedaCurta(lance)}), neste cenário e prazo:</p>
        <dl className="mt-2 grid grid-cols-3 gap-2">
          <Numero
            rotulo={comLanceMinimo.lucro >= 0 ? "Lucro" : "Prejuízo"}
            valor={moedaCurtaSinal(comLanceMinimo.lucro)}
            tom={comLanceMinimo.lucro < 0 ? "grave" : undefined}
          />
          <Numero rotulo="Retorno ao ano" valor={pct(comLanceMinimo.roiAA)} tom={comLanceMinimo.roiAA < 0 ? "grave" : undefined} />
          <Numero rotulo="Investimento" valor={moedaCurta(comLanceMinimo.capital)} />
        </dl>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "grave" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] leading-tight text-nevoa">{rotulo}</dt>
      <dd className={`mt-1 font-display text-[18px] leading-tight font-bold tracking-[-0.01em] sm:text-[20px] ${tom === "grave" ? "text-grave-texto" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}

/** Régua 0 → teto, com o lance mínimo marcado: a folga (ou o excesso) aparece entre os dois. Só visual (o texto ao lado diz o mesmo). */
function Regua({ lance, teto }: { lance: number; teto: number | null }) {
  const max = Math.max(lance, teto ?? 0) * 1.15 || 1;
  const pos = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  const alinhar = (p: number) => (p > 72 ? "-translate-x-full text-right" : p < 18 ? "" : "-translate-x-1/2 text-center");
  const pl = pos(lance);
  const pt = teto !== null ? pos(teto) : null;
  return (
    <div aria-hidden="true" className="relative mt-7 mb-6 select-none">
      {pt !== null && (
        <div className={`absolute bottom-full mb-2 text-[11.5px] leading-tight whitespace-nowrap ${alinhar(pt)}`} style={{ left: `${pt}%` }}>
          <span className="font-semibold text-latao-texto">Seu teto</span> <span className="tabular-nums">{moedaCurta(teto!)}</span>
        </div>
      )}
      <div className="relative h-2.5 rounded-full bg-nevoa/20">
        {pt !== null && <div className="absolute inset-y-0 left-0 rounded-full bg-latao/30" style={{ width: `${pt}%` }} />}
        {pt !== null && lance <= teto! && <div className="absolute inset-y-0 rounded-r-full bg-pos/60" style={{ left: `${pl}%`, width: `${pt - pl}%` }} />}
        {pt !== null && lance > teto! && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(135deg,var(--grave)_0_3px,transparent_3px_6px)] opacity-80"
            style={{ left: `${pt}%`, width: `${pl - pt}%` }}
          />
        )}
        {pt !== null && <div className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-latao" style={{ left: `${pt}%` }} />}
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-tinta bg-luar shadow-[0_0_0_1px_rgba(var(--fog-rgb),.5)]"
          style={{ left: `${pl}%` }}
        />
      </div>
      <div className={`absolute top-full mt-2 text-[11.5px] leading-tight whitespace-nowrap ${alinhar(pl)}`} style={{ left: `${pl}%` }}>
        <span className="font-semibold">Lance mínimo</span> <span className="text-nevoa tabular-nums">{moedaCurta(lance)}</span>
      </div>
    </div>
  );
}
