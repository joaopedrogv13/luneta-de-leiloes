/**
 * Validação dos registros normalizados antes de gravar. O núcleo chama em toda coleta; os
 * conectores podem (e devem) chamar nos próprios testes.
 */
import {
  MODALIDADES,
  PRECISOES_GEO,
  TIPOS_DOCUMENTO,
  TIPOS_IMOVEL,
  type EditalNormalizado,
  type ImovelNormalizado,
} from "./tipos.ts";
import { ehDataDaBase } from "./util/data.ts";
import { ehUf } from "./util/uf.ts";

function ehUrl(valor: unknown): boolean {
  if (typeof valor !== "string") return false;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function textoPreenchido(valor: unknown): boolean {
  return typeof valor === "string" && valor.trim() !== "";
}

function ausente(valor: unknown): boolean {
  return valor === null || valor === undefined;
}

function numeroOuAusente(valor: unknown, minimo = 0, maximo = Number.MAX_SAFE_INTEGER): boolean {
  return ausente(valor) || (typeof valor === "number" && Number.isFinite(valor) && valor >= minimo && valor <= maximo);
}

function inteiroOuAusente(valor: unknown, maximo: number): boolean {
  return ausente(valor) || (typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor <= maximo);
}

function boolOuAusente(valor: unknown): boolean {
  return ausente(valor) || typeof valor === "boolean";
}

function dataOuAusente(valor: unknown): boolean {
  return ausente(valor) || (typeof valor === "string" && ehDataDaBase(valor));
}

/** Lista os problemas de um imóvel normalizado; vazia = válido. */
export function validarImovel(imovel: ImovelNormalizado): string[] {
  const problemas: string[] = [];
  const p = (condicao: boolean, mensagem: string): void => {
    if (!condicao) problemas.push(mensagem);
  };
  p(imovel.registro === "imovel", `registro deve ser "imovel"`);
  p(textoPreenchido(imovel.id_na_fonte) && imovel.id_na_fonte.length <= 200, "id_na_fonte vazio ou longo demais");
  p(ehUrl(imovel.url), `url inválida: ${String(imovel.url)}`);
  p(textoPreenchido(imovel.titulo), "titulo vazio");
  p((TIPOS_IMOVEL as readonly string[]).includes(imovel.tipo), `tipo desconhecido: ${String(imovel.tipo)}`);
  p(ehUf(imovel.uf), `uf inválida: ${String(imovel.uf)}`);
  p(textoPreenchido(imovel.cidade), "cidade vazia");
  p((MODALIDADES as readonly string[]).includes(imovel.modalidade), `modalidade desconhecida: ${String(imovel.modalidade)}`);
  p(ausente(imovel.status) || imovel.status === "ativo" || imovel.status === "encerrado", `status inválido para conector: ${String(imovel.status)}`);
  p(ausente(imovel.cep) || (typeof imovel.cep === "string" && imovel.cep.replace(/\D/g, "").length === 8), `cep inválido: ${String(imovel.cep)}`);
  p(numeroOuAusente(imovel.lat, -90, 90), "lat fora de -90..90");
  p(numeroOuAusente(imovel.lon, -180, 180), "lon fora de -180..180");
  p(ausente(imovel.lat) === ausente(imovel.lon), "lat e lon devem vir juntas");
  p(ausente(imovel.lat) || !ausente(imovel.precisao_geo), "coordenada sem precisao_geo");
  p(ausente(imovel.precisao_geo) || (PRECISOES_GEO as readonly string[]).includes(imovel.precisao_geo as string), `precisao_geo inválida: ${String(imovel.precisao_geo)}`);
  for (const campo of ["area_total", "area_privativa", "area_terreno"] as const) {
    p(numeroOuAusente(imovel[campo], 0, 1e9), `${campo} inválida`);
  }
  p(inteiroOuAusente(imovel.quartos, 500), "quartos inválido");
  p(inteiroOuAusente(imovel.vagas, 5000), "vagas inválido");
  p(numeroOuAusente(imovel.valor_avaliacao, 0, 1e12), "valor_avaliacao inválido");
  p(numeroOuAusente(imovel.preco, 0, 1e12), "preco inválido");
  for (const campo of ["judicial", "aceita_financiamento", "aceita_fgts", "aceita_parcelamento"] as const) {
    p(boolOuAusente(imovel[campo]), `${campo} deve ser boolean ou null`);
  }
  p(ausente(imovel.ocupacao) || imovel.ocupacao === "ocupado" || imovel.ocupacao === "desocupado", "ocupacao inválida");
  p(ausente(imovel.praca_atual) || [0, 1, 2, 3].includes(imovel.praca_atual as number), "praca_atual inválida");

  if (!Array.isArray(imovel.pracas)) problemas.push("pracas deve ser lista");
  else {
    const numeros = new Set<number>();
    for (const praca of imovel.pracas) {
      p([0, 1, 2, 3].includes(praca.numero), `praça com número inválido: ${String(praca.numero)}`);
      p(!numeros.has(praca.numero), `praça ${praca.numero} repetida`);
      numeros.add(praca.numero);
      p(dataOuAusente(praca.data), `praça ${praca.numero} com data fora do padrão: ${String(praca.data)}`);
      p(numeroOuAusente(praca.valor_minimo, 0, 1e12), `praça ${praca.numero} com valor inválido`);
    }
  }
  if (!Array.isArray(imovel.fotos)) problemas.push("fotos deve ser lista");
  else {
    for (const foto of imovel.fotos) {
      p(ehUrl(foto.url), `foto com url inválida: ${String(foto.url)}`);
      p(textoPreenchido(foto.origem), "foto sem origem");
      p(dataOuAusente(foto.verificada_em), "foto com verificada_em fora do padrão");
      p(boolOuAusente(foto.ok), "foto.ok deve ser boolean ou null");
    }
  }
  if (!Array.isArray(imovel.documentos)) problemas.push("documentos deve ser lista");
  else {
    for (const doc of imovel.documentos) {
      p((TIPOS_DOCUMENTO as readonly string[]).includes(doc.tipo), `documento com tipo inválido: ${String(doc.tipo)}`);
      p(ehUrl(doc.url), `documento com url inválida: ${String(doc.url)}`);
      p(dataOuAusente(doc.publicado_em), "documento com publicado_em fora do padrão");
    }
  }
  if (imovel.textos !== undefined) {
    p(Array.isArray(imovel.textos) && imovel.textos.every((t) => typeof t.origem === "string" && typeof t.texto === "string"), "textos deve ser lista de {origem, texto}");
  }
  if (imovel.extras !== undefined) {
    p(
      typeof imovel.extras === "object" && imovel.extras !== null &&
        Object.values(imovel.extras).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)),
      "extras só aceita valores simples (texto, número, boolean, null)",
    );
  }
  return problemas;
}

/** Lista os problemas de um edital normalizado; vazia = válido. */
export function validarEdital(edital: EditalNormalizado): string[] {
  const problemas: string[] = [];
  const p = (condicao: boolean, mensagem: string): void => {
    if (!condicao) problemas.push(mensagem);
  };
  p(edital.registro === "edital", `registro deve ser "edital"`);
  p(textoPreenchido(edital.id_na_fonte) && edital.id_na_fonte.length <= 300, "id_na_fonte vazio ou longo demais");
  p(textoPreenchido(edital.titulo), "titulo vazio");
  p(ehUrl(edital.url), `url inválida: ${String(edital.url)}`);
  p(ausente(edital.uf) || ehUf(edital.uf), `uf inválida: ${String(edital.uf)}`);
  p(dataOuAusente(edital.publicado_em), "publicado_em fora do padrão");
  p(dataOuAusente(edital.data_leilao), "data_leilao fora do padrão");
  p(ausente(edital.imovel_id) || (typeof edital.imovel_id === "number" && Number.isInteger(edital.imovel_id)), "imovel_id inválido");
  return problemas;
}
