export type TipoFicheiro = "pdf" | "qr" | "email" | "imagem";

export type SeccaoDocumento = "bilhetes" | "vouchers" | "outros";

export type EstadoWallet = "nao" | "preparado" | "ligado";

export type CategoriaDocumento =
  | "voo"
  | "hotel"
  | "transporte"
  | "transfer"
  | "bilhete"
  | "documento"
  | "informacao"
  | "outro";

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

  // Transporte / transfer
  operador: string;

  // Informação complementar
  condicoes: string;
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
  operador: "",
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
      { chave: "companhia", rotulo: "Companhia aérea" },
      { chave: "numeroVoo", rotulo: "Número do voo" },
      { chave: "origem", rotulo: "Origem (IATA / nome)" },
      { chave: "destino", rotulo: "Destino (IATA / nome)" },
      { chave: "dataHora", rotulo: "Partida", tipo: "datetime-local" },
      {
        chave: "horaEmbarque",
        rotulo: "Embarque",
        tipo: "datetime-local",
      },
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
      {
        chave: "dataHora",
        rotulo: "Check-in",
        tipo: "datetime-local",
      },
      {
        chave: "dataHoraFim",
        rotulo: "Check-out",
        tipo: "datetime-local",
      },
      { chave: "quarto", rotulo: "Quarto / tipologia" },
      { chave: "contacto", rotulo: "Contacto" },
      { chave: "condicoes", rotulo: "Condições", largo: true },
      { chave: "codigo", rotulo: "Código / QR", largo: true },
    ];
  }

  if (cat === "transporte") {
    return [
      ...comuns,
      { chave: "passageiro", rotulo: "Passageiro" },
      { chave: "operador", rotulo: "Operador" },
      { chave: "local", rotulo: "Local de partida" },
      { chave: "origem", rotulo: "Origem" },
      { chave: "destino", rotulo: "Destino" },
      {
        chave: "dataHora",
        rotulo: "Partida",
        tipo: "datetime-local",
      },
      {
        chave: "dataHoraFim",
        rotulo: "Chegada",
        tipo: "datetime-local",
      },
      { chave: "contacto", rotulo: "Contacto" },
      { chave: "condicoes", rotulo: "Informação", largo: true },
      { chave: "codigo", rotulo: "Bilhete / QR / código", largo: true },
    ];
  }

  if (cat === "transfer") {
    return [
      ...comuns,
      { chave: "passageiro", rotulo: "Passageiro" },
      { chave: "operador", rotulo: "Operador" },
      { chave: "local", rotulo: "Local de recolha" },
      { chave: "origem", rotulo: "Origem" },
      { chave: "destino", rotulo: "Destino" },
      {
        chave: "dataHora",
        rotulo: "Data e hora da recolha",
        tipo: "datetime-local",
      },
      { chave: "contacto", rotulo: "Contacto" },
      { chave: "condicoes", rotulo: "Condições", largo: true },
      { chave: "codigo", rotulo: "Código / QR", largo: true },
    ];
  }

  if (cat === "bilhete") {
    return [
      ...comuns,
      { chave: "passageiro", rotulo: "Titular" },
      { chave: "local", rotulo: "Local / evento" },
      {
        chave: "dataHora",
        rotulo: "Data e hora",
        tipo: "datetime-local",
      },
      {
        chave: "dataHoraFim",
        rotulo: "Fim",
        tipo: "datetime-local",
      },
      { chave: "contacto", rotulo: "Contacto" },
      { chave: "codigo", rotulo: "Bilhete / QR / código", largo: true },
      { chave: "condicoes", rotulo: "Informação", largo: true },
    ];
  }

  if (cat === "documento") {
    return [
      ...comuns,
      { chave: "passageiro", rotulo: "Titular" },
      { chave: "local", rotulo: "Local associado" },
      {
        chave: "dataHora",
        rotulo: "Data",
        tipo: "datetime-local",
      },
      { chave: "condicoes", rotulo: "Descrição / notas", largo: true },
      { chave: "codigo", rotulo: "Código / referência", largo: true },
    ];
  }

  if (cat === "informacao") {
    return [
      ...comuns,
      { chave: "local", rotulo: "Local" },
      {
        chave: "dataHora",
        rotulo: "Data e hora",
        tipo: "datetime-local",
      },
      {
        chave: "dataHoraFim",
        rotulo: "Fim",
        tipo: "datetime-local",
      },
      { chave: "contacto", rotulo: "Contacto" },
      { chave: "condicoes", rotulo: "Informação", largo: true },
    ];
  }

  return [
    ...comuns,
    { chave: "passageiro", rotulo: "Nome" },
    { chave: "local", rotulo: "Local" },
    {
      chave: "dataHora",
      rotulo: "Data e hora",
      tipo: "datetime-local",
    },
    {
      chave: "dataHoraFim",
      rotulo: "Fim",
      tipo: "datetime-local",
    },
    { chave: "condicoes", rotulo: "Notas", largo: true },
    { chave: "codigo", rotulo: "Código / QR", largo: true },
  ];
}

