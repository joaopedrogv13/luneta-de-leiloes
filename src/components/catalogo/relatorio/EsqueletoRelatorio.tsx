/** Enquanto o relatório chega do servidor: a barra e uma folha clara com linhas esmaecidas (nunca tela em branco). */
export function EsqueletoRelatorio() {
  const linha = "rounded-full bg-[#e6e8ee] motion-safe:animate-pulse";
  return (
    <div className="min-h-screen bg-noite pb-16" aria-busy="true" aria-live="polite">
      <div className="h-[58px] border-b border-nevoa/15" />
      <p className="sr-only">Montando o relatório…</p>
      <div className="mx-auto mt-6 w-[min(210mm,calc(100%-24px))] rounded-[2px] bg-white px-[min(15mm,16px)] py-10 shadow-[0_18px_48px_rgba(7,11,22,.28)] sm:px-[15mm]">
        <div className="flex items-end justify-between border-b-2 border-[#0f1830] pb-4">
          <div className={`h-6 w-48 ${linha}`} />
          <div className={`h-3 w-32 ${linha}`} />
        </div>
        <div className={`mt-10 h-3 w-40 ${linha}`} />
        <div className={`mt-4 h-8 w-4/5 ${linha}`} />
        <div className={`mt-3 h-4 w-3/5 ${linha}`} />
        <div className="mt-8 grid grid-cols-3 gap-5">
          {Array.from({ length: 9 }, (_, k) => (
            <div key={k} className={`h-9 ${linha}`} />
          ))}
        </div>
        <div className={`mt-10 h-44 rounded-[3px] ${linha}`} />
      </div>
    </div>
  );
}
