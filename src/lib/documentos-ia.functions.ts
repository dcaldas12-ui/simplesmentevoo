import { createServerFn } from "@tanstack/react-start";

import {
  categoriaPorTexto,
  categoriaValida,
  fichaVazia,
  type CategoriaDocumento,
  type FichaDocumento,
} from "./documentos";

export type AnaliseDocumentoAnexo = {
  /** Nome original do anexo. */
  nome: string;

  /** MIME type efetivo do conteúdo. */
  mimeType: string;

  /** Conteúdo em data URL. */
  data: string;
};

export type AnaliseDocumentoPassageiro = {
  nome: string;
  apelido: string;
};

export type AnaliseDocumentoViagem = {
  titulo: string;
  origem: string;
  destino: string;
  dataInicio: string;
  dataFim: string;
  numeroPassageiros?: number | null;
  passageiros?: AnaliseDocumentoPassageiro[] | null;
};

export type ModoAnaliseDocumento = "viagens" | "todos";

export type AnaliseDocumentoInput = {
  /** Nome do ficheiro ou assunto do email. */
  nome: string;

  /** Texto conhecido do documento ou corpo do email. */
  texto?: string | null;

  /** Imagem em data URL (image/*) para leitura visual, quando existir. */
  imagem?: string | null;

  /** PDF em data URL (application/pdf) para leitura estruturada, quando existir. */
  pdf?: string | null;

  /**
   * Anexos adicionais do mesmo email/documento.
   * O email e todos os anexos são tratados pela IA como um único conjunto.
   */
  anexos?: AnaliseDocumentoAnexo[] | null;

  /**
   * Modo de procura. No modo "viagens", usa as viagens existentes como
   * contexto temporal e semântico. No modo "todos", analisa a comunicação
   * sem esse filtro temporal.
   */
  modoAnalise?: ModoAnaliseDocumento;

  /** Viagens existentes usadas como contexto no modo personalizado. */
  viagens?: AnaliseDocumentoViagem[] | null;
};

export type EstadoExtracao =
  | "completa"
  | "parcial"
  | "insuficiente";

export type AnaliseDocumentoItem = {
  /** Categoria principal compatível com o modelo atual da aplicação. */
  categoria: CategoriaDocumento;

  /** Subtipo livre, útil para distinguir autocarro, comboio, ferry, aluguer de carro, etc. */
  subcategoria: string;

  /** Tipo concreto de documento/serviço. */
  ficha: FichaDocumento;

  /** Estado semântico calculado pela aplicação a partir dos dados extraídos. */
  estadoExtracao: EstadoExtracao;

  /** Campos mínimos que ainda faltam para a ficha ficar utilizável. */
  camposEmFalta: string[];
};

export type AnaliseDocumentoResultado = {
  /** Ficha principal, mantida por compatibilidade com a interface atual. */
  ficha: FichaDocumento;

  /** true quando a IA considera que o conteúdo tem utilidade concreta para uma viagem. */
  relevante: boolean;

  /** Explicação curta da decisão de relevância. */
  motivoRelevancia: string;

  /**
   * Entidades de viagem encontradas no conjunto email + anexos.
   * Pode haver mais do que uma no mesmo email.
   */
  itens: AnaliseDocumentoItem[];

  /** Estado semântico da ficha principal depois da validação da aplicação. */
  estadoExtracao: EstadoExtracao;

  /** Campos mínimos em falta na ficha principal. */
  camposEmFalta: string[];

  /** Nomes dos anexos que a IA considerou materialmente relevantes. */
  anexosRelevantes: string[];

  /** true quando a análise foi feita por IA; false quando houve fallback/erro. */
  porIa: boolean;

  /** Mensagem informativa para a interface/logs. */
  nota: string;
};

const MAX_TEXTO = 30_000;
const MAX_IMAGEM = 6_000_000;
const MAX_PDF = 12_000_000;
const MAX_ANEXOS = 8;
const MAX_ANEXO_IMAGEM = 6_000_000;
const MAX_ANEXO_PDF = 12_000_000;
const MAX_TOTAL_ANEXOS = 24_000_000;

const CHAVES_FICHA = Object.keys(
  fichaVazia,
) as Array<keyof FichaDocumento>;

const CHAVES_VALIDAS_POR_CONFIRMAR = new Set<
  keyof FichaDocumento
>(CHAVES_FICHA);

