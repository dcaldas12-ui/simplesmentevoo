import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BedDouble,
  Car,
  CalendarDays,
  Download,
  FileText,
  Mail,
  Maximize2,
  Pencil,
  Plane,
  Plus,
  QrCode,
  TrainFront,
  Trash2,
  Upload,
  Info,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { VisualizadorDocumento } from "@/components/VisualizadorDocumento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/viagens/$viagemId")({
  head: () => ({
    meta: [
      { title: "Detalhe da viagem — ViatOrbis" },
      {
        name: "description",
        content:
          "Organize voos, documentos, bilhetes, vouchers e informações da sua viagem.",
      },
      { property: "og:title", content: "Detalhe da viagem — ViatOrbis" },
      {
        property: "og:description",
        content:
          "Tenha tudo o que precisa para a sua viagem organizado num só lugar.",
      },
    ],
  }),
  component: DetalheViagem,
  errorComponent: ({ error }) => (
    <AppShell>
      <p
        role="alert"
        className="mx-auto max-w-4xl px-4 py-16 text-sm text-destructive"
      >
        {error.message}
      </p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="mx-auto max-w-4xl px-4 py-16 text-sm">
        Viagem não encontrada.
      </p>
    </AppShell>
  ),
});

const fmtPreco = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
});

function dataHora(iso: string | null) {
  if (!iso) return "—";

  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataCompleta(iso: string | null) {
  if (!iso) return "Data de partida não definida";

  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function valorParaDataHoraLocal(iso: string | null) {
  if (!iso) return "";

  const data = new Date(iso);

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  const horas = String(data.getHours()).padStart(2, "0");
  const minutos = String(data.getMinutes()).padStart(2, "0");

  return `${ano}-${mes}-${dia}T${horas}:${minutos}`;
}

function DetalheViagem() {
  const { viagemId } = Route.useParams();
  const queryClient = useQueryClient();

  const [editarAberto, setEditarAberto] = useState(false);
  const [editarAguardar, setEditarAguardar] = useState(false);

  const [formViagem, setFormViagem] = useState({
    titulo: "",
    destino: "",
    data_inicio: "",
    data_fim: "",
    notas: "",
  });

  const { data: viagem, isLoading } = useQuery({
    queryKey: ["viagem", viagemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select("*")
        .eq("id", viagemId)
        .maybeSingle();

      if (error) throw error;

      return data;
    },
  });

  const { data: voos } = useQuery({
    queryKey: ["voos", viagemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voos")
        .select("*")
        .eq("viagem_id", viagemId)
        .order("partida", { ascending: true });

      if (error) throw error;

      return data;
    },
  });

  const { data: documentos } = useQuery({
    queryKey: ["documentos", viagemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("*")
        .eq("viagem_id", viagemId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data;
    },
  });

  const { data: alojamentos } = useQuery({
    queryKey: ["alojamentos", viagemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alojamentos")
        .select("*")
        .eq("viagem_id", viagemId)
        .order("check_in", { ascending: true, nullsFirst: false });

      if (error) throw error;

      return data;
    },
  });

  const { data: transportes } = useQuery({
    queryKey: ["transportes", viagemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transportes")
        .select("*")
        .eq("viagem_id", viagemId)
        .order("partida", { ascending: true, nullsFirst: false });

      if (error) throw error;

      return data;
    },
  });

  const { data: informacoes } = useQuery({
    queryKey: ["informacoes", viagemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("informacoes")
        .select("*")
        .eq("viagem_id", viagemId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data;
    },
  });

  useEffect(() => {
    if (!editarAberto || !viagem) return;

    setFormViagem({
      titulo: viagem.titulo ?? "",
      destino: viagem.destino ?? "",
      data_inicio: viagem.data_inicio ?? "",
      data_fim: viagem.data_fim ?? "",
      notas: viagem.notas ?? "",
    });
  }, [editarAberto, viagem]);

  async function guardarAlteracoesViagem() {
    if (!formViagem.titulo.trim()) {
      toast.error("Indique um nome para a viagem.");
      return;
    }

    setEditarAguardar(true);

    try {
      const { error } = await supabase
        .from("viagens")
        .update({
          titulo: formViagem.titulo.trim(),
          destino: formViagem.destino.trim() || null,
          data_inicio: formViagem.data_inicio || null,
          data_fim: formViagem.data_fim || null,
          notas: formViagem.notas.trim() || null,
        })
        .eq("id", viagemId);

      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: ["viagem", viagemId],
      });

      await queryClient.invalidateQueries({
        queryKey: ["viagens"],
      });

      toast.success("Viagem atualizada.");
      setEditarAberto(false);
    } catch (err) {
      const mensagem =
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof err.message === "string"
          ? err.message
          : "Não foi possível atualizar a viagem.";

      toast.error(mensagem);
      console.error("Erro ao editar viagem:", err);
    } finally {
      setEditarAguardar(false);
    }
  }

  const invalidar = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["viagem", viagemId],
    });

    await queryClient.invalidateQueries({
      queryKey: ["voos", viagemId],
    });

    await queryClient.invalidateQueries({
      queryKey: ["documentos", viagemId],
    });

    await queryClient.invalidateQueries({
      queryKey: ["alojamentos", viagemId],
    });

    await queryClient.invalidateQueries({
      queryKey: ["transportes", viagemId],
    });

    await queryClient.invalidateQueries({
      queryKey: ["informacoes", viagemId],
    });

    await queryClient.invalidateQueries({
      queryKey: ["viagens"],
    });
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-10">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!viagem) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl px-4 py-16">
          <EmptyState
            icon={Plane}
            titulo="Viagem não encontrada"
            descricao="Esta viagem pode ter sido apagada."
          >
            <Button asChild>
              <Link to="/viagens">Voltar às viagens</Link>
            </Button>
          </EmptyState>
        </div>
      </AppShell>
    );
  }

  const quantidadeVoos = voos?.length ?? 0;
  const quantidadeDocumentos = documentos?.length ?? 0;
  const quantidadeAlojamentos = alojamentos?.length ?? 0;
  const quantidadeTransportes = transportes?.length ?? 0;
  const quantidadeInformacoes = informacoes?.length ?? 0;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/viagens">
            <ArrowLeft className="size-4" /> Minhas viagens
          </Link>
        </Button>

        <header className="mt-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-semibold">
                {viagem.titulo}
              </h1>

              <p className="text-sm text-muted-foreground">
                {[
                  viagem.destino,
                  viagem.data_inicio,
                  viagem.data_fim,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Sem datas definidas"}
              </p>
            </div>

            <Dialog
              open={editarAberto}
              onOpenChange={setEditarAberto}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="size-4" />
                  Editar viagem
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar viagem</DialogTitle>

                  <DialogDescription>
                    Altere o nome, destino, datas ou outras informações
                    desta viagem.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="editar-titulo">
                      Nome da viagem
                    </Label>

                    <Input
                      id="editar-titulo"
                      value={formViagem.titulo}
                      onChange={(e) =>
                        setFormViagem({
                          ...formViagem,
                          titulo: e.target.value,
                        })
                      }
                      placeholder="Férias em Barcelona"
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="editar-destino">
                      Destino
                    </Label>

                    <Input
                      id="editar-destino"
                      value={formViagem.destino}
                      onChange={(e) =>
                        setFormViagem({
                          ...formViagem,
                          destino: e.target.value,
                        })
                      }
                      placeholder="Barcelona"
                      className="mt-1.5"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="editar-inicio">
                        Data de início
                      </Label>

                      <Input
                        id="editar-inicio"
                        type="date"
                        value={formViagem.data_inicio}
                        onChange={(e) =>
                          setFormViagem({
                            ...formViagem,
                            data_inicio: e.target.value,
                          })
                        }
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="editar-fim">
                        Data de fim
                      </Label>

                      <Input
                        id="editar-fim"
                        type="date"
                        value={formViagem.data_fim}
                        onChange={(e) =>
                          setFormViagem({
                            ...formViagem,
                            data_fim: e.target.value,
                          })
                        }
                        className="mt-1.5"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="editar-notas">
                      Notas e informações
                    </Label>

                    <Textarea
                      id="editar-notas"
                      value={formViagem.notas}
                      onChange={(e) =>
                        setFormViagem({
                          ...formViagem,
                          notas: e.target.value,
                        })
                      }
                      placeholder="Informações importantes sobre esta viagem..."
                      className="mt-1.5 min-h-24"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setEditarAberto(false)}
                    disabled={editarAguardar}
                  >
                    Cancelar
                  </Button>

                  <Button
                    onClick={() =>
                      void guardarAlteracoesViagem()
                    }
                    disabled={
                      !formViagem.titulo.trim() ||
                      editarAguardar
                    }
                  >
                    {editarAguardar
                      ? "A guardar..."
                      : "Guardar alterações"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {viagem.notas ? (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed">
              {viagem.notas}
            </p>
          ) : null}
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Plane className="size-4" />
              Voos
            </div>

            <p className="mt-2 font-display text-2xl font-semibold">
              {quantidadeVoos}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {quantidadeVoos === 1
                ? "voo nesta viagem"
                : "voos nesta viagem"}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-4" />
              Documentos
            </div>

            <p className="mt-2 font-display text-2xl font-semibold">
              {quantidadeDocumentos}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {quantidadeDocumentos === 1
                ? "documento associado"
                : "documentos associados"}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              Datas
            </div>

            <p className="mt-2 font-display text-lg font-semibold">
              {viagem.data_inicio || "Sem data"}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {viagem.data_fim
                ? `Até ${viagem.data_fim}`
                : "Data de regresso não definida"}
            </p>
          </div>
        </div>

        <section className="mt-8">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Organize a sua viagem
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Tudo o que pertence a esta viagem fica reunido aqui.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <Plane className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Voos</h3>

                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {quantidadeVoos === 0
                      ? "Ainda não adicionou voos."
                      : `${quantidadeVoos} ${
                          quantidadeVoos === 1 ? "voo" : "voos"
                        } guardado${quantidadeVoos === 1 ? "" : "s"}.`}
                  </p>

                  <div className="mt-3">
                    <a
                      href="#voos"
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Plus className="size-3.5" />
                      Adicionar voo
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <BedDouble className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Alojamento</h3>

                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {quantidadeAlojamentos === 0
                      ? "Hotéis, apartamentos e outros alojamentos."
                      : `${quantidadeAlojamentos} ${
                          quantidadeAlojamentos === 1 ? "alojamento" : "alojamentos"
                        } guardado${quantidadeAlojamentos === 1 ? "" : "s"}.`}
                  </p>

                  <div className="mt-3">
                    <a
                      href="#alojamentos"
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Plus className="size-3.5" />
                      Adicionar alojamento
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <TrainFront className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Transportes</h3>

                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {quantidadeTransportes === 0
                      ? "Comboios, autocarros, transfers e outros."
                      : `${quantidadeTransportes} ${
                          quantidadeTransportes === 1 ? "transporte" : "transportes"
                        } guardado${quantidadeTransportes === 1 ? "" : "s"}.`}
                  </p>

                  <div className="mt-3">
                    <a
                      href="#transportes"
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Plus className="size-3.5" />
                      Adicionar transporte
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <QrCode className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Bilhetes & vouchers</h3>

                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    Bilhetes, vouchers, códigos QR e confirmações da viagem.
                  </p>

                  <div className="mt-3">
                    <a
                      href="#documentos"
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Plus className="size-3.5" />
                      Adicionar
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <FileText className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Documentos</h3>

                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    PDFs, imagens e documentos associados a esta viagem.
                  </p>

                  <div className="mt-3">
                    <a
                      href="#documentos"
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Plus className="size-3.5" />
                      Adicionar documento
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <Info className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Informações</h3>

                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {quantidadeInformacoes === 0
                      ? "Notas e informações importantes da viagem."
                      : `${quantidadeInformacoes} ${
                          quantidadeInformacoes === 1 ? "informação" : "informações"
                        } guardada${quantidadeInformacoes === 1 ? "" : "s"}.`}
                  </p>

                  <div className="mt-3">
                    <a
                      href="#informacoes"
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Plus className="size-3.5" />
                      Adicionar informação
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="voos" className="mt-10 scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Voos
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Voos guardados ou adicionados manualmente.
              </p>
            </div>

            <NovoVooDialog viagemId={viagemId} onDone={invalidar} />
          </div>

          <div className="mt-4">
            {!voos || voos.length === 0 ? (
              <EmptyState
                icon={Plane}
                titulo="Sem voos nesta viagem"
                descricao="Adicione um voo manualmente ou guarde um resultado da pesquisa."
              >
                <Button asChild variant="outline">
                  <Link
                    to="/pesquisa"
                    search={{
                      ...valoresIniciais,
                      apenasDiretos: false,
                      executar: 1,
                    }}
                  >
                    Pesquisar voos
                  </Link>
                </Button>
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {voos.map((v) => {
                  const companhiaVoo = [v.companhia, v.numero_voo]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <li
                      key={v.id}
                      className="rounded-2xl border border-border bg-card p-5"
                    >
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                          <Plane className="size-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <p className="font-display text-lg font-semibold">
                              {v.origem} → {v.destino}
                            </p>

                            {v.referencia ? (
                              <Badge variant="outline">
                                Ref. {v.referencia}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                            {companhiaVoo ? (
                              <span>{companhiaVoo}</span>
                            ) : null}

                            {v.partida ? (
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="size-3.5" />
                                {dataHora(v.partida)}
                              </span>
                            ) : null}
                          </div>

                          {v.partida ? (
                            <p className="mt-2 text-xs capitalize text-muted-foreground">
                              {dataCompleta(v.partida)}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                          {v.preco != null ? (
                            <span className="font-display text-lg font-semibold">
                              {fmtPreco.format(Number(v.preco))}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Preço não indicado
                            </span>
                          )}

                          <div className="flex items-center gap-1">
                            <EditarVooDialog
                              voo={v}
                              onDone={invalidar}
                            />

                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remover voo"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("voos")
                                  .delete()
                                  .eq("id", v.id);

                                if (error) {
                                  toast.error(error.message);
                                  return;
                                }

                                await invalidar();

                                toast.success("Voo removido.");
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section id="documentos" className="mt-10 scroll-mt-24">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Documentos, bilhetes & vouchers
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Tudo o que precisa de guardar para esta viagem fica associado
              aqui.
            </p>
          </div>

          <div className="mt-4">
            <DocumentosPainel
              viagemId={viagemId}
              documentos={documentos ?? []}
              onDone={invalidar}
            />
          </div>
        </section>

        <section id="alojamentos" className="mt-10 scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Alojamentos
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hotéis, apartamentos e outros alojamentos desta viagem.
              </p>
            </div>

            <NovoAlojamentoDialog viagemId={viagemId} onDone={invalidar} />
          </div>

          <div className="mt-4">
            {!alojamentos || alojamentos.length === 0 ? (
              <EmptyState
                icon={BedDouble}
                titulo="Sem alojamentos nesta viagem"
                descricao="Adicione aqui um hotel, apartamento ou outro alojamento."
              />
            ) : (
              <ul className="space-y-3">
                {alojamentos.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-2xl border border-border bg-card p-5"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                        <BedDouble className="size-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="font-display text-lg font-semibold">
                            {a.nome}
                          </p>
                          {a.referencia ? (
                            <Badge variant="outline">
                              Ref. {a.referencia}
                            </Badge>
                          ) : null}
                        </div>

                        {a.morada ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {a.morada}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                          {a.check_in ? (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="size-3.5" />
                              Check-in: {dataHora(a.check_in)}
                            </span>
                          ) : null}
                          {a.check_out ? (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="size-3.5" />
                              Check-out: {dataHora(a.check_out)}
                            </span>
                          ) : null}
                        </div>

                        {a.notas ? (
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {a.notas}
                          </p>
                        ) : null}

                        <AnexosItem
                          viagemId={viagemId}
                          categoria="alojamento"
                          itemId={a.id}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        {a.preco != null ? (
                          <span className="font-display text-lg font-semibold">
                            {fmtPreco.format(Number(a.preco))}
                          </span>
                        ) : null}

                        <EditarAlojamentoDialog
                          alojamento={a}
                          onDone={invalidar}
                        />

                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover alojamento"
                          onClick={async () => {
                            const { error } = await supabase
                              .from("alojamentos")
                              .delete()
                              .eq("id", a.id);

                            if (error) {
                              toast.error(error.message);
                              return;
                            }

                            await invalidar();
                            toast.success("Alojamento removido.");
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section id="transportes" className="mt-10 scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Transportes
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Comboios, autocarros, transfers, alugueres e outros transportes.
              </p>
            </div>

            <NovoTransporteDialog viagemId={viagemId} onDone={invalidar} />
          </div>

          <div className="mt-4">
            {!transportes || transportes.length === 0 ? (
              <EmptyState
                icon={TrainFront}
                titulo="Sem transportes nesta viagem"
                descricao="Adicione um transporte para manter o percurso organizado."
              />
            ) : (
              <ul className="space-y-3">
                {transportes.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-2xl border border-border bg-card p-5"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                        {t.tipo.toLowerCase().includes("carro") ? (
                          <Car className="size-5" />
                        ) : (
                          <TrainFront className="size-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="font-display text-lg font-semibold">
                            {t.tipo}
                          </p>
                          {t.operador ? (
                            <span className="text-sm text-muted-foreground">
                              {t.operador}
                            </span>
                          ) : null}
                          {t.referencia ? (
                            <Badge variant="outline">
                              Ref. {t.referencia}
                            </Badge>
                          ) : null}
                        </div>

                        {t.origem || t.destino ? (
                          <p className="mt-2 text-sm">
                            {t.origem || "—"} → {t.destino || "—"}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                          {t.partida ? (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="size-3.5" />
                              Partida: {dataHora(t.partida)}
                            </span>
                          ) : null}
                          {t.chegada ? (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="size-3.5" />
                              Chegada: {dataHora(t.chegada)}
                            </span>
                          ) : null}
                        </div>

                        {t.notas ? (
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {t.notas}
                          </p>
                        ) : null}

                        <AnexosItem
                          viagemId={viagemId}
                          categoria="transporte"
                          itemId={t.id}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        {t.preco != null ? (
                          <span className="font-display text-lg font-semibold">
                            {fmtPreco.format(Number(t.preco))}
                          </span>
                        ) : null}

                        <EditarTransporteDialog
                          transporte={t}
                          onDone={invalidar}
                        />

                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover transporte"
                          onClick={async () => {
                            const { error } = await supabase
                              .from("transportes")
                              .delete()
                              .eq("id", t.id);

                            if (error) {
                              toast.error(error.message);
                              return;
                            }

                            await invalidar();
                            toast.success("Transporte removido.");
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section id="informacoes" className="mt-10 scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Informações
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Notas e informações importantes para esta viagem.
              </p>
            </div>

            <NovaInformacaoDialog viagemId={viagemId} onDone={invalidar} />
          </div>

          <div className="mt-4">
            {!informacoes || informacoes.length === 0 ? (
              <EmptyState
                icon={Info}
                titulo="Sem informações nesta viagem"
                descricao="Adicione notas, moradas, códigos ou outras informações úteis."
              />
            ) : (
              <ul className="space-y-3">
                {informacoes.map((i) => (
                  <li
                    key={i.id}
                    className="rounded-2xl border border-border bg-card p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                        <Info className="size-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg font-semibold">
                          {i.titulo}
                        </p>
                        {i.conteudo ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                            {i.conteudo}
                          </p>
                        ) : null}

                        <AnexosItem
                          viagemId={viagemId}
                          categoria="informacao"
                          itemId={i.id}
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <EditarInformacaoDialog
                          informacao={i}
                          onDone={invalidar}
                        />

                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover informação"
                          onClick={async () => {
                            const { error } = await supabase
                              .from("informacoes")
                              .delete()
                              .eq("id", i.id);

                            if (error) {
                              toast.error(error.message);
                              return;
                            }

                            await invalidar();
                            toast.success("Informação removida.");
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function NovoVooDialog({
  viagemId,
  onDone,
}: {
  viagemId: string;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);

  const [f, setF] = useState({
    companhia: "",
    numero_voo: "",
    origem: "",
    destino: "",
    partida: "",
    referencia: "",
    preco: "",
  });

  const [aGuardar, setAGuardar] = useState(false);

  async function guardar() {
    setAGuardar(true);

    try {
      const { error } = await supabase.from("voos").insert({
        viagem_id: viagemId,
        companhia: f.companhia || null,
        numero_voo: f.numero_voo || null,
        origem: f.origem.toUpperCase(),
        destino: f.destino.toUpperCase(),
        partida: f.partida ? new Date(f.partida).toISOString() : null,
        referencia: f.referencia || null,
        preco: f.preco ? Number(f.preco) : null,
      });

      if (error) throw error;

      await onDone();

      toast.success("Voo adicionado.");
      setAberto(false);

      setF({
        companhia: "",
        numero_voo: "",
        origem: "",
        destino: "",
        partida: "",
        referencia: "",
        preco: "",
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erro ao adicionar voo.",
      );
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Adicionar voo
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar voo</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="origem">Origem</Label>

            <Input
              id="origem"
              value={f.origem}
              onChange={(e) =>
                setF({
                  ...f,
                  origem: e.target.value.toUpperCase(),
                })
              }
              className="mt-1.5 uppercase"
            />
          </div>

          <div>
            <Label htmlFor="destino">Destino</Label>

            <Input
              id="destino"
              value={f.destino}
              onChange={(e) =>
                setF({
                  ...f,
                  destino: e.target.value.toUpperCase(),
                })
              }
              className="mt-1.5 uppercase"
            />
          </div>

          <div>
            <Label htmlFor="companhia">Companhia</Label>

            <Input
              id="companhia"
              value={f.companhia}
              onChange={(e) =>
                setF({
                  ...f,
                  companhia: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="numero">Número do voo</Label>

            <Input
              id="numero"
              value={f.numero_voo}
              onChange={(e) =>
                setF({
                  ...f,
                  numero_voo: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="partida">Partida</Label>

            <Input
              id="partida"
              type="datetime-local"
              value={f.partida}
              onChange={(e) =>
                setF({
                  ...f,
                  partida: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="preco">Preço (EUR)</Label>

            <Input
              id="preco"
              type="number"
              step="0.01"
              value={f.preco}
              onChange={(e) =>
                setF({
                  ...f,
                  preco: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="ref">Referência da reserva</Label>

            <Input
              id="ref"
              value={f.referencia}
              onChange={(e) =>
                setF({
                  ...f,
                  referencia: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => void guardar()}
            disabled={!f.origem || !f.destino || aGuardar}
          >
            {aGuardar ? "A guardar..." : "Guardar voo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type VooEditavel = {
  id: string;
  companhia: string | null;
  numero_voo: string | null;
  origem: string;
  destino: string;
  partida: string | null;
  referencia: string | null;
  preco: number | null;
};

function EditarVooDialog({
  voo,
  onDone,
}: {
  voo: VooEditavel;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);

  const [f, setF] = useState({
    companhia: "",
    numero_voo: "",
    origem: "",
    destino: "",
    partida: "",
    referencia: "",
    preco: "",
  });

  useEffect(() => {
    if (!aberto) return;

    setF({
      companhia: voo.companhia ?? "",
      numero_voo: voo.numero_voo ?? "",
      origem: voo.origem ?? "",
      destino: voo.destino ?? "",
      partida: valorParaDataHoraLocal(voo.partida),
      referencia: voo.referencia ?? "",
      preco:
        voo.preco != null
          ? String(Number(voo.preco))
          : "",
    });
  }, [aberto, voo]);

  async function guardar() {
    if (!f.origem.trim() || !f.destino.trim()) {
      toast.error("Indique a origem e o destino.");
      return;
    }

    setAGuardar(true);

    try {
      const { error } = await supabase
        .from("voos")
        .update({
          companhia: f.companhia.trim() || null,
          numero_voo: f.numero_voo.trim() || null,
          origem: f.origem.trim().toUpperCase(),
          destino: f.destino.trim().toUpperCase(),
          partida: f.partida
            ? new Date(f.partida).toISOString()
            : null,
          referencia: f.referencia.trim() || null,
          preco: f.preco ? Number(f.preco) : null,
        })
        .eq("id", voo.id);

      if (error) throw error;

      await onDone();

      toast.success("Voo atualizado.");
      setAberto(false);
    } catch (err) {
      const mensagem =
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof err.message === "string"
          ? err.message
          : "Não foi possível atualizar o voo.";

      toast.error(mensagem);
      console.error("Erro ao editar voo:", err);
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Editar voo"
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar voo</DialogTitle>

          <DialogDescription>
            Altere os dados deste voo. A referência e o preço também
            podem ser atualizados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="editar-voo-origem">Origem</Label>

            <Input
              id="editar-voo-origem"
              value={f.origem}
              onChange={(e) =>
                setF({
                  ...f,
                  origem: e.target.value.toUpperCase(),
                })
              }
              className="mt-1.5 uppercase"
            />
          </div>

          <div>
            <Label htmlFor="editar-voo-destino">Destino</Label>

            <Input
              id="editar-voo-destino"
              value={f.destino}
              onChange={(e) =>
                setF({
                  ...f,
                  destino: e.target.value.toUpperCase(),
                })
              }
              className="mt-1.5 uppercase"
            />
          </div>

          <div>
            <Label htmlFor="editar-voo-companhia">
              Companhia
            </Label>

            <Input
              id="editar-voo-companhia"
              value={f.companhia}
              onChange={(e) =>
                setF({
                  ...f,
                  companhia: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="editar-voo-numero">
              Número do voo
            </Label>

            <Input
              id="editar-voo-numero"
              value={f.numero_voo}
              onChange={(e) =>
                setF({
                  ...f,
                  numero_voo: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="editar-voo-partida">
              Partida
            </Label>

            <Input
              id="editar-voo-partida"
              type="datetime-local"
              value={f.partida}
              onChange={(e) =>
                setF({
                  ...f,
                  partida: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="editar-voo-preco">
              Preço (EUR)
            </Label>

            <Input
              id="editar-voo-preco"
              type="number"
              step="0.01"
              value={f.preco}
              onChange={(e) =>
                setF({
                  ...f,
                  preco: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="editar-voo-referencia">
              Referência da reserva
            </Label>

            <Input
              id="editar-voo-referencia"
              value={f.referencia}
              onChange={(e) =>
                setF({
                  ...f,
                  referencia: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAberto(false)}
            disabled={aGuardar}
          >
            Cancelar
          </Button>

          <Button
            onClick={() => void guardar()}
            disabled={aGuardar}
          >
            {aGuardar ? "A guardar..." : "Guardar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



type AnexoCategoria = "alojamento" | "transporte" | "informacao";

type AnexoViagem = Database["public"]["Tables"]["anexos_viagem"]["Row"];

function validarFicheiroAnexo(file: File) {
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
    return "Formato não suportado. Escolha um PDF ou uma imagem.";
  }

  if (file.size > 20 * 1024 * 1024) {
    return "Ficheiro demasiado grande (máximo 20 MB).";
  }

  return null;
}

function nomeSeguroFicheiro(file: File) {
  return file.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
}

async function guardarAnexoViagem({
  viagemId,
  categoria,
  itemId,
  file,
}: {
  viagemId: string;
  categoria: AnexoCategoria;
  itemId: string;
  file: File;
}) {
  const erroValidacao = validarFicheiroAnexo(file);
  if (erroValidacao) throw new Error(erroValidacao);

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;

  if (!uid) throw new Error("Sessão expirada.");

  const path = `${uid}/${viagemId}/anexos/${categoria}/${itemId}/${Date.now()}-${nomeSeguroFicheiro(file)}`;

  const { data: upload, error: erroUpload } = await supabase.storage
    .from("documentos")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (erroUpload) throw erroUpload;

  const pathGuardado = upload?.path ?? null;

  if (!pathGuardado || pathGuardado.split("/")[0] !== uid) {
    if (pathGuardado) {
      await supabase.storage.from("documentos").remove([pathGuardado]);
    }

    throw new Error(
      "O armazenamento não confirmou o caminho seguro do ficheiro.",
    );
  }

  const { error } = await supabase.from("anexos_viagem").insert({
    user_id: uid,
    viagem_id: viagemId,
    categoria,
    item_id: itemId,
    nome: file.name,
    ficheiro_path: pathGuardado,
    mime_type: file.type || null,
    tamanho_bytes: file.size,
  });

  if (error) {
    await supabase.storage.from("documentos").remove([pathGuardado]);
    throw error;
  }

  return pathGuardado;
}

function FicheiroSelecionado({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-xl border border-dashed border-border p-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;

          if (selected) {
            const erro = validarFicheiroAnexo(selected);

            if (erro) {
              toast.error(erro);
              e.currentTarget.value = "";
              return;
            }
          }

          onChange(selected);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Ficheiro</p>
          <p className="truncate text-xs text-muted-foreground">
            {file
              ? file.name
              : "Opcional — pode adicionar um PDF ou uma imagem."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {file ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                onChange(null);

                if (inputRef.current) {
                  inputRef.current.value = "";
                }
              }}
            >
              Remover
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            {file ? "Alterar ficheiro" : "Adicionar ficheiro"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AnexosItem({
  viagemId,
  categoria,
  itemId,
}: {
  viagemId: string;
  categoria: AnexoCategoria;
  itemId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [aEnviar, setAEnviar] = useState(false);

  const { data: anexos, isLoading } = useQuery({
    queryKey: ["anexos-viagem", viagemId, categoria, itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anexos_viagem")
        .select("*")
        .eq("viagem_id", viagemId)
        .eq("categoria", categoria)
        .eq("item_id", itemId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data;
    },
  });

  async function enviar(file: File) {
    setAEnviar(true);

    try {
      await guardarAnexoViagem({
        viagemId,
        categoria,
        itemId,
        file,
      });

      await queryClient.invalidateQueries({
        queryKey: ["anexos-viagem", viagemId, categoria, itemId],
      });

      toast.success("Ficheiro adicionado.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Não foi possível adicionar o ficheiro.",
      );
    } finally {
      setAEnviar(false);

      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  async function abrir(anexo: AnexoViagem) {
    const { data, error } = await supabase.storage
      .from("documentos")
      .download(anexo.ficheiro_path);

    if (error || !data) {
      toast.error(
        error?.message || "Não foi possível abrir o ficheiro.",
      );
      return;
    }

    const blob = new Blob([data], {
      type:
        anexo.mime_type ||
        data.type ||
        "application/octet-stream",
    });

    const url = URL.createObjectURL(blob);

    window.open(url, "_blank", "noopener,noreferrer");

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  async function remover(anexo: AnexoViagem) {
    const { error: erroStorage } = await supabase.storage
      .from("documentos")
      .remove([anexo.ficheiro_path]);

    if (erroStorage) {
      toast.error(erroStorage.message);
      return;
    }

    const { error } = await supabase
      .from("anexos_viagem")
      .delete()
      .eq("id", anexo.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["anexos-viagem", viagemId, categoria, itemId],
    });

    toast.success("Ficheiro removido.");
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-border p-3">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];

          if (file) {
            void enviar(file);
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Ficheiros associados</p>
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "A carregar..."
              : anexos?.length
                ? `${anexos.length} ficheiro${anexos.length === 1 ? "" : "s"}`
                : "Nenhum ficheiro associado."}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={aEnviar}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-3.5" />
          {aEnviar ? "A carregar..." : "Adicionar ficheiro"}
        </Button>
      </div>

      {anexos && anexos.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {anexos.map((anexo) => (
            <li
              key={anexo.id}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />

              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                onClick={() => void abrir(anexo)}
                title={anexo.nome}
              >
                {anexo.nome}
              </button>

              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Remover ${anexo.nome}`}
                onClick={() => void remover(anexo)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type AlojamentoEditavel = Database["public"]["Tables"]["alojamentos"]["Row"];

function NovoAlojamentoDialog({
  viagemId,
  onDone,
}: {
  viagemId: string;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [f, setF] = useState({
    nome: "",
    morada: "",
    check_in: "",
    check_out: "",
    referencia: "",
    preco: "",
    notas: "",
  });

  function limpar() {
    setF({
      nome: "",
      morada: "",
      check_in: "",
      check_out: "",
      referencia: "",
      preco: "",
      notas: "",
    });
  }

  async function guardar() {
    if (!f.nome.trim()) {
      toast.error("Indique o nome do alojamento.");
      return;
    }

    if (f.check_in && f.check_out && f.check_out < f.check_in) {
      toast.error("A data de check-out não pode ser anterior ao check-in.");
      return;
    }

    setAGuardar(true);

    try {
      const { data, error } = await supabase
        .from("alojamentos")
        .insert({
        viagem_id: viagemId,
        nome: f.nome.trim(),
        morada: f.morada.trim() || null,
        check_in: f.check_in ? new Date(f.check_in).toISOString() : null,
        check_out: f.check_out ? new Date(f.check_out).toISOString() : null,
        referencia: f.referencia.trim() || null,
        preco: f.preco ? Number(f.preco) : null,
        notas: f.notas.trim() || null,
      })
      .select()
      .single();

      if (error) throw error;

      if (ficheiro) {
        try {
          await guardarAnexoViagem({
            viagemId,
            categoria: "alojamento",
            itemId: data.id,
            file: ficheiro,
          });
        } catch (erroAnexo) {
          await supabase
            .from("alojamentos")
            .delete()
            .eq("id", data.id);
          throw erroAnexo;
        }
      }

      await onDone();
      toast.success(
        ficheiro
          ? "Alojamento e ficheiro adicionados."
          : "Alojamento adicionado.",
      );
      setAberto(false);
      limpar();
      setFicheiro(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível adicionar o alojamento.",
      );
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Adicionar alojamento
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar alojamento</DialogTitle>
          <DialogDescription>
            Guarde os dados do hotel, apartamento ou outro alojamento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="novo-alojamento-nome">Nome</Label>
            <Input
              id="novo-alojamento-nome"
              value={f.nome}
              onChange={(e) => setF({ ...f, nome: e.target.value })}
              placeholder="Hotel ou alojamento"
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="novo-alojamento-morada">Morada</Label>
            <Input
              id="novo-alojamento-morada"
              value={f.morada}
              onChange={(e) => setF({ ...f, morada: e.target.value })}
              placeholder="Rua, número, cidade"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-alojamento-checkin">Check-in</Label>
            <Input
              id="novo-alojamento-checkin"
              type="datetime-local"
              value={f.check_in}
              onChange={(e) => setF({ ...f, check_in: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-alojamento-checkout">Check-out</Label>
            <Input
              id="novo-alojamento-checkout"
              type="datetime-local"
              value={f.check_out}
              onChange={(e) => setF({ ...f, check_out: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-alojamento-referencia">Referência</Label>
            <Input
              id="novo-alojamento-referencia"
              value={f.referencia}
              onChange={(e) => setF({ ...f, referencia: e.target.value })}
              placeholder="ABC123"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-alojamento-preco">Preço (EUR)</Label>
            <Input
              id="novo-alojamento-preco"
              type="number"
              step="0.01"
              value={f.preco}
              onChange={(e) => setF({ ...f, preco: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="novo-alojamento-notas">Notas</Label>
            <Textarea
              id="novo-alojamento-notas"
              value={f.notas}
              onChange={(e) => setF({ ...f, notas: e.target.value })}
              placeholder="Informações importantes..."
              className="mt-1.5 min-h-20"
            />
          </div>
          <div className="sm:col-span-2">
            <FicheiroSelecionado
              file={ficheiro}
              onChange={setFicheiro}
              disabled={aGuardar}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aGuardar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={aGuardar}>
            {aGuardar ? "A guardar..." : "Guardar alojamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarAlojamentoDialog({
  alojamento,
  onDone,
}: {
  alojamento: AlojamentoEditavel;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [f, setF] = useState({
    nome: "",
    morada: "",
    check_in: "",
    check_out: "",
    referencia: "",
    preco: "",
    notas: "",
  });

  useEffect(() => {
    if (!aberto) return;

    setF({
      nome: alojamento.nome ?? "",
      morada: alojamento.morada ?? "",
      check_in: valorParaDataHoraLocal(alojamento.check_in),
      check_out: valorParaDataHoraLocal(alojamento.check_out),
      referencia: alojamento.referencia ?? "",
      preco: alojamento.preco != null ? String(Number(alojamento.preco)) : "",
      notas: alojamento.notas ?? "",
    });
  }, [aberto, alojamento]);

  async function guardar() {
    if (!f.nome.trim()) {
      toast.error("Indique o nome do alojamento.");
      return;
    }

    if (f.check_in && f.check_out && f.check_out < f.check_in) {
      toast.error("A data de check-out não pode ser anterior ao check-in.");
      return;
    }

    setAGuardar(true);

    try {
      const { error } = await supabase
        .from("alojamentos")
        .update({
          nome: f.nome.trim(),
          morada: f.morada.trim() || null,
          check_in: f.check_in ? new Date(f.check_in).toISOString() : null,
          check_out: f.check_out ? new Date(f.check_out).toISOString() : null,
          referencia: f.referencia.trim() || null,
          preco: f.preco ? Number(f.preco) : null,
          notas: f.notas.trim() || null,
        })
        .eq("id", alojamento.id);

      if (error) throw error;

      await onDone();
      toast.success("Alojamento atualizado.");
      setAberto(false);
    } catch (err) {
      const mensagem =
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof err.message === "string"
          ? err.message
          : "Não foi possível atualizar o alojamento.";

      toast.error(mensagem);
      console.error("Erro ao editar alojamento:", err);
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar alojamento">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar alojamento</DialogTitle>
          <DialogDescription>
            Altere os dados deste alojamento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`editar-alojamento-nome-${alojamento.id}`}>Nome</Label>
            <Input
              id={`editar-alojamento-nome-${alojamento.id}`}
              value={f.nome}
              onChange={(e) => setF({ ...f, nome: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor={`editar-alojamento-morada-${alojamento.id}`}>Morada</Label>
            <Input
              id={`editar-alojamento-morada-${alojamento.id}`}
              value={f.morada}
              onChange={(e) => setF({ ...f, morada: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-alojamento-checkin-${alojamento.id}`}>Check-in</Label>
            <Input
              id={`editar-alojamento-checkin-${alojamento.id}`}
              type="datetime-local"
              value={f.check_in}
              onChange={(e) => setF({ ...f, check_in: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-alojamento-checkout-${alojamento.id}`}>Check-out</Label>
            <Input
              id={`editar-alojamento-checkout-${alojamento.id}`}
              type="datetime-local"
              value={f.check_out}
              onChange={(e) => setF({ ...f, check_out: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-alojamento-referencia-${alojamento.id}`}>Referência</Label>
            <Input
              id={`editar-alojamento-referencia-${alojamento.id}`}
              value={f.referencia}
              onChange={(e) => setF({ ...f, referencia: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-alojamento-preco-${alojamento.id}`}>Preço (EUR)</Label>
            <Input
              id={`editar-alojamento-preco-${alojamento.id}`}
              type="number"
              step="0.01"
              value={f.preco}
              onChange={(e) => setF({ ...f, preco: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor={`editar-alojamento-notas-${alojamento.id}`}>Notas</Label>
            <Textarea
              id={`editar-alojamento-notas-${alojamento.id}`}
              value={f.notas}
              onChange={(e) => setF({ ...f, notas: e.target.value })}
              className="mt-1.5 min-h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aGuardar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={aGuardar}>
            {aGuardar ? "A guardar..." : "Guardar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TransporteEditavel = Database["public"]["Tables"]["transportes"]["Row"];

function NovoTransporteDialog({
  viagemId,
  onDone,
}: {
  viagemId: string;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [f, setF] = useState({
    tipo: "",
    operador: "",
    origem: "",
    destino: "",
    partida: "",
    chegada: "",
    referencia: "",
    preco: "",
    notas: "",
  });

  async function guardar() {
    if (!f.tipo.trim()) {
      toast.error("Indique o tipo de transporte.");
      return;
    }

    if (f.partida && f.chegada && f.chegada < f.partida) {
      toast.error("A chegada não pode ser anterior à partida.");
      return;
    }

    setAGuardar(true);

    try {
      const { data, error } = await supabase
        .from("transportes")
        .insert({
        viagem_id: viagemId,
        tipo: f.tipo.trim(),
        operador: f.operador.trim() || null,
        origem: f.origem.trim() || null,
        destino: f.destino.trim() || null,
        partida: f.partida ? new Date(f.partida).toISOString() : null,
        chegada: f.chegada ? new Date(f.chegada).toISOString() : null,
        referencia: f.referencia.trim() || null,
        preco: f.preco ? Number(f.preco) : null,
        notas: f.notas.trim() || null,
      })
      .select()
      .single();

      if (error) throw error;

      if (ficheiro) {
        try {
          await guardarAnexoViagem({
            viagemId,
            categoria: "transporte",
            itemId: data.id,
            file: ficheiro,
          });
        } catch (erroAnexo) {
          await supabase
            .from("transportes")
            .delete()
            .eq("id", data.id);
          throw erroAnexo;
        }
      }

      await onDone();
      toast.success(
        ficheiro
          ? "Transporte e ficheiro adicionados."
          : "Transporte adicionado.",
      );
      setAberto(false);
      setFicheiro(null);
      setF({
        tipo: "",
        operador: "",
        origem: "",
        destino: "",
        partida: "",
        chegada: "",
        referencia: "",
        preco: "",
        notas: "",
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível adicionar o transporte.",
      );
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Adicionar transporte
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar transporte</DialogTitle>
          <DialogDescription>
            Registe comboios, autocarros, transfers, alugueres ou outros transportes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="novo-transporte-tipo">Tipo</Label>
            <Input
              id="novo-transporte-tipo"
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value })}
              placeholder="Comboio, autocarro, transfer..."
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-transporte-operador">Operador</Label>
            <Input
              id="novo-transporte-operador"
              value={f.operador}
              onChange={(e) => setF({ ...f, operador: e.target.value })}
              placeholder="CP, FlixBus..."
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-transporte-origem">Origem</Label>
            <Input
              id="novo-transporte-origem"
              value={f.origem}
              onChange={(e) => setF({ ...f, origem: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-transporte-destino">Destino</Label>
            <Input
              id="novo-transporte-destino"
              value={f.destino}
              onChange={(e) => setF({ ...f, destino: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-transporte-partida">Partida</Label>
            <Input
              id="novo-transporte-partida"
              type="datetime-local"
              value={f.partida}
              onChange={(e) => setF({ ...f, partida: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-transporte-chegada">Chegada</Label>
            <Input
              id="novo-transporte-chegada"
              type="datetime-local"
              value={f.chegada}
              onChange={(e) => setF({ ...f, chegada: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-transporte-referencia">Referência</Label>
            <Input
              id="novo-transporte-referencia"
              value={f.referencia}
              onChange={(e) => setF({ ...f, referencia: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="novo-transporte-preco">Preço (EUR)</Label>
            <Input
              id="novo-transporte-preco"
              type="number"
              step="0.01"
              value={f.preco}
              onChange={(e) => setF({ ...f, preco: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="novo-transporte-notas">Notas</Label>
            <Textarea
              id="novo-transporte-notas"
              value={f.notas}
              onChange={(e) => setF({ ...f, notas: e.target.value })}
              className="mt-1.5 min-h-20"
            />
          </div>
          <div className="sm:col-span-2">
            <FicheiroSelecionado
              file={ficheiro}
              onChange={setFicheiro}
              disabled={aGuardar}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aGuardar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={aGuardar}>
            {aGuardar ? "A guardar..." : "Guardar transporte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarTransporteDialog({
  transporte,
  onDone,
}: {
  transporte: TransporteEditavel;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [f, setF] = useState({
    tipo: "",
    operador: "",
    origem: "",
    destino: "",
    partida: "",
    chegada: "",
    referencia: "",
    preco: "",
    notas: "",
  });

  useEffect(() => {
    if (!aberto) return;

    setF({
      tipo: transporte.tipo ?? "",
      operador: transporte.operador ?? "",
      origem: transporte.origem ?? "",
      destino: transporte.destino ?? "",
      partida: valorParaDataHoraLocal(transporte.partida),
      chegada: valorParaDataHoraLocal(transporte.chegada),
      referencia: transporte.referencia ?? "",
      preco: transporte.preco != null ? String(Number(transporte.preco)) : "",
      notas: transporte.notas ?? "",
    });
  }, [aberto, transporte]);

  async function guardar() {
    if (!f.tipo.trim()) {
      toast.error("Indique o tipo de transporte.");
      return;
    }

    if (f.partida && f.chegada && f.chegada < f.partida) {
      toast.error("A chegada não pode ser anterior à partida.");
      return;
    }

    setAGuardar(true);

    try {
      const { error } = await supabase
        .from("transportes")
        .update({
          tipo: f.tipo.trim(),
          operador: f.operador.trim() || null,
          origem: f.origem.trim() || null,
          destino: f.destino.trim() || null,
          partida: f.partida ? new Date(f.partida).toISOString() : null,
          chegada: f.chegada ? new Date(f.chegada).toISOString() : null,
          referencia: f.referencia.trim() || null,
          preco: f.preco ? Number(f.preco) : null,
          notas: f.notas.trim() || null,
        })
        .eq("id", transporte.id);

      if (error) throw error;

      await onDone();
      toast.success("Transporte atualizado.");
      setAberto(false);
    } catch (err) {
      const mensagem =
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof err.message === "string"
          ? err.message
          : "Não foi possível atualizar o transporte.";

      toast.error(mensagem);
      console.error("Erro ao editar transporte:", err);
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar transporte">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar transporte</DialogTitle>
          <DialogDescription>
            Altere os dados deste transporte.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`editar-transporte-tipo-${transporte.id}`}>Tipo</Label>
            <Input
              id={`editar-transporte-tipo-${transporte.id}`}
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-transporte-operador-${transporte.id}`}>Operador</Label>
            <Input
              id={`editar-transporte-operador-${transporte.id}`}
              value={f.operador}
              onChange={(e) => setF({ ...f, operador: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-transporte-origem-${transporte.id}`}>Origem</Label>
            <Input
              id={`editar-transporte-origem-${transporte.id}`}
              value={f.origem}
              onChange={(e) => setF({ ...f, origem: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-transporte-destino-${transporte.id}`}>Destino</Label>
            <Input
              id={`editar-transporte-destino-${transporte.id}`}
              value={f.destino}
              onChange={(e) => setF({ ...f, destino: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-transporte-partida-${transporte.id}`}>Partida</Label>
            <Input
              id={`editar-transporte-partida-${transporte.id}`}
              type="datetime-local"
              value={f.partida}
              onChange={(e) => setF({ ...f, partida: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-transporte-chegada-${transporte.id}`}>Chegada</Label>
            <Input
              id={`editar-transporte-chegada-${transporte.id}`}
              type="datetime-local"
              value={f.chegada}
              onChange={(e) => setF({ ...f, chegada: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-transporte-referencia-${transporte.id}`}>Referência</Label>
            <Input
              id={`editar-transporte-referencia-${transporte.id}`}
              value={f.referencia}
              onChange={(e) => setF({ ...f, referencia: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-transporte-preco-${transporte.id}`}>Preço (EUR)</Label>
            <Input
              id={`editar-transporte-preco-${transporte.id}`}
              type="number"
              step="0.01"
              value={f.preco}
              onChange={(e) => setF({ ...f, preco: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor={`editar-transporte-notas-${transporte.id}`}>Notas</Label>
            <Textarea
              id={`editar-transporte-notas-${transporte.id}`}
              value={f.notas}
              onChange={(e) => setF({ ...f, notas: e.target.value })}
              className="mt-1.5 min-h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aGuardar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={aGuardar}>
            {aGuardar ? "A guardar..." : "Guardar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type InformacaoEditavel = Database["public"]["Tables"]["informacoes"]["Row"];

function NovaInformacaoDialog({
  viagemId,
  onDone,
}: {
  viagemId: string;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");

  async function guardar() {
    if (!titulo.trim()) {
      toast.error("Indique um título para a informação.");
      return;
    }

    setAGuardar(true);

    try {
      const { data, error } = await supabase
        .from("informacoes")
        .insert({
        viagem_id: viagemId,
        titulo: titulo.trim(),
        conteudo: conteudo.trim() || null,
      })
      .select()
      .single();

      if (error) throw error;

      if (ficheiro) {
        try {
          await guardarAnexoViagem({
            viagemId,
            categoria: "informacao",
            itemId: data.id,
            file: ficheiro,
          });
        } catch (erroAnexo) {
          await supabase
            .from("informacoes")
            .delete()
            .eq("id", data.id);
          throw erroAnexo;
        }
      }

      await onDone();
      toast.success(
        ficheiro
          ? "Informação e ficheiro adicionados."
          : "Informação adicionada.",
      );
      setAberto(false);
      setFicheiro(null);
      setTitulo("");
      setConteudo("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível adicionar a informação.",
      );
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Adicionar informação
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar informação</DialogTitle>
          <DialogDescription>
            Guarde uma nota, morada, código ou outra informação útil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="nova-informacao-titulo">Título</Label>
            <Input
              id="nova-informacao-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Morada do alojamento"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="nova-informacao-conteudo">Informação</Label>
            <Textarea
              id="nova-informacao-conteudo"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Escreva aqui a informação..."
              className="mt-1.5 min-h-28"
            />
          </div>

          <FicheiroSelecionado
            file={ficheiro}
            onChange={setFicheiro}
            disabled={aGuardar}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aGuardar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={aGuardar}>
            {aGuardar ? "A guardar..." : "Guardar informação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarInformacaoDialog({
  informacao,
  onDone,
}: {
  informacao: InformacaoEditavel;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");

  useEffect(() => {
    if (!aberto) return;

    setTitulo(informacao.titulo ?? "");
    setConteudo(informacao.conteudo ?? "");
  }, [aberto, informacao]);

  async function guardar() {
    if (!titulo.trim()) {
      toast.error("Indique um título para a informação.");
      return;
    }

    setAGuardar(true);

    try {
      const { error } = await supabase
        .from("informacoes")
        .update({
          titulo: titulo.trim(),
          conteudo: conteudo.trim() || null,
        })
        .eq("id", informacao.id);

      if (error) throw error;

      await onDone();
      toast.success("Informação atualizada.");
      setAberto(false);
    } catch (err) {
      const mensagem =
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof err.message === "string"
          ? err.message
          : "Não foi possível atualizar a informação.";

      toast.error(mensagem);
      console.error("Erro ao editar informação:", err);
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Editar informação">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar informação</DialogTitle>
          <DialogDescription>
            Altere esta informação da viagem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor={`editar-informacao-titulo-${informacao.id}`}>
              Título
            </Label>
            <Input
              id={`editar-informacao-titulo-${informacao.id}`}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-informacao-conteudo-${informacao.id}`}>
              Informação
            </Label>
            <Textarea
              id={`editar-informacao-conteudo-${informacao.id}`}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              className="mt-1.5 min-h-28"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aGuardar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={aGuardar}>
            {aGuardar ? "A guardar..." : "Guardar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Documento = {
  id: string;
  nome: string;
  tipo: string;
  origem: string;
  ficheiro_path: string | null;
  qr_conteudo: string | null;
  remetente_email: string | null;
  recebido_em: string | null;
  mime_type: string | null;
};

function DocumentosPainel({
  viagemId,
  documentos,
  onDone,
}: {
  viagemId: string;
  documentos: Documento[];
  onDone: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const urlVisualizacaoRef = useRef<string | null>(null);

  const [aEnviar, setAEnviar] = useState(false);

  const [visualizar, setVisualizar] = useState<{
    doc: Documento;
    url: string | null;
    aCarregar: boolean;
    erro: string | null;
    leitura: boolean;
  } | null>(null);

  useEffect(
    () => () => {
      if (urlVisualizacaoRef.current) {
        URL.revokeObjectURL(urlVisualizacaoRef.current);
      }
    },
    [],
  );

  function mensagemLeitura(error: unknown) {
    const detalhe =
      error && typeof error === "object" && "message" in error
        ? String(error.message).toLowerCase()
        : "";

    if (
      detalhe.includes("jwt") ||
      detalhe.includes("unauthorized") ||
      detalhe.includes("401")
    ) {
      return "A sessão expirou. Atualize a página e volte a entrar.";
    }

    if (
      detalhe.includes("forbidden") ||
      detalhe.includes("403")
    ) {
      return "O acesso foi recusado. Confirme que está na conta que carregou o ficheiro.";
    }

    if (
      detalhe.includes("not found") ||
      detalhe.includes("404")
    ) {
      return "O registo existe, mas o ficheiro original não foi encontrado.";
    }

    return "Não foi possível transferir o ficheiro. Verifique a ligação e tente novamente.";
  }

  async function enviarFicheiro(file: File) {
    if (
      file.type !== "application/pdf" &&
      !file.type.startsWith("image/")
    ) {
      toast.error(
        "Formato não suportado. Escolha um PDF ou uma imagem.",
      );
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("Ficheiro demasiado grande (máximo 20 MB).");
      return;
    }

    setAEnviar(true);

    let pathGuardado: string | null = null;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      if (!uid) {
        throw new Error("Sessão expirada.");
      }

      const nomeSeguro = file.name
        .normalize("NFD")
        .replace(/[^\w.-]+/g, "_");

      const path = `${uid}/${viagemId}/${Date.now()}-${nomeSeguro}`;

      const { data: upload, error: erroUpload } =
        await supabase.storage
          .from("documentos")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });

      if (erroUpload) throw erroUpload;

      pathGuardado = upload?.path ?? null;

      if (
        !pathGuardado ||
        pathGuardado.split("/")[0] !== uid
      ) {
        throw new Error(
          "O armazenamento não confirmou o caminho seguro do ficheiro.",
        );
      }

      const { error: erroLeitura } =
        await supabase.storage
          .from("documentos")
          .download(pathGuardado);

      if (erroLeitura) {
        throw new Error(mensagemLeitura(erroLeitura));
      }

      const { error } = await supabase.from("documentos").insert({
        viagem_id: viagemId,
        nome: file.name,
        tipo: file.type.includes("pdf") ? "pdf" : "ficheiro",
        origem: "upload",
        ficheiro_path: pathGuardado,
        mime_type: file.type,
        tamanho_bytes: file.size,
      });

      if (error) throw error;

      await onDone();

      toast.success("Documento carregado.");
    } catch (err) {
      if (pathGuardado) {
        await supabase.storage
          .from("documentos")
          .remove([pathGuardado]);
      }

      toast.error(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar o documento.",
      );
    } finally {
      setAEnviar(false);

      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  async function abrir(
    doc: Documento,
    leitura = false,
  ) {
    if (!doc.ficheiro_path) return;

    if (urlVisualizacaoRef.current) {
      URL.revokeObjectURL(urlVisualizacaoRef.current);
    }

    setVisualizar({
      doc,
      url: null,
      aCarregar: true,
      erro: null,
      leitura,
    });

    const { data, error } = await supabase.storage
      .from("documentos")
      .download(doc.ficheiro_path);

    if (error || !data) {
      setVisualizar({
        doc,
        url: null,
        aCarregar: false,
        erro: mensagemLeitura(error),
        leitura: false,
      });
      return;
    }

    const mimeEsperado =
      doc.mime_type ||
      (doc.nome.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : data.type);

    const blob = new Blob([data], {
      type: mimeEsperado || "application/octet-stream",
    });

    const objectUrl = URL.createObjectURL(blob);

    urlVisualizacaoRef.current = objectUrl;

    setVisualizar({
      doc,
      url: objectUrl,
      aCarregar: false,
      erro: null,
      leitura,
    });
  }

  async function remover(doc: Documento) {
    if (doc.ficheiro_path) {
      await supabase.storage
        .from("documentos")
        .remove([doc.ficheiro_path]);
    }

    await supabase
      .from("documentos")
      .delete()
      .eq("id", doc.id);

    await onDone();

    toast.success("Documento removido.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];

            if (file) {
              void enviarFicheiro(file);
            }
          }}
        />

        <Button
          size="sm"
          disabled={aEnviar}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-4" />
          {aEnviar ? "A carregar..." : "Carregar PDF"}
        </Button>

        <QrDialog viagemId={viagemId} onDone={onDone} />

        <EmailDialog viagemId={viagemId} onDone={onDone} />
      </div>

      {documentos.length === 0 ? (
        <EmptyState
          icon={FileText}
          titulo="Sem documentos nesta viagem"
          descricao="Carregue cartões de embarque em PDF, guarde códigos QR ou registe documentos que recebeu por email."
        />
      ) : (
        <ul className="space-y-3">
          {documentos.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-secondary">
                {d.tipo === "qr" ? (
                  <QrCode className="size-4" />
                ) : d.origem === "email" ? (
                  <Mail className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                {d.ficheiro_path ? (
                  <button
                    type="button"
                    className="cursor-pointer text-left font-medium text-primary underline underline-offset-4"
                    aria-label={`Ver o ficheiro original ${d.nome}`}
                    onClick={() => void abrir(d)}
                  >
                    {d.nome}
                  </button>
                ) : (
                  <p className="font-medium">{d.nome}</p>
                )}

                <p className="text-xs text-muted-foreground">
                  {d.origem === "email"
                    ? `Recebido de ${d.remetente_email ?? "email"}`
                    : d.tipo === "qr"
                      ? "Código QR guardado"
                      : "Carregado manualmente"}
                </p>

                {d.qr_conteudo ? (
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {d.qr_conteudo}
                  </p>
                ) : null}
              </div>

              <Badge variant="outline">{d.tipo}</Badge>

              <div className="flex items-center gap-1">
                <EditarDocumentoDialog
                  documento={d}
                  onDone={onDone}
                />

                {d.ficheiro_path ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void abrir(d, true)}
                    >
                      <Maximize2 className="size-4" />
                      Ler em ecrã inteiro
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Abrir"
                      onClick={() => void abrir(d)}
                    >
                      <Download className="size-4" />
                    </Button>
                  </>
                ) : null}

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover documento"
                  onClick={() => void remover(d)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <VisualizadorDocumento
        aberto={visualizar !== null}
        nome={visualizar?.doc.nome ?? ""}
        url={visualizar?.url ?? null}
        mimeType={visualizar?.doc.mime_type ?? null}
        aCarregar={visualizar?.aCarregar}
        erro={visualizar?.erro ?? null}
        iniciarLeitura={visualizar?.leitura ?? false}
        onTentarNovamente={
          visualizar
            ? () =>
                void abrir(
                  visualizar.doc,
                  visualizar.leitura,
                )
            : undefined
        }
        onFechar={() => {
          if (urlVisualizacaoRef.current) {
            URL.revokeObjectURL(urlVisualizacaoRef.current);
            urlVisualizacaoRef.current = null;
          }

          setVisualizar(null);
        }}
      />
    </div>
  );
}

function EditarDocumentoDialog({
  documento,
  onDone,
}: {
  documento: Documento;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    tipo: "",
    qr_conteudo: "",
    remetente_email: "",
  });

  useEffect(() => {
    if (!aberto) return;

    setForm({
      nome: documento.nome ?? "",
      tipo: documento.tipo ?? "",
      qr_conteudo: documento.qr_conteudo ?? "",
      remetente_email: documento.remetente_email ?? "",
    });
  }, [aberto, documento]);

  async function guardar() {
    if (!form.nome.trim()) {
      toast.error("Indique um nome para o documento.");
      return;
    }

    setAGuardar(true);

    try {
      const { error } = await supabase
        .from("documentos")
        .update({
          nome: form.nome.trim(),
          tipo: form.tipo.trim() || documento.tipo,
          qr_conteudo: form.qr_conteudo.trim() || null,
          remetente_email:
            form.remetente_email.trim() || null,
        })
        .eq("id", documento.id);

      if (error) throw error;

      await onDone();

      toast.success("Documento atualizado.");
      setAberto(false);
    } catch (err) {
      const mensagem =
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof err.message === "string"
          ? err.message
          : "Não foi possível atualizar o documento.";

      toast.error(mensagem);
      console.error("Erro ao editar documento:", err);
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Editar documento"
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar documento</DialogTitle>

          <DialogDescription>
            Altere os dados do documento sem alterar o ficheiro original.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor={`editar-documento-nome-${documento.id}`}>
              Nome
            </Label>

            <Input
              id={`editar-documento-nome-${documento.id}`}
              value={form.nome}
              onChange={(e) =>
                setForm({
                  ...form,
                  nome: e.target.value,
                })
              }
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-documento-tipo-${documento.id}`}>
              Tipo
            </Label>

            <Input
              id={`editar-documento-tipo-${documento.id}`}
              value={form.tipo}
              onChange={(e) =>
                setForm({
                  ...form,
                  tipo: e.target.value,
                })
              }
              placeholder="pdf, bilhete, voucher, qr..."
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-documento-remetente-${documento.id}`}>
              Remetente do email
            </Label>

            <Input
              id={`editar-documento-remetente-${documento.id}`}
              type="email"
              value={form.remetente_email}
              onChange={(e) =>
                setForm({
                  ...form,
                  remetente_email: e.target.value,
                })
              }
              placeholder="reservas@companhia.com"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor={`editar-documento-qr-${documento.id}`}>
              Conteúdo do QR
            </Label>

            <Textarea
              id={`editar-documento-qr-${documento.id}`}
              value={form.qr_conteudo}
              onChange={(e) =>
                setForm({
                  ...form,
                  qr_conteudo: e.target.value,
                })
              }
              placeholder="Link ou texto do código QR"
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAberto(false)}
            disabled={aGuardar}
          >
            Cancelar
          </Button>

          <Button
            onClick={() => void guardar()}
            disabled={aGuardar}
          >
            {aGuardar ? "A guardar..." : "Guardar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({
  viagemId,
  onDone,
}: {
  viagemId: string;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [conteudo, setConteudo] = useState("");

  async function guardar() {
    const { error } = await supabase.from("documentos").insert({
      viagem_id: viagemId,
      nome: nome || "Código QR",
      tipo: "qr",
      origem: "qr",
      qr_conteudo: conteudo,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    await onDone();

    toast.success("Código QR guardado.");

    setAberto(false);
    setNome("");
    setConteudo("");
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <QrCode className="size-4" />
          Guardar QR
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar código QR</DialogTitle>

          <DialogDescription>
            Cole o conteúdo do código (link ou texto do cartão de embarque).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="qrnome">Nome</Label>

            <Input
              id="qrnome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Cartão de embarque ida"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="qrconteudo">Conteúdo do QR</Label>

            <Textarea
              id="qrconteudo"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => void guardar()}
            disabled={!conteudo}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmailDialog({
  viagemId,
  onDone,
}: {
  viagemId: string;
  onDone: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [remetente, setRemetente] = useState("");

  async function guardar() {
    const { error } = await supabase.from("documentos").insert({
      viagem_id: viagemId,
      nome: nome || "Documento recebido por email",
      tipo: "email",
      origem: "email",
      remetente_email: remetente || null,
      recebido_em: new Date().toISOString(),
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    await onDone();

    toast.success("Documento registado.");

    setAberto(false);
    setNome("");
    setRemetente("");
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Mail className="size-4" />
          Registar email
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Documento recebido por email</DialogTitle>

          <DialogDescription>
            Registe aqui bilhetes ou confirmações que chegaram por email. A
            receção automática de emails fica pronta a ligar quando configurar
            o endereço de reencaminhamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="emailnome">Nome do documento</Label>

            <Input
              id="emailnome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Confirmação de reserva"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="remetente">Remetente</Label>

            <Input
              id="remetente"
              type="email"
              value={remetente}
              onChange={(e) => setRemetente(e.target.value)}
              placeholder="reservas@companhia.com"
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void guardar()}>
            Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}