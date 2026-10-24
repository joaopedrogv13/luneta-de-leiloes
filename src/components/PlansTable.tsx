import { PLANS, type PlanFeature, type PlanId, type PlanValue } from "@/content/site";
import { PlansCompare } from "@/components/PlansCompare";
import { RichText } from "@/components/ui/RichText";
import { SeloCancelamento } from "@/components/ui/SeloCancelamento";

const PREV: Record<PlanId, PlanId | null> = { lente: null, luneta: "lente", telescopio: "luneta" };

// Ordem dos cartões: no DOM a Luneta (destacada) vem primeiro, que é a ordem do celular (uma coluna);
// assim leitura e foco seguem o que se vê. A partir de lg, order devolve Lente → Luneta → Telescópio e
// reading-flow (onde houver suporte) faz o Tab e o leitor de tela seguirem essa ordem visual.
const LG_ORDER = ["lg:order-1", "lg:order-2", "lg:order-3"] as const;
const CARDS = PLANS.plans.map((p, i) => ({ ...p, lgOrder: LG_ORDER[i] })).sort((a, b) => Number(b.featured) - Number(a.featured));

/** Os grupos da tabela, na ordem das linhas (Encontrar · Decidir · Acompanhar · Equipe). */
const GRUPOS = PLANS.features.reduce<{ grupo: PlanFeature["grupo"]; linhas: PlanFeature[] }[]>((acc, f) => {
  const ultimo = acc[acc.length - 1];
  if (ultimo?.grupo === f.grupo) ultimo.linhas.push(f);
  else acc.push({ grupo: f.grupo, linhas: [f] });
  return acc;
}, []);

/**
 * As linhas de um cartão: o rótulo curto (`cartao`, ou o da tabela) e o valor no plano. Linhas com o mesmo rótulo curto
 * viram uma só ("Tags de risco" e "Selos" → "Tags de risco e selos"), com o valor da primeira.
 */
function linhasDoCartao(features: readonly PlanFeature[], plano: PlanId): { rotulo: string; valor: PlanValue }[] {
  const vistas = new Set<string>();
  const saida: { rotulo: string; valor: PlanValue }[] = [];
  for (const f of features) {
    const rotulo = f.cartao ?? f.label;
    if (vistas.has(rotulo)) continue;
    vistas.add(rotulo);
    saida.push({ rotulo, valor: f[plano] });
  }
  return saida;
}

/** Ícone do plano: o alcance do instrumento (lente 1 anel, luneta 2, telescópio 3). */
function PlanIcon({ id }: { id: PlanId }) {
  const rings = id === "lente" ? [13] : id === "luneta" ? [13, 7] : [13, 9, 5];
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      {rings.map((r) => (
        <circle key={r} cx="15" cy="15" r={r} fill="none" stroke={id === "lente" ? "var(--nevoa)" : "#C9A24D"} strokeWidth="2" />
      ))}
    </svg>
  );
}

function Cell({ value, plan }: { value: PlanValue; plan: string }) {
  if (value === true)
    return (
      <span className="inline-flex text-latao-texto">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 9.5l3.5 3.5 7.5-8" />
        </svg>
        <span className="sr-only">Incluído no plano {plan}</span>
      </span>
    );
  return (
    <span className="text-nevoa">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Não incluído no plano {plan}</span>
    </span>
  );
}

/**
 * Planos Lente / Luneta / Telescópio. Cartões com preço e CTA (Luneta destacada com o selo
 * "Mais escolhido" e botão em latão; no celular ela vem primeiro) + tabela comparativa completa
 * (recolhida no celular, ver PlansCompare). Sem animação de entrada: quem chega aqui vê o preço na hora.
 * Sem pagamento real: os botões levam ao formulário com o plano escolhido marcado (data-intent).
 */