function limparTexto(
  valor: unknown,
  max = 200,
): string {
  return String(valor ?? "")
    .trim()
    .slice(0, max);
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extrairDataUrl(dataUrl: string): {
  mimeType: string;
  base64: string;
} | null {
  const separador = dataUrl.indexOf(",");

  if (separador <= 0) {
    return null;
  }

  const cabecalho = dataUrl.slice(0, separador);
  const mimeType =
    cabecalho
      .replace(/^data:/i, "")
      .split(";")[0]
      ?.trim()
      .toLowerCase() ?? "";
  const base64 = dataUrl
    .slice(separador + 1)
    .trim();

  if (!mimeType || !base64) {
    return null;
  }

  return {
    mimeType,
    base64,
  };
}

function anexoValido(
  nome: string,
  mimeType: string,
  data: string,
): boolean {
  if (!nome || !data.startsWith("data:")) {
    return false;
  }

  const mime = mimeType.toLowerCase().trim();

  if (mime.startsWith("image/")) {
    return data.length <= MAX_ANEXO_IMAGEM;
  }

  if (mime === "application/pdf") {
    return data.length <= MAX_ANEXO_PDF;
  }

  return false;
}

function validar(data: unknown): AnaliseDocumentoInput {
  const d = (data ?? {}) as Record<string, unknown>;

  const nome = limparTexto(
    d["nome"],
    200,
  );

  if (!nome) {
    throw new Error("Indique o nome do documento.");
  }

  const texto =
    typeof d["texto"] === "string" &&
    d["texto"].trim()
      ? d["texto"].slice(0, MAX_TEXTO)
      : null;

  const imagemBruta =
    typeof d["imagem"] === "string"
      ? d["imagem"].trim()
      : "";

  const imagem =
    imagemBruta.startsWith("data:image/") &&
    imagemBruta.length <= MAX_IMAGEM
      ? imagemBruta
      : null;

  const pdfBruto =
    typeof d["pdf"] === "string"
      ? d["pdf"].trim()
      : "";

  const pdf =
    pdfBruto.startsWith("data:application/pdf") &&
    pdfBruto.length <= MAX_PDF
      ? pdfBruto
      : null;

  const anexosEntrada = Array.isArray(
    d["anexos"],
  )
    ? d["anexos"]
    : [];

  const anexos: AnaliseDocumentoAnexo[] = [];
  let tamanhoTotal = 0;

  for (const valor of anexosEntrada) {
    if (
      !valor ||
      typeof valor !== "object"
    ) {
      continue;
    }

    const anexo =
      valor as Record<string, unknown>;

    const nomeAnexo = limparTexto(
      anexo["nome"],
      200,
    );
    const mimeType = limparTexto(
      anexo["mimeType"],
      120,
    ).toLowerCase();
    const data =
      typeof anexo["data"] === "string"
        ? anexo["data"].trim()
        : "";

    if (
      !anexoValido(
        nomeAnexo,
        mimeType,
        data,
      )
    ) {
      continue;
    }

    if (
      tamanhoTotal + data.length >
      MAX_TOTAL_ANEXOS
    ) {
      break;
    }

    anexos.push({
      nome: nomeAnexo,
      mimeType,
      data,
    });

    tamanhoTotal += data.length;

    if (anexos.length >= MAX_ANEXOS) {
      break;
    }
  }

  const modoAnalise: ModoAnaliseDocumento =
    d["modoAnalise"] === "viagens"
      ? "viagens"
      : "todos";

  const viagensEntrada = Array.isArray(
    d["viagens"],
  )
    ? d["viagens"]
    : [];

  const viagens: AnaliseDocumentoViagem[] = [];

  for (const valor of viagensEntrada.slice(0, 20)) {
    if (!valor || typeof valor !== "object") {
      continue;
    }

    const viagem = valor as Record<string, unknown>;
    const titulo = limparTexto(viagem["titulo"], 200);
    const origem = limparTexto(viagem["origem"], 120);
    const destino = limparTexto(viagem["destino"], 120);
    const dataInicio = limparTexto(viagem["dataInicio"], 20);
    const dataFim = limparTexto(viagem["dataFim"], 20);

    if (
      !titulo ||
      !origem ||
      !destino ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)
    ) {
      continue;
    }

    const numeroPassageirosBruto =
      viagem["numeroPassageiros"];
    const numeroPassageiros =
      typeof numeroPassageirosBruto === "number" &&
      Number.isFinite(numeroPassageirosBruto) &&
      numeroPassageirosBruto >= 1
        ? Math.floor(numeroPassageirosBruto)
        : null;

    const passageirosEntrada = Array.isArray(
      viagem["passageiros"],
    )
      ? viagem["passageiros"]
      : [];

    const passageiros = passageirosEntrada
      .slice(0, 20)
      .map((passageiro) => {
        if (!passageiro || typeof passageiro !== "object") {
          return null;
        }

        const p = passageiro as Record<string, unknown>;
        const nomePassageiro = limparTexto(
          p["nome"],
          100,
        );
        const apelido = limparTexto(
          p["apelido"],
          100,
        );

        if (!nomePassageiro && !apelido) {
          return null;
        }

        return {
          nome: nomePassageiro,
          apelido,
        };
      })
      .filter(
        (passageiro): passageiro is AnaliseDocumentoPassageiro =>
          passageiro !== null,
      );

    viagens.push({
      titulo,
      origem,
      destino,
      dataInicio,
      dataFim,
      numeroPassageiros,
      passageiros,
    });
  }

  return {
    nome,
    texto,
    imagem,
    pdf,
    anexos,
    modoAnalise,
    viagens,
  };
}

function nomeCategoria(
  categoria: CategoriaDocumento,
): string {
  switch (categoria) {
    case "voo":
      return "Reserva de voo";
    case "hotel":
      return "Reserva de alojamento";
    case "transporte":
      return "Reserva de transporte";
    case "transfer":
      return "Reserva de transfer";
    case "bilhete":
      return "Bilhete / atividade";
    case "documento":
      return "Documento de viagem";
    case "informacao":
      return "Informação de viagem";
    default:
      return "Documento";
  }
}

/**
 * Fallback local deliberadamente simples.
 * Não é o motor principal de interpretação: serve apenas para
 * manter a aplicação utilizável quando o Gemini falha ou não está disponível.
 */
