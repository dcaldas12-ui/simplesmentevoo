import { createServerFn } from "@tanstack/react-start";

import { pesquisar, type PesquisaInput, type ResultadoPesquisa } from "./flight-engine";

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

  return {
    origem,
    destino,
    dataPartida,
    dataRegresso,
    flexibilidade: Math.max(0, Math.min(7, Number(d["flexibilidade"] ?? 0) || 0)),
    passageiros: Math.max(1, Math.min(9, Number(d["passageiros"] ?? 1) || 1)),
    apenasDiretos: Boolean(d["apenasDiretos"]),
  };
}

export const pesquisarVoos = createServerFn({ method: "POST" })
  .inputValidator(validar)
  .handler(async ({ data }): Promise<ResultadoPesquisa> => pesquisar(data));
