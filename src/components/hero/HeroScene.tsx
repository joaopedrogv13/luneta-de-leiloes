import { HERO } from "@/content/site";
import { BrazilMap } from "@/components/ui/BrazilMap";
import { RichText } from "@/components/ui/RichText";
import { Seal } from "@/components/ui/Seal";
import { SeloCancelamento } from "@/components/ui/SeloCancelamento";
import { LISTINGS } from "@/content/examples";
import { estiloRecorte } from "@/lib/catalogo/recorte";
import { ALVO_DESAGIO, BRASS, LENS_GLOW, LENS_SHADOW } from "./constants";
import { HeroMotion } from "./HeroMotion";

/** Foto ilustrativa do cartão do Alvo: a do exemplo "alvo-sp" (src/content/examples.ts). */
const FOTO_ALVO = LISTINGS.find((l) => l.id === "alvo-sp")?.photoIlustrativa ?? null;

/** Cartões desfocados ao fundo = os sites dos leiloeiros, cada um no seu canto. */
const SITES = [
  { pos: "left-[44%] top-[14%] w-[150px] h-[92px] -rotate-6", bar: "bg-latao/50" },
  { pos: "left-[84%] top-[30%] w-[140px] h-[88px] rotate-[5deg]", bar: "" },
  { pos: "left-[50%] top-[80%] w-[160px] h-[84px] rotate-3", bar: "bg-grave/50" },
  { pos: "left-[86%] top-[70%] w-[130px] h-[80px] -rotate-[4deg]", bar: "" },
];

/**
 * HERO · a luneta chega ao alvo.
 *
 * A cena ocupa uma tela. Ao abrir ou recarregar a página no topo, a animação roda sozinha (rodada 5), com tempo fixo
 * (~2,5s) e sem travar a rolagem, nas 6 etapas do blueprint (Passo 4):
 *   1. Noite e névoa: estrelas, névoa densa e uma luneta pequena ao longe. Título já visível (estado inicial).
 *   2. A luneta se aproxima: cresce e se alinha ao centro; a névoa abre; os sites dos leiloeiros
 *      aparecem desfocados ao fundo (com leve parallax).
 *   3. A luneta se estende: os tubos de latão deslizam e a objetiva vira a moldura circular.
 *   4. Foco: o mapa do Brasil entra em foco, os pins acendem e pulsam; os cartões ficam nítidos.
 *   5. Mira travada: o retículo desliza até o pin de São Paulo e trava; o cartão do Alvo abre,
 *      o deságio conta até 48% e aparece o selo.
 *   6. Chamada: a lente solta brilho de luar e o botão "Ver planos" acende em latão.
 * Com prefers-reduced-motion (ou sem JS) nada disso roda: a cena já aparece no estado final.
 * Esta marcação é renderizada no servidor; a animação (GSAP) vive na ilha cliente <HeroMotion />.
 * Desfoques e brilhos têm camadas próprias (desfocada × nítida) para animar só opacidade e transform.
 */
