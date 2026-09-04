import { createServerFn } from "@tanstack/react-start";

import { fichaVazia, type FichaDocumento } from "./documentos";

export type AnaliseDocumentoInput = {
  /** Nome do ficheiro ou assunto do email. */
  nome: string;
  /** Texto conhecido do documento (corpo do email, conteúdo do QR, notas). */
  texto?: string | null;
  /** Imagem em data URL (image/*) para leitura visual, quando existir. */
  imagem?: string | null;
};

export type AnaliseDocumentoResultado = {
  ficha: FichaDocumento;
  /** true quando a extração foi feita por IA; false quando foi heurística local. */
  porIa: boolean;
  nota: string;
};

function validar(data: unknown): AnaliseDocumentoInput {
  const d = (data ?? {}) as Record<string, unknown>;
  const nome = String(d["nome"] ?? "").trim().slice(0, 200);
  if (!nome) throw new Error("Indique o nome do documento.");
  const texto = d["texto"] ? String(d["texto"]).slice(0, 8000) : null;
  const imagemBruta = d["imagem"] ? String(d["imagem"]) : null;
  const imagem =
    imagemBruta && imagemBruta.startsWith("data:image/") && imagemBruta.length < 4_000_000
      ? imagemBruta
      : null;
  return { nome, texto, imagem };
}

const ESQUEMA = {
  type: "object",
  properties: {
    tipoDocumento: {
      type: "string",
      description: "bilhete, cartão de embarque, voucher, reserva, seguro, outro",
    },
    fornecedor: { type: "string" },
    passageiro: { type: "string" },
    local: { type: "string" },
    referencia: { type: "string" },
    dataHora: {
      type: "string",
      description: "data/hora relevante em formato AAAA-MM-DDTHH:MM, ou vazio",
    },
    codigo: { type: "string", description: "conteúdo do código de barras/QR, ou vazio" },
  },
  required: [
    "tipoDocumento",
    "fornecedor",
    "passageiro",
    "local",
    "referencia",
    "dataHora",
    "codigo",
  ],
  additionalProperties: false,
} as const;

/** Extração local simples, usada quando a IA não está disponível. */
function heuristica(input: AnaliseDocumentoInput): FichaDocumento {
  const base = `${input.nome} ${input.texto ?? ""}`;
  const referencia = /\b([A-Z0-9]{6})\b/.exec(base)?.[1] ?? "";
  const data = /\b(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?\b/.exec(base);
  const tipo = /embarque|bilhete/i.test(base)
    ? "Bilhete"
    : /voucher|reserva|hotel|transfer/i.test(base)
      ? "Voucher"
      : /seguro|apólice/i.test(base)
        ? "Seguro"
        : "Documento";
  return {
    ...fichaVazia,
    tipoDocumento: tipo,
    referencia,
    dataHora: data ? `${data[1]}T${data[2] ?? "00:00"}` : "",
  };
}

function limpar(bruto: unknown): FichaDocumento {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const txt = (k: string) => String(o[k] ?? "").trim().slice(0, 160);
  return {
    tipoDocumento: txt("tipoDocumento"),
    fornecedor: txt("fornecedor"),
    passageiro: txt("passageiro"),
    local: txt("local"),
    referencia: txt("referencia"),
    dataHora: txt("dataHora"),
    codigo: txt("codigo"),
  };
}

export const analisarDocumento = createServerFn({ method: "POST" })
  .inputValidator(validar)
  .handler(async ({ data }): Promise<AnaliseDocumentoResultado> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return {
        ficha: heuristica(data),
        porIa: false,
        nota: "Leitura automática simples. Reveja e complete os campos.",
      };
    }

    const conteudo: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: [
          `Nome do documento: ${data.nome}`,
          data.texto ? `Conteúdo conhecido: ${data.texto}` : "",
          `Data de hoje: ${new Date().toISOString().slice(0, 10)}. Se o documento não indicar o ano, assume a próxima ocorrência futura.`,
          "Extrai os dados do documento de viagem. Em tipoDocumento usa uma designação concreta (por exemplo: Cartão de embarque, Voucher de hotel, Reserva de transfer, Seguro de viagem). Usa strings vazias quando não souberes.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
    if (data.imagem) {
      conteudo.push({ type: "image_url", image_url: { url: data.imagem } });
    }

    try {
      const resposta = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "És um assistente que lê documentos de viagem em português e devolve dados estruturados. Nunca inventes informação.",
            },
            { role: "user", content: conteudo },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "registar_ficha",
                description: "Regista os dados extraídos do documento de viagem.",
                parameters: ESQUEMA,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "registar_ficha" } },
        }),
      });

      if (resposta.status === 429 || resposta.status === 402) {
        return {
          ficha: heuristica(data),
          porIa: false,
          nota:
            resposta.status === 429
              ? "Muitos pedidos de análise seguidos. Tente novamente daqui a pouco."
              : "Créditos de IA esgotados. Preencha a ficha manualmente.",
        };
      }
      if (!resposta.ok) throw new Error(`gateway ${resposta.status}`);

      const json = (await resposta.json()) as {
        choices?: Array<{
          message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
        }>;
      };
      const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) throw new Error("resposta sem dados");

      return {
        ficha: limpar(JSON.parse(args)),
        porIa: true,
        nota: "Dados lidos automaticamente. Confirme antes de guardar.",
      };
    } catch (erro) {
      console.error("analisarDocumento", erro);
      return {
        ficha: heuristica(data),
        porIa: false,
        nota: "Não foi possível ler o documento automaticamente. Complete a ficha à mão.",
      };
    }
  });
