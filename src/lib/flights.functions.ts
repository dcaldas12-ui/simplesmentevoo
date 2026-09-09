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

  const duracaoMinimaBruta =
    Number(d["duracaoMinima"] ?? 0) || 0;

  const duracaoMaximaBruta =
    Number(d["duracaoMaxima"] ?? 0) || 0;

  const duracaoMinima =
    duracaoMinimaBruta > 0
      ? Math.min(60, Math.round(duracaoMinimaBruta))
      : null;

  const duracaoMaxima =
    duracaoMaximaBruta > 0
      ? Math.min(60, Math.round(duracaoMaximaBruta))
      : null;

  if (
    duracaoMinima !== null &&
    duracaoMaxima !== null &&
    duracaoMinima > duracaoMaxima
  ) {
    throw new Error(
      "A duração mínima não pode ser superior à duração máxima.",
    );
  }

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

      const primeiroSegmentoRegresso =
        segmentosRegresso[0];

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
          primeiroSegmentoRegresso?.departing_at?.slice(
            11,
            16,
          ) ?? "",

        horaChegadaRegresso:
          ultimoSegmentoRegresso?.arriving_at?.slice(
            11,
            16,
          ) ?? "",

        companhiaRegresso:
          primeiroSegmentoRegresso?.operating_carrier
            ?.name ?? "",

        numeroVooRegresso:
          primeiroSegmentoRegresso
            ?.operating_carrier_flight_number ?? "",

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

/* =========================================================
   SUGESTÕES DE AEROPORTOS E CIDADES
   ========================================================= */

export type SugestaoLugar = {
  id: string;
  tipo: "airport" | "city";
  nome: string;
  cidade: string;
  codigoIata: string;
  codigoCidade: string | null;
  pais: string | null;
};

type DuffelPlace = {
  id?: string;
  type?: "airport" | "city";
  name?: string;
  city_name?: string | null;
  iata_code?: string;
  iata_city_code?: string | null;
  iata_country_code?: string | null;
};

function normalizarLugar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/*
 * O Duffel trabalha com os nomes oficiais dos lugares.
 * Para alguns nomes em português, enviamos também o nome
 * internacional mais comum quando a primeira pesquisa
 * não encontra resultados suficientemente relevantes.
 */
const ALIASES_LUGARES: Record<string, string> = {
  milao: "Milan",
  londres: "London",
  munique: "Munich",
  veneza: "Venice",
  "florença": "Florence",
  florenca: "Florence",
  napoles: "Naples",
  "nápoles": "Naples",
  sevilha: "Seville",
  "nova iorque": "New York",
  "nova york": "New York",
  bruxelas: "Brussels",
  viena: "Vienna",
  praga: "Prague",
  varsovia: "Warsaw",
  "varsóvia": "Warsaw",
  estocolmo: "Stockholm",
  copenhaga: "Copenhagen",
  atenas: "Athens",
  zurique: "Zurich",
  genebra: "Geneva",
  colónia: "Cologne",
  colonia: "Cologne",
  hamburgo: "Hamburg",
  estugarda: "Stuttgart",
  dusseldorf: "Dusseldorf",
  "düsseldorf": "Dusseldorf",
  manchester: "Manchester",
  edimburgo: "Edinburgh",
  dublin: "Dublin",
};

function obterConsultasLugar(query: string): string[] {
  const original = query.trim();
  const normalizada = normalizarLugar(original);
  const consultas = [original];

  const alias = ALIASES_LUGARES[normalizada];

  if (alias && normalizarLugar(alias) !== normalizada) {
    consultas.push(alias);
  }

  return Array.from(new Set(consultas));
}

function lugarCorresponde(
  lugar: DuffelPlace,
  consulta: string,
): boolean {
  const q = normalizarLugar(consulta);

  if (!q) {
    return false;
  }

  const nome = normalizarLugar(lugar.name ?? "");
  const cidade = normalizarLugar(lugar.city_name ?? "");
  const iata = normalizarLugar(lugar.iata_code ?? "");
  const cidadeIata = normalizarLugar(
    lugar.iata_city_code ?? "",
  );

  return (
    iata === q ||
    cidadeIata === q ||
    nome === q ||
    cidade === q ||
    iata.startsWith(q) ||
    cidadeIata.startsWith(q) ||
    nome.startsWith(q) ||
    cidade.startsWith(q) ||
    nome.includes(q) ||
    cidade.includes(q)
  );
}

