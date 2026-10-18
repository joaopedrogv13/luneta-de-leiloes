import { conteudoTag, origemTag, partesEvidencia, SEVERIDADE_ORDEM } from "@/components/catalogo/tags/conteudo";
import { AVISO_CLASSIFICACAO } from "@/content/avisos";
import { SITE } from "@/content/site";
import { MODALIDADE_ROTULO, numero, SELO_ROTULO, SEVERIDADE_ROTULO, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import { rotaImovel } from "@/lib/catalogo/rotas";
import type { Conjunto, PaginaImovel, Plano, TagDetalhe } from "@/lib/catalogo/tipos";
import { BarraRelatorio } from "./BarraRelatorio";
import {
  AVISO_SIMULADOR_REL,
  cssPaginas,
  dataCurtaRel,
  ehExemploRel,
  entradaDoImovel,
  ESCOPO_ROTULO,
  capaImovel,
  linhaLocal,
  NIVEIS_REL,
  regiaoRel,
  diferencaRel,
  MINIMO_RECORTE,
  type ComparacaoRel,
  type LinhaRegiaoRel,
  type RecorteRel,
} from "./dados";
import { GradeCapa } from "./GradeCapa";
import { MedidaCapa } from "./MedidaCapa";
import { IconeGravidade, MarcaLente } from "./icones";
import { Folha, Secao } from "./partes";
import s from "./relatorio.module.css";
import { CarimboData, CustosRelatorio, MatrizRelatorio, PremissasRelatorio, ProvedorRelatorio, ResultadoSimulacao } from "./Simulacao";
import { precoPorArea } from "@/components/catalogo/imovel/formato";

const TOM: Record<TagDetalhe["severidade"], string> = { grave: s.grave, atencao: s.aten, positivo: s.pos, info: s.info };

/** Trecho de evidência com no máximo ~260 caracteres (o relatório não é o anúncio). */
function encurtar(bruto: string, max = 260) {
  // "R$ 251.000,00" do texto da fonte não se parte entre "R$" e o número (com a letra de 14 px do celular, partia)
  const t = bruto.replace(/R\$\s+(?=\d)/g, "R$\u00a0");
  if (t.length <= max) return t;
  const corte = t.lastIndexOf(" ", max);
  return `${t.slice(0, corte > max * 0.6 ? corte : max).trimEnd()}…`;
}

/**
 * Relatório em PDF do imóvel (/<previa|assinante>/imovel/<id>/relatorio): página A4 para imprimir ou salvar em PDF
 * pelo navegador. O que é do imóvel (capa, região, alertas, fontes) sai do servidor; o que é da simulação
 * (resultado, cenários, custos e premissas) é calculado no navegador com os ajustes guardados do simulador deste
 * imóvel, pela mesma função da tela (`simulacaoCompleta`).
 *
 * Duas folhas: a capa com o resultado (sempre uma página só) e o corpo, em fluxo contínuo (cenários, custos,
 * premissas, região, alertas, avisos e fontes), que o navegador pagina: os blocos pequenos e cada grupo das tabelas
 * não se partem, os títulos não ficam sozinhos no pé da página e o cabeçalho das tabelas se repete.
 */
export function Relatorio({
  conjunto,
  plano,
  pagina,
  imprimir,
  ajudaAberta = false,
}: {
  conjunto: Conjunto;
  plano: Plano;
  pagina: PaginaImovel;
  imprimir: boolean;
  /** "Como salvar o PDF" aberto (primeira visita, pelo cookie) */
  ajudaAberta?: boolean;
}) {
  const i = pagina.imovel;
  const exemplo = ehExemploRel(i);
  const entrada = entradaDoImovel(i);
  const refs = pagina.vizinhanca.referencias;
  const { endereco, lugar } = linhaLocal(i);
  const tipo = i.tipo === "outro" ? "Imóvel" : TIPO_ROTULO[i.tipo];
  const cabecalho = `${tipo} · ${i.cidade}/${i.uf}`;
  const idFonte = i.id.replace(/^(caixa|lj)-/, "");
  const anuncio = i.links.find((l) => l.tipo === "anuncio")?.url ?? null;
  const foto = i.fotos[0] ?? i.foto;
  const capa = capaImovel(i);
  const css = cssPaginas({ cabecalho, rodape: `${SITE.name} · Simulação com premissas genéricas: não é recomendação de investimento.` });

  return (
    <div className={s.tela} data-relatorio-tela="">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <BarraRelatorio voltar={rotaImovel(conjunto, i.id, plano)} imprimir={imprimir} ajudaAberta={ajudaAberta} />

      <ProvedorRelatorio entrada={entrada} referencias={refs} plano={plano}>
        {/* sem margem em linha: o espaço acima da folha é só da tela (na impressão, 24 px a mais empurravam a capa) */}
        <main id="conteudo" data-relatorio="" className={`${s.folhas} ${s.documento}`}>
          {/* ------------------------------------------------------------ folha 1: capa e resultado */}
          <Folha rotulo="Capa e resultado">
            <header>
              <div className={s.topoCapa}>
                <p className={s.marca}>
                  <MarcaLente />
                  {SITE.name}
                </p>
                <div className={s.tipoDoc}>
                  <p>Relatório de simulação</p>
                  <p>
                    <CarimboData />
                  </p>
                </div>
              </div>
              <div className={s.filete} aria-hidden="true" />
              {exemplo && <p className={s.faixaExemplo}>Exemplo fictício da demonstração: os dados deste imóvel não são reais.</p>}
            </header>

            <section aria-labelledby="imovel-titulo">
              <GradeCapa foto={foto} legenda={`Foto: ${i.fonte.nome} (publicada no anúncio)`}>
                <div className={s.identidade}>
                  <p className={s.sobretitulo}>{[tipo, i.fonte.nome, MODALIDADE_ROTULO[i.modalidade]].join(" · ")}</p>
                  <h1 id="imovel-titulo" className={s.titulo}>
                    {i.titulo}
                  </h1>
                  {endereco && <p className={s.endereco}>{endereco}</p>}
                  {lugar && <p className={s.endereco}>{lugar}</p>}
                  <p className={s.linhaFonte}>
                    {exemplo ? "Exemplo fictício" : `Fonte: ${i.fonte.nome}, código ${idFonte}`}
                    {i.coletadoEm && !exemplo ? ` · dados coletados em ${dataCurtaRel(i.coletadoEm)}` : ""}
                  </p>
                </div>
              </GradeCapa>
              <p className={s.caracteristicas}>{capa.caracteristicas.join(" · ")}</p>
              <dl className={s.precos}>
                {capa.precos.map((f) => (
                  <div key={f.rotulo} className={s.preco}>
                    <dt>{f.rotulo}</dt>
                    <dd className={f.vazio ? s.vazio : undefined}>{f.valor}</dd>
                    {f.nota && <dd className={s.nota}>{f.nota}</dd>}
                  </div>
                ))}
              </dl>
              <dl className={s.fatos}>
                {capa.detalhes.map((f) => (
                  <div key={f.rotulo} className={s.fato}>
                    <dt>{f.rotulo}</dt>
                    <dd className={f.vazio ? s.vazio : undefined}>
                      {f.valor}
                      {f.nota && <span className={s.nota}>{f.nota}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <ResultadoSimulacao />
            <MedidaCapa />
          </Folha>

          {/* ------------------------------------------------------------ corpo: a simulação e o imóvel, em fluxo contínuo */}
          <Folha rotulo="Simulação, região, alertas e fontes" cabecalho={cabecalho}>
            <MatrizRelatorio />
            <CustosRelatorio />
            <PremissasRelatorio />
            <Regiao pagina={pagina} />
            <Alertas pagina={pagina} plano={plano} />

            <Secao numero="07" titulo="Avisos importantes" id="avisos">
              <ul className={s.avisos}>
                <li>
                  <span className={s.forte}>{AVISO_SIMULADOR_REL}</span>
                </li>
                <li>{AVISO_CLASSIFICACAO}</li>
                <li>
                  <span className={s.forte}>Confira o edital.</span> Preços, praças, datas, ocupação e dívidas mudam e vale sempre o que está no edital e no
                  site da fonte. Leia a matrícula atualizada e, de preferência, converse com um advogado antes do lance.
                </li>
                <li>Fotos e anúncios pertencem às fontes; a Luneta não copia nem re-hospeda anúncios.</li>
                {exemplo && <li>Exemplo fictício da demonstração: nenhum número deste relatório se refere a um imóvel real.</li>}
              </ul>
            </Secao>

            <Secao numero="08" titulo="Fontes e datas" id="fontes">
              {/* as fontes e o "Fim do relatório" não se separam: a linha final sozinha (ou só a última fonte, sem o título)
                  abria uma página quase vazia; a seção inteira, com o título, fecha o relatório */}
              <div className={s.inteira}>
                <dl className={s.fontes}>
                  <div>
                    <dt>Imóvel</dt>
                    <dd>
                      {exemplo
                        ? "Exemplo fictício da demonstração da Luneta"
                        : `${i.fonte.nome}, código ${idFonte}; coletado em ${dataCurtaRel(i.coletadoEm) ?? "data não informada"}`}
                      {i.geradoNaFonteEm && !exemplo ? `; lista gerada pela fonte em ${dataCurtaRel(i.geradoNaFonteEm)}` : ""}
                    </dd>
                  </div>
                  {anuncio && (
                    <div>
                      <dt>Anúncio na fonte</dt>
                      <dd>
                        <a href={anuncio} target="_blank" rel="noopener noreferrer">
                          {anuncio}
                          <span className="sr-only"> (abre em nova aba)</span>
                        </a>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Preço da região</dt>
                    <dd>
                      {exemplo ? (
                        "Exemplo fictício: a demonstração não tem referência de preço da região."
                      ) : (
                        <>
                          Avaliação e lance de outros imóveis em leilão na base da Luneta
                          {pagina.sobre.geradoEm ? `, atualizada em ${dataCurtaRel(pagina.sobre.geradoEm)}` : ""}
                          {pagina.sobre.fontes.length
                            ? ` (${pagina.sobre.fontes.map((f) => `${f.nome}${f.geradoNaFonteEm ? `, ${dataCurtaRel(f.geradoNaFonteEm)}` : ""}`).join("; ")})`
                            : ""}
                          .
                        </>
                      )}
                    </dd>
                  </div>
                  <ItbiFonte pagina={pagina} />
                  <div>
                    <dt>Simulação</dt>
                    <dd>
                      Simulador de rentabilidade da Luneta, com as premissas e os ajustes guardados neste navegador para este imóvel; relatório gerado em{" "}
                      <CarimboData />.
                    </dd>
                  </div>
                  <div>
                    <dt>Página do imóvel</dt>
                    <dd>{`${SITE.url.replace(/\/$/, "")}${rotaImovel(conjunto, i.id)}`}</dd>
                  </div>
                </dl>
                <p className={s.fimDocumento}>
                  <span>
                    {SITE.name} · {SITE.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </span>
                  <span>Fim do relatório</span>
                </p>
              </div>
            </Secao>
          </Folha>
        </main>
      </ProvedorRelatorio>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 06 Preço do m² na região
// ---------------------------------------------------------------------------

function Comparacao({ c }: { c: ComparacaoRel | null }) {
  if (!c) return <span className={s.info}>—</span>;
  return (
    <>
      <span className={s.nivel}>{NIVEIS_REL[c.nivel]}</span>
      <small>{diferencaRel(c)}</small>
    </>
  );
}

/** Linha de um recorte com média: R$/m², quantos imóveis (ou compras) e a comparação deste imóvel. */
function LinhaRecorte({ l, area }: { l: LinhaRegiaoRel; area: number | null }) {
  return (
    <tr>
      <th scope="row">
        {ESCOPO_ROTULO[l.escopo]}
        <small>
          {l.lugar}
          {l.periodo ? ` · ${l.periodo}` : ""}
        </small>
      </th>
      <td className={s.num}>{precoPorArea(l.media, area)}</td>
      <td className={s.num}>{numero(l.amostra)}</td>
      <td>
        <Comparacao c={l.avaliacao} />
      </td>
      <td>
        <Comparacao c={l.lance} />
      </td>
    </tr>
  );
}

/**
 * Tabela da região. Leilões: sempre os quatro recortes (rua, bairro, cidade e estado), o que não tem média com o
 * motivo; ITBI: só os recortes que a prefeitura cobre.
 */
function TabelaRegiao({ recortes, linhas, itbi, area }: { recortes?: RecorteRel[]; linhas?: LinhaRegiaoRel[]; itbi: boolean; area: number | null }) {
  const titulo = itbi ? "Preço pago em transações reais (ITBI da prefeitura)" : "Média de avaliação dos imóveis do mesmo tipo em leilão";
  return (
    <div className={s.inteira}>
      <p className={s.tituloTabela} aria-hidden="true">
        {titulo}
        <span> · R$ por m²{itbi ? "" : " (avaliação da fonte, não é preço de mercado)"}</span>
      </p>
      {/* rola de lado no celular: com o foco (Tab), as setas rolam a tabela */}
      <div className={s.rolagem} tabIndex={0} role="region" aria-label={`${titulo} (tabela; role para o lado para ver todas as colunas)`}>
        <table className={s.tabela}>
          <caption className="sr-only">{titulo}, em R$ por m²</caption>
          <thead>
            <tr>
              <th scope="col">Recorte</th>
              <th scope="col" className={s.num}>
                {itbi ? "Preço médio pago" : "Média de avaliação"}
              </th>
              <th scope="col" className={s.num}>
                {itbi ? "Transações" : "Imóveis"}
              </th>
              <th scope="col">Avaliação deste imóvel</th>
              <th scope="col">Lance mínimo deste</th>
            </tr>
          </thead>
          <tbody>
            {recortes
              ? recortes.map((c) =>
                  c.linha ? (
                    <LinhaRecorte key={c.escopo} l={c.linha} area={area} />
                  ) : (
                    <tr key={c.escopo} className={s.semMedia}>
                      <th scope="row">
                        {ESCOPO_ROTULO[c.escopo]}
                        {c.lugar && <small>{c.lugar}</small>}
                      </th>
                      <td colSpan={4}>{c.falta}</td>
                    </tr>
                  ),
                )
              : linhas?.map((l) => <LinhaRecorte key={l.escopo} l={l} area={area} />)}
          </tbody>
        </table>
      </div>
      <p className={s.dicaRolagem}>Arraste a tabela para o lado para ver todas as colunas.</p>
    </div>
  );
}

/** A nota do ITBI: tem e está na tabela; tem, mas não serve para este imóvel (e por quê); ou ainda não tem. */
function notaItbi(pagina: PaginaImovel, temTabela: boolean): string | null {
  const i = pagina.imovel;
  const cob = pagina.vizinhanca.cobertura;
  if (!cob || ehExemploRel(i)) return null;
  const cidade = `${i.cidade}/${i.uf}`;
  // campo novo do contrato (CoberturaPrecos.semComparacao, frente de dados), lido sem depender dele
  const motivo = (cob as { semComparacao?: string | null }).semComparacao || null;
  if (temTabela) return `${cidade}: preço pago nas compras registradas na prefeitura (ITBI), na tabela acima.`;
  if (motivo) return `${cidade}: a Luneta tem o preço de transações reais (ITBI) desta cidade, mas este imóvel fica fora da comparação. ${motivo}`;
  if (cob.cidadeTemItbi)
    return `${cidade}: a Luneta tem o preço de transações reais (ITBI) desta cidade, mas a prefeitura não registra compras suficientes de imóveis do mesmo tipo perto deste para comparar.`;
  return `${cidade}: a Luneta ainda não tem o preço de transações reais (ITBI) desta cidade.`;
}

function Regiao({ pagina }: { pagina: PaginaImovel }) {
  const i = pagina.imovel;
  const exemplo = ehExemploRel(i);
  const r = regiaoRel(i, pagina.vizinhanca.referencias);
  const temLeiloes = r.leiloes.length > 0;
  const nota = notaItbi(pagina, r.itbi.length > 0);
  return (
    <Secao
      numero="05"
      titulo="Preço do m² na região"
      id="regiao"
      descricao="Média de R$ por m² dos imóveis do mesmo tipo na rua, no bairro, na cidade e no estado, comparada com a avaliação e o lance mínimo deste imóvel."
    >
      {r.frase ? (
        <p className={s.fraseRegiao}>
          {r.nivel !== null && (
            <span className={s.nivel} style={{ marginRight: "0.6em", verticalAlign: "0.18em" }}>
              {NIVEIS_REL[r.nivel]}
            </span>
          )}
          {r.frase}
        </p>
      ) : (
        <p className={s.p}>
          {exemplo
            ? "Exemplo fictício: a demonstração tem poucos imóveis, então não há referência de preço da região."
            : `Ainda não há imóveis do mesmo tipo suficientes em leilão na base para comparar (pelo menos ${MINIMO_RECORTE.rua} na rua, ${MINIMO_RECORTE.bairro} no bairro ou na cidade, ou ${MINIMO_RECORTE.uf} no estado).`}
        </p>
      )}
      {r.fraseLeiloes && <p className={s.p}>{r.fraseLeiloes}</p>}
      {/* a tabela da referência da frase vem primeiro */}
      {r.fontePrincipal === "itbi" && <TabelaRegiao linhas={r.itbi} itbi area={i.area} />}
      {temLeiloes && <TabelaRegiao recortes={r.recortes} itbi={false} area={i.area} />}
      {r.fontePrincipal !== "itbi" && r.itbi.length > 0 && <TabelaRegiao linhas={r.itbi} itbi area={i.area} />}
      {(temLeiloes || r.itbi.length > 0) && (
        <p className={s.pequeno}>
          Níveis: muito abaixo (30% ou mais abaixo da média), abaixo (10% a 29%), na média (menos de 10% de diferença), acima e muito acima. Para ter média, o
          recorte precisa de pelo menos {MINIMO_RECORTE.rua} imóveis do mesmo tipo na rua, {MINIMO_RECORTE.bairro} no bairro e na cidade e {MINIMO_RECORTE.uf}{" "}
          no estado. A avaliação é a que a fonte publica para o leilão; o lance é o mínimo de hoje: os dois podem estar longe do preço de venda de verdade.
        </p>
      )}
      {nota && <p className={s.pequeno}>{nota}</p>}
    </Secao>
  );
}

function ItbiFonte({ pagina }: { pagina: PaginaImovel }) {
  const i = pagina.imovel;
  const temItbi = pagina.vizinhanca.referencias.some((r) => r.fonte === "itbi");
  if (!temItbi) return null;
  const f = pagina.vizinhanca.cobertura?.fontes.find((x) => x.tipo === "itbi" && x.nome === `${i.cidade}/${i.uf}`);
  return (
    <div>
      <dt>Transações reais (ITBI)</dt>
      <dd>
        {i.cidade}/{i.uf}, dados da prefeitura
        {f?.detalhe ? `: ${f.detalhe}` : ""}
        {f?.licenca ? ` · licença ${f.licenca}` : ""}
        {f?.url ? ` · ${f.url}` : ""}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 07 Principais alertas
// ---------------------------------------------------------------------------

function LinhaAlerta({ t }: { t: TagDetalhe }) {
  const c = conteudoTag(t);
  const { trecho, nota } = t.evidencia ? partesEvidencia(t.evidencia, t.origem) : { trecho: null, nota: null };
  const origem = origemTag(t.origem);
  return (
    <li className={s.alerta}>
      <p className={s.alertaNome}>
        <IconeGravidade severidade={t.severidade} className={TOM[t.severidade]} />
        <span>
          {c.rotulo}
          <small>
            {SEVERIDADE_ROTULO[t.severidade]}
            {t.emRevisao ? ", se confirmada" : ""} · origem: {origem.rotulo}
          </small>
        </span>
      </p>
      <div className={s.alertaTexto}>
        {c.oQueE}
        {nota && !trecho ? <q>{encurtar(nota)}</q> : null}
        {trecho ? <q>{encurtar(trecho)}</q> : null}
      </div>
    </li>
  );
}

function Alertas({ pagina, plano }: { pagina: PaginaImovel; plano: Plano }) {
  const i = pagina.imovel;
  if (plano === "lente") {
    return (
      <Secao numero="06" titulo="Principais alertas" id="alertas">
        <p className={s.p}>
          As tags de risco (ocupação, dívidas, ações judiciais, matrícula e mais) e o selo são do plano Luneta e não entram neste relatório. Leia o edital com
          atenção antes de qualquer lance.
        </p>
      </Secao>
    );
  }
  const ordem = (t: TagDetalhe) => SEVERIDADE_ORDEM.indexOf(t.severidade);
  const confirmadas = i.tags.filter((t) => !t.emRevisao).sort((a, b) => ordem(a) - ordem(b));
  const revisao = i.tags.filter((t) => t.emRevisao).sort((a, b) => ordem(a) - ordem(b));
  const pendente = pagina.selosDesligados || i.seloPendente;
  return (
    <Secao
      numero="06"
      titulo="Principais alertas"
      id="alertas"
      descricao="Análise automática dos dados publicados pela fonte. Cada alerta traz o que quer dizer e, quando há, o trecho que o originou."
    >
      {confirmadas.length === 0 ? (
        <p className={s.p}>
          Nenhum alerta confirmado nos dados da fonte{revisao.length ? "; veja os em revisão abaixo" : ""}. Isso não quer dizer que não haja riscos: confira o
          edital.
        </p>
      ) : (
        <ul className={s.alertas}>
          {confirmadas.map((t) => (
            <LinhaAlerta key={t.slug} t={t} />
          ))}
        </ul>
      )}
      {revisao.length > 0 && (
        <div className={s.revisao}>
          <p className={s.subtitulo} style={{ marginTop: "0.6em" }}>
            Em revisão ({revisao.length})
          </p>
          <p className={s.pequeno} style={{ marginTop: "0.2em" }}>
            Calculados automaticamente e ainda sem leitura humana: podem estar errados. Não trate como fato; use como pista para ler o edital.
          </p>
          <ul className={s.alertas}>
            {revisao.map((t) => (
              <LinhaAlerta key={t.slug} t={t} />
            ))}
          </ul>
        </div>
      )}
      <p className={s.pequeno}>
        <span className={s.forte}>{pendente ? "Selo em análise" : i.selo === 0 ? "Sem selo" : `Selo ${SELO_ROTULO[i.selo]}`}.</span>{" "}
        {i.porQueSelo || (pendente ? "Os critérios dos selos ainda estão em definição com o advogado." : "")}
      </p>
    </Secao>
  );
}
