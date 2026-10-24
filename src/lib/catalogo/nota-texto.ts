/**
 * Textos da nota de localização na tela (página do imóvel, lista, PDF e a página pública do método). Funções puras,
 * iguais no servidor e no navegador: a frase do percentil, o selo da precisão, os terços da cidade pequena, os textos
 * da área de risco e o que cada uma das seis partes mede.
 *
 * Regras de texto (rodada 4):
 * - nunca "melhor que 100%" nem "que 0%": a frase fica entre 1 e 99 ou vira "entre os 1% mais bem localizados";
 * - nunca "sem risco" nem "risco zero": sem mapeamento não quer dizer sem risco;
 * - a nota não é garantia (o cartão diz isso uma vez).
 *
 * Sem imports com "@/" (os testes rodam em Node puro) e sem nada de localizacao.ts (que lê arquivos: não pode ir para o
 * navegador). Os pesos vêm do dado (`ComponenteLocal.peso` ou `pesos` do arquivo), nunca daqui.
 */
import { numero } from "./rotulos";
import type { ChaveComponenteLocal, ComponenteLocal, LocalizacaoImovel, PrecisaoGeo } from "./tipos";

/** Endereço da página pública do método (a página do imóvel leva até ela com ?de=<id>). */
export const ROTA_METODO_LOCAL = "/metodologia/localizacao";

/**
 * Link da página do método vindo de um imóvel (o "Voltar ao imóvel" de lá usa o id, no Lente o plano e, para um imóvel
 * real aberto na demonstração (a vitrine da /assinante), `c=assinante`: a volta é para a demonstração, não a prévia).
 */
export function rotaMetodoLocal(deId?: string | null, plano?: "lente" | "luneta", conjunto?: "previa" | "exemplos") {
  if (!deId) return ROTA_METODO_LOCAL;
  const demo = conjunto === "exemplos" && !deId.startsWith("ex-");
  return `${ROTA_METODO_LOCAL}?de=${encodeURIComponent(deId)}${plano === "lente" ? "&plano=lente" : ""}${demo ? "&c=assinante" : ""}`;
}

/** De que conjunto é o imóvel do "?de=" da página do método: os ex-* e os reais com `c=assinante` são da demonstração. */
export function conjuntoDoMetodo(deId: string, c: string | null): "previa" | "exemplos" {
  return deId.startsWith("ex-") || c === "assinante" ? "exemplos" : "previa";
}

/** Ids que a página do método aceita no "?de=" (os do catálogo: caixa-..., lj-..., ex-...). */
export function idDeImovelValido(id: string | null | undefined): id is string {
  return !!id && /^(caixa|lj|ex)-[A-Za-z0-9_-]{1,60}$/.test(id);
}

/** Atribuição do OpenStreetMap (ODbL): sempre com o link da página de direitos autorais. */
export const OSM_ATRIBUICAO = { texto: "© contribuidores do OpenStreetMap", url: "https://www.openstreetmap.org/copyright" } as const;

// ---------------------------------------------------------------------------
// Cidade na frase
// ---------------------------------------------------------------------------

/** Cidades que pedem artigo ("do Rio de Janeiro", "do Recife"); as outras vão com "de". */
const COM_ARTIGO: Record<string, "do" | "da"> = {
  "Rio de Janeiro": "do",
  Recife: "do",
  Crato: "do",
  "Cabo de Santo Agostinho": "do",
  "Rio Grande": "do",
  // o uso comum (revisão final da rodada 4, M18): "da Serra", "da Praia Grande", "do Guarujá"
  Serra: "da",
  "Praia Grande": "da",
  "Guarujá": "do",
};

/** "de São Gonçalo/RJ", "do Rio de Janeiro/RJ" (com a UF quando o nome vem como "Cidade/UF"). */
export function daCidade(nome: string): string {
  const cidade = nome.split("/")[0]!.trim();
  return `${COM_ARTIGO[cidade] ?? "de"} ${nome}`;
}

