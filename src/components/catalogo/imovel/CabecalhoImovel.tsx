import { dataHora, local, MODALIDADE_ROTULO, TIPO_ROTULO } from "@/lib/catalogo/rotulos";
import type { ImovelDetalhe } from "@/lib/catalogo/tipos";
import { ehExemplo, localRepetido } from "./formato";
import { IconeInfo, IconePino } from "./icones";

const SELO = "inline-flex min-h-7 items-center rounded-full border px-3 text-[12px] leading-none font-semibold whitespace-nowrap";

/**
 * Cabeçalho do imóvel: tipo, título (o único h1), endereço completo quando a fonte publica, bairro · cidade/UF
 * e os selos de fonte, modalidade e natureza. Praça vencida ganha um aviso logo abaixo.
 */
export function CabecalhoImovel({ imovel: i, pracaPassou }: { imovel: ImovelDetalhe; pracaPassou: boolean }) {
  const exemplo = ehExemplo(i);
  return (
    <div>
      <p className="text-[12px] leading-none font-semibold tracking-[0.16em] text-latao-texto uppercase">
        {i.tipo === "outro" ? "Imóvel" : TIPO_ROTULO[i.tipo]}
      </p>
      <h1 id="imovel-titulo" className="mt-3 font-display text-[26px] leading-[1.12] font-bold tracking-[-0.025em] text-luar sm:text-[34px] lg:text-[38px]">
        {i.titulo}
      </h1>
      <div className="mt-3 flex items-start gap-2 text-[15px] leading-snug text-nevoa">
        <IconePino tamanho={18} className="mt-px text-nevoa" />
        <p className="min-w-0">
          {i.endereco && <span className="block text-luar/90">{i.endereco}</span>}
          {!localRepetido(i) && <span className="block">{local(i)}</span>}
        </p>
      </div>
      <ul aria-label="Fonte e tipo de venda" className="mt-4 flex flex-wrap gap-2">
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
