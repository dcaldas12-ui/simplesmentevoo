/**
 * Adaptador do fornecedor real de voos: Skyscanner Travel APIs.
 *
 * Só funciona quando existir uma chave válida (`SKYSCANNER_API_KEY`) e acesso
 * aprovado ao produto. Sem isso, `estadoSkyscanner()` devolve "nao_configurado"
 * e o motor mantém o modo demonstrativo como fallback explícito.
 *
 * Nunca importar este ficheiro no browser: a chave é lida apenas aqui,
 * dentro do runtime do servidor.
 */

import type {
  Combinacao,
  FlightProvider,
  Oferta,
  PesquisaInput,
} from "./flight-engine";

export type EstadoFornecedor =
  | "demo"
  | "ativo"
  | "nao_configurado"
  | "erro"
  | "limite";

/** URL base oficial das Skyscanner Travel APIs (substituível por env). */
const BASE_PADRAO = "https://partners.api.skyscanner.net/apiservices/v3";

/** Nº máximo de combinações consultadas à API real por pesquisa. */
export const MAX_COMBINACOES_API = 12;

export function estadoSkyscanner(): {
  configurado: boolean;
  emFalta: string[];
  base: string;
} {
  const chave = process.env["SKYSCANNER_API_KEY"];
  const emFalta: string[] = [];
  if (!chave) emFalta.push("SKYSCANNER_API_KEY");
  return {
    configurado: emFalta.length === 0,
    emFalta,
    base: process.env["SKYSCANNER_API_BASE"] ?? BASE_PADRAO,
  };
}

type DataPartes = { year: number; month: number; day: number };

function partes(iso: string): DataPartes {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}

type SkyLeg = {
  originPlaceId?: string;
  destinationPlaceId?: string;
  departureDateTime?: { year: number; month: number; day: number; hour: number; minute: number };
  arrivalDateTime?: { hour: number; minute: number };
  durationInMinutes?: number;
  stopCount?: number;
  marketingCarrierIds?: string[];
  segmentIds?: string[];
};

type SkyItinerary = {
  legIds?: string[];
  pricingOptions?: {
    price?: { amount?: string | number; unit?: string };
    items?: { deepLink?: string; fares?: { segmentId?: string }[] }[];
  }[];
};

type SkyResposta = {
  sessionToken?: string;
  content?: {
    status?: string;
    results?: {
      itineraries?: Record<string, SkyItinerary>;
      legs?: Record<string, SkyLeg>;
      carriers?: Record<string, { name?: string; iata?: string }>;
      segments?: Record<string, { marketingFlightNumber?: string | number }>;
    };
  };
};

function precoEur(p: { amount?: string | number; unit?: string } | undefined): number | null {
  if (!p || p.amount == null) return null;
  const n = Number(p.amount);
  if (!Number.isFinite(n)) return null;
  const unidade = String(p.unit ?? "PRICE_UNIT_MILLI");
  const divisor = unidade.endsWith("MILLI") ? 1000 : unidade.endsWith("CENTI") ? 100 : 1;
  return Math.round((n / divisor) * 100) / 100;
}

