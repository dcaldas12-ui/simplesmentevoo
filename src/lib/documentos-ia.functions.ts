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
function relevanciaHeuristica(
  input: AnaliseDocumentoInput,
  ficha: FichaDocumento,
): { relevante: boolean; motivoRelevancia: string } {
  const base = normalizarTexto(`${input.nome}\n${input.texto ?? ""}`);

  const termosPromocionais = [
    "newsletter",
    "promocao",
    "promocional",
    "oferta",
    "desconto",
    "black friday",
    "sale",
    "campaign",
    "marketing",
    "inspiracao de viagem",
    "descubra",
    "melhores destinos",
    "inspire-se",
    "inspire se",
  ];

  const termosViagem = [
    "voo",
    "flight",
    "companhia aerea",
    "airline",
    "hotel",
    "alojamento",
    "hospedagem",
    "comboio",
    "train",
    "autocarro",
    "bus",
    "transfer",
    "ferry",
    "bilhete",
    "ticket",
    "boarding pass",
    "cartao de embarque",
    "itinerario",
    "itinerary",
    "reserva",
    "reservation",
    "booking",
    "pnr",
    "voucher",
    "check-in",
    "check in",
    "check-out",
    "check out",
    "passageiro",
    "passenger",
    "hospede",
    "guest",
  ];

  const termosFortes = [
    "confirmacao de reserva",
    "confirmacao da reserva",
    "reserva confirmada",
    "booking confirmation",
    "reservation confirmation",
    "booking reference",
    "reservation number",
    "confirmation number",
    "booking code",
    "codigo da reserva",
    "numero da reserva",
    "referencia da reserva",
    "booking reference",
    "pnr",
    "voucher",
    "boarding pass",
    "cartao de embarque",
    "bilhete emitido",
    "bilhete confirmado",
    "ticket issued",
    "ticket confirmation",
    "your booking",
    "your reservation",
    "your flight",
    "seu voo",
    "o seu voo",
    "sua reserva",
    "a sua reserva",
    "passageiro",
    "passenger",
    "hospede",
    "guest",
    "check-in",
    "check in",
    "check-out",
    "check out",
    "alteracao do voo",
    "alteracao de voo",
    "alteracao da reserva",
    "alteracao de reserva",
    "cancelamento do voo",
    "cancelamento da reserva",
    "voo cancelado",
    "voo atrasado",
    "flight cancelled",
    "flight delayed",
    "gate",
    "porta de embarque",
    "hora de embarque",
    "embarque",
  ];

  const termosReservaFracos = [
    "reserva",
    "reservado",
    "reservada",
    "confirmacao",
    "confirmation",
    "booking",
  ];

  const promocional = termosPromocionais.some((termo) =>
    base.includes(termo),
  );

  const dominioViagem = termosViagem.some((termo) =>
    base.includes(termo),
  );

  const sinalForte = termosFortes.some((termo) =>
    base.includes(termo),
  );

  const sinalReservaFraco = termosReservaFracos.some((termo) =>
    base.includes(termo),
  );

  const referencia = Boolean(ficha.referencia?.trim());
  const dataHora = Boolean(ficha.dataHora?.trim());
  const dataHoraFim = Boolean(ficha.dataHoraFim?.trim());
  const numeroVoo = Boolean(ficha.numeroVoo?.trim());
  const origem = Boolean(ficha.origem?.trim());
  const destino = Boolean(ficha.destino?.trim());
  const local = Boolean(ficha.local?.trim());
  const morada = Boolean(ficha.morada?.trim());
  const fornecedor = Boolean(ficha.fornecedor?.trim());
  const operador = Boolean(ficha.operador?.trim());
  const codigo = Boolean(ficha.codigo?.trim());
  const passageiro = Boolean(ficha.passageiro?.trim());

  const temData = dataHora || dataHoraFim;
  const temRota = origem && destino;
  const temIdentificador = referencia || codigo || numeroVoo;

  /*
   * A heurística é deliberadamente conservadora.
   * Uma palavra como "hotel", "ticket", "flight" ou "reserva" não prova
   * que o email diga respeito ao utilizador. É necessária uma combinação
   * de sinais de uma reserva/serviço concreto e dados estruturados.
   */
  if (promocional && !sinalForte) {
    return {
      relevante: false,
      motivoRelevancia:
        "Comunicação promocional, newsletter ou publicidade sem uma operação concreta.",
    };
  }

  if (!dominioViagem) {
    return {
      relevante: false,
      motivoRelevancia:
        "Não foram encontrados sinais suficientes de uma viagem ou serviço de viagem.",
    };
  }

  const contextoReserva =
    sinalForte ||
    (sinalReservaFraco && (referencia || numeroVoo || passageiro));

  if (!contextoReserva) {
    return {
      relevante: false,
      motivoRelevancia:
        "Há referências a viagens, mas não existe evidência suficiente de uma reserva, bilhete ou serviço concreto do utilizador.",
    };
  }

  const categoria = ficha.categoria;

  if (categoria === "voo") {
    const evidenciaVoo =
      numeroVoo ||
      temRota ||
      (temData && fornecedor) ||
      (temIdentificador && (sinalForte || passageiro));

    if (!evidenciaVoo) {
      return {
        relevante: false,
        motivoRelevancia:
          "Foram encontradas referências a voo, mas faltam dados concretos que confirmem uma viagem.",
      };
    }
  } else if (categoria === "hotel") {
    const evidenciaHotel =
      (temData && (fornecedor || local || morada)) ||
      (referencia && (fornecedor || local)) ||
      (sinalForte && (fornecedor || local));

    if (!evidenciaHotel) {
      return {
        relevante: false,
        motivoRelevancia:
          "Foram encontradas referências a alojamento, mas não há evidência suficiente de uma reserva concreta.",
      };
    }
  } else if (
    categoria === "transporte" ||
    categoria === "transfer"
  ) {
    const evidenciaTransporte =
      (temRota && temData) ||
      (temIdentificador && (fornecedor || operador)) ||
      (sinalForte && (temData || temRota || fornecedor || operador));

    if (!evidenciaTransporte) {
      return {
        relevante: false,
        motivoRelevancia:
          "Foram encontradas referências a transporte, mas não há dados suficientes de um serviço concreto.",
      };
    }
  } else if (categoria === "bilhete") {
    const evidenciaBilhete =
      (temIdentificador && (local || fornecedor)) ||
      (temData && (local || fornecedor)) ||
      (sinalForte && (temData || local || referencia || codigo));

    if (!evidenciaBilhete) {
      return {
        relevante: false,
        motivoRelevancia:
          "Foram encontradas referências a bilhetes ou atividades, mas não há evidência suficiente de uma compra ou entrada do utilizador.",
      };
    }
  } else if (categoria === "documento") {
    const evidenciaDocumento =
      temIdentificador ||
      (sinalForte && (temData || fornecedor || passageiro));

    if (!evidenciaDocumento) {
      return {
        relevante: false,
        motivoRelevancia:
          "O conteúdo não apresenta dados suficientes para ser tratado como documento de viagem.",
      };
    }
  } else if (categoria === "informacao") {
    const evidenciaInformacao =
      sinalForte &&
      (temData ||
        temRota ||
        local ||
        fornecedor ||
        operador ||
        temIdentificador);

    if (!evidenciaInformacao) {
      return {
        relevante: false,
        motivoRelevancia:
          "A mensagem contém referências a viagem, mas não informação operacional suficientemente específica.",
      };
    }
  } else {
    const evidenciaGenerica =
      temIdentificador ||
      (sinalForte && (temData || local || fornecedor || operador));

    if (!evidenciaGenerica) {
      return {
        relevante: false,
        motivoRelevancia:
          "Não foram encontrados dados suficientes de um serviço ou evento concreto.",
      };
    }
  }

  return {
    relevante: true,
    motivoRelevancia:
      "Foram encontrados sinais de uma reserva, bilhete, serviço ou comunicação operacional concreta.",
  };
}

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
          const ficha = heuristica(data);
          const relevancia = relevanciaHeuristica(data, ficha);

          return {
            ficha,
            relevante: relevancia.relevante,
            motivoRelevancia: relevancia.motivoRelevancia,
            porIa: false,
            nota:
              "Leitura automática simples. Reveja e complete os campos.",
          };
        }

        const conteudo:
          Array<Record<string, unknown>> = [
          {
            type: "text",

            text: [
              `Nome do documento/email: ${data.nome}`,

              data.texto
                ? `Conteúdo disponível:\n${data.texto}`
                : "",

              `Data de hoje: ${new Date()
                .toISOString()
                .slice(0, 10)}.`,

              "Analisa este conteúdo como um documento ou email relacionado com uma viagem.",

              "O objetivo é identificar uma reserva, bilhete, serviço de transporte, alojamento, transfer, atividade, documento ou informação útil para uma viagem.",

              "Não assumes que um email é uma reserva apenas porque contém palavras como booking, flight, hotel, travel, ticket, evento ou atividade. Distingue sempre entre uma comunicação genérica sobre algo que existe e uma comunicação que efetivamente diz respeito ao utilizador, à sua reserva, ao seu bilhete, à sua viagem ou a uma ação concreta que ele tenha realizado.",

              "A primeira decisão é a relevância. Marca relevante=true apenas quando existir uma relação concreta, útil e suficientemente comprovada com uma viagem ou evento do utilizador. São relevantes: confirmações de reserva, compras, bilhetes, vouchers, cartões de embarque, itinerários, reservas de hotel, transportes, transfers, inscrições/entradas em eventos e comunicações operacionais dirigidas ao viajante. Também pode ser relevante uma informação específica de uma viagem já identificada, como alteração de horário, instruções de embarque, morada, check-in ou requisitos.",

              "MUITO IMPORTANTE: não marques como relevante uma newsletter, publicidade, campanha, promoção, recomendação, artigo, convite genérico ou anúncio de um evento só porque contém uma data, um local, o nome de uma cidade, um museu, um espetáculo, um concerto, um transporte, um hotel, a palavra ticket ou outras palavras relacionadas com viagens. Um evento público com data e local, mas sem indicação de que o utilizador comprou, reservou, se inscreveu ou recebeu uma entrada, deve ser considerado informação genérica e relevante=false.",

              "Não confundas 'há bilhetes disponíveis' com 'o utilizador tem um bilhete'. Não confundas 'este evento acontece em 11/09' com 'o utilizador vai ao evento em 11/09'. Não confundas uma oferta de hotel ou voo com uma reserva. Não inferir interesse ou participação apenas a partir do nome do destinatário, de uma data, de uma localização ou do nome de uma entidade.",

              "Procura sinais fortes de relação com o utilizador: confirmação, reserva efetiva, compra, pagamento, voucher, código/PNR, número de reserva, bilhete emitido, boarding pass, passageiro/hóspede identificado, itinerário atribuído, lugar/assento, check-in, inscrição confirmada, alteração de uma reserva existente ou instruções operacionais para uma viagem concreta. Se estes sinais não existirem, sê conservador e marca relevante=false.",

              "Quando relevante=false, não tentes transformar a mensagem numa reserva nem preencher campos por associação. Explica resumidamente em motivoRelevancia porque foi descartada.",

              "Um email de um museu, espetáculo, concerto, tour, atividade ou transporte pode ser relevante mesmo sem a palavra reserva, mas deve existir evidência de que é uma entrada/compra/inscrição do utilizador ou uma comunicação operacional sobre uma atividade/serviço concreto que lhe diz respeito. Informação pública ou promocional sobre o evento, mesmo com data e local, não é suficiente.",

              "Se houver uma reserva concreta, extrai todos os dados disponíveis e relevantes.",

              "Para um voo: passageiro, companhia, número do voo, origem, destino, aeroportos IATA, data e hora de partida, chegada, hora de embarque, terminal, porta, assento, grupo de embarque, bagagem, referência/PNR e código QR ou código de barras quando estiver disponível.",

              "Para um hotel: nome do alojamento, fornecedor, hóspede, morada, check-in, check-out, referência, quarto/tipologia, condições e contacto.",

              "Para um transporte: operador, fornecedor, passageiro, origem, destino, data/hora de partida e chegada, referência, lugar e outras informações disponíveis.",

              "Para um transfer: fornecedor/operador, passageiro, local de recolha, destino, data/hora, referência, morada e contacto.",

              "Para um bilhete ou atividade: entidade, passageiro/titular, local, data/hora, data/hora de fim, referência, código de entrada e condições.",

              "Para documentos de viagem: identifica o tipo de documento, entidade emissora, titular, referência, datas e condições relevantes.",

              "Para informações: extrai apenas informações úteis para a viagem, como horários, moradas, instruções, regras, contactos, requisitos ou procedimentos.",

              "Se existirem várias datas, distingue a data de emissão/envio da data efetiva da viagem.",

              "Se existirem várias referências ou códigos, identifica como referência o código principal da reserva e coloca códigos adicionais nas condições quando forem relevantes.",

              "Nunca inventes nomes, datas, horas, códigos, aeroportos, números de voo ou outros dados.",

              "Usa strings vazias quando um campo não estiver indicado.",

              "Quando um valor for apenas inferido, ambíguo ou pouco legível, coloca o nome desse campo em porConfirmar.",

              "Se o ano não estiver indicado numa data, considera o contexto do documento/email e assinala a data em porConfirmar em vez de inventar um ano com confiança.",

              "Responde exclusivamente através da função registar_ficha.",
            ]
              .filter(Boolean)
              .join("\n"),
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
          const resposta = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",

              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                model:
                  "google/gemini-2.5-flash",

                messages: [
                  {
                    role: "system",

                    content:
                      "És um assistente especializado em interpretar documentos e emails de viagem em português. Devolve apenas dados estruturados através da função indicada. Nunca inventes informação. Sê conservador na decisão de relevância: só deves mostrar emails que tenham uma relação concreta e comprovada com uma viagem, reserva, bilhete, evento ou serviço que diga respeito ao utilizador. Publicidade, newsletters, campanhas e anúncios genéricos devem ser marcados como irrelevantes. A existência de uma data, local ou entidade relacionada com viagens não prova que o utilizador tenha uma reserva ou participação.",
                  },

                  {
                    role: "user",
                    content: conteudo,
                  },
                ],

                tools: [
                  {
                    type: "function",

                    function: {
                      name: "registar_ficha",

                      description:
                        "Regista os dados estruturados extraídos de um documento ou email de viagem.",

                      parameters:
                        ESQUEMA,
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

          if (
            resposta.status === 429
          ) {
            const ficha = heuristica(data);
            const relevancia = relevanciaHeuristica(data, ficha);

            return {
              ficha,
              relevante: relevancia.relevante,
              motivoRelevancia: relevancia.motivoRelevancia,
              porIa: false,
              nota:
                "A análise automática está temporariamente indisponível. Reveja os dados apresentados.",
            };
          }

          if (
            resposta.status === 402
          ) {
            const ficha = heuristica(data);
            const relevancia = relevanciaHeuristica(data, ficha);

            return {
              ficha,
              relevante: relevancia.relevante,
              motivoRelevancia: relevancia.motivoRelevancia,
              porIa: false,
              nota:
                "A análise automática não está disponível neste momento. Reveja e complete os campos.",
            };
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

          const dadosIa = JSON.parse(args) as Record<string, unknown>;
          const ficha = limpar(
            dadosIa,
            data.nome,
          );
          const relevanciaHeuristicaResultado =
            relevanciaHeuristica(data, ficha);

          const relevancia =
            dadosIa["relevante"] === true &&
            relevanciaHeuristicaResultado.relevante;

          const motivoRelevancia =
            !relevancia && !relevanciaHeuristicaResultado.relevante
              ? relevanciaHeuristicaResultado.motivoRelevancia
              : typeof dadosIa["motivoRelevancia"] === "string" &&
                  dadosIa["motivoRelevancia"].trim()
                ? dadosIa["motivoRelevancia"].trim()
                : "A IA identificou um elemento concreto relacionado com uma viagem ou evento.";

          return {
            ficha,
            relevante: relevancia,
            motivoRelevancia,
            porIa: true,

            nota: ficha.porConfirmar
              ? "Dados lidos automaticamente. Alguns campos precisam de confirmação."
              : "Dados lidos automaticamente. Confirme antes de guardar.",
          };
        } catch (erro) {
          console.error(
            "analisarDocumento",
            erro,
          );

          const ficha = heuristica(data);
          const relevancia = relevanciaHeuristica(data, ficha);

          return {
            ficha,
            relevante: relevancia.relevante,
            motivoRelevancia: relevancia.motivoRelevancia,
            porIa: false,
            nota:
              "Não foi possível ler o conteúdo automaticamente. Complete ou confirme a ficha manualmente.",
          };
        }
      },
    );