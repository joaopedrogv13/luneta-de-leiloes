import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparDuplicatas,
  chaveDedup,
  chaveEndereco,
  chaveMatricula,
  mesmoImovel,
  motivoSemChave,
  municipioDaChave,
  normalizarCartorio,
  normalizarEndereco,
  normalizarMatricula,
  type DadosChave,
} from "./index.ts";
import { linhasCaixa, medirDedup, perfil, reescrever, reescreverSemMarcador, reescreverUnidadeComNumero } from "./medir.ts";

/** Linha do CSV da Caixa (sem dados pessoais: o CSV não traz nomes) como dados de chave. */
const caixa = (uf: string, cidade: string, bairro: string, endereco: string): DadosChave => ({ uf, cidade, bairro, endereco });

test("matrícula e cartório", () => {
  assert.equal(normalizarMatricula("147.300"), "147300");
  assert.equal(normalizarMatricula("Matrícula nº 009740"), "9740");
  assert.equal(normalizarMatricula("sem número"), null);
  // Várias matrículas: fica a primeira, nunca um número que junta duas.
  assert.equal(normalizarMatricula("9740 9741"), "9740");
  assert.equal(normalizarMatricula("9740 - 9741"), "9740");
  assert.equal(normalizarMatricula("9740, 9741"), "9740");
  assert.equal(normalizarMatricula("9.740 e 9.741"), "9740");
  assert.equal(normalizarMatricula("12.345"), "12345");
  assert.equal(normalizarMatricula("1.234.567"), "1234567");
  assert.equal(normalizarCartorio("6º Cartório de Registro de Imóveis de São Paulo"), "6");
  assert.equal(normalizarCartorio("Ofício: 01"), "1");
  assert.equal(normalizarCartorio("2º RI"), "2");
  // São Paulo: "Oficial de Registro de Imóveis" (o nome usado pelos leiloeiros e pelos editais)
  assert.equal(normalizarCartorio("6º Oficial de Registro de Imóveis de São Paulo"), "6");
  assert.equal(normalizarCartorio("Oficial de Registro de Imóveis da 2ª Circunscrição"), "2");
  assert.equal(normalizarCartorio("Oficial de Registro de Imóveis de Indaiatuba"), "u");
  assert.equal(normalizarCartorio("Cartório de Registro de Imóveis de Lagoa Santa"), "u");
  assert.equal(normalizarCartorio(null), "u");
});

test("chave de matrícula: município pelo código IBGE (grafias diferentes casam)", () => {
  const caixaSp = { uf: "SP", cidade: "SAO PAULO", matricula: "147300", cartorio: "Ofício: 06", endereco: "R FREI ANTONIO DE GUADALUPE 67 AP 21" };
  const lj = { uf: "SP", cidade: "São Paulo", matricula: "147.300", cartorio: "6º Cartório de Registro de Imóveis de São Paulo/SP", endereco: "Rua Frei Antônio de Guadalupe, nº 67, apto 21" };
  assert.equal(chaveMatricula(caixaSp), "mat:3550308:6:147300");
  assert.equal(chaveMatricula(lj), chaveMatricula(caixaSp));
  assert.equal(chaveDedup(lj), "mat:3550308:6:147300", "matrícula vence endereço");
  assert.equal(chaveEndereco(caixaSp), chaveEndereco(lj), "e o endereço também casa");
  assert.equal(
    chaveMatricula({ uf: "RS", cidade: "SANT' ANA DO LIVRAMENTO", matricula: "1234" }),
    chaveMatricula({ uf: "RS", cidade: "Santana do Livramento", matricula: "1.234" }),
  );
  // DF: os ofícios de registro valem para o DF inteiro; a região administrativa não entra.
  assert.equal(chaveMatricula({ uf: "DF", cidade: "CEILANDIA", matricula: "55", cartorio: "3º Ofício" }), "mat:5300108:3:55");
  assert.equal(chaveMatricula({ uf: "SP", cidade: "São Paulo", matricula: "sem número" }), null);
});

