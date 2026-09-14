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

const ESQUEMA_RELEVANCIA = {
  type: "object",
  properties: {
    relevante: {
      type: "boolean",
      description:
        "True APENAS quando o próprio email/documento é uma comunicação concreta, personalizada ou transacional sobre uma viagem específica do utilizador. Deve ser false para newsletters, notícias, artigos, podcasts, publicidade, campanhas, promoções, descontos, ofertas genéricas e inspiração de viagem, mesmo que mencionem hotéis, voos, destinos ou viagens.",
    },
    motivoRelevancia: campoTexto(
      "Explicação muito curta. Se true, identifica a evidência concreta encontrada, como confirmação de reserva, bilhete, voucher, datas de check-in/check-out, referência de reserva ou outro serviço efetivamente marcado. Se false, explica que é conteúdo genérico, promocional ou sem uma viagem/serviço específico.",
    ),
  },
  required: ["relevante", "motivoRelevancia"],
  additionalProperties: false,
} as const;

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
            throw new Error(
              `gateway ${resposta.status}`,
            );
          }

          const json =
            (await resposta.json()) as {
              choices?: Array<{
                message?: {
                  tool_calls?: Array<{
                    function?: {
                      arguments?: string;
                    };
                  }>;
                };
              }>;
            };

          const args =
            json.choices?.[0]
              ?.message
              ?.tool_calls?.[0]
              ?.function
              ?.arguments;

          if (!args) {
            throw new Error(
              "resposta sem dados",
            );
          }

          return JSON.parse(args) as Record<string, unknown>;
        }

        /*
         * ETAPA 1 — FILTRO SEMÂNTICO
         *
         * Esta chamada não tenta extrair uma ficha de viagem.
         * A única pergunta é: este email é realmente uma comunicação
         * concreta sobre uma viagem/serviço específico do utilizador?
         */
        try {
          const filtroIa = await chamarIA(
            [
              {
                role: "system",
                content:
                  [
                    "És um classificador rigoroso de emails de viagens.",
                    "Nesta etapa NÃO estás a extrair dados de uma viagem. Só decides se o email deve entrar na aplicação.",
                    "Marca relevante=true SOMENTE quando o próprio email contém evidência concreta de uma viagem, reserva, bilhete, voucher, marcação ou serviço específico do utilizador.",
                    "Exemplos que DEVEM ser true: confirmação de reserva de hotel; confirmação de Booking; reserva de voo; bilhete de avião; voucher; reserva de comboio/autocarro/barco; aluguer de carro já reservado; transfer reservado; bilhete de museu; entrada de espetáculo; reserva de tour ou atividade; alteração/cancelamento de uma reserva existente; instruções concretas associadas a uma reserva.",
                    "Um email de confirmação de hotel, com nome do hóspede, datas de check-in/check-out, número de reserva, preço, quarto ou instruções de chegada, é claramente true.",
                    "Exemplos que DEVEM ser false: newsletters; notícias; artigos; podcasts; blogs; publicidade; campanhas comerciais; promoções; descontos; ofertas genéricas; emails de marketing de hotéis/companhias aéreas/agências; sugestões de destinos; inspiração para viajar; conteúdos editoriais sobre viagens.",
                    "A simples presença das palavras hotel, flight, voo, booking, travel, reservation, trip ou aeroporto NÃO torna o email relevante.",
                    "Também NÃO é suficiente o email ser enviado por uma empresa de viagens. Tem de existir uma viagem ou serviço concreto associado ao utilizador.",
                    "Se houver dúvida entre uma comunicação concreta e conteúdo genérico/promocional, marca false.",
                    "Não inferir uma reserva a partir de publicidade ou de frases genéricas.",
                    "Responde exclusivamente através da função indicada.",
                  ].join("\n"),
              },
              {
                role: "user",
                content: textoBase,
              },
            ],
            ESQUEMA_RELEVANCIA,
          );

          const relevante =
            filtroIa["relevante"] === true;

          const motivo =
            typeof filtroIa["motivoRelevancia"] === "string" &&
            filtroIa["motivoRelevancia"].trim()
              ? filtroIa["motivoRelevancia"].trim()
              : relevante
                ? "Foi identificada uma comunicação concreta sobre uma viagem ou serviço."
                : "Não foi identificada uma viagem ou serviço específico.";

          if (!relevante) {
            return {
              ficha: heuristica(data),
              relevante: false,
              motivoRelevancia: motivo,
              porIa: true,
              nota:
                "O email foi analisado por IA e considerado irrelevante para uma viagem.",
            };
          }

          /*
           * ETAPA 2 — EXTRAÇÃO
           *
           * Só chegamos aqui depois de o filtro ter considerado o email
           * concretamente relacionado com uma viagem.
           */
          const conteudo: Array<Record<string, unknown>> = [
            {
              type: "text",
              text: [
                textoBase,
                "",
                "O filtro semântico anterior classificou este conteúdo como uma comunicação concreta de viagem.",
                "Agora extrai a ficha completa.",
                "Extrai apenas dados efetivamente presentes no conteúdo. Nunca inventes nomes, datas, horas, códigos, aeroportos, números de voo ou outros dados.",
                "Para um voo: passageiro, companhia, número do voo, origem, destino, aeroportos IATA, data e hora de partida, chegada, hora de embarque, terminal, porta, assento, grupo de embarque, bagagem, referência/PNR e código QR ou código de barras quando estiver disponível.",
                "Para um hotel: nome do alojamento, fornecedor, hóspede, morada, check-in, check-out, referência, quarto/tipologia, condições e contacto.",
                "Para um transporte: operador, fornecedor, passageiro, origem, destino, data/hora de partida e chegada, referência, lugar e outras informações disponíveis.",
                "Para um transfer: fornecedor/operador, passageiro, local de recolha, destino, data/hora, referência, morada e contacto.",
                "Para um bilhete ou atividade: entidade, passageiro/titular, local, data/hora, data/hora de fim, referência, código de entrada e condições.",
                "Para documentos de viagem: identifica o tipo de documento, entidade emissora, titular, referência, datas e condições relevantes.",
                "Para informações: extrai apenas informações úteis para a viagem, como horários, moradas, instruções, regras, contactos, requisitos ou procedimentos.",
                "Se existirem várias datas, distingue a data de emissão/envio da data efetiva da viagem.",
                "Se existirem várias referências ou códigos, identifica como referência o código principal da reserva e coloca códigos adicionais nas condições quando forem relevantes.",
                "Usa strings vazias quando um campo não estiver indicado.",
                "Quando um valor for apenas inferido, ambíguo ou pouco legível, coloca o nome desse campo em porConfirmar.",
                "Se o ano não estiver indicado numa data, considera o contexto do documento/email e assinala a data em porConfirmar em vez de inventar um ano com confiança.",
                "Mantém relevante=true porque o filtro semântico já confirmou que esta é uma comunicação concreta de viagem.",
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

          try {
            const dadosIa = await chamarIA(
              [
                {
                  role: "system",
                  content:
                    "És um assistente especializado em extrair dados de documentos e emails de viagem. O conteúdo já foi classificado como uma comunicação concreta de viagem. Extrai apenas informação efetivamente presente e nunca inventes dados.",
                },
                {
                  role: "user",
                  content: conteudo,
                },
              ],
              ESQUEMA,
            );

            const ficha = limpar(
              dadosIa,
              data.nome,
            );

            return {
              ficha,
              relevante: true,
              motivoRelevancia: motivo,
              porIa: true,
              nota: ficha.porConfirmar
                ? "Email considerado relevante e dados lidos automaticamente. Alguns campos precisam de confirmação."
                : "Email considerado relevante e dados lidos automaticamente. Confirme antes de guardar.",
            };
          } catch (erro) {
            console.error(
              "analisarDocumento extracao",
              erro,
            );

            return {
              ficha: heuristica(data),
              relevante: true,
              motivoRelevancia: motivo,
              porIa: true,
              nota:
                "A mensagem foi considerada relevante, mas a extração completa falhou. Alguns dados precisam de ser revistos manualmente.",
            };
          }
        } catch (erro) {
          console.error(
            "analisarDocumento filtro",
            erro,
          );

          return {
            ficha: heuristica(data),
            relevante: false,
            motivoRelevancia:
              "Não foi possível concluir o filtro automático deste conteúdo.",
            porIa: false,
            nota:
              "A análise automática não foi concluída. O email não será apresentado como descoberta até poder ser analisado.",
          };
        }
      },
    );