export function HeroScene() {
  return (
    <section id="topo" aria-labelledby="hero-title" className="hero-track relative">
      <div data-h="stage" className="sticky top-0 h-svh overflow-hidden bg-noite [container-type:size]">
        {/* Céu: estrelas sutis e brilho de luar */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div
            data-h="stars"
            className="absolute inset-0 animate-twinkle"
            style={{
              backgroundImage: [
                [8, 14, 1.5],
                [22, 62, 1],
                [37, 24, 1.2],
                [52, 86, 1],
                [64, 12, 1.6],
                [78, 44, 1],
                [88, 72, 1.3],
                [93, 22, 1],
                [45, 48, 1],
                [15, 88, 1.2],
                [70, 92, 1],
                [30, 40, 1],
                [58, 30, 1.1],
                [5, 50, 1],
              ]
                .map(([x, y, s]) => `radial-gradient(${s}px ${s}px at ${x}% ${y}%, rgba(var(--luar-rgb),.9), transparent 70%)`)
                .join(","),
            }}
          />
          <div className="absolute -top-[18cqh] -right-[10cqw] size-[60cqw] rounded-full bg-[radial-gradient(circle,rgba(var(--luar-rgb),0.10),transparent_60%)]" />

          {/* Sites dos leiloeiros: camada desfocada × camada nítida (troca de opacidade, sem animar filtro) */}
          <div data-h="sites" className="absolute inset-0 max-sm:hidden">
            {(["soft", "sharp"] as const).map((layer) => (
              <div key={layer} data-h={`sites-${layer}`} className="absolute inset-0">
                {SITES.map((s, i) => (
                  <div
                    key={i}
                    data-site
                    className={`absolute rounded-lg border border-nevoa/25 bg-tinta p-2.5 ${s.pos} ${layer === "soft" ? "opacity-0 blur-[6px]" : "opacity-70"}`}
                  >
                    <div className="h-2 w-3/5 rounded bg-nevoa/50" />
                    <div className="mt-2.5 h-1.5 w-[85%] rounded bg-nevoa/25" />
                    <div className="mt-1.5 h-1.5 w-[65%] rounded bg-nevoa/25" />
                    {s.bar && <div className={`mt-2.5 h-1.5 w-2/5 rounded ${s.bar}`} />}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Névoa */}
          <div
            data-h="fog"
            className="absolute -inset-[12%] [html:not(.motion)_&]:opacity-[0.08]"
            style={{
              background:
                "radial-gradient(ellipse 50% 40% at 30% 60%,rgba(var(--fog-rgb),.55),transparent 70%),radial-gradient(ellipse 45% 35% at 70% 40%,rgba(var(--fog-rgb),.45),transparent 70%),radial-gradient(ellipse 60% 30% at 50% 85%,rgba(var(--fog-rgb),.5),transparent 70%),radial-gradient(ellipse 40% 50% at 85% 75%,rgba(var(--fog-rgb),.35),transparent 70%)",
            }}
          />
        </div>

        {/* Centro da lente: 66%/50% no desktop; no celular, entre o texto e o cartão (--lens-y, globals.css).
            No tablet (640 a 1023 px) a lente fica menor (40% da largura) para não encostar no texto (R4-RESP-18). */}
        <div aria-hidden="true" className="absolute top-[var(--lens-y)] left-1/2 sm:top-1/2 sm:left-[66%]">
          {/* Luneta de latão: ocular + 3 tubos + objetiva */}
          <div data-h="scope" className="absolute top-0 left-0 origin-center">
            <div className="flex items-center">
              <div data-h="tube" className="h-6 w-[18px] rounded" style={{ background: BRASS, boxShadow: "inset 0 0 0 1px rgba(90,68,20,.6)" }} />
              {[
                [96, 34],
                [84, 44],
                [72, 54],
              ].map(([w, h]) => (
                <div
                  key={w}
                  data-h="tube"
                  className="rounded-[3px] border-l-4 border-latao-escuro"
                  style={{ width: w, height: h, background: BRASS, boxShadow: "inset 0 0 0 1px rgba(90,68,20,.6)" }}
                />
              ))}
              <div
                data-h="tube"
                className="size-[66px] rounded-full border-[6px] border-latao"
                style={{
                  background: "radial-gradient(circle at 35% 35%,rgba(234,240,255,.9),#1C2A52 45%,#0F1830 70%)",
                  boxShadow: "0 0 0 2px #5A4414, inset 0 0 12px rgba(234,240,255,.3)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Brilho de luar da etapa 6: camada própria atrás da lente (anima só a opacidade) */}
        <div
          data-h="glow"
          aria-hidden="true"
          className="pointer-events-none absolute top-[var(--lens-y)] left-1/2 size-[var(--lens)] -translate-x-1/2 -translate-y-1/2 rounded-full sm:top-1/2 sm:left-[66%] sm:size-[min(40cqw,56cqh)] lg:size-[min(52cqw,62cqh)]"
          style={{ boxShadow: LENS_GLOW }}
        />

        {/* Lente: moldura circular com anel de latão, mapa e retículo (fica noturna também no tema claro).
            O contêiner externo só posiciona (CSS responsivo); o GSAP anima apenas o interno. */}
        <div className="absolute top-[var(--lens-y)] left-1/2 size-[var(--lens)] -translate-x-1/2 -translate-y-1/2 sm:top-1/2 sm:left-[66%] sm:size-[min(40cqw,56cqh)] lg:size-[min(52cqw,62cqh)]">
        <div
          data-h="lens"
          className="relative h-full w-full overflow-hidden rounded-full border-[6px] border-latao"
          style={{
            background: "radial-gradient(circle at 50% 45%,#16224A,#0F1830 60%,#0A1226 100%)",
            boxShadow: LENS_SHADOW,
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "inset 0 0 0 10px #0F1830, inset 0 0 0 12px rgba(201,162,77,.55), inset 0 0 60px rgba(7,11,22,.9)" }}
          />
          <div aria-hidden="true" className="absolute inset-0 [background-size:11%_11%] [background-image:linear-gradient(rgba(142,155,181,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(142,155,181,.08)_1px,transparent_1px)]" />
          <div data-h="map" className="absolute inset-[7%]">
            {/* mapa desfocado (estático) × mapa nítido: o foco é uma troca de opacidade */}
            <div data-h="map-soft" aria-hidden="true" className="absolute inset-0 opacity-0 blur-[5px]">
              <BrazilMap variant="lens" pins={[]} label="" />
            </div>
            <div data-h="map-sharp" className="absolute inset-0">
              <BrazilMap variant="lens" highlight="sp" label="Mapa do Brasil com os leilões monitorados; a mira está travada em São Paulo" />
            </div>
            {/* retículo: o externo fica no pin de São Paulo; o GSAP anima o interno */}
            <div aria-hidden="true" className="absolute top-[69.475%] left-[66.9%] size-[clamp(36px,20%,72px)] -translate-x-1/2 -translate-y-1/2">
            <div
              data-h="reticle"
              className="absolute inset-0 rounded-full border-[1.5px] border-[#EAF0FF] shadow-[0_0_16px_rgba(234,240,255,.5)]"
            >
              <span className="absolute -top-2.5 left-1/2 h-5 w-[1.5px] -translate-x-1/2 bg-[#EAF0FF]" />
              <span className="absolute -bottom-2.5 left-1/2 h-5 w-[1.5px] -translate-x-1/2 bg-[#EAF0FF]" />
              <span className="absolute top-1/2 -left-2.5 h-[1.5px] w-5 -translate-y-1/2 bg-[#EAF0FF]" />
              <span className="absolute top-1/2 -right-2.5 h-[1.5px] w-5 -translate-y-1/2 bg-[#EAF0FF]" />
              <span className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4ADE9A] shadow-[0_0_8px_#4ADE9A]" />
            </div>
            </div>
          </div>
        </div>
        </div>

        {/* Cartão do Alvo (exemplo fictício) */}
        <div className="absolute bottom-3 left-1/2 z-[4] w-[min(360px,calc(100cqw-32px))] -translate-x-1/2 sm:bottom-[8cqh] sm:left-[min(calc(66%+4cqw),calc(100cqw-376px))] sm:translate-x-0">
        <div
          data-h="card"
          className="flex items-center gap-3 rounded-2xl border border-latao/45 bg-tinta p-3 pr-4 shadow-[0_20px_60px_rgba(0,0,0,.5)]"
        >
          {/* foto ilustrativa do exemplo (a mesma do cartão do Alvo na landing): <img> simples da fonte, preguiçoso e de
              baixa prioridade (não disputa com o título, que é o LCP); se falhar, fica o desenho listrado de baixo */}
          <div aria-hidden="true" className="photo-placeholder relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-latao font-mono text-[9px] text-nevoa">
            foto
            {FOTO_ALVO && (
              // eslint-disable-next-line @next/next/no-img-element -- a foto fica na fonte: o next/image a baixaria e re-hospedaria
              <img
                src={FOTO_ALVO.url}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                referrerPolicy="no-referrer"
                draggable={false}
                style={estiloRecorte(FOTO_ALVO.recorte)}
                className="absolute inset-0 size-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-pos uppercase">
              <Seal level={3} size={18} /> Alvo · exemplo
            </p>
            <p className="mt-1 text-[13px] leading-tight font-semibold text-luar">Apartamento 3 quartos · São Paulo/SP</p>
            <p className="mt-0.5 text-[11px] leading-tight text-nevoa">Desocupado · sem dívidas identificadas</p>
            {FOTO_ALVO && <p className="mt-0.5 text-[10px] leading-tight text-nevoa">Foto ilustrativa</p>}
          </div>
          <div className="shrink-0 text-right">
            {/* o número anima de 0 a 48; leitores de tela recebem sempre o valor final */}
            <p aria-hidden="true" className="font-display text-[30px] leading-none font-bold tracking-[-0.03em] text-pos">
              {/* o espaço é o do número final (invisível); o que conta fica por cima: contar não muda a largura (CLS) */}
              −
              <span className="relative inline-block">
                <span className="invisible">{ALVO_DESAGIO}</span>
                <span data-h="count" className="absolute inset-0 text-right">
                  {ALVO_DESAGIO}
                </span>
              </span>
              %
            </p>
            <p className="mt-1 text-[10px] font-medium text-nevoa">
              <span className="sr-only">{ALVO_DESAGIO}% de </span>deságio
            </p>
          </div>
        </div>
        </div>

        {/* Texto: título, promessa e 2 botões */}
        <div data-h="text" className="absolute inset-x-0 top-0 z-[3] px-5 pt-[84px] sm:top-1/2 sm:w-[48%] sm:-translate-y-1/2 sm:px-[6cqw] sm:pt-9 lg:w-[44%]">
          <h1
            id="hero-title"
            className="font-display text-[clamp(32px,min(5.6cqw,8.5cqh),74px)] leading-[1.02] font-bold tracking-[-0.03em] text-luar max-sm:text-[clamp(30px,8.6cqw,40px)]"
          >
            {HERO.titleStart} <em className="accent text-latao-texto">{HERO.titleEm}</em> {HERO.titleEnd}
          </h1>
          <p className="mt-4 max-w-[460px] text-[clamp(15px,1.3cqw,19px)] leading-normal text-nevoa">{HERO.subtitle}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-3">
            <a data-h="cta" href="#planos" className="btn-primary">
              {HERO.primary}
            </a>
            <a
              href="#especialista"
              className="btn-ghost max-sm:min-h-11 max-sm:gap-1.5 max-sm:border-transparent max-sm:px-0 max-sm:underline max-sm:decoration-latao/60 max-sm:underline-offset-4"
            >
              {/* no tablet o texto curto também: o longo quebrava em 2 linhas na coluna de texto */}
              <span className="lg:hidden">{HERO.secondaryShort}</span>
              <span className="max-lg:hidden">{HERO.secondary}</span>
              {/* abaixo de 380 px a seta sai: "Falar com especialista" cabe na linha do botão */}
              <span aria-hidden="true" className="text-latao-texto max-[379px]:hidden sm:hidden">
                →
              </span>
            </a>
          </div>
          {/* rodada 5, ponto 13: o selo do cancelamento logo abaixo dos botões (no celular, sem a moldura: uma linha
              curta, para a lente continuar inteira entre o texto e o cartão; globals.css, --lens) */}
          <SeloCancelamento className="mt-4 max-sm:mt-3 max-sm:border-transparent max-sm:bg-transparent max-sm:p-0 max-sm:text-[12.5px]" />
          <p className="mt-4 text-xs leading-relaxed font-medium text-nevoa max-sm:mt-2.5">
            <RichText text={HERO.trust} />
          </p>
        </div>

      </div>
      <HeroMotion />
    </section>
  );
}
