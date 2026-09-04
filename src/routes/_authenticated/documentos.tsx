import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Mail,
  Pencil,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { analisarDocumento } from "@/lib/documentos-ia.functions";
import { fichaVazia, type FichaDocumento } from "@/lib/documentos";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({
    meta: [
      { title: "Histórico de documentos — Simplesmente voo" },
      {
        name: "description",
        content:
          "Todos os ficheiros que carregou: nome, tipo, viagem associada, data, dados extraídos e estado do processamento, com pesquisa e gestão.",
      },
      { property: "og:title", content: "Histórico de documentos — Simplesmente voo" },
      {
        property: "og:description",
        content:
          "Pesquise, reveja e volte a processar os documentos de viagem que carregou na sua conta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoricoDocumentos,
  errorComponent: ({ error }) => (
    <AppShell>
      <p role="alert" className="mx-auto max-w-4xl px-4 py-16 text-sm text-destructive">
        {error.message}
      </p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="mx-auto max-w-4xl px-4 py-16 text-sm">Página não encontrada.</p>
    </AppShell>
  ),
});

type Estado = "pendente" | "extracao" | "analise" | "validacao" | "concluido" | "falhou";

const etapas: Array<{ chave: Estado; rotulo: string }> = [
  { chave: "extracao", rotulo: "Extração" },
  { chave: "analise", rotulo: "Análise" },
  { chave: "validacao", rotulo: "Validação" },
  { chave: "concluido", rotulo: "Concluído" },
];

const estadoInfo: Record<Estado, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Pendente", classe: "bg-secondary text-secondary-foreground" },
  extracao: { rotulo: "Extração", classe: "bg-secondary text-secondary-foreground" },
  analise: { rotulo: "Análise IA", classe: "bg-secondary text-secondary-foreground" },
  validacao: { rotulo: "Validação", classe: "bg-secondary text-secondary-foreground" },
  concluido: { rotulo: "Concluído", classe: "bg-primary/10 text-primary" },
  falhou: { rotulo: "Falhou", classe: "bg-destructive/10 text-destructive" },
};

type DocRow = {
  id: string;
  nome: string;
  tipo: string;
  origem: string;
  viagem_id: string | null;
  ficheiro_path: string | null;
  qr_conteudo: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  estado_processamento: string;
  dados_extraidos: unknown;
  resumo: string | null;
  erro_processamento: string | null;
  created_at: string;
};

function estadoDe(d: DocRow): Estado {
  const e = d.estado_processamento as Estado;
  return e in estadoInfo ? e : "pendente";
}

function ficha(d: DocRow): FichaDocumento {
  const o = (d.dados_extraidos ?? {}) as Record<string, unknown>;
  return { ...fichaVazia, ...Object.fromEntries(
    Object.keys(fichaVazia).map((k) => [k, String(o[k] ?? "")]),
  ) } as FichaDocumento;
}

function resumoDe(f: FichaDocumento) {
  return [f.tipoDocumento, f.fornecedor, f.passageiro, f.referencia, f.dataHora]
    .filter(Boolean)
    .join(" · ");
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tamanho(bytes: number | null) {
  if (!bytes) return null;
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function ficheiroParaDataUrl(f: Blob) {
  return new Promise<string | null>((resolve) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => resolve(null);
    leitor.readAsDataURL(f);
  });
}

function HistoricoDocumentos() {
  const queryClient = useQueryClient();
  const analisar = useServerFn(analisarDocumento);
  const inputFicheiro = useRef<HTMLInputElement>(null);

  const [procura, setProcura] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Estado>("todos");
  const [detalhe, setDetalhe] = useState<DocRow | null>(null);
  const [editar, setEditar] = useState<DocRow | null>(null);
  const [etapaAtual, setEtapaAtual] = useState<Estado | null>(null);
  const [nomeAEnviar, setNomeAEnviar] = useState("");
  const [visualizar, setVisualizar] = useState<{
    doc: DocRow;
    url: string | null;
    aCarregar: boolean;
    erro: string | null;
  } | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["historico-documentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocRow[];
    },
  });

  const { data: viagens } = useQuery({
    queryKey: ["viagens-nomes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("viagens").select("id, titulo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tituloViagem = (id: string | null) =>
    id ? (viagens?.find((v) => v.id === id)?.titulo ?? "Viagem") : null;

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["historico-documentos"] });

  const lista = useMemo(() => {
    const q = procura.trim().toLowerCase();
    return (docs ?? []).filter((d) => {
      if (filtro !== "todos" && estadoDe(d) !== filtro) return false;
      if (!q) return true;
      const alvo = [
        d.nome,
        d.tipo,
        d.origem,
        d.resumo ?? "",
        tituloViagem(d.viagem_id) ?? "",
        resumoDe(ficha(d)),
      ]
        .join(" ")
        .toLowerCase();
      return alvo.includes(q);
    });
  }, [docs, procura, filtro, viagens]);

  /** Corre extração → análise → validação → conclusão, com estados reais gravados. */
  async function processar(
    id: string,
    entrada: { nome: string; texto?: string | null; imagem?: string | null },
    comProgresso: boolean,
  ) {
    const marcar = async (estado: Estado, extra: Record<string, unknown> = {}) => {
      if (comProgresso) setEtapaAtual(estado);
      await supabase
        .from("documentos")
        .update({ estado_processamento: estado, updated_at: new Date().toISOString(), ...extra })
        .eq("id", id);
      await invalidar();
    };

    try {
      await marcar("analise");
      const r = await analisar({ data: entrada });

      await marcar("validacao");
      const valores = Object.values(r.ficha).filter((v) => String(v ?? "").trim());
      if (valores.length === 0) {
        throw new Error("A análise não devolveu dados legíveis deste ficheiro.");
      }

      await marcar("concluido", {
        dados_extraidos: r.ficha,
        resumo: resumoDe(r.ficha),
        erro_processamento: null,
        processado_em: new Date().toISOString(),
      });
      toast.success("Documento analisado e guardado.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Não foi possível analisar este documento.";
      await marcar("falhou", { erro_processamento: msg });
      toast.error(`${msg} O ficheiro ficou guardado — pode voltar a processar.`);
    } finally {
      if (comProgresso) setEtapaAtual(null);
    }
  }

  async function enviarFicheiro(file: File) {
    const tipoOk = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!tipoOk) {
      toast.error("Formato não suportado. Escolha um PDF ou uma imagem.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Ficheiro demasiado grande (máximo 20 MB).");
      return;
    }

    setNomeAEnviar(file.name);
    setEtapaAtual("extracao");
    let id: string | null = null;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada. Volte a entrar.");

      const path = `${uid}/historico/${Date.now()}-${file.name}`;
      const { error: erroUpload } = await supabase.storage.from("documentos").upload(path, file);
      if (erroUpload) throw erroUpload;

      const { data: inserido, error } = await supabase
        .from("documentos")
        .insert({
          nome: file.name,
          tipo: file.type.startsWith("image/") ? "imagem" : "pdf",
          origem: "upload",
          ficheiro_path: path,
          mime_type: file.type,
          tamanho_bytes: file.size,
          estado_processamento: "extracao",
        })
        .select("id")
        .single();
      if (error) throw error;
      id = inserido.id;
      await invalidar();

      const imagem = file.type.startsWith("image/") ? await ficheiroParaDataUrl(file) : null;
      await processar(id, { nome: file.name, imagem }, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível carregar o ficheiro.";
      if (id) {
        await supabase
          .from("documentos")
          .update({ estado_processamento: "falhou", erro_processamento: msg })
          .eq("id", id);
        await invalidar();
      }
      toast.error(msg);
    } finally {
      setEtapaAtual(null);
      setNomeAEnviar("");
      if (inputFicheiro.current) inputFicheiro.current.value = "";
    }
  }

  const reprocessar = useMutation({
    mutationFn: async (d: DocRow) => {
      let imagem: string | null = null;
      if (d.ficheiro_path && (d.mime_type ?? "").startsWith("image/")) {
        const { data } = await supabase.storage.from("documentos").download(d.ficheiro_path);
        if (data) imagem = await ficheiroParaDataUrl(data);
      }
      await processar(d.id, { nome: d.nome, texto: d.qr_conteudo, imagem }, false);
    },
  });

  async function verFicheiro(d: DocRow) {
    if (!d.ficheiro_path) {
      setVisualizar({
        doc: d,
        url: null,
        aCarregar: false,
        erro: "Este registo não tem ficheiro guardado para visualizar.",
      });
      return;
    }
    setVisualizar({ doc: d, url: null, aCarregar: true, erro: null });
    const { data, error } = await supabase.storage
      .from("documentos")
      .createSignedUrl(d.ficheiro_path, 300);
    setVisualizar({
      doc: d,
      url: data?.signedUrl ?? null,
      aCarregar: false,
      erro: error || !data ? "Não foi possível abrir este ficheiro." : null,
    });
  }

  async function abrir(d: DocRow) {
    if (!d.ficheiro_path) return;
    const { data, error } = await supabase.storage
      .from("documentos")
      .createSignedUrl(d.ficheiro_path, 60);
    if (error || !data) {
      toast.error("Não foi possível abrir o ficheiro.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function eliminar(d: DocRow) {
    if (!window.confirm(`Eliminar “${d.nome}”? Esta ação não pode ser anulada.`)) return;
    if (d.ficheiro_path) await supabase.storage.from("documentos").remove([d.ficheiro_path]);
    const { error } = await supabase.from("documentos").delete().eq("id", d.id);
    if (error) {
      toast.error("Não foi possível eliminar o ficheiro.");
      return;
    }
    await invalidar();
    toast.success("Ficheiro eliminado da sua conta.");
  }

  const indiceEtapa = etapaAtual ? etapas.findIndex((e) => e.chave === etapaAtual) : -1;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Histórico de documentos
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Todos os ficheiros que carregou nesta conta, com viagem associada, dados extraídos e
          estado do processamento. Só você tem acesso a estes documentos.
        </p>

        <input
          ref={inputFicheiro}
          type="file"
          accept="application/pdf,image/*"
          aria-label="Escolher ficheiro PDF ou imagem para carregar"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void enviarFicheiro(f);
          }}
        />

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Label htmlFor="procura-docs" className="sr-only">
              Pesquisar documentos
            </Label>
            <Input
              id="procura-docs"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Pesquisar por nome, viagem ou dados extraídos"
              className="h-11 pl-9"
            />
          </div>
          <Button
            className="h-11"
            disabled={etapaAtual !== null}
            onClick={() => inputFicheiro.current?.click()}
          >
            <Upload className="size-4" /> Carregar ficheiro
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {(["todos", "pendente", "extracao", "analise", "validacao", "concluido", "falhou"] as const).map(
            (f) => (
              <Button
                key={f}
                size="sm"
                variant={filtro === f ? "default" : "outline"}
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
              >
                {f === "todos" ? "Todos" : estadoInfo[f].rotulo}
              </Button>
            ),
          )}
        </div>

        {etapaAtual ? (
          <div
            className="mt-5 rounded-2xl border border-border bg-card p-4"
            role="status"
            aria-live="polite"
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="size-4 animate-spin" /> A processar {nomeAEnviar || "o ficheiro"}
            </p>
            <Progress
              className="mt-3"
              value={((indiceEtapa + 1) / etapas.length) * 100}
              aria-label="Progresso do processamento"
            />
            <ol className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {etapas.map((e, i) => (
                <li
                  key={e.chave}
                  className={
                    i < indiceEtapa
                      ? "text-muted-foreground"
                      : i === indiceEtapa
                        ? "font-medium text-primary"
                        : "text-muted-foreground/60"
                  }
                >
                  {i + 1}. {e.rotulo}
                  {i === indiceEtapa ? " (a decorrer)" : ""}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          ) : lista.length === 0 ? (
            <EmptyState
              icon={FileText}
              titulo={docs?.length ? "Nada corresponde à pesquisa" : "Ainda não carregou ficheiros"}
              descricao={
                docs?.length
                  ? "Tente outro nome, viagem ou estado."
                  : "Carregue um PDF ou uma imagem: fica guardado na sua conta e é analisado automaticamente."
              }
            >
              <Button onClick={() => inputFicheiro.current?.click()}>
                <Upload className="size-4" /> Carregar ficheiro
              </Button>
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {lista.map((d) => {
                const estado = estadoDe(d);
                const emCurso = estado === "extracao" || estado === "analise" || estado === "validacao";
                const Icone = d.origem === "email" ? Mail : d.tipo === "qr" ? QrCode : FileText;
                return (
                  <li key={d.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                        {emCurso ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : estado === "falhou" ? (
                          <AlertTriangle className="size-5 text-destructive" />
                        ) : (
                          <Icone className="size-5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => void verFicheiro(d)}
                          className="block max-w-full truncate rounded text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
                          aria-label={`Ver o ficheiro original ${d.nome}`}
                        >
                          {d.nome}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {dataCurta(d.created_at)}
                          {tamanho(d.tamanho_bytes) ? ` · ${tamanho(d.tamanho_bytes)}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {estado === "falhou"
                            ? (d.erro_processamento ?? "A análise falhou.")
                            : d.resumo || resumoDe(ficha(d)) || "Sem dados extraídos."}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${estadoInfo[estado].classe}`}
                          >
                            {estado === "concluido" ? (
                              <CheckCircle2 className="mr-1 inline size-3" aria-hidden="true" />
                            ) : null}
                            {estadoInfo[estado].rotulo}
                          </span>
                          <Badge variant="outline">{d.tipo}</Badge>
                          {d.viagem_id ? (
                            <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs">
                              <Link
                                to="/viagens/$viagemId"
                                params={{ viagemId: d.viagem_id }}
                              >
                                {tituloViagem(d.viagem_id)}
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Sem viagem associada</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-3">
                      <Button size="sm" variant="outline" onClick={() => setDetalhe(d)}>
                        Ver detalhes
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditar(d)}>
                        <Pencil className="size-4" /> Editar
                      </Button>
                      {estado === "falhou" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reprocessar.isPending}
                          onClick={() => reprocessar.mutate(d)}
                        >
                          <RefreshCw className="size-4" /> Voltar a processar
                        </Button>
                      ) : null}
                      {d.ficheiro_path ? (
                        <Button size="sm" variant="ghost" onClick={() => void abrir(d)}>
                          <Download className="size-4" /> Abrir
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-destructive"
                        onClick={() => void eliminar(d)}
                      >
                        <Trash2 className="size-4" /> Eliminar
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <DetalheDialog doc={detalhe} onFechar={() => setDetalhe(null)} viagem={tituloViagem} />
      <EditarDialog
        doc={editar}
        onFechar={() => setEditar(null)}
        onGuardado={async () => {
          setEditar(null);
          await invalidar();
        }}
      />
    </AppShell>
  );
}

function DetalheDialog({
  doc,
  onFechar,
  viagem,
}: {
  doc: DocRow | null;
  onFechar: () => void;
  viagem: (id: string | null) => string | null;
}) {
  if (!doc) return null;
  const f = ficha(doc);
  const linhas: Array<[string, string]> = [
    ["Tipo de documento", f.tipoDocumento],
    ["Fornecedor", f.fornecedor],
    ["Passageiro", f.passageiro],
    ["Local", f.local],
    ["Referência", f.referencia],
    ["Data e hora", f.dataHora],
    ["Fim", f.dataHoraFim],
    ["Código / QR", f.codigo],
  ];
  return (
    <Dialog open onOpenChange={(v) => (v ? null : onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{doc.nome}</DialogTitle>
          <DialogDescription>
            {viagem(doc.viagem_id) ?? "Sem viagem associada"} · {dataCurta(doc.created_at)} ·{" "}
            {estadoInfo[estadoDe(doc)].rotulo}
          </DialogDescription>
        </DialogHeader>
        {estadoDe(doc) === "falhou" ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {doc.erro_processamento ?? "A análise falhou."} O ficheiro continua guardado.
          </p>
        ) : null}
        <dl className="grid gap-2 text-sm">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className="text-right font-medium">{valor || "—"}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarDialog({
  doc,
  onFechar,
  onGuardado,
}: {
  doc: DocRow | null;
  onFechar: () => void;
  onGuardado: () => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [dados, setDados] = useState<FichaDocumento>(fichaVazia);
  const [idAtual, setIdAtual] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);

  if (doc && doc.id !== idAtual) {
    setIdAtual(doc.id);
    setNome(doc.nome);
    setDados(ficha(doc));
  }
  if (!doc) return null;

  const campos: Array<[keyof FichaDocumento, string]> = [
    ["tipoDocumento", "Tipo de documento"],
    ["fornecedor", "Fornecedor"],
    ["passageiro", "Passageiro"],
    ["local", "Local"],
    ["referencia", "Referência"],
    ["dataHora", "Data e hora"],
    ["dataHoraFim", "Fim"],
    ["codigo", "Código / QR"],
  ];

  async function guardar() {
    if (!doc) return;
    setAGuardar(true);
    const { error } = await supabase
      .from("documentos")
      .update({
        nome: nome.trim() || doc.nome,
        dados_extraidos: dados,
        resumo: resumoDe(dados),
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    setAGuardar(false);
    if (error) {
      toast.error("Não foi possível guardar as alterações.");
      return;
    }
    toast.success("Dados atualizados.");
    await onGuardado();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Editar documento</DialogTitle>
          <DialogDescription>
            Corrija o nome e os dados extraídos. Nada é preenchido automaticamente ao guardar.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="edit-nome">Nome do ficheiro</Label>
          <Input id="edit-nome" value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {campos.map(([chave, rotulo]) => (
            <div key={chave}>
              <Label htmlFor={`edit-${chave}`}>{rotulo}</Label>
              <Input
                id={`edit-${chave}`}
                value={dados[chave]}
                onChange={(e) => setDados({ ...dados, [chave]: e.target.value })}
                className="mt-1"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={aGuardar}>
            Guardar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