test("Caixa: endereço sem número e sem unidade não vira chave (imóveis diferentes no mesmo texto)", () => {
  // Chapadinha/MA, 4 terrenos com o mesmo texto ("N. 00"): N° 10274830 a 10274833.
  assert.equal(chaveEndereco(caixa("MA", "CHAPADINHA", "PARQUE MOISÉS AMORIM", "AVENIDA PRINCIPAL, N. 00")), null);
  // Capitão Poço/PA, 3 terrenos de 80 m² e 8.000 m² com "RODOVIA PA 124, N. S/N".
  assert.equal(chaveEndereco(caixa("PA", "CAPITAO POCO", "VILA KENNEDY", "RODOVIA PA 124, N. S/N")), null);
  assert.equal(motivoSemChave("RUA BOA VISTA, N. SN,"), "sem_numero_nem_unidade");
  // Votuporanga/SP: partes do mesmo lote (125 m² e 641 m²) com o mesmo endereço.
  assert.equal(motivoSemChave("AVENIDA CONDE FRANCISCO MATARAZZO, N. 00, QD 22, LT 02 PARTE"), "fracao");
  assert.equal(motivoSemChave("I, N. 230, BLOCO 8 QUADRA B"), "sem_logradouro");
  assert.equal(motivoSemChave(null), "sem_endereco");
});

test("Caixa: S/N com lote e quadra distingue; abreviações R./RUA e AV./AVENIDA casam", () => {
  const lote10 = chaveEndereco(caixa("AC", "CRUZEIRO DO SUL", "BAIRRO COHAB", "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10"));
  const lote11 = chaveEndereco(caixa("AC", "CRUZEIRO DO SUL", "BAIRRO COHAB", "RUA DO PURUS, N. S/N, QUARTEIRÃO 272 LOTE 11"));
  assert.equal(lote10, "end:1200203:rua purus:sn:lt 10 qd 272");
  assert.notEqual(lote10, lote11);
  assert.equal(chaveEndereco({ uf: "AC", cidade: "Cruzeiro do Sul", bairro: "Cohab", endereco: "R. do Purus, s/nº, Qd. 272, Lt. 10" }), lote10);
  assert.equal(
    chaveEndereco(caixa("PA", "SAO LUIZ DO TAPAJOS", "JARDIM AMERICA II", "AV DOS BURITIS, N. SN, LT 08 QD 16")),
    chaveEndereco({ uf: "PA", cidade: "São Luiz do Tapajós", bairro: "Jd. América 2", endereco: "Avenida dos Buritis, s/n, Quadra 16, Lote 8" }),
  );
  assert.match(chaveEndereco(caixa("PA", "SAO LUIZ DO TAPAJOS", "", "AV DOS BURITIS, N. SN, LT 08 QD 16")) ?? "", /^end:pa-sao-luiz-do-tapajos:/, "cidade fora da tabela: uf-slug");
  assert.equal(normalizarEndereco("RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10"), "rua purus sn lt 10 qd 272");
});

test("Caixa: mesmo imóvel em modalidades diferentes cai na mesma chave", () => {
  // Santa Rita/PB: Venda Direta Online (8444411749928) e Leilão SFI (8444411636236), casa de 49,16 m².
  const a = chaveEndereco(caixa("PB", "SANTA RITA", "PRIVE AEROPORTO", "RUA ESTUDANTE FELYPE DE MELO FREIRE, N. 62, LT 36 QD 11"));
  assert.ok(a);
  assert.equal(chaveEndereco(caixa("PB", "SANTA RITA", "PRIVE AEROPORTO", "RUA ESTUDANTE FELYPE DE MELO FREIRE, N. 62, LT 36 QD 11")), a);
  // Itaboraí/RJ: Venda Online e Leilão SFI do mesmo apartamento (40,82 m²) com bairros diferentes.
  assert.equal(
    chaveEndereco(caixa("RJ", "ITABORAI", "BELA VISTA", "RUA DONA BELA, N. SN, Apto 105, BLOCO 03")),
    chaveEndereco(caixa("RJ", "ITABORAI", "TRES PONTES", "RUA DONA BELA, N. SN, Apto 105, BL 03")),
  );
  // Nova Iguaçu/RJ: "CS 02 LOTE 26 QUADRA O" e "CASA 2 LT 26 QD O", bairros diferentes, mesma casa.
  assert.equal(
    chaveEndereco(caixa("RJ", "NOVA IGUACU", "LAGOINHA", "RUA OITO, N. 454, CS 02 LOTE 26 QUADRA O")),
    chaveEndereco(caixa("RJ", "NOVA IGUACU", "JARDIM SANTA MARIA", "RUA OITO, N. 454, CASA 2 LT 26 QD O")),
  );
});

