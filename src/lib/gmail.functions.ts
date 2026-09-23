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

type GmailParte = {
  filename?: string;
  mimeType?: string;
  body?: {
    data?: string;
    attachmentId?: string;
    size?: number;
  };
  parts?: GmailParte[];
};

export type GmailAnexo = {
  /** Nome original do anexo no Gmail. */
  nome: string;

  /** MIME type efetivo do anexo. */
  mimeType: string;

  /** Tamanho aproximado em bytes, quando conhecido. */
  tamanhoBytes: number | null;

  /** Conteúdo em data URL, pronto para ser enviado à análise multimodal. */
  data: string;
};

/**
 * Extrai recursivamente o texto das partes de uma mensagem Gmail.
 * O Gmail pode devolver o conteúdo em text/plain, text/html ou em partes
 * aninhadas de multipart/alternative e multipart/mixed.
 */
function extrairPartes(payload: GmailParte): string {
  const textos: string[] = [];

  function visitar(parte: GmailParte) {
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
      visitar(subparte);
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

const MAX_ANEXOS_GMAIL = 6;

/*
 * Mantemos limites prudentes no lado Gmail para não transportar para o
 * navegador ficheiros enormes que a análise multimodal atual não consegue
 * consumir. O analisador de IA tem limites próprios ainda mais explícitos.
 */
const MAX_BYTES_IMAGEM_GMAIL = 4_000_000;
const MAX_BYTES_PDF_GMAIL = 8_000_000;
const MAX_BYTES_TOTAIS_GMAIL = 16_000_000;

function mimeSuportadoParaIA(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf"
  );
}

function percorrerAnexos(
  payload: GmailParte,
): GmailParte[] {
  const encontrados: GmailParte[] = [];

  function visitar(parte: GmailParte) {
    if (
      parte.filename?.trim() &&
      parte.mimeType &&
      mimeSuportadoParaIA(parte.mimeType)
    ) {
      encontrados.push(parte);
    } else if (
      parte.body?.attachmentId &&
      parte.mimeType &&
      mimeSuportadoParaIA(parte.mimeType)
    ) {
      /*
       * Alguns emails podem não trazer filename num nível esperado, mas
       * continuam a fornecer attachmentId. Nesse caso também tentamos ler.
       */
      encontrados.push(parte);
    }

    for (const subparte of parte.parts ?? []) {
      visitar(subparte);
    }
  }

  visitar(payload);

  return encontrados;
}

function converterBase64UrlParaDataUrl(
  base64url: string,
  mimeType: string,
): {
  dataUrl: string;
  tamanhoBytes: number;
} | null {
  if (!base64url || !mimeType) {
    return null;
  }

  try {
    const buffer = Buffer.from(
      base64url,
      "base64url",
    );

    return {
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
      tamanhoBytes: buffer.length,
    };
  } catch {
    return null;
  }
}

async function extrairAnexosGmail(
  payload: GmailParte,
  messageId: string,
  callAsAppUser: (args: {
    gatewayBaseUrl: string;
    connectionAPIKey: string;
    connectorId: string;
    path: string;
  }) => Promise<Response>,
  chave: string,
): Promise<GmailAnexo[]> {
  const candidatos = percorrerAnexos(payload);

  const anexos: GmailAnexo[] = [];
  const vistos = new Set<string>();
  let bytesTotais = 0;

  for (const parte of candidatos) {
    if (anexos.length >= MAX_ANEXOS_GMAIL) {
      break;
    }

    const mimeType = parte.mimeType?.trim() ?? "";

    if (!mimeSuportadoParaIA(mimeType)) {
      continue;
    }

    const chaveUnica =
      parte.body?.attachmentId ||
      `${parte.filename ?? ""}|${mimeType}|${parte.body?.size ?? ""}`;

    if (vistos.has(chaveUnica)) {
      continue;
    }

    vistos.add(chaveUnica);

    let base64url = parte.body?.data ?? "";

    if (!base64url && parte.body?.attachmentId) {
      const anexoRes = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: chave,
        connectorId: CONNECTOR_ID,
        path:
          `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}` +
          `/attachments/${encodeURIComponent(parte.body.attachmentId)}`,
      });

      if (!anexoRes.ok) {
        let detalhe = "";

        try {
          detalhe = await anexoRes.text();
        } catch {
          detalhe = "";
        }

        console.warn(
          "Gmail: não foi possível descarregar o anexo",
          {
            messageId,
            nome: parte.filename ?? "",
            mimeType,
            attachmentId: parte.body.attachmentId,
            status: anexoRes.status,
            statusText: anexoRes.statusText,
            detalhe,
          },
        );

        continue;
      }

      const anexoJson = (await anexoRes.json()) as {
        data?: string;
        size?: number;
      };

      base64url = anexoJson.data ?? "";
    }

    const convertido = converterBase64UrlParaDataUrl(
      base64url,
      mimeType,
    );

    if (!convertido) {
      continue;
    }

    const limite =
      mimeType === "application/pdf"
        ? MAX_BYTES_PDF_GMAIL
        : MAX_BYTES_IMAGEM_GMAIL;

    if (convertido.tamanhoBytes > limite) {
      console.warn(
        "Gmail: anexo ignorado por exceder o limite para análise",
        {
          messageId,
          nome: parte.filename ?? "",
          mimeType,
          tamanhoBytes: convertido.tamanhoBytes,
          limiteBytes: limite,
        },
      );

      continue;
    }

    if (
      bytesTotais + convertido.tamanhoBytes >
      MAX_BYTES_TOTAIS_GMAIL
    ) {
      console.warn(
        "Gmail: restantes anexos ignorados por excederem o limite total",
        {
          messageId,
          limiteTotalBytes:
            MAX_BYTES_TOTAIS_GMAIL,
        },
      );

      break;
    }

    bytesTotais += convertido.tamanhoBytes;

    anexos.push({
      nome:
        parte.filename?.trim() ||
        (
          mimeType === "application/pdf"
            ? "anexo.pdf"
            : "anexo-imagem"
        ),
      mimeType,
      tamanhoBytes: convertido.tamanhoBytes,
      data: convertido.dataUrl,
    });
  }

  return anexos;
}

