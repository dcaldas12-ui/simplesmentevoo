import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Ticket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { useSession } from "@/lib/auth";
import type { Oferta } from "@/lib/flight-engine";
import { iniciarReserva } from "@/lib/reservas.functions";

export function ReservarParceiroDialog({ oferta }: { oferta: Oferta }) {
  const { session } = useSession();
  const [aberto, setAberto] = useState(false);
  const [aguardar, setAguardar] = useState(false);
  const registar = useServerFn(iniciarReserva);
  const queryClient = useQueryClient();

  if (!session) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/auth">Entrar para reservar</Link>
      </Button>
    );
  }

  async function avancar() {
    setAguardar(true);
    try {
      await registar({
        data: {
          fornecedor: oferta.fonte === "api" ? "skyscanner" : "demonstracao",
          origem: oferta.origem,
          destino: oferta.destino,
          companhia: oferta.companhia,
          numeroVoo: oferta.numeroVoo,
          dataPartida: oferta.dataPartida,
          dataRegresso: oferta.dataRegresso,
          preco: oferta.precoIndisponivel ? null : oferta.precoTotal,
          moeda: oferta.moeda,
          deeplink: oferta.deeplink ?? null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["reservas"] });
      if (oferta.deeplink) {
        window.open(oferta.deeplink, "_blank", "noopener,noreferrer");
        toast.success("Reserva registada. Continue no site do parceiro.");
      } else {
        toast.success("Reserva registada em “As minhas reservas”.");
      }
      setAberto(false);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registar a reserva.");
    } finally {
      setAguardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Ticket className="size-4" /> Reservar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reservar com o parceiro</DialogTitle>
          <DialogDescription>
            {oferta.origem} → {oferta.destino} · {oferta.companhia} {oferta.numeroVoo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            A reserva e o pagamento são feitos no site do parceiro. Guardamos aqui os detalhes
            desta escolha para, quando voltar, poder importar a confirmação (referência e preço
            final) para a sua viagem.
          </p>
          {oferta.deeplink ? (
            <p className="text-foreground">
              Vamos abrir o site do parceiro num separador novo.
            </p>
          ) : (
            <p className="rounded-lg border border-border bg-secondary/60 p-3 text-secondary-foreground">
              Este resultado é de demonstração e ainda não tem ligação de reserva. A reserva fica
              registada como pendente e poderá acrescentar a confirmação manualmente assim que
              reservar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => void avancar()} disabled={aguardar}>
            {oferta.deeplink ? (
              <>
                Continuar no parceiro <ExternalLink className="size-4" />
              </>
            ) : (
              "Registar reserva pendente"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
