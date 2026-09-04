import { createServerFn } from "@tanstack/react-start";

import { pesquisar, type PesquisaInput, type ResultadoPesquisa } from "./flight-engine";

function dias(valor: unknown): number {
  return Math.max(0, Math.min(7, Math.round(Number(valor ?? 0) || 0)));
}

function validar(data: unknown): PesquisaInput {
  const d = (data ?? {}) as Record<string, unknown>;
  const origem = String(d["origem"] ?? "").trim().toUpperCase();
  const destino = String(d["destino"] ?? "").trim().toUpperCase();
  const dataPartida = String(d["dataPartida"] ?? "").trim();
  const dataRegresso = d["dataRegresso"] ? String(d["dataRegresso"]).trim() : null;

  if (!origem || !destino) throw new Error("Indique a origem e o destino.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPartida)) throw new Error("Data de partida inválida.");
  if (dataRegresso && !/^\d{4}-\d{2}-\d{2}$/.test(dataRegresso))
    throw new Error("Data de regresso inválida.");
  if (dataRegresso && dataRegresso < dataPartida)
    throw new Error("A data de regresso não pode ser anterior à data de partida.");

  const duracaoBruta = Number(d["duracaoMaxima"] ?? 0) || 0;
  const duracaoMaxima = duracaoBruta > 0 ? Math.min(60, Math.round(duracaoBruta)) : null;

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
    passageiros: Math.max(1, Math.min(9, Number(d["passageiros"] ?? 1) || 1)),
    apenasDiretos: Boolean(d["apenasDiretos"]),
  };
}

export const pesquisarVoos = createServerFn({ method: "POST" })
  .inputValidator(validar)
  .handler(async ({ data }): Promise<ResultadoPesquisa> => pesquisar(data));
