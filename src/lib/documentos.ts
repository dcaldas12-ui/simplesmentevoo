export type TipoFicheiro = "pdf" | "qr" | "email" | "imagem";

export type SeccaoDocumento = "bilhetes" | "vouchers" | "outros";

export type EstadoWallet = "nao" | "preparado" | "ligado";

export type CategoriaDocumento = "voo" | "hotel" | "transfer" | "outro";

/** Dados que a análise por IA tenta extrair de um documento de viagem. */
export type FichaDocumento = {
  /** Categoria detetada, usada para escolher os campos certos e os avisos. */
  categoria: string;
  tipoDocumento: string;
  fornecedor: string;
  passageiro: string;
  local: string;
  referencia: string;
  /** ISO local: "2026-10-03T07:45" */
  dataHora: string;
  /** Fim relevante (ex.: check-out do hotel), quando existir. */
  dataHoraFim: string;
  codigo: string;

  // Voo / cartão de embarque
  companhia: string;
  numeroVoo: string;
  origem: string;
  destino: string;
  horaEmbarque: string;
  terminal: string;
  porta: string;
  assento: string;
  grupoEmbarque: string;
  bagagem: string;

  // Hotel
  morada: string;
  quarto: string;
  condicoes: string;

  // Transfer
  contacto: string;

  /** Chaves separadas por vírgula que a leitura marcou como incertas. */
  porConfirmar: string;
};

export const fichaVazia: FichaDocumento = {
  categoria: "",
  tipoDocumento: "",
  fornecedor: "",
  passageiro: "",
  local: "",
  referencia: "",
  dataHora: "",
  dataHoraFim: "",
  codigo: "",
  companhia: "",
  numeroVoo: "",
  origem: "",
  destino: "",
  horaEmbarque: "",
  terminal: "",
  porta: "",
  assento: "",
  grupoEmbarque: "",
  bagagem: "",
  morada: "",
  quarto: "",
  condicoes: "",
  contacto: "",
  porConfirmar: "",
};

export type CampoFicha = {
  chave: keyof FichaDocumento;
  rotulo: string;
  tipo?: "text" | "datetime-local";
  largo?: boolean;
};

const comuns: CampoFicha[] = [
  { chave: "tipoDocumento", rotulo: "Tipo de documento" },
  { chave: "fornecedor", rotulo: "Fornecedor" },
  { chave: "referencia", rotulo: "Referência / reserva" },
];

/** Campos relevantes para cada categoria de documento. */
export function camposDaFicha(categoria: string): CampoFicha[] {
  const cat = categoriaValida(categoria);
  if (cat === "voo") {
    return [
      ...comuns,
      { chave: "passageiro", rotulo: "Passageiro" },
      { chave: "companhia", rotulo: "Companhia" },
      { chave: "numeroVoo", rotulo: "Número do voo" },
      { chave: "origem", rotulo: "Origem (IATA / nome)" },
      { chave: "destino", rotulo: "Destino (IATA / nome)" },
      { chave: "dataHora", rotulo: "Partida", tipo: "datetime-local" },
      { chave: "horaEmbarque", rotulo: "Embarque", tipo: "datetime-local" },
      { chave: "terminal", rotulo: "Terminal" },
      { chave: "porta", rotulo: "Porta" },
      { chave: "assento", rotulo: "Assento" },
      { chave: "grupoEmbarque", rotulo: "Grupo de embarque" },
      { chave: "bagagem", rotulo: "Bagagem", largo: true },
      { chave: "codigo", rotulo: "Código / QR", largo: true },
    ];
  }
  if (cat === "hotel") {
    return [
      ...comuns,
      { chave: "passageiro", rotulo: "Hóspede" },
      { chave: "local", rotulo: "Nome do alojamento" },
      { chave: "morada", rotulo: "Morada", largo: true },
      { chave: "dataHora", rotulo: "Check-in", tipo: "datetime-local" },
      { chave: "dataHoraFim", rotulo: "Check-out", tipo: "datetime-local" },
      { chave: "quarto", rotulo: "Quarto / tipologia" },
      { chave: "contacto", rotulo: "Contacto" },
      { chave: "condicoes", rotulo: "Condições", largo: true },
      { chave: "codigo", rotulo: "Código / QR", largo: true },
    ];
  }
  if (cat === "transfer") {
    return [
      ...comuns,
      { chave: "passageiro", rotulo: "Passageiro" },
      { chave: "local", rotulo: "Local de recolha" },
      { chave: "destino", rotulo: "Destino" },
      { chave: "dataHora", rotulo: "Data e hora da recolha", tipo: "datetime-local" },
      { chave: "contacto", rotulo: "Contacto" },
      { chave: "condicoes", rotulo: "Condições", largo: true },
      { chave: "codigo", rotulo: "Código / QR", largo: true },
    ];
  }
  return [
    ...comuns,
    { chave: "passageiro", rotulo: "Nome" },
    { chave: "local", rotulo: "Local" },
    { chave: "dataHora", rotulo: "Data e hora", tipo: "datetime-local" },
    { chave: "dataHoraFim", rotulo: "Fim" },
    { chave: "condicoes", rotulo: "Notas", largo: true },
    { chave: "codigo", rotulo: "Código / QR", largo: true },
  ];
}

