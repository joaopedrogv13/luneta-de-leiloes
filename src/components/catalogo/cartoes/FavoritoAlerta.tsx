"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Popover } from "@/components/catalogo/ui/Popover";
import { useAlertasPraca } from "@/components/catalogo/useFavoritos";
import { ANCORA_ALERTA } from "@/lib/apresentacao";
import { ALERTA_PRACA, textoAlerta } from "@/lib/catalogo/produto";
import { IconeCoracao } from "./icones";

/** Sino pequeno (o aviso por e-mail ligado). */
function IconeSino({ size = 10 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * Favoritar com a opção "Avisar por e-mail quando a praça mudar" (rodada 5, ponto 8; plano Luneta).
 *
 * - Fora dos favoritos: o toque no coração favorita e abre o pop-up com a opção do aviso (desligada: o e-mail é
 *   consentimento, nunca vem ligado).
 * - Nos favoritos: o toque abre o mesmo pop-up, com "Tirar dos favoritos".
 * - Ligar o aviso de um imóvel fora dos favoritos também o favorita.
 * - Com PRODUTO.envioDeEmail false (hoje), a preferência fica só neste navegador (useAlertasPraca) e o pop-up diz que o
 *   envio de e-mails começa no lançamento. Nenhum e-mail é pedido nem guardado.
 * - `abrirComAncora`: na chegada com #alerta-praca, abre o pop-up do botão que estiver à vista (o do cartão do preço
 *   no computador, o do título no celular).
 *
 * O gatilho é o botão do Popover (aria-expanded e aria-haspopup="dialog"); o estado vai no nome acessível ("Favorito,
 * com aviso por e-mail") e no desenho (coração cheio, sino).
 */
export function FavoritoComAlerta({
  id,
  titulo,
  complemento,
  favorito,
  onFavoritar,
  icone,
  classeBotao,
  abrirComAncora = false,
  pracaUnica = false,
}: {
  id: string;
  titulo: string;
  /** local e lance, para o nome acessível distinguir um imóvel do outro na lista */
  complemento: string;
  favorito: boolean;
  onFavoritar: (id: string) => void;
  icone: boolean;
  /** as classes do botão (as mesmas do favorito sem alerta), pelo estado */
  classeBotao: (ligado: boolean) => string;
  abrirComAncora?: boolean;
  /** praça única (venda direta, venda online, licitação): o aviso fala do preço e da saída da venda, não da 2ª praça */
  pracaUnica?: boolean;
}) {
  const { temAlerta, definir } = useAlertasPraca();
  const texto = textoAlerta(pracaUnica);
  const alerta = favorito && temAlerta(id);
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const uid = useId();

  // o estado mais recente (a lista de favoritos do navegador chega depois da hidratação)
  const favoritoAgora = useRef(favorito);
  useEffect(() => {
    favoritoAgora.current = favorito;
  }, [favorito]);

  useEffect(() => {
    if (!abrirComAncora || window.location.hash !== `#${ANCORA_ALERTA}`) return;
    const botao = raiz.current?.querySelector("button");
    if (!botao || botao.getClientRects().length === 0) return; // a outra cópia (celular ou computador) está à vista
    // Depois da hidratação e da rolagem da chegada (VoltarApresentacao traz o coração para o alto da tela, com espaço
    // para o pop-up embaixo), para ele abrir ancorado no lugar certo. Chega como o link promete ("o favorito com
    // aviso"): o imóvel entra nos favoritos, como no toque do coração, e a chave do e-mail continua desligada (o aviso
    // é consentimento: só a pessoa liga).
    const t = window.setTimeout(() => {
      if (!favoritoAgora.current) onFavoritar(id);
      setAberto(true);
    }, 300);
    return () => window.clearTimeout(t);
  }, [abrirComAncora, id, onFavoritar]);

  const mudarAberto = (v: boolean) => {
    if (v && !favorito) onFavoritar(id);
    setAberto(v);
  };
  const ligarAlerta = (ligado: boolean) => {
    if (ligado && !favorito) onFavoritar(id);
    definir(id, ligado);
  };

  const estado = favorito ? (alerta ? "Favorito, com aviso por e-mail" : "Favorito") : "Favoritar";
  const nome = `${estado}: ${titulo}${complemento}`;

  return (
    <span ref={raiz} data-alerta-praca="" className="contents">
      <Popover
        rotulo={`${favorito ? "Favorito" : "Favoritar"}: ${titulo}`}
        posicao={icone ? "bottom-end" : "bottom"}
        largura="min(22rem, calc(100vw - 24px))"
        aberto={aberto}
        onAbertoChange={mudarAberto}
        gatilho={{
          ariaLabel: nome,
          title: icone ? estado : undefined,
          className: classeBotao(favorito),
          conteudo: icone ? (
            <>
              <IconeCoracao cheio={favorito} size={18} />
              {alerta && (
                <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 inline-flex size-4 items-center justify-center rounded-full bg-latao text-noite-fixa ring-2 ring-tinta">
                  <IconeSino size={9} />
                </span>
              )}
            </>
          ) : (
            <>
              <IconeCoracao cheio={favorito} size={15} className={favorito ? "text-latao" : ""} />
              {favorito ? "Favorito" : "Favoritar"}
              {alerta && (
                <span aria-hidden="true" className="text-latao-texto">
                  <IconeSino size={13} />
                </span>
              )}
            </>
          ),
        }}
      >
        {({ fechar }) => (
          <div className="p-4 text-left whitespace-normal sm:p-5">
            <p className="flex items-center gap-2 text-[14px] leading-snug font-semibold text-luar">
              <IconeCoracao cheio={favorito} size={16} className={favorito ? "text-latao" : "text-nevoa"} />
              {favorito ? "Nos seus favoritos" : "Fora dos favoritos"}
            </p>
            <label className="group/alerta mt-3.5 flex cursor-pointer items-start gap-3 rounded-2xl border border-nevoa/20 p-3.5 transition-colors duration-150 hover:border-latao/55 has-[:checked]:border-latao/60 has-[:checked]:bg-latao/[0.07]">
              <input
                type="checkbox"
                role="switch"
                checked={alerta}
                onChange={(e) => ligarAlerta(e.target.checked)}
                aria-labelledby={`${uid}-opcao`}
                aria-describedby={`${uid}-explica`}
                className="peer sr-only"
              />
              {/* a chave (desenho); o estado vem do checkbox com role="switch" */}
              <span
                aria-hidden="true"
                className="relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-nevoa/40 bg-nevoa/15 transition-colors duration-150 peer-checked:border-latao peer-checked:bg-latao peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-latao-texto motion-reduce:transition-none [&>span]:translate-x-[3px] peer-checked:[&>span]:translate-x-[19px] peer-checked:[&>span]:bg-noite-fixa"
              >
                <span className="size-4 rounded-full bg-luar shadow-sm transition-transform duration-150 ease-luneta motion-reduce:transition-none" />
              </span>
              <span className="min-w-0">
                <span id={`${uid}-opcao`} className="block text-[14px] leading-snug font-medium text-luar">
                  {texto.opcao}
                </span>
                <span id={`${uid}-explica`} className="mt-1 block text-[13px] leading-snug text-nevoa">
                  {texto.explicacao}
                  {ALERTA_PRACA.demonstracao && <span className="sr-only"> {ALERTA_PRACA.demonstracao}</span>}
                </span>
              </span>
            </label>
            {ALERTA_PRACA.demonstracao && (
              <p aria-hidden="true" className="mt-3 text-[12px] leading-snug text-nevoa">
                {ALERTA_PRACA.demonstracao}
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              {favorito ? (
                <button
                  type="button"
                  onClick={() => {
                    definir(id, false);
                    onFavoritar(id);
                    fechar();
                  }}
                  className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-nevoa underline-offset-4 hover:text-luar hover:underline pointer-fine:min-h-9"
                >
                  Tirar dos favoritos
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={fechar} className="btn-outline !min-h-11 !px-5 !text-[13px] pointer-fine:!min-h-9">
                Pronto
              </button>
            </div>
          </div>
        )}
      </Popover>
    </span>
  );
}