function heuristica(input: AnaliseDocumentoInput): FichaDocumento {
  const base = `${input.nome}\n${input.texto ?? ""}`;
  const normalizado = normalizarTexto(base);
  const categoria = categoriaPorTexto(base);

  const referencia =
    /\b(?:PNR|booking|reservation|confirmation|referencia|reserva)?\s*[:#-]?\s*([A-Z0-9]{6})\b/i.exec(
      base,
    )?.[1] ?? "";

  const numeroVoo =
    /\b([A-Z]{2}\s?\d{2,4})\b/.exec(
      base,
    )?.[1]
      ?.replace(/\s/g, "") ?? "";

  const data =
    /\b(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?\b/.exec(
      base,
    );

  const linhas = base
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  let fornecedor = "";

  const linhaFornecedor =
    linhas.find((linha) => {
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
    tipoDocumento: nomeCategoria(
      categoria,
    ),
    fornecedor,
    operador: "",
    referencia,
    numeroVoo:
      categoria === "voo"
        ? numeroVoo
        : "",
    dataHora: data
      ? `${data[1] ?? ""}${data[2] ? `T${data[2]}` : ""}`
      : "",
    porConfirmar: "",
  };

  const porConfirmar: Array<keyof FichaDocumento> = [];

  if (categoria === "voo") {
    if (!ficha.origem) porConfirmar.push("origem");
    if (!ficha.destino) porConfirmar.push("destino");
  }

  if (
    /booking|reservation|reserva|confirmation|voucher|bilhete|ticket|boarding pass/i.test(
      normalizado,
    )
  ) {
    for (const chave of [
      "fornecedor",
      "passageiro",
      "dataHora",
      "referencia",
    ] as const) {
      if (!ficha[chave]) {
        porConfirmar.push(chave);
      }
    }
  }

  ficha.porConfirmar = Array.from(
    new Set(porConfirmar),
  ).join(",");

  return ficha;
}

function heuristicaRelevante(
  input: AnaliseDocumentoInput,
): boolean {
  const texto = normalizarTexto(
    `${input.nome}\n${input.texto ?? ""}`,
  );

  const fortementeTransacional = [
    "booking confirmation",
    "booking confirmed",
    "reservation confirmed",
    "reservation number",
    "confirmation number",
    "booking reference",
    "boarding pass",
    "boarding confirmation",
    "cartao de embarque",
    "numero da reserva",
    "referencia da reserva",
    "reserva confirmada",
    "pnr",
    "ticket confirmation",
    "bilhete confirmado",
  ];

  if (
    fortementeTransacional.some(
      (sinal) =>
        texto.includes(
          normalizarTexto(sinal),
        ),
    )
  ) {
    return true;
  }

  const temReferencia =
    /\b(?:pnr|booking(?: reference| code)?|reservation(?: number)?|confirmation(?: number)?|referencia(?: da)? reserva|numero da reserva)\b[\s:#-]*[A-Z0-9-]{4,20}\b/i.test(
      `${input.nome}\n${input.texto ?? ""}`,
    );

  const temData =
    /\b\d{4}-\d{2}-\d{2}\b/.test(texto) ||
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(
      texto,
    );

  const temNumeroVoo =
    /\b[A-Z]{2}\s?\d{2,4}\b/i.test(
      `${input.nome}\n${input.texto ?? ""}`,
    );

  const categoria = categoriaPorTexto(
    `${input.nome}\n${input.texto ?? ""}`,
  );

  return (
    temReferencia ||
    (categoria === "voo" &&
      temNumeroVoo &&
      temData) ||
    (categoria === "hotel" &&
      temData &&
      /hotel|check-in|check-out|reserva/.test(
        texto,
      )) ||
    (categoria === "transporte" &&
      temData &&
      /comboio|train|autocarro|bus|ferry|barco|bilhete/.test(
        texto,
      )) ||
    (categoria === "bilhete" &&
      temData &&
      /bilhete|ticket|entrada|ingresso|voucher/.test(
        texto,
      ))
  );
}

function limparListaPorConfirmar(
  bruto: unknown,
): string {
  const valores = Array.isArray(bruto)
    ? bruto
    : typeof bruto === "string"
      ? bruto.split(",")
      : [];

  return Array.from(
    new Set(
      valores
        .map((valor) =>
          String(valor ?? "")
            .trim(),
        )
        .filter((valor): valor is string =>
          Boolean(
            valor &&
              CHAVES_VALIDAS_POR_CONFIRMAR.has(
                valor as keyof FichaDocumento,
              ),
          ),
        ),
    ),
  ).join(",");
}

function limparFicha(
  bruto: unknown,
  nome: string,
): FichaDocumento {
  const o = (bruto ?? {}) as Record<
    string,
    unknown
  >;

  const ficha: FichaDocumento = {
    ...fichaVazia,
  };

  for (const chave of CHAVES_FICHA) {
    if (
      chave === "categoria" ||
      chave === "porConfirmar"
    ) {
      continue;
    }

    ficha[chave] = limparTexto(
      o[chave],
      chave === "condicoes" ||
      chave === "morada"
        ? 600
        : 200,
    );
  }

  ficha.categoria = categoriaValida(
    limparTexto(
      o["categoria"],
      30,
    ) || categoriaPorTexto(nome),
  );

  ficha.porConfirmar =
    limparListaPorConfirmar(
      o["porConfirmar"],
    );

  return ficha;
}

function possuiAlgumDado(
  ficha: FichaDocumento,
): boolean {
  return CHAVES_FICHA.some((chave) => {
    if (
      chave === "categoria" ||
      chave === "porConfirmar"
    ) {
      return false;
    }

    return Boolean(ficha[chave]?.trim());
  });
}

function camposMinimosPorCategoria(
  ficha: FichaDocumento,
): Array<keyof FichaDocumento> {
  switch (ficha.categoria) {
    case "voo":
      return [
        "origem",
        "destino",
        "dataHora",
      ];

    case "hotel":
      return [
        "local",
        "dataHora",
        "dataHoraFim",
      ];

    case "transporte":
      return [
        "origem",
        "destino",
        "dataHora",
      ];

    case "transfer":
      return [
        "origem",
        "destino",
        "dataHora",
      ];

    case "bilhete":
      return [
        "local",
        "dataHora",
      ];

    case "documento":
    case "informacao":
      return ["dataHora"];

    default:
      return [];
  }
}

function validarSemantica(
  ficha: FichaDocumento,
): {
  estado: EstadoExtracao;
  camposEmFalta: string[];
} {
  const minimos = camposMinimosPorCategoria(
    ficha,
  );

  const camposEmFalta = minimos
    .filter((chave) => !ficha[chave]?.trim())
    .map(String);

  if (!possuiAlgumDado(ficha)) {
    return {
      estado: "insuficiente",
      camposEmFalta,
    };
  }

  if (camposEmFalta.length === 0) {
    return {
      estado: "completa",
      camposEmFalta: [],
    };
  }

  return {
    estado: "parcial",
    camposEmFalta,
  };
}

function normalizarSubcategoria(
  bruto: unknown,
  ficha: FichaDocumento,
): string {
  const explicita = limparTexto(
    bruto,
    80,
  );

  if (explicita) {
    return explicita;
  }

  if (ficha.categoria !== "transporte") {
    return "";
  }

  const base = normalizarTexto(
    `${ficha.tipoDocumento} ${ficha.fornecedor} ${ficha.operador} ${ficha.condicoes}`,
  );

  if (/autocarro|bus|flixbus|rede expressos/.test(base)) {
    return "autocarro";
  }

  if (
    /comboio|train|ferroviario|cp |intercidades|alfa pendular/.test(
      base,
    )
  ) {
    return "comboio";
  }

  if (/ferry|barco/.test(base)) {
    return "ferry";
  }

  if (/metro/.test(base)) {
    return "metro";
  }

  if (/aluguer de carro|car rental|rental car/.test(base)) {
    return "aluguer de carro";
  }

  return "";
}

function transformarEntidades(
  bruto: unknown,
  nome: string,
): AnaliseDocumentoItem[] {
  const raiz = (bruto ?? {}) as Record<
    string,
    unknown
  >;

  const lista = Array.isArray(
    raiz["entidades"],
  )
    ? raiz["entidades"]
    : [];

  const entidades: AnaliseDocumentoItem[] = [];

  for (const valor of lista.slice(0, 8)) {
    if (
      !valor ||
      typeof valor !== "object"
    ) {
      continue;
    }

    const entidade =
      valor as Record<string, unknown>;
    const ficha = limparFicha(
      entidade,
      nome,
    );

    if (!possuiAlgumDado(ficha)) {
      continue;
    }

    const semantica =
      validarSemantica(ficha);

    entidades.push({
      categoria:
        categoriaValida(
          ficha.categoria,
        ),
      subcategoria:
        normalizarSubcategoria(
          entidade["subcategoria"],
          ficha,
        ),
      ficha,
      estadoExtracao:
        semantica.estado,
      camposEmFalta:
        semantica.camposEmFalta,
    });
  }

  return entidades;
}

function combinarItensComFichaRaiz(
  dadosIa: Record<string, unknown>,
  nome: string,
): AnaliseDocumentoItem[] {
  const entidades =
    transformarEntidades(
      dadosIa,
      nome,
    );

  if (entidades.length > 0) {
    return entidades;
  }

  const ficha = limparFicha(
    dadosIa,
    nome,
  );

  if (!possuiAlgumDado(ficha)) {
    return [];
  }

  const semantica =
    validarSemantica(ficha);

  return [
    {
      categoria:
        categoriaValida(
          ficha.categoria,
        ),
      subcategoria:
        normalizarSubcategoria(
          "",
          ficha,
        ),
      ficha,
      estadoExtracao:
        semantica.estado,
      camposEmFalta:
        semantica.camposEmFalta,
    },
  ];
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
      const parsed = JSON.parse(
        candidato,
      );

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<
          string,
          unknown
        >;
      }
    } catch {
      // Tentamos encontrar um objeto JSON dentro do texto.
    }
  }

  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");

  if (inicio >= 0 && fim > inicio) {
    try {
      const parsed = JSON.parse(
        bruto.slice(inicio, fim + 1),
      );

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<
          string,
          unknown
        >;
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
    }>;
  };

  const candidato =
    resposta.candidates?.[0];

  if (!candidato) {
    throw new Error(
      "A API Gemini não devolveu nenhum candidato de resposta.",
    );
  }

  const textos = (
    candidato.content?.parts ?? []
  )
    .map((part) =>
      typeof part?.text === "string"
        ? part.text
        : "",
    )
    .filter(Boolean);

  const texto = textos
    .join("\n")
    .trim();

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

  const mensagem =
    raiz.choices?.[0]?.message;
  const argumentos =
    mensagem?.tool_calls?.[0]?.function
      ?.arguments;

  if (typeof argumentos === "string") {
    return extrairJsonDaResposta(
      argumentos,
    );
  }

  if (
    argumentos &&
    typeof argumentos === "object"
  ) {
    return argumentos as Record<
      string,
      unknown
    >;
  }

  return extrairJsonDaResposta(
    obterConteudoResposta(json),
  );
}

