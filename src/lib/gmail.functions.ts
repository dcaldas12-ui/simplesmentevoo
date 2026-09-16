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

    if (!configurado) {
      return {
        configurado: false,
        ligado: false,
        email: "",
      };
    }

    const { getConnectionKeyForUser } = await import(
      "@/server/appUserConnections.server"
    );

    const chave = await getConnectionKeyForUser(
      context.userId,
      CONNECTOR_ID,
    );

    if (!chave) {
      return {
        configurado: true,
        ligado: false,
        email: "",
      };
    }

    const { callAsAppUser } = await import(
      "@/integrations/lovable/appUserConnector"
    );

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: chave,
      connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/profile",
    });

    /*
     * Não escondemos mais o erro devolvido pelo Connector.
     * Se a connection key guardada for inválida, expirada ou rejeitada,
     * precisamos de saber o HTTP status e a resposta real.
     */
    if (!res.ok) {
      let detalhe = "";

      try {
        detalhe = await res.text();
      } catch {
        detalhe = "";
      }

      console.error("Gmail Connector rejeitou a connection key:", {
        status: res.status,
        statusText: res.statusText,
        detalhe,
      });

      throw new Error(
        `Gmail Connector: HTTP ${res.status}${
          res.statusText ? ` ${res.statusText}` : ""
        }${detalhe ? ` — ${detalhe}` : ""}`,
      );
    }

    const perfil = (await res.json()) as {
      emailAddress?: string;
    };

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
      credentialsConfiguration: {
        scopes: SCOPES,
      },
    });

    return {
      authorizationUrl,
    };
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
      await exchangeAppUserOAuthCode(
        GATEWAY_BASE_URL,
        data.code,
      );

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

    return {
      ok: true,
    };
  });

/** Termina a ligação e apaga a credencial guardada. */
export const desligarGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const {
      getConnectionKeyForUser,
      deleteConnectionForUser,
    } = await import("@/server/appUserConnections.server");

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

    await deleteConnectionForUser(
      context.userId,
      CONNECTOR_ID,
    );

    return {
      ok: true,
    };
  });

type Mensagem = {
  id?: string;
};

/**
 * Extrai recursivamente o texto das partes de uma mensagem Gmail.
 * O Gmail pode devolver o conteúdo em text/plain, text/html ou em partes
 * aninhadas de multipart/alternative e multipart/mixed.
 */
