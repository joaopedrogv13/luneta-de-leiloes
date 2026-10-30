import { conteudoTag, origemTag, partesEvidencia, SEVERIDADE_ORDEM } from "@/components/catalogo/tags/conteudo";
import { AVISO_CLASSIFICACAO } from "@/content/avisos";
import { SITE } from "@/content/site";
import { MODALIDADE_ROTULO, numero, SELO_ROTULO, SEVERIDADE_ROTULO, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import { fraseEstacao } from "@/lib/catalogo/estacoes";
import { pode } from "@/lib/catalogo/planos";
import { rotaImovel } from "@/lib/catalogo/rotas";
import {
  cidadePequena,
  fraseFaixa,
  pontoMedido,
  frasePercentil,
  NOTA_NAO_GARANTIA,
  notaNaEscala,
  OSM_ATRIBUICAO,
  resumoTercos,
  ROTA_METODO_LOCAL,
  SEM_DADO_COMPONENTE,
  seloPrecisao,
  TERCO_CURTO,
  textoRiscoSemAlerta,
} from "@/lib/catalogo/nota-texto";
import type { ComponenteLocal, Conjunto, PaginaImovel, Plano, TagDetalhe } from "@/lib/catalogo/tipos";
import { BarraRelatorio } from "./BarraRelatorio";
import {
  AVISO_SIMULADOR_REL,
  cssPaginas,
  codigoNaFonte,
  dataCurtaRel,
  fontesDoRelatorio,
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
import { CarimboData, CustosRelatorio, MatrizRelatorio, PremissasRelatorio, ProvedorRelatorio, ResultadoSimulacao } from "./SimulacaoAdiada";
import { AVISO_RECORTE, LICENCA_A_CONFIRMAR, precoPorArea } from "@/components/catalogo/imovel/formato";

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
  const idFonte = codigoNaFonte(i.id);
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
                    <CarimboData reservar />
                  </p>
                </div>
              </div>
              <div className={s.filete} aria-hidden="true" />
              {exemplo && <p className={s.faixaExemplo}>Exemplo fictício da demonstração: os dados deste imóvel não são reais.</p>}
            </header>

            <section aria-labelledby="imovel-titulo">
              <GradeCapa
                foto={foto}
                ilustrativa={!!i.fotoIlustrativa}
                recorte={i.fotoRecorte ?? null}
                legenda={i.fotoIlustrativa ? "Foto ilustrativa: de um imóvel real parecido, de outro endereço (exemplo fictício)" : `Foto: ${i.fonte.nome} (publicada no anúncio)`}
              >
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
            <LocalizacaoRel pagina={pagina} plano={plano} />
            <Alertas pagina={pagina} plano={plano} />

            <Secao numero="08" titulo="Avisos importantes" id="avisos">
              <ul className={s.avisos}>
                <li>
                  <span className={s.forte}>{AVISO_SIMULADOR_REL}</span>
                </li>
                <li>{AVISO_CLASSIFICACAO}</li>
                <li>
                  <span className={s.forte}>Confira o edital.</span> Preços, praças, datas, ocupação e dívidas mudam e vale sempre o que está no edital e no
                  site da fonte. Leia a matrícula atualizada e, de preferência, converse com um especialista antes do lance.
                </li>
                <li>Fotos e anúncios pertencem às fontes; a Luneta não copia nem re-hospeda anúncios.</li>
                {exemplo && <li>Exemplo fictício da demonstração: nenhum número deste relatório se refere a um imóvel real.</li>}
              </ul>
            </Secao>

            <Secao numero="09" titulo="Fontes e datas" id="fontes">
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
                          {pagina.sobre.fontes.length ? ` (${fontesDoRelatorio(pagina.sobre.fontes)})` : ""}
                          .
                        </>
                      )}
                    </dd>
                  </div>
                  <ItbiFonte pagina={pagina} />
                  <FonteLocalizacao pagina={pagina} />
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
 * Tabela da região. Leilões: sempre os cinco recortes (rua, até 1 km, bairro, cidade e estado), o que não tem média com o
 * motivo; ITBI: só os recortes que a prefeitura cobre.
 */
