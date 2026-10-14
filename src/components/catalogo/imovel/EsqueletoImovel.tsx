import { TopoSimples } from "./NaoEncontrado";

const BLOCO = "rounded-full bg-nevoa/14";

/**
 * Carregando a página do imóvel (navegação a partir da lista): a mesma silhueta da página (galeria, título,
 * resumo à direita, seções), pulsando de leve e parada com "reduzir movimento". Nunca tela em branco.
 */
export function EsqueletoImovel() {
  return (
    <div className="min-h-svh">
      <TopoSimples />
      <div role="status" className="mx-auto max-w-[1280px] px-4 pb-16 sm:px-6 lg:px-8">
        <span className="sr-only">Carregando o imóvel…</span>
        <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
          <div className="py-4">
            <div className={`h-8 w-36 ${BLOCO}`} />
          </div>
          <div className="-mx-4 aspect-[4/3] bg-nevoa/10 sm:mx-0 sm:aspect-[16/10] sm:rounded-3xl lg:aspect-auto lg:h-[clamp(320px,58vh,560px)]" />
          <div className="mt-6 grid gap-x-10 gap-y-6 lg:mt-9 lg:grid-cols-[minmax(0,1fr)_368px] xl:grid-cols-[minmax(0,1fr)_392px] xl:gap-x-14">
            <div>
              <div className={`h-3 w-28 ${BLOCO}`} />
              <div className={`mt-4 h-9 w-[85%] ${BLOCO}`} />
              <div className={`mt-3 h-9 w-1/2 ${BLOCO}`} />
              <div className={`mt-5 h-4 w-64 max-w-full ${BLOCO}`} />
              <div className="mt-5 flex gap-2">
                <div className={`h-7 w-20 ${BLOCO}`} />
                <div className={`h-7 w-24 ${BLOCO}`} />
                <div className={`h-7 w-28 ${BLOCO}`} />
              </div>
              <div className="mt-10 flex gap-2">
                {[0, 1, 2, 3, 4].map((k) => (
                  <div key={k} className={`h-9 w-24 ${BLOCO}`} />
                ))}
              </div>
              <div className="mt-8 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <div key={k} className="h-[74px] rounded-2xl bg-nevoa/10" />
                ))}
              </div>
            </div>
            <div className="h-[460px] rounded-3xl border border-nevoa/12 bg-tinta p-6">
              <div className={`h-3 w-24 ${BLOCO}`} />
              <div className={`mt-3 h-10 w-52 ${BLOCO}`} />
              <div className={`mt-4 h-4 w-44 ${BLOCO}`} />
              <div className={`mt-10 h-12 w-full ${BLOCO}`} />
              <div className={`mt-3 h-12 w-full ${BLOCO}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
