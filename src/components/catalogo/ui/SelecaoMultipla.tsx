"use client";

import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { normalizar, numero } from "@/lib/catalogo/rotulos";
import { IconeCheck, IconeLupa, IconeX } from "./icones";

export interface OpcaoSelecao {
  valor: string;
  rotulo: string;
  /** texto menor ao lado: a UF da cidade, a cidade do bairro */
  detalhe?: string;
  total: number;
  /** outros textos que também acham a opção (nome do estado para a sigla, por exemplo) */
  sinonimos?: string;
}

/** Linhas mostradas de cada vez; "Mostrar mais" traz o próximo lote (listas de 1.000+ opções). */
const LOTE = 50;

/** Trechos do rótulo que casam com a busca, sem acento e sem caixa ("sao" acha "São"). */
function destacar(rotulo: string, termos: readonly string[]): ReactNode {
  if (!termos.length) return rotulo;
  // índice no texto normalizado → índice no original (letras com acento combinado viram uma só)
  let norm = "";
  const origem: number[] = [];
  for (let i = 0; i < rotulo.length; i++) {
    const n = normalizar(rotulo[i]);
    for (let j = 0; j < n.length; j++) origem.push(i);
    norm += n;
  }
  origem.push(rotulo.length);
  const marcas = new Array<boolean>(rotulo.length).fill(false);
  for (const t of termos) {
    const ini = norm.indexOf(t);
    if (ini < 0) continue;
    for (let k = origem[ini]; k < origem[ini + t.length]; k++) marcas[k] = true;
  }
  const partes: ReactNode[] = [];
  let i = 0;
  while (i < rotulo.length) {
    const marcado = marcas[i];
    let j = i;
    while (j < rotulo.length && marcas[j] === marcado) j++;
    const pedaco = rotulo.slice(i, j);
    partes.push(
      marcado ? (
        <mark key={i} className="rounded-[3px] bg-latao/25 text-inherit">
          {pedaco}
        </mark>
      ) : (
        pedaco
      ),
    );
    i = j;
  }
  return partes;
}

/**
 * Lista com busca e caixas de seleção, para escolher vários itens (estados, cidades, bairros, fontes).
 * - Busca por texto sem acento ("uberlandia", "sao jose"), com o trecho achado em destaque.
 * - Os escolhidos ficam no topo (a ordem se ajusta ao abrir e ao mudar a busca, não a cada toque,
 *   para a linha não fugir do dedo).
 * - Teclado no campo de busca: ↑↓ andam na lista, Enter marca (sem item ativo, marca o primeiro
 *   resultado e limpa a busca, para digitar o próximo), Espaço marca depois de usar as setas, Esc limpa
 *   a busca (e, vazia, fecha o pop-up).
 * - Mostra 50 por vez ("Mostrar mais"), suficiente para 5 mil bairros sem travar.
 * - Opções com 0 imóveis somem, menos as escolhidas.
 */
