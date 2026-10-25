"use client";

import type { ReactNode } from "react";
import type { ResultadoCompleto } from "@/lib/simulador/completa";
import { lanceMaisCustos } from "@/lib/simulador/calculo";
import { meses, moeda, pct } from "@/lib/simulador/formato";
import { multiplicador } from "@/lib/simulador/premissas";
import { baseDaVenda, CENARIO_EXPLICA, CENARIO_ROTULO, metaComoObjetivo, metaPorExtenso } from "@/lib/simulador/textos";
import { IconeNao, IconeOk } from "./controles";
import { Janela } from "./Janela";

/**
 * "Como usar" a tabela de cenários e prazos: o que é cenário, prazo, lucro com o lance, lance máximo e retorno ao
 * ano, como ler as cores (da visão aberta), e exemplos com os números deste imóvel. Escrito para quem nunca simulou
 * um leilão.
 */
export function ComoUsar({ r, onFechar }: { r: ResultadoCompleto; onFechar: () => void }) {
  const p = r.modelo.premissas;
  const lance = r.modelo.entrada.lance;
  const ref = p.valorVenda ?? 0;
  const ex = r.detalhe?.sim ?? null;
  const exTeto = r.teto;
  const decomposicao = r.comTeto ? lanceMaisCustos(r.comTeto) : null;
  const roi24 = Math.pow(1.5, 12 / 24) - 1;
  // venda direta: preço fixo (não há disputa); a tabela mostra o lucro pelo preço e o lance máximo (o maior preço a
  // pagar para a meta, rodada 6), com a margem para imprevistos na leitura de cada quadro
  const fixo = r.semDisputa;
  // a visão do lance máximo está aberta (a legenda das cores fala da visão aberta)
  const teto = r.visao === "teto";
  const minimo = fixo ? "o preço pedido" : "o lance mínimo de hoje";

  return (
    <Janela titulo="Como usar a tabela de cenários e prazos" sobretitulo="Simulador · guia rápido" onFechar={onFechar} largura="md:w-[min(720px,94vw)]">
      <div className="flex flex-col gap-6 text-[14px] leading-relaxed">
        <Bloco titulo="Para que serve">
          {fixo ? (
            <p>
              A tabela responde a duas perguntas: <strong className="font-semibold">quanto você ganha comprando pelo preço pedido</strong> ({moeda(lance)}) e,
              na outra visão, <strong className="font-semibold">até quanto vale pagar</strong> (o seu lance máximo) para ganhar o que quer. Na venda direta o
              preço é fixo (não há disputa): o que muda é por quanto e quando você vende. Ninguém sabe esses dois números com certeza; por isso a tabela
              mostra várias combinações lado a lado.
            </p>
          ) : (
            <p>
              A tabela responde a duas perguntas: <strong className="font-semibold">quanto você ganha com o seu lance</strong> e, na outra visão,{" "}
              <strong className="font-semibold">até quanto vale dar de lance</strong> para ganhar o que quer. As duas dependem do preço de venda e do
              tempo até vender. Ninguém sabe esses dois números com certeza; por isso a tabela mostra várias combinações lado a lado.
            </p>
          )}
        </Bloco>

        <Bloco titulo="As linhas: por quanto você vende (cenários)">
          <p>Cada linha é um preço de venda, em % {baseDaVenda(r.modelo)} ({moeda(ref)}):</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {r.linhas.map((c) => (
              <li key={c} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-latao" />
                <span>
                  <strong className="font-semibold">
                    {CENARIO_ROTULO[c]} ({pct(multiplicador(p, c), 0)}, {moeda(ref * multiplicador(p, c))})
                  </strong>
                  : {CENARIO_EXPLICA[c]}.
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-nevoa">
            Toque no % ao lado do nome de um cenário para trocá-lo. Embaixo da tabela, escolha se os % valem sobre a avaliação do leilão ou sobre a
            referência de preço da região; as duas ficam lado a lado, em R$/m², para comparar. A avaliação do leilão não é preço de mercado: compare
            também com anúncios parecidos.
          </p>
        </Bloco>

        <Bloco titulo="As colunas: em quantos meses você vende (prazos)">
          <p>
            Cada coluna é o tempo entre a compra e a venda. Quanto mais tempo, mais você paga enquanto espera (condomínio, IPTU, contas) e menor fica o
            retorno ao ano. Imóvel ocupado ou que precisa de reforma costuma levar mais: olhe as colunas da direita. O prazo que você escolher no
            cartão de cima aparece aqui também (marcado “seu prazo” quando não é uma das colunas).
          </p>
        </Bloco>

        <Bloco titulo="O número em cada quadro">
          {fixo ? (
            <>
              <p>
                Na visão <strong className="font-semibold">“Lucro pelo preço”</strong>, cada quadro mostra quanto sobra no bolso (lucro, já sem o
                imposto) e o retorno ao ano, comprando pelo preço pedido.
              </p>
              <p className="mt-2">
                Na visão <strong className="font-semibold">“Lance máximo para a meta”</strong>, cada quadro diz o maior preço que ainda dá a sua meta (
                {metaPorExtenso(r.meta)}) depois de pagar todos os custos da conta linha a linha: ITBI, registro, reforma, os meses até vender, corretagem e
                imposto de renda. Abaixo do número, quanto <strong className="font-semibold">sobra</strong> entre o preço pedido e esse máximo, ou quanto{" "}
                <strong className="font-semibold">falta</strong> quando o máximo fica abaixo do preço pedido.
              </p>
              <p className="mt-2">
                Ao escolher um quadro, a leitura logo abaixo da tabela mostra também a <strong className="font-semibold">margem para imprevistos</strong>:
                quanto de custo que você não previu (uma reforma maior, uma dívida, outro gasto) ainda cabe comprando pelo preço pedido sem perder a meta.
                Quanto maior a margem, mais folga a conta tem para o que der errado.
              </p>
            </>
          ) : (
            <>
              <p>
                Na visão <strong className="font-semibold">“Lucro com o meu lance”</strong>, a que abre primeiro, cada quadro mostra quanto sobra no bolso
                (lucro, já sem o imposto) e o retorno ao ano, com o lance que você escolher (de início, o lance mínimo de hoje, {moeda(lance)}). Na régua
                do “Meu lance”, as marcas mostram o mínimo e o seu lance máximo; logo abaixo, o lance com as despesas da conta (lance + custos).
              </p>
              <p className="mt-2">
                Na visão <strong className="font-semibold">“Lance máximo para a meta”</strong>, cada quadro diz o maior lance que ainda dá a sua meta (
                {metaPorExtenso(r.meta)}) depois de pagar todos os custos da conta linha a linha: comissão, ITBI, registro, reforma, os meses até vender,
                corretagem e imposto de renda. Abaixo do número, a folga: quanto <strong className="font-semibold">sobra</strong> entre o lance mínimo de hoje
                e esse teto, ou quanto <strong className="font-semibold">falta</strong> quando o teto fica abaixo do mínimo.
              </p>
              <p className="mt-2 text-nevoa">A tabela abre na visão que você usou por último neste imóvel.</p>
            </>
          )}
        </Bloco>

        <Bloco titulo="Retorno ao ano, no total e ao mês">
          <p>
            O retorno é o lucro dividido pelo dinheiro que você colocou. “Ao ano” serve para comparar com uma aplicação: ganhar 50% em 24 meses é{" "}
            {pct(roi24)} ao ano (porque os juros se acumulam), não 25%. “No total” é o retorno do começo ao fim; “ao mês” é o mesmo rendimento dividido
            mês a mês, com juros compostos.
          </p>
        </Bloco>

        <Bloco titulo="Como ler as cores">
          <ul className="flex flex-col gap-2">
            <Legenda
              icone={
                <span className="inline-flex size-5 items-center justify-center rounded border border-pos/40 bg-pos/10">
                  <IconeOk className="size-3 text-pos" />
                </span>
              }
            >
              {teto
                ? fixo
                  ? "Verde com ✓: o máximo passa do preço pedido. Comprando por ele, você atinge a meta; a diferença é a sua folga."
                  : "Verde com ✓: o teto passa do lance mínimo. Dá para entrar na disputa e ainda atingir a meta; a diferença é a sua folga."
                : `Verde com ✓: ${fixo ? "comprando pelo preço" : "com o seu lance"}, você atinge a meta (${metaPorExtenso(r.meta)}).`}
            </Legenda>
            <Legenda
              icone={
                <span className="inline-flex size-5 items-center justify-center rounded border border-nevoa/25 bg-noite">
                  <IconeNao className="size-3 text-grave-texto" />
                </span>
              }
            >
              {teto
                ? `✕: ${minimo} já é maior que o ${fixo ? "máximo" : "teto"}. Comprando por ele, você ganha menos que a meta (ou perde).`
                : `✕: ${fixo ? "comprando pelo preço" : "com o seu lance"}, você ganha menos que a meta (ou perde).`}
            </Legenda>
            {teto && (
              <Legenda icone={<span className="inline-flex size-5 items-center justify-center rounded border border-nevoa/25 bg-noite text-[11px]">—</span>}>
                Traço: nenhum {fixo ? "preço" : "lance"} atinge a meta, nem de graça. A venda não cobre os custos com esse retorno.
              </Legenda>
            )}
            <Legenda icone={<span className="inline-block size-5 rounded border-2 border-latao-texto bg-latao/15" />}>
              Contorno dourado: o quadro escolhido. É o mesmo do cartão de cima e do Detalhe, logo abaixo.
            </Legenda>
          </ul>
          <p className="mt-2 text-nevoa">
            {teto
              ? `Na visão “${fixo ? "Lucro pelo preço" : "Lucro com o meu lance"}”, o ✓ quer dizer que, ${fixo ? "comprando pelo preço" : "com o seu lance"}, você atinge a meta.`
              : `Na visão “Lance máximo para a meta”, o ✓ quer dizer que o ${fixo ? "máximo passa do preço pedido" : "teto passa do lance mínimo"}, e o traço, que nenhum ${fixo ? "preço" : "lance"} atinge a meta.`}
          </p>
        </Bloco>

        {ex && (
          <Bloco titulo="Um exemplo com este imóvel">
            <p>
              No cenário {CENARIO_ROTULO[r.celula.cenario].toLowerCase()}, vendendo por {moeda(ex.venda)} em {meses(r.celula.meses)}:
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {fixo && r.margem !== null && (
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-latao" />
                  <span>
                    Comprando por <strong className="font-semibold">{moeda(lance)}</strong>, ainda cabem {moeda(r.margem)} de custos imprevistos e você
                    consegue {metaComoObjetivo(r.meta)}.
                  </span>
                </li>
              )}
              <li className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-latao" />
                <span>
                  {fixo ? `Comprando por ${moeda(ex.lance)}` : `Com ${moeda(ex.lance)} de lance`}, {ex.lucro >= 0 ? "o lucro" : "o prejuízo"} é de {moeda(Math.abs(Math.round(ex.lucro)))} ({pct(ex.roiAA)} ao
                  ano), colocando {moeda(Math.round(ex.capital))} do seu dinheiro.
                </span>
              </li>
              {exTeto !== null && (
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-latao" />
                  <span>
                    {fixo ? "Pagando até " : "Dando até "}
                    <strong className="font-semibold">{moeda(exTeto)}</strong>
                    {fixo ? "" : " de lance"}, você ainda consegue {metaComoObjetivo(r.meta)}
                    {decomposicao
                      ? ` (com ${moeda(decomposicao.custos)} de custos: ${moeda(decomposicao.total)} ${decomposicao.aPrazo ? "no total" : "investidos"}, como no cartão)`
                      : ""}
                    . Acima
                    disso, ganha menos que a meta.
                  </span>
                </li>
              )}
            </ul>
          </Bloco>
        )}

        <Bloco titulo="Dicas">
          <ul className="flex flex-col gap-1.5">
            <li>• Decida pelo cenário conservador: se ele já dá a meta, o negócio tem margem.</li>
            <li>
              • Toque num quadro para ver a conta no Detalhe. Lá, “Ver e editar a conta” abre a conta linha a linha, com um lápis em cada custo. O lance
              máximo já desconta todos esses custos: mude um deles e o número muda.
            </li>
            <li>• Use as setas do teclado para andar pela tabela.</li>
            <li className="text-nevoa">• É uma simulação com premissas genéricas, não recomendação de investimento: confira o edital e os custos locais.</li>
          </ul>
        </Bloco>
      </div>
    </Janela>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-[16px] leading-tight font-bold">{titulo}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Legenda({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icone}
      </span>
      <span>{children}</span>
    </li>
  );
}
