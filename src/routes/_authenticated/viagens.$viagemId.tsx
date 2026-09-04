import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  FileText,
  Mail,
  Plane,
  Plus,
  QrCode,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/viagens/$viagemId")({
  head: () => ({
    meta: [
      { title: "Detalhe da viagem — Simplesmente voo" },
      {
        name: "description",
        content: "Voos guardados e documentos associados a esta viagem.",
      },
      { property: "og:title", content: "Detalhe da viagem — Simplesmente voo" },
      {
        property: "og:description",
        content: "Cartões de embarque, códigos QR e documentos recebidos por email.",
      },
    ],
  }),
  component: DetalheViagem,
  errorComponent: ({ error }) => (
    <AppShell>
      <p role="alert" className="mx-auto max-w-4xl px-4 py-16 text-sm text-destructive">
        {error.message}
      </p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="mx-auto max-w-4xl px-4 py-16 text-sm">Viagem não encontrada.</p>
    </AppShell>
  ),
});

const fmtPreco = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

function dataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
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
    await queryClient.invalidateQueries({ queryKey: ["voos", viagemId] });
    await queryClient.invalidateQueries({ queryKey: ["documentos", viagemId] });
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

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/viagens">
            <ArrowLeft className="size-4" /> Minhas viagens
          </Link>
        </Button>

        <header className="mt-3">
          <h1 className="font-display text-2xl font-semibold">{viagem.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {[viagem.destino, viagem.data_inicio, viagem.data_fim].filter(Boolean).join(" · ") ||
              "Sem datas definidas"}
          </p>
          {viagem.notas ? <p className="mt-3 text-sm">{viagem.notas}</p> : null}
        </header>

        <Tabs defaultValue="voos" className="mt-8">
          <TabsList>
            <TabsTrigger value="voos">Voos ({voos?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="documentos">Documentos ({documentos?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="voos" className="mt-5 space-y-4">
            <div className="flex justify-end">
              <NovoVooDialog viagemId={viagemId} onDone={invalidar} />
            </div>
            {!voos || voos.length === 0 ? (
              <EmptyState
                icon={Plane}
                titulo="Sem voos nesta viagem"
                descricao="Adicione um voo manualmente ou guarde um resultado da pesquisa."
              >
                <Button asChild variant="outline">
                  <Link to="/pesquisa" search={{}}>Pesquisar voos</Link>
                </Button>
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {voos.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="flex-1">
                      <p className="font-display font-semibold">
                        {v.origem} → {v.destino}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {v.companhia} {v.numero_voo} · {dataHora(v.partida)}
                        {v.referencia ? ` · Ref. ${v.referencia}` : ""}
                      </p>
                    </div>
                    {v.preco != null ? (
                      <span className="font-display font-semibold">
                        {fmtPreco.format(Number(v.preco))}
                      </span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover voo"
                      onClick={async () => {
                        await supabase.from("voos").delete().eq("id", v.id);
                        await invalidar();
                        toast.success("Voo removido.");
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="documentos" className="mt-5 space-y-4">
            <DocumentosPainel
              viagemId={viagemId}
              documentos={documentos ?? []}
              onDone={invalidar}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function NovoVooDialog({ viagemId, onDone }: { viagemId: string; onDone: () => Promise<void> }) {
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

  const guardar = useMutation({
    mutationFn: async () => {
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
    },
    onSuccess: async () => {
      await onDone();
      toast.success("Voo adicionado.");
      setAberto(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao adicionar voo."),
  });

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
              onChange={(e) => setF({ ...f, origem: e.target.value.toUpperCase() })}
              className="mt-1.5 uppercase"
            />
          </div>
          <div>
            <Label htmlFor="destino">Destino</Label>
            <Input
              id="destino"
              value={f.destino}
              onChange={(e) => setF({ ...f, destino: e.target.value.toUpperCase() })}
              className="mt-1.5 uppercase"
            />
          </div>
          <div>
            <Label htmlFor="companhia">Companhia</Label>
            <Input
              id="companhia"
              value={f.companhia}
              onChange={(e) => setF({ ...f, companhia: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="numero">Número do voo</Label>
            <Input
              id="numero"
              value={f.numero_voo}
              onChange={(e) => setF({ ...f, numero_voo: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="partida">Partida</Label>
            <Input
              id="partida"
              type="datetime-local"
              value={f.partida}
              onChange={(e) => setF({ ...f, partida: e.target.value })}
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
              onChange={(e) => setF({ ...f, preco: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ref">Referência da reserva</Label>
            <Input
              id="ref"
              value={f.referencia}
              onChange={(e) => setF({ ...f, referencia: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => guardar.mutate()}
            disabled={!f.origem || !f.destino || guardar.isPending}
          >
            Guardar voo
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
  const [aEnviar, setAEnviar] = useState(false);

  async function enviarFicheiro(file: File) {
    setAEnviar(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const path = `${uid}/${viagemId}/${Date.now()}-${file.name}`;
      const { error: erroUpload } = await supabase.storage
        .from("documentos")
        .upload(path, file);
      if (erroUpload) throw erroUpload;

      const { error } = await supabase.from("documentos").insert({
        viagem_id: viagemId,
        nome: file.name,
        tipo: file.type.includes("pdf") ? "pdf" : "ficheiro",
        origem: "upload",
        ficheiro_path: path,
      });
      if (error) throw error;
      await onDone();
      toast.success("Documento carregado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível carregar o documento.");
    } finally {
      setAEnviar(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function abrir(doc: Documento) {
    if (!doc.ficheiro_path) return;
    const { data, error } = await supabase.storage
      .from("documentos")
      .createSignedUrl(doc.ficheiro_path, 60);
    if (error || !data) {
      toast.error("Não foi possível abrir o documento.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remover(doc: Documento) {
    if (doc.ficheiro_path) {
      await supabase.storage.from("documentos").remove([doc.ficheiro_path]);
    }
    await supabase.from("documentos").delete().eq("id", doc.id);
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
            if (file) void enviarFicheiro(file);
          }}
        />
        <Button size="sm" disabled={aEnviar} onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Carregar PDF
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
                <p className="font-medium">{d.nome}</p>
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
                <Button variant="ghost" size="icon" aria-label="Abrir" onClick={() => void abrir(d)}>
                  <Download className="size-4" />
                </Button>
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
    </div>
  );
}

function QrDialog({ viagemId, onDone }: { viagemId: string; onDone: () => Promise<void> }) {
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
          <QrCode className="size-4" /> Guardar QR
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
          <Button onClick={() => void guardar()} disabled={!conteudo}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmailDialog({ viagemId, onDone }: { viagemId: string; onDone: () => Promise<void> }) {
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
          <Mail className="size-4" /> Registar email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Documento recebido por email</DialogTitle>
          <DialogDescription>
            Registe aqui bilhetes ou confirmações que chegaram por email. A receção automática de
            emails fica pronta a ligar quando configurar o endereço de reencaminhamento.
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
          <Button onClick={() => void guardar()}>Registar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
