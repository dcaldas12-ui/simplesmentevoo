import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EstadoPush = {
  configurado: boolean;
  chavePublica: string | null;
  emFalta: string[];
};

export type SubscricaoPush = {
  id: string;
  endpoint: string;
  user_agent: string | null;
  ativo: boolean;
  criado_em: string;
};

function texto(v: unknown, max = 500) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

/** Diz se o servidor tem as chaves necessárias para enviar notificações push. */
export const estadoPush = createServerFn({ method: "GET" }).handler(async (): Promise<EstadoPush> => {
  const publica = process.env["VAPID_PUBLIC_KEY"] ?? "";
  const privada = process.env["VAPID_PRIVATE_JWK"] ?? "";
  const contacto = process.env["VAPID_SUBJECT"] ?? "";
  const emFalta = [
    !publica ? "VAPID_PUBLIC_KEY" : null,
    !privada ? "VAPID_PRIVATE_JWK" : null,
    !contacto ? "VAPID_SUBJECT" : null,
  ].filter((v): v is string => Boolean(v));

  return {
    configurado: emFalta.length === 0,
    chavePublica: publica || null,
    emFalta,
  };
});

/** Guarda (ou reativa) a subscrição push do dispositivo atual do utilizador. */
export const guardarSubscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const endpoint = texto(d["endpoint"]);
    const p256dh = texto(d["p256dh"], 200);
    const auth = texto(d["auth"], 200);
    if (!endpoint.startsWith("https://")) throw new Error("Subscrição inválida.");
    if (!p256dh || !auth) throw new Error("Subscrição incompleta.");
    return { endpoint, p256dh, auth, userAgent: texto(d["userAgent"], 200) || null };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscricoes").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent,
        ativo: true,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove a subscrição deste dispositivo. */
