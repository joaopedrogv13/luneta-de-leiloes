import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarEndereco, especificidade, normalizarBairro, type EnderecoPartes } from "./endereco.ts";

function partes(endereco: string): Omit<EnderecoPartes, "generico" | "fracao"> & { generico?: boolean; fracao?: boolean } {
  const { tipo, nome, numero, unidades } = analisarEndereco(endereco);
  return { tipo, nome, numero, unidades };
}

test("formato da Caixa: logradouro, \"N.\", unidades em qualquer ordem", () => {
  assert.deepEqual(partes("RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10"), { tipo: "rua", nome: "purus", numero: "sn", unidades: ["lt 10", "qd 272"] });
  assert.deepEqual(partes("AVENIDA DAS FLORES, N. SN, Apto 1007,  BL C"), { tipo: "avenida", nome: "flores", numero: "sn", unidades: ["ap 1007", "bl c"] });
  assert.deepEqual(partes("RUA SERGIPE, N. 791, SETOR 03 B QD 295 LT 16"), { tipo: "rua", nome: "sergipe", numero: "791", unidades: ["lt 16", "qd 295", "setor 3b"] });
  assert.deepEqual(partes("AVENIDA 17 DE NOVEMBRO, N. SN, QD 27 LT 18"), { tipo: "avenida", nome: "17 novembro", numero: "sn", unidades: ["lt 18", "qd 27"] });
  assert.deepEqual(partes("AVENIDA PIO XII, N. 889, C10"), { tipo: "avenida", nome: "pio 12", numero: "889", unidades: ["u c10"] }, "romano vira arábico no nome");
  assert.deepEqual(partes("RUA SDO 01, N. 124,"), { tipo: "rua", nome: "sdo 1", numero: "124", unidades: [] }, "número com marcador vence o número no fim do nome");
  assert.deepEqual(partes("RUA POCRANE, N. 725, 02"), { tipo: "rua", nome: "pocrane", numero: "725", unidades: ["u 2"] }, "valor solto identifica a unidade");
  assert.deepEqual(partes("RUA DE SANTA RITA, N. 221-B,"), { tipo: "rua", nome: "santa rita", numero: "221b", unidades: [] });
  assert.deepEqual(partes("RUA OTINGA, N. 55, CASA II"), { tipo: "rua", nome: "otinga", numero: "55", unidades: ["casa 2"] });
  assert.deepEqual(partes("RUA PERU, N. 24, QDF LT24"), { tipo: "rua", nome: "peru", numero: "24", unidades: ["lt 24", "qd f"] }, "rótulo colado no valor");
  assert.deepEqual(partes("RUA ALIPIO CAETANO DE AMORIM, N. SN, LT 21QD 12"), { tipo: "rua", nome: "alipio caetano amorim", numero: "sn", unidades: ["lt 21", "qd 12"] });
});

test("vários lotes, rodovia, quadra como endereço e rua no fim", () => {
  assert.deepEqual(partes("RUA PORTO CALVA, N. SN, LTS 4 5 13 E 14 QD F").unidades, ["lt 13", "lt 14", "lt 4", "lt 5", "qd f"]);
  assert.deepEqual(partes("RUA B, N. 0, LTS 02 A 17, QD B,LOT PORTAL PARAIPABA").unidades, ["lt 17", "lt 2", "qd b"]);
  assert.deepEqual(partes("RUA ACHILES DE PINA FILHO, N. 386, LT 12 A QD 18").unidades, ["lt 12a", "qd 18"], "\"12 A\" seguido de rótulo é o lote 12-A");
  assert.deepEqual(partes("RODOVIA BR-316 KM 42, N. S/N, LOTE 10 - RAMAL JOÃO NOVO"), { tipo: "rodovia", nome: "br 316", numero: "sn", unidades: ["km 42", "lt 10"] });
  assert.deepEqual(partes("RODOVIA PE-060, N. 100"), { tipo: "rodovia", nome: "pe 60", numero: "100", unidades: [] }, "PE de rodovia não vira \"padre\"");
  assert.deepEqual(partes("QUADRA 10, N. SN, Apto 201, LT 25, CJ A, ST 05, RUA 1"), { tipo: "", nome: "qd 10", numero: "sn", unidades: ["ap 201", "conjunto a", "lt 25", "setor 5"] });
  assert.deepEqual(partes("QUADRA QUADRA 49, N. SN, Apto 102, BL.A"), { tipo: "", nome: "qd 49", numero: "sn", unidades: ["ap 102", "bl a"] });
  assert.deepEqual(partes("LOTE 02, N. SN, QD 16"), { tipo: "", nome: "qd 16", numero: "sn", unidades: ["lt 2"] }, "sem rua, a quadra é o endereço");
  assert.deepEqual(partes("LT 02 QD 01, N. 53D, RUA CROACIA"), { tipo: "rua", nome: "croacia", numero: "53d", unidades: ["lt 2", "qd 1"] });
  assert.deepEqual(partes("QR-01, LT 07, CASA 07, CJ A"), { tipo: "", nome: "qr 1", numero: null, unidades: ["casa 7", "conjunto a", "lt 7"] }, "designação do DF");
});

