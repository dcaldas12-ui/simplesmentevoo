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

  /** Texto conhecido do documento ou corpo do email. */
  texto?: string | null;

  /** Imagem em data URL (image/*) para leitura visual, quando existir. */
  imagem?: string | null;

  /** PDF em data URL (application/pdf) para leitura estruturada, quando existir. */
  pdf?: string | null;
};

export type AnaliseDocumentoResultado = {
  ficha: FichaDocumento;

  /** true quando a IA considera que o conteúdo tem utilidade concreta para uma viagem. */
  relevante: boolean;

  /** Explicação curta da decisão de relevância. */
  motivoRelevancia: string;

  /** true quando a extração foi feita por IA; false quando foi heurística local. */
  porIa: boolean;

  nota: string;
};

function validar(data: unknown): AnaliseDocumentoInput {
  const d = (data ?? {}) as Record<string, unknown>;

  const nome = String(d["nome"] ?? "")
    .trim()
    .slice(0, 200);

  if (!nome) {
    throw new Error("Indique o nome do documento.");
  }

  const texto = d["texto"]
    ? String(d["texto"]).slice(0, 30000)
    : null;

  const imagemBruta = d["imagem"]
    ? String(d["imagem"])
    : null;

  const imagem =
    imagemBruta &&
    imagemBruta.startsWith("data:image/") &&
    imagemBruta.length < 6_000_000
      ? imagemBruta
      : null;

  const pdfBruto = d["pdf"]
    ? String(d["pdf"])
    : null;

  const pdf =
    pdfBruto &&
    pdfBruto.startsWith("data:application/pdf") &&
    pdfBruto.length < 12_000_000
      ? pdfBruto
      : null;

  return {
    nome,
    texto,
    imagem,
    pdf,
  };
}

const campoTexto = (description: string) => ({
  type: "string",
  description,
});