test("Caixa: unidades diferentes no mesmo número não se juntam", () => {
  const par = (a: string, b: string, uf = "RJ", cidade = "RIO DE JANEIRO", bairro = "X"): void =>
    assert.notEqual(chaveEndereco(caixa(uf, cidade, bairro, a)), chaveEndereco(caixa(uf, cidade, bairro, b)), `${a} × ${b}`);
  par("RUA SANTA LUZIA, N. 221, Apto 301, BL 17", "RUA SANTA LUZIA, N. 221, Apto 302, BL 17", "PE", "JABOATAO DOS GUARARAPES");
  par("RUA POCRANE, N. 725, 02", "RUA POCRANE, N. 725, 56", "MS", "CAMPO GRANDE");
  par("RUA SDO 01, N. 124,", "RUA SDO 01, N. 305, B", "CE", "HORIZONTE");
  par("ESTRADA DE SANTA RITA, N. SN, QD V, UNID 61, RUA A", "ESTRADA DE SANTA RITA, N. SN, QD V, UNID 42, RUA A", "RJ", "TERESOPOLIS");
  par("RUA OTINGA, N. 55, CASA II", "RUA OTINGA, N. 55, CASA IV");
  par("RUA 8 DE FEVEREIRO, N. SN, QD 39", "RUA 8 DE FEVEREIRO, N. SN, QD 39 AREA 02", "SE", "NOSSA SENHORA DO SOCORRO");
  // DF: o mesmo "QR 01 CJ A LT 7 CASA 7" existe em várias regiões administrativas.
  assert.notEqual(
    chaveEndereco(caixa("DF", "CANDANGOLANDIA", "CANDANGOLANDIA", "QR-01, LT 07, CASA 07, CJ A")),
    chaveEndereco(caixa("DF", "SAMAMBAIA", "SAMAMBAIA SUL", "QR-01, LT 07, CASA 07, CJ A")),
  );
  assert.equal(municipioDaChave({ uf: "DF", cidade: "CEILANDIA" }, undefined, { regiaoDf: true }), "df-ceilandia");
});

test("leiloeiro (texto com bairro e cidade, sem \"nº\") e Caixa chegam à mesma chave", () => {
  const caixaSp = caixa("SP", "SAO PAULO", "VILA PRUDENTE", "RUA FREI ANTONIO DE GUADALUPE, N. 67, Apto 21");
  const lj = { uf: "SP", cidade: "São Paulo", bairro: null, endereco: "Rua Frei Antônio de Guadalupe, nº 67, apto 21, Vila Prudente, São Paulo/SP" };
  assert.equal(chaveEndereco(lj), chaveEndereco(caixaSp));
  assert.equal(
    chaveEndereco({ uf: "SP", cidade: "Presidente Prudente", endereco: "Rua Antônio Furtado de Miranda, 493, Vila Industrial, Presidente Prudente/SP" }),
    chaveEndereco(caixa("SP", "PRESIDENTE PRUDENTE", "VILA INDUSTRIAL", "RUA ANTONIO FURTADO DE MIRANDA, N. 493,")),
  );
  // Apartamentos diferentes do mesmo prédio não se juntam (achado da revisão: "apartamento nº").
  assert.notEqual(
    chaveEndereco({ uf: "SP", cidade: "São Paulo", endereco: "Rua Doutor Melo Alves, nº 640, apartamento nº 91, Cerqueira César, São Paulo/SP" }),
    chaveEndereco({ uf: "SP", cidade: "São Paulo", endereco: "Rua Doutor Melo Alves, nº 640, apartamento nº 12, Cerqueira César, São Paulo/SP" }),
  );
  // Rua genérica: o bairro do texto entra na chave quando a fonte não o informa à parte.
  const ii = chaveEndereco({ uf: "GO", cidade: "Cocalzinho de Goiás", endereco: "Rua 18, s/n, Qd 17, Lt 12, Itamar Nobrega II, Cocalzinho de Goiás/GO" });
  const iii = chaveEndereco({ uf: "GO", cidade: "Cocalzinho de Goiás", endereco: "Rua 18, s/n, Qd 17, Lt 12, Itamar Nobrega III, Cocalzinho de Goiás/GO" });
  assert.notEqual(ii, iii);
  assert.equal(ii, chaveEndereco(caixa("GO", "COCALZINHO DE GOIAS", "ITAMAR NOBREGA II", "RUA 18, N. SN, QD 17, LT 12")));
});