/**
 * Devolve candidatos Gmail para posterior classificação semântica.
 *
 * `desde` permite uma pesquisa incremental.
 * `limite` controla quantos emails podem ser recolhidos nessa chamada.
 *
 * O mesmo mecanismo é usado pela pesquisa manual e pela deteção automática.
 * O limite é controlado pelo chamador e serve apenas para controlar quantos
 * candidatos são devolvidos em cada ronda.
 */
export const emailsDeViagem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: {
      desde?: string | null;
      limite?: number | null;
      automatico?: boolean | null;
      modo?: "viagens" | "todos" | null;
      intervalos?: Array<{ inicio?: unknown; fim?: unknown }> | null;
    }) => ({
      desde:
        typeof input?.desde === "string" && input.desde.trim()
          ? input.desde.trim()
          : null,
      limite:
        typeof input?.limite === "number" &&
        Number.isFinite(input.limite)
          ? Math.max(1, Math.min(Math.floor(input.limite), 1000))
          : 100,
      automatico: input?.automatico === true,
      modo:
        input?.modo === "viagens" || input?.modo === "todos"
          ? input.modo
          : "todos",
      intervalos: Array.isArray(input?.intervalos)
        ? input.intervalos
            .filter(
              (intervalo): intervalo is { inicio: string; fim: string } =>
                Boolean(
                  intervalo &&
                    typeof intervalo === "object" &&
                    typeof (intervalo as Record<string, unknown>)["inicio"] ===
                      "string" &&
                    typeof (intervalo as Record<string, unknown>)["fim"] ===
                      "string",
                ),
            )
            .map((intervalo) => ({
              inicio: intervalo.inicio.trim(),
              fim: intervalo.fim.trim(),
            }))
            .filter((intervalo) => intervalo.inicio && intervalo.fim)
            .slice(0, 100)
        : [],
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
        remetente_email: string | null;
        recebido_em: string | null;
        anexos: GmailAnexo[];
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

      function timestampUnixSegundos(valor: string): number | null {
        const instante = new Date(valor);

        if (Number.isNaN(instante.getTime())) {
          return null;
        }

        return Math.floor(instante.getTime() / 1000);
      }

      function filtroPorIntervalos(
        intervalos: Array<{ inicio: string; fim: string }>,
      ): string {
        const partes = intervalos
          .map((intervalo) => {
            const inicio = timestampUnixSegundos(intervalo.inicio);
            const fim = timestampUnixSegundos(intervalo.fim);

            if (inicio === null || fim === null || fim < inicio) {
              return null;
            }

            /*
             * `after` é exclusivo, por isso recuamos um segundo no início.
             * `before` também é exclusivo; acrescentamos um dia ao fim quando
             * recebemos apenas uma data YYYY-MM-DD e um segundo quando já há
             * hora explícita.
             */
            const inicioSeguro = Math.max(0, inicio - 1);
            const fimTemApenasData = /^\d{4}-\d{2}-\d{2}$/.test(
              intervalo.fim,
            );
            const fimSeguro = fimTemApenasData
              ? fim + 24 * 60 * 60
              : fim + 1;

            return `after:${inicioSeguro} before:${fimSeguro}`;
          })
          .filter((parte): parte is string => Boolean(parte));

        if (partes.length === 0) {
          return "";
        }

        if (partes.length === 1) {
          return partes[0] ?? "";
        }

        return `{${partes.join(" ")}}`;
      }

      /*
       * Existem dois modos manuais distintos e a deteção automática pode
       * receber os mesmos intervalos das viagens:
       *
       * 1. `viagens`: o Gmail é usado para localizar mensagens dentro dos
       *    intervalos das viagens. O conteúdo decide depois se são ou não
       *    relevantes.
       *
       * 2. `todos`: não existe limite temporal nem pré-filtro por palavras.
       *    A pesquisa pode percorrer a caixa Gmail e a classificação final
       *    pertence à IA.
       *
       * Na deteção automática, quando o chamador fornece `intervalos`, esses
       * intervalos têm prioridade sobre a janela fixa de 7 dias. Assim, o
       * AppShell pode procurar diretamente nas janelas das viagens existentes.
       *
       * Mantemos `newer_than:7d` apenas como fallback de segurança quando a
       * deteção automática não recebe intervalos válidos.
       */
      let filtroData = "";

      if (data.automatico && data.intervalos.length > 0) {
        filtroData = filtroPorIntervalos(data.intervalos);
      } else if (data.automatico) {
        filtroData = "newer_than:7d";
      } else if (data.modo === "viagens" && data.intervalos.length > 0) {
        filtroData = filtroPorIntervalos(data.intervalos);
      } else if (data.modo === "viagens") {
        filtroData = data.desde
          ? (() => {
              const timestamp = timestampUnixSegundos(data.desde ?? "");
              return timestamp === null
                ? "newer_than:365d"
                : `after:${Math.max(0, timestamp - 1)}`;
            })()
          : "newer_than:365d";
      } else if (data.desde) {
        const timestamp = timestampUnixSegundos(data.desde);
        filtroData =
          timestamp === null
            ? ""
            : `after:${Math.max(0, timestamp - 1)}`;
      }

      /*
       * A deteção automática não usa uma expressão grande de palavras-chave.
       * A análise semântica posterior decide se cada email é realmente uma
       * comunicação de viagem.
       *
       * Quando existem intervalos de viagem, o filtro temporal é construído
       * a partir dessas janelas; quando não existem, usamos os últimos 7 dias
       * como fallback para a rotina periódica.
       *
       * Nos modos manuais: `viagens` usa os intervalos das viagens e `todos`
       * pesquisa a caixa inteira sem palavras-chave.
       */
      const consultaCompleta = filtroData;

      const consulta = encodeURIComponent(consultaCompleta);

      const limiteSolicitado =
        data.automatico
          ? Math.max(1, Math.min(Math.floor(data.limite ?? 3), 10))
          : Math.max(1, Math.min(Math.floor(data.limite ?? 100), 1000));

      const LIMITE_PAGINA_GMAIL = 500;

      console.info("Gmail: pesquisa de mensagens", {
        automatico: data.automatico === true,
        modo: data.modo,
        consulta: consultaCompleta || "(caixa Gmail inteira)",
        limite: limiteSolicitado,
        intervalos: data.intervalos.length,
      });

      /*
       * O Gmail devolve no máximo 500 mensagens por página. Percorremos tantas
       * páginas quantas forem necessárias para atingir o limite desta ronda.
       * Assim, 100 mensagens já não significa "as primeiras 100" de uma única
       * página quando o filtro tiver paginação.
       */
      const ids: string[] = [];
      let pageToken: string | null = null;

      do {
        const tokenQuery = pageToken
          ? `&pageToken=${encodeURIComponent(pageToken)}`
          : "";
        const maxResults = Math.min(
          LIMITE_PAGINA_GMAIL,
          limiteSolicitado - ids.length,
        );

        if (maxResults <= 0) {
          break;
        }

        const lista = await callAsAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: chave,
          connectorId: CONNECTOR_ID,
          path:
            `/gmail/v1/users/me/messages?maxResults=${maxResults}` +
            `&includeSpamTrash=false${consultaCompleta ? `&q=${consulta}` : ""}` +
            tokenQuery,
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
          nextPageToken?: string;
        };

        for (const mensagem of pagina.messages ?? []) {
          const id = mensagem.id;

          if (id && !ids.includes(id)) {
            ids.push(id);
          }

          if (ids.length >= limiteSolicitado) {
            break;
          }
        }

        pageToken =
          ids.length < limiteSolicitado && pagina.nextPageToken
            ? pagina.nextPageToken
            : null;
      } while (pageToken);

      const resultados: Array<{
        id: string;
        assunto: string;
        texto: string;
        remetente_email: string | null;
        recebido_em: string | null;
        anexos: GmailAnexo[];
      }> = [];

      /*
       * Ler o conteúdo completo em pequenos lotes reduz bastante o tempo total
       * da pesquisa sem criar uma rajada grande de pedidos ao Gmail.
       */
      const TAMANHO_LOTE_LEITURA = 5;

      for (
        let inicioLote = 0;
        inicioLote < ids.length;
        inicioLote += TAMANHO_LOTE_LEITURA
      ) {
        const loteIds = ids.slice(
          inicioLote,
          inicioLote + TAMANHO_LOTE_LEITURA,
        );

        const loteResultados = await Promise.all(
          loteIds.map(async (id) => {
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

              return null;
            }

            const msg = (await res.json()) as {
              snippet?: string;
              id?: string;
              internalDate?: string;
              payload?: GmailParte & {
                headers?: Array<{
                  name?: string;
                  value?: string;
                }>;
              };
            };

            const headers = msg.payload?.headers ?? [];

            const valorCabecalho = (nome: string) =>
              headers.find(
                (h) => h.name?.toLowerCase() === nome.toLowerCase(),
              )?.value?.trim() ?? "";

            const assunto = valorCabecalho("subject");
            const remetenteBruto = valorCabecalho("from");
            const remetente_email =
              remetenteBruto.match(/<([^>]+)>/)?.[1]?.trim() ||
              (remetenteBruto.includes("@") ? remetenteBruto : null);

            const dataCabecalho = valorCabecalho("date");
            const dataInterna = msg.internalDate
              ? new Date(Number(msg.internalDate))
              : null;
            const dataRececao =
              dataInterna && !Number.isNaN(dataInterna.getTime())
                ? dataInterna
                : dataCabecalho
                  ? new Date(dataCabecalho)
                  : null;
            const recebido_em =
              dataRececao && !Number.isNaN(dataRececao.getTime())
                ? dataRececao.toISOString()
                : null;

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

            const anexos = msg.payload
              ? await extrairAnexosGmail(
                  msg.payload,
                  id,
                  callAsAppUser,
                  chave,
                )
              : [];

            return {
              id,
              assunto,
              texto,
              remetente_email,
              recebido_em,
              anexos,
            };
          }),
        );

        for (const resultado of loteResultados) {
          if (resultado) {
            resultados.push(resultado);
          }
        }
      }

      return resultados;
    },
  );
