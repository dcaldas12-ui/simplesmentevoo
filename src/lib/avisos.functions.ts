import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AvisoGuardado = {
  id: string;
  viagem_id: string | null;
  documento_id: string | null;
  tipo: string;
  titulo: string;
  local: string | null;
  quando: string;
  antecipacao_min: number;
  ativo: boolean;
  origem: string | null;
};

function texto(v: unknown, max = 200) {
  return String(v ?? "").trim().slice(0, max);
}

function antecipacao(v: unknown) {
  const n = Math.round(Number(v ?? 60) || 60);
  return Math.max(0, Math.min(7 * 24 * 60, n));
}

/** Lista os avisos do utilizador, do mais próximo para o mais distante. */
export const listarAvisos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AvisoGuardado[]> => {
    const { data, error } = await context.supabase
      .from("avisos")
      .select("id, viagem_id, documento_id, tipo, titulo, local, quando, antecipacao_min, ativo, origem")
      .eq("user_id", context.userId)
      .order("quando", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

function validarAviso(data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>;
  const quando = texto(d["quando"], 40);
  if (!quando || Number.isNaN(new Date(quando).getTime())) {
    throw new Error("Indique uma data e hora válidas para o aviso.");
  }
  const titulo = texto(d["titulo"]);
  if (!titulo) throw new Error("Indique o título do aviso.");
  return {
    id: d["id"] ? texto(d["id"], 40) : null,
    viagem_id: d["viagemId"] ? texto(d["viagemId"], 40) : null,
    documento_id: d["documentoId"] ? texto(d["documentoId"], 40) : null,
    tipo: texto(d["tipo"], 40) || "outro",
    titulo,
    local: d["local"] ? texto(d["local"]) : null,
    quando: new Date(quando).toISOString(),
    antecipacao_min: antecipacao(d["antecipacaoMin"]),
    ativo: d["ativo"] === undefined ? true : Boolean(d["ativo"]),
    origem: d["origem"] ? texto(d["origem"]) : null,
  };
}

/** Cria ou atualiza um aviso do utilizador autenticado. */
export const guardarAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarAviso)
  .handler(async ({ context, data }): Promise<AvisoGuardado> => {
    const { id, ...campos } = data;
    const registo = { ...campos, user_id: context.userId, updated_at: new Date().toISOString() };
    const consulta = id
      ? context.supabase.from("avisos").update(registo).eq("id", id).eq("user_id", context.userId)
      : context.supabase.from("avisos").insert(registo);
    const { data: linha, error } = await consulta
      .select("id, viagem_id, documento_id, tipo, titulo, local, quando, antecipacao_min, ativo, origem")
      .single();
    if (error) throw new Error(error.message);
    return linha;
  });

export const apagarAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ id: texto((data as Record<string, unknown>)?.["id"], 40) }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("avisos")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Preferências gerais de avisos (antecipação padrão, push). */
export const obterPreferenciasAvisos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("preferencias_avisos")
      .select("avisos_ativos, antecipacao_padrao_min, push_ativado")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { avisos_ativos: true, antecipacao_padrao_min: 60, push_ativado: false };
  });

export const guardarPreferenciasAvisos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      avisos_ativos: d["avisosAtivos"] === undefined ? true : Boolean(d["avisosAtivos"]),
      antecipacao_padrao_min: antecipacao(d["antecipacaoPadraoMin"]),
      push_ativado: Boolean(d["pushAtivado"]),
    };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("preferencias_avisos")
      .upsert(
        { ...data, user_id: context.userId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