test("ruas D e E, \"RUA N-1\" e rua sem nome não juntam imóveis diferentes", () => {
  const par = (a: string, b: string): void =>
    assert.notEqual(chaveEndereco(caixa("BA", "ITABUNA", "CENTRO", a)), chaveEndereco(caixa("BA", "ITABUNA", "CENTRO", b)), `${a} × ${b}`);
  par("RUA E, N. 10", "RUA D, N. 10");
  par("RUA E, N. 10, LT 5", "RUA D, N. 10, LT 5");
  par("RUA PROJETADA D, N. 20", "RUA PROJETADA E, N. 20");
  par("RUA N-1, N. 50", "RUA N-1, N. 51");
  par("RUA Nº 06, N. 100", "RUA Nº 06, N. 200");
  // Rua sem nome só vira chave com o bairro, que então entra sempre.
  assert.equal(chaveEndereco(caixa("GO", "SAO LUIS DE MONTES BELOS", "", "RUA, N. SN, CS 03 LT 20A QD 20")), null);
  assert.equal(motivoSemChave("RUA, N. SN, CS 03 LT 20A QD 20"), "sem_logradouro");
  assert.match(chaveEndereco(caixa("GO", "SAO LUIS DE MONTES BELOS", "VILA NOVA", "RUA, N. SN, CS 03 LT 20A QD 20")) ?? "", /:rua:sn:casa 3 lt 20a qd 20:b=vila nova$/);
  assert.notEqual(
    chaveEndereco(caixa("GO", "SAO LUIS DE MONTES BELOS", "VILA NOVA", "RUA, N. 10, AP 1, BL 2, LT 3")),
    chaveEndereco(caixa("GO", "SAO LUIS DE MONTES BELOS", "CENTRO", "RUA, N. 10, AP 1, BL 2, LT 3")),
  );
});

test("mesmo imóvel: matrícula numa fonte e só endereço na outra se juntam pelo endereço", () => {
  const comMatricula = { chave_dedup: "mat:3550308:6:147300", chave_endereco: "end:3550308:rua frei antonio guadalupe:67:ap 21" };
  const semMatricula = { chave_dedup: "end:3550308:rua frei antonio guadalupe:67:ap 21", chave_endereco: "end:3550308:rua frei antonio guadalupe:67:ap 21" };
  const outraMatricula = { chave_dedup: "mat:3550308:6:999", chave_endereco: "end:3550308:rua frei antonio guadalupe:67:ap 21" };
  assert.equal(mesmoImovel(comMatricula, semMatricula), true);
  assert.equal(mesmoImovel(comMatricula, outraMatricula), false, "matrículas diferentes nunca se juntam");
  assert.equal(mesmoImovel(comMatricula, { ...comMatricula, chave_endereco: null }), true);
  const r = agruparDuplicatas([
    { id: 1, fonte: "caixa", ...semMatricula },
    { id: 2, fonte: "leiloesjudiciais", ...comMatricula },
    { id: 3, fonte: "caixa", chave_dedup: "end:3550308:rua x:10:ap 91", chave_endereco: "end:3550308:rua x:10:ap 91" },
    { id: 4, fonte: "caixa", chave_dedup: "end:3550308:rua x:10:ap 12", chave_endereco: "end:3550308:rua x:10:ap 12" },
  ]);
  assert.deepEqual([r.grupos, r.imoveis, r.gruposEntreFontes, r.enderecosComMatriculasDiferentes], [1, 2, 1, 0]);
  assert.deepEqual(r.lista, [[1, 2]]);
  const conflito = agruparDuplicatas([
    { id: 1, fonte: "caixa", ...semMatricula },
    { id: 2, fonte: "leiloesjudiciais", ...comMatricula },
    { id: 3, fonte: "leiloesjudiciais", ...outraMatricula },
  ]);
  assert.deepEqual([conflito.grupos, conflito.enderecosComMatriculasDiferentes], [0, 1], "o endereço com duas matrículas não junta ninguém");
});

