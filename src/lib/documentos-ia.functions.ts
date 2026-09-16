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

  /** true quando a análise foi feita por IA; false quando houve fallback/erro. */
  porIa: boolean;

  /** Mensagem informativa para a interface/logs. */
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
 * Extração local simples, usada apenas como fallback.
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
    fornecedor =
      linhaFornecedor
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

    dataHora: data
      ? `${data[1]}T${data[2] ?? "00:00"}`
      : "",

    porConfirmar: "todos",
  };

  if (
    normalizado.includes("booking") ||
    normalizado.includes("reservation") ||
    normalizado.includes("reserva") ||
    normalizado.includes("confirmation") ||
    normalizado.includes("voucher") ||
    normalizado.includes("bilhete")
  ) {
    ficha.porConfirmar =
      "fornecedor,passageiro,dataHora,referencia";
  }

  return ficha;
}

/**
 * Determina, localmente, se existem sinais suficientemente fortes
 * para reconhecer pelo menos uma comunicação transacional.
 *
 * É usado apenas como fallback quando a IA não consegue responder.
 */
function heuristicaRelevante(input: AnaliseDocumentoInput): boolean {
  const texto = normalizarTexto(
    `${input.nome}\n${input.texto ?? ""}`,
  );

  const sinaisFortes = [
    "reserva confirmada",
    "reserva confirmada",
    "confirmacao de reserva",
    "confirmation number",
    "booking confirmation",
    "booking confirmed",
    "booking reference",
    "reservation number",
    "reservation confirmed",
    "check-in",
    "check in",
    "check-out",
    "check out",
    "boarding pass",
    "cartao de embarque",
    "cartão de embarque",
    "boarding confirmation",
    "pnr",
    "voucher",
    "numero da reserva",
    "número da reserva",
    "referencia da reserva",
    "referência da reserva",
    "flight number",
    "numero do voo",
    "número do voo",
    "seu voo",
    "your flight",
    "departure",
    "arrival",
    "passenger",
    "passageiro",
    "guest",
    "hospede",
    "hóspede",
    "itinerary",
    "bilhete",
    "ticket",
  ];

  const coincidencias = sinaisFortes.filter((sinal) =>
    texto.includes(normalizarTexto(sinal)),
  ).length;

  const temData =
    /\b\d{4}-\d{2}-\d{2}\b/.test(texto) ||
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(texto);

  const temNumeroVoo =
    /\b[A-Z]{2}\s?\d{2,4}\b/i.test(input.nome) ||
    /\b[A-Z]{2}\s?\d{2,4}\b/i.test(input.texto ?? "");

  const temReferencia =
    /\b[A-Z0-9]{6}\b/i.test(input.nome) ||
    /\b(?:pnr|booking|reservation|confirmation|referencia|reserva)\b[\s:#-]*[A-Z0-9]{4,12}\b/i.test(
      input.texto ?? "",
    );

  return (
    coincidencias >= 2 ||
    (coincidencias >= 1 && temData && (temNumeroVoo || temReferencia))
  );
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

  const ficha: FichaDocumento = {
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
          .map((v) => String(v).trim())
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

function extrairJsonDaResposta(
  conteudo: unknown,
): Record<string, unknown> {
  if (typeof conteudo !== "string") {
    throw new Error(
      "A IA devolveu uma resposta sem texto.",
    );
  }

  const bruto = conteudo.trim();

  if (!bruto) {
    throw new Error(
      "A IA devolveu uma resposta vazia.",
    );
  }

  const candidatos = [
    bruto,
    bruto
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim(),
  ];

  for (const candidato of candidatos) {
    try {
      const parsed = JSON.parse(candidato);

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Tentamos abaixo encontrar um objeto JSON dentro do texto.
    }
  }

  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");

  if (inicio >= 0 && fim > inicio) {
    const trecho = bruto.slice(
      inicio,
      fim + 1,
    );

    try {
      const parsed = JSON.parse(trecho);

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // A resposta não continha JSON válido.
    }
  }

  throw new Error(
    "A IA devolveu texto, mas não devolveu JSON válido.",
  );
}

function obterConteudoResposta(
  json: unknown,
): string {
  const resposta = (json ?? {}) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: unknown;
        }>;
      };
      finishReason?: string;
      safetyRatings?: unknown;
    }>;
    promptFeedback?: unknown;
  };

  const candidato = resposta.candidates?.[0];

  if (!candidato) {
    throw new Error(
      "A API Gemini não devolveu nenhum candidato de resposta.",
    );
  }

  const partes = candidato.content?.parts ?? [];

  const textos = partes
    .map((part) =>
      part && typeof part.text === "string"
        ? part.text
        : "",
    )
    .filter(Boolean);

  const texto = textos.join("\n").trim();

  if (texto) {
    return texto;
  }

  throw new Error(
    `A API Gemini devolveu uma resposta sem texto${
      candidato.finishReason
        ? ` (finishReason: ${candidato.finishReason})`
        : "."
    }`,
  );
}

