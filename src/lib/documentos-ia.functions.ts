import { createServerFn } from "@tanstack/react-start";

import {
  categoriaPorTexto,
  categoriaValida,
  fichaVazia,
  type FichaDocumento,
} from "./documentos";

export type AnaliseDocumentoInput = {
  /** Nome do ficheiro ou assunto do email. */
  nome: string;
  /** Texto conhecido do documento (corpo do email, conteúdo do QR, notas). */
  texto?: string | null;
  /** Imagem em data URL (image/*) para leitura visual, quando existir. */
  imagem?: string | null;
  /** PDF em data URL (application/pdf) para leitura estruturada, quando existir. */
  pdf?: string | null;
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
    imagemBruta && imagemBruta.startsWith("data:image/") && imagemBruta.length < 6_000_000
      ? imagemBruta
      : null;
  const pdfBruto = d["pdf"] ? String(d["pdf"]) : null;
  const pdf =
    pdfBruto && pdfBruto.startsWith("data:application/pdf") && pdfBruto.length < 12_000_000
      ? pdfBruto
      : null;
  return { nome, texto, imagem, pdf };
}

const campoTexto = (description: string) => ({ type: "string", description });

const ESQUEMA = {
  type: "object",
  properties: {
    categoria: {
      type: "string",
      enum: ["voo", "hotel", "transfer", "outro"],
      description: "Categoria principal do documento.",
    },
    tipoDocumento: campoTexto(
      "Designação concreta: Cartão de embarque, Voucher de hotel, Reserva de transfer, Seguro…",
    ),
    fornecedor: campoTexto("Companhia aérea, hotel, operador do transfer ou emissor."),
    passageiro: campoTexto("Nome do passageiro ou hóspede."),
    local: campoTexto("Nome do alojamento, local de recolha ou local principal."),
    referencia: campoTexto("Referência da reserva, PNR ou booking code."),
    dataHora: campoTexto(
      "Momento principal (partida do voo, check-in do hotel, recolha do transfer) em AAAA-MM-DDTHH:MM",
    ),
    dataHoraFim: campoTexto("Fim relevante (check-out, chegada) em AAAA-MM-DDTHH:MM, ou vazio."),
    codigo: campoTexto("Conteúdo do código de barras/QR quando legível."),
    companhia: campoTexto("Companhia aérea (voo)."),
    numeroVoo: campoTexto("Número do voo, por exemplo TP1234."),
    origem: campoTexto("Origem: código IATA e/ou nome do aeroporto."),
    destino: campoTexto("Destino: código IATA e/ou nome, ou destino do transfer."),
    horaEmbarque: campoTexto("Hora de embarque em AAAA-MM-DDTHH:MM, ou vazio."),
    terminal: campoTexto("Terminal."),
    porta: campoTexto("Porta de embarque."),
    assento: campoTexto("Assento."),
    grupoEmbarque: campoTexto("Grupo/zona de embarque."),
    bagagem: campoTexto("Bagagem incluída ou despachada."),
    morada: campoTexto("Morada completa do alojamento."),
    quarto: campoTexto("Quarto ou tipologia."),
    condicoes: campoTexto("Condições relevantes (cancelamento, pagamento, notas)."),
    contacto: campoTexto("Telefone ou email de contacto."),
    porConfirmar: {
      type: "array",
      items: { type: "string" },
      description:
        "Nomes dos campos acima cujo valor foi deduzido ou está pouco legível e precisa de confirmação humana.",
    },
  },
  required: [
    "categoria",
    "tipoDocumento",
    "fornecedor",
    "passageiro",
    "local",
    "referencia",
    "dataHora",
    "dataHoraFim",
    "codigo",
    "companhia",
    "numeroVoo",
    "origem",
    "destino",
    "horaEmbarque",
    "terminal",
    "porta",
    "assento",
    "grupoEmbarque",
    "bagagem",
    "morada",
    "quarto",
    "condicoes",
    "contacto",
    "porConfirmar",
  ],
  additionalProperties: false,
} as const;

/** Extração local simples, usada quando a IA não está disponível. */
function heuristica(input: AnaliseDocumentoInput): FichaDocumento {
  const base = `${input.nome} ${input.texto ?? ""}`;
  const categoria = categoriaPorTexto(base);
  const referencia = /\b([A-Z0-9]{6})\b/.exec(base)?.[1] ?? "";
  const numeroVoo = /\b([A-Z]{2}\s?\d{2,4})\b/.exec(base)?.[1]?.replace(/\s/g, "") ?? "";
  const data = /\b(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?\b/.exec(base);
  const tipo =
    categoria === "voo"
      ? "Cartão de embarque"
      : categoria === "hotel"
        ? "Reserva de alojamento"
        : categoria === "transfer"
          ? "Reserva de transfer"
          : "Documento";
  return {
    ...fichaVazia,
    categoria,
    tipoDocumento: tipo,
    referencia,
    numeroVoo: categoria === "voo" ? numeroVoo : "",
    dataHora: data ? `${data[1]}T${data[2] ?? "00:00"}` : "",
    porConfirmar: "todos",
  };
}

function limpar(bruto: unknown, nome: string): FichaDocumento {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const txt = (k: string, max = 200) => String(o[k] ?? "").trim().slice(0, max);
  const chaves = Object.keys(fichaVazia).filter(
    (k) => k !== "categoria" && k !== "porConfirmar",
  ) as Array<keyof FichaDocumento>;
  const ficha = { ...fichaVazia };
  for (const k of chaves) ficha[k] = txt(k, k === "condicoes" || k === "morada" ? 400 : 200);
  ficha.categoria = categoriaValida(txt("categoria", 20) || categoriaPorTexto(`${nome}`));
  const porConfirmar = Array.isArray(o["porConfirmar"])
    ? (o["porConfirmar"] as unknown[])
        .map((v) => String(v).trim())
        .filter((v) => v && v in fichaVazia)
    : [];
  ficha.porConfirmar = porConfirmar.join(",");
  return ficha;
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
          "Lê o documento de viagem com atenção e extrai TODOS os campos pedidos.",
          "Se for um cartão de embarque: passageiro, companhia, número do voo, origem e destino (IATA e nome), data e hora de partida, hora de embarque, terminal, porta, assento, grupo de embarque, bagagem, referência/PNR e o conteúdo do código de barras/QR.",
          "Se for um alojamento: nome, morada, hóspede, check-in, check-out, referência, quarto e condições.",
          "Se for um transfer: fornecedor, passageiro, local de recolha, destino, data e hora, referência e contacto.",
          "Usa strings vazias quando o documento não indicar o valor. Nunca inventes. Lista em porConfirmar os campos deduzidos ou pouco legíveis.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
    if (data.imagem) {
      conteudo.push({ type: "image_url", image_url: { url: data.imagem } });
    }
    if (data.pdf) {
      conteudo.push({
        type: "file",
        file: { filename: data.nome.endsWith(".pdf") ? data.nome : `${data.nome}.pdf`, file_data: data.pdf },
      });
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
                "És um assistente que lê documentos de viagem em português e devolve dados estruturados campo a campo. Nunca inventes informação.",
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

      const ficha = limpar(JSON.parse(args), data.nome);
      return {
        ficha,
        porIa: true,
        nota: ficha.porConfirmar
          ? "Dados lidos automaticamente. Alguns campos precisam de confirmação."
          : "Dados lidos automaticamente. Confirme antes de guardar.",
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
