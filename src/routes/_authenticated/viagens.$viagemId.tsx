import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  Download,
  FileText,
  Mail,
  Maximize2,
  Plane,
  Plus,
  QrCode,
  TrainFront,
  Trash2,
  Upload,
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

function DetalheViagem() {
  const { viagemId } = Route.useParams();
  const queryClient = useQueryClient();

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

  const invalidar = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["voos", viagemId],
    });

    await queryClient.invalidateQueries({
      queryKey: ["documentos", viagemId],
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

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/viagens">
            <ArrowLeft className="size-4" /> Minhas viagens
          </Link>
        </Button>

        <header className="mt-3">
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <Plane className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Voos</h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {quantidadeVoos === 0
                      ? "Ainda não adicionou voos."
                      : `${quantidadeVoos} ${
                          quantidadeVoos === 1 ? "voo" : "voos"
                        } guardado${quantidadeVoos === 1 ? "" : "s"}.`}
                  </p>

                  <div className="mt-3">
                    <a
                      href="#voos"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Plus className="size-4" />
                      Adicionar voo
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <BedDouble className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Alojamento</h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Guarde reservas de hotel e outros alojamentos nesta
                    viagem.
                  </p>

                  <div className="mt-3">
                    <Button size="sm" variant="outline" disabled>
                      <Plus className="size-4" />
                      Adicionar alojamento
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <TrainFront className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Transportes</h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Comboios, autocarros, transfers e outros transportes.
                  </p>

                  <div className="mt-3">
                    <Button size="sm" variant="outline" disabled>
                      <Plus className="size-4" />
                      Adicionar transporte
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <QrCode className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Bilhetes & vouchers</h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Bilhetes, vouchers, códigos QR e confirmações da viagem.
                  </p>

                  <div className="mt-3">
                    <a
                      href="#documentos"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Plus className="size-4" />
                      Adicionar
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <FileText className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Documentos</h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    PDFs, imagens e documentos associados a esta viagem.
                  </p>

                  <div className="mt-3">
                    <a
                      href="#documentos"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Plus className="size-4" />
                      Adicionar documento
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <CalendarDays className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Informações</h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Notas e informações importantes sobre esta viagem.
                  </p>

                  <div className="mt-3">
                    <Button size="sm" variant="outline" disabled>
                      <Plus className="size-4" />
                      Adicionar informação
                    </Button>
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

              <div className="flex-1">
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