export function SelecaoMultipla({
  rotulo,
  placeholder,
  opcoes,
  selecionados,
  onChange,
  unidade = ["item", "itens"],
  feminino = false,
  focarBusca = false,
  vazio,
  aviso,
  alturaLista = "max-h-[min(46vh,336px)]",
  loteInicial = LOTE,
}: {
  /** nome da lista para leitores de tela ("Cidades") */
  rotulo: string;
  placeholder: string;
  opcoes: readonly OpcaoSelecao[];
  selecionados: readonly string[];
  onChange: (valores: string[]) => void;
  /** singular e plural ("cidade", "cidades") */
  unidade?: readonly [string, string];
  /** concordância: "3 selecionadas" */
  feminino?: boolean;
  focarBusca?: boolean;
  /** texto quando a busca não acha nada */
  vazio?: string;
  /** aviso acima da lista ("Escolha uma cidade para ver os bairros") */
  aviso?: ReactNode;
  /** classe da altura máxima da lista */
  alturaLista?: string;
  /** quantos itens aparecem antes de "Mostrar mais" (o celular, sem rolagem interna, mostra poucos) */
  loteInicial?: number;
}) {
  const id = useId();
  const [consulta, setConsulta] = useState("");
  const [ativo, setAtivo] = useState(-1);
  const [nasSetas, setNasSetas] = useState(false);
  const [limite, setLimite] = useState(loteInicial);
  const [fixados, setFixados] = useState(() => new Set(selecionados));
  const [consultaFixada, setConsultaFixada] = useState(consulta);
  if (consulta !== consultaFixada) {
    // busca mudou: os escolhidos de agora sobem para o topo, a lista volta ao primeiro lote
    setConsultaFixada(consulta);
    setFixados(new Set(selecionados));
    setLimite(loteInicial);
    setAtivo(-1);
  }

  const escolhidos = useMemo(() => new Set(selecionados), [selecionados]);
  const indice = useMemo(() => opcoes.map((o) => normalizar(`${o.rotulo} ${o.detalhe ?? ""} ${o.sinonimos ?? ""}`)), [opcoes]);
  const termos = useMemo(() => normalizar(consulta).trim().split(/\s+/).filter(Boolean), [consulta]);

  const lista = useMemo(() => {
    const achados: { o: OpcaoSelecao; peso: number; i: number }[] = [];
    opcoes.forEach((o, i) => {
      if (o.total <= 0 && !escolhidos.has(o.valor)) return;
      const texto = indice[i];
      if (termos.length && !termos.every((t) => texto.includes(t))) return;
      let peso = fixados.has(o.valor) ? 0 : 10;
      if (termos.length) {
        const r = normalizar(o.rotulo);
        const q = termos.join(" ");
        peso += r.startsWith(q) ? 0 : r.split(/[\s-]+/).some((p) => p.startsWith(termos[0])) ? 1 : 2;
      }
      achados.push({ o, peso, i });
    });
    achados.sort((a, b) => a.peso - b.peso || a.i - b.i);
    return achados.map((a) => a.o);
  }, [opcoes, indice, termos, escolhidos, fixados]);

  const mostradas = lista.slice(0, limite);
  const restantes = lista.length - mostradas.length;
  const opId = (i: number) => `${id}-o-${i}`;
  const [um, varios] = unidade;
  const totalOpcoes = opcoes.filter((o) => o.total > 0 || escolhidos.has(o.valor)).length;

  const alternar = (valor: string) => {
    onChange(escolhidos.has(valor) ? selecionados.filter((v) => v !== valor) : [...selecionados, valor]);
  };

  const irPara = (i: number) => {
    if (!lista.length) return;
    const alvo = Math.max(0, Math.min(lista.length - 1, i));
    if (alvo >= limite) setLimite(Math.max(limite, Math.ceil((alvo + 1) / LOTE) * LOTE));
    setAtivo(alvo);
    setNasSetas(true);
    requestAnimationFrame(() => document.getElementById(opId(alvo))?.scrollIntoView({ block: "nearest" }));
  };

  const onTecla = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        irPara(ativo + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        irPara(ativo <= 0 ? 0 : ativo - 1);
        break;
      case "PageDown":
        e.preventDefault();
        irPara(ativo + 8);
        break;
      case "PageUp":
        e.preventDefault();
        irPara(ativo - 8);
        break;
      case "Enter": {
        e.preventDefault();
        const alvo = lista[ativo] ?? (termos.length ? lista[0] : undefined);
        if (!alvo) break;
        alternar(alvo.valor);
        if (ativo < 0) setConsulta("");
        break;
      }
      case " ":
        if (nasSetas && lista[ativo]) {
          e.preventDefault();
          alternar(lista[ativo].valor);
        }
        break;
      case "Escape":
        if (consulta) {
          // só limpa a busca: o pop-up e a folha ouvem o Esc no document, então além de parar a
          // propagação é preciso barrar os outros ouvintes do mesmo nó (o React escuta no document)
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          setConsulta("");
        }
        break;
    }
  };

  const listaId = `${id}-lista`;
  const ativoValido = ativo >= 0 && ativo < mostradas.length;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative">
        <IconeLupa tamanho={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-nevoa" />
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={ativoValido ? opId(ativo) : undefined}
          aria-label={`Buscar em ${rotulo.toLowerCase()}`}
          // o pop-up abre para digitar: o foco vai direto à busca
          autoFocus={focarBusca}
          value={consulta}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(e) => {
            setConsulta(e.target.value);
            setNasSetas(false);
          }}
          onKeyDown={onTecla}
          // 16 px no toque (o Safari do iPhone não dá zoom ao focar), 14 px no mouse; foco com anel de contraste
          className="h-11 w-full min-w-0 rounded-xl border border-nevoa/30 bg-noite/40 pr-11 pl-10 text-base text-luar placeholder:text-nevoa transition-[border-color,box-shadow] duration-150 outline-none hover:border-nevoa/55 focus:border-latao-texto focus:ring-2 focus:ring-latao-texto/60 focus-visible:outline-none pointer-fine:h-10 pointer-fine:text-sm"
        />
        {consulta && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => setConsulta("")}
            className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-nevoa transition-colors hover:text-luar pointer-fine:size-8"
          >
            <IconeX />
          </button>
        )}
      </div>

      <div className="flex min-h-8 items-center justify-between gap-3 px-1 text-xs text-nevoa">
        <span className="tabular-nums" aria-live="polite">
          {selecionados.length > 0 ? (
            <span className="font-semibold text-luar">
              {numero(selecionados.length)} {selecionados.length === 1 ? (feminino ? "selecionada" : "selecionado") : feminino ? "selecionadas" : "selecionados"}
            </span>
          ) : termos.length ? (
            `${numero(lista.length)} ${lista.length === 1 ? "resultado" : "resultados"}`
          ) : (
            `${numero(totalOpcoes)} ${totalOpcoes === 1 ? um : varios}`
          )}
        </span>
        {selecionados.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="-my-2 inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
          >
            Limpar
          </button>
        )}
      </div>

      {aviso}

      <ul
        id={listaId}
        role="listbox"
        aria-label={rotulo}
        aria-multiselectable="true"
        // a lista é dirigida pelo campo (setas, aria-activedescendant): fora do Tab (o Chrome põe toda área que
        // rola sem filho focável na ordem do Tab, e ali nada se escolhia)
        tabIndex={-1}
        // sem overscroll-contain: no fim da lista o dedo continua rolando a folha em volta (senão a
        // rolagem "trava" em cima da lista no celular)
        className={`-mx-1 overflow-y-auto px-1 ${alturaLista}`}
      >
        {mostradas.map((o, i) => {
          const on = escolhidos.has(o.valor);
          const atual = i === ativo;
          return (
            <li
              key={o.valor}
              id={opId(i)}
              role="option"
              aria-selected={on}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAtivo(i);
                alternar(o.valor);
              }}
              className={`group/op flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1.5 transition-colors duration-100 select-none pointer-fine:min-h-9 ${
                atual ? "bg-nevoa/15 ring-2 ring-latao-texto ring-inset" : "hover:bg-nevoa/[0.08]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-[background-color,border-color] duration-100 ${
                  on ? "border-latao bg-latao text-noite-fixa" : "border-nevoa/55 group-hover/op:border-nevoa"
                }`}
              >
                {on && <IconeCheck tamanho={11} />}
              </span>
              <span className={`min-w-0 flex-1 truncate text-sm ${on ? "font-semibold text-luar" : "text-luar"}`}>
                {destacar(o.rotulo, termos)}
                {o.detalhe && (
                  <>
                    {" "}
                    <span className="ml-1 text-xs font-normal text-nevoa">{o.detalhe}</span>
                  </>
                )}
              </span>
              <span className="shrink-0 text-xs text-nevoa tabular-nums">
                <span className="sr-only">, </span>
                {numero(o.total)}
                <span className="sr-only"> {o.total === 1 ? "imóvel" : "imóveis"}</span>
              </span>
            </li>
          );
        })}
        {!lista.length && (
          <li role="presentation" className="px-2.5 py-4 text-sm leading-snug text-nevoa">
            {vazio ?? (termos.length ? `Nada com “${consulta.trim()}” nesta busca.` : `Nenhum${feminino ? "a" : ""} ${um} nesta busca.`)}
          </li>
        )}
      </ul>

      {restantes > 0 && (
        <button
          type="button"
          onClick={() => setLimite((l) => (restantes <= LOTE ? l + restantes : l + LOTE))}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1 self-start rounded-lg px-1 text-[13px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
        >
          {restantes <= LOTE ? (
            // "Mostrar todos os 27 estados", "Mostrar todas as 12 cidades"
            `Mostrar ${feminino ? "todas as" : "todos os"} ${numero(lista.length)} ${termos.length ? (lista.length === 1 ? "resultado" : "resultados") : lista.length === 1 ? um : varios}`
          ) : (
            <>
              Mostrar mais {numero(LOTE)}
              <span className="font-normal text-nevoa tabular-nums">· faltam {numero(restantes)}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
