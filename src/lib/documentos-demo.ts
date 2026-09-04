import {
  fichaVazia,
  type DocumentoViagem,
  type SeccaoDocumento,
  type TipoFicheiro,
} from "./documentos";

export function criarDocumento(
  parcial: Partial<DocumentoViagem> & {
    nome: string;
    tipo: TipoFicheiro;
    seccao: SeccaoDocumento;
  },
): DocumentoViagem {
  return {
    id: crypto.randomUUID(),
    ficha: { ...fichaVazia },
    destacar: true,
    wallet: "nao",
    estadoAnalise: "concluida",
    ...parcial,
  };
}

/** Data relativa a hoje, para a demonstração estar sempre "próxima". */
export function emDias(dias: number, hora: string) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.toISOString().slice(0, 10)}T${hora}`;
}

export function documentosDemo(): DocumentoViagem[] {
  return [
    criarDocumento({
      nome: "Cartão de embarque — LIS → BCN",
      tipo: "pdf",
      seccao: "bilhetes",
      ficha: {
        ...fichaVazia,
        tipoDocumento: "Cartão de embarque",
        fornecedor: "TAP Air Portugal",
        passageiro: "Diogo Caldas",
        local: "Lisboa (LIS) → Barcelona (BCN)",
        referencia: "TP1042",
        dataHora: emDias(1, "07:45"),
        codigo: "M1CALDAS/DIOGO TP1042 LISBCN",
      },
      wallet: "ligado",
    }),
    criarDocumento({
      nome: "Transfer aeroporto → centro",
      tipo: "qr",
      seccao: "vouchers",
      ficha: {
        ...fichaVazia,
        tipoDocumento: "Voucher de transfer",
        fornecedor: "Barcelona Shuttle",
        passageiro: "2 pessoas",
        local: "Aeroporto El Prat",
        referencia: "BS-77120",
        dataHora: emDias(1, "11:30"),
        codigo: "QR:BS-77120",
      },
    }),
    criarDocumento({
      nome: "Reserva do hotel Gòtic",
      tipo: "email",
      seccao: "vouchers",
      ficha: {
        ...fichaVazia,
        tipoDocumento: "Reserva de hotel",
        fornecedor: "Hotel Gòtic",
        passageiro: "Diogo Caldas",
        local: "Carrer dels Banys Nous, Barcelona",
        referencia: "HG-88213",
        dataHora: emDias(1, "15:00"),
        dataHoraFim: emDias(5, "11:00"),
      },
    }),
    criarDocumento({
      nome: "Cartão de embarque — BCN → LIS",
      tipo: "qr",
      seccao: "bilhetes",
      ficha: {
        ...fichaVazia,
        tipoDocumento: "Cartão de embarque",
        fornecedor: "TAP Air Portugal",
        passageiro: "Diogo Caldas",
        local: "Barcelona (BCN) → Lisboa (LIS)",
        referencia: "TP1049",
        dataHora: emDias(5, "19:20"),
        codigo: "M1CALDAS/DIOGO TP1049 BCNLIS",
      },
    }),
    criarDocumento({
      nome: "Seguro de viagem",
      tipo: "pdf",
      seccao: "outros",
      destacar: false,
      ficha: {
        ...fichaVazia,
        tipoDocumento: "Seguro de viagem",
        fornecedor: "Fidelidade",
        passageiro: "Diogo Caldas",
        referencia: "88213-A",
      },
    }),
  ];
}
