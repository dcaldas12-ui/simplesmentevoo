import { createServerFn } from "@tanstack/react-start";

import {
  pesquisar,
  gerarCombinacoes,
  type PesquisaInput,
  type ResultadoPesquisa,
} from "./flight-engine";
import {
  pedirDuffel,
  estadoDuffel,
} from "./duffel.server";

function dias(valor: unknown): number {
  return Math.max(0, Math.min(7, Math.round(Number(valor ?? 0) || 0)));
}

function validar(data: unknown): PesquisaInput {
  const d = (data ?? {}) as Record<string, unknown>;

  const origem = String(d["origem"] ?? "").trim().toUpperCase();
  const destino = String(d["destino"] ?? "").trim().toUpperCase();
  const dataPartida = String(d["dataPartida"] ?? "").trim();
  const dataRegresso = d["dataRegresso"]
    ? String(d["dataRegresso"]).trim()
    : null;

  if (!origem || !destino) {
    throw new Error("Indique a origem e o destino.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPartida)) {
    throw new Error("Data de partida inválida.");
  }

  if (
    dataRegresso &&
    !/^\d{4}-\d{2}-\d{2}$/.test(dataRegresso)
  ) {
    throw new Error("Data de regresso inválida.");
  }

  if (dataRegresso && dataRegresso < dataPartida) {
    throw new Error(
      "A data de regresso não pode ser anterior à data de partida.",
    );
  }

  const duracaoBruta =
    Number(d["duracaoMaxima"] ?? 0) || 0;

  const duracaoMaxima =
  duracaoBruta > 0
    ? Math.min(60, Math.round(duracaoBruta))
    : null;

const passageiros =
  Math.max(
    1,
    Math.min(
      9,
      Number(d["passageiros"] ?? 1) || 1,
    ),
  );

const idadesPassageiros = Array.isArray(
  d["idadesPassageiros"],
)
  ? d["idadesPassageiros"]
      .map((idade) => Number(idade))
      .filter(
        (idade) =>
          Number.isInteger(idade) &&
          idade >= 0 &&
          idade <= 17,
      )
  : [];

if (idadesPassageiros.length > passageiros - 1) {
  throw new Error(
    "O número de menores não pode ser superior ao número de passageiros menos um adulto.",
  );
}

return {
    origem,
    destino,
    dataPartida,
    dataRegresso,
    idaAntes: dias(d["idaAntes"]),
    idaDepois: dias(d["idaDepois"]),
    regressoAntes: dias(d["regressoAntes"]),
    regressoDepois: dias(d["regressoDepois"]),
    duracaoMaxima,
    passageiros,
    idadesPassageiros,
    apenasDiretos: Boolean(d["apenasDiretos"]),
  };
}

type DuffelOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  slices?: Array<{
    segments?: Array<{
      departing_at?: string;
      arriving_at?: string;
      duration?: string;
      operating_carrier?: {
        name?: string;
      };
      operating_carrier_flight_number?: string;
    }>;
  }>;
};

function minutosDuracao(valor?: string): number {
  if (!valor) return 0;

  const horas = Number(
    valor.match(/(\d+)H/)?.[1] ?? 0,
  );

  const minutos = Number(
    valor.match(/(\d+)M/)?.[1] ?? 0,
  );

  return horas * 60 + minutos;
}