function TabelaRegiao({ recortes, linhas, itbi, area }: { recortes?: RecorteRel[]; linhas?: LinhaRegiaoRel[]; itbi: boolean; area: number | null }) {
  // o valor do ITBI não é sempre o preço pago (base de cálculo em Porto Alegre e Fortaleza, avaliação no Recife): o
  // que ele é na cidade vem nas fontes, no fim do relatório (R4-VAZ-04)
  const titulo = itbi ? "Valor das compras registradas na prefeitura (ITBI)" : "Média de avaliação dos imóveis do mesmo tipo em leilão";
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
                {itbi ? "Valor médio" : "Média de avaliação"}
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
  if (temTabela) return `${cidade}: valor das compras registradas na prefeitura (ITBI), na tabela acima.`;
  if (motivo) return `${cidade}: a Luneta tem as compras registradas (ITBI) desta cidade, mas este imóvel fica fora da comparação. ${motivo}`;
  if (cob.cidadeTemItbi)
    return `${cidade}: a Luneta tem as compras registradas (ITBI) desta cidade, mas a prefeitura não registra compras suficientes de imóveis do mesmo tipo perto deste para comparar.`;
  return `${cidade}: a Luneta ainda não tem as compras registradas (ITBI) desta cidade.`;
}

function Regiao({ pagina }: { pagina: PaginaImovel }) {
  const i = pagina.imovel;
  const exemplo = ehExemploRel(i);
  const r = regiaoRel(i, pagina.vizinhanca.referencias, pagina.vizinhanca.amostrasLeiloes ?? null);
  const temLeiloes = r.leiloes.length > 0;
  const nota = notaItbi(pagina, r.itbi.length > 0);
  return (
    <Secao
      numero="05"
      titulo="Preço do m² na região"
      id="regiao"
      descricao="Média de R$ por m² dos imóveis do mesmo tipo na rua, num raio de 1 km, no bairro, na cidade e no estado, comparada com a avaliação e o lance mínimo deste imóvel."
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
            : `Ainda não há imóveis do mesmo tipo suficientes em leilão na base para comparar (pelo menos ${MINIMO_RECORTE.rua} na rua, ${MINIMO_RECORTE.perto} a até 1 km, no bairro ou na cidade, ou ${MINIMO_RECORTE.uf} no estado).`}
        </p>
      )}
      {r.fraseLeiloes && <p className={s.p}>{r.fraseLeiloes}</p>}
      {/* o aviso da rodada 6: em destaque quando as frases comparam só com a cidade ou o estado (no exemplo fictício,
          sem o motivo: "na base" seria a demonstração) */}
      {r.fraco ? (
        <p className={s.alertaLocal}>
          <strong className={s.forte}>{AVISO_RECORTE.titulo}</strong> {AVISO_RECORTE.fraco}
          {r.motivoFraco && !exemplo ? ` ${r.motivoFraco}` : ""}
        </p>
      ) : (
        r.frase && (
          <p className={s.pequeno}>
            {AVISO_RECORTE.titulo} {AVISO_RECORTE.fraco.replace(": use com cuidado", "")}
          </p>
        )
      )}
      {/* a tabela da referência da frase vem primeiro */}
      {r.fontePrincipal === "itbi" && <TabelaRegiao linhas={r.itbi} itbi area={i.area} />}
      {temLeiloes && <TabelaRegiao recortes={r.recortes} itbi={false} area={i.area} />}
      {r.fontePrincipal !== "itbi" && r.itbi.length > 0 && <TabelaRegiao linhas={r.itbi} itbi area={i.area} />}
      {(temLeiloes || r.itbi.length > 0) && (
        <p className={s.pequeno}>
          Níveis: muito abaixo (30% ou mais abaixo da média), abaixo (10% a 29%), na média (menos de 10% de diferença), acima e muito acima. Para ter média, o
          recorte precisa de pelo menos {MINIMO_RECORTE.rua} imóveis do mesmo tipo na rua, {MINIMO_RECORTE.perto} a até 1 km, {MINIMO_RECORTE.bairro} no bairro e
          na cidade e {MINIMO_RECORTE.uf} no estado; o raio de 1 km só vale quando o endereço deste imóvel e o de cada comparado foram achados no número ou na
          rua (o ponto achado pela rua pode errar algumas centenas de metros). A avaliação é a que a fonte publica para o leilão; o lance é o mínimo de
          hoje: os dois podem estar longe do preço de venda de verdade.
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
      <dt>Compras registradas (ITBI)</dt>
      <dd>
        {i.cidade}/{i.uf}, dados da prefeitura
        {f?.detalhe ? `: ${f.detalhe}` : ""}
        {f?.licenca ? ` · licença ${f.licenca}` : ` · ${LICENCA_A_CONFIRMAR}`}
        {f?.url ? ` · ${f.url}` : ""}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 06 Localização (nota de localização; Luneta)
// ---------------------------------------------------------------------------

/**
 * Os números de uma parte, com o comum na cidade: "Mercados a até 500 m: 8 (comum 10)". Todos: cortar em 3 escondia
 * escolas e saúde dos serviços e o esgoto da infraestrutura, que entram na nota (revisão final da rodada 4, M17).
 */
function numerosDaParte(c: ComponenteLocal) {
  return c.indicadores.map((x) => `${x.rotulo}: ${x.valor}${x.comum !== null ? ` (comum ${x.comum})` : ""}`).join("; ");
}

function LocalizacaoRel({ pagina, plano }: { pagina: PaginaImovel; plano: Plano }) {
  const i = pagina.imovel;
  const loc = pagina.localizacao;
  const exemplo = ehExemploRel(i);
  if (!pode(plano, "localizacao") || pagina.travas.includes("localizacao")) {
    return (
      <Secao numero="06" titulo="Localização" id="localizacao">
        <p className={s.p}>A nota de localização é do plano Luneta e não entra neste relatório.</p>
      </Secao>
    );
  }
  if (!loc) {
    return (
      <Secao numero="06" titulo="Localização" id="localizacao">
        <p className={s.p}>Não há dados de localização para este imóvel.</p>
      </Secao>
    );
  }
  const cidade = loc.referencia?.nome ?? `${i.cidade}/${i.uf}`;
  const pequena = cidadePequena(loc);
  const comNota = !pequena && loc.nota !== null && (loc.situacao === "calculada" || loc.situacao === "aproximada");
  const aproximada = comNota && loc.situacao === "aproximada";
  const selo = seloPrecisao(loc, exemplo);
  const usouOsm = loc.fontes.some((f) => /OpenStreetMap/i.test(f.nome));
  return (
    <Secao
      numero="06"
      titulo="Localização"
      id="localizacao"
      descricao="Nota de 0 a 100 para o entorno do imóvel, comparado com onde moram as pessoas da mesma cidade, com dados públicos (a maior parte de 2022)."
    >
      <div className={s.inteira}>
        {comNota ? (
          <div className={s.notaLocal}>
            <p className={s.notaNumero}>
              {aproximada ? "~" : ""}
              {notaNaEscala(loc.nota!)}
              <small>de 100</small>
            </p>
            <div>
              <p className={s.fraseRegiao} style={{ marginTop: 0 }}>
                {aproximada && loc.faixa ? fraseFaixa(loc.faixa, cidade) : frasePercentil(loc.nota!, cidade)}.
              </p>
              <p className={s.pequeno}>
                {selo?.rotulo}
                {aproximada ? `. O meio da faixa (${notaNaEscala(loc.nota!)}) vale para ordenar e filtrar; as partes foram medidas ${pontoMedido(loc).no}.` : "."}
                {exemplo ? " Exemplo fictício: a nota e os números foram inventados." : ""}
              </p>
            </div>
          </div>
        ) : pequena ? (
          <>
            <p className={s.fraseRegiao}>{resumoTercos(loc.componentes, cidade)}</p>
            <p className={s.pequeno}>
              Cidade pequena, sem nota de 0 a 100. {loc.motivo ?? ""} {selo ? `${selo.rotulo}.` : ""}
            </p>
          </>
        ) : (
          <>
            <p className={s.fraseRegiao}>{loc.situacao === "pendente" ? "A nota deste imóvel ainda não foi calculada." : "Sem nota de localização para este imóvel."}</p>
            {loc.motivo && <p className={s.p}>{loc.motivo}</p>}
          </>
        )}
      </div>

      {(comNota || pequena) && (
        <div className={s.inteira}>
          {/* rola de lado no celular: com o foco (Tab), as setas rolam a tabela */}
          <div className={s.rolagem} tabIndex={0} role="region" aria-label="As seis partes da nota de localização (tabela; role para o lado para ver todas as colunas)">
          <table className={s.tabela} style={{ marginTop: "0.9em" }}>
            <caption className="sr-only">As seis partes da nota de localização</caption>
            <thead>
              <tr>
                <th scope="col">Parte</th>
                <th scope="col" className={s.num}>
                  {pequena ? "Posição" : "Nota"}
                </th>
                {!pequena && (
                  <th scope="col" className={s.num}>
                    Peso
                  </th>
                )}
                {/* pela precisão do ponto, não pela situação: a cidade pequena no bairro também é o centro do bairro (M13) */}
                <th scope="col">{pontoMedido(loc).exato || exemplo ? "Números em volta" : `Números em volta ${pontoMedido(loc).do}`}</th>
              </tr>
            </thead>
            <tbody>
              {loc.componentes.map((c) => (
                <tr key={c.chave}>
                  <th scope="row">{c.rotulo}</th>
                  <td className={s.num}>{c.terco ? TERCO_CURTO[c.terco] : c.nota === null ? "sem dado" : notaNaEscala(c.nota)}</td>
                  {!pequena && <td className={s.num}>{c.nota === null ? "0%" : `${c.peso}%`}</td>}
                  <td>
                    {c.nota === null && !c.terco ? SEM_DADO_COMPONENTE : numerosDaParte(c) || "—"}
                    {c.incompleto ? " (dado incompleto)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* estação de metrô, trem ou VLT a menos de 1 km (rodada 5): como na página do imóvel */}
      {!exemplo && (loc.estacoes?.length ?? 0) > 0 && (
        <div className={s.inteira}>
          <p className={s.p}>
            <span className={s.forte}>Transporte sobre trilhos perto.</span> {loc.estacoes!.map((e) => fraseEstacao(e)).join("; ")}. Em linha reta do ponto do
            endereço, não pelo caminho a pé (estações do OpenStreetMap).
          </p>
        </div>
      )}

      <div className={s.inteira}>
        {loc.alertas.length > 0 ? (
          loc.alertas.map((a, k) => (
            <p key={k} className={s.alertaLocal}>
              <span className={s.forte}>{a.titulo}.</span> {a.texto}
            </p>
          ))
        ) : (
          <p className={s.p}>
            <span className={s.forte}>{textoRiscoSemAlerta(loc).titulo}.</span> {textoRiscoSemAlerta(loc).texto}
          </p>
        )}
        <p className={s.pequeno}>
          {NOTA_NAO_GARANTIA} Como a nota é calculada: {SITE.url.replace(/\/$/, "")}
          {ROTA_METODO_LOCAL}.
          {usouOsm ? ` Contém dados do OpenStreetMap, ${OSM_ATRIBUICAO.texto} (${OSM_ATRIBUICAO.url.replace(/^https:\/\//, "")}).` : ""}
        </p>
      </div>
    </Secao>
  );
}

/** A linha "Nota de localização" de "Fontes e datas" (só quando a nota aparece no relatório). */
function FonteLocalizacao({ pagina }: { pagina: PaginaImovel }) {
  const loc = pagina.localizacao;
  if (!loc || pagina.travas.includes("localizacao")) return null;
  const exemplo = ehExemploRel(pagina.imovel);
  return (
    <div>
      <dt>Nota de localização</dt>
      <dd>
        {exemplo
          ? "Exemplo fictício: valores inventados para a demonstração."
          : `${loc.fontes.map((f) => f.nome).join("; ")}. Cálculo de ${dataCurtaRel(loc.geradoEm) ?? loc.geradoEm}.`}
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
  if (!pode(plano, "tags")) {
    return (
      <Secao numero="07" titulo="Principais alertas" id="alertas">
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
      numero="07"
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
        {i.porQueSelo || (pendente ? "Os critérios dos selos ainda estão em definição com o especialista parceiro." : "")}
      </p>
    </Secao>
  );
}
