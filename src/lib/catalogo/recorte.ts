/**
 * Recorte das fotos ilustrativas (exemplos fictícios): um zoom a partir de um canto, igual em todo lugar que mostra a
 * foto (cartões, galeria, landing, relatório). Sem imports com "@/".
 */
import type { RecorteFoto } from "./tipos";

/** Estilo do <img> recortado (o pai precisa de overflow: hidden). Sem recorte, nada. */
export function estiloRecorte(r: RecorteFoto | null | undefined): { transform: string; transformOrigin: string } | undefined {
  if (!r || !(r.escala > 1)) return undefined;
  return { transform: `scale(${r.escala})`, transformOrigin: r.origem };
}
