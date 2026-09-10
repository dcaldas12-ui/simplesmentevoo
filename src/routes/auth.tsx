import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — ViatOrbis" },
      {
        name: "description",
        content:
          "Entre no ViatOrbis com a sua conta Google para guardar viagens, voos e documentos.",
      },
      { property: "og:title", content: "Entrar — ViatOrbis" },
      {
        property: "og:description",
        content:
          "Aceda às suas viagens, voos guardados e documentos através da sua conta.",
      },
    ],
  }),
  component: AuthPage,
});

function obterDestinoDepoisDoLogin(): string {
  const destino =
    sessionStorage.getItem("viatorbis_after_auth") || "/viagens";

  sessionStorage.removeItem("viatorbis_after_auth");

  if (destino.startsWith("/")) {
    return destino;
  }

  return "/viagens";
}

function AuthPage() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [aguardar, setAguardar] = useState(false);

  useEffect(() => {
    if (!session) return;

    const destino = obterDestinoDepoisDoLogin();

    void navigate({
      to: destino,
    });
  }, [session, navigate]);

  async function entrarComGoogle() {
    setAguardar(true);

    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });

      if (result.error) {
        toast.error("Não foi possível entrar com o Google.");
        setAguardar(false);
        return;
      }

      if (result.redirected) {
        return;
      }

      const destino = obterDestinoDepoisDoLogin();

      void navigate({
        to: destino,
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Não foi possível entrar com o Google.",
      );
      setAguardar(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-4 py-14">
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold">
            Entrar no ViatOrbis
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Entre com a sua conta Google para guardar viagens, voos e
            documentos.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={aguardar}
            onClick={() => void entrarComGoogle()}
          >
            {aguardar ? "A ligar ao Google..." : "Continuar com Google"}
          </Button>

          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            O ViatOrbis não cria uma palavra-passe própria. A sua conta é
            protegida através do Google.
          </p>
        </div>
      </div>
    </AppShell>
  );
}