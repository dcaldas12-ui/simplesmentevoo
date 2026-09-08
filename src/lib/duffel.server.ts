/**
 * Adaptador do fornecedor real de voos: Duffel.
 *
 * Este ficheiro só deve ser usado no servidor.
 * O token nunca deve ser exposto ao browser.
 */

const DUFFEL_BASE_URL = "https://api.duffel.com";

export type EstadoDuffel =
  | "nao_configurado"
  | "configurado"
  | "erro";

export function estadoDuffel(): {
  configurado: boolean;
  estado: EstadoDuffel;
} {
  const token = process.env["DUFFEL_ACCESS_TOKEN"];

  return {
    configurado: Boolean(token),
    estado: token ? "configurado" : "nao_configurado",
  };
}

export async function pedirDuffel(
  caminho: string,
  corpo?: unknown,
): Promise<unknown> {
  const token = process.env["DUFFEL_ACCESS_TOKEN"];

  if (!token) {
    throw new Error("DUFFEL_ACCESS_TOKEN não está configurado.");
  }

  const resposta = await fetch(`${DUFFEL_BASE_URL}${caminho}`, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Duffel-Version": "v2",
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text();

    throw new Error(
      `Duffel respondeu com ${resposta.status}: ${detalhe}`,
    );
  }

  return resposta.json();
}