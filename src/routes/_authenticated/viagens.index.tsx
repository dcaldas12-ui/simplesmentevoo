import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BedDouble,
  CalendarDays,
  FileText,
  Info,
  Luggage,
  MapPin,
  Plus,
  Plane,
  Ticket,
  TrainFront,
} from "lucide-react";
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
import { valoresIniciais } from "@/components/SearchForm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/viagens/")({
  head: () => ({
    meta: [
      { title: "As minhas viagens — ViatOrbis" },
      {
        name: "description",
        content:
          "Crie e organize as suas viagens, voos guardados e documentos associados.",
      },
      {
        property: "og:title",
        content: "As minhas viagens — ViatOrbis",
      },
      {
        property: "og:description",
        content:
          "Todas as suas viagens, voos e documentos organizados num só sítio.",
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

const organizacao = [
  {
    titulo: "Voos",
    descricao: "Pesquise e guarde voos.",
    icon: Plane,
    acao: "Pesquisar voos",
    ativa: true,
  },
  {
    titulo: "Alojamento",
    descricao: "Guarde reservas de hotel e outros.",
    icon: BedDouble,
    acao: "Adicionar alojamento",
    ativa: false,
  },
  {
    titulo: "Transportes",
    descricao: "Comboios, autocarros, transfers e mais.",
    icon: TrainFront,
    acao: "Adicionar transporte",
    ativa: false,
  },
  {
    titulo: "Bilhetes & vouchers",
    descricao: "Bilhetes, vouchers, códigos QR e outros.",
    icon: Ticket,
    acao: "Adicionar",
    ativa: false,
  },
  {
    titulo: "Documentos",
    descricao: "PDFs, imagens e documentos importantes.",
    icon: FileText,
    acao: "Adicionar documento",
    ativa: false,
  },
  {
    titulo: "Informações",
    descricao: "Notas e informações importantes.",
    icon: Info,
    acao: "Adicionar informação",
    ativa: false,
  },
] as const;

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
        .select(
          "id, titulo, destino, data_inicio, data_fim, estado, voos(count), documentos(count)",
        )
        .order("data_inicio", {
          ascending: true,
          nullsFirst: false,
        });

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
      await queryClient.invalidateQueries({
        queryKey: ["viagens"],
      });

      toast.success("Viagem criada.");

      setAberto(false);

      setForm({
        titulo: "",
        destino: "",
        data_inicio: "",
        data_fim: "",
        notas: "",
      });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : "Erro ao criar viagem.",
      ),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">
              As minhas viagens
            </h1>

            <p className="text-sm text-muted-foreground">
              Organize tudo o que pertence a cada viagem num só sítio.
            </p>
          </div>

          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Nova viagem
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
                    onChange={(e) =>
                      setForm({
                        ...form,
                        titulo: e.target.value,
                      })
                    }
                    placeholder="Férias em Barcelona"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="destino">Destino</Label>

                  <Input
                    id="destino"
                    value={form.destino}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        destino: e.target.value,
                      })
                    }
                    placeholder="Barcelona"
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
                      onChange={(e) =>
                        setForm({
                          ...form,
                          data_inicio: e.target.value,
                        })
                      }
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="fim">Fim</Label>

                    <Input
                      id="fim"
                      type="date"
                      value={form.data_fim}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          data_fim: e.target.value,
                        })
                      }
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notas">Notas</Label>

                  <Textarea
                    id="notas"
                    value={form.notas}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        notas: e.target.value,
                      })
                    }
                    placeholder="Informações adicionais sobre a viagem..."
                    className="mt-1.5"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => criar.mutate()}
                  disabled={!form.titulo.trim() || criar.isPending}
                >
                  {criar.isPending ? "A criar..." : "Criar viagem"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <section className="mt-8">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Organize a sua viagem
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Tudo o que pode guardar e organizar nas suas viagens.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {organizacao.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.titulo}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <Icon className="size-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">
                        {item.titulo}
                      </h3>

                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.descricao}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    {item.ativa ? (
                      <Button
                        asChild
                        size="sm"
                        className="h-8 text-xs"
                      >
                        <Link
                          to="/pesquisa"
                          search={{
                            ...valoresIniciais,
                            apenasDiretos: false,
                            executar: 1,
                          }}
                        >
                          <Plus className="size-3.5" />
                          {item.acao}
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        className="h-8 text-xs"
                      >
                        <Plus className="size-3.5" />
                        {item.acao}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                As minhas Viagens
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Cada viagem reúne os seus voos, documentos e restantes
                informações.
              </p>
            </div>

            {viagens && viagens.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {viagens.length}{" "}
                {viagens.length === 1 ? "viagem" : "viagens"}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton
                    key={i}
                    className="h-36 rounded-2xl"
                  />
                ))}
              </div>
            ) : !viagens || viagens.length === 0 ? (
              <EmptyState
                icon={Luggage}
                titulo="Ainda não tem viagens"
                descricao="Crie a sua primeira viagem ou pesquise voos para começar a organizar a sua viagem."
              >
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setAberto(true)}>
                    <Plus className="size-4" />
                    Criar viagem
                  </Button>

                  <Button asChild variant="outline">
                    <Link
                      to="/pesquisa"
                      search={{
                        ...valoresIniciais,
                        apenasDiretos: false,
                        executar: 1,
                      }}
                    >
                      <Plane className="size-4" />
                      Pesquisar voos
                    </Link>
                  </Button>
                </div>
              </EmptyState>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {viagens.map((v) => {
                  const quantidadeVoos = v.voos?.[0]?.count ?? 0;
                  const quantidadeDocumentos =
                    v.documentos?.[0]?.count ?? 0;

                  return (
                    <li key={v.id}>
                      <Link
                        to="/viagens/$viagemId"
                        params={{
                          viagemId: v.id,
                        }}
                        className="block h-full rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-display text-lg font-semibold">
                              {v.titulo}
                            </h3>

                            {v.destino ? (
                              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <MapPin className="size-4 shrink-0" />
                                <span className="truncate">
                                  {v.destino}
                                </span>
                              </p>
                            ) : null}
                          </div>

                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                            <Luggage className="size-4" />
                          </div>
                        </div>

                        {v.data_inicio ? (
                          <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <CalendarDays className="size-4 shrink-0" />

                            <span>
                              {formatarData(v.data_inicio)}

                              {v.data_fim
                                ? ` — ${formatarData(v.data_fim)}`
                                : ""}
                            </span>
                          </p>
                        ) : null}

                        <div className="mt-5 flex flex-wrap gap-2">
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            {quantidadeVoos}{" "}
                            {quantidadeVoos === 1 ? "voo" : "voos"}
                          </span>

                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            {quantidadeDocumentos}{" "}
                            {quantidadeDocumentos === 1
                              ? "documento"
                              : "documentos"}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}