test("formato de leiloeiro e sem vírgula", () => {
  assert.deepEqual(partes("Rua Frei Antônio de Guadalupe, nº 67, apto 21"), { tipo: "rua", nome: "frei antonio guadalupe", numero: "67", unidades: ["ap 21"] });
  assert.deepEqual(partes("R. FREI ANTONIO DE GUADALUPE 67 AP 21"), partes("Rua Frei Antônio de Guadalupe, nº 67, apto 21"));
  assert.deepEqual(partes("AV. PAULISTA, Nº 1.000, APTO 52, BLOCO B - CEP: 01310-100"), { tipo: "avenida", nome: "paulista", numero: "1000", unidades: ["ap 52", "bl b"] });
  assert.deepEqual(partes("Av Paulista 1000 ap 52 bl B"), partes("AV. PAULISTA, Nº 1.000, APTO 52, BLOCO B - CEP: 01310-100"));
  assert.deepEqual(partes("Rua 25 de Março 1000"), { tipo: "rua", nome: "25 marco", numero: "1000", unidades: [] });
  assert.deepEqual(partes("Rua Casa Branca, 100"), { tipo: "rua", nome: "casa branca", numero: "100", unidades: [] }, "\"casa\" sem valor é nome");
  assert.deepEqual(partes("Rua Dr. Pedro de Toledo, s/nº, Quadra 5, Lote 10"), { tipo: "rua", nome: "doutor pedro toledo", numero: "sn", unidades: ["lt 10", "qd 5"] });
  assert.deepEqual(partes("TRAV. XV DE NOVEMBRO, 10 FUNDOS"), { tipo: "travessa", nome: "15 novembro", numero: "10", unidades: ["fundos"] });
});

test("fração, genérico e especificidade", () => {
  assert.equal(analisarEndereco("AVENIDA CONDE FRANCISCO MATARAZZO, N. 00, QD 22, LT 02 PARTE").fracao, true);
  assert.equal(analisarEndereco("RUA X, 10, FRAÇÃO IDEAL").fracao, true);
  for (const generico of ["RUA A, N. 10", "RUA 10, N. SN, LT 1", "RUA OITO, N. 454", "RUA PROJETADA R2, N. 362", "AVENIDA PRINCIPAL, N. 00", "QUADRA 28, N. SN, LT 05A"]) {
    assert.equal(analisarEndereco(generico).generico, true, generico);
  }
  for (const proprio of ["RUA SETE DE SETEMBRO, N. 10", "RUA DO PURUS, N. S/N", "AVENIDA PAULISTA, 1000"]) {
    assert.equal(analisarEndereco(proprio).generico, false, proprio);
  }
  assert.equal(especificidade(analisarEndereco("RUA BOA VISTA, N. SN,")), 0);
  assert.equal(especificidade(analisarEndereco("RUA X, N. 0")), 0, "número 0 é sem número");
  assert.equal(especificidade(analisarEndereco("RUA X, N. 10")), 1);
  assert.equal(especificidade(analisarEndereco("RUA X, N. SN, LT 10, QD 2")), 2);
  assert.equal(especificidade(analisarEndereco("RUA X, N. 10, APTO 21, BL B")), 3);
});

test("bairro comparável", () => {
  assert.equal(normalizarBairro("JD. AMÉRICA II"), "jardim america 2");
  assert.equal(normalizarBairro("Jardim América 2"), "jardim america 2");
  assert.equal(normalizarBairro("BAIRRO COHAB"), "cohab");
  assert.equal(normalizarBairro("LOT NOVA ESPERANÇA"), "loteamento nova esperanca");
  assert.equal(normalizarBairro("PQ. DAS NAÇÕES"), "parque nacoes");
  assert.equal(normalizarBairro(null), "");
});
