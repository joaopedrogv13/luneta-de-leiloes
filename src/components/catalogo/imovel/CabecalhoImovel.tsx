import { dataHora, local, MODALIDADE_ROTULO, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import type { ImovelDetalhe } from "@/lib/catalogo/tipos";
import { ehExemplo, localRepetido } from "./formato";
import { IconeInfo, IconePino } from "./icones";
import { AcoesTitulo } from "./ResumoLateral";

const SELO = "inline-flex min-h-7 items-center rounded-full border px-3 text-[12px] leading-none font-semibold whitespace-nowrap";

/**
 * Cabeçalho do imóvel: tipo, título (o único h1), endereço completo quando a fonte publica, bairro · cidade/UF
 * e os selos de fonte, modalidade e natureza. Praça vencida ganha um aviso logo abaixo.
 *
 * Celular e tablet (até lg): o local numa linha e "Ver endereço" abre o endereço completo (inteiro, ele ocupava 3
 * linhas antes do preço); no celular, Favoritar e Compartilhar viram ícones ao lado do título, e o cabeçalho é a
 * parte de cima do "cartão de decisão" (o resumo do preço continua o mesmo cartão, logo abaixo).
 */
export function CabecalhoImovel({ imovel: i, pracaPassou }: { imovel: ImovelDetalhe; pracaPassou: boolean }) {
  const exemplo = ehExemplo(i);
  const lugar = local(i);
  return (
    <div>
      <p className="text-[12px] leading-none font-semibold tracking-[0.16em] text-latao-texto uppercase">
        {i.tipo === "outro" ? "Imóvel" : TIPO_ROTULO[i.tipo]}
      </p>
      <div className="mt-3 flex items-start gap-3 max-md:mt-2">
        <h1 id="imovel-titulo" className="min-w-0 flex-1 font-display text-[26px] leading-[1.12] font-bold tracking-[-0.025em] text-luar sm:text-[34px] md:max-lg:text-[30px] lg:text-[38px]">
          {i.titulo}
        </h1>
        <AcoesTitulo
          imovel={{ id: i.id, titulo: i.titulo, bairro: i.bairro, cidade: i.cidade, uf: i.uf, lance: i.lance, praca: i.praca }}
          className="-mt-1 -mr-1.5 md:hidden"
        />
      </div>

      {/* computador: o endereço inteiro e o local */}
      <div className="mt-3 flex items-start gap-2 text-[15px] leading-snug text-nevoa max-lg:hidden">
        <IconePino tamanho={18} className="mt-px text-nevoa" />
        <p className="min-w-0">
          {i.endereco && <span className="block text-luar/90">{i.endereco}</span>}
          {!localRepetido(i) && <span className="block">{lugar}</span>}
        </p>
      </div>
      {/* celular e tablet: o local numa linha; o endereço inteiro em "Ver endereço" */}
      <div className="mt-2.5 text-[15px] leading-snug text-nevoa lg:hidden">
        <p className="flex min-w-0 items-start gap-2">
          <IconePino tamanho={18} className="mt-px shrink-0 text-nevoa" />
          <span className="min-w-0">{lugar}</span>
        </p>
        {i.endereco && (
          <details className="group/end mt-0.5 pl-[26px]">
            <summary className="-ml-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full px-1 text-[14px] font-medium text-latao-texto marker:hidden hover:text-luar [&::-webkit-details-marker]:hidden">
              <span className="group-open/end:hidden">Ver endereço</span>
              <span className="hidden group-open/end:inline">Esconder o endereço</span>
              <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" className="transition-transform duration-150 group-open/end:rotate-180 motion-reduce:transition-none">
                <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="pb-1 text-luar/90">{i.endereco}</p>
          </details>
        )}
      </div>

      <ul aria-label="Fonte e tipo de venda" className="mt-4 flex flex-wrap gap-2 max-lg:mt-3">
        <li className={`${SELO} ${exemplo ? "border-latao/70 bg-latao/12 text-latao-texto" : "border-nevoa/30 text-luar"}`}>
          {exemplo ? "Exemplo fictício" : <><span className="sr-only">Fonte: </span>{i.fonte.nome}</>}
        </li>
        <li className={`${SELO} border-nevoa/30 text-luar`}>{MODALIDADE_ROTULO[i.modalidade]}</li>
        {i.judicial !== null && <li className={`${SELO} border-nevoa/30 text-luar`}>{i.judicial ? "Judicial" : "Extrajudicial"}</li>}
      </ul>
      {pracaPassou && (
        <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-aten/45 bg-aten/10 px-4 py-3 text-sm leading-snug text-luar">
          <IconeInfo tamanho={18} className="mt-px text-aten" />
          <span>
            A data desta praça já passou ({dataHora(i.dataPraca)}). O imóvel pode ter sido vendido ou ter nova data: confira no site da fonte.
          </span>
        </p>
      )}
    </div>
  );
}
