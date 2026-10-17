import type { ImovelDetalhe, Vizinhanca } from "@/lib/catalogo/tipos";
import { IconeExterno } from "./icones";
import { NovaAba } from "./partes";

type Nivel = "rua" | "bairro" | "cidade";

const NIVEIS: readonly Nivel[] = ["rua", "bairro", "cidade"];
const TITULO: Record<Nivel, string> = { rua: "Na mesma rua", bairro: "No mesmo bairro", cidade: "Na cidade" };
/** Nomes curtos nos botões (o nome inteiro vai no título e no texto para leitor de tela). */
const CURTO: Record<string, string> = { "Zap Imóveis": "Zap" };

/**
 * "Veja anúncios parecidos nos portais": as buscas prontas agrupadas pelo alcance (na mesma rua, no mesmo bairro,
 * na cidade), cada grupo com os portais e uma busca geral do Google. Só links: a Luneta não copia anúncios.
 */
export function BuscasPortais({ imovel: i, buscas, rua }: { imovel: Pick<ImovelDetalhe, "bairro" | "cidade" | "uf">; buscas: Vizinhanca["buscasExternas"]; rua: string | null }) {
  // dados antigos, sem o nível: a busca leva o bairro quando há bairro
  const nivelDe = (b: Vizinhanca["buscasExternas"][number]): Nivel => b.nivel ?? (i.bairro ? "bairro" : "cidade");
  const grupos = NIVEIS.map((n) => ({ n, links: buscas.filter((b) => nivelDe(b) === n) })).filter((g) => g.links.length > 0);
  if (grupos.length === 0) return null;
  const lugar: Record<Nivel, string | null> = { rua, bairro: i.bairro, cidade: `${i.cidade}/${i.uf}` };

  return (
    <div className="rounded-3xl border border-nevoa/15 bg-tinta px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
      <h3 className="font-display text-[17px] leading-snug font-bold tracking-[-0.01em] text-luar">Veja anúncios parecidos nos portais</h3>
      <p className="mt-1 max-w-[64ch] text-[13px] leading-relaxed text-nevoa">
        Cada botão abre em nova aba
        <IconeExterno tamanho={13} className="mx-1 inline-block align-[-2px]" />
        uma busca do Google só com anúncios daquele portal, com o tipo, os quartos e o lugar deste imóvel.
      </p>
      <div className="mt-2">
        {grupos.map(({ n, links }) => (
          <div key={n} className="grid gap-x-4 gap-y-2.5 border-t border-nevoa/12 py-3.5 first:border-t-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center">
            <div className="min-w-0">
              <p className="text-[14px] leading-snug font-semibold text-luar">{TITULO[n]}</p>
              {lugar[n] && (
                <p title={lugar[n] ?? undefined} className="mt-0.5 truncate text-[12.5px] leading-snug text-nevoa">
                  {lugar[n]}
                </p>
              )}
            </div>
            <ul aria-label={`Buscas ${TITULO[n].toLowerCase()}`} className="flex flex-wrap gap-1.5">
              {links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={l.descricao}
                    className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-medium no-underline transition-colors pointer-fine:min-h-9 ${
                      l.rotulo === "Google"
                        ? "border-dashed border-nevoa/40 text-nevoa hover:border-latao hover:text-luar"
                        : "border-nevoa/30 text-luar hover:border-latao hover:bg-latao/10"
                    }`}
                  >
                    {l.rotulo === "Google" ? "Google" : (CURTO[l.rotulo] ?? l.rotulo)}
                    <span className="sr-only">: {l.descricao ?? "busca no Google"}</span>
                    <NovaAba />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t border-nevoa/12 py-3 text-[12px] leading-relaxed text-nevoa">
        A Luneta não copia nem mostra anúncios: a comparação com o preço pedido nos portais fica com você.
      </p>
    </div>
  );
}