export function categoriaValida(valor: string): CategoriaDocumento {
  const v = (valor ?? "").toLowerCase();
  if (v === "voo" || v === "hotel" || v === "transfer") return v;
  return "outro";
}

/** Deduz a categoria a partir do texto quando a leitura não a indicou. */
export function categoriaPorTexto(texto: string): CategoriaDocumento {
  const t = texto.toLowerCase();
  if (/embarque|boarding|voo|flight|companhia aérea/.test(t)) return "voo";
  if (/hotel|alojamento|hostel|apartamento|check-?in|check-?out/.test(t)) return "hotel";
  if (/transfer|shuttle|recolha|pick-?up|táxi|taxi|motorista/.test(t)) return "transfer";
  return "outro";
}

export function camposPorConfirmar(ficha: FichaDocumento): string[] {
  return ficha.porConfirmar
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export type DocumentoViagem = {
  id: string;
  nome: string;
  tipo: TipoFicheiro;
  seccao: SeccaoDocumento;
  ficha: FichaDocumento;
  destacar: boolean;
  wallet: EstadoWallet;
  estadoAnalise: "por_analisar" | "a_analisar" | "concluida" | "erro";
  notaAnalise?: string;
};

const rotulos: Record<TipoFicheiro, string> = {
  pdf: "PDF",
  qr: "Código QR",
  email: "Recebido por email",
  imagem: "Imagem",
};

export function etiquetaTipo(tipo: TipoFicheiro) {
  return rotulos[tipo];
}

export function seccaoSugerida(tipoDocumento: string): SeccaoDocumento {
  const t = tipoDocumento.toLowerCase();
  if (/bilhete|embarque|boarding|voo|comboio|autocarro/.test(t)) return "bilhetes";
  if (/voucher|reserva|hotel|transfer|atividade|aluguer/.test(t)) return "vouchers";
  return "outros";
}

export function formatarDataHora(valor: string) {
  if (!valor) return "Sem data associada";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  return d.toLocaleString("pt-PT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Documentos com data futura, ordenados do mais próximo para o mais distante. */
export function paraUsarEmBreve(docs: DocumentoViagem[], agora = new Date()) {
  return docs
    .filter((d) => d.destacar && d.ficha.dataHora)
    .map((d) => ({ doc: d, ts: new Date(d.ficha.dataHora).getTime() }))
    .filter((x) => Number.isFinite(x.ts) && x.ts >= agora.getTime() - 6 * 60 * 60 * 1000)
    .sort((a, b) => a.ts - b.ts)
    .map((x) => x.doc);
}