async function procurarDuffel(
  data: PesquisaInput,
): Promise<ResultadoPesquisa> {
  const { combos, geradas } = gerarCombinacoes(data);

  if (combos.length === 0) {
    return {
      ofertas: [],
      combinacoesGeradas: geradas,
      combinacoesValidas: 0,
      combinacoesConsultadas: 0,
      criterios: [],
      precoMinimo: null,
      precoMediano: null,
      fonte: "api",
      fornecedor: "Duffel",
      estadoFornecedor: "ativo",
      aviso: "Nenhuma combinação de datas válida.",
    };
  }

  const todas: ReturnType<typeof Object.assign>[] = [];
  const combosParaConsultar = combos;
  console.log(
  "[Duffel] combinações:",
  "geradas =", geradas,
  "válidas =", combos.length,
  "a consultar =", combosParaConsultar.length,
);

  for (const combo of combosParaConsultar) {
    const slices: Array<{
      origin: string;
      destination: string;
      departure_date: string;
    }> = [
      {
        origin: data.origem,
        destination: data.destino,
        departure_date: combo.partida,
      },
    ];

    if (combo.regresso) {
      slices.push({
        origin: data.destino,
        destination: data.origem,
        departure_date: combo.regresso,
      });
    }

    const resposta = (await pedirDuffel(
      "/air/offer_requests?supplier_timeout=10000",
      {
        data: {
          cabin_class: "economy",
          slices,
          passengers: [
  ...Array.from(
    {
      length:
        data.passageiros -
        (data.idadesPassageiros?.length ?? 0),
    },
    () => ({ type: "adult" }),
  ),
  ...(data.idadesPassageiros ?? []).map(
    (idade) => ({ age: idade }),
  ),
],
          ...(data.apenasDiretos
            ? { max_connections: 0 }
            : {}),
        },
      },
    )) as {
      data?: {
        offers?: DuffelOffer[];
      };
    };

const ofertas = resposta.data?.offers ?? [];

const mapeadas = ofertas.map((oferta) => {
  const ida = oferta.slices?.[0];
  const regresso = oferta.slices?.[1];

  const segmentosIda = ida?.segments ?? [];
  const segmentosRegresso = regresso?.segments ?? [];

  const primeiroSegmento = segmentosIda[0];
  const ultimoSegmento =
    segmentosIda[segmentosIda.length - 1];

  const primeiroSegmentoRegresso = segmentosRegresso[0];
  const ultimoSegmentoRegresso =
    segmentosRegresso[segmentosRegresso.length - 1];

  const precoTotal =
    Number(oferta.total_amount) || 0;

  const duracaoIda = segmentosIda.reduce(
    (total, segmento) =>
      total + minutosDuracao(segmento.duration),
    0,
  );

  const duracaoRegresso = segmentosRegresso.reduce(
    (total, segmento) =>
      total + minutosDuracao(segmento.duration),
    0,
  );

  const escalasIda = Math.max(
    0,
    segmentosIda.length - 1,
  );

  const escalasRegresso = Math.max(
    0,
    segmentosRegresso.length - 1,
  );

  return {
    id: `${oferta.id}-${combo.partida}-${combo.regresso ?? "OW"}`,
    origem: data.origem,
    destino: data.destino,
    dataPartida: combo.partida,
    dataRegresso: combo.regresso,

    companhia:
      primeiroSegmento?.operating_carrier?.name ??
      "Companhia aérea",

    numeroVoo:
      primeiroSegmento?.operating_carrier_flight_number ??
      "",

    horaPartida:
      primeiroSegmento?.departing_at?.slice(11, 16) ??
      "",

    horaChegada:
      ultimoSegmento?.arriving_at?.slice(11, 16) ??
      "",

    duracaoMin: duracaoIda,
    escalas: escalasIda,

    horaPartidaRegresso:
  primeiroSegmentoRegresso?.departing_at?.slice(11, 16) ??
  "",

horaChegadaRegresso:
  ultimoSegmentoRegresso?.arriving_at?.slice(11, 16) ??
  "",

companhiaRegresso:
  primeiroSegmentoRegresso?.operating_carrier?.name ??
  "",

numeroVooRegresso:
  primeiroSegmentoRegresso?.operating_carrier_flight_number ??
  "",

duracaoMinRegresso: duracaoRegresso,
    escalasRegresso,

    precoPorPassageiro:
      data.passageiros > 0
        ? Math.round(
            (precoTotal / data.passageiros) * 100,
          ) / 100
        : precoTotal,

    precoTotal,
    moeda: oferta.total_currency,
    bagagemIncluida: false,
    reservavel: true,
    deeplink: null,
    precoIndisponivel: false,
    fonte: "api" as const,
  };
});

  todas.push(...mapeadas);

}

  todas.sort(
    (a, b) =>
      a.precoTotal - b.precoTotal ||
      a.duracaoMin - b.duracaoMin,
  );

  const ofertas = todas;

  const precos = ofertas.map(
    (oferta) => oferta.precoTotal,
  );

  let precoMediano: number | null = null;

  if (precos.length > 0) {
    const ordenados = [...precos].sort(
      (a, b) => a - b,
    );

    const meio = Math.floor(
      ordenados.length / 2,
    );

    precoMediano =
      ordenados.length % 2 === 0
        ? Math.round(
            ((ordenados[meio - 1] +
              ordenados[meio]) /
              2) *
              100,
          ) / 100
        : ordenados[meio];
  }

  return {
    ofertas,
    combinacoesGeradas: geradas,
    combinacoesValidas: combos.length,
    combinacoesConsultadas: combosParaConsultar.length,
    criterios: [],
    precoMinimo:
      precos.length > 0
        ? precos[0]
        : null,
    precoMediano,
    fonte: "api",
    fornecedor: "Duffel",
    estadoFornecedor: "ativo",
  };
}

export const pesquisarVoos = createServerFn({
  method: "POST",
})
  .inputValidator(validar)
  .handler(async ({ data }): Promise<ResultadoPesquisa> => {
    const estado = estadoDuffel();

    if (!estado.configurado) {
      return pesquisar(data, {
        estadoFornecedor: "nao_configurado",
        emFalta: ["DUFFEL_ACCESS_TOKEN"],
        aviso: "Ligação à Duffel não configurada.",
      });
    }

    try {
      return await procurarDuffel(data);
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Falha na ligação à Duffel.";

      const limiteAtingido =
        mensagem.includes("429") ||
        mensagem.includes("rate_limit_exceeded");

      const combinacoes = gerarCombinacoes(data);

      return {
        ofertas: [],
        combinacoesGeradas: combinacoes.geradas,
        combinacoesValidas: 0,
        combinacoesConsultadas: 0,
        criterios: [],
        precoMinimo: null,
        precoMediano: null,
        fonte: "api",
        fornecedor: "Duffel",
        estadoFornecedor: limiteAtingido ? "limite" : "erro",
        aviso: limiteAtingido
          ? "A pesquisa atingiu temporariamente o limite de pedidos da Duffel. Aguarde alguns segundos e tente novamente."
          : mensagem,
      };
    }
  });