const PROPRIEDADES_FICHA = {
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
      "Categoria principal da entidade.",
  },
  subcategoria: {
    type: "string",
    description:
      "Subtipo da entidade. Em transporte distingue, por exemplo, autocarro, comboio, ferry, barco, metro ou aluguer de carro.",
  },
  tipoDocumento: {
    type: "string",
    description:
      "Tipo concreto: reserva, confirmação, cartão de embarque, e-ticket, voucher, recibo, alteração, cancelamento, etc.",
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
      "Local principal: hotel, aeroporto, estação, atração, recinto, ponto de recolha, etc.",
  },
  referencia: {
    type: "string",
    description:
      "Referência da reserva, PNR, booking code, confirmation number ou outro identificador explícito.",
  },
  dataHora: {
    type: "string",
    description:
      "Data/hora principal. Usa AAAA-MM-DDTHH:MM quando a hora existir; se só a data estiver explicitamente disponível, usa AAAA-MM-DD sem inventar uma hora.",
  },
  dataHoraFim: {
    type: "string",
    description:
      "Data/hora final relevante. Para hotel normalmente check-out; para transporte/voo chegada; para atividade fim quando existir.",
  },
  codigo: {
    type: "string",
    description:
      "Código textual, de barras ou QR quando estiver efetivamente legível; nunca inventar o conteúdo de um QR.",
  },
  companhia: {
    type: "string",
    description:
      "Companhia aérea, quando aplicável.",
  },
  numeroVoo: {
    type: "string",
    description:
      "Número do voo, por exemplo TP1234 ou FR1234, quando estiver explicitamente presente.",
  },
  origem: {
    type: "string",
    description:
      "Origem efetivamente indicada no conteúdo, como código IATA e/ou nome do aeroporto, estação ou local de partida.",
  },
  destino: {
    type: "string",
    description:
      "Destino efetivamente indicado no conteúdo, como código IATA e/ou nome do aeroporto, estação ou local de chegada.",
  },
  horaEmbarque: {
    type: "string",
    description:
      "Data/hora de embarque ou apresentação quando existir explicitamente.",
  },
  terminal: {
    type: "string",
    description:
      "Terminal quando existir.",
  },
  porta: {
    type: "string",
    description:
      "Porta/gate quando existir.",
  },
  assento: {
    type: "string",
    description:
      "Assento/lugar atribuído quando existir.",
  },
  grupoEmbarque: {
    type: "string",
    description:
      "Grupo/zona/prioridade de embarque quando existir.",
  },
  bagagem: {
    type: "string",
    description:
      "Condições de bagagem efetivamente apresentadas.",
  },
  morada: {
    type: "string",
    description:
      "Morada relevante do hotel, alojamento, recolha ou outro local.",
  },
  quarto: {
    type: "string",
    description:
      "Quarto/tipologia quando aplicável.",
  },
  condicoes: {
    type: "string",
    description:
      "Condições relevantes: pagamento, cancelamento, alterações, regras, requisitos ou outras notas.",
  },
  contacto: {
    type: "string",
    description:
      "Telefone, email ou outro contacto relevante.",
  },
  porConfirmar: {
    type: "array",
    items: {
      type: "string",
    },
    description:
      "Nomes dos campos cujo valor está ambíguo, incompleto ou precisa de confirmação humana. Não incluir campos claramente visíveis.",
  },
} as const;

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
        "Explicação curta e factual da decisão.",
    },
    anexosRelevantes: {
      type: "array",
      description:
        "Nomes exatos dos anexos que contêm informação de viagem concreta e materialmente útil. Ignora imagens de assinatura, logos, elementos decorativos e outros anexos sem valor de viagem.",
      items: {
        type: "string",
      },
    },
    entidades: {
      type: "array",
      description:
        "Todas as entidades de viagem distintas que aparecem no email e nos anexos. Um email com ida e volta pode ter várias entidades.",
      items: {
        type: "object",
        properties:
          PROPRIEDADES_FICHA,
        required: Object.keys(
          PROPRIEDADES_FICHA,
        ),
      },
    },
  },
  required: [
    "relevante",
    "motivoRelevancia",
    "anexosRelevantes",
    "entidades",
  ],
} as const;

