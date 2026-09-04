import { Link, useNavigate } from "@tanstack/react-router";
import { BellRing, CircleHelp, FileText, LogOut, Luggage, Plane, Search, Ticket } from "lucide-react";
import type { ReactNode } from "react";

import { InstallHint } from "@/components/InstallHint";
import { Button } from "@/components/ui/button";
import { valoresIniciais } from "@/components/SearchForm";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";

export function AppShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const navigate = useNavigate();

  async function sair() {
    await supabase.auth.signOut();
    void navigate({ to: "/" });
  }

  const ligacoes = [
    { to: "/pesquisa" as const, search: { ...valoresIniciais }, icon: Search, label: "Pesquisar" },
    { to: "/viagens" as const, icon: Luggage, label: "Viagens" },
    ...(session
      ? [{ to: "/reservas" as const, icon: Ticket, label: "Reservas" }]
      : []),
    { to: "/documentos-demo" as const, icon: FileText, label: "Documentos" },
    { to: "/avisos" as const, icon: BellRing, label: "Avisos" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Plane className="size-5" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">
              Simplesmente voo
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {[...ligacoes, { to: "/ajuda" as const, icon: CircleHelp, label: "Ajuda", search: undefined }].map((l) => (
              <Button key={l.to} asChild variant="ghost" size="sm">
                {l.search ? (
                  <Link to={l.to} search={l.search}>
                    <l.icon className="size-4" /> {l.label}
                  </Link>
                ) : (
                  <Link to={l.to}>
                    <l.icon className="size-4" /> {l.label}
                  </Link>
                )}
              </Button>
            ))}
          </nav>

          <div className="ml-auto md:ml-0">
            {session ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void sair()}
                className="h-10 md:h-9"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            ) : (
              <Button asChild size="sm" className="h-10 md:h-9">
                <Link to="/auth">Entrar</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      <footer className="hidden border-t border-border/70 py-6 text-center text-sm text-muted-foreground md:block">
        Simplesmente voo — encontre as melhores datas e preços, sem complicações. ·{" "}
        <Link to="/ajuda" className="underline underline-offset-4">
          Ajuda e instalação
        </Link>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto flex w-full max-w-lg items-stretch">
          {ligacoes.map((l) => (
            <li key={l.to} className="flex-1">
              {l.search ? (
                <Link
                  to={l.to}
                  search={l.search}
                  activeProps={{ className: "text-primary" }}
                  className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
                >
                  <l.icon className="size-5" />
                  {l.label}
                </Link>
              ) : (
                <Link
                  to={l.to}
                  activeProps={{ className: "text-primary" }}
                  className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
                >
                  <l.icon className="size-5" />
                  {l.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <InstallHint />
    </div>
  );
}
