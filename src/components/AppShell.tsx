import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Luggage, Plane, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";

export function AppShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const navigate = useNavigate();

  async function sair() {
    await supabase.auth.signOut();
    void navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Plane className="size-5" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">
              Simplesmente voo
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/pesquisa" search={{}}>
                <Search className="size-4" /> Pesquisar
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/viagens">
                <Luggage className="size-4" /> Minhas viagens
              </Link>
            </Button>
            {session ? (
              <Button variant="outline" size="sm" onClick={() => void sair()}>
                <LogOut className="size-4" /> Sair
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Entrar</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/70 py-6 text-center text-sm text-muted-foreground">
        Simplesmente voo — encontre as melhores datas e preços, sem complicações.
      </footer>
    </div>
  );
}