function limparAnexosRelevantes(
  bruto: unknown,
  input: AnaliseDocumentoInput,
): string[] {
  if (!Array.isArray(bruto)) {
    return [];
  }

  const anexos = input.anexos ?? [];
  const porNomeNormalizado = new Map<string, string>();

  for (const anexo of anexos) {
    const nome = anexo.nome.trim();
    if (nome) {
      porNomeNormalizado.set(
        normalizarTexto(nome),
        nome,
      );
    }
  }

  const resultado: string[] = [];
  const vistos = new Set<string>();

  for (const valor of bruto.slice(0, 8)) {
    const nome = limparTexto(valor, 200);
    if (!nome) {
      continue;
    }

    const canonico =
      porNomeNormalizado.get(
        normalizarTexto(nome),
      );

    if (!canonico) {
      continue;
    }

    const chave = normalizarTexto(canonico);
    if (vistos.has(chave)) {
      continue;
    }

    vistos.add(chave);
    resultado.push(canonico);
  }

  return resultado;
}

function nomeAnexoIgnorado(nome: string): boolean {
  const normalizado = normalizarTexto(nome);

  return /(\bimage\d*\b|\bspacer\b|\bsignature\b|\bassinatura\b|\blogo\b|\btracking\b|\bfacebook\b|\binstagram\b|\bfooter\b)/i.test(
    normalizado,
  );
}

function deslocarDataIso(
  data: string,
  dias: number,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data;
  }

  const valor = new Date(`${data}T00:00:00Z`);
  if (Number.isNaN(valor.getTime())) {
    return data;
  }

  valor.setUTCDate(valor.getUTCDate() + dias);
  return valor.toISOString().slice(0, 10);
}

/**
 * A API Gemini aplica limites por projeto, incluindo pedidos por minuto.
 * Como a interface pode analisar vários emails em paralelo, as chamadas
 * passam por uma fila neste módulo para evitar vários pedidos simultâneos.
 *
 * Mantemos uma margem abaixo de um limite de 20 RPM:
 * no máximo um pedido Gemini a cada 4 segundos.
 */
const GEMINI_INTERVALO_MS = 4_000;
let proximoPedidoGemini = 0;
let filaGemini: Promise<void> = Promise.resolve();

function esperar(milisegundos: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milisegundos);
  });
}

