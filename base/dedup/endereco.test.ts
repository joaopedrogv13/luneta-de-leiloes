import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarEndereco, especificidade, normalizarBairro, type EnderecoPartes } from "./endereco.ts";

function partes(endereco: string): Pick<EnderecoPartes, "tipo" | "nome" | "numero" | "unidades"> {
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

test("unidade com \"nº\" entre o rótulo e o valor: o valor é da unidade, não da casa", () => {
  // Fixture real da Leilões Judiciais (lote 218903) e grafias reais do CSV da Caixa.
  assert.deepEqual(partes("Rua Doutor Melo Alves, nº 640, apartamento nº 91, Cerqueira César, São Paulo/SP"), { tipo: "rua", nome: "doutor melo alves", numero: "640", unidades: ["ap 91"] });
  assert.notDeepEqual(partes("Rua Doutor Melo Alves, nº 640, apartamento nº 91"), partes("Rua Doutor Melo Alves, nº 640, apartamento nº 92"));
  assert.deepEqual(partes("Rua X, nº 10, apto. nº 21").unidades, ["ap 21"]);
  assert.notDeepEqual(partes("Rua X, nº 10, casa nº 1"), partes("Rua X, nº 10, casa nº 2"));
  assert.deepEqual(partes("Rua X, s/n, lote nº 5 da quadra nº 3"), { tipo: "rua", nome: "x", numero: "sn", unidades: ["lt 5", "qd 3"] });
  assert.deepEqual(partes("RUA JOSE MANOEL DE OLIVEIRA, N. 713, CASA Nº 08").unidades, ["casa 8"]);
  assert.deepEqual(partes("RUA 9 DE JANEIRO, N. SN, QUADRA 19, LOTE Nº 05").unidades, ["lt 5", "qd 19"]);
  assert.deepEqual(partes("AVENIDA LOURENÇO PAIVA, N. 1023, LOTE N.17, QUADRA 6B"), { tipo: "avenida", nome: "lourenco paiva", numero: "1023", unidades: ["lt 17", "qd 6b"] });
  assert.deepEqual(partes("RUA MONTE LIBANO, N. 944, Apto 1601, VAGA N 52").unidades, ["ap 1601", "vaga 52"]);
  assert.deepEqual(partes("RUA X, N. 10, lote nº 11A3").unidades, ["lt 11a3"], "o \"n\" nunca vira o valor");
  assert.deepEqual(partes("quadra nº 10, N. SN, apartamento nº 201"), partes("QUADRA 10, N. SN, Apto 201"), "quadra como endereço");
  assert.deepEqual(partes("apto. nº 21"), { tipo: "", nome: "", numero: null, unidades: ["ap 21"] }, "sem logradouro");
});

test("\"d\" e \"e\" sozinhos ou no fim são o nome da rua, não partícula", () => {
  assert.equal(analisarEndereco("RUA E, N. 10").nome, "e");
  assert.equal(analisarEndereco("RUA D, N. 10").nome, "d");
  assert.equal(analisarEndereco("ALAMEDA D, N. 36, LT 13 QD B").nome, "d");
  assert.equal(analisarEndereco("RUA PROJETADA D, N. 20").nome, "projetada d");
  assert.equal(analisarEndereco("RUA PROJETADA E, N. 20").nome, "projetada e");
  assert.equal(analisarEndereco("RUA PROJETADA D/E, N. 20").nome, "projetada d e");
  assert.equal(analisarEndereco("RUA E-5, N. S/N, LT 11B").nome, "e 5");
  assert.equal(analisarEndereco("RUA SANTOS E SILVA, N. 10").nome, "santos silva", "antes de palavra continua partícula");
  assert.equal(analisarEndereco("Rua D'Ávila, 10").nome, "avila");
  for (const generico of ["RUA E, N. 10", "RUA PROJETADA D, N. 20", "RUA 04-D, N. 47"]) assert.equal(analisarEndereco(generico).generico, true, generico);
  assert.equal(normalizarBairro("SETOR D"), "setor d");
  assert.notEqual(normalizarBairro("SETOR D"), normalizarBairro("SETOR E"));
});

test("rua cuja designação tem marcador (\"RUA N-1\", \"RUA Nº 06\") mantém o número da casa", () => {
  assert.deepEqual(partes("RUA N-1, N. 50"), { tipo: "rua", nome: "n 1", numero: "50", unidades: [] });
  assert.notDeepEqual(partes("RUA N-1, N. 50"), partes("RUA N-1, N. 51"));
  assert.deepEqual(partes("RUA Nº 06, N. 100"), { tipo: "rua", nome: "n 6", numero: "100", unidades: [] });
  assert.notDeepEqual(partes("RUA Nº 06, N. 100"), partes("RUA Nº 06, N. 200"));
  assert.deepEqual(partes("RUA Nº 06, N. SN, Apto 637"), { tipo: "rua", nome: "n 6", numero: "sn", unidades: ["ap 637"] });
  assert.deepEqual(partes("RUA N-2 KM 1, N. 00"), { tipo: "rua", nome: "n 2", numero: "sn", unidades: ["km 1"] });
  assert.equal(analisarEndereco("RUA N-1, N. 50").generico, true);
});

test("formato de leiloeiro sem \"nº\": o número é o primeiro campo numérico; bairro e cidade saem", () => {
  // Endereços reais extraídos pelo conector da Leilões Judiciais (sonda de 11/10/2026).
  const lj: Array<[string, ReturnType<typeof partes>]> = [
    ["Rua Frei Antônio de Guadalupe, nº 67, apto 21, Vila Prudente, São Paulo/SP", { tipo: "rua", nome: "frei antonio guadalupe", numero: "67", unidades: ["ap 21"] }],
    ["Rua Dardanelos, 411 - Apto 162 - Alto da Lapa - São Paulo/SP", { tipo: "rua", nome: "dardanelos", numero: "411", unidades: ["ap 162"] }],
    ["Rua Doutor Melo Alves, nº 640, apartamento nº 91, Cerqueira César, São Paulo/SP", { tipo: "rua", nome: "doutor melo alves", numero: "640", unidades: ["ap 91"] }],
    ["Rua José Benedetti, nº 18 e Rua Monte Alegre nº 270, São Caetano do Sul/SP", { tipo: "rua", nome: "jose benedetti", numero: "18", unidades: [] }],
    ["Rua Passo da Patria, 1407 - Apto 81 - Alto da Lapa - São Paulo/SP", { tipo: "rua", nome: "passo patria", numero: "1407", unidades: ["ap 81"] }],
    ["Rua Ana de Barros, 35 - Apto 133 - Jardim Santa Inês - São Paulo/SP", { tipo: "rua", nome: "ana barros", numero: "35", unidades: ["ap 133"] }],
    ["Rua Antônio Furtado de Miranda, 493, Vila Industrial, Presidente Prudente/SP", { tipo: "rua", nome: "antonio furtado miranda", numero: "493", unidades: [] }],
  ];
  for (const [endereco, esperado] of lj) assert.deepEqual(partes(endereco), esperado, endereco);
  assert.equal(analisarEndereco("Rua Antônio Furtado de Miranda, 493, Vila Industrial, Presidente Prudente/SP").bairro, "vila industrial");
  assert.equal(analisarEndereco("Rua Dardanelos, 411 - Apto 162 - Alto da Lapa - São Paulo/SP").bairro, "alto lapa");
  // Mesmo imóvel no formato da Caixa e no do leiloeiro.
  assert.deepEqual(partes("RUA ANTONIO FURTADO DE MIRANDA, N. 493,"), partes("Rua Antônio Furtado de Miranda, 493, Vila Industrial, Presidente Prudente/SP"));
  assert.deepEqual(partes("Rua X Souza, 100, Jardim 2"), { tipo: "rua", nome: "x souza", numero: "100", unidades: ["u 2"] }, "o número não vem do bairro");
  assert.deepEqual(partes("Rua X Souza, 100, Jardim América II, Campinas/SP"), { tipo: "rua", nome: "x souza", numero: "100", unidades: [] }, "o romano do bairro não é unidade");
  assert.notDeepEqual(partes("Rua Turquia, 75-E, Centro, São Paulo/SP"), partes("Rua Turquia, 75-D, Centro, São Paulo/SP"));
  assert.deepEqual(partes("Rua Turquia, 75-E, Centro, São Paulo/SP"), partes("RUA TURQUIA, N. 75-E"));
  assert.equal(analisarEndereco("Rua X, 482, Antiga Rua Y, nº 65").numero, "482", "o número logo depois do logradouro vence o marcador adiante");
  assert.deepEqual(partes("Rua X, 62, apto 21, Centro, São Paulo - SP"), partes("RUA X, N. 62, Apto 21"));
  // A cidade informada sai do texto; o bairro de mesmo nome antes de "Cidade/UF", não.
  assert.equal(analisarEndereco("Rua Projetada G, s/n, Lt 03 Qd G, Cha de Alegria, Cha de Alegria/PE", { cidade: "Chã de Alegria" }).bairro, "cha alegria");
  assert.equal(analisarEndereco("Rua X, 10, Lt 3, Centro, Recife", { cidade: "Recife" }).bairro, "centro");
});

test("complemento da Caixa: letra, lista de lotes, hífen e campos sem número", () => {
  assert.equal(analisarEndereco("RUA NOVA, N. 540, A,").numero, "540a", "letra sozinha no campo seguinte");
  assert.deepEqual(partes("RUA X, N. 10, LT 12-A RUA 03").unidades, ["lt 12a"]);
  assert.deepEqual(partes("AVENIDA ALFA, N. SN, LTS 42, 43, 44, QD VII").unidades, ["lt 42", "lt 43", "lt 44", "qd 7"]);
  assert.deepEqual(partes("RUA PROJETADA, N. 400, QD 14 LT 02, 03 E 04").unidades, ["lt 2", "lt 3", "lt 4", "qd 14"]);
  assert.deepEqual(partes("RUA X, N. 10, LT 10, 02").unidades, ["lt 10", "u 2"], "sem \"e\" e sem plural, \"02\" não é outro lote");
  assert.deepEqual(partes("RUA JOAO GONCALVES RIBEIRO, N. 120, Apto 201, BLOCO - A").unidades, ["ap 201", "bl a"]);
  assert.deepEqual(partes("RUA HEIDE CARNEIRO, N. 27, Apto SN, LT 13").numero, "27");
  assert.deepEqual(partes("QUADRA 3, N. LT 20, Apto 207"), { tipo: "", nome: "qd 3", numero: null, unidades: ["ap 207", "lt 20"] }, "\"N.\" sem número");
  assert.equal(analisarEndereco("AVENIDA JOCHRIS MANOEL CAMARINHA, N. O-271, QD C1").numero, "o271");
  assert.equal(analisarEndereco("RUA PROJETADA - 03, N. 4671, Apto 103").nome, "projetada 3", "o número com marcador vem adiante");
  assert.equal(analisarEndereco("PB - 356, N. 00, QD J, LT 08").nome, "pb 356");
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
