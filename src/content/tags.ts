/**
 * Tags de risco (blueprint, Passo 2 · Clusterização). A cor indica a gravidade e vem sempre
 * acompanhada de ícone e texto: vermelho grave, amarelo atenção, verde positivo, cinza informativo.
 * Os critérios exatos de cada tag devem ser validados com o advogado parceiro.
 */
export type Severity = "grave" | "atencao" | "positivo" | "info";

export const SEVERITY_LABEL: Record<Severity, string> = {
  grave: "Risco grave",
  atencao: "Atenção",
  positivo: "Ponto positivo",
  info: "Informativo",
};

export type TagDef = { label: string; severity: Severity };

export const TAG_CATEGORIES: { name: string; tags: TagDef[] }[] = [
  {
    name: "Posse",
    tags: [
      { label: "Ocupado", severity: "grave" },
      { label: "Desocupado", severity: "positivo" },
      { label: "Ocupação não informada", severity: "info" },
    ],
  },
  {
    name: "Preço",
    tags: [
      { label: "Deságio alto", severity: "positivo" },
      { label: "Deságio baixo", severity: "atencao" },
      { label: "Preço acima do mercado", severity: "grave" },
      { label: "Custos extras altos", severity: "atencao" },
    ],
  },
  {
    name: "Dívidas",
    tags: [
      { label: "Condomínio em atraso", severity: "atencao" },
      { label: "IPTU em atraso", severity: "atencao" },
      { label: "Dívida passa ao arrematante", severity: "grave" },
    ],
  },
  {
    name: "Jurídico",
    tags: [
      { label: "Ação judicial em curso", severity: "grave" },
      { label: "Penhora de outros credores", severity: "grave" },
      { label: "Leilão com recurso", severity: "atencao" },
      { label: "Devedor com direito de preferência", severity: "atencao" },
    ],
  },
  {
    name: "Documentação",
    tags: [
      { label: "Matrícula com pendência", severity: "atencao" },
      { label: "Construção irregular", severity: "grave" },
      { label: "Área divergente", severity: "atencao" },
    ],
  },
  {
    name: "Propriedade",
    tags: [
      { label: "Imóvel inteiro", severity: "positivo" },
      { label: "Cota-parte", severity: "atencao" },
      { label: "Só direitos sobre o imóvel", severity: "grave" },
    ],
  },
  {
    name: "Condição",
    tags: [
      { label: "Sem fotos", severity: "info" },
      { label: "Sem vistoria", severity: "info" },
      { label: "Aceita financiamento", severity: "positivo" },
    ],
  },
  {
    name: "Praça",
    tags: [
      { label: "1ª praça", severity: "info" },
      { label: "2ª praça", severity: "positivo" },
      { label: "Praça única", severity: "info" },
    ],
  },
];
