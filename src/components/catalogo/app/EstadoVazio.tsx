"use client";

import { useEffect, useState } from "react";
import { chaveFiltros, pilulas, removerFiltro, type NomesDasFacetas, type Pilula } from "@/lib/catalogo/filtros-rotulos";
import { plural } from "@/lib/catalogo/rotulos";
import type { Filtros } from "@/lib/catalogo/tipos";
import { IconeAneis } from "../ui/icones";

type Sugestao = { pilula: Pilula; filtros: Filtros; total: number };
/** "Ver todos os imóveis em AC": só o estado, sem os outros filtros. */
type SoEstado = { ufs: string[]; total: number };

/** No máximo tantas contagens por estado vazio (cada uma é uma consulta leve à API). */
const MAX_TESTES = 8;

/**
 * "Nenhum imóvel com esses filtros", com o caminho de volta: para cada filtro ativo, quantos imóveis
 * apareceriam sem ele; os que mais devolvem resultados viram botões ("Tirar Lance até R$ 100 mil · 1.234
 * imóveis"). Nenhum filtro sozinho resolvendo, o botão principal é "Limpar todos os filtros" (e, com estado
 * escolhido, "Ver todos os imóveis em AC"). Sem filtro nenhum, só a explicação (a base está vazia ou fora do ar).
 */
export function EstadoVazio({
  filtros,
  nomes,
  contar,
  onChange,
  onLimparTudo,
}: {
  filtros: Filtros;
  nomes?: NomesDasFacetas;
  contar: (f: Filtros, sinal?: AbortSignal) => Promise<number>;
  onChange: (f: Filtros) => void;
  onLimparTudo: () => void;
}) {
  const chave = chaveFiltros(filtros);
  const [sugestoes, setSugestoes] = useState<{ chave: string; itens: Sugestao[]; soEstado: SoEstado | null } | null>(null);
  const ativos = pilulas(filtros, nomes);

  useEffect(() => {
    const lista = pilulas(filtros, nomes).slice(0, MAX_TESTES);
    if (lista.length === 0) return;
    const controle = new AbortController();
    const ufs = filtros.uf ?? [];
    // com estado escolhido e mais filtros: quantos o estado tem sem os outros
    const testarEstado = ufs.length > 0 && ufs.length <= 3 && lista.some((p) => p.grupo !== "uf");
    Promise.all([
      Promise.all(
        lista.map((p) => {
          const sem = removerFiltro(filtros, p.grupo, p.valor);
          return contar(sem, controle.signal).then(
            (total) => ({ pilula: p, filtros: sem, total }),
            () => null,
          );
        }),
      ),
      testarEstado ? contar({ uf: ufs }, controle.signal).then((total) => ({ ufs, total }), () => null) : Promise.resolve(null),
    ]).then(([r, estado]) => {
      if (controle.signal.aborted) return;
      const itens = r
        .filter((x): x is Sugestao => x !== null && x.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);
      setSugestoes({ chave, itens, soEstado: estado && estado.total > 0 ? estado : null });
    });
    return () => controle.abort();
    // `chave` resume os filtros (a mesma busca não conta de novo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, contar]);

  const pronto = sugestoes?.chave === chave ? sugestoes : null;
  const prontas = pronto ? pronto.itens : null;
  const soEstado = pronto?.soEstado ?? null;
  // nenhum filtro sozinho resolve: limpar vira a ação principal
  const semSaida = prontas !== null && prontas.length === 0;

  return (
    <div className="rounded-3xl border border-dashed border-nevoa/35 px-6 py-12 text-center">
      <IconeAneis tamanho={30} className="mx-auto text-nevoa" />
      <p className="mt-4 font-display text-xl font-bold text-luar">Nenhum imóvel com esses filtros</p>
      {ativos.length > 0 ? (
        <>
          <p aria-live="polite" className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-nevoa">
            {semSaida
              ? "Nenhum filtro sozinho traz imóveis de volta."
              : ativos.length === 1
                ? "Tire o filtro para abrir o foco da luneta."
                : "Tire o filtro que mais restringe a busca:"}
          </p>
          {!semSaida && (
          <ul aria-live="polite" className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
            {prontas === null ? (
              <li className="text-[13px] text-nevoa">Procurando o filtro que mais restringe…</li>
            ) : (
              prontas.map((s) => (
                <li key={s.pilula.id}>
                  <button
                    type="button"
                    onClick={() => onChange(s.filtros)}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-latao/60 bg-latao/10 px-4 text-[13.5px] font-medium text-luar transition-colors duration-150 hover:bg-latao/20 pointer-fine:min-h-10"
                  >
                    <span>
                      Tirar <span className="font-semibold">{s.pilula.rotulo}</span>
                    </span>
                    <span className="text-nevoa tabular-nums">· {plural(s.total, "imóvel", "imóveis")}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={onLimparTudo} className={semSaida ? "btn-primary !min-h-11 !text-sm" : "btn-ghost !min-h-11 !text-sm"}>
              Limpar todos os filtros
            </button>
            {soEstado && (
              <button type="button" onClick={() => onChange({ uf: soEstado.ufs })} className="btn-outline !min-h-11 !text-sm">
                Ver todos os imóveis em {soEstado.ufs.join(", ")}{" "}
                <span className="font-normal text-nevoa tabular-nums">· {plural(soEstado.total, "imóvel", "imóveis")}</span>
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-nevoa">A base não tem imóveis ativos agora. Volte mais tarde.</p>
      )}
    </div>
  );
}