function pontuacaoLugar(
  lugar: DuffelPlace,
  consulta: string,
): number {
  const q = normalizarLugar(consulta);
  const nome = normalizarLugar(lugar.name ?? "");
  const cidade = normalizarLugar(lugar.city_name ?? "");
  const iata = normalizarLugar(lugar.iata_code ?? "");
  const cidadeIata = normalizarLugar(
    lugar.iata_city_code ?? "",
  );

  if (iata === q || cidadeIata === q) return 100;
  if (nome === q || cidade === q) return 95;
  if (iata.startsWith(q) || cidadeIata.startsWith(q)) return 90;
  if (nome.startsWith(q) || cidade.startsWith(q)) return 80;
  if (nome.includes(q) || cidade.includes(q)) return 70;

  return 0;
}

function mapearLugar(
  lugar: DuffelPlace,
): SugestaoLugar | null {
  if (!lugar.iata_code || !lugar.name) {
    return null;
  }

  return {
    id:
      lugar.id ??
      `${lugar.type ?? "airport"}-${lugar.iata_code}`,
    tipo:
      lugar.type === "city"
        ? "city"
        : "airport",
    nome: lugar.name,
    cidade:
      lugar.city_name ??
      lugar.name,
    codigoIata: lugar.iata_code,
    codigoCidade:
      lugar.iata_city_code ?? null,
    pais:
      lugar.iata_country_code ?? null,
  };
}

export const sugerirLugares = createServerFn({
  method: "GET",
})
  .validator((valor: unknown) => {
    const query = String(
      (valor as { query?: unknown })?.query ?? "",
    )
      .trim()
      .slice(0, 80);

    if (query.length < 2) {
      return { query: "" };
    }

    return { query };
  })
  .handler(
    async ({
      data,
    }): Promise<SugestaoLugar[]> => {
      if (!data.query) {
        return [];
      }

      const estado = estadoDuffel();

      if (!estado.configurado) {
        return [];
      }

      try {
        const consultas = obterConsultasLugar(
          data.query,
        );

        const resultados: DuffelPlace[] = [];
        const vistos = new Set<string>();

        for (const consulta of consultas) {
          const resposta = (await pedirDuffel(
            `/places/suggestions?query=${encodeURIComponent(consulta)}`,
          )) as {
            data?: DuffelPlace[];
          };

          for (const lugar of resposta.data ?? []) {
            const chave =
              lugar.id ??
              `${lugar.type ?? "airport"}-${lugar.iata_code ?? lugar.name}`;

            if (vistos.has(chave)) {
              continue;
            }

            /*
             * O endpoint do Duffel já faz a pesquisa relevante.
             * Só mantemos resultados que correspondam ao texto
             * pesquisado, mas permitimos nomes/cidades em qualquer
             * um dos campos relevantes.
             */
            if (!lugarCorresponde(lugar, consulta)) {
              continue;
            }

            vistos.add(chave);
            resultados.push(lugar);
          }

          /*
           * Não paramos na primeira pesquisa quando existe um alias.
           * Assim, "Milão" também consulta "Milan" e "Londres"
           * também consulta "London".
           */
        }

        return resultados
          .sort((a, b) => {
            const scoreB = Math.max(
              ...consultas.map((consulta) =>
                pontuacaoLugar(b, consulta),
              ),
            );

            const scoreA = Math.max(
              ...consultas.map((consulta) =>
                pontuacaoLugar(a, consulta),
              ),
            );

            return scoreB - scoreA;
          })
          .map(mapearLugar)
          .filter(
            (lugar): lugar is SugestaoLugar =>
              lugar !== null,
          )
          .slice(0, 12);
      } catch (erro) {
        console.error(
          "[Duffel] erro nas sugestões de lugares:",
          erro,
        );

        return [];
      }
    },
  );

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
        estadoFornecedor: limiteAtingido
          ? "limite"
          : "erro",
        aviso: limiteAtingido
          ? "A pesquisa atingiu temporariamente o limite de pedidos da Duffel. Aguarde alguns segundos e tente novamente."
          : mensagem,
      };
    }
  });