function hhmm(h?: number, m?: number): string {
  return `${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
}

export class SkyscannerError extends Error {
  estado: EstadoFornecedor;
  constructor(estado: EstadoFornecedor, mensagem: string) {
    super(mensagem);
    this.estado = estado;
  }
}

async function pedir(
  base: string,
  chave: string,
  caminho: string,
  corpo?: unknown,
): Promise<SkyResposta> {
  let resposta: Response;
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: "POST",
      headers: { "x-api-key": chave, "Content-Type": "application/json" },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
  } catch {
    throw new SkyscannerError("erro", "Não foi possível contactar o Skyscanner.");
  }

  if (resposta.status === 429) {
    throw new SkyscannerError("limite", "Limite de pedidos do Skyscanner atingido.");
  }
  if (resposta.status === 401 || resposta.status === 403) {
    throw new SkyscannerError(
      "nao_configurado",
      "A chave do Skyscanner foi recusada ou não tem acesso aprovado ao produto.",
    );
  }
  if (!resposta.ok) {
    throw new SkyscannerError("erro", `O Skyscanner respondeu com o erro ${resposta.status}.`);
  }
  return (await resposta.json()) as SkyResposta;
}

function normalizar(
  dados: SkyResposta,
  input: PesquisaInput,
  combo: Combinacao,
): Oferta[] {
  const r = dados.content?.results;
  if (!r?.itineraries) return [];
  const legs = r.legs ?? {};
  const carriers = r.carriers ?? {};
  const segments = r.segments ?? {};
  const ofertas: Oferta[] = [];

  for (const [id, it] of Object.entries(r.itineraries)) {
    const idaId = it.legIds?.[0];
    const ida = idaId ? legs[idaId] : undefined;
    if (!ida) continue;

    const escalas = ida.stopCount ?? 0;
    if (input.apenasDiretos && escalas > 0) continue;

    const opcao = (it.pricingOptions ?? [])
      .map((o) => ({ preco: precoEur(o.price), item: o.items?.[0] }))
      .filter((o) => o.preco !== null)
      .sort((a, b) => (a.preco ?? 0) - (b.preco ?? 0))[0];

    const precoPorPassageiro = opcao?.preco ?? null;
    const carrierId = ida.marketingCarrierIds?.[0];
    const companhia = (carrierId ? carriers[carrierId]?.name : undefined) ?? "Companhia aérea";
    const codigo = (carrierId ? carriers[carrierId]?.iata : undefined) ?? "";
    const segId = ida.segmentIds?.[0];
    const numero = segId ? segments[segId]?.marketingFlightNumber : undefined;

    const chegada = ida.arrivalDateTime;

    ofertas.push({
      id: `sky-${combo.partida}-${combo.regresso ?? "OW"}-${id}`,
      origem: input.origem,
      destino: input.destino,
      dataPartida: combo.partida,
      dataRegresso: combo.regresso,
      companhia,
      numeroVoo: numero ? `${codigo}${numero}` : codigo || "—",
      horaPartida: hhmm(ida.departureDateTime?.hour, ida.departureDateTime?.minute),
      horaChegada: hhmm(chegada?.hour, chegada?.minute),
      duracaoMin: ida.durationInMinutes ?? 0,
      escalas,
      precoPorPassageiro: precoPorPassageiro ?? 0,
      precoTotal:
        precoPorPassageiro === null
          ? 0
          : Math.round(precoPorPassageiro * input.passageiros * 100) / 100,
      moeda: "EUR",
      // A API só devolve bagagem em alguns tarifários; sem confirmação, fica falso.
      bagagemIncluida: false,
      reservavel: Boolean(opcao?.item?.deepLink),
      deeplink: opcao?.item?.deepLink ?? null,
      precoIndisponivel: precoPorPassageiro === null,
      fonte: "api",
    });
  }
  return ofertas;
}

export function criarSkyscannerProvider(chave: string, base: string): FlightProvider {
  return {
    nome: "Skyscanner",
    fonte: "api",
    async procurar(input, combos) {
      const usar = combos.slice(0, MAX_COMBINACOES_API);
      const lotes: Oferta[][] = [];

      // Consultas sequenciais em pequenos lotes para respeitar limites de rate.
      for (let i = 0; i < usar.length; i += 3) {
        const bloco = usar.slice(i, i + 3);
        const resultados = await Promise.all(
          bloco.map(async (combo) => {
            const queryLegs = [
              {
                originPlaceId: { iata: input.origem },
                destinationPlaceId: { iata: input.destino },
                date: partes(combo.partida),
              },
              ...(combo.regresso
                ? [
                    {
                      originPlaceId: { iata: input.destino },
                      destinationPlaceId: { iata: input.origem },
                      date: partes(combo.regresso),
                    },
                  ]
                : []),
            ];

            const dados = await pedir(base, chave, "/flights/live/search/create", {
              query: {
                market: "PT",
                locale: "pt-PT",
                currency: "EUR",
                queryLegs,
                adults: input.passageiros,
                cabinClass: "CABIN_CLASS_ECONOMY",
              },
            });
            return normalizar(dados, input, combo);
          }),
        );
        lotes.push(...resultados);
      }

      return lotes.flat();
    },
  };
}