function extrairPartes(payload: {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: Array<{
    mimeType?: string;
    body?: {
      data?: string;
    };
    parts?: Array<unknown>;
  }>;
}): string {
  const textos: string[] = [];

  function visitar(parte: {
    mimeType?: string;
    body?: {
      data?: string;
    };
    parts?: Array<unknown>;
  }) {
    if (parte.body?.data) {
      try {
        const decoded = Buffer.from(
          parte.body.data,
          "base64url",
        ).toString("utf-8");

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
        visitar(
          subparte as {
            mimeType?: string;
            body?: {
              data?: string;
            };
            parts?: Array<unknown>;
          },
        );
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

/**
 * Devolve candidatos Gmail para posterior classificação semântica.
 *
 * `desde` permite uma pesquisa incremental.
 * `limite` controla quantos emails podem ser recolhidos nessa chamada.
 *
 * A pesquisa manual pode usar o limite normal de 1000.
 * A deteção automática deve usar um limite pequeno, porque é executada
 * periodicamente e só precisa de procurar mensagens recentes.
 */
export const emailsDeViagem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: {
      desde?: string | null;
      limite?: number | null;
      automatico?: boolean | null;
    }) => ({
      desde:
        typeof input?.desde === "string" && input.desde.trim()
          ? input.desde.trim()
          : null,
      limite:
        typeof input?.limite === "number" &&
        Number.isFinite(input.limite)
          ? Math.max(1, Math.min(Math.floor(input.limite), 1000))
          : 1000,
      automatico: input?.automatico === true,
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      Array<{
        id: string;
        assunto: string;
        texto: string;
      }>
    > => {
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

      /*
       * A pesquisa automática NÃO usa uma marca temporal exata guardada na
       * base de dados. Uma pesquisa "after:<timestamp>" cria uma fronteira
       * frágil: se um email chegar entre duas rondas, pode ficar imediatamente
       * atrás da fronteira e nunca ser devolvido.
       *
       * No modo automático usamos uma janela móvel de 7 dias. A tabela
       * `emails_gmail_processados` é a verdadeira deduplicação, por isso podemos
       * voltar a consultar mensagens recentes sem as analisar duas vezes.
       *
       * O modo manual mantém a pesquisa incremental por data.
       */
      const filtroData = data.automatico
        ? "newer_than:7d"
        : data.desde
          ? (() => {
              const instante = new Date(data.desde);

              if (Number.isNaN(instante.getTime())) {
                return "newer_than:365d";
              }

              const timestamp = Math.max(
                0,
                Math.floor(instante.getTime() / 1000) - 60,
              );

              return `after:${timestamp}`;
            })()
          : "newer_than:365d";

      /*
       * O modo automático continua a usar uma janela móvel de 7 dias, mas
       * volta a aplicar um filtro Gmail amplo por sinais de viagem.
       *
       * Isto é intencional: o Gmail elimina antecipadamente uma grande parte
       * das mensagens evidentemente alheias a viagens, reduzindo o número de
       * emails que precisam de passar pelo Gemini e, consequentemente, o
       * consumo de quota da API. A decisão final de relevância continua a
       * pertencer ao analisarDocumento/Gemini quando este está disponível.
       *
       * O modo manual mantém o mesmo pré-filtro.
       */
      const termosViagem =
        '(reserva OR reservado OR "reserva confirmada" OR confirmacao OR confirmação OR confirmation OR booking OR reservation OR "booking reference" OR "booking confirmation" OR "confirmation number" OR PNR OR voucher OR bilhete OR ticket OR "e-ticket" OR "boarding pass" OR "cartao de embarque" OR "cartão de embarque" OR "flight number" OR "numero do voo" OR "número do voo" OR itinerario OR itinerário OR itinerary OR "check-in" OR "check-out" OR hotel OR alojamento OR transfer OR comboio OR train OR autocarro OR bus OR ferry OR "car rental" OR "aluguer de carro" OR museu OR museum OR concerto OR concert OR tour OR excursao OR excursão OR atividade OR actividade OR ingresso OR entrada)';

      const consultaCompleta = data.automatico
        ? `${filtroData} ${termosViagem}`.trim()
        : `${filtroData} ${termosViagem}`.trim();

      const consulta = encodeURIComponent(consultaCompleta);

      console.info("Gmail: pesquisa de mensagens", {
        automatico: data.automatico === true,
        consulta: consultaCompleta,
        limite: data.automatico
          ? Math.max(10, Math.min(Math.floor(data.limite ?? 20), 25))
          : data.limite !== null && data.limite !== undefined
            ? Math.max(1, Math.min(Math.floor(data.limite), 25))
            : 10,
      });

      /*
       * No modo automático limitamos cada ronda a 10 candidatos. A pesquisa
       * é repetida de forma periódica e a deduplicação é feita pelo AppShell,
       * por isso os restantes candidatos continuam disponíveis para a ronda
       * seguinte. Isto evita enviar grandes rajadas de emails para o Gemini.
       */
      const LIMITE_TOTAL = data.automatico
        ? Math.max(5, Math.min(Math.floor(data.limite ?? 10), 10))
        : data.limite !== null && data.limite !== undefined
          ? Math.max(1, Math.min(Math.floor(data.limite), 25))
          : 10;

      const lista = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: chave,
        connectorId: CONNECTOR_ID,
        path: `/gmail/v1/users/me/messages?maxResults=${LIMITE_TOTAL}&includeSpamTrash=false&q=${consulta}`,
      });

      if (!lista.ok) {
        let detalhe = "";

        try {
          detalhe = await lista.text();
        } catch {
          detalhe = "";
        }

        console.error("Gmail: falha ao listar mensagens", {
          status: lista.status,
          statusText: lista.statusText,
          detalhe,
        });

        throw new Error(
          `Não foi possível ler os emails. HTTP ${lista.status}${
            lista.statusText ? ` ${lista.statusText}` : ""
          }${detalhe ? ` — ${detalhe}` : ""}`,
        );
      }

      const pagina = (await lista.json()) as {
        messages?: Mensagem[];
      };

      const ids = (pagina.messages ?? [])
        .map((mensagem) => mensagem.id)
        .filter((id): id is string => Boolean(id));

      const resultados: Array<{
        id: string;
        assunto: string;
        texto: string;
      }> = [];

      /*
       * Lemos o conteúdo completo apenas dos candidatos que passaram
       * pela pesquisa temporal.
       */
      for (let indice = 0; indice < ids.length; indice += 1) {
        const id = ids[indice];

        if (!id) {
          continue;
        }

        /* Pequena pausa entre leituras completas para evitar rajadas. */
        if (indice > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        const res = await callAsAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: chave,
          connectorId: CONNECTOR_ID,
          path: `/gmail/v1/users/me/messages/${id}?format=full`,
        });

        if (!res.ok) {
          let detalhe = "";

          try {
            detalhe = await res.text();
          } catch {
            detalhe = "";
          }

          console.warn("Gmail: não foi possível ler a mensagem", {
            id,
            status: res.status,
            statusText: res.statusText,
            detalhe,
          });

          if (res.status === 403 || res.status === 429) {
            throw new Error(
              `Gmail atingiu um limite de utilização (HTTP ${res.status})${
                detalhe ? ` — ${detalhe}` : ""
              }. Aguarde alguns instantes antes de tentar novamente.`,
            );
          }

          continue;
        }

        const msg = (await res.json()) as {
          snippet?: string;
          id?: string;
          payload?: {
            mimeType?: string;
            body?: {
              data?: string;
            };
            parts?: Array<{
              mimeType?: string;
              body?: {
                data?: string;
              };
              parts?: Array<unknown>;
            }>;
            headers?: Array<{
              name?: string;
              value?: string;
            }>;
          };
        };

        const assunto =
          msg.payload?.headers?.find(
            (h) =>
              h.name?.toLowerCase() === "subject",
          )?.value ?? "";

        const corpo = msg.payload
          ? extrairPartes(msg.payload)
          : "";

        const texto = [
          assunto,
          corpo,
          !corpo ? msg.snippet ?? "" : "",
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 30000);

        resultados.push({
          id,
          assunto,
          texto,
        });
      }

      return resultados;
    },
  );