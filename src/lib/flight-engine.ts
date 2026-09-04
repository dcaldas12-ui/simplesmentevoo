/**
 * Motor de pesquisa de voos.
 *
 * Gera todas as combinações de datas dentro da margem de flexibilidade,
 * aplica as regras de validade, pede preços ao fornecedor activo e ordena
 * os resultados por preço total.
 *
 * Enquanto não existir um fornecedor real configurado (API de
 * disponibilidade/preços reserváveis), é usado o adaptador de demonstração
 * `demoProvider`, que devolve dados simulados realistas e determinísticos.
 * Para integrar um fornecedor real basta criar outro objecto que respeite
 * a interface `FlightProvider` e devolvê-lo em `getProvider()`.
 */

export type PesquisaInput = {
  origem: string;
  destino: string;
  dataPartida: string; // YYYY-MM-DD
  dataRegresso?: string | null;
  /** Dias aceites antes/depois da data de ida escolhida (0-7). */
  idaAntes: number;
  idaDepois: number;
  /** Dias aceites antes/depois da data de regresso escolhida (0-7). */
  regressoAntes: number;
  regressoDepois: number;
  /** Duração máxima da viagem em noites (opcional). */
  duracaoMaxima?: number | null;
  passageiros: number;
  apenasDiretos: boolean;
};

export type Oferta = {
  id: string;
  origem: string;
  destino: string;
  dataPartida: string;
  dataRegresso: string | null;
  companhia: string;
  numeroVoo: string;
  horaPartida: string;
  horaChegada: string;
  duracaoMin: number;
  escalas: number;
  precoPorPassageiro: number;
  precoTotal: number;
  moeda: string;
  bagagemIncluida: boolean;
  reservavel: boolean;
  fonte: "demo" | "api";
};

export type ResultadoPesquisa = {
  ofertas: Oferta[];
  combinacoesGeradas: number;
  combinacoesValidas: number;
  criterios: string[];
  precoMinimo: number | null;
  precoMediano: number | null;
  fonte: "demo" | "api";
  aviso?: string | undefined;
};

export interface FlightProvider {
  nome: string;
  fonte: "demo" | "api";
  procurar(input: PesquisaInput, combos: Combinacao[]): Promise<Oferta[]>;
}

export type Combinacao = { partida: string; regresso: string | null; noites: number | null };

const COMPANHIAS = [
  { nome: "TAP Air Portugal", codigo: "TP", base: 1 },
  { nome: "Ryanair", codigo: "FR", base: 0.68 },
  { nome: "easyJet", codigo: "U2", base: 0.74 },
  { nome: "Vueling", codigo: "VY", base: 0.8 },
  { nome: "Iberia", codigo: "IB", base: 1.05 },
  { nome: "Lufthansa", codigo: "LH", base: 1.25 },
];

