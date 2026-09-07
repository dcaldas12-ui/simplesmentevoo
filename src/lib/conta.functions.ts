import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Apaga definitivamente a conta do utilizador autenticado, os seus ficheiros
 * no armazenamento privado e todos os registos associados (RGPD, art. 17.º).
 */
export const apagarConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Ficheiros do utilizador (bucket privado, primeira pasta = id do utilizador)
    const { data: ficheiros } = await supabaseAdmin.storage.from("documentos").list(userId, {
      limit: 1000,
    });
    if (ficheiros?.length) {
      await supabaseAdmin.storage
        .from("documentos")
        .remove(ficheiros.map((f) => `${userId}/${f.name}`));
    }

    const tabelas = [
      "avisos",
      "preferencias_avisos",
      "push_subscricoes",
      "reservas",
      "documentos",
      "voos",
      "viagens",
      "profiles",
    ] as const;

    for (const tabela of tabelas) {
      // Algumas tabelas podem não existir em todos os ambientes: ignorar em silêncio.
      await supabaseAdmin.from(tabela).delete().eq("user_id", userId);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
