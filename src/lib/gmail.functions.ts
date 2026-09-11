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
    const configurado = Boolean(
      process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"],
    );
    if (!configurado) return { configurado: false, ligado: false, email: "" };

    const { getConnectionKeyForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const chave = await getConnectionKeyForUser(
      context.userId,
      CONNECTOR_ID,
    );
    if (!chave) return { configurado: true, ligado: false, email: "" };

    const { callAsAppUser } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: chave,
      connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/profile",
    });
    if (!res.ok) return { configurado: true, ligado: false, email: "" };
    const perfil = (await res.json()) as { emailAddress?: string };
    return {
      configurado: true,
      ligado: true,
      email: perfil.emailAddress ?? "",
    };
  });

/** Inicia o consentimento OAuth do próprio utilizador para o Gmail dele. */
export const iniciarLigacaoGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientAPIKey =
      process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientAPIKey) {
      throw new Error("A ligação ao Gmail ainda não está configurada.");
    }

    const request = getRequest();
    if (!request) {
      throw new Error("A ligação tem de começar a partir da app.");
    }

    const url = new URL(request.url);
    const sandboxHost =
      url.hostname === "localhost"
        ? request.headers.get("x-forwarded-host")
        : null;

    const returnUrl = new URL(
      "/oauth/google-mail/return",
      sandboxHost ? `https://${sandboxHost}` : url.origin,
    ).toString();

    const { getConnectionKeyForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const chave = await getConnectionKeyForUser(
      context.userId,
      CONNECTOR_ID,
    );

    const { authorizeAppUserOAuth } = await import(
      "@/integrations/lovable/appUserConnector"
    );
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
  .inputValidator((input: { code: string }) => ({
    code: String(input?.code ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { connectionAPIKey, connectorId } =
      await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);

    if (connectorId !== CONNECTOR_ID) {
      throw new Error("Ligação devolvida para o serviço errado.");
    }

    const { saveConnectionKeyForUser } = await import(
      "@/server/appUserConnections.server"
    );
    await saveConnectionKeyForUser(
      context.userId,
      connectorId,
      connectionAPIKey,
    );

    return { ok: true };
  });

/** Termina a ligação e apaga a credencial guardada. */
export const desligarGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionForUser } =
      await import("@/server/appUserConnections.server");

    const chave = await getConnectionKeyForUser(
      context.userId,
      CONNECTOR_ID,
    );

    if (chave) {
      const { disconnectAppUser } = await import(
        "@/integrations/lovable/appUserConnector"
      );
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

/**
 * Extrai recursivamente o texto das partes de uma mensagem Gmail.
 * O Gmail pode devolver o conteúdo em text/plain, text/html ou em partes
 * aninhadas de multipart/alternative e multipart/mixed.
 */
function extrairPartes(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{
    mimeType?: string;
    body?: { data?: string };
    parts?: Array<unknown>;
  }>;
}): string {
  const textos: string[] = [];

  function visitar(parte: {
    mimeType?: string;
    body?: { data?: string };
    parts?: Array<unknown>;
  }) {
    if (parte.body?.data) {
      try {
        const decoded = Buffer.from(parte.body.data, "base64url").toString(
          "utf-8",
        );

        if (parte.mimeType === "text/plain") {
          textos.push(decoded);
        } else if (parte.mimeType === "text/html") {
          const semScripts = decoded
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ");

          const textoHtml = semScripts
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/gi, '"')
            .replace(/[ \t]+/g, " ")
            .replace(/\n\s*\n+/g, "\n")
            .trim();

          if (textoHtml) {
            textos.push(textoHtml);
          }
        }
      } catch {
        // Ignora uma parte que não possa ser descodificada.
      }
    }

    for (const subparte of parte.parts ?? []) {
      if (subparte && typeof subparte === "object") {
        visitar(subparte as {
          mimeType?: string;
          body?: { data?: string };
          parts?: Array<unknown>;
        });
      }
    }
  }

  visitar(payload);

  return textos
    .join("\n\n")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 30000);
}

/** Devolve emails de viagem recentes, opcionalmente apenas depois de uma data. */
export const emailsDeViagem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { desde?: string | null }) => ({
    desde:
      typeof input?.desde === "string" && input.desde.trim()
        ? input.desde.trim()
        : null,
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<Array<{ id: string; assunto: string; texto: string }>> => {
      const { getConnectionKeyForUser } = await import(
        "@/server/appUserConnections.server"
      );

      const chave = await getConnectionKeyForUser(
        context.userId,
        CONNECTOR_ID,
      );

      if (!chave) {
        throw new Error("Gmail não está ligado nesta conta.");
      }

      const { callAsAppUser } = await import(
        "@/integrations/lovable/appUserConnector"
      );

      const termos =
        '(reserva OR reservado OR confirmacao OR confirmation OR booking OR "booking code" OR PNR OR voucher OR bilhete OR ticket OR itinerary OR itinerario OR flight OR voo OR boarding OR "check-in" OR hotel OR alojamento OR transfer OR train OR comboio OR bus OR autocarro OR ferry OR museu OR museum OR concerto OR concert OR espetaculo OR espectáculo OR teatro OR tour OR excursao OR atividade OR attraction OR entrada)';

      const filtroData = data.desde
        ? `after:${Math.floor(new Date(data.desde).getTime() / 1000)}`
        : "newer_than:365d";

      const consulta = encodeURIComponent(`${filtroData} ${termos}`);

      const lista = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: chave,
        connectorId: CONNECTOR_ID,
        path: `/gmail/v1/users/me/messages?maxResults=100&q=${consulta}`,
      });

      if (!lista.ok) {
        throw new Error("Não foi possível ler os emails.");
      }

      const { messages = [] } = (await lista.json()) as {
        messages?: Mensagem[];
      };

      const resultados: Array<{
        id: string;
        assunto: string;
        texto: string;
      }> = [];

      for (const m of messages.slice(0, 100)) {
        if (!m.id) continue;

        const res = await callAsAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: chave,
          connectorId: CONNECTOR_ID,
          path: `/gmail/v1/users/me/messages/${m.id}?format=full`,
        });

        if (!res.ok) continue;

        const msg = (await res.json()) as {
          snippet?: string;
          id?: string;
          payload?: {
            mimeType?: string;
            body?: { data?: string };
            parts?: Array<{
              mimeType?: string;
              body?: { data?: string };
              parts?: Array<unknown>;
            }>;
            headers?: Array<{ name?: string; value?: string }>;
          };
        };

        const assunto =
          msg.payload?.headers?.find(
            (h) => h.name?.toLowerCase() === "subject",
          )?.value ?? "";

        const corpo = msg.payload ? extrairPartes(msg.payload) : "";

        const texto = [
          assunto,
          corpo,
          !corpo ? msg.snippet ?? "" : "",
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 30000);

        resultados.push({
          id: m.id,
          assunto,
          texto,
        });
      }

      return resultados;
    },
  );
