"use client";

import { useId, useState } from "react";
import { CAMPO, CHIP, CHIP_OFF, CHIP_ON } from "./estilos";

/** Hoje em Brasília (UTC−3, sem horário de verão), como AAAA-MM-DD. */
export function hojeBrasilia(agora = Date.now()) {
  return new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const ATALHOS = [
  { dias: 7, rotulo: "Próximos 7 dias" },
  { dias: 30, rotulo: "Próximos 30 dias" },
  { dias: 90, rotulo: "Próximos 90 dias" },
] as const;

/**
 * Data da praça: "de" e "até" (calendário nativo, que já fala a língua e o tema do sistema) e atalhos
 * "Próximos 7/30/90 dias" a partir de hoje (Brasília). Tocar no atalho ativo limpa as datas.
 */
export function CampoData({
  de,
  ate,
  onChange,
  rotulo = "Data da praça",
}: {
  de?: string;
  ate?: string;
  onChange: (de: string | undefined, ate: string | undefined) => void;
  rotulo?: string;
}) {
  const id = useId();
  // hoje fica fixo enquanto o controle está aberto (sem relógio no meio da renderização)
  const [hoje] = useState(() => hojeBrasilia());
  const invertido = !!de && !!ate && de > ate;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="sr-only">{rotulo}</legend>
      <div role="group" aria-label="Atalhos de data" className="flex flex-wrap gap-2">
        {ATALHOS.map((a) => {
          const fim = somarDias(hoje, a.dias);
          const on = de === hoje && ate === fim;
          return (
            <button
              key={a.dias}
              type="button"
              aria-pressed={on}
              onClick={() => (on ? onChange(undefined, undefined) : onChange(hoje, fim))}
              className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            >
              {a.rotulo}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${id}-de`} className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-nevoa">De</span>
          <input
            id={`${id}-de`}
            type="date"
            value={de ?? ""}
            max={ate || undefined}
            onChange={(e) => onChange(e.target.value || undefined, ate)}
            className={`${CAMPO} [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70`}
          />
        </label>
        <label htmlFor={`${id}-ate`} className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-nevoa">Até</span>
          <input
            id={`${id}-ate`}
            type="date"
            value={ate ?? ""}
            min={de || undefined}
            onChange={(e) => onChange(de, e.target.value || undefined)}
            className={`${CAMPO} [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70`}
          />
        </label>
      </div>
      {invertido && (
        <p role="alert" className="text-xs text-grave-texto">
          A data inicial está depois da final.
        </p>
      )}
    </fieldset>
  );
}
