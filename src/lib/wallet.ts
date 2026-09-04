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
};

export type ProntidaoWallet = {
  podeGerarCalendario: boolean;
  motivo?: string;
};

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

function paraICS(data: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${data.getUTCFullYear()}${p(data.getUTCMonth() + 1)}${p(data.getUTCDate())}` +
    `T${p(data.getUTCHours())}${p(data.getUTCMinutes())}${p(data.getUTCSeconds())}Z`
  );
}

function escapar(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function gerarICS(item: ItemWallet) {
  const inicio = new Date(item.inicio ?? "");
  const fim = new Date(inicio.getTime() + (item.duracaoMin ?? 60) * 60_000);
  const descricao = [item.descricao, item.referencia ? `Referência: ${item.referencia}` : null]
    .filter(Boolean)
    .join(" — ");

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Simplesmente voo//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${item.id}@simplesmentevoo`,
    `DTSTAMP:${paraICS(new Date())}`,
    `DTSTART:${paraICS(inicio)}`,
    `DTEND:${paraICS(fim)}`,
    `SUMMARY:${escapar(item.titulo)}`,
    descricao ? `DESCRIPTION:${escapar(descricao)}` : null,
    item.local ? `LOCATION:${escapar(item.local)}` : null,
    item.url ? `URL:${escapar(item.url)}` : null,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapar(item.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));

  return linhas.join("\r\n");
}

export function descarregarICS(item: ItemWallet) {
  const conteudo = gerarICS(item);
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
