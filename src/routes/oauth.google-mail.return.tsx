import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/google-mail/return")({
  head: () => ({
    meta: [
      { title: "A concluir a ligação ao Gmail — Simplesmente voo" },
      {
        name: "description",
        content: "Página técnica que conclui a autorização da sua conta Gmail na Simplesmente voo.",
      },
      { property: "og:title", content: "A concluir a ligação ao Gmail" },
      { property: "og:description", content: "Autorização da conta Gmail na Simplesmente voo." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RetornoOAuth,
});

const CONNECTOR_ID = "google_mail";

function RetornoOAuth() {
  const [mensagem, setMensagem] = useState("A concluir a ligação…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const avisar = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: CONNECTOR_ID, code: code ?? null },
        window.location.origin,
      );
      window.close();
    };

    if (params.get("success") !== "true") {
      setMensagem(params.get("error") ?? "A autorização não foi concluída.");
      avisar("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        avisar("appUserConnectorOAuthComplete");
        return;
      }
      setMensagem("A autorização terminou sem código de troca.");
      avisar("appUserConnectorOAuthFailed");
      return;
    }
    avisar("appUserConnectorOAuthComplete", code);
  }, []);

  return <p className="p-6 text-sm text-muted-foreground">{mensagem}</p>;
}
