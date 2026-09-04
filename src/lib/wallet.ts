/** Geração de ficheiros de calendário (.ics) — o único formato de passe que
 * conseguimos gerar sem certificados Apple ou conta de emissor Google. */

export type ItemWallet = {
  id: string;
  titulo: string;
  descricao?: string;
  local?: string;
  inicio?: string | null;
  duracaoMin?: number;
  referencia?: string;
  url?: string;
  /** Fuso horário do evento, quando conhecido (ex.: "Europe/Lisbon"). */
  fusoHorario?: string | null;
};

export type ProntidaoWallet = {
  podeGerarCalendario: boolean;
  motivo?: string;
};

/** Opções de lembrete oferecidas ao utilizador (minutos antes do evento). */
export const LEMBRETES_WALLET = [
  { valor: 15, rotulo: "15 minutos antes" },
  { valor: 60, rotulo: "1 hora antes" },
  { valor: 120, rotulo: "2 horas antes" },
  { valor: 180, rotulo: "3 horas antes" },
  { valor: 1440, rotulo: "1 dia antes" },
  { valor: 2880, rotulo: "2 dias antes" },
] as const;

/** Cidades e aeroportos que sabemos associar a um fuso horário. */
const FUSOS_CONHECIDOS: Array<[RegExp, string]> = [
  [/lisboa|lisbon|\bLIS\b|porto|\bOPO\b|faro|\bFAO\b|portugal/i, "Europe/Lisbon"],
  [/madrid|\bMAD\b|barcelona|\bBCN\b|espanha|spain|palma|valencia|sevilha/i, "Europe/Madrid"],
  [/paris|\bCDG\b|\bORY\b|frança|france|nice|lyon/i, "Europe/Paris"],
  [/londres|london|\bLHR\b|\bLGW\b|\bSTN\b|reino unido/i, "Europe/London"],
  [/roma|rome|\bFCO\b|milão|milan|\bMXP\b|itália|italy/i, "Europe/Rome"],
  [/amesterdão|amsterdam|\bAMS\b|holanda|países baixos/i, "Europe/Amsterdam"],
  [/berlim|berlin|\bBER\b|munique|munich|alemanha|frankfurt|\bFRA\b/i, "Europe/Berlin"],
  [/bruxelas|brussels|\bBRU\b|bélgica/i, "Europe/Brussels"],
  [/nova iorque|new york|\bJFK\b|\bEWR\b|boston|miami|\bMIA\b/i, "America/New_York"],
  [/são paulo|sao paulo|\bGRU\b|rio de janeiro|\bGIG\b|brasil/i, "America/Sao_Paulo"],
  [/funchal|\bFNC\b|madeira/i, "Atlantic/Madeira"],
  [/ponta delgada|\bPDL\b|açores|azores/i, "Atlantic/Azores"],
  [/dubai|\bDXB\b/i, "Asia/Dubai"],
];

export type ResultadoFuso = {
  fuso: string;
  origem: "documento" | "local" | "dispositivo";
  explicacao: string;
};

/** Descobre o fuso do evento: do próprio documento, do local reconhecido ou, em
 * último caso, do fuso do telemóvel — sempre explicado ao utilizador. */
export function determinarFuso(item: ItemWallet): ResultadoFuso {
  if (item.fusoHorario) {
    return {
      fuso: item.fusoHorario,
      origem: "documento",
      explicacao: `Hora no fuso do documento (${item.fusoHorario}).`,
    };
  }
  const local = item.local ?? "";
  for (const [padrao, fuso] of FUSOS_CONHECIDOS) {
    if (padrao.test(local)) {
      return {
        fuso,
        origem: "local",
        explicacao: `Hora no fuso de ${local} (${fuso}), deduzido do local do documento.`,
      };
    }
  }
  const doDispositivo =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  return {
    fuso: doDispositivo || "UTC",
    origem: "dispositivo",
    explicacao: `Não conseguimos identificar o fuso do destino, por isso usamos o do seu telemóvel (${doDispositivo}). Confirme a hora no calendário se a viagem for para outro fuso.`,
  };
}

/** Um passe de calendário só faz sentido quando há data e hora fiáveis. */
export function avaliarWallet(item: ItemWallet): ProntidaoWallet {
  if (!item.inicio || Number.isNaN(new Date(item.inicio).getTime())) {
    return {
      podeGerarCalendario: false,
      motivo: "Falta a data e hora do evento. Edite a ficha do documento para a acrescentar.",
    };
  }
  if (!item.titulo.trim()) {
    return { podeGerarCalendario: false, motivo: "Falta o título do documento." };
  }
  return { podeGerarCalendario: true };
}

function p2(n: number) {
  return String(n).padStart(2, "0");
}

function paraUTC(data: Date) {
  return (
    `${data.getUTCFullYear()}${p2(data.getUTCMonth() + 1)}${p2(data.getUTCDate())}` +
    `T${p2(data.getUTCHours())}${p2(data.getUTCMinutes())}${p2(data.getUTCSeconds())}Z`
  );
}

/** Converte uma hora "de parede" (a hora escrita no bilhete) para UTC no fuso indicado. */
function paredeParaUTC(iso: string, fuso: string) {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return base;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const partes = Object.fromEntries(
      fmt.formatToParts(base).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const comoUTC = Date.UTC(
      Number(partes["year"]),
      Number(partes["month"]) - 1,
      Number(partes["day"]),
      Number(partes["hour"] === "24" ? "0" : partes["hour"]),
      Number(partes["minute"]),
      Number(partes["second"]),
    );
    const desvio = comoUTC - base.getTime();
    // A hora escrita no documento é a hora local do destino: retiramos o desvio.
    return new Date(base.getTime() - desvio + (base.getTimezoneOffset() * 60_000 - base.getTimezoneOffset() * 60_000));
  } catch {
    return base;
  }
}

function escapar(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function gerarICS(item: ItemWallet, lembretesMin: number[] = [120]) {
  const { fuso, explicacao } = determinarFuso(item);
  const inicio = paredeParaUTC(item.inicio ?? "", fuso);
  const fim = new Date(inicio.getTime() + (item.duracaoMin ?? 60) * 60_000);
  const descricao = [
    item.descricao,
    item.referencia ? `Referência: ${item.referencia}` : null,
    explicacao,
  ]
    .filter(Boolean)
    .join(" — ");

  const alarmes = (lembretesMin.length ? lembretesMin : [120]).flatMap((min) => [
    "BEGIN:VALARM",
    `TRIGGER:-PT${min >= 60 && min % 60 === 0 ? `${min / 60}H` : `${min}M`}`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapar(item.titulo)}`,
    "END:VALARM",
  ]);

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Simplesmente voo//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${item.id}@simplesmentevoo`,
    `DTSTAMP:${paraUTC(new Date())}`,
    `DTSTART:${paraUTC(inicio)}`,
    `DTEND:${paraUTC(fim)}`,
    `SUMMARY:${escapar(item.titulo)}`,
    descricao ? `DESCRIPTION:${escapar(descricao)}` : null,
    item.local ? `LOCATION:${escapar(item.local)}` : null,
    item.url ? `URL:${escapar(item.url)}` : null,
    ...alarmes,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));

  return linhas.join("\r\n");
}

export function descarregarICS(item: ItemWallet, lembretesMin: number[] = [120]) {
  const conteudo = gerarICS(item, lembretesMin);
  const blob = new Blob([conteudo], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${item.titulo.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase().slice(0, 40)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
