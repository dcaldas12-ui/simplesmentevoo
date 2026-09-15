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
 * Barreira local de precisão para a descoberta automática de emails.
 *
 * A IA pode reconhecer corretamente que um email fala de viagens e,
 * ainda assim, marcar como relevante uma campanha, promoção ou evento
 * genérico. Esta segunda validação exige sinais concretos de uma
 * comunicação transacional/operacional de viagem.
 *
 * Não usa os campos extraídos pela IA para decidir a relevância, porque
 * esses campos podem ser preenchidos antes de termos a certeza de que
 * existe uma reserva/bilhete real.
 */
function validarRelevanciaEstrita(
  input: AnaliseDocumentoInput,
): {
  relevante: boolean;
  motivoRelevancia: string;
} {
  const texto = normalizarTexto(
    `${input.nome}\n${input.texto ?? ""}`,
  );

  const temData =
    /\b\d{4}-\d{2}-\d{2}\b/.test(texto) ||
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(texto) ||
    /\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\s+\d{1,2}\b/.test(
      texto,
    );

  const temNumeroVoo =
    /\b[A-Z]{2}\s?\d{2,4}\b/i.test(texto);

  const temReferencia =
    /\b(?:pnr|booking\s*(?:code|reference|number)?|reservation\s*(?:code|reference|number)?|confirmation\s*(?:code|number)?|referencia(?:\s+da)?\s+reserva|referência(?:\s+da)?\s+reserva|numero\s+da\s+reserva|número\s+da\s+reserva)\b[\s:#-]*[A-Z0-9-]{4,20}\b/i.test(
      texto,
    ) ||
    /\bPNR\s*[:#-]?\s*[A-Z0-9]{5,12}\b/i.test(texto);

  const temReserva =
    /\b(?:reserva|reservado|reservada|booking|booked|reservation|reserved|confirmacao|confirmação|confirmation|confirmed|confirmado|confirmada)\b/i.test(
      texto,
    );

  const temBilhete =
    /\b(?:bilhete|bilhetes|ticket|tickets|e-ticket|eticket|voucher|ingresso|ingressos|entrada|entradas|boarding pass|boarding confirmation|cartao de embarque|cartão de embarque)\b/i.test(
      texto,
    );

  const temOperacional =
    /\b(?:check-in|check in|check-out|check out|embarque|embarcar|gate|porta de embarque|terminal|departure|departure time|arrival|arrival time|partida|chegada|passenger|passageiro|guest|hospede|hóspede|seat|assento|lugar|bagagem|itinerary|itinerario|itinerário|your flight|seu voo|your booking|sua reserva|your reservation|sua estadia|your stay)\b/i.test(
      texto,
    );

  const temViagem =
    /\b(?:flight|voo|hotel|hostel|alojamento|apartment|apartamento|resort|train|comboio|ferrovia|rail|bus|autocarro|onibus|ônibus|ferry|barco|cruise|cruzeiro|transfer|airport|aeroporto|station|estacao|estação|car rental|aluguer de carro|rent a car|museu|museum|tour|excursao|excursão|excursion|attraction|atracao|atração|bilheteira|theatre|teatro|concert|concerto|festival|parque|park|aquarium|aquario|aquário|zoo|monument|monumento|exhibition|exposicao|exposição|event|evento)\b/i.test(
      texto,
    );

  const temConteudoComercial =
    /\b(?:sale|sales|desconto|descontos|discount|discounts|promo|promotion|promocao|promoção|promotions|campaign|campanha|campaigns|newsletter|oferta|ofertas|offer|offers|deal|deals|special offer|special offers|20%|30%|40%|50%|save now|last chance|shop now|compre agora|aproveite|loyalty|fidelidade)\b/i.test(
      texto,
    );

  const temEventoGenerico =
    /\b(?:faltam?\s+\d+\s+(?:dias|mes|meses|weeks|days)|fal\w*\s+\d+\s+(?:mes|meses|dias)|descubra|discover|apresenta|presents|em breve|coming soon|este\s+m[eê]s|este\s+fim\s+de\s+semana|this weekend|save the date)\b/i.test(
      texto,
    );

  /*
   * Campanhas e eventos genéricos só passam se houver simultaneamente
   * evidência transacional muito forte. Isto bloqueia, por exemplo,
   * "LOYALTY SALE -20%" ou "Rádio Macau no Porto! FALTA 1 MÊS!".
   */
  if (
    (temConteudoComercial || temEventoGenerico) &&
    !temReserva &&
    !temBilhete &&
    !temReferencia
  ) {
    return {
      relevante: false,
      motivoRelevancia:
        "Conteúdo promocional ou evento genérico sem reserva, bilhete ou serviço de viagem concreto.",
    };
  }

  /*
   * Reserva/bilhete + contexto de viagem é o caso principal.
   */
  if (
    (temReserva || temBilhete || temReferencia) &&
    temViagem
  ) {
    return {
      relevante: true,
      motivoRelevancia:
        "Foi identificada uma reserva, bilhete ou comunicação transacional relacionada com uma viagem.",
    };
  }

  /*
   * Algumas comunicações operacionais não dizem explicitamente "reserva",
   * mas identificam claramente um serviço específico.
   */
  if (
    temOperacional &&
    temViagem &&
    (temData || temNumeroVoo || temReferencia)
  ) {
    return {
      relevante: true,
      motivoRelevancia:
        "Foi identificada informação operacional concreta relacionada com uma viagem.",
    };
  }

  /*
   * Um número de voo isolado só vale quando aparece com contexto de viagem.
   */
  if (
    temNumeroVoo &&
    temViagem &&
    (temData || temOperacional)
  ) {
    return {
      relevante: true,
      motivoRelevancia:
        "Foi identificado um voo específico associado a informação de viagem.",
    };
  }

  return {
    relevante: false,
    motivoRelevancia:
      "Não foram encontradas evidências suficientes de uma reserva, bilhete ou serviço de viagem concreto.",
  };
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
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const content =
    resposta.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textos = content
      .map((part) => {
        if (
          part &&
          typeof part === "object" &&
          "text" in part
        ) {
          return String(
            (part as { text?: unknown }).text ?? "",
          );
        }

        return "";
      })
      .filter(Boolean);

    return textos.join("\n");
  }

  throw new Error(
    "A resposta do gateway não contém message.content.",
  );
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

        const fichaFallback =
          heuristica(data);

        const fallbackRelevancia =
          validarRelevanciaEstrita(data);

        const fallbackRelevante =
          fallbackRelevancia.relevante;

        if (!apiKey) {
          console.error(
            "analisarDocumento: LOVABLE_API_KEY não está disponível.",
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

        const conteudo: Array<Record<string, unknown>> = [
          {
            type: "text",
            text: [
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
              "Não basta aparecerem palavras como hotel, flight, travel, booking ou aeroporto. Procura evidência concreta de uma viagem ou serviço específico.",
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

        const maxTentativas = 3;

        let ultimoErro: unknown = null;

        for (
          let tentativa = 1;
          tentativa <= maxTentativas;
          tentativa++
        ) {
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
                  temperature: 0,
                  max_tokens: 2500,
                  messages: [
                    {
                      role: "system",
                      content:
                        "És um assistente especializado em interpretar emails de viagens. Analisa com rigor, não inventes dados e responde apenas com JSON válido.",
                    },
                    {
                      role: "user",
                      content: conteudo,
                    },
                  ],
                }),
              },
            );

            const corpo =
              await resposta.text();

            if (!resposta.ok) {
              console.error(
                "analisarDocumento gateway",
                {
                  tentativa,
                  status: resposta.status,
                  statusText:
                    resposta.statusText,
                  corpo: corpo.slice(0, 2000),
                },
              );

              if (resposta.status === 402) {
                throw new Error(
                  "A análise por IA está indisponível no gateway (402).",
                );
              }

              if (resposta.status === 429) {
                throw new Error(
                  "A análise por IA foi temporariamente limitada pelo gateway (429).",
                );
              }

              throw new Error(
                `O gateway de IA devolveu ${resposta.status}: ${corpo.slice(0, 500)}`,
              );
            }

            let json: unknown;

            try {
              json = JSON.parse(corpo);
            } catch {
              console.error(
                "analisarDocumento: resposta do gateway não é JSON",
                corpo.slice(0, 2000),
              );

              throw new Error(
                "O gateway devolveu uma resposta que não é JSON válido.",
              );
            }

            const textoResposta =
              obterConteudoResposta(json);

            const dadosIa =
              extrairJsonDaResposta(
                textoResposta,
              );

            const ficha =
              limpar(
                dadosIa,
                data.nome,
              );

            const decisaoIa =
              dadosIa["relevante"] === true;

            const relevanciaEstrita =
              validarRelevanciaEstrita(data);

            const relevante =
              decisaoIa &&
              relevanciaEstrita.relevante;

            const motivoIa =
              typeof dadosIa[
                "motivoRelevancia"
              ] === "string" &&
              String(
                dadosIa["motivoRelevancia"],
              ).trim()
                ? String(
                    dadosIa["motivoRelevancia"],
                  )
                    .trim()
                    .slice(0, 500)
                : "";

            const motivoRelevancia =
              relevante
                ? motivoIa ||
                  relevanciaEstrita.motivoRelevancia
                : relevanciaEstrita.motivoRelevancia;

            return {
              ficha,
              relevante,
              motivoRelevancia,
              porIa: true,
              nota: relevante
                ? ficha.porConfirmar
                  ? "Email considerado relevante e analisado por IA. Alguns campos precisam de confirmação."
                  : "Email considerado relevante e analisado por IA. Confirme os dados antes de guardar."
                : "Email analisado por IA, mas não passou a validação de precisão para uma comunicação concreta de viagem.",
            };
          } catch (erro) {
            ultimoErro = erro;

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
              mensagem.includes("(402)")
            ) {
              break;
            }

            if (
              tentativa < maxTentativas
            ) {
              const espera =
                mensagem.includes("(429)")
                  ? 2000 * tentativa
                  : 1000 * tentativa;

              await new Promise(
                (resolve) =>
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
            : String(ultimoErro ?? "Erro desconhecido.");

        /*
         * Muito importante:
         * uma falha da IA NÃO é apresentada internamente como
         * "a IA decidiu que o email era irrelevante".
         *
         * Mantemos um fallback local apenas para que um email
         * claramente transacional continue identificável.
         */
        return {
          ficha: fichaFallback,
          relevante: fallbackRelevante,
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