export function PlansTable() {
  return (
    <>
      {/* data-plan-cards: a barra de atalhos do celular some enquanto os cartões estão na tela */}
      <div data-plan-cards className="mt-10 grid items-stretch gap-4 sm:mt-16 lg:grid-cols-3 lg:[reading-flow:grid-order]">
        {CARDS.map((p) => {
          // Cada cartão lista só o que o plano acrescenta ao anterior ("Tudo da Lente" + novidades).
          const prev = PREV[p.id];
          // abaixo de lg a Luneta vem antes da Lente: ali "Tudo da Lente" vira a lista do que a Lente tem
          const prevAfter = !!prev && CARDS.findIndex((c) => c.id === prev) > CARDS.findIndex((c) => c.id === p.id);
          const highlights = linhasDoCartao(
            PLANS.features.filter((f) => f[p.id] !== false && (!prev || f[prev] !== true)),
            p.id,
          );
          return (
            <div
              key={p.id}
              className={`group relative flex flex-col rounded-3xl bg-tinta p-7 transition-[border-color,box-shadow] duration-300 sm:p-8 ${p.lgOrder} ${
                p.featured
                  ? "border-[1.5px] border-latao shadow-[0_0_0_1px_rgba(201,162,77,.25),0_30px_80px_rgba(0,0,0,.45),0_0_80px_rgba(201,162,77,.12)] lg:-translate-y-2"
                  : "border border-nevoa/20 hover:border-latao/55"
              }`}
            >
              {p.featured && (
                <p className="absolute -top-3.5 left-7 rounded-full bg-latao px-3 py-2 text-[11px] leading-none font-bold tracking-[0.12em] text-noite-fixa uppercase">
                  Mais escolhido
                </p>
              )}
              <h3 className="flex items-center gap-3 font-display text-2xl leading-none font-bold tracking-[-0.02em]">
                <PlanIcon id={p.id} />
                {p.name}
                <span className="sr-only"> ({p.tier})</span>
              </h3>
              <p className="mt-3.5 text-sm leading-normal text-nevoa">{p.audience}</p>
              <p className="mt-6 flex flex-wrap items-baseline gap-1">
                <span className={`text-base font-semibold ${p.featured ? "text-latao-texto" : "text-nevoa"}`}>R$</span>
                <span className="font-display text-[52px] leading-none font-bold tracking-[-0.04em]">
                  <RichText text={p.price} />
                </span>
                <span className="text-sm text-nevoa">{p.period}</span>
              </p>
              <ul className="my-7 flex flex-1 flex-col gap-3 text-sm leading-snug">
                {prev && (
                  <li className={`flex gap-2.5 ${prevAfter ? "max-lg:hidden" : ""}`}>
                    <span aria-hidden="true" className="font-bold text-latao-texto">
                      ✓
                    </span>
                    Tudo da {PLANS.plans.find((x) => x.id === prev)?.name}
                  </li>
                )}
                {prevAfter &&
                  linhasDoCartao(
                    PLANS.features.filter((f) => f[prev] === true),
                    prev,
                  ).map((f) => (
                    <li key={`base-${f.rotulo}`} className="flex gap-2.5 lg:hidden">
                      <span aria-hidden="true" className="font-bold text-latao-texto">
                        ✓
                      </span>
                      {f.rotulo}
                    </li>
                  ))}
                {highlights.map((f) => (
                  <li key={f.rotulo} className="flex gap-2.5">
                    <span aria-hidden="true" className="font-bold text-latao-texto">
                      ✓
                    </span>
                    {f.rotulo}
                  </li>
                ))}
              </ul>
              <a href={p.href} data-intent={p.id} className={p.featured ? "btn-primary w-full shadow-[0_0_30px_rgba(201,162,77,.35)]" : "btn-outline w-full"}>
                {p.cta}
              </a>
              {/* rodada 5, ponto 13: o selo sob o botão de assinar (Lente e Luneta). O do Telescópio é uma conversa
                  ("Falar sobre o Telescópio", preço também sob consulta), não uma assinatura: sem o selo (com o do topo da
                  seção, a nota e os dos dois planos, ele aparecia 5 vezes; revisão final da rodada 5, CONT-08) */}
              {p.id !== "telescopio" && <SeloCancelamento variante="linha" className="mt-3.5 justify-center" />}
            </div>
          );
        })}
      </div>

      <PlansCompare labelId="comparativo-planos">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <caption id="comparativo-planos" className="px-5 pt-6 pb-3 text-left font-display text-xl font-bold sm:px-7">Compare os planos</caption>
          <thead>
            <tr className="border-b border-nevoa/20 text-xs tracking-[0.1em] text-nevoa uppercase">
              <th scope="col" className="px-5 py-3 font-semibold sm:px-7">
                Recurso
              </th>
              {PLANS.plans.map((p) => (
                <th key={p.id} scope="col" className={`w-[19%] px-3 py-3 text-center font-semibold ${p.featured ? "bg-latao/10 text-latao-texto" : ""}`}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          {GRUPOS.map((g) => (
            <tbody key={g.grupo}>
              <tr className="border-b border-nevoa/10">
                <th scope="rowgroup" className="px-5 pt-6 pb-2 text-[11px] font-semibold tracking-[0.14em] text-latao-texto uppercase sm:px-7">
                  {g.grupo}
                </th>
                {/* células vazias só para a coluna em destaque (Luneta) seguir sem corte entre os grupos */}
                {PLANS.plans.map((p) => (
                  <td key={p.id} aria-hidden="true" className={p.featured ? "bg-latao/10" : ""} />
                ))}
              </tr>
              {g.linhas.map((f) => (
                <tr key={f.label} className="border-b border-nevoa/10">
                  <th scope="row" className="px-5 py-3.5 font-normal text-luar sm:px-7">
                    {f.label}
                  </th>
                  {PLANS.plans.map((p) => (
                    <td key={p.id} className={`px-3 py-3.5 text-center ${p.featured ? "bg-latao/10" : ""}`}>
                      <Cell value={f[p.id]} plan={p.name} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          <tbody>
            <tr className="border-t border-nevoa/20">
              <th scope="row" className="px-5 py-4 font-semibold sm:px-7">
                Preço
              </th>
              {PLANS.plans.map((p) => (
                <td key={p.id} className={`px-3 py-4 text-center font-semibold whitespace-nowrap ${p.featured ? "bg-latao/10" : ""}`}>
                  R$ <RichText text={p.price} />
                  <span className="block text-[11px] font-normal text-nevoa">{p.id === "telescopio" ? "/mês ou sob consulta" : "/mês"}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </PlansCompare>
    </>
  );
}