export function categoriaValida(valor: string): CategoriaDocumento {
  const v = (valor ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    v === "voo" ||
    v === "hotel" ||
    v === "transporte" ||
    v === "transfer" ||
    v === "bilhete" ||
    v === "documento" ||
    v === "informacao"
  ) {
    return v;
  }

  return "outro";
}

/**
 * Deduz a categoria a partir do texto quando a leitura não a indicou.
 *
 * A ordem é importante para evitar classificações demasiado genéricas.
 */
export function categoriaPorTexto(texto: string): CategoriaDocumento {
  const t = (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Voo
  if (
    /embarque|boarding|cartao de embarque|voo|flight|companhia aerea|pnr|iata|numero do voo/.test(
      t,
    )
  ) {
    return "voo";
  }

  // Alojamento
  if (
    /hotel|alojamento|hostel|apartamento|booking.*hotel|check-?in|check-?out|hospede|quarto/.test(
      t,
    )
  ) {
    return "hotel";
  }

  // Transfer
  if (
    /transfer|shuttle|recolha|pick-?up|pickup|taxi|motorista|airport transfer/.test(
      t,
    )
  ) {
    return "transfer";
  }

  // Comboios, autocarros e outros transportes
  if (
    /comboio|train|ferroviario|cp |intercidades|alfa pendular|autocarro|bus|flixbus|rede expressos|metro|ferry|barco|passagem.*comboio|bilhete.*comboio|bilhete.*autocarro/.test(
      t,
    )
  ) {
    return "transporte";
  }

  // Bilhetes, entradas e atividades
  if (
    /bilhete|ticket|ingresso|entrada|museu|museum|monumento|monument|castelo|palacio|tour|visita guiada|excursao|experiencia|atracao|attraction|concerto|concert|teatro|theater|espetaculo|festival|evento|event|parque tematico|zoo|aquario/.test(
      t,
    )
  ) {
    return "bilhete";
  }

  // Documentação de viagem
  if (
    /seguro de viagem|travel insurance|apolice|apolice|voucher|documento de viagem|passaporte|visa|visto|recibo|fatura|invoice|comprovativo|confirmation|confirmacao de reserva/.test(
      t,
    )
  ) {
    return "documento";
  }

  // Informação útil
  if (
    /instrucoes|informacao|how to get|como chegar|morada|endereco|horario|regras|condicoes|check-in online/.test(
      t,
    )
  ) {
    return "informacao";
  }

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
  estadoAnalise:
    | "por_analisar"
    | "a_analisar"
    | "concluida"
    | "erro";
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

export function seccaoSugerida(
  tipoDocumento: string,
): SeccaoDocumento {
  const t = (tipoDocumento ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    /bilhete|embarque|boarding|voo|flight|comboio|train|autocarro|bus|entrada|ticket/.test(
      t,
    )
  ) {
    return "bilhetes";
  }

  if (
    /voucher|reserva|booking|hotel|transfer|atividade|aluguer|rental|museu|museum|tour|concerto|concert|espetaculo/.test(
      t,
    )
  ) {
    return "vouchers";
  }

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
export function paraUsarEmBreve(
  docs: DocumentoViagem[],
  agora = new Date(),
) {
  return docs
    .filter((d) => d.destacar && d.ficha.dataHora)
    .map((d) => ({
      doc: d,
      ts: new Date(d.ficha.dataHora).getTime(),
    }))
    .filter(
      (x) =>
        Number.isFinite(x.ts) &&
        x.ts >= agora.getTime() - 6 * 60 * 60 * 1000,
    )
    .sort((a, b) => a.ts - b.ts)
    .map((x) => x.doc);
}