// ---------------------------------------------------------------------------
// A frase do percentil
// ---------------------------------------------------------------------------

/** Nota de 0 a 100, inteira e dentro da escala (dado fora do padrão não estoura a régua nem a frase). */
export function notaNaEscala(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * "Melhor localizado que 78% dos moradores de São Gonçalo/RJ". Nas pontas: 99 ou 100 viram "Entre os 1% mais bem
 * localizados de ...", e 0 vira "menos de 1%" (nunca "100%" nem "0%").
 */
export function frasePercentil(nota: number, cidade: string): string {
  const n = notaNaEscala(nota);
  if (n >= 99) return `Entre os 1% mais bem localizados ${daCidade(cidade)}`;
  if (n < 1) return `Melhor localizado que menos de 1% dos moradores ${daCidade(cidade)}`;
  return `Melhor localizado que ${n}% dos moradores ${daCidade(cidade)}`;
}

/**
 * Nota aproximada (só o bairro): "Nota provável entre 41 e 76 (faixa do meio), comparada com os moradores de Santos/SP"
 * (pontas entre 1 e 99). A faixa vai do quartil de baixo ao de cima das áreas habitadas em volta do ponto: é a metade do
 * meio, não o intervalo inteiro (revisão final da rodada 4, M4).
 */
export function fraseFaixa(faixa: readonly [number, number], cidade: string): string {
  const lo = Math.min(99, Math.max(1, notaNaEscala(Math.min(faixa[0], faixa[1]))));
  const hi = Math.min(99, Math.max(1, notaNaEscala(Math.max(faixa[0], faixa[1]))));
  if (lo === hi) return frasePercentil(lo, cidade);
  return `Nota provável entre ${lo} e ${hi} (faixa do meio), comparada com os moradores ${daCidade(cidade)}`;
}

/**
 * Onde as partes e o risco foram medidos, na frase (M2, M3, M13): "o imóvel" (número), "o ponto da rua do endereço"
 * (rua), "o meio da rua do endereço" (bairro com a rua achada, mas espalhada) ou "o centro do bairro".
 */
export function pontoMedido(loc: Pick<LocalizacaoImovel, "precisao"> & { pontoRuaEspalhada?: boolean }): { o: string; do: string; no: string; exato: boolean } {
  if (loc.precisao === "numero") return { o: "o imóvel", do: "do imóvel", no: "no imóvel", exato: true };
  if (loc.precisao === "rua") return { o: "o ponto da rua do endereço", do: "do ponto da rua do endereço", no: "no ponto da rua do endereço", exato: false };
  if (loc.precisao === "bairro" && loc.pontoRuaEspalhada) return { o: "o meio da rua do endereço", do: "do meio da rua do endereço", no: "no meio da rua do endereço", exato: false };
  return { o: "o centro do bairro", do: "do centro do bairro", no: "no centro do bairro", exato: false };
}

/** A nota grande: "78"; a aproximada com "~" ("~59"). */
export function notaGrande(loc: Pick<LocalizacaoImovel, "situacao" | "nota">): string | null {
  if (loc.nota === null || (loc.situacao !== "calculada" && loc.situacao !== "aproximada")) return null;
  return `${loc.situacao === "aproximada" ? "~" : ""}${notaNaEscala(loc.nota)}`;
}

/**
 * Selo curto da lista (cartão e linha): "78", ou "~45" quando o ponto é só o do bairro (a nota do resumo é o meio da
 * faixa). null sem nota (e sempre no Lente, em que o servidor não manda a nota).
 */
export function notaCurta(i: { notaLocal: number | null; precisaoGeo: PrecisaoGeo | null }): { texto: string; aproximada: boolean; sr: string } | null {
  if (i.notaLocal === null || !Number.isFinite(i.notaLocal)) return null;
  const n = notaNaEscala(i.notaLocal);
  const aproximada = i.precisaoGeo === "bairro";
  return {
    texto: `${aproximada ? "~" : ""}${n}`,
    aproximada,
    sr: aproximada ? `Nota de localização aproximada: cerca de ${n} de 100` : `Nota de localização: ${n} de 100`,
  };
}

// ---------------------------------------------------------------------------
// Precisão do ponto
// ---------------------------------------------------------------------------

const KM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "±10 m", "±870 m", "±1,2 km" (incerteza do ponto; o número e a unidade não se separam na quebra de linha). */
export function desvioTexto(m: number): string {
  if (m >= 1000) return `±${KM.format(m / 1000)} km`;
  return `±${numero(Math.max(1, Math.round(m)))} m`;
}

export interface SeloPrecisao {
  /** "Endereço localizado no número (±10 m)" */
  rotulo: string;
  /** a explicação do pop-up */
  explicacao: string;
  /** boa (número), media (rua), fraca (bairro), sem (cidade, sem ponto) */
  nivel: "boa" | "media" | "fraca" | "sem";
}

/**
 * O selo da precisão do ponto, com a explicação. Exemplo fictício: diz que a posição é inventada.
 * - número: "Endereço localizado no número (±10 m)";
 * - rua: "Endereço localizado na rua (±120 m)";
 * - bairro: "Só no bairro: nota aproximada";
 * - cidade ou sem ponto: "Endereço só na cidade".
 */
export function seloPrecisao(
  loc: Pick<LocalizacaoImovel, "precisao" | "desvioM" | "situacao" | "faixa"> & { pontoRuaEspalhada?: boolean },
  exemplo = false,
): SeloPrecisao | null {
  if (exemplo) {
    return {
      rotulo: "Exemplo fictício",
      explicacao: "A posição, a nota, as partes e os números deste exemplo foram inventados para mostrar como a seção aparece. O imóvel não existe.",
      nivel: "media",
    };
  }
  const d = loc.desvioM !== null && loc.desvioM > 0 ? ` (${desvioTexto(loc.desvioM)})` : "";
  switch (loc.precisao) {
    case "numero":
      return {
        rotulo: `Endereço localizado no número${d}`,
        explicacao:
          "O endereço publicado pela fonte foi encontrado no número, no cadastro de endereços do IBGE (CNEFE 2022). O ponto pode variar " +
          `${loc.desvioM ? `cerca de ${desvioTexto(loc.desvioM).slice(1)}` : "alguns metros"} em volta: a nota é medida nesse ponto.`,
        nivel: "boa",
      };
    case "rua":
      return {
        rotulo: `Endereço localizado na rua${d}`,
        explicacao:
          "A rua foi encontrada no cadastro de endereços do IBGE (CNEFE 2022), mas não o número exato: o ponto fica na rua, " +
          `${loc.desvioM ? `com incerteza de cerca de ${desvioTexto(loc.desvioM).slice(1)}` : "perto do imóvel"}. A nota é medida nesse ponto.`,
        nivel: "media",
      };
    case "bairro": {
      const faixa = loc.faixa
        ? ` Metade das áreas habitadas em volta tem nota entre ${notaNaEscala(Math.min(...loc.faixa))} e ${notaNaEscala(Math.max(...loc.faixa))}; um quarto fica abaixo e um quarto acima.`
        : "";
      const incerteza = loc.desvioM ? desvioTexto(loc.desvioM).slice(1) : null;
      // a rua foi achada, mas os endereços dela se espalham demais: o ponto é o meio da rua, não o centro do bairro (M3)
      if (loc.pontoRuaEspalhada) {
        return {
          rotulo: loc.situacao === "aproximada" ? "Rua espalhada: nota aproximada" : "Endereço localizado na rua, com incerteza alta",
          explicacao:
            `A rua do endereço foi encontrada no cadastro do IBGE, mas os endereços dela se espalham${incerteza ? ` por cerca de ${incerteza}` : " demais"}: ` +
            `o ponto é o meio da rua, e a nota é aproximada, a faixa do meio das áreas habitadas em volta desse ponto.${faixa} O número do meio é o que vale para ordenar e filtrar.`,
          nivel: "fraca",
        };
      }
      return {
        rotulo: loc.situacao === "aproximada" ? "Só no bairro: nota aproximada" : "Endereço localizado só no bairro",
        explicacao:
          "A rua do endereço não foi encontrada no cadastro do IBGE, só o bairro. O ponto é o centro do bairro" +
          `${incerteza ? ` (incerteza de cerca de ${incerteza})` : ""}, e a nota é a faixa do meio das áreas habitadas em volta desse centro.` +
          `${faixa} O número do meio é o que vale para ordenar e filtrar.`,
        nivel: "fraca",
      };
    }
    case "cidade":
    case null:
      return {
        rotulo: "Endereço localizado só na cidade",
        explicacao: "Sem a rua nem o bairro, o ponto no mapa é a sede do município: uma nota aqui diria mais do que sabemos.",
        nivel: "sem",
      };
  }
}

// ---------------------------------------------------------------------------
// Cidade pequena: terços
// ---------------------------------------------------------------------------

export type Terco = "baixo" | "medio" | "alto";

/** "acima da maioria da cidade" (a posição em terços, sem número de 0 a 100). */
export const TERCO_FRASE: Record<Terco, string> = {
  alto: "acima da maioria da cidade",
  medio: "no meio da cidade",
  baixo: "abaixo da maioria da cidade",
};

/** Rótulo curto do terço ("Acima da maioria"). */
export const TERCO_CURTO: Record<Terco, string> = { alto: "Acima da maioria", medio: "No meio", baixo: "Abaixo da maioria" };

/** A cidade é pequena (as partes vêm em terços, sem nota de 0 a 100)? */
export function cidadePequena(loc: Pick<LocalizacaoImovel, "componentes">): boolean {
  return loc.componentes.some((c) => c.terco !== undefined && c.terco !== null);
}

/** Quantas partes ficam em cada terço (só as que têm terço). */
export function contarTercos(componentes: readonly Pick<ComponenteLocal, "terco">[]): Record<Terco, number> & { total: number } {
  const n = { alto: 0, medio: 0, baixo: 0, total: 0 };
  for (const c of componentes) {
    if (!c.terco) continue;
    n[c.terco] += 1;
    n.total += 1;
  }
  return n;
}

const LISTA_E = (itens: string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);

/**
 * As três contagens numa frase só, a mesma no topo, no cartão e no PDF. Antes o topo contava só as partes "acima" e o
 * cartão escolhia um lado no empate: o resumo puxava para o positivo (revisão final da rodada 4, M5).
 * "1 parte acima da maioria, 3 no meio e 2 abaixo" (o terço sem parte fica de fora). null sem nenhuma parte.
 */
export function tercosEmFrase(componentes: readonly Pick<ComponenteLocal, "terco">[]): string | null {
  const n = contarTercos(componentes);
  if (n.total === 0) return null;
  const partes = (k: number) => `${k} ${k === 1 ? "parte" : "partes"}`;
  const itens: string[] = [];
  if (n.alto) itens.push(`${partes(n.alto)} acima da maioria`);
  if (n.medio) itens.push(itens.length ? `${n.medio} no meio` : `${partes(n.medio)} no meio`);
  if (n.baixo) itens.push(itens.length ? `${n.baixo} abaixo${n.alto ? "" : " da maioria"}` : `${partes(n.baixo)} abaixo da maioria`);
  return LISTA_E(itens);
}

/**
 * Resumo da cidade pequena: "Comparado com o resto de Canitar/SP, das 6 partes: 1 parte acima da maioria, 3 no meio e 2
 * abaixo." Sempre as três contagens (a mesma frase do topo e do PDF), contando só as partes com terço.
 */
export function resumoTercos(componentes: readonly Pick<ComponenteLocal, "terco">[], cidade: string): string {
  const frase = tercosEmFrase(componentes);
  if (!frase) return `Não há dados do entorno suficientes para comparar com o resto ${daCidade(cidade)}.`;
  const n = contarTercos(componentes);
  return `Comparado com o resto ${daCidade(cidade)}, ${n.total === 1 ? "na única parte medida" : `das ${n.total} partes`}: ${frase}.`;
}

// ---------------------------------------------------------------------------
// Área de risco
// ---------------------------------------------------------------------------

function metros(m: number) {
  return m >= 1000 ? `${KM.format(m / 1000)} km` : `${numero(Math.round(m))} m`;
}

/**
 * O que a tela diz quando NÃO há alerta (nunca "sem risco"):
 * - a cidade não tem mapeamento: "Esta cidade não tem mapeamento de risco nessa base; isso não quer dizer que não haja
 *   risco.";
 * - a cidade tem e o ponto foi conferido: "Nenhuma área de risco mapeada a menos de 100 m do imóvel" (na rua, "do ponto
 *   da rua do endereço"; no bairro, "do centro do bairro"), com a ressalva;
 * - a cidade não foi encontrada nas bases, ou o imóvel é rural: "não conferida" (não é "sem mapeamento");
 * - a cidade tem, mas o ponto não deu para conferir (endereço só na cidade).
 */
export function textoRiscoSemAlerta(
  loc: Pick<LocalizacaoImovel, "coberturaRisco" | "riscoRaioM" | "precisao"> &
    Partial<Pick<LocalizacaoImovel, "referencia" | "motivo" | "situacao">> & { pontoRuaEspalhada?: boolean },
): { titulo: string; texto: string } {
  // a cidade não foi encontrada nas bases: a cobertura é desconhecida, não ausente (M16)
  if (loc.referencia === null && loc.situacao === "sem_nota") {
    return {
      titulo: "Área de risco: não conferida",
      texto: "Não conferimos áreas de risco: a cidade deste imóvel não foi encontrada nas bases do IBGE usadas aqui. Isso não quer dizer que não haja risco; confira com a Defesa Civil do município.",
    };
  }
  // imóvel rural (M16)
  if (/^Imóvel rural/.test(loc.motivo ?? "")) {
    return {
      titulo: "Área de risco: não conferida",
      texto: "Imóvel rural: não conferimos a área de risco. Isso não quer dizer que não haja risco; confira com a Defesa Civil do município.",
    };
  }
  if (!loc.coberturaRisco) {
    return {
      titulo: "Sem mapeamento de risco nesta cidade",
      texto: "Esta cidade não tem mapeamento de risco nessa base (IBGE e Cemaden, base de 2010); isso não quer dizer que não haja risco. Confira com a Defesa Civil do município.",
    };
  }
  if (loc.riscoRaioM === null) {
    return {
      titulo: "Área de risco: não deu para conferir",
      texto: "A cidade tem áreas de risco mapeadas pelo IBGE e pelo Cemaden (base de 2010), mas sem a rua ou o bairro do imóvel não dá para saber se ele fica perto de uma. Confira com a Defesa Civil do município.",
    };
  }
  // fora do número exato, "do ponto do endereço", nunca "do imóvel" (M2)
  const onde = `a menos de ${metros(loc.riscoRaioM)} ${pontoMedido(loc).do}`;
  return {
    titulo: `Nenhuma área de risco mapeada ${onde}`,
    texto: "Conferido no mapeamento do IBGE e do Cemaden, com base de 2010. Isso não quer dizer que não haja risco: o mapeamento não cobre tudo e é antigo. Confira com a Defesa Civil do município.",
  };
}

/**
 * "dentro de área de risco mapeada" ou "área de risco mapeada a cerca de 260 m" (frase curta do alerta, para o resumo).
 * Fora do número exato, diz de que ponto ("do ponto da rua do endereço", "do centro do bairro").
 */
export function ondeRisco(distanciaM: number | null, loc: Pick<LocalizacaoImovel, "precisao"> & { pontoRuaEspalhada?: boolean }): string {
  const p = pontoMedido(loc);
  if (distanciaM === null) return loc.precisao === "bairro" && !loc.pontoRuaEspalhada ? "área de risco mapeada no bairro" : "área de risco mapeada perto";
  if (distanciaM <= 0) return p.exato ? "dentro de área de risco mapeada" : `${p.o.replace(/^o /, "")} dentro de área de risco mapeada`;
  return `área de risco mapeada a cerca de ${metros(distanciaM)}${p.exato ? "" : ` ${p.do}`}`;
}

// ---------------------------------------------------------------------------
// As seis partes
// ---------------------------------------------------------------------------

export interface SobreComponente {
  /** uma linha: o que entra */
  curto: string;
  /** o que é medido, em português simples */
  oQueMede: string;
  /** o raio, em linha reta */
  raio: string;
  /** de onde vem e de quando */
  fontes: string;
}

/** O que cada parte mede, o raio e a fonte (o pop-up do cartão e a página do método; o peso vem do dado). */
export const SOBRE_COMPONENTE: Record<ChaveComponenteLocal, SobreComponente> = {
  servicos: {
    curto: "Mercados, farmácias, padarias, escolas e unidades de saúde por perto.",
    oQueMede:
      "Quantos mercados, farmácias e padarias há a até 500 m, e quantas escolas em atividade e unidades de saúde (postos, UBS, policlínicas, hospitais e pronto atendimento) a até 1 km. O primeiro de cada um vale mais que o décimo.",
    raio: "500 m (mercado, farmácia e padaria) e 1 km (escola e saúde)",
    fontes: "IBGE (CNEFE 2022), Inep (Censo Escolar 2025) e Ministério da Saúde (CNES, abril de 2026)",
  },
  infra: {
    curto: "Rua pavimentada, calçada, iluminação pública e esgoto pela rede.",
    oQueMede: "Que parte dos domicílios em volta fica em rua pavimentada, com calçada e com iluminação pública, e tem esgoto pela rede geral.",
    raio: "500 m",
    fontes: "IBGE (Censo Demográfico 2022, entorno dos domicílios)",
  },
  transporte: {
    curto: "Estação de metrô, trem, BRT, barca ou terminal, e pontos de ônibus.",
    oQueMede:
      "A distância até a estação de metrô, trem, VLT, BRT, barca ou terminal de ônibus mais perto, quantos pontos de ônibus há a até 500 m e que parte dos domicílios fica em quadra com ponto de ônibus. Os pontos de ônibus do OpenStreetMap só entram quando o mapa da cidade tem pelo menos um décimo dos pontos que o Censo registra e o morador típico tem pelo menos um ponto mapeado a 500 m; fora disso, o transporte fica com a estação e o ponto na quadra do Censo.",
    raio: "até 5 km (estação) e 500 m (pontos de ônibus)",
    fontes: "OpenStreetMap e IBGE (Censo Demográfico 2022)",
  },
  renda: {
    curto: "Renda típica dos moradores em volta.",
    oQueMede:
      "A renda típica de quem sustenta cada domicílio em volta (a mediana de cada pequena área do Censo), ponderada pelos domicílios no raio. Valores de 2022, sem correção.",
    raio: "500 m (1 km onde há menos de 50 domicílios)",
    fontes: "IBGE (Censo Demográfico 2022, renda do responsável; valores de 2022)",
  },
  comercio: {
    curto: "Comércios e serviços em volta.",
    oQueMede: "Quantos comércios e serviços (lojas, escritórios, oficinas, bancos) há a até 1 km. Mostra o movimento do bairro; pesa pouco porque não acompanha o preço.",
    raio: "1 km",
    fontes: "IBGE (CNEFE 2022, estabelecimentos)",
  },
  lazer: {
    curto: "Parque, praça ou parquinho mais perto.",
    oQueMede: "A distância até o parque, a praça ou o parquinho mais perto.",
    raio: "até 3 km",
    fontes: "OpenStreetMap",
  },
};

/** A nota de uma parte em frase: "26 de 100: melhor que o entorno de 26% dos moradores" (pontas como a da nota). */
export function frasePartePercentil(nota: number): string {
  const n = notaNaEscala(nota);
  if (n >= 99) return `${n} de 100: entre os 1% melhores da cidade nesta parte`;
  if (n < 1) return `${n} de 100: melhor que o entorno de menos de 1% dos moradores`;
  return `${n} de 100: melhor que o entorno de ${n}% dos moradores`;
}

/** Texto do indicador com o comum na cidade: "Mercados a até 500 m: 12 · comum na cidade: 5". */
export function textoIndicador(i: { rotulo: string; valor: string; comum: string | null }): string {
  return i.comum !== null ? `${i.rotulo}: ${i.valor} · comum na cidade: ${i.comum}` : `${i.rotulo}: ${i.valor}`;
}

/** Componente sem dado nesta cidade: o peso foi para as outras partes. */
export const SEM_DADO_COMPONENTE = "sem dado nesta cidade, peso redistribuído";

/** "26 de 100", "acima da maioria da cidade" (cidade pequena) ou "sem dado nesta cidade, peso redistribuído". */
export function valorComponente(c: Pick<ComponenteLocal, "nota" | "terco">): string {
  if (c.terco) return TERCO_FRASE[c.terco];
  if (c.nota === null) return SEM_DADO_COMPONENTE;
  return `${notaNaEscala(c.nota)} de 100`;
}

/** Por que não há nota, em poucas palavras ("endereço só na cidade", "imóvel rural"...), para o resumo e a lista. */
export function motivoCurto(loc: Pick<LocalizacaoImovel, "situacao" | "precisao" | "motivo" | "componentes">): string {
  if (loc.situacao === "pendente") return "ainda não calculada";
  if (cidadePequena(loc)) return "cidade pequena";
  const m = loc.motivo ?? "";
  if (/^Imóvel rural/.test(m)) return "imóvel rural";
  if (/não foi encontrada nas bases/.test(m)) return "cidade fora da base";
  if (loc.precisao === "cidade" || loc.precisao === null) return "endereço só na cidade";
  return "dados insuficientes";
}

/**
 * A linha do resumo lateral: "Melhor localizado que 78% dos moradores", "Aproximada, entre 41 e 76 (só o bairro)",
 * "Cidade pequena: 1 parte acima da maioria, 3 no meio e 2 abaixo" ou "Sem nota: endereço só na cidade".
 */
export function linhaResumoNota(loc: Pick<LocalizacaoImovel, "situacao" | "precisao" | "motivo" | "componentes" | "nota" | "faixa">): string {
  if (cidadePequena(loc)) {
    const frase = tercosEmFrase(loc.componentes);
    return frase ? `Cidade pequena: ${frase}` : "Cidade pequena: veja as partes em terços";
  }
  if (loc.situacao === "aproximada" && loc.nota !== null) {
    return loc.faixa
      ? `Aproximada, entre ${notaNaEscala(Math.min(...loc.faixa))} e ${notaNaEscala(Math.max(...loc.faixa))} (só o bairro)`
      : "Aproximada (só o bairro)";
  }
  if (loc.situacao === "calculada" && loc.nota !== null) {
    const n = notaNaEscala(loc.nota);
    if (n >= 99) return "Entre os 1% mais bem localizados da cidade";
    if (n < 1) return "Melhor localizado que menos de 1% dos moradores";
    return `Melhor localizado que ${n}% dos moradores`;
  }
  const m = motivoCurto(loc);
  return m === "ainda não calculada" ? "Ainda não calculada" : `Sem nota: ${m}`;
}

/** A frase de que a nota não é garantia (dita uma vez no cartão, no PDF e na página do método). */
export const NOTA_NAO_GARANTIA =
  "A nota resume dados públicos do entorno (a maior parte de 2022) e não é garantia nem avaliação do imóvel: visite o local antes de decidir.";
