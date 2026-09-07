import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { apagarConta } from "@/lib/conta.functions";
import { useIdioma } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: "Conta e dados — Simplesmente voo" },
      {
        name: "description",
        content:
          "Gira a sua conta na Simplesmente voo: idioma, privacidade e eliminação definitiva de conta e dados.",
      },
      { property: "og:title", content: "Conta e dados — Simplesmente voo" },
      {
        property: "og:description",
        content: "Gira a sua conta e apague todos os seus dados quando quiser.",
      },
    ],
  }),
  component: Conta,
});

function Conta() {
  const { user } = useSession();
  const { t } = useIdioma();
  const navigate = useNavigate();
  const apagar = useServerFn(apagarConta);
  const [aApagar, setAApagar] = useState(false);

  async function confirmarApagar() {
    setAApagar(true);
    try {
      await apagar({ data: {} });
      await supabase.auth.signOut();
      toast.success("Conta e dados apagados.");
      void navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível apagar a conta.");
    } finally {
      setAApagar(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
        <header>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Conta e dados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sessão iniciada como {user?.email ?? "—"}.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Privacidade</CardTitle>
            <CardDescription>
              Consulte o que guardamos e porquê na{" "}
              <Link to="/privacidade" className="underline underline-offset-4">
                Política de Privacidade
              </Link>{" "}
              e as regras de utilização nos{" "}
              <Link to="/termos" className="underline underline-offset-4">
                Termos
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">{t("conta.apagar")}</CardTitle>
            <CardDescription>
              Apaga definitivamente a conta, os documentos carregados, viagens, reservas e avisos.
              Esta ação não pode ser anulada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="h-11" disabled={aApagar}>
                  {aApagar ? "A apagar…" : t("conta.apagar")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar a conta e todos os dados?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tudo o que guardou será eliminado de forma imediata e definitiva.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void confirmarApagar()}>
                    Apagar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
