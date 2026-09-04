import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, ExternalLink, Ticket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { valoresIniciais } from "@/components/SearchForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { enviarAvisoPush } from "@/lib/push.functions";
import { descarregarICS } from "@/lib/wallet";
import {
  cancelarReserva,
  confirmarReserva,
  listarReservas,
  type Reserva,
} from "@/lib/reservas.functions";

export const Route = createFileRoute("/_authenticated/reservas")({
  head: () => ({
    meta: [
      { title: "As minhas reservas de voo — Simplesmente voo" },
      {
        name: "description",
        content:
          "Acompanhe as reservas iniciadas com parceiros e importe a confirmação com referência e preço final.",
      },
      { property: "og:title", content: "As minhas reservas de voo" },
      {
        property: "og:description",
        content: "Reservas pendentes e confirmadas, com importação da confirmação do parceiro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReservasPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <p role="alert" className="mx-auto max-w-4xl px-4 py-16 text-sm text-destructive">
        {error.message}
      </p>
    </AppShell>
  ),
});

const fmtPreco = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

function dataCurta(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ReservasPage() {
  const obter = useServerFn(listarReservas);
  const { data, isLoading, error } = useQuery({
    queryKey: ["reservas"],
    queryFn: () => obter(),
  });

  const pendentes = (data ?? []).filter((r) => r.estado === "iniciada");
  const outras = (data ?? []).filter((r) => r.estado !== "iniciada");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">As minhas reservas</h1>
          <p className="text-sm text-muted-foreground">
            A reserva e o pagamento são feitos no site do parceiro. Aqui guarda o histórico e
            importa a confirmação para a sua viagem.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={Ticket}
            titulo="Não foi possível carregar as reservas"
            descricao={error instanceof Error ? error.message : "Tente novamente dentro de momentos."}
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            icon={Ticket}
            titulo="Ainda não iniciou nenhuma reserva"
            descricao="Pesquise voos, escolha uma opção e use “Reservar” para continuar no parceiro. A reserva fica registada aqui."
          />
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Por confirmar</h2>
              {pendentes.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Não tem reservas à espera de confirmação.
                </p>
              ) : (
                pendentes.map((r) => <CartaoReserva key={r.id} reserva={r} />)
              )}
            </section>

            {outras.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold">Histórico</h2>
                {outras.map((r) => (
                  <CartaoReserva key={r.id} reserva={r} />
                ))}
              </section>
            ) : null}
          </>
        )}

        <Button asChild variant="outline">
          <Link to="/pesquisa" search={{ ...valoresIniciais }}>
            Pesquisar novos voos
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

function CartaoReserva({ reserva }: { reserva: Reserva }) {
  const queryClient = useQueryClient();
  const confirmar = useServerFn(confirmarReserva);
  const avisarPush = useServerFn(enviarAvisoPush);
  const cancelar = useServerFn(cancelarReserva);
  const [referencia, setReferencia] = useState(reserva.referencia ?? "");
  const [preco, setPreco] = useState(reserva.preco != null ? String(reserva.preco) : "");
  const [notas, setNotas] = useState(reserva.notas ?? "");

  const mConfirmar = useMutation({
    mutationFn: () =>
      confirmar({ data: { id: reserva.id, referencia, preco: Number(preco) || 0, notas } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reservas"] });
      toast.success("Confirmação importada.");
      try {
        await avisarPush({
          data: {
            titulo: `Reserva confirmada · ${reserva.origem} → ${reserva.destino}`,
            texto: `Partida a ${dataCurta(reserva.data_partida)}${referencia ? ` · ref. ${referencia}` : ""}`,
            url: "/reservas",
          },
        });
      } catch {
        // Sem notificações ativas neste dispositivo: a confirmação foi guardada na mesma.
      }
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar a confirmação."),
  });

  const mCancelar = useMutation({
    mutationFn: () => cancelar({ data: { id: reserva.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reservas"] });
      toast.success("Reserva marcada como cancelada.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar."),
  });

  const pendente = reserva.estado === "iniciada";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display font-semibold">
          {reserva.origem} → {reserva.destino}
        </span>
        {reserva.companhia ? <Badge variant="secondary">{reserva.companhia}</Badge> : null}
        <Badge variant={pendente ? "outline" : "default"}>
          {pendente
            ? "Por confirmar"
            : reserva.estado === "confirmada"
              ? "Confirmada"
              : "Cancelada"}
        </Badge>
        {reserva.fornecedor === "demonstracao" ? (
          <Badge variant="outline">Resultado de demonstração</Badge>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Ida {dataCurta(reserva.data_partida)}
        {reserva.data_regresso ? ` · regresso ${dataCurta(reserva.data_regresso)}` : ""}
        {reserva.preco != null ? ` · ${fmtPreco.format(Number(reserva.preco))}` : " · preço por confirmar"}
        {reserva.referencia ? ` · ref. ${reserva.referencia}` : ""}
      </p>

      <Button
        size="sm"
        variant="outline"
        className="min-h-11"
        disabled={!reserva.data_partida}
        onClick={() =>
          descarregarICS({
            id: reserva.id,
            titulo: `Voo ${reserva.origem} → ${reserva.destino}`,
            descricao: [reserva.companhia, reserva.referencia].filter(Boolean).join(" · "),
            local: reserva.origem,
            inicio: reserva.data_partida ? `${reserva.data_partida}T08:00:00` : null,
            duracaoMin: 120,
            ...(reserva.referencia ? { referencia: reserva.referencia } : {}),
          })
        }
      >
        <CalendarPlus className="size-4" aria-hidden /> Guardar no calendário
      </Button>

      {reserva.deeplink ? (
        <Button asChild size="sm" variant="outline">
          <a href={reserva.deeplink} target="_blank" rel="noopener noreferrer">
            Abrir no parceiro <ExternalLink className="size-4" />
          </a>
        </Button>
      ) : null}

      {pendente ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
          <p className="text-sm font-medium">Importar confirmação do parceiro</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`ref-${reserva.id}`}>Referência</Label>
              <Input
                id={`ref-${reserva.id}`}
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Ex.: ABC123"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor={`preco-${reserva.id}`}>Preço final (€)</Label>
              <Input
                id={`preco-${reserva.id}`}
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                inputMode="decimal"
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`notas-${reserva.id}`}>Notas</Label>
            <Input
              id={`notas-${reserva.id}`}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Bagagem, lugar, condições…"
              className="mt-1.5"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => mConfirmar.mutate()}
              disabled={mConfirmar.isPending || referencia.trim() === ""}
            >
              Guardar confirmação
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => mCancelar.mutate()}
              disabled={mCancelar.isPending}
            >
              Não reservei
            </Button>
          </div>
        </div>
      ) : reserva.notas ? (
        <p className="text-sm text-muted-foreground">{reserva.notas}</p>
      ) : null}
    </div>
  );
}
