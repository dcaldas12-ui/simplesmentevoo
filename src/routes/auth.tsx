import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Simplesmente voo" },
      {
        name: "description",
        content:
          "Entre na sua conta Simplesmente voo para guardar viagens, voos e documentos de viagem.",
      },
      { property: "og:title", content: "Entrar — Simplesmente voo" },
      {
        property: "og:description",
        content: "Aceda às suas viagens, voos guardados e documentos.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [aguardar, setAguardar] = useState(false);
  const { session } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) void navigate({ to: "/viagens" });
  }, [session, navigate]);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setAguardar(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { nome },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Já pode começar a organizar as suas viagens.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setAguardar(false);
    }
  }

  async function entrarComGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/viagens" });
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-4 py-14">
        <h1 className="font-display text-2xl font-semibold">
          {modo === "entrar" ? "Entrar" : "Criar conta"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Guarde viagens, voos e documentos na sua conta.
        </p>

        <form onSubmit={submeter} className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
          {modo === "criar" ? (
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1.5"
                placeholder="O seu nome"
              />
            </div>
          ) : null}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="password">Palavra-passe</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" className="w-full" disabled={aguardar}>
            {modo === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => void entrarComGoogle()}>
            Continuar com Google
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
          className="mt-4 w-full text-sm text-muted-foreground underline underline-offset-4"
        >
          {modo === "entrar" ? "Ainda não tenho conta" : "Já tenho conta"}
        </button>
      </div>
    </AppShell>
  );
}
