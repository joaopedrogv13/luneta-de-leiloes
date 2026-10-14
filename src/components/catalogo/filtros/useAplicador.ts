"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Filtros } from "@/lib/catalogo/tipos";

/** Uma mudança nos filtros, aplicada sobre os filtros mais recentes (não sobre os de quando foi pedida). */
export type Atualizar = (f: Filtros) => Filtros;

/**
 * `aplicar(chave, atualizar, { adiar })`: o mesmo contrato para os pop-ups (aplicam na hora, faixas e
 * texto com espera) e o rascunho do painel (aplica tudo no rascunho, sem espera). `chave` identifica o
 * controle: duas mudanças adiadas do mesmo controle viram uma só (vale a última).
 */
export type Aplicar = (chave: string, atualizar: Atualizar, opcoes?: { adiar?: boolean }) => void;

/**
 * Aplicador dos pop-ups rápidos: imediato para escolhas (chips, listas) e com espera de `ms` para
 * faixas e texto. Mudanças adiadas de controles diferentes não se perdem: são compostas, na ordem,
 * sobre os filtros mais recentes. `descarregar()` aplica já o que está pendente (ao fechar o pop-up);
 * ao desmontar, também.
 */
export function useAplicador(filtros: Filtros, onChange: (f: Filtros) => void, ms = 300) {
  const ultimo = useRef({ filtros, onChange });
  const pendentes = useRef(new Map<string, Atualizar>());
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Os filtros "mais recentes" só voltam aos do pai quando o pai manda filtros NOVOS. Se o pai renderizar
  // de novo com os mesmos filtros (ex.: só `carregando` mudou, ou um `onChange` inline novo) antes de
  // aplicar a mudança otimista, ela não pode se perder.
  useEffect(() => {
    ultimo.current = { ...ultimo.current, filtros };
  }, [filtros]);
  useEffect(() => {
    ultimo.current = { ...ultimo.current, onChange };
  }, [onChange]);

  const descarregar = useCallback(() => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = null;
    if (!pendentes.current.size) return;
    let f = ultimo.current.filtros;
    for (const atualizar of pendentes.current.values()) f = atualizar(f);
    pendentes.current.clear();
    // otimista: até o pai devolver os filtros novos, a próxima mudança parte destes
    ultimo.current = { ...ultimo.current, filtros: f };
    ultimo.current.onChange(f);
  }, []);

  const aplicar = useCallback<Aplicar>(
    (chave, atualizar, opcoes) => {
      pendentes.current.delete(chave);
      pendentes.current.set(chave, atualizar);
      if (!opcoes?.adiar) return descarregar();
      if (relogio.current) clearTimeout(relogio.current);
      relogio.current = setTimeout(descarregar, ms);
    },
    [descarregar, ms],
  );

  useEffect(() => descarregar, [descarregar]);

  return useMemo(() => ({ aplicar, descarregar }), [aplicar, descarregar]);
}
