import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookmarkPlus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import type { Oferta } from "@/lib/flight-engine";

export function GuardarOfertaDialog({ oferta }: { oferta: Oferta }) {
  const { session } = useSession();
  const [aberto, setAberto] = useState(false);
  const [viagemId, setViagemId] = useState<string>("nova");
  const [titulo, setTitulo] = useState(`Viagem a ${oferta.destino}`);
  const [aguardar, setAguardar] = useState(false);
  const queryClient = useQueryClient();

  const { data: viagens } = useQuery({
    queryKey: ["viagens"],
    enabled: Boolean(session) && aberto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select("id, titulo")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (!session) {
    function prepararEntrada() {
      sessionStorage.setItem(
        "viatorbis_after_auth",
        window.location.pathname + window.location.search,
      );
    }

    return (
      <Button asChild variant="outline" size="sm" onClick={prepararEntrada}>
        <Link to="/auth">Entrar para guardar</Link>
      </Button>
    );
  }

  async function guardar() {
    setAguardar(true);

    try {
      let destinoViagem = viagemId;

      if (destinoViagem === "nova") {
        const { data, error } = await supabase
          .from("viagens")
          .insert({
            titulo: titulo || `Viagem a ${oferta.destino}`,
            destino: oferta.destino,
            data_inicio: oferta.dataPartida,
            data_fim: oferta.dataRegresso,
          })
          .select("id")
          .single();

        if (error) throw error;

        destinoViagem = data.id;
      }

      const { error: erroVoo } = await supabase.from("voos").insert({
        viagem_id: destinoViagem,
        companhia: oferta.companhia,
        numero_voo: oferta.numeroVoo,
        origem: oferta.origem,
        destino: oferta.destino,
        partida: `${oferta.dataPartida}T${oferta.horaPartida}:00Z`,
        chegada: `${oferta.dataPartida}T${oferta.horaChegada}:00Z`,
        preco: oferta.precoTotal,
        moeda: oferta.moeda,
      });

      if (erroVoo) throw erroVoo;

      await queryClient.invalidateQueries({ queryKey: ["viagens"] });

      toast.success("Voo guardado em As minhas Viagens.");
      setAberto(false);
    } catch (err) {
      const mensagem =
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof err.message === "string"
          ? err.message
          : "Não foi possível guardar o voo.";

      toast.error(mensagem);
      console.error("Erro ao guardar voo:", err);
    } finally {
      setAguardar(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <BookmarkPlus className="size-4" />
          Guardar
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar voo numa viagem</DialogTitle>
          <DialogDescription>
            {oferta.origem} → {oferta.destino} · {oferta.companhia}{" "}
            {oferta.numeroVoo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="viagem">Viagem</Label>

            <select
              id="viagem"
              value={viagemId}
              onChange={(e) => setViagemId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="nova">Criar nova viagem</option>

              {(viagens ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.titulo}
                </option>
              ))}
            </select>
          </div>

          {viagemId === "nova" ? (
            <div>
              <Label htmlFor="titulo">Nome da nova viagem</Label>

              <Input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="mt-1.5"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={() => void guardar()} disabled={aguardar}>
            {aguardar ? "A guardar..." : "Guardar voo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}