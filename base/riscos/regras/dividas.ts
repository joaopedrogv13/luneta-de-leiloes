/**
 * Dívidas: condomínio em atraso, IPTU em atraso, dívida passa ao arrematante.
 *
 * - Condomínio/IPTU em atraso: só quando o texto DECLARA a dívida ("Há débitos de condomínio
 *   no valor de R$ ...", "Débito Condominial: R$ ...", "IPTU em atraso"). Menção genérica
 *   ("eventuais débitos condominiais", "inscritos ou não na dívida ativa") não conta, e a regra
 *   de despesas da ficha da Caixa ("Condomínio: sob responsabilidade do comprador, até 10% da
 *   avaliação") diz quem paga, não que a dívida existe. Contrassinal: "em dia com as cotas",
 *   "não há débitos". Valores mudam: sempre com revisão.
 * - Dívida passa ao arrematante: cláusula que põe dívida do imóvel "por conta / a cargo / sob
 *   responsabilidade do arrematante". Contrassinal na MESMA cláusula anula: sub-rogação no
 *   preço, isenção, art. 130 do CTN, art. 908 §1º do CPC, "não serão transferidos". Encargos
 *   posteriores à arrematação e custos da transferência (ITBI, registro) não contam. Na
 *   Caixa, o texto-padrão da ficha vale confiança alta; no judicial, média com revisão.
 */
import type { RegraRisco } from "../motor.ts";
import { clausulasDe, desconhecido, deteccao, ehCaixa, trechoDaClausula, trechoDe } from "./apoio.ts";
import { analisarDividaPassa, dividasDeclaradas, type TipoDivida } from "./sinais.ts";

function regraDividaDeclarada(tipo: TipoDivida): RegraRisco {
  const tag = tipo === "condominio" ? "condominio-em-atraso" : "iptu-em-atraso";
  const nome = tipo === "condominio" ? "condomínio" : "IPTU";
  return {
    id: tipo === "condominio" ? "dividas/condominio" : "dividas/iptu",
    descricao: `Dívida de ${nome} declarada no texto (com valor, data ou "em atraso"); "em dia"/"não há débitos" é contrassinal.`,
    tags: [tag],
    avaliar({ textos }) {
      const { positivos, negativos } = dividasDeclaradas(clausulasDe(textos), tipo);
      const comValor = positivos.find((p) => p.valor !== null);
      const melhor = comValor ?? positivos[0];
      if (melhor) {
        const confianca = negativos.length > 0 ? "baixa" : comValor ? "media" : "baixa";
        return [deteccao(tag, "sim", confianca, melhor.achado.texto.origem, trechoDe(melhor.achado), true)];
      }
      const negativo = negativos[0];
      if (negativo) return [deteccao(tag, "nao", "baixa", negativo.texto.origem, trechoDe(negativo), true)];
      return [desconhecido(tag, `A fonte não informa dívida de ${nome}.`)];
    },
  };
}

export const regraCondominio = regraDividaDeclarada("condominio");
export const regraIptu = regraDividaDeclarada("iptu");

export const regraDividaPassa: RegraRisco = {
  id: "dividas/passa-arrematante",
  descricao: "Cláusula que põe dívida do imóvel na conta do arrematante, sem sub-rogação/isenção na mesma cláusula.",
  tags: ["divida-passa-arrematante"],
  avaliar(entrada) {
    const { positivos, contrassinais, caixaPadrao } = analisarDividaPassa(clausulasDe(entrada.textos));
    const positivo = positivos[0];
    if (positivo) {
      const padraoCaixa = caixaPadrao && ehCaixa(entrada);
      return [
        deteccao(
          "divida-passa-arrematante",
          "sim",
          padraoCaixa ? "alta" : "media",
          positivo.texto.origem,
          trechoDaClausula(positivo),
          !padraoCaixa,
        ),
      ];
    }
    const contra = contrassinais[0];
    if (contra) {
      return [deteccao("divida-passa-arrematante", "nao", "media", contra.texto.origem, trechoDaClausula(contra), entrada.imovel.judicial !== false)];
    }
    return [desconhecido("divida-passa-arrematante", "A fonte não diz quem paga as dívidas do imóvel.")];
  },
};

export const REGRAS_DIVIDAS: readonly RegraRisco[] = [regraCondominio, regraIptu, regraDividaPassa];
