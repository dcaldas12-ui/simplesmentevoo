import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Loader2, Send, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth";
import {
  anularSubscricao,
  dadosDaSubscricao,
  pedirPermissaoESubscrever,
  subscricaoAtual,
  verificarSuporte,
  type SuportePush,
} from "@/lib/push-client";
import {
  enviarPushTeste,
  estadoPush,
  guardarSubscricao,
  removerSubscricao,
  type EstadoPush,
} from "@/lib/push.functions";

const MENSAGENS_SUPORTE: Record<SuportePush, string> = {
  suportado: "",
  "sem-service-worker": "Este navegador não permite avisos em segundo plano.",
  "sem-push": "Este navegador não suporta notificações push.",
  "sem-notificacoes": "Este navegador não suporta notificações.",
  "ios-precisa-instalar":
    "No iPhone, as notificações só funcionam depois de adicionar a app ao ecrã principal (Partilhar → Adicionar ao ecrã principal) e abrir a partir do ícone.",
};

export function PushCard() {
  const { session } = useSession();
  const obterEstado = useServerFn(estadoPush);
  const guardar = useServerFn(guardarSubscricao);
  const remover = useServerFn(removerSubscricao);
  const testar = useServerFn(enviarPushTeste);

  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [suporte, setSuporte] = useState<SuportePush>("sem-service-worker");
  const [ativo, setAtivo] = useState(false);
  const [permissao, setPermissao] = useState<NotificationPermission | "indisponivel">("indisponivel");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setSuporte(verificarSuporte());
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissao(Notification.permission);
    }
    void obterEstado().then(setEstado).catch(() => setEstado(null));
    void subscricaoAtual().then((s) => setAtivo(Boolean(s)));
  }, [obterEstado]);

  const podeAtivar = suporte === "suportado" && Boolean(estado?.configurado) && Boolean(session);

  async function ativar() {
    if (!estado?.chavePublica) return;
    setOcupado(true);
    try {
      const { permissao: p, subscricao } = await pedirPermissaoESubscrever(estado.chavePublica);
      setPermissao(p);
      if (!subscricao) {
        toast.error("Permissão recusada", {
          description: "Pode voltar a permitir nas definições de notificações do navegador.",
        });
        return;
      }
      await guardar({ data: dadosDaSubscricao(subscricao) });
      setAtivo(true);
      toast.success("Notificações ativadas neste dispositivo");
    } catch (erro) {
      toast.error("Não foi possível ativar", {
        description: erro instanceof Error ? erro.message : "Tente novamente.",
      });
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    try {
      const endpoint = await anularSubscricao();
      if (endpoint) await remover({ data: { endpoint } });
      setAtivo(false);
      toast.success("Notificações desativadas neste dispositivo");
    } catch (erro) {
      toast.error("Não foi possível desativar", {
        description: erro instanceof Error ? erro.message : "Tente novamente.",
      });
    } finally {
      setOcupado(false);
    }
  }

  async function enviarTeste() {
    setOcupado(true);
    try {
      const r = await testar();
      if (!r.configurado) toast.error("Servidor de notificações por configurar");
      else if (r.enviadas > 0) toast.success(`Enviada para ${r.enviadas} dispositivo(s)`);
      else toast.error("Nenhum dispositivo recebeu a notificação", {
        description: "Ative primeiro as notificações neste telemóvel.",
      });
    } catch (erro) {
      toast.error("Falha no envio", {
        description: erro instanceof Error ? erro.message : "Tente novamente.",
      });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="push-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <Bell className="size-5 text-primary" aria-hidden />
          </div>
          <div>
            <h2 id="push-titulo" className="font-display text-lg font-semibold">
              Notificações no telemóvel
            </h2>
            <p className="text-sm text-muted-foreground">
              Receba os avisos da viagem e mudanças de reserva mesmo com a app fechada.
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {ativo ? "Ativas neste dispositivo" : "Desativadas"}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        {suporte !== "suportado" && <p>{MENSAGENS_SUPORTE[suporte]}</p>}
        {estado && !estado.configurado && (
          <p>
            O envio pelo servidor ainda não está configurado. Falta definir:{" "}
            {estado.emFalta.join(", ")}.
          </p>
        )}
        {!session && <p>Entre na sua conta para associar as notificações ao seu perfil.</p>}
        {permissao === "denied" && (
          <p>
            As notificações estão bloqueadas para este site. Autorize-as nas definições do navegador e
            volte a tentar.
          </p>
        )}
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Cada dispositivo é registado na sua conta e pode ser desligado a qualquer momento.
        </p>
        <p className="flex items-start gap-2">
          <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          No Android funciona no navegador; no iPhone é preciso instalar a app no ecrã principal. Avisos
          no ecrã bloqueado dependem sempre das permissões do sistema.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {ativo ? (
          <Button variant="outline" className="min-h-11" onClick={desativar} disabled={ocupado}>
            {ocupado ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <BellOff className="mr-2 size-4" aria-hidden />
            )}
            Desativar neste dispositivo
          </Button>
        ) : (
          <Button className="min-h-11" onClick={ativar} disabled={!podeAtivar || ocupado}>
            {ocupado ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <Bell className="mr-2 size-4" aria-hidden />
            )}
            Ativar notificações
          </Button>
        )}
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={enviarTeste}
          disabled={!ativo || ocupado || !session}
        >
          <Send className="mr-2 size-4" aria-hidden /> Enviar teste
        </Button>
      </div>
    </section>
  );
}
