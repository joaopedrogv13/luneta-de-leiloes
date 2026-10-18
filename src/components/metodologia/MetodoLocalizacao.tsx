import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AnelNota, BarraParte, ReguaNota } from "@/components/catalogo/localizacao/visual";
import { PESOS_PADRAO, ROTULO_COMPONENTE } from "@/lib/catalogo/localizacao";
import { pctTexto, VALIDACAO_ITBI, type ResumoBaseLocal } from "@/lib/catalogo/metodologia";
import { NOTA_NAO_GARANTIA, OSM_ATRIBUICAO, SOBRE_COMPONENTE } from "@/lib/catalogo/nota-texto";
import { numero } from "@/lib/catalogo/rotulos";
import type { ChaveComponenteLocal, PrecisaoLocal } from "@/lib/catalogo/tipos";
import { VoltarImovel } from "./VoltarImovel";

/**
 * A página pública "Como a nota de localização é calculada" (/metodologia/localizacao), em português simples, para
 * quem não é técnico. Os números (pesos, precisão dos endereços, cidades, raios, fontes) vêm do resumo dos arquivos da
 * nota (src/lib/catalogo/metodologia.ts); o texto-base é o de base/fontes/localizacao/README.md. Componente do
 * servidor: a página é estática; só o "Voltar ao imóvel" nasce no navegador.
 */

const ORDEM_PARTES: ChaveComponenteLocal[] = ["servicos", "infra", "transporte", "renda", "comercio", "lazer"];
/** Tons das partes na barra dos pesos (latão em degraus: a cor não carrega significado; o rótulo diz tudo). */
const TOM_PARTE: Record<ChaveComponenteLocal, string> = {
  servicos: "bg-latao",
  infra: "bg-latao/80",
  transporte: "bg-latao/60",
  renda: "bg-latao/45",
  comercio: "bg-nevoa/45",
  lazer: "bg-nevoa/30",
};

/** Nome curto de cada parte, dentro da barra dos pesos. */
const CURTO: Record<ChaveComponenteLocal, string> = {
  servicos: "Serviços",
  infra: "Infraestrutura",
  transporte: "Transporte",
  renda: "Renda",
  comercio: "Comércio",
  lazer: "Lazer",
};

const LINK = "font-semibold text-latao-texto underline decoration-latao/40 underline-offset-4 hover:text-luar hover:decoration-luar";

