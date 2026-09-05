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
  if (doc.ficha.categoria) return categoriaValida(doc.ficha.categoria);
  return categoriaPorTexto(`${doc.ficha.tipoDocumento} ${doc.nome}`);
}

export type EventoDerivado = {
  tipo: TipoEvento;
  titulo: string;
  local: string;
  /** ISO UTC */
  quando: string;
  antecipacaoMin: number;
};

/**
 * Eventos que fazem sentido para uma ficha já analisada (voo, hotel, transfer).
 * As antecipações são apenas sugestões — o utilizador pode alterá-las.
 */
export function eventosDaFicha(ficha: FichaDocumento, nomeDocumento: string): EventoDerivado[] {
  const quando = ficha.dataHora;
  if (!quando || Number.isNaN(new Date(quando).getTime())) return [];
  const local = ficha.local || ficha.origem || ficha.morada || "";
  const eventos: EventoDerivado[] = [];
  const juntar = (tipo: TipoEvento, momento: string, antecipacaoMin: number, titulo?: string) => {
    if (!momento) return;
    eventos.push({ tipo, titulo: titulo ?? rotuloTipo[tipo], local, quando: momento, antecipacaoMin });
  };

  const cat = ficha.categoria
    ? categoriaValida(ficha.categoria)
    : categoriaPorTexto(`${ficha.tipoDocumento} ${nomeDocumento}`);

  switch (cat) {
    case "voo": {
      const voo = ficha.numeroVoo ? ` ${ficha.numeroVoo}` : "";
      juntar("checkin_voo", desloca(quando, -24 * 60), 60, `Check-in do voo${voo}`);
      juntar("sair_para_aeroporto", desloca(quando, -3 * 60), 60);
      juntar(
        "embarque",
        ficha.horaEmbarque && !Number.isNaN(new Date(ficha.horaEmbarque).getTime())
          ? new Date(ficha.horaEmbarque).toISOString()
          : desloca(quando, -40),
        15,
        `Embarque${voo}${ficha.porta ? ` · porta ${ficha.porta}` : ""}`,
      );
      break;
    }
    case "transfer":
      juntar("recolha_transfer", new Date(quando).toISOString(), 60);
      break;
    case "hotel":
      juntar("checkin_hotel", new Date(quando).toISOString(), 180);
      if (ficha.dataHoraFim && !Number.isNaN(new Date(ficha.dataHoraFim).getTime())) {
        juntar("checkout_hotel", new Date(ficha.dataHoraFim).toISOString(), 60);
      }
      break;
    default:
      juntar("outro", new Date(quando).toISOString(), 1440, `Lembrete — ${nomeDocumento}`);
  }
  return eventos;
}

/**
 * Deriva os eventos sugeridos a partir dos dados extraídos de cada documento.
 */
export function eventosSugeridos(docs: DocumentoViagem[]): EventoAviso[] {
  const eventos: EventoAviso[] = [];

  for (const doc of docs) {
    for (const e of eventosDaFicha({ ...doc.ficha, categoria: categoria(doc) }, doc.nome)) {
      eventos.push({
        documentoId: doc.id,
        documentoNome: doc.nome,
        ativo: doc.destacar,
        id: `${doc.id}:${e.tipo}`,
        tipo: e.tipo,
        titulo: e.titulo,
        local: e.local,
        quando: e.quando,
        antecipacaoMin: e.antecipacaoMin,
      });
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
