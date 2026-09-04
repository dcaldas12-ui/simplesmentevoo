import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AEROPORTOS } from "@/lib/flight-engine";

export type SearchFormValues = {
  origem: string;
  destino: string;
  dataPartida: string;
  dataRegresso: string;
  flexibilidade: number;
  passageiros: number;
  apenasDiretos: boolean;
};

function daqui(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const valoresIniciais: SearchFormValues = {
  origem: "LIS",
  destino: "BCN",
  dataPartida: daqui(30),
  dataRegresso: daqui(37),
  flexibilidade: 3,
  passageiros: 1,
  apenasDiretos: false,
};

export function SearchForm({
  initial,
  compacto = false,
}: {
  initial?: Partial<SearchFormValues>;
  compacto?: boolean;
}) {
  const navigate = useNavigate();
  const [v, setV] = useState<SearchFormValues>({ ...valoresIniciais, ...initial });

  function set<K extends keyof SearchFormValues>(k: K, value: SearchFormValues[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  function trocar() {
    setV((prev) => ({ ...prev, origem: prev.destino, destino: prev.origem }));
  }

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    void navigate({
      to: "/pesquisa",
      search: {
        origem: v.origem.toUpperCase(),
        destino: v.destino.toUpperCase(),
        dataPartida: v.dataPartida,
        dataRegresso: v.dataRegresso,
        flexibilidade: v.flexibilidade,
        passageiros: v.passageiros,
        apenasDiretos: v.apenasDiretos,
      },
    });
  }

  return (
    <form
      onSubmit={submeter}
      className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${compacto ? "" : "shadow-[var(--shadow-soft)]"}`}
    >
      <datalist id="aeroportos">
        {AEROPORTOS.map((a) => (
          <option key={a.codigo} value={a.codigo}>
            {a.cidade}
          </option>
        ))}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Label htmlFor="origem">Origem</Label>
          <Input
            id="origem"
            list="aeroportos"
            required
            maxLength={3}
            value={v.origem}
            onChange={(e) => set("origem", e.target.value.toUpperCase())}
            placeholder="LIS"
            className="mt-1.5 uppercase"
          />
        </div>

        <div className="relative">
          <Label htmlFor="destino">Destino</Label>
          <Input
            id="destino"
            list="aeroportos"
            required
            maxLength={3}
            value={v.destino}
            onChange={(e) => set("destino", e.target.value.toUpperCase())}
            placeholder="BCN"
            className="mt-1.5 uppercase"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={trocar}
            aria-label="Trocar origem e destino"
            className="absolute -left-5 top-8 hidden size-8 rounded-full sm:flex"
          >
            <ArrowLeftRight className="size-3.5" />
          </Button>
        </div>

        <div>
          <Label htmlFor="partida">Data de partida</Label>
          <Input
            id="partida"
            type="date"
            required
            value={v.dataPartida}
            onChange={(e) => set("dataPartida", e.target.value)}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="regresso">Data de regresso</Label>
          <Input
            id="regresso"
            type="date"
            value={v.dataRegresso}
            onChange={(e) => set("dataRegresso", e.target.value)}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground">Deixe vazio para só ida.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="flex">Flexibilidade: ±{v.flexibilidade} dias</Label>
          <input
            id="flex"
            type="range"
            min={0}
            max={7}
            step={1}
            value={v.flexibilidade}
            onChange={(e) => set("flexibilidade", Number(e.target.value))}
            className="mt-3 w-full accent-[var(--primary)]"
          />
        </div>

        <div>
          <Label htmlFor="pax">Passageiros</Label>
          <Input
            id="pax"
            type="number"
            min={1}
            max={9}
            value={v.passageiros}
            onChange={(e) => set("passageiros", Number(e.target.value))}
            className="mt-1.5"
          />
        </div>

        <div className="flex items-center gap-3 sm:mt-6">
          <Switch
            id="diretos"
            checked={v.apenasDiretos}
            onCheckedChange={(c) => set("apenasDiretos", c)}
          />
          <Label htmlFor="diretos">Apenas voos diretos</Label>
        </div>

        <Button type="submit" size="lg" className="sm:mt-4">
          <Search className="size-4" /> Procurar melhores datas
        </Button>
      </div>
    </form>
  );
}
