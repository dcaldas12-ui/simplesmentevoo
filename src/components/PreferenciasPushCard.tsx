import { useServerFn } from "@tanstack/react-start";
import { Moon, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  guardarPreferenciasPush,
  lerPreferenciasPush,
  type PreferenciasPush,
} from "@/lib/push.functions";

const PADRAO: PreferenciasPush = {
  horas_tranquilas_ativas: false,
  hora_silencio_inicio: 22,
  hora_silencio_fim: 8,
  cat_reserva: true,
  cat_cancelamento: true,
  cat_alteracao: true,
  cat_lembrete: true,
  intervalo_minimo_min: 0,
  fuso_horario: "Europe/Lisbon",
  ultima_notificacao: null,
};

const HORAS = Array.from({ length: 24 }, (_, i) => i);

const FREQUENCIAS = [
  { valor: 0, rotulo: "Sem limite" },
  { valor: 30, rotulo: "No máximo 1 cada 30 minutos" },
  { valor: 60, rotulo: "No máximo 1 por hora" },
  { valor: 180, rotulo: "No máximo 1 cada 3 horas" },
  { valor: 720, rotulo: "No máximo 2 por dia" },
];

const CATEGORIAS: Array<{ chave: keyof PreferenciasPush; rotulo: string; ajuda: string }> = [
  { chave: "cat_reserva", rotulo: "Reservas", ajuda: "Confirmações e reservas registadas." },
  { chave: "cat_cancelamento", rotulo: "Cancelamentos", ajuda: "Quando uma reserva é cancelada." },
  { chave: "cat_alteracao", rotulo: "Alterações", ajuda: "Mudanças de hora, porta ou voo." },
  { chave: "cat_lembrete", rotulo: "Lembretes", ajuda: "Check-in, saída para o aeroporto, hotel." },
];

export function PreferenciasPushCard() {
  const { session } = useSession();
  const ler = useServerFn(lerPreferenciasPush);
  const guardar = useServerFn(guardarPreferenciasPush);
  const [prefs, setPrefs] = useState<PreferenciasPush>(PADRAO);
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    if (!session) return;
    void ler()
      .then((p) => setPrefs(p))
      .catch(() => undefined);
  }, [session, ler]);

  function muda<K extends keyof PreferenciasPush>(chave: K, valor: PreferenciasPush[K]) {
    setPrefs((p) => ({ ...p, [chave]: valor }));
  }

  async function submeter() {
    setAGuardar(true);
    try {
      const { ultima_notificacao: _ignorar, ...dados } = prefs;
      await guardar({ data: dados });
      toast.success("Preferências guardadas.");
    } catch {
      toast.error("Não foi possível guardar as preferências.");
    } finally {
      setAGuardar(false);
    }
  }

  if (!session) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-5">
        <h2 className="font-display text-lg font-semibold">Preferências de notificações</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Entre na sua conta para escolher horas tranquilas, tipos de aviso e frequência. As
          preferências ficam guardadas na sua conta e aplicam-se a todos os seus dispositivos.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="prefs-push">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <SlidersHorizontal className="size-5 text-primary" aria-hidden />
        </div>
        <div>
          <h2 id="prefs-push" className="font-display text-lg font-semibold">
            Preferências de notificações
          </h2>
          <p className="text-sm text-muted-foreground">
            Escolha quando e sobre o que quer ser avisado. Estas regras são aplicadas antes de
            qualquer notificação sair do servidor.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Tipos de aviso</legend>
          {CATEGORIAS.map((c) => (
            <div key={c.chave} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm">{c.rotulo}</p>
                <p className="text-xs text-muted-foreground">{c.ajuda}</p>
              </div>
              <Switch
                checked={Boolean(prefs[c.chave])}
                onCheckedChange={(v) => muda(c.chave, v as never)}
                aria-label={`Receber avisos de ${c.rotulo.toLowerCase()}`}
              />
            </div>
          ))}
        </fieldset>

        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-2">
              <Moon className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm font-medium">Horas tranquilas</p>
                <p className="text-xs text-muted-foreground">
                  Não enviamos avisos neste intervalo (exceto o envio de teste).
                </p>
              </div>
            </div>
            <Switch
              checked={prefs.horas_tranquilas_ativas}
              onCheckedChange={(v) => muda("horas_tranquilas_ativas", v)}
              aria-label="Ativar horas tranquilas"
            />
          </div>

          {prefs.horas_tranquilas_ativas ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="silencio-inicio">A partir das</Label>
                <Select
                  value={String(prefs.hora_silencio_inicio)}
                  onValueChange={(v) => muda("hora_silencio_inicio", Number(v))}
                >
                  <SelectTrigger id="silencio-inicio" className="mt-1 min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HORAS.map((h) => (
                      <SelectItem key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="silencio-fim">Até às</Label>
                <Select
                  value={String(prefs.hora_silencio_fim)}
                  onValueChange={(v) => muda("hora_silencio_fim", Number(v))}
                >
                  <SelectTrigger id="silencio-fim" className="mt-1 min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HORAS.map((h) => (
                      <SelectItem key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor="frequencia">Frequência máxima</Label>
          <Select
            value={String(prefs.intervalo_minimo_min)}
            onValueChange={(v) => muda("intervalo_minimo_min", Number(v))}
          >
            <SelectTrigger id="frequencia" className="mt-1 min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIAS.map((f) => (
                <SelectItem key={f.valor} value={String(f.valor)}>
                  {f.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button className="mt-5 min-h-11 w-full sm:w-auto" onClick={() => void submeter()} disabled={aGuardar}>
        {aGuardar ? "A guardar…" : "Guardar preferências"}
      </Button>
    </section>
  );
}
