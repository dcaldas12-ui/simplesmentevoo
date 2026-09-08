// Server-only helpers for storing each app user's encrypted connector key.
import { decryptConnectionKey, encryptConnectionKey } from "./connectionKeyCrypto";

type Linha = { connection_key_ciphertext: string };

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (
    supabaseAdmin.from("app_user_connections" as never) as unknown as {
      upsert: (
        valor: Record<string, unknown>,
        opcoes: { onConflict: string },
      ) => PromiseLike<{ error: { message: string } | null }>;
    }
  ).upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw new Error(error.message);
}

export async function getConnectionKeyForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (
    supabaseAdmin.from("app_user_connections" as never) as unknown as {
      select: (colunas: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => PromiseLike<{
              data: Linha | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? decryptConnectionKey(data.connection_key_ciphertext) : null;
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (
    supabaseAdmin.from("app_user_connections" as never) as unknown as {
      delete: () => {
        eq: (c: string, v: string) => { eq: (c: string, v: string) => PromiseLike<unknown> };
      };
    }
  )
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}
