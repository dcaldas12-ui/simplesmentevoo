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
  .handler(async ({ data }): Promise<ResultadoPesquisa> => {
    const {
      estadoSkyscanner,
      criarSkyscannerProvider,
      SkyscannerError,
      MAX_COMBINACOES_API,
    } = await import("./skyscanner.server");

    const estado = estadoSkyscanner();

    if (!estado.configurado) {
      return pesquisar(data, {
        estadoFornecedor: "nao_configurado",
        emFalta: estado.emFalta,
        aviso:
          "Ligação ao Skyscanner por ativar: falta a chave de API e o acesso aprovado ao produto.",
      });
    }

    try {
      const provider = criarSkyscannerProvider(
        process.env["SKYSCANNER_API_KEY"]!,
        estado.base,
      );
      const resultado = await pesquisar(data, {
        provider,
        estadoFornecedor: "ativo",
        maxCombinacoes: MAX_COMBINACOES_API,
      });
      if (resultado.ofertas.length > 0) return resultado;
      return pesquisar(data, {
        estadoFornecedor: "erro",
        aviso: "O Skyscanner não devolveu preços para estas datas.",
      });
    } catch (erro) {
      const estadoErro =
        erro instanceof SkyscannerError ? erro.estado : ("erro" as const);
      const mensagem =
        erro instanceof Error ? erro.message : "Falha na ligação ao Skyscanner.";
      return pesquisar(data, {
        estadoFornecedor: estadoErro,
        ...(estadoErro === "nao_configurado" ? { emFalta: ["SKYSCANNER_API_KEY"] } : {}),
        aviso: mensagem,
      });
    }
  });