function dataBr(iso: string | null | undefined) {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** Bloco da página: rótulo numerado, título e conteúdo; os pares ganham o fundo de superfície. */
function Bloco({ id, n, titulo, lead, children, tinta = false }: { id: string; n: string; titulo: string; lead?: ReactNode; children: ReactNode; tinta?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`scroll-mt-16 px-5 py-16 sm:px-10 sm:py-24 ${tinta ? "bg-tinta" : ""}`}>
      <div className="container-l">
        <p className="eyebrow mb-4 flex items-center gap-3">
          <span className="font-display text-[13px] tracking-[0.08em] text-latao-texto">{n}</span>
          <span aria-hidden="true" className="h-px w-8 bg-nevoa/40" />
        </p>
        <h2 id={`${id}-titulo`} className="max-w-[860px] font-display text-[clamp(28px,3.6vw,44px)] leading-[1.08] font-bold tracking-[-0.025em] text-luar">
          {titulo}
        </h2>
        {lead && <div className="mt-5 max-w-[68ch] text-[16px] leading-relaxed text-nevoa sm:text-[17px]">{lead}</div>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** 100 pontinhos (os moradores); `acesos` deles em latão. */
function Moradores({ acesos }: { acesos: number }) {
  return (
    // largura fixa a partir de sm: na coluna "auto" da grade, w-full daria largura zero e os pontinhos sumiam
    <div aria-hidden="true" className="grid w-full max-w-[17rem] grid-cols-10 gap-1.5 sm:w-[14rem]">
      {Array.from({ length: 100 }, (_, k) => (
        <span key={k} className={`aspect-square rounded-full ${k < acesos ? "bg-latao" : "bg-nevoa/20"}`} />
      ))}
    </div>
  );
}

function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-nevoa/15 bg-tinta p-5 sm:p-6 [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_12px_32px_-16px_rgba(15,24,48,.16)] ${className}`}>
      {children}
    </div>
  );
}

const PRECISOES: { chave: PrecisaoLocal; rotulo: string; mostra: string; tom: string }[] = [
  { chave: "numero", rotulo: "No número", mostra: "Nota de 0 a 100", tom: "bg-latao" },
  { chave: "rua", rotulo: "Na rua", mostra: "Nota de 0 a 100", tom: "bg-latao/65" },
  { chave: "bairro", rotulo: "Só no bairro", mostra: "Nota aproximada, com a faixa", tom: "bg-latao/35" },
  { chave: "cidade", rotulo: "Só na cidade", mostra: "Sem nota, com o motivo", tom: "bg-nevoa/30" },
];

const FAQ: { p: string; r: ReactNode }[] = [
  {
    p: "Uma nota 90 em São Paulo vale o mesmo que uma 90 numa cidade menor?",
    r: "Vale a mesma coisa sobre a posição dentro da própria cidade: o entorno é melhor que o de 90% de quem mora ali. Não quer dizer que os dois lugares sejam iguais. Para comparar cidades, olhe os números de cada parte (mercados, escolas, estação), que são absolutos.",
  },
  {
    p: "Por que este imóvel não tem nota?",
    r: "Porque não sabemos onde ele fica com precisão suficiente (a fonte publicou um endereço que só achamos na cidade), porque é rural (a nota mede a vida a pé na cidade), ou porque a cidade é pequena demais para uma nota de 0 a 100 (aí mostramos os números e a posição em terços). O motivo aparece na página do imóvel.",
  },
  {
    p: "A nota usa o preço dos imóveis?",
    r: "Não. Localização boa já é preço alto, então usar o preço seria contar a mesma coisa duas vezes. O preço do m² aparece à parte, na seção “Preço do m² na região” da página do imóvel, e serviu só para conferir se os pesos fazem sentido.",
  },
  {
    p: "E a segurança do bairro?",
    r: "Não entra. O registro de crimes depende de onde há delegacia e de quem registra, o dado aberto quase nunca chega ao nível da rua, e dados de ocorrência envolvem informação pessoal (LGPD). Uma nota com isso pareceria precisa sem ser. Converse com quem mora no lugar e visite em horários diferentes.",
  },
  {
    p: "O ponto no mapa é o imóvel exato?",
    r: "Quando o endereço foi achado no número, o ponto fica a poucos metros dele (a página mostra a margem, como “±10 m”). Na rua, fica no meio dos endereços da rua; no bairro, no centro do bairro. Um casamento de endereço errado pode acontecer: confira no mapa antes de decidir.",
  },
  {
    p: "Com que frequência a nota muda?",
    r: "Ela é recalculada quando a base de imóveis é atualizada. Os dados do entorno mudam devagar (Censo e cadastro de endereços de 2022, escolas de 2025, saúde de 2026, mapa aberto da semana do cálculo). Imóvel que entrou depois do último cálculo aparece como “ainda não calculada”.",
  },
  {
    p: "A nota substitui a visita ao local?",
    r: "Não. Ela resume dados públicos, que podem estar desatualizados ou incompletos para um endereço. Use para comparar e para saber o que olhar; decida depois de ver o lugar.",
  },
];

export function MetodoLocalizacao({ r }: { r: ResumoBaseLocal | null }) {
  const pesos = r?.pesos ?? PESOS_PADRAO;
  const partes = [...ORDEM_PARTES].sort((a, b) => pesos[b] - pesos[a] || ORDEM_PARTES.indexOf(a) - ORDEM_PARTES.indexOf(b));
  const total = r?.total ?? 0;
  const v = VALIDACAO_ITBI;
  const n = (x: number | undefined) => (x === undefined ? "—" : numero(x));
  // exemplo ilustrativo do passo 3 (números redondos, não de um imóvel)
  const exemplo: Record<ChaveComponenteLocal, number> = { servicos: 70, infra: 60, transporte: 40, renda: 50, comercio: 80, lazer: 30 };
  const somaPesos = partes.reduce((s, c) => s + pesos[c], 0) || 1;
  const media = Math.round(partes.reduce((s, c) => s + exemplo[c] * pesos[c], 0) / somaPesos);

  return (
    <>
      {/* ------------------------------------------------------------------ abertura */}
      <header className="relative overflow-hidden px-5 pt-28 pb-14 sm:px-10 sm:pt-36 sm:pb-20">
        <div aria-hidden="true" className="grid-lines pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_60%_at_70%_30%,black,transparent)]" />
        <div className="container-l relative grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
              <Suspense fallback={null}>
                <VoltarImovel className={`inline-flex min-h-11 items-center ${LINK} no-underline`} />
              </Suspense>
              <Link href="/" className="inline-flex min-h-11 items-center font-medium text-nevoa no-underline hover:text-luar">
                Página inicial
              </Link>
            </div>
            <p className="eyebrow mb-5">Metodologia · Nota de localização</p>
            <h1 className="h2 max-w-[17ch] text-luar">
              Como calculamos a <em className="accent text-latao-texto">nota</em> de localização
            </h1>
            <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-nevoa sm:text-lg">
              Uma nota de 0 a 100 que responde a uma pergunta só: <span className="text-luar">o entorno deste imóvel é melhor ou pior que o de quem mora na mesma cidade?</span>{" "}
              Aqui está tudo o que entra na conta, de onde vêm os dados e o que fica de fora.
            </p>
            {r && (
              <p className="mt-6 text-[14px] text-nevoa">
                Calculada para <span className="font-semibold text-luar tabular-nums">{n(total)}</span> imóveis em{" "}
                <span className="font-semibold text-luar tabular-nums">{n(r.cidades.total)}</span> cidades · cálculo de {dataBr(r.geradoEm)}.
              </p>
            )}
          </div>

          <figure className="rounded-3xl border border-nevoa/20 bg-tinta p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,.6)] sm:p-7 [[data-theme=light]_&]:shadow-[0_20px_50px_-28px_rgba(15,24,48,.35)]">
            <figcaption className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase">
              <span className="text-latao-texto">Nota de localização</span>
              <span className="rounded-full border border-dashed border-nevoa/45 px-2 py-1 tracking-normal normal-case">Exemplo ilustrativo</span>
            </figcaption>
            <div className="mt-5 flex items-center gap-5">
              <AnelNota nota={78} tamanho={104} />
              <p className="font-display text-[20px] leading-snug font-bold text-luar">Melhor localizado que 78% dos moradores da cidade.</p>
            </div>
            <ul className="mt-6 flex flex-col gap-3">
              {partes.slice(0, 4).map((c, k) => (
                <li key={c}>
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="text-luar">{ROTULO_COMPONENTE[c]}</span>
                    <span className="font-display font-bold text-luar tabular-nums">{[84, 71, 63, 80][k]}</span>
                  </div>
                  <BarraParte nota={[84, 71, 63, 80][k]!} className="mt-1.5" />
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[12.5px] leading-snug text-nevoa">Cada parte tem a sua nota e o seu peso; tocar numa parte, na página do imóvel, mostra os números.</p>
          </figure>
        </div>

        <nav aria-label="Nesta página" className="container-l relative mt-12">
          <ul className="flex flex-wrap gap-2 text-[13.5px]">
            {[
              ["o-que-responde", "O que a nota responde"],
              ["ponto", "Onde fica o imóvel"],
              ["partes", "As seis partes"],
              ["conta", "Como vira a nota"],
              ["casos", "Cidade pequena e bairro"],
              ["risco", "Áreas de risco"],
              ["fora", "O que não entra"],
              ["conferencia", "Como conferimos"],
              ["limites", "Limites"],
              ["fontes", "Fontes e licenças"],
              ["perguntas", "Perguntas"],
            ].map(([id, t]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-nevoa/30 px-4 font-medium text-luar no-underline transition-colors hover:border-latao hover:bg-latao/10 pointer-fine:min-h-9"
                >
                  {t}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* ------------------------------------------------------------------ 01 */}
      <Bloco
        id="o-que-responde"
        n="01"
        titulo="O que a nota responde"
        tinta
        lead={
          <p>
            A nota compara o entorno do imóvel, num raio de 500 m a 1 km, com o entorno de cada lugar onde as pessoas moram na mesma cidade. Uma nota{" "}
            <span className="font-semibold text-luar">78</span> quer dizer: o entorno deste imóvel é melhor que o de 78% dos moradores da cidade.
          </p>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Cartao>
            <p className="text-[13px] font-semibold tracking-[0.12em] text-nevoa uppercase">A régua</p>
            <ReguaNota nota={78} rotulo="78: melhor que 78% dos moradores" className="mt-4" />
            <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
              <Moradores acesos={78} />
              <p className="text-[15px] leading-relaxed text-nevoa">
                Imagine 100 moradores da cidade. Com nota 78, o imóvel tem um entorno melhor que o de <span className="font-semibold text-luar">78 deles</span>. A nota
                média da cidade, contando todos os moradores, é 50.
              </p>
            </div>
          </Cartao>
          <div className="flex flex-col gap-4">
            <Cartao>
              <h3 className="text-[16px] font-semibold text-luar">Vale dentro da cidade</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
                Um 90 em São Paulo e um 90 em Patos dizem a mesma coisa sobre a posição na própria cidade, não que os dois lugares são iguais. Assim,
                Copacabana é comparada com o resto do Rio, e não com outra cidade.
              </p>
            </Cartao>
            <Cartao>
              <h3 className="text-[16px] font-semibold text-luar">O que a nota não é</h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-[15px] leading-relaxed text-nevoa">
                <li>Não é avaliação do imóvel nem do prédio.</li>
                <li>Não mede segurança.</li>
                <li>Não usa o preço.</li>
                <li>Não é garantia: resume dados públicos, a maior parte de 2022.</li>
              </ul>
            </Cartao>
          </div>
        </div>
      </Bloco>

      {/* ------------------------------------------------------------------ 02 */}
      <Bloco
        id="ponto"
        n="02"
        titulo="Primeiro, achar onde fica o imóvel"
        lead={
          <p>
            Os leilões publicam o endereço em texto; a Caixa não publica a coordenada. Transformamos o endereço em ponto no mapa com o cadastro de endereços
            do Censo (CNEFE 2022, do IBGE), pela ferramenta geocodebr do IPEA. Regras extras evitam confiar num casamento arriscado: nome de rua parecido,
            rua com o mesmo nome em outro bairro, número fora da rua.
          </p>
        }
      >
        {r && (
          <div aria-hidden="true" className="flex h-4 w-full overflow-hidden rounded-full">
            {PRECISOES.map((p) => (
              <span key={p.chave} className={`h-full ${p.tom}`} style={{ width: `${(100 * r.porPrecisao[p.chave]) / Math.max(1, total)}%` }} />
            ))}
          </div>
        )}
        {/* dois por linha já no celular: os quatro cartões cabem numa tela */}
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {PRECISOES.map((p) => (
            <li key={p.chave}>
              <Cartao className="h-full max-sm:p-4!">
                <p className="flex items-start gap-2 text-[14px] leading-snug font-semibold text-luar">
                  <span aria-hidden="true" className={`mt-1 size-3 shrink-0 rounded-full ${p.tom}`} />
                  Endereço achado {p.rotulo.toLowerCase()}
                </p>
                {r && (
                  <p className="mt-3 font-display text-[28px] leading-none font-bold tracking-[-0.02em] text-luar tabular-nums sm:text-[34px]">
                    {pctTexto(r.porPrecisao[p.chave], total)}
                  </p>
                )}
                {r && <p className="mt-1 text-[13px] text-nevoa tabular-nums">{n(r.porPrecisao[p.chave])} imóveis</p>}
                <p className="mt-3 text-[14px] leading-snug text-nevoa">
                  Na tela: <span className="font-medium text-luar">{p.mostra}</span>
                </p>
              </Cartao>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[72ch] text-[14.5px] leading-relaxed text-nevoa">
          A página do imóvel mostra a precisão num selo (“Endereço localizado no número (±10 m)”) e a margem do ponto. Para imóvel rural, a nota não se aplica: ela
          mede a vida a pé na cidade.
        </p>
      </Bloco>

      {/* ------------------------------------------------------------------ 03 */}
      <Bloco
        id="partes"
        n="03"
        titulo="As seis partes da nota"
        tinta
        lead={
          <p>
            Em volta do ponto, medimos seis coisas que pesam no dia a dia de quem mora. Cada uma tem a sua nota e o seu peso; a página do imóvel mostra as
            seis separadas, com os números de cada uma.
          </p>
        }
      >
        <div aria-hidden="true" className="flex h-11 w-full overflow-hidden rounded-2xl">
          {partes.map((c) => (
            <span
              key={c}
              className={`flex h-full min-w-0 items-center justify-center border-r border-tinta text-[12px] font-semibold text-noite-fixa last:border-r-0 ${TOM_PARTE[c]}`}
              style={{ width: `${pesos[c]}%` }}
            >
              <span className="truncate px-1.5 max-sm:hidden">
                {/* o nome só cabe nas partes grandes (15% ou mais), a partir do tablet */}
                {pesos[c] >= 15 && <span className="mr-1 font-medium max-md:hidden">{CURTO[c]}</span>}
                {pesos[c]}%
              </span>
            </span>
          ))}
        </div>
        <p className="sr-only">
          Pesos: {partes.map((c) => `${ROTULO_COMPONENTE[c]} ${pesos[c]}%`).join(", ")}.
        </p>
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {partes.map((c) => {
            const s = SOBRE_COMPONENTE[c];
            const detalhe = (
              <dl className="flex flex-col gap-3 text-[14px] leading-relaxed">
                <div>
                  <dt className="text-[11px] font-semibold tracking-[0.12em] text-nevoa uppercase">O que entra</dt>
                  <dd className="mt-1 text-nevoa">{s.oQueMede}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold tracking-[0.12em] text-nevoa uppercase">Raio</dt>
                  <dd className="mt-1 text-nevoa">{s.raio}, em linha reta</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold tracking-[0.12em] text-nevoa uppercase">Fonte e data</dt>
                  <dd className="mt-1 text-nevoa">
                    {s.fontes}
                    {c === "transporte" || c === "lazer" ? (r?.osmDe ? `; mapa de ${dataBr(r.osmDe)}` : "") : ""}
                  </dd>
                </div>
              </dl>
            );
            return (
              <li key={c}>
                <Cartao className="flex h-full flex-col bg-noite!">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display text-[19px] leading-snug font-bold text-luar">{ROTULO_COMPONENTE[c]}</h3>
                    <p className="shrink-0 text-right">
                      <span className="block font-display text-[30px] leading-none font-bold text-latao-texto tabular-nums">{pesos[c]}%</span>
                      <span className="text-[11px] font-semibold tracking-[0.12em] text-nevoa uppercase">peso</span>
                    </p>
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-luar/90">{s.curto}</p>
                  {/* celular: o detalhe sob demanda (a página já é longa); tablet e computador: aberto */}
                  <details className="group/parte mt-3 border-t border-nevoa/15 md:hidden">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-semibold text-latao-texto [&::-webkit-details-marker]:hidden">
                      O que entra, raio e fonte
                      <span aria-hidden="true" className="font-display text-lg transition-transform duration-200 group-open/parte:rotate-45 motion-reduce:transition-none">
                        +
                      </span>
                    </summary>
                    <div className="pb-1">{detalhe}</div>
                  </details>
                  <div className="mt-4 border-t border-nevoa/15 pt-4 max-md:hidden">{detalhe}</div>
                </Cartao>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Cartao>
            <h3 className="text-[16px] font-semibold text-luar">O primeiro mercado vale mais que o décimo</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
              Ter um mercado perto muda muito; o décimo muda pouco. Por isso cada contagem é comparada com o que é comum na cidade e “satura”: com o número
              comum de mercados, o acesso já chega a cerca de dois terços do máximo. Distâncias perdem valor aos poucos (a estação a 800 m, cerca de 10
              minutos a pé, vale bem mais que a 3 km).
            </p>
          </Cartao>
          <Cartao>
            <h3 className="text-[16px] font-semibold text-luar">Por que esses pesos</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
              Serviços e infraestrutura da rua pesam mais porque contam no dia a dia e acompanham o valor do lugar. Comércio e lazer pesam pouco: muito
              comércio pequeno aparece também em bairros densos e populares. Os pesos foram ajustados depois de conferidos com o preço pago nas compras de 5
              capitais (veja “Como conferimos”).
            </p>
          </Cartao>
        </div>
      </Bloco>

      {/* ------------------------------------------------------------------ 04 */}
      <Bloco
        id="conta"
        n="04"
        titulo="Como os números viram uma nota"
        lead={
          <p>
            A cidade é dividida em quadrados de 200 m (1 km na zona rural), com o número de moradores de cada um (Grade Estatística do Censo 2022, IBGE). Cada
            quadrado com gente morando é medido do mesmo jeito que o imóvel. A nota é a posição do imóvel entre esses quadrados, pesados pelos moradores.
          </p>
        }
      >
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["Os números em volta", "Quantos mercados a 500 m, a que distância fica a estação, que parte das casas está em rua com calçada... para o imóvel e para cada quadrado habitado da cidade."],
            ["Cada número vira um acesso", "Uma escala de 0 a 1: contagens saturam no comum da cidade, distâncias perdem valor aos poucos e porcentagens valem por elas mesmas."],
            ["A nota de cada parte", "A posição do imóvel entre os moradores da cidade: serviços 70 quer dizer mais serviços que o entorno de 70% deles. Empate conta pela metade."],
            ["A nota final", "A média das partes pelos pesos e, de novo, a posição dessa média entre os moradores. Por isso a nota média da cidade é 50."],
          ].map(([t, d], k) => (
            <li key={t}>
              <Cartao className="h-full">
                <span aria-hidden="true" className="font-display text-[26px] leading-none font-bold text-latao-texto">
                  0{k + 1}
                </span>
                <h3 className="mt-3 text-[16px] font-semibold text-luar">{t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-nevoa">{d}</p>
              </Cartao>
            </li>
          ))}
        </ol>

        <Cartao className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[16px] font-semibold text-luar">Um exemplo, com números redondos</h3>
            <span className="rounded-full border border-dashed border-nevoa/45 px-2.5 py-1 text-[12px] font-semibold text-nevoa">Exemplo ilustrativo</span>
          </div>
          <div className="mt-5 grid gap-x-10 gap-y-3 md:grid-cols-2">
            {partes.map((c) => (
              <div key={c} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="text-[14px] text-luar">{ROTULO_COMPONENTE[c]}</span>
                <span className="text-[13px] whitespace-nowrap text-nevoa tabular-nums">
                  <span className="font-display text-[16px] font-bold text-luar">{exemplo[c]}</span> × {pesos[c]}%
                </span>
                <BarraParte nota={exemplo[c]} className="col-span-2" />
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 border-t border-nevoa/15 pt-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <p className="text-[15px] leading-relaxed text-nevoa">
              Média pelos pesos: <span className="font-display text-[22px] font-bold text-luar tabular-nums">{media}</span>
            </p>
            <span aria-hidden="true" className="text-center text-[22px] text-latao-texto max-sm:rotate-90">
              →
            </span>
            <p className="text-[15px] leading-relaxed text-nevoa">
              Essa média é comparada com a dos quadrados onde moram as pessoas da cidade. Se ela for maior que a de 58% dos moradores, a nota final é{" "}
              <span className="font-display text-[22px] font-bold text-luar">58</span>.
            </p>
          </div>
        </Cartao>

        <Cartao className="mt-4">
          <h3 className="text-[16px] font-semibold text-luar">Quando falta um dado</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
            O que a cidade não tem sai da conta, e o peso vai para as outras partes, na mesma proporção. A página do imóvel mostra a parte que saiu com “sem dado
            nesta cidade, peso redistribuído”.
          </p>
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-nevoa marker:text-latao-texto">
            <li>Sem estação, barca nem terminal de ônibus mapeado: a distância à estação sai do transporte.</li>
            <li>
              Pontos de ônibus do mapa aberto (OpenStreetMap) só entram onde o mapa da cidade está razoavelmente completo
              {r ? ` (${n(r.cidades.comOnibusOsm)} das ${n(r.cidades.total)} cidades)` : ""}; nas outras, vale o ponto de ônibus na quadra, do Censo.
            </li>
            <li>Sem parque, praça ou parquinho mapeado, o lazer sai{r ? ` (${n(r.cidades.semLazer)} cidades)` : ""}.</li>
            <li>Ponto sem nenhuma casa a 1 km (área industrial, loteamento novo): renda e infraestrutura saem para aquele ponto.</li>
          </ul>
        </Cartao>
      </Bloco>

      {/* ------------------------------------------------------------------ 05 */}
      <Bloco id="casos" n="05" titulo="Cidade pequena e endereço aproximado" tinta>
        <div className="grid gap-4 lg:grid-cols-3">
          <Cartao className="bg-noite!">
            <h3 className="font-display text-[19px] font-bold text-luar">Cidade pequena</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
              Com menos de {n(r?.regras.pequenaMoradores ?? 20000)} moradores, ou menos de {n(r?.regras.pequenaCelulas ?? 50)} quadrados habitados, uma nota de 0 a
              100 entre tão poucas áreas enganaria. Mostramos os números do entorno (“mercado a 400 m; 2 escolas a 1 km”) e a posição em terços: acima da maioria,
              no meio ou abaixo da maioria da cidade.
            </p>
            {r && (
              <p className="mt-4 text-[14px] text-nevoa tabular-nums">
                <span className="font-display text-[26px] font-bold text-luar">{n(r.cidades.pequenas)}</span> cidades · {n(r.cidades.imoveisPequenas)} imóveis
              </p>
            )}
          </Cartao>
          <Cartao className="bg-noite!">
            <h3 className="font-display text-[19px] font-bold text-luar">Endereço só no bairro</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
              Sem a rua, o ponto é o centro do bairro. A nota vira uma faixa: das áreas habitadas menos bem localizadas às mais bem localizadas em volta do
              centro (num raio de 300 m a 2,5 km). Na tela, aparece com “~” (“~59”); o meio da faixa vale para ordenar e filtrar.
            </p>
            <ReguaNota nota={59} faixa={[48, 70]} rotulo="~59 (48 a 70)" className="mt-3" />
            {r && (
              <p className="mt-2 text-[14px] text-nevoa tabular-nums">
                <span className="font-display text-[26px] font-bold text-luar">{n(r.porSituacao.aproximada)}</span> imóveis com nota aproximada
              </p>
            )}
          </Cartao>
          <Cartao className="bg-noite!">
            <h3 className="font-display text-[19px] font-bold text-luar">Sem nota</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
              Endereço achado só na cidade (o ponto seria a sede do município) ou imóvel rural: a página diz o motivo e mostra o que dá para ver no lugar (o
              endereço no mapa e o preço da região).
            </p>
            {r && (
              <p className="mt-4 text-[14px] text-nevoa tabular-nums">
                <span className="font-display text-[26px] font-bold text-luar">{n(r.porSituacao.cidade)}</span> só na cidade · {n(r.porSituacao.rural)} rurais
              </p>
            )}
          </Cartao>
        </div>
      </Bloco>

      {/* ------------------------------------------------------------------ 06 */}
      <Bloco
        id="risco"
        n="06"
        titulo="Áreas de risco: alerta, não nota"
        lead={
          <p>
            O mapeamento de áreas de risco de deslizamento e inundação do IBGE e do Cemaden (População em Áreas de Risco no Brasil, publicado em 2018 com base no
            Censo de 2010) não entra na nota. Ele gera um alerta na página do imóvel.
          </p>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div role="note" className="flex gap-3 rounded-3xl border border-aten/45 bg-aten/[0.08] p-5 sm:p-6">
            <span aria-hidden="true" className="mt-0.5 text-[20px] leading-none text-aten">
              ⚠
            </span>
            <div>
              <h3 className="text-[16px] font-semibold text-luar">Quando aparece o alerta</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-luar/90">
                Quando o imóvel fica dentro ou a menos de {n(r?.regras.riscoPertoM ?? 100)} m de uma área de risco mapeada. Com o endereço só no bairro, a procura
                é em volta do centro do bairro (até {n(r?.regras.riscoAproxMaxM ?? 500)} m), e o alerta diz isso.
              </p>
            </div>
          </div>
          <Cartao>
            <h3 className="text-[16px] font-semibold text-luar">Sem alerta não quer dizer sem risco</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
              O mapeamento cobre {r ? `${n(r.cidades.comRisco)} das ${n(r.cidades.total)} cidades da base` : "parte das cidades"} e é antigo. Nas outras, a página
              diz: “Esta cidade não tem mapeamento de risco nessa base; isso não quer dizer que não haja risco”. Nunca dizemos “sem risco”. Confira com a Defesa
              Civil do município. O mapeamento do Serviço Geológico do Brasil entra numa próxima versão.
            </p>
          </Cartao>
        </div>
      </Bloco>

      {/* ------------------------------------------------------------------ 07 */}
      <Bloco id="fora" n="07" titulo="O que não entra, e por quê" tinta>
        <ul className="grid gap-4 md:grid-cols-3">
          {[
            [
              "O preço",
              "Localização boa já é preço alto: usar o preço seria contar a mesma coisa duas vezes, e a nota viraria uma medida de preço. O preço do m² aparece à parte, na seção “Preço do m² na região” da página do imóvel, e serviu para conferir os pesos.",
            ],
            [
              "O crime",
              "O registro de ocorrências depende de onde há delegacia e de quem registra (o crime aparece mais onde se registra mais), o dado aberto quase nunca chega à rua e envolve dados pessoais (LGPD). Uma nota com isso pareceria precisa sem ser.",
            ],
            [
              "Favela ou comunidade",
              "Rotular um lugar pelo nome reforça estigma e não diz como é viver ali. O que importa para quem mora (serviços, transporte, rua pavimentada, esgoto) já está nas partes da nota, medido do mesmo jeito em toda a cidade.",
            ],
          ].map(([t, d]) => (
            <li key={t}>
              <Cartao className="h-full bg-noite!">
                <h3 className="font-display text-[19px] font-bold text-luar">{t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-nevoa">{d}</p>
              </Cartao>
            </li>
          ))}
        </ul>
      </Bloco>

      {/* ------------------------------------------------------------------ 08 */}
      <Bloco
        id="conferencia"
        n="08"
        titulo="Como conferimos: as compras de verdade"
        lead={
          <p>
            Em {v.cidades.slice(0, -1).join(", ")} e {v.cidades[v.cidades.length - 1]}, as prefeituras publicam o preço pago em cada compra de imóvel (ITBI).
            Calculamos a nota no ponto de cada rua com pelo menos 5 compras ({numero(v.pares)} pares de rua e tipo) e comparamos a ordem das notas com a ordem
            do preço por m² pago. Quanto mais perto de 1, mais as duas ordens andam juntas; 0 é sem relação.
          </p>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <Cartao>
            <h3 className="text-[16px] font-semibold text-luar">Cada parte contra o preço (mediana dos {v.recortes} recortes)</h3>
            <ul className="mt-5 flex flex-col gap-3">
              {(Object.entries(v.porParte) as [ChaveComponenteLocal, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([c, rho]) => (
                  <li key={c} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-[14px] sm:grid-cols-[11rem_minmax(0,1fr)_3rem]">
                    <span className="text-luar">{ROTULO_COMPONENTE[c]}</span>
                    {/* escala de −0,2 a 0,6: o zero fica a 25% */}
                    <span aria-hidden="true" className="relative block h-2.5 rounded-full bg-nevoa/12">
                      <span className="absolute inset-y-[-3px] left-1/4 w-px bg-nevoa/50" />
                      <span
                        className={`absolute inset-y-0 rounded-full ${rho >= 0 ? "bg-latao" : "bg-nevoa/60"}`}
                        style={rho >= 0 ? { left: "25%", width: `${(rho / 0.8) * 100}%` } : { right: "75%", width: `${(-rho / 0.8) * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-semibold text-luar tabular-nums">{rho.toFixed(2).replace(".", ",").replace("-", "−")}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-5 text-[14px] leading-relaxed text-nevoa">
              A renda acompanha o preço por definição; dar mais peso a ela transformaria a nota numa medida de renda. Comércio e serviços ficaram perto de zero
              ou contra o preço: muito comércio pequeno aparece também nos bairros densos e populares.
            </p>
          </Cartao>
          <div className="flex flex-col gap-4">
            <Cartao>
              <p className="text-[13px] font-semibold tracking-[0.12em] text-nevoa uppercase">A nota final</p>
              <p className="mt-2 font-display text-[44px] leading-none font-bold text-luar tabular-nums">{v.mediana.toFixed(2).replace(".", ",")}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
                Mediana entre os {v.recortes} recortes (cidade e tipo de imóvel); só {v.negativos} ficou negativo. Com os pesos iniciais (serviços{" "}
                {v.antes.pesos.servicos}, infraestrutura {v.antes.pesos.infra}, comércio {v.antes.pesos.comercio}), a mediana era{" "}
                {v.antes.mediana.toFixed(2).replace(".", ",")} e {v.antes.negativos} recortes ficavam negativos. Comércio caiu para {pesos.comercio}, serviços para{" "}
                {pesos.servicos} e infraestrutura subiu para {pesos.infra}.
              </p>
              <ul className="mt-4 divide-y divide-nevoa/12 text-[14px]">
                {v.exemplos.map((e) => (
                  <li key={`${e.cidade}-${e.tipo}`} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="text-nevoa">
                      {e.cidade}, {e.tipo} <span className="text-[12.5px]">({numero(e.ruas)} ruas)</span>
                    </span>
                    <span className="font-semibold text-luar tabular-nums">{e.rho.toFixed(2).replace(".", ",").replace("-", "−")}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
            <Cartao>
              <h3 className="text-[16px] font-semibold text-luar">O que isso não valida</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-nevoa">
                Só essas 5 capitais publicam as compras; nas cidades médias e pequenas não há com o que comparar. E acompanhar o preço não é o objetivo: a nota
                mede o entorno para morar, e um bairro caro pode ter poucos serviços a pé. Medição de {dataBr(v.medidoEm)}.
              </p>
            </Cartao>
          </div>
        </div>
      </Bloco>

      {/* ------------------------------------------------------------------ 09 */}
      <Bloco id="limites" n="09" titulo="Limites e atualização" tinta>
        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao className="bg-noite!">
            <h3 className="text-[16px] font-semibold text-luar">Limites conhecidos</h3>
            <ul className="mt-3 flex flex-col gap-2.5 text-[15px] leading-relaxed text-nevoa">
              <li>
                <span className="font-medium text-luar">Dados de 2022.</span> Censo e cadastro de endereços são de 2022; um bairro que mudou muito depois disso
                pode estar diferente. A renda está em reais de 2022, sem correção.
              </li>
              <li>
                <span className="font-medium text-luar">Mapa aberto desigual.</span> O OpenStreetMap é ótimo em algumas cidades e quase vazio em outras. A regra
                dos 10% evita usar o mapa onde ele está vazio, mas não o corrige.
              </li>
              <li>
                <span className="font-medium text-luar">Interior.</span> Cidades pequenas acham menos endereços no número e ficam mais vezes sem nota; a
                conferência com o preço só foi possível em 5 capitais.
              </li>
              <li>
                <span className="font-medium text-luar">Galeria e shopping</span> contam como um estabelecimento só no cadastro: o centro comercial pode
                aparecer menor do que é.
              </li>
              <li>
                <span className="font-medium text-luar">A grade inclui a zona rural:</span> numa cidade com muita gente no campo, um imóvel no centro sobe de
                posição.
              </li>
              <li>
                <span className="font-medium text-luar">Não é garantia.</span> {NOTA_NAO_GARANTIA}
              </li>
            </ul>
          </Cartao>
          <Cartao className="bg-noite!">
            <h3 className="text-[16px] font-semibold text-luar">Atualização</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-nevoa">
              A posição dos imóveis e a nota são recalculadas quando a base de imóveis é atualizada. Imóvel que entrou depois do último cálculo aparece como
              “ainda não calculada” até o próximo.
            </p>
            <dl className="mt-4 divide-y divide-nevoa/12 text-[14.5px]">
              {[
                ["Cálculo atual", dataBr(r?.geradoEm)],
                ["Censo e cadastro de endereços (IBGE)", "2022"],
                ["Escolas (Inep)", "2025"],
                ["Unidades de saúde (CNES)", "abril de 2026"],
                ["Mapa aberto (OpenStreetMap)", r?.osmDe ? dataBr(r.osmDe) : "—"],
                ["Áreas de risco (IBGE e Cemaden)", "2018, base de 2010"],
              ].map(([k, val]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-nevoa">{k}</dt>
                  <dd className="text-right font-semibold text-luar tabular-nums">{val}</dd>
                </div>
              ))}
            </dl>
          </Cartao>
        </div>
      </Bloco>

      {/* ------------------------------------------------------------------ 10 */}
      <Bloco
        id="fontes"
        n="10"
        titulo="Fontes e licenças"
        lead={<p>Todos os dados são públicos e abertos. Citamos cada fonte como ela pede; nenhum nome de pessoa ou de estabelecimento é publicado, só contagens.</p>}
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {(r?.fontes ?? []).map((f) => (
            <li key={f.nome}>
              <Cartao className="h-full p-4! sm:p-5!">
                <p className="text-[15px] font-semibold text-luar">
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                      {f.nome}
                      <span className="sr-only"> (abre em nova aba)</span>
                    </a>
                  ) : (
                    f.nome
                  )}
                </p>
                <p className="mt-1 text-[14px] leading-snug text-nevoa">{f.detalhe}</p>
                <p className="mt-1.5 text-[13px] text-nevoa">
                  <span className="font-medium text-luar/85">Licença:</span> {f.licenca}
                </p>
              </Cartao>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[80ch] text-[14.5px] leading-relaxed text-nevoa">
          Contém dados do OpenStreetMap,{" "}
          <a href={OSM_ATRIBUICAO.url} target="_blank" rel="noopener noreferrer" className={LINK}>
            {OSM_ATRIBUICAO.texto}
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
          , disponíveis sob a Open Database License (ODbL 1.0); os números derivados do mapa ficam num arquivo à parte, sob a mesma licença. Fonte: IBGE (CNEFE
          2022, Censo Demográfico 2022, Grade Estatística 2022). Geocodificação: IPEA, geocodebr (MIT). Escolas: Inep (CC BY 4.0). Saúde: Ministério da Saúde,
          CNES. Áreas de risco: IBGE e Cemaden.
        </p>
      </Bloco>

      {/* ------------------------------------------------------------------ 11 */}
      <Bloco id="perguntas" n="11" titulo="Perguntas frequentes" tinta>
        <div className="max-w-[860px] border-t border-nevoa/20">
          {FAQ.map((f) => (
            <details key={f.p} className="group/faq border-b border-nevoa/20">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-[17px] leading-snug font-semibold text-luar [&::-webkit-details-marker]:hidden">
                {f.p}
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full border border-latao/60 font-display text-lg text-latao-texto transition-transform duration-300 group-open/faq:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="pr-10 pb-5 text-[15px] leading-relaxed text-nevoa">{f.r}</p>
            </details>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Suspense fallback={null}>
            <VoltarImovel className="btn-primary" rotulo="Voltar ao imóvel" />
          </Suspense>
          <Link href="/assinante" className="btn-outline">
            Ver a nota nos exemplos
          </Link>
          <Link href="/#planos" className="inline-flex min-h-11 items-center font-semibold text-latao-texto no-underline hover:text-luar">
            Conhecer os planos
          </Link>
        </div>
      </Bloco>
    </>
  );
}
