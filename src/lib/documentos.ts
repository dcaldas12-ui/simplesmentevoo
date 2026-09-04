export type TipoFicheiro = "pdf" | "qr" | "email" | "imagem";

export type SeccaoDocumento = "bilhetes" | "vouchers" | "outros";

export type EstadoWallet = "nao" | "preparado" | "ligado";

/** Dados que a análise por IA tenta extrair de um documento de viagem. */
export type FichaDocumento = {
  tipoDocumento: string;
  fornecedor: string;
  passageiro: string;
  local: string;
  referencia: string;
  /** ISO local: "2026-10-03T07:45" */
  dataHora: string;
  codigo: string;
};

export const fichaVazia: FichaDocumento = {
  tipoDocumento: "",
  fornecedor: "",
  passageiro: "",
  local: "",
  referencia: "",
  dataHora: "",
  codigo: "",
};

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
