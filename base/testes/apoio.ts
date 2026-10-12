/**
 * Apoio aos testes: banco em memória, imóvel de exemplo e conector falso. Também serve de
 * modelo para os testes dos conectores. Dados fictícios.
 */
import { abrirBanco, type Banco } from "../db.ts";
import type { Conector, ImovelNormalizado, OpcoesColeta, RegistroNormalizado } from "../tipos.ts";
import { criarClienteHttp, type ClienteHttp } from "../util/http.ts";

export function bancoEmMemoria(): Banco {
  return abrirBanco(":memory:");
}

/** Imóvel válido e fictício; sobreponha o que precisar. */
export function imovelExemplo(sobrepor: Partial<ImovelNormalizado> = {}): ImovelNormalizado {
  return {
    registro: "imovel",
    id_na_fonte: "1001",
    url: "https://exemplo.test/imovel/1001",
    titulo: "Apartamento 2 quartos",
    tipo: "apartamento",
    uf: "SP",
    cidade: "São Paulo",
    bairro: "Vila Mariana",
    endereco: "Rua Exemplo, 100, apto 21",
    cep: "04101-000",
    area_privativa: 60,
    quartos: 2,
    vagas: 1,
    descricao: "Apartamento com 2 quartos. Imóvel desocupado.",
    modalidade: "leilao",
    modalidade_fonte: "Leilão Extrajudicial",
    judicial: false,
    aceita_financiamento: true,
    valor_avaliacao: 400000,
    pracas: [
      { numero: 1, data: "2026-11-10T13:00:00.000Z", valor_minimo: 400000 },
      { numero: 2, data: "2026-11-24T13:00:00.000Z", valor_minimo: 240000 },
    ],
    fotos: [{ url: "https://exemplo.test/fotos/1001-1.jpg", origem: "api", ordem: 0 }],
    documentos: [{ tipo: "edital", url: "https://exemplo.test/editais/1001.pdf", titulo: "Edital" }],
    ...sobrepor,
  };
}

/** Lote de imóveis com ids "1".."n". */
export function lote(n: number, sobrepor: (i: number) => Partial<ImovelNormalizado> = () => ({})): ImovelNormalizado[] {
  return Array.from({ length: n }, (_, i) =>
    imovelExemplo({ id_na_fonte: String(i + 1), url: `https://exemplo.test/imovel/${i + 1}`, endereco: `Rua Exemplo, ${i + 1}`, ...sobrepor(i) }),
  );
}

export interface ConfigConectorFalso {
  id?: string;
  registros: () => unknown[];
  normalizar?: (bruto: unknown) => RegistroNormalizado | null;
  listaCompleta?: boolean;
  volumeMinimo?: number;
  maxFracaoRemocao?: number;
  geradoEm?: string;
  /** Lança depois de entregar N registros (simula queda de rede). */
  falharDepoisDe?: number;
  /** Recebe as opções que o núcleo passou ao conector. */
  espiar?: (opcoes: OpcoesColeta) => void;
}

/** Conector em memória: entrega `registros()` e normaliza com a função dada (padrão: identidade). */
export function conectorFalso(config: ConfigConectorFalso): Conector {
  return {
    id: config.id ?? "falso",
    nome: "Fonte falsa de teste",
    tipo: "outro",
    acesso: "arquivo_oficial",
    finalidade: "vitrine",
    capacidades: { fotos: true, documentos: true, ocupacao: false, listaCompleta: config.listaCompleta ?? true },
    volumeMinimo: config.volumeMinimo,
    maxFracaoRemocao: config.maxFracaoRemocao,
    async *coletar(opcoes) {
      config.espiar?.(opcoes);
      if (config.geradoEm) opcoes.informar({ geradoEm: config.geradoEm, origem: "memoria" });
      let n = 0;
      for (const r of config.registros()) {
        if (config.falharDepoisDe !== undefined && n >= config.falharDepoisDe) throw new Error("conexão caiu");
        n++;
        yield r;
      }
    },
    normalizar: config.normalizar ?? ((bruto) => bruto as RegistroNormalizado),
  };
}

/** Cliente HTTP que falha se alguém tentar usar a rede num teste. */
export function httpProibido(): ClienteHttp {
  return criarClienteHttp({
    respeitarRobots: false,
    tentativas: 1,
    fetch: async () => {
      throw new Error("rede proibida em teste");
    },
  });
}
