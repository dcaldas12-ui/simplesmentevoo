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


type GmailPesquisaInfo = {
  modo: "viagens" | "todos";
  periodo_inicio: string | null;
  periodo_fim: string | null;
  blocos_consultados: number;
  blocos_completos: number;
  mensagens_listadas: number;
  mensagens_metadados: number;
  mensagens_selecionadas: number;
  candidatos_devolvidos: number;
  pesquisa_completa: boolean;
  limite_candidatos: number;
  candidatos_novos?: number;
};

export const emailsDeViagem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: {
      desde?: string | null;
      limite?: number | null;
      automatico?: boolean | null;
      modo?: "viagens" | "todos" | null;
      intervalos?: Array<{ inicio?: unknown; fim?: unknown }> | null;
      incluirInfoPesquisa?: boolean | null;
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
      incluirInfoPesquisa: input?.incluirInfoPesquisa === true,
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
        pesquisa?: GmailPesquisaInfo;
        pesquisaApenas?: boolean;
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

      // Criamos uma variável explicitamente não nula para usar nas funções
      // internas. O TypeScript não mantém o narrowing de `chave` quando ela é
      // capturada por closures assíncronas.
      const connectionAPIKey: string = chave;

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

      function dataIso(valor: number): string {
        return new Date(valor * 1000).toISOString().slice(0, 10);
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

      type IntervaloUnix = {
        inicio: number;
        fim: number;
      };

      type MensagemMetadado = {
        id: string;
        assunto: string;
        remetente_email: string | null;
        recebido_em: string | null;
        snippet: string;
        bloco: number;
      };

      const DURACAO_BLOCO_PESQUISA_MS = 31 * 24 * 60 * 60 * 1000;
      const MAX_IDS_HISTORICOS_POR_BLOCO = 2000;
      const MAX_CANDIDATOS_HISTORICOS = 60;
      const MAX_METADADOS_HISTORICOS_POR_BLOCO = 30;
      const MIN_CANDIDATOS_HISTORICOS_POR_BLOCO = 2;
      const TAMANHO_LOTE_METADADOS = 5;
      const TAMANHO_LOTE_LEITURA = 5;
      const LIMITE_PAGINA_GMAIL = 500;

      function intervalosUnixParaPesquisaHistorica(
        intervalos: Array<{ inicio: string; fim: string }>,
      ): IntervaloUnix[] {
        const intervalosValidos = intervalos
          .map((intervalo) => {
            const inicio = timestampUnixSegundos(intervalo.inicio);
            const fimBase = timestampUnixSegundos(intervalo.fim);

            if (
              inicio === null ||
              fimBase === null ||
              fimBase < inicio
            ) {
              return null;
            }

            /*
             * Trabalhamos internamente com `fim` exclusivo. Isto permite
             * dividir a janela em blocos sem perder o último segundo/dia.
             */
            const fimTemApenasData = /^\d{4}-\d{2}-\d{2}$/.test(
              intervalo.fim,
            );

            const fim = fimTemApenasData
              ? fimBase + 24 * 60 * 60
              : fimBase + 1;

            return {
              inicio: Math.max(0, inicio),
              fim,
            };
          })
          .filter(
            (intervalo): intervalo is IntervaloUnix =>
              Boolean(intervalo),
          );

        intervalosValidos.sort((a, b) => a.inicio - b.inicio);

        /*
         * As viagens podem gerar janelas sobrepostas. Unimo-las antes de
         * dividir em blocos para não pesquisar o mesmo período várias vezes.
         */
        const intervalosUnidos: IntervaloUnix[] = [];

        for (const intervalo of intervalosValidos) {
          const anterior = intervalosUnidos[intervalosUnidos.length - 1];

          if (!anterior || intervalo.inicio > anterior.fim) {
            intervalosUnidos.push({ ...intervalo });
            continue;
          }

          anterior.fim = Math.max(anterior.fim, intervalo.fim);
        }

        return intervalosUnidos.flatMap((intervalo) => {
          const blocos: IntervaloUnix[] = [];
          let inicio = intervalo.inicio;

          while (inicio < intervalo.fim) {
            const fim = Math.min(
              intervalo.fim,
              inicio + DURACAO_BLOCO_PESQUISA_MS,
            );

            blocos.push({
              inicio,
              fim,
            });

            inicio = fim;
          }

          return blocos;
        });
      }

      function extrairCabecalho(
        headers: Array<{ name?: string; value?: string }>,
        nome: string,
      ): string {
        return (
          headers.find(
            (header) =>
              header.name?.toLowerCase() === nome.toLowerCase(),
          )?.value?.trim() ?? ""
        );
      }

      function emailDoRemetente(valor: string): string | null {
        return (
          valor.match(/<([^>]+)>/)?.[1]?.trim() ||
          (valor.includes("@") ? valor : null)
        );
      }

      function scoreMetadado(metadado: MensagemMetadado): number {
        const normalizar = (valor: string) =>
          valor
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();

        const assunto = normalizar(metadado.assunto);
        const snippet = normalizar(metadado.snippet);
        const remetente = normalizar(metadado.remetente_email ?? "");

        const termos: Array<[string, number]> = [
          ["booking confirmation", 8],
          ["booking", 7],
          ["reservation", 7],
          ["reserva", 7],
          ["confirmacao", 7],
          ["confirmation", 7],
          ["voucher", 6],
          ["boarding pass", 6],
          ["cartao de embarque", 6],
          ["ticket", 5],
          ["bilhete", 5],
          ["flight", 5],
          ["voo", 5],
          ["hotel", 5],
          ["alojamento", 5],
          ["check-in", 4],
          ["check-out", 4],
          ["itinerary", 4],
          ["itinerario", 4],
          ["transfer", 4],
          ["train", 4],
          ["comboio", 4],
          ["bus", 3],
          ["autocarro", 3],
          ["ferry", 3],
          ["rental", 3],
          ["car hire", 3],
          ["tour", 2],
          ["museum", 2],
          ["museu", 2],
          ["concert", 2],
          ["concerto", 2],
        ];

        let pontuacao = 0;

        for (const [termo, pontos] of termos) {
          if (assunto.includes(termo)) {
            pontuacao += pontos;
          }

          if (snippet.includes(termo)) {
            pontuacao += Math.max(1, Math.floor(pontos / 2));
          }

          if (remetente.includes(termo)) {
            pontuacao += Math.max(1, Math.floor(pontos / 2));
          }
        }

        if (metadado.assunto.trim()) {
          pontuacao += 1;
        }

        if (metadado.snippet.trim()) {
          pontuacao += 1;
        }

        return pontuacao;
      }

      function selecionarIdsRepresentativos(
        ids: string[],
        limite: number,
      ): string[] {
        if (ids.length <= limite) {
          return [...ids];
        }

        const selecionados = new Set<string>();

        const adicionar = (id: string | undefined) => {
          if (id) {
            selecionados.add(id);
          }
        };

        const extremos = Math.min(
          Math.floor(limite / 3),
          Math.max(1, Math.floor(ids.length / 10)),
        );

        for (let i = 0; i < extremos; i += 1) {
          adicionar(ids[i]);
          adicionar(ids[ids.length - 1 - i]);
        }

        let indice = 0;
        while (selecionados.size < limite && indice < ids.length) {
          const posicao = Math.floor(
            (indice * (ids.length - 1)) /
              Math.max(1, limite - 1),
          );

          adicionar(ids[posicao]);
          indice += 1;
        }

        return Array.from(selecionados).slice(0, limite);
      }

      async function listarIds(
        consulta: string,
        limite: number,
      ): Promise<{
        ids: string[];
        completo: boolean;
      }> {
        const ids: string[] = [];
        const idsLocais = new Set<string>();
        let pageToken: string | null = null;
        let completo = true;

        do {
          const maxResults = Math.min(
            LIMITE_PAGINA_GMAIL,
            limite - ids.length,
          );

          if (maxResults <= 0) {
            completo = false;
            break;
          }

          const tokenQuery = pageToken
            ? `&pageToken=${encodeURIComponent(pageToken)}`
            : "";
          const consultaCodificada = encodeURIComponent(consulta);

          const lista = await callAsAppUser({
            gatewayBaseUrl: GATEWAY_BASE_URL,
            connectionAPIKey,
            connectorId: CONNECTOR_ID,
            path:
              `/gmail/v1/users/me/messages?maxResults=${maxResults}` +
              `&includeSpamTrash=false${consulta ? `&q=${consultaCodificada}` : ""}` +
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
              consulta,
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

            if (!id || idsLocais.has(id)) {
              continue;
            }

            idsLocais.add(id);
            ids.push(id);

            if (ids.length >= limite) {
              break;
            }
          }

          if (ids.length >= limite) {
            completo = !pagina.nextPageToken;
            break;
          }

          pageToken = pagina.nextPageToken ?? null;
        } while (pageToken);

        return {
          ids,
          completo,
        };
      }

      async function obterMetadados(
        ids: string[],
        bloco: number,
      ): Promise<MensagemMetadado[]> {
        const resultados: MensagemMetadado[] = [];

        for (
          let inicioLote = 0;
          inicioLote < ids.length;
          inicioLote += TAMANHO_LOTE_METADADOS
        ) {
          const loteIds = ids.slice(
            inicioLote,
            inicioLote + TAMANHO_LOTE_METADADOS,
          );

          const loteResultados = await Promise.all(
            loteIds.map(async (id) => {
              const res = await callAsAppUser({
                gatewayBaseUrl: GATEWAY_BASE_URL,
                connectionAPIKey,
                connectorId: CONNECTOR_ID,
                path:
                  `/gmail/v1/users/me/messages/${encodeURIComponent(id)}` +
                  `?format=metadata&metadataHeaders=Subject` +
                  `&metadataHeaders=From&metadataHeaders=Date`,
              });

              if (!res.ok) {
                let detalhe = "";

                try {
                  detalhe = await res.text();
                } catch {
                  detalhe = "";
                }

                console.warn(
                  "Gmail: não foi possível ler os metadados da mensagem",
                  {
                    id,
                    bloco,
                    status: res.status,
                    statusText: res.statusText,
                    detalhe,
                  },
                );

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
                id?: string;
                snippet?: string;
                internalDate?: string;
                payload?: {
                  headers?: Array<{
                    name?: string;
                    value?: string;
                  }>;
                };
              };

              const headers = msg.payload?.headers ?? [];
              const assunto = extrairCabecalho(headers, "subject");
              const remetenteBruto = extrairCabecalho(headers, "from");
              const remetente_email = emailDoRemetente(remetenteBruto);
              const dataCabecalho = extrairCabecalho(headers, "date");
              const dataInterna = msg.internalDate
                ? new Date(Number(msg.internalDate))
                : null;
              const dataRececao =
                dataInterna && !Number.isNaN(dataInterna.getTime())
                  ? dataInterna
                  : dataCabecalho
                    ? new Date(dataCabecalho)
                    : null;

              return {
                id,
                assunto,
                remetente_email,
                recebido_em:
                  dataRececao && !Number.isNaN(dataRececao.getTime())
                    ? dataRececao.toISOString()
                    : null,
                snippet: msg.snippet ?? "",
                bloco,
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
      }

      const pesquisaHistorica =
        !data.automatico &&
        data.modo === "viagens" &&
        data.intervalos.length > 0;

      const blocosHistoricos = pesquisaHistorica
        ? intervalosUnixParaPesquisaHistorica(data.intervalos)
        : [];

      const filtroData =
        data.automatico && data.intervalos.length > 0
          ? filtroPorIntervalos(data.intervalos)
          : data.automatico
            ? "newer_than:7d"
            : data.modo === "viagens" && data.intervalos.length > 0
              ? filtroPorIntervalos(data.intervalos)
              : data.modo === "viagens"
                ? data.desde
                  ? (() => {
                      const timestamp = timestampUnixSegundos(
                        data.desde ?? "",
                      );
                      return timestamp === null
                        ? "newer_than:365d"
                        : `after:${Math.max(0, timestamp - 1)}`;
                    })()
                  : "newer_than:365d"
                : data.desde
                  ? (() => {
                      const timestamp = timestampUnixSegundos(data.desde ?? "");
                      return timestamp === null
                        ? ""
                        : `after:${Math.max(0, timestamp - 1)}`;
                    })()
                  : "";

      const limiteSolicitado = data.automatico
        ? Math.max(1, Math.min(Math.floor(data.limite ?? 3), 10))
        : Math.max(1, Math.min(Math.floor(data.limite ?? 100), 1000));

      const limiteHistorico = Math.min(
        limiteSolicitado,
        MAX_CANDIDATOS_HISTORICOS,
      );

      const ids: string[] = [];
      const idsVistos = new Set<string>();

      let mensagensListadas = 0;
      let blocosCompletos = 0;
      let mensagensMetadados = 0;
      let mensagensSelecionadas = 0;
      let pesquisaCompleta = true;

      const metadadosHistoricos: MensagemMetadado[] = [];

      if (pesquisaHistorica) {
        for (let indice = 0; indice < blocosHistoricos.length; indice += 1) {
          const bloco = blocosHistoricos[indice];

          if (!bloco) {
            continue;
          }

          const consultaBloco =
            `after:${Math.max(0, bloco.inicio - 1)} before:${bloco.fim}`;

          const lista = await listarIds(
            consultaBloco,
            MAX_IDS_HISTORICOS_POR_BLOCO,
          );

          mensagensListadas += lista.ids.length;
          if (lista.completo) {
            blocosCompletos += 1;
          } else {
            pesquisaCompleta = false;
          }

          const idsRepresentativos = selecionarIdsRepresentativos(
            lista.ids,
            MAX_METADADOS_HISTORICOS_POR_BLOCO,
          );

          const metadados = await obterMetadados(
            idsRepresentativos,
            indice,
          );

          mensagensMetadados += metadados.length;
          metadadosHistoricos.push(...metadados);
        }
      } else {
        const lista = await listarIds(filtroData, limiteSolicitado);

        mensagensListadas = lista.ids.length;
        pesquisaCompleta = lista.completo;
        if (lista.completo) {
          blocosCompletos = 1;
        }

        for (const id of lista.ids) {
          if (!idsVistos.has(id)) {
            idsVistos.add(id);
            ids.push(id);
          }
        }

        mensagensSelecionadas = ids.length;
      }

      if (pesquisaHistorica) {
        const porBloco = new Map<number, MensagemMetadado[]>();

        for (const metadado of metadadosHistoricos) {
          const lista = porBloco.get(metadado.bloco) ?? [];
          lista.push(metadado);
          porBloco.set(metadado.bloco, lista);
        }

        for (const lista of porBloco.values()) {
          lista.sort((a, b) => {
            const scoreA = scoreMetadado(a);
            const scoreB = scoreMetadado(b);

            if (scoreB !== scoreA) {
              return scoreB - scoreA;
            }

            return (b.recebido_em ?? "").localeCompare(
              a.recebido_em ?? "",
            );
          });
        }

        const selecionadosMetadados: MensagemMetadado[] = [];
        const idsSelecionados = new Set<string>();

        /*
         * Primeiro garantimos cobertura temporal: cada bloco contribui com
         * pelo menos dois candidatos sempre que existirem metadados nesse bloco.
         */
        for (const [bloco, lista] of porBloco.entries()) {
          const quantidade = Math.min(
            MIN_CANDIDATOS_HISTORICOS_POR_BLOCO,
            limiteHistorico - selecionadosMetadados.length,
          );

          for (let indice = 0; indice < quantidade; indice += 1) {
            const metadado = lista[indice];

            if (!metadado || idsSelecionados.has(metadado.id)) {
              continue;
            }

            idsSelecionados.add(metadado.id);
            selecionadosMetadados.push(metadado);
          }

          if (selecionadosMetadados.length >= limiteHistorico) {
            break;
          }
        }

        const restantes = [...metadadosHistoricos]
          .filter((metadado) => !idsSelecionados.has(metadado.id))
          .sort((a, b) => {
            const scoreA = scoreMetadado(a);
            const scoreB = scoreMetadado(b);

            if (scoreB !== scoreA) {
              return scoreB - scoreA;
            }

            return (b.recebido_em ?? "").localeCompare(
              a.recebido_em ?? "",
            );
          });

        for (const metadado of restantes) {
          if (selecionadosMetadados.length >= limiteHistorico) {
            break;
          }

          if (idsSelecionados.has(metadado.id)) {
            continue;
          }

          idsSelecionados.add(metadado.id);
          selecionadosMetadados.push(metadado);
        }

        for (const metadado of selecionadosMetadados) {
          if (!idsVistos.has(metadado.id)) {
            idsVistos.add(metadado.id);
            ids.push(metadado.id);
          }
        }

        mensagensSelecionadas = ids.length;
      }

      const datasInicio = data.intervalos
        .map((intervalo) => timestampUnixSegundos(intervalo.inicio))
        .filter((valor): valor is number => valor !== null);

      const datasFim = data.intervalos
        .map((intervalo) => timestampUnixSegundos(intervalo.fim))
        .filter((valor): valor is number => valor !== null);

      const periodoInicio =
        datasInicio.length > 0
          ? dataIso(Math.min(...datasInicio))
          : null;

      const periodoFim =
        datasFim.length > 0
          ? dataIso(Math.max(...datasFim))
          : null;

      const pesquisaInfo: GmailPesquisaInfo = {
        modo: data.modo,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        blocos_consultados: pesquisaHistorica
          ? blocosHistoricos.length
          : 1,
        blocos_completos:
          pesquisaHistorica || filtroData
            ? blocosCompletos
            : 0,
        mensagens_listadas: mensagensListadas,
        mensagens_metadados: mensagensMetadados,
        mensagens_selecionadas: mensagensSelecionadas,
        candidatos_devolvidos: 0,
        pesquisa_completa: pesquisaCompleta,
        limite_candidatos: pesquisaHistorica
          ? limiteHistorico
          : limiteSolicitado,
      };

      console.info("Gmail: resultado da pesquisa", pesquisaInfo);

      /*
       * Ler o conteúdo completo apenas dos candidatos finais.
       * A pesquisa histórica usa metadados e cobertura temporal para evitar
       * descarregar centenas de mensagens completas de uma só vez.
       */
      const resultados: Array<{
        id: string;
        assunto: string;
        texto: string;
        remetente_email: string | null;
        recebido_em: string | null;
        anexos: GmailAnexo[];
        pesquisa?: GmailPesquisaInfo;
        pesquisaApenas?: boolean;
      }> = [];

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
              extrairCabecalho(headers, nome);

            const assunto = valorCabecalho("subject");
            const remetenteBruto = valorCabecalho("from");
            const remetente_email = emailDoRemetente(remetenteBruto);

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

      pesquisaInfo.candidatos_devolvidos = resultados.length;

      const pesquisaDecorada = resultados.map((resultado) => ({
        ...resultado,
        pesquisa: pesquisaInfo,
      }));

      if (
        pesquisaDecorada.length === 0 &&
        data.incluirInfoPesquisa &&
        !data.automatico
      ) {
        return [
          {
            id: "__pesquisa__",
            assunto: "",
            texto: "",
            remetente_email: null,
            recebido_em: null,
            anexos: [],
            pesquisa: pesquisaInfo,
            pesquisaApenas: true,
          },
        ];
      }

      return pesquisaDecorada;
    },
  );