const ESQUEMA = {
  type: "object",
  properties: {
    relevante: {
      type: "boolean",
      description:
        "true apenas quando existe evidência concreta de uma comunicação de viagem específica do utilizador.",
    },

    motivoRelevancia: {
      type: "string",
      description:
        "Explicação curta da decisão de relevância.",
    },

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
        "Categoria principal do email/documento.",
    },

    tipoDocumento: {
      type: "string",
      description:
        "Tipo concreto de reserva, bilhete, documento ou informação.",
    },

    fornecedor: {
      type: "string",
      description:
        "Empresa, companhia, hotel, plataforma ou entidade emissora.",
    },

    operador: {
      type: "string",
      description:
        "Operador efetivo do serviço, quando aplicável.",
    },

    passageiro: {
      type: "string",
      description:
        "Nome do passageiro, viajante, hóspede ou titular.",
    },

    local: {
      type: "string",
      description:
        "Local principal: hotel, aeroporto, estação, atração, etc.",
    },

    referencia: {
      type: "string",
      description:
        "Referência da reserva, PNR, booking code ou confirmation number.",
    },

    dataHora: {
      type: "string",
      description:
        "Data/hora principal em AAAA-MM-DDTHH:MM.",
    },

    dataHoraFim: {
      type: "string",
      description:
        "Data/hora final relevante em AAAA-MM-DDTHH:MM, quando existir.",
    },

    codigo: {
      type: "string",
      description:
        "Código de barras, QR ou outro código legível, quando existir.",
    },

    companhia: {
      type: "string",
      description:
        "Companhia aérea, quando aplicável.",
    },

    numeroVoo: {
      type: "string",
      description:
        "Número do voo, por exemplo TP1234 ou FR1234.",
    },

    origem: {
      type: "string",
      description:
        "Origem da viagem.",
    },

    destino: {
      type: "string",
      description:
        "Destino da viagem.",
    },

    horaEmbarque: {
      type: "string",
      description:
        "Hora/data de embarque ou apresentação, quando existir.",
    },

    terminal: {
      type: "string",
      description:
        "Terminal, quando existir.",
    },

    porta: {
      type: "string",
      description:
        "Porta/gate, quando existir.",
    },

    assento: {
      type: "string",
      description:
        "Assento/lugar atribuído, quando existir.",
    },

    grupoEmbarque: {
      type: "string",
      description:
        "Grupo/zona de embarque, quando existir.",
    },

    bagagem: {
      type: "string",
      description:
        "Condições de bagagem.",
    },

    morada: {
      type: "string",
      description:
        "Morada relevante.",
    },

    quarto: {
      type: "string",
      description:
        "Quarto/tipologia, quando aplicável.",
    },

    condicoes: {
      type: "string",
      description:
        "Condições de pagamento, cancelamento, alterações, regras ou outras notas.",
    },

    contacto: {
      type: "string",
      description:
        "Contacto relevante do fornecedor/operador.",
    },

    porConfirmar: {
      type: "array",
      items: {
        type: "string",
      },
      description:
        "Campos ambíguos, incompletos ou que precisam de confirmação.",
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

} as const;

function extrairDadosEstruturadosDaResposta(
  json: unknown,
): Record<string, unknown> {
  const raiz = (json ?? {}) as {
    choices?: Array<{
      message?: {
        content?: unknown;
        tool_calls?: Array<{
          function?: {
            arguments?: unknown;
          };
        }>;
      };
    }>;
  };

  const mensagem = raiz.choices?.[0]?.message;

  const argumentos =
    mensagem?.tool_calls?.[0]?.function?.arguments;

  if (typeof argumentos === "string") {
    return extrairJsonDaResposta(argumentos);
  }

  if (
    argumentos &&
    typeof argumentos === "object"
  ) {
    return argumentos as Record<string, unknown>;
  }

  return extrairJsonDaResposta(
    obterConteudoResposta(json),
  );
}

function evidenciaViagemConcreta(
  input: AnaliseDocumentoInput,
): {
  relevante: boolean;
  motivo: string;
} {
  const texto = normalizarTexto(
    `${input.nome}\n${input.texto ?? ""}`,
  );

  const negativos = [
    /newsletter/,
    /unsubscribe/,
    /cancelar subscri/,
    /campanha comercial/,
    /campanha promocional/,
    /promocao/,
    /promocaoes/,
    /desconto/,
    /descontos/,
    /sale/,
    /sales/,
    /oferta especial/,
    /ofertas/,
    /save \d+%/,
    /\b\d+%\s*(off|desconto)/,
    /ate \d+ ?€/,
    /ate \d+%/,
    /marketing/,
    /inspiracao/,
    /descubra .*destin/,
    /melhores destinos/,
    /fique a conhecer/,
  ];

  const temSinalMarketing =
    negativos.some((padrao) =>
      padrao.test(texto),
    );

  const sinaisTransacionais = [
    /reserva(?:cao|ção)?(?: confirmada| confirmado| efetuada| realizada)?/,
    /confirmacao de reserva/,
    /reserva confirmada/,
    /reserva realizada/,
    /reservation (?:confirmed|number|details)/,
    /booking confirmation/,
    /booking confirmed/,
    /booking reference/,
    /reservation number/,
    /confirmation number/,
    /numero da reserva/,
    /referencia da reserva/,
    /referencia de reserva/,
    /booking code/,
    /voucher/,
    /pnr/,
    /boarding pass/,
    /boarding confirmation/,
    /cartao de embarque/,
    /bilhete electronico/,
    /bilhete eletrónico/,
    /e-ticket/,
    /ticket number/,
    /ticket confirmation/,
    /your ticket/,
    /seu bilhete/,
    /bilhete confirmado/,
    /bilhete reservado/,
    /entrada reservada/,
    /ingresso reservado/,
    /check-in/,
    /check in/,
    /check-out/,
    /check out/,
    /passageiro/,
    /passenger/,
    /hospede/,
    /guest/,
    /itinerario/,
    /itinerary/,
    /flight number/,
    /numero do voo/,
    /seat number/,
    /assento/,
  ];

  const sinais =
    sinaisTransacionais.filter((padrao) =>
      padrao.test(texto),
    ).length;

  const temVooEspecifico =
    /\b[A-Z]{2}\s?\d{2,4}\b/i.test(
      `${input.nome}\n${input.texto ?? ""}`,
    ) &&
    (
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(
        texto,
      ) ||
      /\b\d{4}-\d{2}-\d{2}\b/.test(texto)
    );

  const temReferencia =
    /\b(?:pnr|booking(?: reference| code)?|reservation(?: number)?|confirmation(?: number)?|referencia(?: da)? reserva|numero da reserva)\b[\s:#-]*[A-Z0-9-]{4,20}\b/i.test(
      `${input.nome}\n${input.texto ?? ""}`,
    );

  const temBilheteComData =
    /\b(?:bilhete|ticket|entrada|voucher|e-ticket|boarding pass)\b/i.test(
      `${input.nome}\n${input.texto ?? ""}`,
    ) &&
    (
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(
        texto,
      ) ||
      /\b\d{4}-\d{2}-\d{2}\b/.test(texto)
    );

  const temHotelComDados =
    /\b(?:hotel|alojamento|room|quarto|check-in|check out|check-out)\b/.test(
      texto,
    ) &&
    (
      temReferencia ||
      /\b(?:check-in|check out|check-out)\b/.test(
        texto,
      )
    );

  const temTransporteComDados =
    /\b(?:train|comboio|trem|autocarro|bus|metro|barco|ferry|transfer|car rental|aluguer de carro)\b/.test(
      texto,
    ) &&
    (
      temReferencia ||
      temBilheteComData ||
      /\b(?:departure|partida|arrival|chegada)\b/.test(
        texto,
      )
    );

  const forte =
    /\b(?:reservation confirmed|booking confirmation|booking confirmed|boarding pass|cartao de embarque|confirmation number|booking reference|reservation number|ticket confirmation|ticket number|bilhete confirmado|reserva confirmada|numero da reserva|pnr)\b/.test(
      texto,
    ) ||
    temReferencia ||
    temVooEspecifico ||
    temHotelComDados ||
    temTransporteComDados ||
    temBilheteComData;

  if (!forte) {
    return {
      relevante: false,
      motivo:
        "Não existem evidências suficientes de uma reserva, bilhete, transporte, alojamento ou serviço de viagem concreto.",
    };
  }

  if (
    temSinalMarketing &&
    sinais < 2 &&
    !temReferencia &&
    !temVooEspecifico
  ) {
    return {
      relevante: false,
      motivo:
        "O conteúdo apresenta características promocionais ou comerciais sem evidência suficiente de uma reserva ou serviço concreto.",
    };
  }

  return {
    relevante: true,
    motivo:
      "Foram encontradas evidências concretas de uma reserva, bilhete, transporte, alojamento ou serviço de viagem.",
  };
}

export const analisarDocumento =
  createServerFn({ method: "POST" })
    .inputValidator(validar)
    .handler(
      async ({
        data,
      }): Promise<AnaliseDocumentoResultado> => {
        const apiKey =
          process.env["GEMINI_API_KEY"];

        const fichaFallback =
          heuristica(data);

        const fallbackRelevante =
          heuristicaRelevante(data);

        if (!apiKey) {
          console.error(
            "analisarDocumento: GEMINI_API_KEY não está disponível.",
          );

          return {
            ficha: fichaFallback,
            relevante: fallbackRelevante,
            motivoRelevancia:
              fallbackRelevante
                ? "Foram encontrados sinais fortes de uma comunicação de viagem, mas a análise por IA não está disponível."
                : "A análise por IA não está disponível neste momento.",
            porIa: false,
            nota:
              fallbackRelevante
                ? "A IA não está disponível. Foi usado um reconhecimento local provisório."
                : "A análise automática não está disponível.",
          };
        }

        const textoBase = [
          `Assunto/nome do email: ${data.nome}`,

          data.texto
            ? `Conteúdo do email:\n${data.texto}`
            : "",

          `Data de hoje: ${new Date()
            .toISOString()
            .slice(0, 10)}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        const camposFicha =
          Object.keys(fichaVazia).join(", ");

        const promptTexto = [
            textoBase,

            "",

            "Analisa este email para a aplicação de viagens ViatOrbis.",

            "",

            "Tens primeiro de decidir se este email é uma comunicação concreta relacionada com uma viagem do utilizador.",

            "",

            "DEVE ser relevante=true quando houver evidência concreta de:",

            "- reserva de hotel ou alojamento;",

            "- confirmação de Booking ou outra plataforma;",

            "- voo reservado ou bilhete de avião;",

            "- cartão de embarque;",

            "- comboio, autocarro, barco ou outro transporte reservado;",

            "- aluguer de carro já reservado;",

            "- transfer já reservado;",

            "- bilhete de museu, espetáculo, atração, tour ou atividade;",

            "- seguro ou outro documento de viagem concreto;",

            "- alteração, cancelamento ou instruções de uma reserva existente;",

            "- informação operacional diretamente associada a uma viagem específica.",

            "",

            "DEVE ser relevante=false quando for:",

            "- newsletter;",

            "- publicidade;",

            "- campanha comercial;",

            "- promoção ou desconto;",

            "- oferta genérica;",

            "- conteúdo editorial;",

            "- artigo, blog ou podcast;",

            "- inspiração para viajar;",

            "- recomendação genérica de destinos;",

            "- email comercial sem uma reserva, bilhete ou serviço concreto.",

            "",

            "A decisão de relevância é tua e será usada diretamente pela aplicação. Não existe outro filtro posterior a corrigir a tua decisão. Portanto, só uses relevante=true quando houver evidência concreta de uma viagem ou serviço específico do utilizador.",

            "Não basta aparecerem palavras como hotel, flight, travel, booking, reservation, trip, viagem, aeroporto ou destino. Procura uma comunicação concreta e específica: uma reserva, bilhete, passagem, serviço contratado, alteração/cancelamento de uma reserva existente, ou informação operacional ligada a uma viagem específica.",

            "Emails promocionais, newsletters, campanhas, descontos, ofertas genéricas, inspiração, artigos, recomendações de destinos ou mensagens comerciais sem uma transação/reserva específica devem ser relevante=false, mesmo que contenham muitos termos relacionados com viagens.",

            "",

            "Quando relevante=true, extrai apenas os dados que realmente aparecem no email.",

            "",

            `Os campos possíveis da ficha são: ${camposFicha}`,

            "",

            "Para um voo procura passageiro, companhia, número do voo, origem, destino, data/hora de partida, chegada, embarque, terminal, porta, assento, grupo, bagagem e referência/PNR.",

            "",

            "Para um hotel procura fornecedor, hóspede, hotel, morada, check-in, check-out, referência, quarto, condições e contacto.",

            "",

            "Para transporte procura operador, fornecedor, passageiro, origem, destino, partida, chegada, referência e lugar.",

            "",

            "Para transfer procura fornecedor, passageiro, recolha, destino, data/hora, referência, morada e contacto.",

            "",

            "Para bilhete ou atividade procura entidade, titular, local, data/hora, referência, código e condições.",

            "",

            "Para informação útil de viagem procura horários, moradas, instruções, regras, contactos ou requisitos concretos.",

            "",

            "Nunca inventes dados.",

            "Quando um campo não aparecer, usa string vazia.",

            "Quando um dado for ambíguo ou não puder ser confirmado com segurança, deixa-o vazio e inclui o nome desse campo em porConfirmar.",

            "",

            "IMPORTANTE: responde APENAS com um objeto JSON válido. Não uses markdown, não uses ```json e não escrevas explicações fora do JSON.",

            "",

            "O JSON deve ter exatamente esta estrutura conceptual:",

            "{",

            '  "relevante": true,',

            '  "motivoRelevancia": "explicação curta",',

            '  "categoria": "voo|hotel|transporte|transfer|bilhete|documento|informacao|outro",',

            '  "tipoDocumento": "",',

            '  "fornecedor": "",',

            '  "operador": "",',

            '  "passageiro": "",',

            '  "local": "",',

            '  "referencia": "",',

            '  "dataHora": "",',

            '  "dataHoraFim": "",',

            '  "codigo": "",',

            '  "companhia": "",',

            '  "numeroVoo": "",',

            '  "origem": "",',

            '  "destino": "",',

            '  "horaEmbarque": "",',

            '  "terminal": "",',

            '  "porta": "",',

            '  "assento": "",',

            '  "grupoEmbarque": "",',

            '  "bagagem": "",',

            '  "morada": "",',

            '  "quarto": "",',

            '  "condicoes": "",',

            '  "contacto": "",',

            '  "porConfirmar": []',

            "}",
            ].join("\n");

        const partesGemini: Array<Record<string, unknown>> = [
          {
            text: promptTexto,
          },
        ];

        const imagem =
          typeof data.imagem === "string" ? data.imagem : "";

        if (imagem.length > 0) {
          const separador = imagem.indexOf(",");

          if (separador > 0) {
            const cabecalho = imagem.slice(0, separador);
            const mimeType = cabecalho
              .replace(/^data:/i, "")
              .split(";")[0]?.trim() ?? "";
            const base64 = imagem.slice(separador + 1);

            if (
              mimeType.startsWith("image/") &&
              base64
            ) {
              partesGemini.push({
                inlineData: {
                  mimeType,
                  data: base64,
                },
              });
            }
          }
        }

        const pdf =
          typeof data.pdf === "string" ? data.pdf : "";

        if (pdf.length > 0) {
          const separador = pdf.indexOf(",");

          if (separador > 0) {
            const cabecalho = pdf.slice(0, separador);
            const mimeType = cabecalho
              .replace(/^data:/i, "")
              .split(";")[0]?.trim() ?? "";
            const base64 = pdf.slice(separador + 1);

            if (
              mimeType === "application/pdf" &&
              base64
            ) {
              partesGemini.push({
                inlineData: {
                  mimeType,
                  data: base64,
                },
              });
            }
          }
        }

        const maxTentativas = 2;

        let ultimoErro: unknown = null;

        for (
          let tentativa = 1;
          tentativa <= maxTentativas;
          tentativa++
        ) {
          try {
            const resposta = await fetch(
              "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
              {
                method: "POST",

                headers: {
                  "x-goog-api-key": apiKey,
                  "Content-Type":
                    "application/json",
                },

                body: JSON.stringify({
                  systemInstruction: {
                    parts: [
                      {
                        text:
                          "És um assistente especializado em interpretar emails de viagens. Analisa com rigor, não inventes dados. Distingue reservas reais de newsletters e publicidade.",
                      },
                    ],
                  },

                  contents: [
                    {
                      role: "user",
                      parts:
                        partesGemini,
                    },
                  ],

                  generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 2500,
                    responseMimeType:
                      "application/json",
                    responseSchema:
                      ESQUEMA,
                  },
                }),
              },
            );

            const corpo =
              await resposta.text();

            if (!resposta.ok) {
              console.error(
                "analisarDocumento Gemini",
                {
                  tentativa,

                  status:
                    resposta.status,

                  statusText:
                    resposta.statusText,

                  corpo:
                    corpo.slice(
                      0,
                      2000,
                    ),
                },
              );

              if (
                resposta.status ===
                401 ||
                resposta.status ===
                403
              ) {
                throw new Error(
                  `A API Gemini recusou a autenticação (${resposta.status}). Verifique a GEMINI_API_KEY e as permissões da chave.`,
                );
              }

              if (
                resposta.status ===
                429
              ) {
                throw new Error(
                  "A API Gemini foi temporariamente limitada pelo limite de utilização (429).",
                );
              }

              throw new Error(
                `A API Gemini devolveu ${resposta.status}: ${corpo.slice(0, 500)}`,
              );
            }

            let json: unknown;

            try {
              json =
                JSON.parse(corpo);
            } catch {
              console.error(
                "analisarDocumento: resposta da Gemini não é JSON",
                corpo.slice(
                  0,
                  2000,
                ),
              );

              throw new Error(
                "A API Gemini devolveu uma resposta que não é JSON válido.",
              );
            }

            const dadosIa =
              extrairDadosEstruturadosDaResposta(
                json,
              );

            // A decisão de relevância pertence à análise Gemini.
            // O reconhecimento local só é usado no fallback quando a IA
            // não consegue responder. Assim, a mesma regra funciona tanto
            // na importação manual como na deteção automática do Gmail.
            const relevante =
              dadosIa["relevante"] === true;

            const motivoIa =
              typeof dadosIa["motivoRelevancia"] === "string"
                ? String(dadosIa["motivoRelevancia"]).trim().slice(0, 500)
                : "";

            const motivoRelevancia =
              motivoIa ||
              (relevante
                ? "Foi identificada pelo Gemini uma comunicação concreta relacionada com uma viagem."
                : "O Gemini considerou que o conteúdo não corresponde a uma comunicação concreta de viagem.");

            const ficha =
              limpar(
                dadosIa,
                data.nome,
              );

            return {
              ficha,

              relevante,

              motivoRelevancia,

              porIa: true,

              nota: relevante
                ? ficha.porConfirmar
                  ? "Email considerado relevante e analisado por IA. Alguns campos precisam de confirmação."
                  : "Email considerado relevante e analisado por IA. Confirme os dados antes de guardar."
                : "Email analisado por IA e considerado irrelevante para uma viagem.",
            };
          } catch (erro) {
            ultimoErro =
              erro;

            console.error(
              "analisarDocumento tentativa",
              tentativa,
              erro,
            );

            const mensagem =
              erro instanceof Error
                ? erro.message
                : String(erro);

            if (
              mensagem.includes("(401)") ||
              mensagem.includes("(403)")
            ) {
              break;
            }

            if (
              tentativa <
              maxTentativas
            ) {
              const espera =
                mensagem.includes(
                  "(429)",
                )
                  ? 2000 *
                    tentativa
                  : 1000 *
                    tentativa;

              await new Promise(
                (
                  resolve,
                ) =>
                  setTimeout(
                    resolve,
                    espera,
                  ),
              );
            }
          }
        }

        const erroFinal =
          ultimoErro instanceof Error
            ? ultimoErro.message
            : String(
                ultimoErro ??
                  "Erro desconhecido.",
              );

        /*
         * Muito importante:
         * uma falha da IA NÃO é apresentada internamente como
         * "a IA decidiu que o email era irrelevante".
         *
         * Mantemos um fallback local apenas para que um email
         * claramente transacional continue identificável.
         */
        return {
          ficha:
            fichaFallback,

          relevante:
            fallbackRelevante,

          motivoRelevancia:
            fallbackRelevante
              ? "A análise por IA falhou, mas foram encontrados sinais fortes de uma comunicação de viagem."
              : "A análise por IA falhou antes de ser possível determinar a relevância.",

          porIa: false,

          nota:
            `A análise automática não foi concluída: ${erroFinal}`,
        };
      },
    );