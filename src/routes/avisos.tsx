import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BellRing,
  Clock,
  FileText,
  Loader2,
  Pencil,
  Play,
  Save,
  Smartphone,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PushCard } from "@/components/PushCard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/lib/auth";
import {
  ANTECIPACOES,
  contagem,
  eventosSugeridos,
  formatarMomento,
  momentoDoLembrete,
  rotuloTipo,
  type EventoAviso,
} from "@/lib/avisos";
import { guardarAviso } from "@/lib/avisos.functions";
import { documentosDemo } from "@/lib/documentos-demo";

export const Route = createFileRoute("/avisos")({
  head: () => ({
    meta: [
      { title: "Próximos avisos da viagem — Simplesmente voo" },
      {
        name: "description",
        content:
          "Centro de avisos com check-in do voo, saída para o aeroporto, embarque, recolha do transfer e check-in do hotel, por ordem cronológica e com antecipação à sua escolha.",
      },
      { property: "og:title", content: "Próximos avisos da viagem — Simplesmente voo" },
      {
        property: "og:description",
        content:
          "Lembretes criados a partir dos documentos da viagem, com antecipação configurável e detalhes editáveis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaginaAvisos,
});

function para16(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function PaginaAvisos() {
  const { session } = useSession();
  const docs = useMemo(() => documentosDemo(), []);
  const [eventos, setEventos] = useState<EventoAviso[]>(() => eventosSugeridos(docs));
  const [aEditar, setAEditar] = useState<EventoAviso | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const guardar = useServerFn(guardarAviso);

  const ordenados = [...eventos].sort((a, b) => a.quando.localeCompare(b.quando));
  const ativos = ordenados.filter((e) => e.ativo);

  function atualizar(id: string, muda: (e: EventoAviso) => EventoAviso) {
    setEventos((atuais) => atuais.map((e) => (e.id === id ? muda(e) : e)));
  }

  function simular(evento: EventoAviso) {
    toast(evento.titulo, {
      description: `${formatarMomento(evento.quando)}${evento.local ? ` · ${evento.local}` : ""} — aviso de demonstração dentro da app.`,
      icon: <BellRing className="size-4" />,
    });
  }

  async function guardarNaConta() {
    setAGuardar(true);
    try {
      for (const e of ativos) {
        await guardar({
          data: {
            tipo: e.tipo,
            titulo: e.titulo,
            local: e.local,
            quando: e.quando,
            antecipacaoMin: e.antecipacaoMin,
            ativo: e.ativo,
            origem: e.documentoNome,
          },
        });
      }
      toast.success("Avisos guardados na sua conta.");
    } catch {
      toast.error("Não foi possível guardar os avisos. Tente novamente.");
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          Modo demonstração · avisos dentro da app
        </span>

        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">Próximos avisos</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Os avisos são criados a partir das datas e horas lidas nos seus documentos: check-in do
          voo, saída para o aeroporto, embarque, recolha do transfer e check-in ou check-out do
          hotel. Pode ligar ou desligar cada um, escolher a antecipação e corrigir os detalhes.
        </p>

        <div className="mt-6">
          <PushCard />
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-secondary/50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
            Estes avisos aparecem sempre dentro da app. Com as notificações ativadas acima, também
            chegam ao telemóvel — o ecrã bloqueado depende das permissões do sistema.
          </p>
          {session ? (
            <Button onClick={() => void guardarNaConta()} disabled={aGuardar || ativos.length === 0}>
              {aGuardar ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Guardar na minha conta
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/auth">Entrar para guardar</Link>
            </Button>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {ordenados.length === 0 ? (
            <EmptyState
              icon={BellRing}
              titulo="Sem avisos por agora"
              descricao="Adicione documentos com data e hora à viagem para criarmos os avisos automaticamente."
            >
              <Button asChild>
                <Link to="/documentos-demo">Abrir documentos</Link>
              </Button>
            </EmptyState>
          ) : (
            ordenados.map((e) => (
              <article
                key={e.id}
                className={`rounded-2xl border p-4 ${e.ativo ? "border-border bg-card" : "border-dashed border-border bg-card/50"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{e.titulo}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatarMomento(e.quando)} · {contagem(e.quando)}
                      {e.local ? ` · ${e.local}` : ""}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="size-3.5" /> {e.documentoNome}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" /> Lembrete a {formatarMomento(momentoDoLembrete(e))}
                    </p>
                    <span className="mt-2 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                      {rotuloTipo[e.tipo]}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={String(e.antecipacaoMin)}
                      onValueChange={(v) =>
                        atualizar(e.id, (x) => ({ ...x, antecipacaoMin: Number(v) }))
                      }
                    >
                      <SelectTrigger className="w-[150px]" aria-label="Antecipação do aviso">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANTECIPACOES.map((a) => (
                          <SelectItem key={a.valor} value={String(a.valor)}>
                            {a.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={e.ativo}
                      onCheckedChange={(v) => atualizar(e.id, (x) => ({ ...x, ativo: v }))}
                      aria-label={`Ativar aviso ${e.titulo}`}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setAEditar(e)}>
                    <Pencil className="size-4" /> Editar detalhes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => simular(e)}>
                    <Play className="size-4" /> Ver como aparece
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <Dialog open={aEditar !== null} onOpenChange={(v) => (v ? null : setAEditar(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Editar aviso</DialogTitle>
            <DialogDescription>
              Corrija o que a leitura automática não acertou. A hora do lembrete é recalculada.
            </DialogDescription>
          </DialogHeader>

          {aEditar ? (
            <div className="grid gap-3">
              <div>
                <Label htmlFor="aviso-titulo">Título</Label>
                <Input
                  id="aviso-titulo"
                  className="mt-1"
                  value={aEditar.titulo}
                  onChange={(ev) => setAEditar({ ...aEditar, titulo: ev.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="aviso-local">Local</Label>
                <Input
                  id="aviso-local"
                  className="mt-1"
                  value={aEditar.local}
                  onChange={(ev) => setAEditar({ ...aEditar, local: ev.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="aviso-quando">Data e hora do evento</Label>
                <Input
                  id="aviso-quando"
                  type="datetime-local"
                  className="mt-1"
                  value={para16(aEditar.quando)}
                  onChange={(ev) =>
                    setAEditar({
                      ...aEditar,
                      quando: new Date(ev.target.value).toISOString(),
                    })
                  }
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAEditar(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!aEditar) return;
                atualizar(aEditar.id, () => aEditar);
                setAEditar(null);
                toast.success("Aviso atualizado.");
              }}
            >
              Guardar aviso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
