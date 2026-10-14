"use client";

import { autoUpdate, flip, offset, shift, size, useFloating, type Placement } from "@floating-ui/react-dom";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Pop-up ancorado (filtros rápidos, explicação de tag, cartão do mapa). Não é modal: abre por clique
 * no botão-gatilho (ou pelo `aberto` controlado), fecha com Esc, clique fora ou `fechar()`. O foco vai
 * para o painel ao abrir (se `focarAoAbrir`) e volta ao gatilho ao fechar com Esc. Fica sempre dentro
 * da tela (flip/shift) e limita a altura ao espaço disponível (rola por dentro).
 *
 * O gatilho é um <button> desenhado aqui (o React Compiler não aceita ref passada a render-prop):
 *   <Popover rotulo="Preço" gatilho={{ conteudo: "Preço", className: "chip" }}>
 *     {({ fechar }) => <PainelPreco onAplicar={fechar} />}
 *   </Popover>
 */
export function Popover({
  gatilho,
  children,
  rotulo,
  posicao = "bottom-start",
  largura,
  aberto: abertoControlado,
  onAbertoChange,
  focarAoAbrir = true,
  papel = "dialog",
  className = "",
}: {
  gatilho: {
    conteudo: ReactNode | ((aberto: boolean) => ReactNode);
    className?: string | ((aberto: boolean) => string);
    /** nome acessível do botão, quando o conteúdo visível não basta */
    ariaLabel?: string;
    title?: string;
    disabled?: boolean;
  };
  children: ReactNode | ((p: { fechar: () => void }) => ReactNode);
  /** nome acessível do painel */
  rotulo: string;
  posicao?: Placement;
  /** largura do painel (px ou CSS); padrão: conteúdo, até 92vw */
  largura?: number | string;
  aberto?: boolean;
  onAbertoChange?: (aberto: boolean) => void;
  focarAoAbrir?: boolean;
  /** "dialog" para painéis com controles; "note" para explicações só de leitura */
  papel?: "dialog" | "note";
  className?: string;
}) {
  const [abertoInterno, setAbertoInterno] = useState(false);
  const aberto = abertoControlado ?? abertoInterno;
  const setAberto = useCallback(
    (v: boolean) => {
      if (abertoControlado === undefined) setAbertoInterno(v);
      onAbertoChange?.(v);
    },
    [abertoControlado, onAbertoChange],
  );
  const id = useId();
  const painel = useRef<HTMLDivElement | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);

  const { refs, floatingStyles } = useFloating({
    open: aberto,
    placement: posicao,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(180, availableHeight)}px`;
        },
      }),
    ],
  });

  // Fechar por dentro ("Pronto", escolher uma opção): se o foco estava no painel, volta ao gatilho
  // (senão ele cairia no <body> quando o painel some e o teclado recomeçaria do topo da página).
  // (pelo id, não pelas refs: `fechar` vai para o render-prop dos filhos e o React Compiler não aceita ref ali)
  const fechar = useCallback(() => {
    const focoDentro = !!document.getElementById(id)?.contains(document.activeElement);
    const gatilho = document.querySelector<HTMLButtonElement>(`[aria-controls="${CSS.escape(id)}"]`);
    setAberto(false);
    if (focoDentro) gatilho?.focus({ preventScroll: true });
  }, [id, setAberto]);

  // `setAberto` muda quando quem usa passa `onAbertoChange` novo a cada render (função inline): o efeito
  // abaixo lê a versão mais recente por ref e roda SÓ ao abrir/fechar. Se dependesse dela, cada render do
  // pai (os filtros aplicados enquanto o pop-up está aberto) devolveria o foco ao painel, tirando-o do
  // campo onde a pessoa digita ou do cursor que ela move pelo teclado.
  const ultimo = useRef({ setAberto, focarAoAbrir });
  useEffect(() => {
    ultimo.current = { setAberto, focarAoAbrir };
  });

  useEffect(() => {
    if (!aberto) return;
    if (ultimo.current.focarAoAbrir) requestAnimationFrame(() => painel.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      // Esc já tratado por dentro (ex.: limpar a busca de uma lista) não fecha o pop-up
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.stopPropagation();
      ultimo.current.setAberto(false);
      botao.current?.focus({ preventScroll: true });
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (painel.current?.contains(t) || botao.current?.contains(t)) return;
      ultimo.current.setAberto(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [aberto]);

  const classeBotao = typeof gatilho.className === "function" ? gatilho.className(aberto) : (gatilho.className ?? "");

  return (
    <>
      <button
        ref={(el) => {
          botao.current = el;
          refs.setReference(el);
        }}
        type="button"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        aria-haspopup={papel === "dialog" ? "dialog" : undefined}
        aria-label={gatilho.ariaLabel}
        title={gatilho.title}
        disabled={gatilho.disabled}
        onClick={() => setAberto(!aberto)}
        className={classeBotao}
      >
        {typeof gatilho.conteudo === "function" ? gatilho.conteudo(aberto) : gatilho.conteudo}
      </button>
      {aberto && (
        <div
          ref={(el) => {
            painel.current = el;
            refs.setFloating(el);
          }}
          id={id}
          // marca de "pop-up aberto": o botão flutuante do mapa (celular) sai da frente enquanto houver um
          data-popover=""
          role={papel === "dialog" ? "dialog" : "note"}
          aria-label={rotulo}
          tabIndex={-1}
          // o foco saiu do pop-up (Tab além do último controle): fecha, como um menu do sistema; foco que
          // vai para o próprio gatilho ou some (clique em área sem foco) não fecha
          onBlur={(e) => {
            const para = e.relatedTarget as Node | null;
            if (!para || e.currentTarget.contains(para) || botao.current?.contains(para)) return;
            ultimo.current.setAberto(false);
          }}
          style={{ ...floatingStyles, width: largura }}
          className={`z-[60] max-w-[92vw] overflow-auto overscroll-contain rounded-2xl border border-nevoa/25 bg-tinta text-luar shadow-[0_18px_60px_rgba(0,0,0,.35)] outline-none transition-[opacity,scale] duration-150 ease-out starting:scale-[0.98] starting:opacity-0 motion-reduce:transition-none ${className}`}
        >
          {typeof children === "function" ? children({ fechar }) : children}
        </div>
      )}
    </>
  );
}
