import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Luggage, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/viagens/")({
  head: () => ({
    meta: [
      { title: "Minhas viagens — Simplesmente voo" },
      {
        name: "description",
        content: "Crie e organize as suas viagens, voos guardados e documentos associados.",
      },
      { property: "og:title", content: "Minhas viagens — Simplesmente voo" },
      {
        property: "og:description",
        content: "Todas as suas viagens, voos e documentos organizados num só sítio.",
      },
    ],
  }),
  component: ViagensPage,
});

function formatarData(iso: string | null) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ViagensPage() {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    destino: "",
    data_inicio: "",
    data_fim: "",
    notas: "",
  });

  const { data: viagens, isLoading } = useQuery({
    queryKey: ["viagens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select("id, titulo, destino, data_inicio, data_fim, estado, voos(count), documentos(count)")
        .order("data_inicio", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("viagens").insert({
        titulo: form.titulo,
        destino: form.destino || null,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        notas: form.notas || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["viagens"] });
      toast.success("Viagem criada.");
      setAberto(false);
      setForm({ titulo: "", destino: "", data_inicio: "", data_fim: "", notas: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar viagem."),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Minhas viagens</h1>
            <p className="text-sm text-muted-foreground">
              Organize voos, datas e documentos de cada viagem.
            </p>
          </div>

          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Nova viagem
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova viagem</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="titulo">Nome da viagem</Label>
                  <Input
                    id="titulo"
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Férias em Barcelona"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="destino">Destino</Label>
                  <Input
                    id="destino"
                    value={form.destino}
                    onChange={(e) => setForm({ ...form, destino: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="inicio">Início</Label>
                    <Input
                      id="inicio"
                      type="date"
                      value={form.data_inicio}
                      onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fim">Fim</Label>
                    <Input
                      id="fim"
                      type="date"
                      value={form.data_fim}
                      onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="notas">Notas</Label>
                  <Textarea
                    id="notas"
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => criar.mutate()}
                  disabled={!form.titulo || criar.isPending}
                >
                  Criar viagem
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : !viagens || viagens.length === 0 ? (
            <EmptyState
              icon={Luggage}
              titulo="Ainda não tem viagens"
              descricao="Crie a sua primeira viagem para juntar voos, datas e documentos. Também pode guardar um voo diretamente a partir da pesquisa."
            >
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setAberto(true)}>
                  <Plus className="size-4" /> Criar viagem
                </Button>
                <Button asChild variant="outline">
                  <Link to="/pesquisa" search={{}}>Pesquisar voos</Link>
                </Button>
              </div>
            </EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {viagens.map((v) => (
                <li key={v.id}>
                  <Link
                    to="/viagens/$viagemId"
                    params={{ viagemId: v.id }}
                    className="block h-full rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
                  >
                    <h2 className="font-display text-lg font-semibold">{v.titulo}</h2>
                    {v.destino ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="size-4" /> {v.destino}
                      </p>
                    ) : null}
                    {v.data_inicio ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="size-4" />
                        {formatarData(v.data_inicio)}
                        {v.data_fim ? ` — ${formatarData(v.data_fim)}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-4 text-xs text-muted-foreground">
                      {v.voos?.[0]?.count ?? 0} voo(s) · {v.documentos?.[0]?.count ?? 0} documento(s)
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