async function aguardarTurnoGemini(): Promise<void> {
  const turno = filaGemini.then(async () => {
    const agora = Date.now();
    const esperaNecessaria = Math.max(
      0,
      proximoPedidoGemini - agora,
    );

    if (esperaNecessaria > 0) {
      await esperar(esperaNecessaria);
    }

    proximoPedidoGemini =
      Date.now() + GEMINI_INTERVALO_MS;
  });

  filaGemini = turno.catch(() => undefined);
  await turno;
}

function obterEsperaRetryAfter(
  resposta: Response,
): number | null {
  const valor = resposta.headers.get("retry-after");

  if (!valor) {
    return null;
  }

  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) {
    return Math.min(
      Math.max(segundos * 1000, 4_000),
      60_000,
    );
  }

  const data = Date.parse(valor);
  if (!Number.isNaN(data)) {
    return Math.min(
      Math.max(data - Date.now(), 4_000),
      60_000,
    );
  }

  return null;
}


function contextoViagensParaPrompt(
  input: AnaliseDocumentoInput,
): string {
  const viagens = input.viagens ?? [];

  if (input.modoAnalise !== "viagens") {
    return "Modo de análise: todos os emails. Não existe filtro temporal por viagem.";
  }

  if (viagens.length === 0) {
    return [
      "Modo de análise: procurar relação com as viagens do utilizador.",
      "Não foram fornecidas viagens válidas como contexto. Neste caso, não atribuas uma comunicação a uma viagem inexistente; avalia apenas se existe informação concreta de viagem.",
    ].join("\n");
  }

  const linhas = [
    "Modo de análise: procurar informação relacionada com as viagens existentes do utilizador.",
    "As datas são o principal eixo de relevância. Para cada viagem, considera como janela de análise a data de início menos 2 dias até à data de fim mais 2 dias.",
    "Uma reserva, serviço, bilhete ou documento com apenas parte do intervalo dentro dessa janela pode ser relevante. Não é necessário que o serviço cubra toda a viagem.",
    "Origem e destino da viagem são pistas complementares e nunca são uma condição obrigatória por si só.",
    "Se uma comunicação concreta estiver claramente fora de todas as janelas temporais das viagens, considera-a irrelevante neste modo, mesmo que seja relacionada com viagens.",
    "Quando não existir uma data clara no conteúdo, usa nomes de passageiros, locais, fornecedor e outros indícios explícitos apenas como contexto complementar; não inventes uma associação.",
    "VIAGENS EXISTENTES:",
  ];

  for (const viagem of viagens) {
    const janelaInicio = deslocarDataIso(
      viagem.dataInicio,
      -2,
    );
    const janelaFim = deslocarDataIso(
      viagem.dataFim,
      2,
    );

    const passageiros = (
      viagem.passageiros ?? []
    )
      .map((passageiro) =>
        `${passageiro.nome} ${passageiro.apelido}`.trim(),
      )
      .filter(Boolean);

    linhas.push(
      [
        `- Título: ${viagem.titulo}`,
        `  Origem: ${viagem.origem}`,
        `  Destino: ${viagem.destino}`,
        `  Período da viagem: ${viagem.dataInicio} a ${viagem.dataFim}`,
        `  Janela de análise: ${janelaInicio} a ${janelaFim}`,
        viagem.numeroPassageiros
          ? `  Número de passageiros: ${viagem.numeroPassageiros}`
          : "  Número de passageiros: não indicado",
        passageiros.length > 0
          ? `  Passageiros identificados: ${passageiros.join(", ")}`
          : "  Passageiros identificados: nenhum nome indicado",
      ].join("\n"),
    );
  }

  return linhas.join("\n");
}

