import { brl, formatDate, listingLabel, type Listing } from "@/content/examples";
import { estiloRecorte } from "@/lib/catalogo/recorte";
import { Seal, SEAL_NAMES } from "@/components/ui/Seal";
import { Tag } from "@/components/ui/Tag";
import { FotoDaFonte } from "@/components/ui/FotoDaFonte";

const RING_LABEL = ["só tags", "1 anel", "2 anéis", "3 anéis"] as const;

/**
 * Moldura de lente: anel de latão + um anel externo por nível de selo. A foto é um <img> simples direto da fonte (nada
 * de next/image: a foto da Caixa fica na Caixa), com largura e altura fixas (sem CLS), preguiçosa e sem referrer. O
 * desenho listrado fica por baixo: sem foto, ou se ela não carregar, é ele que aparece. A foto quebrada sai do DOM pela
 * ilha `FotoDaFonte` (com largura e altura fixas, o Chromium desenharia o ícone de imagem quebrada mesmo com alt vazio),
 * que também marca o cartão (`data-foto="falhou"`) para o rótulo "foto ilustrativa" sumir.
 */
function LensPhoto({ listing, size }: { listing: Listing; size: number }) {
  const { seal } = listing;
  const foto = listing.photo ?? listing.photoIlustrativa?.url ?? null;
  const rings =
    seal === 3
      ? "border-[3px] border-latao shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D,0_0_0_9px_var(--tinta),0_0_0_10.5px_#C9A24D,0_0_28px_rgba(var(--luar-rgb),.35)]"
      : seal === 2
        ? "border-[3px] border-latao shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D] group-hover:shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D,0_0_0_9px_var(--tinta),0_0_0_10.5px_rgba(201,162,77,.35)]"
        : seal === 1
          ? "border-[3px] border-latao group-hover:shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_rgba(201,162,77,.35)]"
          : "border-2 border-nevoa/40";
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full transition-shadow duration-300 ${rings}`}
      style={{ width: size, height: size }}
    >
      <div
        role={foto ? undefined : "img"}
        aria-label={foto ? undefined : "Foto do imóvel ainda não disponível"}
        aria-hidden={foto ? true : undefined}
        className={`photo-placeholder flex h-full w-full items-center justify-center text-center font-mono text-[10px] leading-tight text-nevoa transition-transform duration-500 group-hover:scale-[1.04] ${
          seal === 0 ? "blur-[1px]" : seal === 1 ? "blur-[0.4px]" : ""
        }`}
      >
        foto do
        <br />
        imóvel
      </div>
      {foto && (
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <FotoDaFonte
            src={foto}
            size={size}
            style={estiloRecorte(listing.photoIlustrativa?.recorte)}
            className="absolute inset-0 size-full object-cover transition-[scale] duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        </span>
      )}
    </div>
  );
}

/** A foto do cartão é de outro imóvel (exemplo fictício com foto ilustrativa). */
const fotoIlustrativa = (l: Listing) => !!l.photoIlustrativa && !l.photo;

/** Rótulo do alto do cartão: "Exemplo fictício · foto ilustrativa" quando a foto é de outro imóvel. */
const rotuloCartao = (l: Listing) => (fotoIlustrativa(l) ? `${listingLabel(l)} · foto ilustrativa` : listingLabel(l));

/**
 * Cartão de leilão: foto em moldura de lente, endereço parcial, avaliação, lance mínimo, deságio,
 * praça, selo (1 a 3 anéis) e tags de risco (cor por gravidade, sempre com ícone e texto).
 * No Alvo, o deságio aparece em verde gigante, com a mira travada sobre o cartão.
 *
 * `locked` = visão do plano Lente: tags e selo ficam desfocados, como convite ao upgrade.
 */
export function AuctionCard({
  listing,
  locked = false,
  compact = false,
  headingLevel = 3,
}: {
  listing: Listing;
  locked?: boolean;
  compact?: boolean;
  headingLevel?: 3 | 4;
}) {
  const l = listing;
  const alvo = l.seal === 3;
  const H = `h${headingLevel}` as "h3" | "h4";
  const sealTone = alvo ? "text-pos" : l.seal > 0 ? "text-latao-texto" : "text-nevoa";
  const lockCls = locked ? "blur-[5px] select-none" : "";

  return (
    <article
      aria-label={`${rotuloCartao(l)}: ${l.title}, ${l.place}, ${SEAL_NAMES[l.seal]}`}
      data-foto={l.photo || l.photoIlustrativa ? "fonte" : undefined}
      className={`group group/foto relative isolate overflow-hidden rounded-[20px] bg-tinta transition-[transform,border-color,box-shadow] duration-300 ease-luneta hover:-translate-y-1 ${
        compact ? "p-4" : "p-6"
      } ${
        alvo
          ? "border-[1.5px] border-latao/70 shadow-[0_0_0_1px_rgba(201,162,77,.2),0_0_80px_rgba(var(--luar-rgb),.08)]"
          : "border border-nevoa/20 hover:border-latao/55 hover:shadow-[0_20px_50px_rgba(0,0,0,.25)]"
      }`}
    >
      {alvo && !locked && (
        <>
          {/* mira travada sobre o cartão */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(var(--luar-rgb),.06)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--luar-rgb),.06)_1px,transparent_1px)] bg-[length:100%_50%,50%_100%] bg-[position:50%_0,0_50%] bg-no-repeat"
          />
          <div aria-hidden="true" className="absolute top-4 right-4 transition-transform duration-[1.2s] ease-luneta group-hover:rotate-90">
            <svg width="44" height="44" viewBox="-8 -8 60 60" className="overflow-visible drop-shadow-[0_0_7px_rgba(var(--luar-rgb),.4)]">
              <circle cx="22" cy="22" r="21" fill="none" stroke="var(--luar)" strokeWidth="1.5" />
              <path d="M22 -7v10M22 41v10M-7 22h10M41 22h10" stroke="var(--luar)" strokeWidth="1.5" />
              <circle cx="22" cy="22" r="2" fill="#4ADE9A" />
            </svg>
          </div>
        </>
      )}

      {/* cada parte quebra inteira (nunca "foto" numa linha e "ilustrativa" na outra); a mira do Alvo fica à direita.
          Se a foto não carregar, o "· foto ilustrativa" some com ela (data-foto="falhou", marcado pela FotoDaFonte). */}
      <p className={`text-[10px] font-medium tracking-[0.14em] text-nevoa uppercase ${alvo && !locked ? "pr-12" : ""}`}>
        {fotoIlustrativa(l) ? (
          <>
            {/* quebrando, o ponto fica no fim da 1ª linha: "Exemplo fictício ·" / "foto ilustrativa" */}
            <span className="whitespace-nowrap">
              {listingLabel(l)}
              <span className="group-data-[foto=falhou]/foto:hidden"> ·</span>
            </span>{" "}
            <span className="whitespace-nowrap group-data-[foto=falhou]/foto:hidden">foto ilustrativa</span>
          </>
        ) : (
          listingLabel(l)
        )}
      </p>

      <div className="mt-4 flex items-center gap-3.5">
        <LensPhoto listing={l} size={compact ? 64 : 84} />
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase ${sealTone} ${lockCls}`} aria-hidden={locked || undefined}>
            {l.seal > 0 && <Seal level={l.seal} size={18} />}
            {SEAL_NAMES[l.seal]} · {RING_LABEL[l.seal]}
          </p>
          <H className="mt-1.5 font-display text-lg leading-tight font-bold tracking-[-0.01em]">
            {l.source ? (
              // caso real: o cartão inteiro leva ao anúncio no site do leiloeiro (link "esticado")
              <a
                href={l.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-luar no-underline after:absolute after:inset-0 after:z-[1] after:rounded-[20px] after:content-[''] hover:text-luar"
              >
                {l.title}
                <span className="sr-only"> (abre o anúncio no site do leiloeiro, em nova aba)</span>
              </a>
            ) : (
              l.title
            )}
          </H>
          <p className="mt-0.5 text-[13px] leading-snug text-nevoa">{l.place}</p>
        </div>
      </div>

      <p
        className={`mt-5 font-display leading-[0.9] font-bold ${
          alvo
            ? "text-[clamp(56px,6vw,80px)] tracking-[-0.05em] text-pos transition-[text-shadow] duration-300 group-hover:[text-shadow:0_0_30px_rgba(74,222,154,.45)]"
            : `text-[44px] tracking-[-0.04em] ${l.seal === 0 ? "text-nevoa" : "text-luar"}`
        } ${compact ? "!text-4xl" : ""}`}
      >
        −{l.desagio}%<span className="sr-only"> de deságio</span>
      </p>
      <p aria-hidden="true" className="mt-2 text-xs font-medium tracking-[0.06em] text-nevoa uppercase">
        deságio
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px] leading-snug text-nevoa">
        <div>
          <dt>Avaliação</dt>
          <dd className="font-semibold text-luar">{brl(l.avaliacao)}</dd>
        </div>
        <div>
          <dt>Lance mínimo</dt>
          <dd className="font-semibold text-luar">{brl(l.lance)}</dd>
        </div>
        <div>
          <dt>Praça</dt>
          <dd className="font-semibold text-luar">
            {l.praca} · {l.date}
          </dd>
        </div>
        {alvo && (
          <div className={lockCls} aria-hidden={locked || undefined}>
            <dt>Status</dt>
            <dd className="font-semibold text-luar">Nenhum risco identificado</dd>
          </div>
        )}
      </dl>

      <div className="relative mt-4">
        <ul data-tags aria-label={locked ? undefined : "Tags de risco"} aria-hidden={locked || undefined} className={`flex flex-wrap gap-1.5 ${lockCls}`}>
          {l.tags.map((t) => (
            <li key={t.label}>
              <Tag {...t} />
            </li>
          ))}
        </ul>
        {locked && (
          <p className="absolute inset-0 z-[2] flex items-center justify-center">
            <span className="rounded-full border border-latao/60 bg-noite/85 px-3 py-1.5 text-[11px] font-semibold text-latao-texto">
              Tags e selo visíveis no plano Luneta
            </span>
          </p>
        )}
      </div>

      {l.source && (
        <p className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-nevoa/15 pt-3 text-xs text-nevoa">
          <span>Dados de {formatDate(l.source.coletadoEm)} · confira o edital</span>
          <span aria-hidden="true" className="font-semibold text-latao-texto transition-transform group-hover:translate-x-0.5">
            Ver no {l.source.leiloeiro} ↗
          </span>
        </p>
      )}
    </article>
  );
}
