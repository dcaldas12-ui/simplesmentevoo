import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

/** Estado da ligação Gmail do utilizador autenticado. */
export const estadoGmail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const configurado = Boolean(process.env['GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY']);
    if (!configurado) return { configurado: false, ligado: false, email: "" };

    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const chave = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!chave) return { configurado: true, ligado: false, email: "" };

    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: chave,
      connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/profile",
    });
    if (!res.ok) return { configurado: true, ligado: false, email: "" };
    const perfil = (await res.json()) as { emailAddress?: string };
    return { configurado: true, ligado: true, email: perfil.emailAddress ?? "" };
  });

/** Inicia o consentimento OAuth do próprio utilizador para o Gmail dele. */
export const iniciarLigacaoGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientAPIKey = process.env['GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY'];
    if (!clientAPIKey) throw new Error("A ligação ao Gmail ainda não está configurada.");

    const request = getRequest();
    if (!request) throw new Error("A ligação tem de começar a partir da app.");
    const url = new URL(request.url);
    const sandboxHost =
      url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL(
      "/oauth/google-mail/return",
      sandboxHost ? `https://${sandboxHost}` : url.origin,
    ).toString();

    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const chave = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);

    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: chave ?? undefined,
      credentialsConfiguration: { scopes: SCOPES },
    });
    return { authorizationUrl };
  });

/** Troca o código único do retorno OAuth e guarda a ligação do utilizador. */
export const concluirLigacaoGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => ({ code: String(input?.code ?? "") }))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== CONNECTOR_ID) throw new Error("Ligação devolvida para o serviço errado.");
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

/** Termina a ligação e apaga a credencial guardada. */
export const desligarGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const chave = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (chave) {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      await disconnectAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: chave,
        connectorId: CONNECTOR_ID,
      });
    }
    await deleteConnectionForUser(context.userId, CONNECTOR_ID);
    return { ok: true };
  });

type Mensagem = { id?: string };

/** Devolve texto de emails recentes de viagem, para procurar eventos. */
export const emailsDeViagem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ id: string; assunto: string; texto: string }>> => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const chave = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!chave) throw new Error("Gmail não está ligado nesta conta.");

    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const consulta = encodeURIComponent(
      "newer_than:180d (voo OR flight OR reserva OR booking OR hotel OR transfer OR embarque OR boarding)",
    );
    const lista = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: chave,
      connectorId: CONNECTOR_ID,
      path: `/gmail/v1/users/me/messages?maxResults=15&q=${consulta}`,
    });
    if (!lista.ok) throw new Error("Não foi possível ler os emails.");
    const { messages = [] } = (await lista.json()) as { messages?: Mensagem[] };

    const resultados: Array<{ id: string; assunto: string; texto: string }> = [];
    for (const m of messages.slice(0, 15)) {
      if (!m.id) continue;
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: chave,
        connectorId: CONNECTOR_ID,
        path: `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`,
      });
      if (!res.ok) continue;
      const msg = (await res.json()) as {
        snippet?: string;
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      };
      const assunto =
        msg.payload?.headers?.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
      resultados.push({ id: m.id, assunto, texto: `${assunto}\n${msg.snippet ?? ""}` });
    }
    return resultados;
  });