function textoParaPrompt(
  input: AnaliseDocumentoInput,
): string {
  return [
    contextoViagensParaPrompt(input),
    `Assunto/nome: ${input.nome}`,
    input.texto
      ? `Conteúdo textual:\n${input.texto}`
      : "",
    input.anexos && input.anexos.length > 0
      ? `Anexos disponíveis: ${input.anexos
          .map((anexo) => anexo.nome)
          .join(", ")}`
      : "Anexos disponíveis: nenhum",
    `Data de hoje: ${new Date()
      .toISOString()
      .slice(0, 10)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function criarPartesGemini(
  input: AnaliseDocumentoInput,
): Array<Record<string, unknown>> {
  const partes: Array<
    Record<string, unknown>
  > = [
    {
      text: criarPrompt(
        input,
      ),
    },
  ];

  const candidatos: Array<{
    nome: string;
    mimeType: string;
    data: string;
  }> = [];

  if (input.imagem) {
    const parsed = extrairDataUrl(
      input.imagem,
    );

    if (
      parsed?.mimeType.startsWith("image/")
    ) {
      candidatos.push({
        nome: `${input.nome} — imagem`,
        mimeType: parsed.mimeType,
        data: parsed.base64,
      });
    }
  }

  if (input.pdf) {
    const parsed = extrairDataUrl(
      input.pdf,
    );

    if (
      parsed?.mimeType ===
      "application/pdf"
    ) {
      candidatos.push({
        nome: `${input.nome} — PDF`,
        mimeType: parsed.mimeType,
        data: parsed.base64,
      });
    }
  }

  for (const anexo of input.anexos ?? []) {
    const parsed = extrairDataUrl(
      anexo.data,
    );

    if (!parsed) {
      continue;
    }

    const mimeType =
      anexo.mimeType || parsed.mimeType;

    if (
      !mimeType.startsWith("image/") &&
      mimeType !== "application/pdf"
    ) {
      continue;
    }

    candidatos.push({
      nome: anexo.nome,
      mimeType,
      data: parsed.base64,
    });
  }

  const vistos = new Set<string>();

  for (const candidato of candidatos) {
    const chave = `${candidato.mimeType}:${candidato.data.slice(0, 64)}:${candidato.data.length}`;

    if (vistos.has(chave)) {
      continue;
    }

    vistos.add(chave);

    partes.push({
      inlineData: {
        mimeType:
          candidato.mimeType,
        data: candidato.data,
      },
    });
  }

  return partes;
}

function criarPrompt(
  input: AnaliseDocumentoInput,
): string {
  return [
    textoParaPrompt(input),
    "",
    "Analisa este conjunto de informação para a aplicação de viagens ViatOrbis.",
    "",
    "O email e todos os anexos fornecidos pertencem ao mesmo contexto. Lê o conteúdo textual e os anexos em conjunto e cruza a informação entre eles antes de decidir.",
    "",
    "OBJETIVO PRINCIPAL",
    "Decide se existe informação concreta, específica e potencialmente útil para uma viagem do utilizador.",
    "",
    "Considera relevantes comunicações como reservas, confirmações, bilhetes, cartões de embarque, vouchers, alterações, cancelamentos, recibos/comprovativos ligados a uma compra e instruções operacionais de um serviço ou viagem específica.",
    "",
    "Considera irrelevantes newsletters, publicidade, campanhas, descontos, ofertas genéricas, inspiração, conteúdo editorial, recomendações genéricas e mensagens comerciais que não correspondam a uma operação ou serviço concreto.",
    "",
    "Não marques como relevante apenas porque aparecem palavras como hotel, flight, travel, booking, destination, aeroporto, viagem ou turismo.",
    "",
    input.modoAnalise === "viagens"
      ? "No modo personalizado, a relação com as viagens existentes deve respeitar as janelas temporais indicadas no contexto. A data é o principal eixo de decisão; a origem/destino e os passageiros são pistas complementares."
      : "No modo de análise de todos os emails, não uses as datas das viagens existentes como filtro e procura comunicações concretas de viagem em qualquer período.",
    "",
    "IMPORTANTE SOBRE INTERVALOS",
    "Não procures apenas acontecimentos que atravessem toda a viagem. Uma viagem de 10 a 20 de agosto pode ter um hotel de 10 a 12, outro de 12 a 16 e outro de 16 a 20; cada serviço deve poder ser identificado como entidade própria quando existir material suficiente.",
    "Um serviço que intersecte apenas uma parte da janela de análise pode ser relevante. Um serviço claramente fora de todas as janelas do contexto não deve ser sugerido no modo personalizado.",
    "",
    "ANEXOS",
    "Analisa também visualmente e estruturalmente os PDFs e imagens fornecidos. Decide individualmente quais os anexos que contêm informação concreta de viagem materialmente útil.",
    "Na saída anexosRelevantes, usa apenas os nomes exatos dos anexos fornecidos. Não inventes nomes.",
    "Ignora anexos que sejam apenas assinaturas, logótipos, elementos decorativos, separadores, imagens de tracking ou outros elementos sem informação útil de viagem, mesmo que estejam tecnicamente anexados ao email. Um nome como image001.jpg, por exemplo, não deve ser marcado como relevante só por existir.",
    "Se o email contiver informação concreta mas nenhum anexo tiver valor próprio, relevante pode ser true e anexosRelevantes deve ser uma lista vazia.",
    "",
    "ENTIDADES",
    "Extrai todas as entidades de viagem distintas e materialmente úteis encontradas no conjunto email + anexos. Se o mesmo serviço aparecer no email e num anexo, junta a informação numa única entidade em vez de criar duplicados.",
    "Um email pode conter mais de uma entidade. Por exemplo, uma confirmação pode conter voo de ida e voo de regresso; uma reserva pode combinar transporte e hotel; uma alteração pode referir um serviço já existente.",
    "",
    "EXTRAÇÃO",
    "Extrai apenas informação efetivamente presente no texto ou legível nas imagens/PDFs.",
    "Nunca inventes cidades, aeroportos, datas, horas, passageiros, referências, códigos, preços ou outros dados.",
    "Não deduzas uma rota apenas a partir de um número de voo, de uma companhia aérea, de uma cidade mencionada noutra parte do email ou de conhecimento externo.",
    "Não transformes uma data sem hora numa hora inventada. Quando só a data estiver disponível, usa AAAA-MM-DD.",
    "Para voos procura, quando existirem: passageiro, companhia, número do voo, origem, destino, partida, chegada, embarque, terminal, porta, assento, grupo, bagagem e referência/PNR.",
    "Para hotéis procura, quando existirem: fornecedor, hóspede, nome do alojamento, morada, check-in, check-out, referência, quarto/tipologia, condições e contacto.",
    "Para transportes procura, quando existirem: operador, fornecedor, passageiro, origem, destino, partida, chegada, referência, lugar e subtipo do transporte.",
    "Para transfers procura, quando existirem: fornecedor, operador, passageiro, recolha/origem, destino, data/hora, referência, morada e contacto.",
    "Para bilhetes/atividades procura, quando existirem: entidade/fornecedor, titular, local/evento, data/hora, fim, referência, código, condições e contacto.",
    "Para documentos ou informação operacional procura a informação concreta que possa ser útil numa viagem específica.",
    "",
    "POR CONFIRMAR",
    "Inclui em porConfirmar apenas os nomes dos campos que estão ambíguos, incompletos, parcialmente ilegíveis ou que precisam de validação humana. Campos claramente presentes não devem aparecer nessa lista.",
    "",
    "SAÍDA",
    "Responde apenas com JSON válido de acordo com o esquema fornecido. Não uses markdown nem texto fora do JSON.",
  ].join("\n");
}

function anexosRelevantesFallback(
  input: AnaliseDocumentoInput,
): string[] {
  return (input.anexos ?? [])
    .filter((anexo) => !nomeAnexoIgnorado(anexo.nome))
    .map((anexo) => anexo.nome)
    .slice(0, 8);
}

function resultadoFallback(
  data: AnaliseDocumentoInput,
  mensagem: string,
): AnaliseDocumentoResultado {
  const ficha = heuristica(data);
  const semantica =
    validarSemantica(ficha);
  const relevante =
    heuristicaRelevante(data);
  const item: AnaliseDocumentoItem = {
    categoria:
      categoriaValida(
        ficha.categoria,
      ),
    subcategoria:
      normalizarSubcategoria(
        "",
        ficha,
      ),
    ficha,
    estadoExtracao:
      semantica.estado,
    camposEmFalta:
      semantica.camposEmFalta,
  };

  return {
    ficha,
    relevante,
    motivoRelevancia:
      relevante
        ? "A análise por IA não ficou disponível, mas foram encontrados sinais locais de uma comunicação concreta de viagem."
        : "A análise por IA não ficou disponível e não foram encontrados sinais locais suficientes de uma comunicação concreta de viagem.",
    itens: relevante
      ? [item]
      : [],
    estadoExtracao:
      semantica.estado,
    camposEmFalta:
      semantica.camposEmFalta,
    anexosRelevantes: relevante
      ? anexosRelevantesFallback(data)
      : [],
    porIa: false,
    nota: mensagem,
  };
}

export const analisarDocumento =
  createServerFn({ method: "POST" })
    .inputValidator(validar)
    .handler(
      async (
        { data }: { data: AnaliseDocumentoInput },
      ): Promise<AnaliseDocumentoResultado> => {
        const apiKey =
          process.env["GEMINI_API_KEY"];

        if (!apiKey) {
          console.error(
            "analisarDocumento: GEMINI_API_KEY não está disponível.",
          );

          return resultadoFallback(
            data,
            "A IA não está disponível. Foi usado um reconhecimento local provisório.",
          );
        }

        const partesGemini =
          criarPartesGemini(data);

        const maxTentativas = 2;
        let ultimoErro: unknown = null;

        for (
          let tentativa = 1;
          tentativa <= maxTentativas;
          tentativa++
        ) {
          try {
            await aguardarTurnoGemini();

            const resposta =
              await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
                {
                  method: "POST",
                  headers: {
                    "x-goog-api-key":
                      apiKey,
                    "Content-Type":
                      "application/json",
                  },
                  body: JSON.stringify({
                    systemInstruction: {
                      parts: [
                        {
                          text:
                            "És o motor de interpretação de documentos de viagem do ViatOrbis. A tua função é compreender o conteúdo fornecido, identificar entidades concretas de viagem e extrair apenas dados suportados pelo material. Email e anexos devem ser analisados em conjunto. Não inventes nem completes com conhecimento externo.",
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
                      maxOutputTokens: 5000,
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
                  corpo: corpo.slice(
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
                const esperaRetryAfter =
                  obterEsperaRetryAfter(resposta);

                if (tentativa < maxTentativas) {
                  await esperar(
                    esperaRetryAfter ??
                      10_000,
                  );
                }

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
              json = JSON.parse(
                corpo,
              );
            } catch {
              throw new Error(
                "A API Gemini devolveu uma resposta que não é JSON válido.",
              );
            }

            const dadosIa =
              extrairDadosEstruturadosDaResposta(
                json,
              );

            const relevante =
              dadosIa["relevante"] === true;

            const motivoIa =
              typeof dadosIa[
                "motivoRelevancia"
              ] === "string"
                ? limparTexto(
                    dadosIa[
                      "motivoRelevancia"
                    ],
                    500,
                  )
                : "";

            const anexosRelevantes =
              limparAnexosRelevantes(
                dadosIa["anexosRelevantes"],
                data,
              );

            const itens =
              relevante
                ? combinarItensComFichaRaiz(
                    dadosIa,
                    data.nome,
                  )
                : [];

            const ficha =
              itens[0]?.ficha ?? {
                ...fichaVazia,
              };
            const estadoExtracao =
              itens[0]?.estadoExtracao ??
              "insuficiente";
            const camposEmFalta =
              itens[0]?.camposEmFalta ??
              [];

            const motivoRelevancia =
              motivoIa ||
              (relevante
                ? "Foi identificada uma comunicação concreta relacionada com uma viagem."
                : "Não foi identificada uma comunicação concreta relacionada com uma viagem.");

            return {
              ficha,
              relevante,
              motivoRelevancia,
              itens,
              estadoExtracao,
              camposEmFalta,
              anexosRelevantes,
              porIa: true,
              nota: relevante
                ? itens.length > 1
                  ? `Email considerado relevante e analisado por IA. Foram encontradas ${itens.length} entidades de viagem; confirme os dados antes de guardar.`
                  : ficha.porConfirmar
                    ? "Email considerado relevante e analisado por IA. Alguns campos precisam de confirmação."
                    : estadoExtracao ===
                        "completa"
                      ? "Email considerado relevante e analisado por IA. A ficha principal tem os campos mínimos necessários."
                      : "Email considerado relevante e analisado por IA, mas a ficha principal está incompleta e deve ser confirmada."
                : "Email analisado por IA e considerado irrelevante para uma viagem.",
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
                mensagem.includes("(429)")
                  ? 10_000
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
            : String(
                ultimoErro ??
                  "Erro desconhecido.",
              );

        return resultadoFallback(
          data,
          `A análise automática por IA não foi concluída: ${erroFinal}`,
        );
      },
    );
