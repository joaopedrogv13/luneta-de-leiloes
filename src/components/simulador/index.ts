export { Simulador, AVISO_SIMULADOR, type SimuladorProps } from "./Simulador";
export type { EntradaSimulador } from "@/lib/simulador/tipos";
// para o relatório em PDF: a mesma conta e o mesmo estado guardado da tela
export { simulacaoCompleta, type ResultadoCompleto } from "@/lib/simulador/completa";
export { chaveEstado, interpretarEstado, type EstadoSimulador } from "@/lib/simulador/estado";
export { useEstadoSimulador } from "./estado";
