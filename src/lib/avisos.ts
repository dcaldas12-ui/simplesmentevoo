import type { DocumentoViagem } from "./documentos";

export type TipoEvento =
  | "checkin_voo"
  | "sair_para_aeroporto"
  | "embarque"
  | "recolha_transfer"
  | "checkin_hotel"
  | "checkout_hotel"
  | "outro";

export type EventoAviso = {
  id: string;
  documentoId: string;
  documentoNome: string;
  tipo: TipoEvento;
  titulo: string;
  local: string;
  /** Momento do evento (ISO local). */
  quando: string;
  /** Antecipação do lembrete, em minutos. */
  antecipacaoMin: number;
  ativo: boolean;
};

export const ANTECIPACOES = [
  { valor: 15, rotulo: "15 min antes" },
  { valor: 60, rotulo: "1 hora antes" },
  { valor: 180, rotulo: "3 horas antes" },
  { valor: 1440, rotulo: "24 horas antes" },
] as const;

export const rotuloTipo: Record<TipoEvento, string> = {
  checkin_voo: "Check-in do voo",
  sair_para_aeroporto: "Sair para o aeroporto",
  embarque: "Embarque",
  recolha_transfer: "Recolha do transfer",
  checkin_hotel: "Check-in no hotel",
  checkout_hotel: "Check-out do hotel",
  outro: "Lembrete",
};

function desloca(iso: string, minutos: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + minutos);
  return d.toISOString();
}

function categoria(doc: DocumentoViagem): "voo" | "transfer" | "hotel" | "outro" {
  const t = `${doc.ficha.tipoDocumento} ${doc.nome}`.toLowerCase();
  if (/embarque|voo|boarding|bilhete de avião/.test(t)) return "voo";
  if (/transfer|recolha|shuttle|táxi|taxi|aluguer/.test(t)) return "transfer";
  if (/hotel|alojamento|apartamento|hostel|reserva de hotel/.test(t)) return "hotel";
  return "outro";
}

/**
 * Deriva os eventos sugeridos a partir dos dados extraídos de cada documento.
 * As antecipações são apenas sugestões — o utilizador pode alterá-las.
 */
export function eventosSugeridos(docs: DocumentoViagem[]): EventoAviso[] {
  const eventos: EventoAviso[] = [];

  for (const doc of docs) {
    const quando = doc.ficha.dataHora;
    if (!quando) continue;
    const base = {
      documentoId: doc.id,
      documentoNome: doc.nome,
      local: doc.ficha.local,
      ativo: doc.destacar,
    };
    const juntar = (
      tipo: TipoEvento,
      momento: string,
      antecipacaoMin: number,
      titulo?: string,
    ) => {
      if (!momento) return;
      eventos.push({
        ...base,
        id: `${doc.id}:${tipo}`,
        tipo,
        titulo: titulo ?? rotuloTipo[tipo],
        quando: momento,
        antecipacaoMin,
      });
    };

    switch (categoria(doc)) {
      case "voo":
        juntar("checkin_voo", desloca(quando, -24 * 60), 60);
        juntar("sair_para_aeroporto", desloca(quando, -3 * 60), 60);
        juntar("embarque", desloca(quando, -40), 15);
        break;
      case "transfer":
        juntar("recolha_transfer", new Date(quando).toISOString(), 60);
        break;
      case "hotel":
        juntar("checkin_hotel", new Date(quando).toISOString(), 180);
        if (doc.ficha.dataHoraFim) {
          juntar("checkout_hotel", new Date(doc.ficha.dataHoraFim).toISOString(), 60);
        }
        break;
      default:
        juntar("outro", new Date(quando).toISOString(), 1440, `Lembrete — ${doc.nome}`);
    }
  }

  return eventos.sort((a, b) => a.quando.localeCompare(b.quando));
}

export function momentoDoLembrete(evento: EventoAviso) {
  return desloca(evento.quando, -evento.antecipacaoMin);
}

export function formatarMomento(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function contagem(iso: string, agora = new Date()) {
  const alvo = new Date(iso).getTime();
  if (!Number.isFinite(alvo)) return "";
  const min = Math.round((alvo - agora.getTime()) / 60000);
  if (min < 0) return "já passou";
  if (min < 60) return `daqui a ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `daqui a ${horas} h`;
  return `daqui a ${Math.round(horas / 24)} dias`;
}
