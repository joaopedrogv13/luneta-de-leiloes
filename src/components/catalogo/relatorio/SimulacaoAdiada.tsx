"use client";

import dynamic from "next/dynamic";

/**
 * As ilhas da simulação do relatório (Simulacao.tsx, com a conta de src/lib/simulador) num pedaço de JavaScript à
 * parte (next/dynamic, com a primeira pintura no servidor). O Turbopack junta os componentes do navegador de uma rota
 * num grupo só: sem isto, a página travada do Lente (/relatorio?plano=lente) baixava a conta do simulador sem usar.
 * Assim ela só é baixada quando o relatório de verdade é desenhado (plano Luneta).
 */
const carregar = () => import("./Simulacao");

export const ProvedorRelatorio = dynamic(() => carregar().then((m) => m.ProvedorRelatorio));
export const CarimboData = dynamic(() => carregar().then((m) => m.CarimboData));
export const ResultadoSimulacao = dynamic(() => carregar().then((m) => m.ResultadoSimulacao));
export const MatrizRelatorio = dynamic(() => carregar().then((m) => m.MatrizRelatorio));
export const CustosRelatorio = dynamic(() => carregar().then((m) => m.CustosRelatorio));
export const PremissasRelatorio = dynamic(() => carregar().then((m) => m.PremissasRelatorio));