test("rua genérica com endereço pouco específico leva o bairro", () => {
  // Cocalzinho de Goiás/GO: "RUA 18, N. SN, QD 17, LT 12" em ITAMAR NOBREGA II e III (loteamentos vizinhos).
  const ii = chaveEndereco(caixa("GO", "COCALZINHO DE GOIAS", "ITAMAR NOBREGA II", "RUA 18, N. SN, QD 17, LT 12"));
  const iii = chaveEndereco(caixa("GO", "COCALZINHO DE GOIAS", "ITAMAR NOBREGA III", "RUA 18, N. 0, LOTE 12 - QUADRA 17"));
  assert.match(ii ?? "", /:b=itamar nobrega 2$/);
  assert.notEqual(ii, iii);
  // Santo Antônio do Descoberto/GO: "QUADRA 28 ... LT 05A" em dois bairros, casas de 65,57 e 67,6 m².
  assert.notEqual(
    chaveEndereco(caixa("GO", "SANTO ANTONIO DO DESCOBERTO", "PARQUE ESTRELA DALVA XII", "QUADRA 28, N. SN, LT 05A RUA NAPOLES")),
    chaveEndereco(caixa("GO", "SANTO ANTONIO DO DESCOBERTO", "JARDIM ANA BEATRIZ I", "QUADRA 28 LOTE 5A RUA 18, N. SN,")),
  );
  // Com o bairro abreviado de outro jeito, a mesma chave.
  assert.equal(
    chaveEndereco(caixa("GO", "COCALZINHO DE GOIAS", "JD. ITAMAR NOBREGA II", "RUA 18, N. SN, QD 17, LT 12")),
    chaveEndereco(caixa("GO", "COCALZINHO DE GOIAS", "JARDIM ITAMAR NOBREGA 2", "Rua 18, s/n, Lote 12, Quadra 17")),
  );
  // Modo "nunca" (só para medir) junta os dois.
  assert.equal(
    chaveEndereco(caixa("GO", "COCALZINHO DE GOIAS", "ITAMAR NOBREGA II", "RUA 18, N. SN, QD 17, LT 12"), undefined, "nunca"),
    chaveEndereco(caixa("GO", "COCALZINHO DE GOIAS", "ITAMAR NOBREGA III", "RUA 18, N. 0, LOTE 12 - QUADRA 17"), undefined, "nunca"),
  );
});

