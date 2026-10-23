import "server-only";
import { cookies, headers } from "next/headers";
import { buscar, sobreConjunto } from "@/lib/catalogo/servidor";
import type { Conjunto, ResultadoBusca, SobreConjunto } from "@/lib/catalogo/tipos";
import { lerBusca } from "@/lib/catalogo/url";
import type { PropsCatalogoApp } from "../CatalogoApp";
import { chaveDoEstado } from "./consultas";
import { CHAVE_PREFERENCIAS, CHAVE_TELA, lerPreferencias, lerTela, pareceCelular } from "./preferencias";

type Entrada = Record<string, string | string[] | undefined>;

/**
 * Tudo o que o app do catálogo precisa para a primeira pintura, lido no servidor: a busca da URL já
 * respondida (sem o mapa, que o navegador pede à parte só se ele estiver visível), a preferência de vista
 * (cookie) e o palpite de celular (vista padrão). Se o catálogo falhar, a página sai mesmo assim: o app
 * mostra o aviso com "Tentar de novo" e busca pela API.
 */
export async function carregarCatalogo(
  conjunto: Conjunto,
  parametros: Entrada,
): Promise<{ props: Pick<PropsCatalogoApp, "conjunto" | "servidor" | "preferencias" | "palpiteCelular" | "selosDesligados">; sobre: SobreConjunto; total: number }> {
  const estado = lerBusca(parametros);
  let resultado: ResultadoBusca | null = null;
  let sobre: (SobreConjunto & { total: number; selosDesligados: boolean }) | null = null;
  try {
    [resultado, sobre] = await Promise.all([
      buscar({ conjunto, plano: estado.plano, filtros: estado.filtros, ordem: estado.ordem, pagina: estado.pagina }, { mapa: false }),
      sobreConjunto(conjunto),
    ]);
  } catch (e) {
    console.error(`catalogo (${conjunto}):`, e);
  }
  const [jarra, cabecalhos] = await Promise.all([cookies(), headers()]);
  return {
    props: {
      conjunto,
      servidor: {
        // página além da última: o servidor devolve a última, e o app já começa nela
        pedido: { filtros: estado.filtros, ordem: estado.ordem, pagina: resultado?.pagina ?? estado.pagina, plano: estado.plano },
        resultado,
        chaveUrl: chaveDoEstado(estado),
        vista: estado.vista,
        mapa: estado.mapa,
        camera: estado.camera,
      },
      preferencias: lerPreferencias(jarra.get(CHAVE_PREFERENCIAS)?.value),
      palpiteCelular: pareceCelular(cabecalhos, lerTela(jarra.get(CHAVE_TELA)?.value)),
      selosDesligados: resultado?.selosDesligados ?? sobre?.selosDesligados ?? conjunto === "previa",
    },
    sobre: sobre ?? resultado?.sobre ?? { geradoEm: new Date().toISOString(), fontes: [] },
    total: sobre?.total ?? resultado?.totalConjunto ?? 0,
  };
}
