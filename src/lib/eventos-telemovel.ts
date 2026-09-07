import { categoriaPorTexto, fichaVazia, type CategoriaDocumento, type FichaDocumento } from "./documentos";

export type EventoEncontrado = {
  id: string;
  titulo: string;
  local: string;
  /** ISO do início do evento. */
  inicio: string;
  /** ISO do fim, quando o ficheiro o indicar. */
  fim: string;
  categoria: CategoriaDocumento;
  origem: "calendario" | "texto";
  /** Número de voo detetado no texto, quando existir. */
  numeroVoo: string;
  referencia: string;
};

const PALAVRAS_VIAGEM =
  /(voo|flight|vol\b|embarque|boarding|aeroporto|airport|hotel|hostel|alojamento|apartamento|check-?in|check-?out|transfer|shuttle|recolha|pick-?up|comboio|train|reserva|booking|réservation|itiner)/i;

function desdobrar(texto: string) {
  return texto.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function valorICS(linha: string) {
  const i = linha.indexOf(":");
  return i === -1 ? "" : linha.slice(i + 1).trim();
}

function descodificar(v: string) {
  return v.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

/** Converte DTSTART/DTEND do formato iCalendar para ISO. */
function dataICS(linha: string): string {
  const bruto = valorICS(linha);
  const m = bruto.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return "";
  const [, a, mes, dia, h = "00", min = "00", s = "00", z] = m;
  if (z) return new Date(`${a}-${mes}-${dia}T${h}:${min}:${s}Z`).toISOString();
  const d = new Date(Number(a), Number(mes) - 1, Number(dia), Number(h), Number(min), Number(s));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function numeroVooDe(texto: string) {
  const m = texto.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/);
  return m ? `${m[1]}${m[2]}` : "";
}

function referenciaDe(texto: string) {
  const m = texto.match(/\b(?:ref(?:er[êe]ncia)?|reserva|booking|pnr|localizador)[:\s#]+([A-Z0-9]{5,10})\b/i);
  return m?.[1] ? m[1].toUpperCase() : "";
}

/** Lê um ficheiro .ics e devolve apenas os eventos que parecem de viagem. */
export function eventosDeICS(conteudo: string): EventoEncontrado[] {
  const linhas = desdobrar(conteudo).split("\n");
  const eventos: EventoEncontrado[] = [];
  let atual: Record<string, string> | null = null;

  for (const linha of linhas) {
    const l = linha.trim();
    if (l.toUpperCase().startsWith("BEGIN:VEVENT")) {
      atual = {};
      continue;
    }
    if (!atual) continue;
    if (l.toUpperCase().startsWith("END:VEVENT")) {
      const titulo = descodificar(atual["summary"] ?? "");
      const local = descodificar(atual["location"] ?? "");
      const descricao = descodificar(atual["description"] ?? "");
      const inicio = atual["dtstart"] ?? "";
      const texto = `${titulo} ${local} ${descricao}`;
      if (inicio && titulo && PALAVRAS_VIAGEM.test(texto)) {
        eventos.push({
          id: (atual["uid"] || `${inicio}-${titulo}`).slice(0, 80),
          titulo: titulo.slice(0, 160),
          local: local.slice(0, 160),
          inicio,
          fim: atual["dtend"] ?? "",
          categoria: categoriaPorTexto(texto),
          origem: "calendario",
          numeroVoo: numeroVooDe(texto.toUpperCase()),
          referencia: referenciaDe(texto),
        });
      }
      atual = null;
      continue;
    }
    const chave = l.split(/[;:]/)[0]?.toLowerCase() ?? "";
    if (chave === "summary" || chave === "location" || chave === "description" || chave === "uid") {
      atual[chave] = valorICS(l);
    } else if (chave === "dtstart") {
      atual["dtstart"] = dataICS(l);
    } else if (chave === "dtend") {
      atual["dtend"] = dataICS(l);
    }
  }

  return eventos.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const MESES: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  feb: 1, apr: 3, may: 4, aug: 7, sep: 8, oct: 9, dec: 11,
  janv: 0, fév: 1, avr: 3, juil: 6, aoû: 7, déc: 11,
};

function dataDeTexto(linha: string): string {
  const hora = linha.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
  const hh = hora ? Number(hora[1]) : 9;
  const mm = hora ? Number(hora[2]) : 0;

  const numerica = linha.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (numerica) {
    const d = new Date(Number(numerica[3]), Number(numerica[2]) - 1, Number(numerica[1]), hh, mm);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const iso = linha.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), hh, mm);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const escrita = linha.match(/\b(\d{1,2})\s*(?:de\s+)?([a-zçéûôA-ZÇÉÛÔ]{3,10})\.?\s*(?:de\s+)?(\d{4})\b/);
  if (escrita) {
    const nomeMes = escrita[2] ?? "";
    const mes = MESES[nomeMes.slice(0, 4).toLowerCase()] ?? MESES[nomeMes.slice(0, 3).toLowerCase()];
    if (mes !== undefined) {
      const d = new Date(Number(escrita[3]), mes, Number(escrita[1]), hh, mm);
      return Number.isNaN(d.getTime()) ? "" : d.toISOString();
    }
  }
  return "";
}

/** Procura eventos de viagem em texto colado (email, convite, confirmação). */
export function eventosDeTexto(conteudo: string): EventoEncontrado[] {
  const linhas = conteudo
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const eventos: EventoEncontrado[] = [];
  const referenciaGeral = referenciaDe(conteudo);

  linhas.forEach((linha, i) => {
    if (!PALAVRAS_VIAGEM.test(linha)) return;
    const inicio = dataDeTexto(linha) || dataDeTexto(linhas[i + 1] ?? "");
    if (!inicio) return;
    eventos.push({
      id: `texto-${i}-${inicio}`,
      titulo: linha.slice(0, 160),
      local: "",
      inicio,
      fim: "",
      categoria: categoriaPorTexto(linha),
      origem: "texto",
      numeroVoo: numeroVooDe(linha.toUpperCase()),
      referencia: referenciaGeral,
    });
  });

  const vistos = new Set<string>();
  return eventos
    .filter((e) => {
      const chave = `${e.categoria}-${e.inicio}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

function paraLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Transforma um evento encontrado numa ficha, para reutilizar a lógica de avisos. */
export function fichaDoEvento(evento: EventoEncontrado): FichaDocumento {
  return {
    ...fichaVazia,
    categoria: evento.categoria,
    tipoDocumento: evento.titulo,
    local: evento.local,
    referencia: evento.referencia,
    numeroVoo: evento.numeroVoo,
    dataHora: paraLocal(evento.inicio),
    dataHoraFim: evento.fim ? paraLocal(evento.fim) : "",
  };
}

export function formatarEvento(iso: string, idioma: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const locale = idioma === "en" ? "en-GB" : idioma === "fr" ? "fr-FR" : "pt-PT";
  return d.toLocaleString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