const ESQUEMA = {
  type: "object",

  properties: {
    relevante: {
      type: "boolean",
      description:
        "Indica se este email/documento tem relação concreta e útil com uma viagem, reserva, bilhete, transporte, alojamento, espetáculo, museu, tour, atividade, documento ou informação específica de viagem. Deve ser false para publicidade, newsletters, campanhas, promoções, ofertas genéricas ou conteúdo comercial sem uma reserva, bilhete, evento ou informação concreta útil.",
    },

    motivoRelevancia: campoTexto(
      "Explicação muito curta da decisão de relevância. Se relevante=true, explica o que foi encontrado. Se relevante=false, explica que é publicidade/newsletter ou que não existe uma viagem, reserva, bilhete, evento ou informação concreta.",
    ),

    categoria: {
      type: "string",

      enum: [
        "voo",
        "hotel",
        "transporte",
        "transfer",
        "bilhete",
        "documento",
        "informacao",
        "outro",
      ],

      description:
        "Categoria principal. Escolhe voo para viagens aéreas; hotel para alojamento; transporte para comboio, autocarro, metro, barco ou outro transporte regular; transfer para transporte privado de/para aeroporto ou alojamento; bilhete para entradas, espetáculos, tours ou atividades; documento para comprovativos, seguros, vistos, passaportes, faturas ou documentos de viagem; informacao para instruções, horários, moradas, regras ou outras informações úteis; outro apenas quando não for possível enquadrar.",
    },

    tipoDocumento: campoTexto(
      "Designação concreta do conteúdo: Cartão de embarque, Reserva de voo, Confirmação de hotel, Voucher de hotel, Bilhete de comboio, Bilhete de autocarro, Bilhete de entrada, Reserva de atividade, Reserva de transfer, Seguro de viagem, Comprovativo, Informação de viagem, etc.",
    ),

    fornecedor: campoTexto(
      "Empresa, companhia aérea, hotel, operador turístico, plataforma de reservas ou entidade que emitiu a reserva/documento.",
    ),

    operador: campoTexto(
      "Operador efetivo do serviço, quando diferente do fornecedor. Exemplos: companhia ferroviária, empresa de autocarros, companhia aérea, operador turístico ou empresa de transfer.",
    ),

    passageiro: campoTexto(
      "Nome do passageiro, viajante, hóspede ou titular da reserva.",
    ),

    local: campoTexto(
      "Nome do hotel, aeroporto, estação, terminal, atração, recinto, ponto de recolha ou outro local principal.",
    ),

    referencia: campoTexto(
      "Referência da reserva, PNR, booking code, confirmation number ou outro código identificador da reserva.",
    ),

    dataHora: campoTexto(
      "Momento principal do evento em AAAA-MM-DDTHH:MM. Para voo/transporte usa partida; para hotel usa check-in; para transfer usa recolha; para bilhete/atividade usa início.",
    ),

    dataHoraFim: campoTexto(
      "Fim relevante em AAAA-MM-DDTHH:MM. Para voo/transporte usa chegada quando disponível; para hotel usa check-out; para atividade usa fim quando disponível; caso contrário deixa vazio.",
    ),

    codigo: campoTexto(
      "Conteúdo de código de barras ou QR quando estiver efetivamente legível no documento.",
    ),

    companhia: campoTexto(
      "Companhia aérea, quando se tratar de voo.",
    ),

    numeroVoo: campoTexto(
      "Número do voo, por exemplo TP1234, FR1234 ou U21234.",
    ),

    origem: campoTexto(
      "Origem da viagem: código IATA e/ou nome do aeroporto, estação, terminal ou local de partida.",
    ),

    destino: campoTexto(
      "Destino da viagem: código IATA e/ou nome do aeroporto, estação, terminal ou local de chegada.",
    ),

    horaEmbarque: campoTexto(
      "Hora/data de embarque ou apresentação, em AAAA-MM-DDTHH:MM, quando existir.",
    ),

    terminal: campoTexto(
      "Terminal do aeroporto ou terminal de transporte.",
    ),

    porta: campoTexto(
      "Porta/gate de embarque ou outro ponto de acesso quando existir.",
    ),

    assento: campoTexto(
      "Lugar/assento atribuído ao passageiro.",
    ),

    grupoEmbarque: campoTexto(
      "Grupo, zona ou prioridade de embarque.",
    ),

    bagagem: campoTexto(
      "Bagagem incluída, bagagem de mão, bagagem de porão ou outras condições de bagagem.",
    ),

    morada: campoTexto(
      "Morada completa do hotel, alojamento, local de recolha ou outro local relevante.",
    ),

    quarto: campoTexto(
      "Quarto, tipologia ou tipo de alojamento.",
    ),

    condicoes: campoTexto(
      "Condições relevantes: cancelamento, pagamento, alterações, requisitos, regras, restrições ou outras notas importantes.",
    ),

    contacto: campoTexto(
      "Telefone, email ou outro contacto relevante do fornecedor/operador.",
    ),

    porConfirmar: {
      type: "array",

      items: {
        type: "string",
      },

      description:
        "Lista dos nomes dos campos cujo valor foi deduzido, é ambíguo, está incompleto ou precisa de confirmação humana. Não incluir campos que estejam claramente indicados.",
    },
  },

  required: [
    "relevante",
    "motivoRelevancia",
    "categoria",
    "tipoDocumento",
    "fornecedor",
    "operador",
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

/**
 * Normaliza texto para permitir deteção simples de palavras
 * independentemente de maiúsculas/minúsculas e acentos.
 */
function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Extração local simples, usada quando a IA não está disponível.
 *
 * Não pretende substituir a IA. Serve apenas para conseguir
 * preencher alguns dados básicos e manter a aplicação funcional.
 */
/*
 * A relevância de conteúdo analisado por IA é decidida pela própria IA.
 * Não usamos uma segunda heurística lexical para substituir essa decisão.
 */

function heuristica(input: AnaliseDocumentoInput): FichaDocumento {
  const base = `${input.nome}\n${input.texto ?? ""}`;

  const normalizado = normalizarTexto(base);

  const categoria = categoriaPorTexto(base);

  const referencia =
    /\b(?:PNR|booking|reservation|confirmation|referencia|reserva|booking\s*code)?\s*[:#-]?\s*([A-Z0-9]{6})\b/i.exec(
      base,
    )?.[1] ?? "";

  const numeroVoo =
    /\b([A-Z]{2}\s?\d{2,4})\b/.exec(base)?.[1]?.replace(/\s/g, "") ?? "";

  const data =
    /\b(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?\b/.exec(base);

  const tipo =
    categoria === "voo"
      ? "Reserva de voo"
      : categoria === "hotel"
        ? "Reserva de alojamento"
        : categoria === "transporte"
          ? "Reserva de transporte"
          : categoria === "transfer"
            ? "Reserva de transfer"
            : categoria === "bilhete"
              ? "Bilhete"
              : categoria === "documento"
                ? "Documento de viagem"
                : categoria === "informacao"
                  ? "Informação de viagem"
                  : "Documento";

  let fornecedor = "";

  const linhas = base
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  const linhaFornecedor = linhas.find((linha) => {
    const l = normalizarTexto(linha);

    return (
      l.startsWith("from:") ||
      l.startsWith("de:") ||
      l.startsWith("companhia:") ||
      l.startsWith("airline:") ||
      l.startsWith("hotel:") ||
      l.startsWith("operador:") ||
      l.startsWith("provider:") ||
      l.startsWith("fornecedor:")
    );
  });

  if (linhaFornecedor) {
    fornecedor = linhaFornecedor
      .split(/[:\-]/, 2)[1]
      ?.trim()
      .slice(0, 200) ?? "";
  }

  const ficha: FichaDocumento = {
    ...fichaVazia,

    categoria,

    tipoDocumento: tipo,

    fornecedor,

    operador: "",

    referencia,

    numeroVoo:
      categoria === "voo"
        ? numeroVoo
        : "",

    dataHora:
      data
        ? `${data[1]}T${data[2] ?? "00:00"}`
        : "",

    porConfirmar: "todos",
  };

  /*
   * Se encontrarmos sinais fortes de uma reserva, mantemos
   * a informação para posterior confirmação humana.
   */
  if (
    normalizado.includes("booking") ||
    normalizado.includes("reservation") ||
    normalizado.includes("reserva") ||
    normalizado.includes("confirmation") ||
    normalizado.includes("voucher") ||
    normalizado.includes("bilhete")
  ) {
    ficha.porConfirmar = "fornecedor,passageiro,dataHora,referencia";
  }

  return ficha;
}

function limpar(
  bruto: unknown,
  nome: string,
): FichaDocumento {
  const o = (bruto ?? {}) as Record<string, unknown>;

  const txt = (
    k: string,
    max = 200,
  ) =>
    String(o[k] ?? "")
      .trim()
      .slice(0, max);

  const chaves = Object.keys(fichaVazia).filter(
    (k) =>
      k !== "categoria" &&
      k !== "porConfirmar",
  ) as Array<keyof FichaDocumento>;

  const ficha = {
    ...fichaVazia,
  };

  for (const k of chaves) {
    ficha[k] = txt(
      k,
      k === "condicoes" ||
      k === "morada"
        ? 600
        : 200,
    );
  }

  ficha.categoria = categoriaValida(
    txt("categoria", 30) ||
      categoriaPorTexto(nome),
  );

  const porConfirmar =
    Array.isArray(o["porConfirmar"])
      ? (o["porConfirmar"] as unknown[])
          .map((v) =>
            String(v).trim(),
          )
          .filter(
            (v) =>
              v &&
              v in fichaVazia,
          )
      : [];

  ficha.porConfirmar =
    porConfirmar.join(",");

  return ficha;
}

export const analisarDocumento =
  createServerFn({ method: "POST" })
    .inputValidator(validar)
    .handler(
      async ({
        data,
      }): Promise<AnaliseDocumentoResultado> => {
        const apiKey =
          process.env["LOVABLE_API_KEY"];

        if (!apiKey) {
          return {
            ficha: heuristica(data),
            relevante: false,
            motivoRelevancia:
              "A análise automática não está disponível neste momento.",
            porIa: false,
            nota:
              "A análise automática não está disponível. O conteúdo não será apresentado como descoberta até poder ser analisado.",
          };
        }

        const textoBase = [
          `Nome do documento/email: ${data.nome}`,
          data.texto
            ? `Conteúdo disponível:\n${data.texto}`
            : "",
          `Data de hoje: ${new Date()
            .toISOString()
            .slice(0, 10)}.`,
        ]
          .filter(Boolean)
          .join("\n");

        async function chamarIA(
          messages: Array<Record<string, unknown>>,
          schema: Record<string, unknown>,
        ): Promise<Record<string, unknown>> {
          /*
           * O gateway pode devolver 429 quando existem várias análises
           * em paralelo. Fazemos algumas tentativas com espera progressiva.
           *
           * Além do tool_call normal, aceitamos também JSON em message.content.
           * Isto torna a análise robusta quando o modelo responde em formato
           * estruturado mas não envia a chamada da ferramenta.
           */
          const maxTentativas = 3;

          let ultimoErro: unknown = null;

          for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
            try {
              const resposta = await fetch(
                "https://ai.gateway.lovable.dev/v1/chat/completions",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "google/gemini-2.5-flash",
                    messages,
                    tools: [
                      {
                        type: "function",
                        function: {
                          name: "registar_ficha",
                          description:
                            "Regista o resultado estruturado da análise.",
                          parameters: schema,
                        },
                      },
                    ],
                    tool_choice: {
                      type: "function",
                      function: {
                        name: "registar_ficha",
                      },
                    },
                  }),
                },
              );

              if (resposta.status === 429) {
                throw new Error("429");
              }

              if (resposta.status === 402) {
                throw new Error("402");
              }

              if (!resposta.ok) {
                const detalhe = await resposta.text().catch(() => "");
                throw new Error(
                  `gateway ${resposta.status}${detalhe ? `: ${detalhe.slice(0, 500)}` : ""}`,
                );
              }

              const json =
                (await resposta.json()) as {
                  choices?: Array<{
                    message?: {
                      content?: string | null;
                      tool_calls?: Array<{
                        function?: {
                          arguments?: string;
                        };
                      }>;
                    };
                  }>;
                };

              const message = json.choices?.[0]?.message;

              const args = message?.tool_calls?.[0]?.function?.arguments;

              if (args) {
                return JSON.parse(args) as Record<string, unknown>;
              }

              const content =
                typeof message?.content === "string"
                  ? message.content.trim()
                  : "";

              if (content) {
                const jsonMatch = content.match(/\{[\s\S]*\}/);

                if (jsonMatch?.[0]) {
                  return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
                }
              }

              throw new Error("resposta sem dados estruturados");
            } catch (erro) {
              ultimoErro = erro;

              const mensagem =
                erro instanceof Error ? erro.message : String(erro);

              if (mensagem === "402" || tentativa === maxTentativas) {
                throw erro;
              }

              const espera =
                mensagem === "429"
                  ? 1500 * tentativa
                  : 800 * tentativa;

              await new Promise((resolve) =>
                setTimeout(resolve, espera),
              );
            }
          }

          throw ultimoErro instanceof Error
            ? ultimoErro
            : new Error("Falha na análise por IA.");
        }


        /*
         * ANÁLISE ÚNICA
         *
         * Em vez de fazer primeiro um filtro muito restritivo e só depois
         * a extração, fazemos uma única análise completa. Isto evita que
         * uma primeira classificação demasiado conservadora elimine emails
         * de reserva antes de os seus dados serem lidos.
         */
        try {
          const conteudo: Array<Record<string, unknown>> = [
            {
              type: "text",
              text: [
                textoBase,
                "",
                "Analisa este email/documento e decide se é relevante para uma viagem do utilizador.",
                "",
                "Considera relevante=true quando existir uma comunicação concreta e individualizada sobre uma viagem ou serviço específico, incluindo confirmação ou reserva de hotel, voo, comboio, autocarro, barco, aluguer de carro, transfer, museu, espetáculo, tour ou atividade; bilhete ou voucher; alteração ou cancelamento de uma reserva; instruções concretas associadas a uma reserva; ou outro documento/informação efetivamente útil para uma viagem específica.",
                "Sinais fortes de relevância incluem número de reserva/PNR, código de confirmação, nome do passageiro ou hóspede, datas de check-in/check-out, datas de viagem, horários, itinerário, número de voo, origem/destino, valor pago, bilhete, voucher ou instruções de uma reserva.",
                "Não marques como relevante apenas porque aparecem palavras como hotel, voo, booking, travel ou aeroporto.",
                "Marca relevante=false para newsletters, notícias, artigos, podcasts, blogs, publicidade, campanhas, promoções, descontos, ofertas genéricas, sugestões de destinos, inspiração de viagem e marketing sem uma reserva, bilhete, evento ou serviço específico do utilizador.",
                "Se o email tiver vários sinais concretos de uma reserva ou serviço específico, considera-o relevante mesmo que alguns campos estejam em falta.",
                "Não inventes dados. Extrai apenas informação que esteja efetivamente presente.",
                "Se relevante=true, preenche a ficha completa com os dados encontrados.",
                "Se relevante=false, deixa os restantes campos vazios ou usa a ficha mínima possível.",
                "Se um campo estiver ausente, usa uma string vazia. Se um valor for ambíguo ou inferido, coloca o nome do campo em porConfirmar.",
                "Responde exclusivamente através da função registar_ficha.",
              ].join("\n"),
            },
          ];

          if (data.imagem) {
            conteudo.push({
              type: "image_url",
              image_url: {
                url: data.imagem,
              },
            });
          }

          if (data.pdf) {
            conteudo.push({
              type: "file",
              file: {
                filename: data.nome.endsWith(".pdf")
                  ? data.nome
                  : `${data.nome}.pdf`,
                file_data: data.pdf,
              },
            });
          }

          const dadosIa = await chamarIA(
            [
              {
                role: "system",
                content:
                  "És um assistente especializado em classificar e extrair dados de emails e documentos de viagem. Avalia o conteúdo completo antes de decidir. Sê rigoroso contra publicidade e newsletters, mas não descartes uma reserva real apenas porque faltam algumas palavras-chave. Nunca inventes dados.",
              },
              {
                role: "user",
                content: conteudo,
              },
            ],
            ESQUEMA,
          );

          const relevante = dadosIa["relevante"] === true;

          const motivo =
            typeof dadosIa["motivoRelevancia"] === "string" &&
            dadosIa["motivoRelevancia"].trim()
              ? dadosIa["motivoRelevancia"].trim()
              : relevante
                ? "Foi identificada uma comunicação concreta sobre uma viagem ou serviço."
                : "Não foi identificada uma viagem ou serviço específico.";

          const ficha = limpar(dadosIa, data.nome);

          return {
            ficha,
            relevante,
            motivoRelevancia: motivo,
            porIa: true,
            nota: relevante
              ? ficha.porConfirmar
                ? "Email considerado relevante e dados lidos automaticamente. Alguns campos precisam de confirmação."
                : "Email considerado relevante e dados lidos automaticamente. Confirme antes de guardar."
              : "O email foi analisado por IA e considerado irrelevante para uma viagem.",
          };
        } catch (erro) {
          console.error("analisarDocumento", erro);

          return {
            ficha: heuristica(data),
            relevante: false,
            motivoRelevancia:
              "Não foi possível concluir a análise automática deste conteúdo.",
            porIa: false,
            nota:
              "A análise automática não foi concluída. O email não será apresentado como descoberta até poder ser analisado.",
          };
        }
      },
    );

