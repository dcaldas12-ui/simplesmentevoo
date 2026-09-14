import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const CONNECTOR_ID = "google_mail";

export const Route = createFileRoute("/oauth/google-mail/return")({
  component: GoogleMailOAuthReturn,
});

function GoogleMailOAuthReturn() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const code = params.get("code");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    if (window.opener && !window.opener.closed) {
      if (code) {
        window.opener.postMessage(
          {
            type: "appUserConnectorOAuthComplete",
            connectorId: CONNECTOR_ID,
            code,
          },
          window.location.origin,
        );
      } else {
        window.opener.postMessage(
          {
            type: "appUserConnectorOAuthFailed",
            connectorId: CONNECTOR_ID,
            error: error || "oauth_error",
            errorDescription:
              errorDescription || "A autorização do Gmail não foi concluída.",
          },
          window.location.origin,
        );
      }
    }

    window.setTimeout(() => {
      window.close();
    }, 300);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">
          Ligação ao Gmail concluída
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Pode fechar esta janela e voltar à ViatOrbis.
        </p>
      </div>
    </main>
  );
}