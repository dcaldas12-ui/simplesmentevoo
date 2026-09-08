import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Reserva = {
  id: string;
  viagem_id: string | null;
  fornecedor: string;
  estado: string;
  origem: string;
  destino: string;
  companhia: string | null;
  numero_voo: string | null;
  data_partida: string | null;
  data_regresso: string | null;
  preco: number | null;
  moeda: string;
  deeplink: string | null;
  referencia: string | null;
  notas: string | null;
  confirmada_em: string | null;
  created_at: string;
};

const CAMPOS =
  "id, viagem_id, fornecedor, estado, origem, destino, companhia, numero_voo, data_partida, data_regresso, preco, moeda, deeplink, referencia, notas, confirmada_em, created_at";

function texto(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

function data(v: unknown): string | null {
  const s = texto(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function ligacao(v: unknown): string | null {
  const s = texto(v, 2000);
  return s.startsWith("https://") ? s : null;
}

/** Reservas do utilizador, das mais recentes para as mais antigas. */
export const listarReservas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Reserva[]> => {
    const { data: linhas, error } = await context.supabase
      .from("reservas")
      .select(CAMPOS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (linhas ?? []) as Reserva[];
  });

/**
 * Regista a intenção de reservar junto do parceiro. Não faz a reserva:
 * guarda o contexto para o utilizador poder importar a confirmação no regresso.
 */
export const iniciarReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((entrada: unknown) => {
    const d = (entrada ?? {}) as Record<string, unknown>;
    const origem = texto(d["origem"], 10).toUpperCase();
    const destino = texto(d["destino"], 10).toUpperCase();
    if (!origem || !destino) throw new Error("Indique a origem e o destino.");
    return {
      viagem_id: d["viagemId"] ? texto(d["viagemId"], 40) : null,
      fornecedor: texto(d["fornecedor"], 60) || "",
      origem,
      destino,
      companhia: d["companhia"] ? texto(d["companhia"], 120) : null,
      numero_voo: d["numeroVoo"] ? texto(d["numeroVoo"], 20) : null,
      data_partida: data(d["dataPartida"]),
      data_regresso: data(d["dataRegresso"]),
      preco: Number.isFinite(Number(d["preco"])) ? Number(d["preco"]) : null,
      moeda: texto(d["moeda"], 3).toUpperCase() || "EUR",
      deeplink: ligacao(d["deeplink"]),
    };
  })
  .handler(async ({ data: valores, context }): Promise<Reserva> => {
    const { data: linha, error } = await context.supabase
      .from("reservas")
      .insert({ ...valores, user_id: context.userId, estado: "iniciada" })
      .select(CAMPOS)
      .single();
    if (error) throw new Error(error.message);
    return linha as Reserva;
  });

/** Importa a confirmação recebida do parceiro (referência, preço final, notas). */
export const confirmarReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((entrada: unknown) => {
    const d = (entrada ?? {}) as Record<string, unknown>;
    const id = texto(d["id"], 40);
    if (!id) throw new Error("Reserva não identificada.");
    const referencia = texto(d["referencia"], 40).toUpperCase();
    if (!referencia) throw new Error("Indique a referência da reserva do parceiro.");
    return {
      id,
      referencia,
      preco: Number.isFinite(Number(d["preco"])) && Number(d["preco"]) > 0 ? Number(d["preco"]) : null,
      notas: d["notas"] ? texto(d["notas"], 500) : null,
    };
  })
  .handler(async ({ data: valores, context }): Promise<Reserva> => {
    const { data: linha, error } = await context.supabase
      .from("reservas")
      .update({
        estado: "confirmada",
        referencia: valores.referencia,
        ...(valores.preco !== null ? { preco: valores.preco } : {}),
        notas: valores.notas,
        confirmada_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", valores.id)
      .eq("user_id", context.userId)
      .select(CAMPOS)
      .single();
    if (error) throw new Error(error.message);
    return linha as Reserva;
  });

/** Marca a reserva como cancelada/abandonada, sem apagar o histórico. */
export const cancelarReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((entrada: unknown) => {
    const id = texto((entrada as Record<string, unknown>)?.["id"], 40);
    if (!id) throw new Error("Reserva não identificada.");
    return { id };
  })
  .handler(async ({ data: valores, context }) => {
    const { error } = await context.supabase
      .from("reservas")
      .update({ estado: "cancelada", updated_at: new Date().toISOString() })
      .eq("id", valores.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