export const removerSubscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({
    endpoint: texto((data as Record<string, unknown>)?.["endpoint"]),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscricoes")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lista os dispositivos subscritos do utilizador autenticado. */
export const listarSubscricoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscricaoPush[]> => {
    const { data, error } = await context.supabase
      .from("push_subscricoes")
      .select("id, endpoint, user_agent, ativo, criado_em")
      .eq("user_id", context.userId)
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function chavesServidor() {
  const publica = process.env["VAPID_PUBLIC_KEY"];
  const jwkBruto = process.env["VAPID_PRIVATE_JWK"];
  const contacto = process.env["VAPID_SUBJECT"];
  if (!publica || !jwkBruto || !contacto) return null;

  const { ApplicationServerKeys } = await import("webpush-webcrypto");
  const jwk = JSON.parse(jwkBruto) as JsonWebKey;
  const privada = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, key_ops: ["sign"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privada);
  const base64url = btoa(String.fromCharCode(...new Uint8Array(pkcs8)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const keys = await ApplicationServerKeys.fromJSON({
    publicKey: publica,
    privateKey: base64url,
  });
  return { keys, contacto };
}

type Mensagem = { title: string; body: string; url?: string; tag?: string };

export type CategoriaPush = "reserva" | "cancelamento" | "alteracao" | "lembrete" | "teste";

export type PreferenciasPush = {
  horas_tranquilas_ativas: boolean;
  hora_silencio_inicio: number;
  hora_silencio_fim: number;
  cat_reserva: boolean;
  cat_cancelamento: boolean;
  cat_alteracao: boolean;
  cat_lembrete: boolean;
  intervalo_minimo_min: number;
  fuso_horario: string;
  ultima_notificacao: string | null;
};

const PREFS_PADRAO: PreferenciasPush = {
  horas_tranquilas_ativas: false,
  hora_silencio_inicio: 22,
  hora_silencio_fim: 8,
  cat_reserva: true,
  cat_cancelamento: true,
  cat_alteracao: true,
  cat_lembrete: true,
  intervalo_minimo_min: 0,
  fuso_horario: "Europe/Lisbon",
  ultima_notificacao: null,
};

const COLUNAS_PREFS =
  "horas_tranquilas_ativas, hora_silencio_inicio, hora_silencio_fim, cat_reserva, cat_cancelamento, cat_alteracao, cat_lembrete, intervalo_minimo_min, fuso_horario, ultima_notificacao";

function horaLocal(fuso: string) {
  try {
    return Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hour: "2-digit", hour12: false }).format(
        new Date(),
      ),
    );
  } catch {
    return new Date().getUTCHours();
  }
}

function dentroDeHorasTranquilas(p: PreferenciasPush) {
  if (!p.horas_tranquilas_ativas) return false;
  const h = horaLocal(p.fuso_horario);
  const { hora_silencio_inicio: i, hora_silencio_fim: f } = p;
  return i === f ? true : i < f ? h >= i && h < f : h >= i || h < f;
}

function categoriaPermitida(p: PreferenciasPush, categoria: CategoriaPush) {
  if (categoria === "teste") return true;
  if (categoria === "reserva") return p.cat_reserva;
  if (categoria === "cancelamento") return p.cat_cancelamento;
  if (categoria === "alteracao") return p.cat_alteracao;
  return p.cat_lembrete;
}

/** Preferências avançadas de notificações do utilizador autenticado. */
export const lerPreferenciasPush = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PreferenciasPush> => {
    const { data } = await context.supabase
      .from("preferencias_avisos")
      .select(COLUNAS_PREFS)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { ...PREFS_PADRAO, ...((data ?? {}) as Partial<PreferenciasPush>) };
  });

function limitarHora(v: unknown, padrao: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : padrao;
}

export const guardarPreferenciasPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const intervalo = Number(d["intervalo_minimo_min"] ?? 0);
    return {
      horas_tranquilas_ativas: Boolean(d["horas_tranquilas_ativas"]),
      hora_silencio_inicio: limitarHora(d["hora_silencio_inicio"], 22),
      hora_silencio_fim: limitarHora(d["hora_silencio_fim"], 8),
      cat_reserva: d["cat_reserva"] !== false,
      cat_cancelamento: d["cat_cancelamento"] !== false,
      cat_alteracao: d["cat_alteracao"] !== false,
      cat_lembrete: d["cat_lembrete"] !== false,
      intervalo_minimo_min: [0, 30, 60, 180, 720].includes(intervalo) ? intervalo : 0,
      fuso_horario: texto(d["fuso_horario"], 60) || "Europe/Lisbon",
    };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("preferencias_avisos")
      .upsert(
        { user_id: context.userId, ...data, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia uma notificação para todos os dispositivos subscritos do utilizador. */
async function enviarParaUtilizador(
  supabase: { from: (t: string) => any },
  userId: string,
  mensagem: Mensagem,
  categoria: CategoriaPush = "lembrete",
) {
  const servidor = await chavesServidor();
  if (!servidor) return { enviadas: 0, falhadas: 0, configurado: false, bloqueio: null as string | null };

  const { data: prefsBruto } = await supabase
    .from("preferencias_avisos")
    .select(COLUNAS_PREFS)
    .eq("user_id", userId)
    .maybeSingle();
  const prefs: PreferenciasPush = { ...PREFS_PADRAO, ...((prefsBruto ?? {}) as Partial<PreferenciasPush>) };

  if (!categoriaPermitida(prefs, categoria)) {
    return { enviadas: 0, falhadas: 0, configurado: true, bloqueio: "categoria" as string | null };
  }
  if (categoria !== "teste" && dentroDeHorasTranquilas(prefs)) {
    return { enviadas: 0, falhadas: 0, configurado: true, bloqueio: "horas_tranquilas" as string | null };
  }
  if (categoria !== "teste" && prefs.intervalo_minimo_min > 0 && prefs.ultima_notificacao) {
    const passou = Date.now() - new Date(prefs.ultima_notificacao).getTime();
    if (passou < prefs.intervalo_minimo_min * 60_000) {
      return { enviadas: 0, falhadas: 0, configurado: true, bloqueio: "frequencia" as string | null };
    }
  }

  const { data, error } = await supabase
    .from("push_subscricoes")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("ativo", true);
  if (error) throw new Error(error.message);

  const { generatePushHTTPRequest } = await import("webpush-webcrypto");
  let enviadas = 0;
  let falhadas = 0;

  for (const sub of (data ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>) {
    try {
      const { headers, body, endpoint } = await generatePushHTTPRequest({
        applicationServerKeys: servidor.keys,
        payload: JSON.stringify(mensagem),
        target: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        adminContact: servidor.contacto.replace("mailto:", ""),
        ttl: 3600,
        urgency: "normal",
      });
      const resposta = await fetch(endpoint, { method: "POST", headers, body });
      if (resposta.ok) {
        enviadas += 1;
      } else {
        falhadas += 1;
        if (resposta.status === 404 || resposta.status === 410) {
          await supabase.from("push_subscricoes").delete().eq("endpoint", sub.endpoint);
        }
      }
    } catch {
      falhadas += 1;
    }
  }

  if (enviadas > 0) {
    await supabase
      .from("preferencias_avisos")
      .upsert(
        { user_id: userId, ultima_notificacao: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  }

  return { enviadas, falhadas, configurado: true, bloqueio: null as string | null };
}

/** Envia uma notificação de teste para os dispositivos do próprio utilizador. */
export const enviarPushTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return enviarParaUtilizador(context.supabase, context.userId, {
      title: "Simplesmente voo",
      body: "As notificações estão a funcionar neste dispositivo.",
      url: "/avisos",
      tag: "teste",
    }, "teste");
  });

/** Envia um aviso real (lembrete ou mudança de reserva) ao próprio utilizador. */
export const enviarAvisoPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const title = texto(d["titulo"], 80) || "Simplesmente voo";
    const body = texto(d["texto"], 200);
    const url = texto(d["url"], 200);
    const cat = texto(d["categoria"], 20);
    const categoria: CategoriaPush = (
      ["reserva", "cancelamento", "alteracao", "lembrete"] as const
    ).includes(cat as never)
      ? (cat as CategoriaPush)
      : "lembrete";
    return { title, body, url: url.startsWith("/") ? url : "/avisos", categoria };
  })
  .handler(async ({ data, context }) => {
    const { categoria, ...mensagem } = data;
    return enviarParaUtilizador(context.supabase, context.userId, mensagem, categoria);
  });