const CSV_CAIXA = [
  " Lista de Imóveis da Caixa;;Data de geração:;08/10/2026;;;;;;;",
  " N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;Financiamento;Descrição;Modalidade de venda;Link de acesso",
  "",
  " 8444411749928 ;PB ;SANTA RITA ;PRIVE AEROPORTO ;RUA ESTUDANTE FELYPE DE MELO FREIRE, N. 62, LT 36 QD 11 ;114.588,55;196.000,00;41.54;Sim;Casa, 82.95 de área total, 49.16 de área privativa, 89.14 de área do terreno,  2 qto(s), a.serv, WC, 1 sala(s), cozinha.;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444411749928",
  " 8444411636236 ;PB ;SANTA RITA ;PRIVE AEROPORTO ;RUA ESTUDANTE FELYPE DE MELO FREIRE, N. 62, LT 36 QD 11 ;90.000,00;196.000,00;54.08;Não;Casa, 0.00 de área total, 49.16 de área privativa, 360.00 de área do terreno,  2 qto(s), a.serv, WC, 1 sala(s), cozinha.;Leilão SFI - Edital Único;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8444411636236",
  " 8787712910127 ;GO ;LUZIANIA ;FAZENDA SAIA VELHA ;RUA ARAGUAIA, N. SN, Apto 201, BL 26, GLEBA GA2 ;133.000,00;140.000,00;5.00;Não;Apartamento, 0.00 de área total, 57.96 de área privativa, 0.00 de área do terreno,  2 qto(s).;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8787712910127",
  " 8787707308821 ;GO ;LUZIANIA ;FAZENDA SAIA VELHA ;RUA ARAGUAIA, N. SN, Apto 201, BL 26, GLEBA GA2 ;130.000,00;137.000,00;5.11;Não;Apartamento, 0.00 de área total, 56.62 de área privativa, 0.00 de área do terreno,  2 qto(s).;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=8787707308821",
  " 10274830 ;MA ;CHAPADINHA ;PARQUE MOISÉS AMORIM ;AVENIDA PRINCIPAL, N. 00 ;115.000,00;115.000,00;0.00;Não;Terreno, 0.00 de área total, 0.00 de área privativa, 500.00 de área do terreno.;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10274830",
  " 10274831 ;MA ;CHAPADINHA ;PARQUE MOISÉS AMORIM ;AVENIDA PRINCIPAL, N. 00 ;115.000,00;115.000,00;0.00;Não;Terreno, 0.00 de área total, 0.00 de área privativa, 500.00 de área do terreno.;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10274831",
  " 10005120 ;AC ;CRUZEIRO DO SUL ;BAIRRO COHAB ;RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10 ;50.074,26;150.000,00;66.62;Não;Terreno, 0.00 de área total, 0.00 de área privativa, 600.00 de área do terreno.;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10005120",
  " 10005121 ;AC ;CRUZEIRO DO SUL ;BAIRRO COHAB ;RUA DO PURUS, N. S/N, QUARTEIRÃO 272 LOTE 11 ;50.074,26;150.000,00;66.62;Não;Terreno, 0.00 de área total, 0.00 de área privativa, 600.00 de área do terreno.;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10005121",
].join("\n");

test("medição: cobertura, grupos e reescritas em outros formatos", () => {
  const linhas = linhasCaixa(CSV_CAIXA);
  assert.equal(linhas.length, 8);
  assert.deepEqual(perfil(linhas[0]?.descricao ?? ""), { tipo: "casa", area: 49.16 });
  assert.equal(reescrever("RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10"), "R. Do Purus, S/Nº, Lote 10, Quadra 272", "ordem invertida");
  assert.equal(reescrever("AVENIDA DAS FLORES, N. 10, Apto 1007, BL C"), "Av. Das Flores, Nº 10, Apartamento 1007, Bloco C");
  assert.equal(reescrever("RUA R MINIAPOLIS, N. 182, Apto 6, UN.06"), "R. R Miniapolis, Nº 182, Apartamento 6, Un.06", "só o \"N.\" do número");
  assert.equal(reescreverUnidadeComNumero("RUA X, N. 10, Apto 91, CS 2, LT 5 QD 3, VG 10"), "RUA X, N. 10, apartamento nº 91, casa nº 2, lote nº 5 quadra nº 3, vaga nº 10");
  const linha = { endereco: "RUA X, N. 62, Apto 1, BL 2", bairro: "JARDIM Y", cidade: "SAO PAULO", uf: "SP" };
  assert.equal(reescreverSemMarcador(linha), "Rua X, 62, Apto 1, Bl 2, Jardim Y, Sao Paulo/Sp");
  assert.equal(reescreverSemMarcador(linha, true), "Rua X, 62 - Apto 1 - Bl 2 - Jardim Y - Sao Paulo/Sp");
  const m = medirDedup(linhas);
  assert.equal(m.comChave, 6);
  assert.deepEqual(m.semChave, { sem_numero_nem_unidade: 2 });
  assert.equal(m.grupos, 2, "Santa Rita (mesmo imóvel) e Luziânia (texto idêntico)");
  assert.equal(m.gruposConsistentes, 1, "Luziânia: áreas 57,96 e 56,62 — o texto não separa");
  assert.equal(m.gruposComModalidadesDiferentes, 1);
  assert.equal(m.reescritas.length, 5);
  for (const r of m.reescritas) {
    assert.equal(r.mesmaChave, 6, r.estilo);
    assert.equal(r.outroImovel, 0, r.estilo);
    assert.equal(r.gruposInconsistentes, 1, `${r.estilo}: só o par de Luziânia`);
  }
});