export const AEROPORTOS: { codigo: string; cidade: string }[] = [
  { codigo: "LIS", cidade: "Lisboa" },
  { codigo: "OPO", cidade: "Porto" },
  { codigo: "FAO", cidade: "Faro" },
  { codigo: "FNC", cidade: "Funchal" },
  { codigo: "PDL", cidade: "Ponta Delgada" },
  { codigo: "MAD", cidade: "Madrid" },
  { codigo: "BCN", cidade: "Barcelona" },
  { codigo: "CDG", cidade: "Paris" },
  { codigo: "LHR", cidade: "Londres" },
  { codigo: "AMS", cidade: "Amesterdão" },
  { codigo: "FCO", cidade: "Roma" },
  { codigo: "BER", cidade: "Berlim" },
  { codigo: "GIG", cidade: "Rio de Janeiro" },
  { codigo: "JFK", cidade: "Nova Iorque" },
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function rnd(seed: string): number {
  return (hash(seed) % 10000) / 10000;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Gera todas as combinações de datas dentro da margem e aplica as regras. */
export function gerarCombinacoes(input: PesquisaInput): {
  combos: Combinacao[];
  geradas: number;
} {
  const flex = Math.max(0, Math.min(7, Math.round(input.flexibilidade)));
  const combos: Combinacao[] = [];
  let geradas = 0;
  const duracaoBase =
    input.dataRegresso != null && input.dataRegresso !== ""
      ? diffDays(input.dataPartida, input.dataRegresso)
      : null;

  for (let dp = -flex; dp <= flex; dp++) {
    const partida = addDays(input.dataPartida, dp);
    if (duracaoBase === null) {
      geradas++;
      if (partida < hoje()) continue;
      combos.push({ partida, regresso: null, noites: null });
      continue;
    }
    for (let dr = -flex; dr <= flex; dr++) {
      geradas++;
      const regresso = addDays(input.dataRegresso!, dr);
      // Regras: não permitir datas passadas nem regresso antes da partida.
      if (partida < hoje()) continue;
      const noites = diffDays(partida, regresso);
      if (noites < 1) continue;
      if (duracaoBase >= 1 && Math.abs(noites - duracaoBase) > flex + 1) continue;
      combos.push({ partida, regresso, noites });
    }
  }
  return { combos, geradas };
}

const demoProvider: FlightProvider = {
  nome: "Dados simulados",
  fonte: "demo",
  async procurar(input, combos) {
    const ofertas: Oferta[] = [];
    const rota = `${input.origem}-${input.destino}`;
    const distanciaFactor = 1 + (hash(rota) % 120) / 100;

    for (const combo of combos) {
      const nOpcoes = 2 + (hash(rota + combo.partida) % 2);
      for (let i = 0; i < nOpcoes; i++) {
        const seed = `${rota}|${combo.partida}|${combo.regresso ?? "OW"}|${i}`;
        const comp = COMPANHIAS[hash(seed) % COMPANHIAS.length]!;
        const escalas = rnd(seed + "esc") > 0.72 ? 1 : 0;
        if (input.apenasDiretos && escalas > 0) continue;

        const dow = new Date(`${combo.partida}T00:00:00Z`).getUTCDay();
        const fimSemana = dow === 5 || dow === 6 || dow === 0 ? 1.18 : 1;
        const antecedencia = Math.max(0, diffDays(hoje(), combo.partida));
        const factorAntecedencia = antecedencia < 14 ? 1.35 : antecedencia > 60 ? 0.88 : 1;
        const base = 46 + rnd(seed) * 140;
        const ida = combo.regresso ? 1.85 : 1;

        const preco =
          Math.round(
            base *
              distanciaFactor *
              comp.base *
              fimSemana *
              factorAntecedencia *
              ida *
              (escalas ? 0.85 : 1) *
              100,
          ) / 100;

        const horaPartidaH = 6 + (hash(seed + "h") % 15);
        const duracaoMin =
          Math.round(70 * distanciaFactor + rnd(seed + "d") * 90) + escalas * 115;
        const partidaMin = (hash(seed + "m") % 12) * 5;
        const chegada = new Date(
          Date.parse(`${combo.partida}T00:00:00Z`) +
            (horaPartidaH * 60 + partidaMin + duracaoMin) * 60000,
        );

        ofertas.push({
          id: seed,
          origem: input.origem,
          destino: input.destino,
          dataPartida: combo.partida,
          dataRegresso: combo.regresso,
          companhia: comp.nome,
          numeroVoo: `${comp.codigo}${100 + (hash(seed + "n") % 890)}`,
          horaPartida: `${String(horaPartidaH).padStart(2, "0")}:${String(partidaMin).padStart(2, "0")}`,
          horaChegada: chegada.toISOString().slice(11, 16),
          duracaoMin,
          escalas,
          precoPorPassageiro: preco,
          precoTotal: Math.round(preco * input.passageiros * 100) / 100,
          moeda: "EUR",
          bagagemIncluida: rnd(seed + "b") > 0.55,
          reservavel: false,
          fonte: "demo",
        });
      }
    }
    return ofertas;
  },
};

/**
 * Ponto único de integração: devolver aqui um adaptador de API real
 * (ex.: Duffel, Amadeus, Kiwi) assim que as credenciais existirem.
 */
export function getProvider(): FlightProvider {
  return demoProvider;
}

export async function pesquisar(input: PesquisaInput): Promise<ResultadoPesquisa> {
  const { combos, geradas } = gerarCombinacoes(input);
  const provider = getProvider();

  if (combos.length === 0) {
    return {
      ofertas: [],
      combinacoesGeradas: geradas,
      combinacoesValidas: 0,
      precoMinimo: null,
      precoMediano: null,
      fonte: provider.fonte,
      aviso: "Nenhuma combinação de datas válida. Verifique as datas escolhidas.",
    };
  }

  const todas = await provider.procurar(input, combos);
  todas.sort((a, b) => a.precoTotal - b.precoTotal || a.duracaoMin - b.duracaoMin);
  const ofertas = todas.slice(0, 40);
  const precos = todas.map((o) => o.precoTotal);

  return {
    ofertas,
    combinacoesGeradas: geradas,
    combinacoesValidas: combos.length,
    precoMinimo: precos.length ? precos[0]! : null,
    precoMediano: precos.length ? precos[Math.floor(precos.length / 2)]! : null,
    fonte: provider.fonte,
    aviso:
      provider.fonte === "demo"
        ? "Resultados de demonstração: ainda não há fornecedor de voos configurado, por isso os preços são simulados e não reserváveis."
        : undefined,
  };
}
