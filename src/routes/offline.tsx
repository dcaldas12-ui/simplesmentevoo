import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw, WifiOff } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [
      { title: "Sem ligação — Simplesmente voo" },
      {
        name: "description",
        content:
          "Está sem internet. As páginas já visitadas continuam disponíveis; pesquisas de voos e documentos novos precisam de ligação.",
      },
      { property: "og:title", content: "Sem ligação — Simplesmente voo" },
      {
        property: "og:description",
        content: "Página mostrada quando o telemóvel perde a ligação à internet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaOffline,
});

function PaginaOffline() {
  return (
    <AppShell>
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary">
          <WifiOff className="size-7 text-primary" aria-hidden />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold">Está sem ligação</h1>
        <p className="mt-3 text-muted-foreground">
          Guardámos apenas o essencial da aplicação e as páginas que já abriu neste telemóvel. Pesquisar
          voos, abrir documentos novos ou guardar alterações exige internet.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Por segurança, documentos e reservas não ficam guardados no telemóvel de forma partilhada: cada
          conta só vê os seus dados depois de voltar a ligar-se.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => window.location.reload()} className="min-h-11">
            <RefreshCw className="mr-2 size-4" aria-hidden /> Tentar novamente
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
