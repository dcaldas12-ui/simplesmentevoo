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
  idaAntes: number;
  idaDepois: number;
  regressoAntes: number;
  regressoDepois: number;
  duracaoMaxima: number;
  passageiros: number;
  idadesPassageiros?: number[];
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
  idaAntes: 2,
  idaDepois: 2,
  regressoAntes: 2,
  regressoDepois: 2,
  duracaoMaxima: 0,
  passageiros: 1,
  idadesPassageiros: [],
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
  const [tipoViagem, setTipoViagem] = useState<"ida-volta" | "so-ida">(
  initial
    ? initial.dataRegresso
      ? "ida-volta"
      : "so-ida"
    : "ida-volta",
);
  const idadesIniciais = initial?.idadesPassageiros ?? [];

const [composicao, setComposicao] = useState({
  adultos: Math.max(
    1,
    (initial?.passageiros ?? 1) - idadesIniciais.length,
  ),
  adolescentes: idadesIniciais.filter(
    (idade) => idade >= 12 && idade <= 17,
  ),
  criancas: idadesIniciais.filter(
    (idade) => idade >= 2 && idade <= 11,
  ),
  bebes: idadesIniciais.filter(
    (idade) => idade >= 0 && idade <= 1,
  ),
});
  const [passageirosAberto, setPassageirosAberto] = useState(false);
  
  const totalPassageiros =
    composicao.adultos +
    composicao.adolescentes.length +
    composicao.criancas.length +
    composicao.bebes.length;
      const idadesPassageiros = [
    ...composicao.adolescentes,
    ...composicao.criancas,
    ...composicao.bebes,
  ];

  function alterarGrupo(
    grupo: "adultos" | "adolescentes" | "criancas" | "bebes",
    delta: number,
  ) {
    setComposicao((atual) => {
      if (grupo === "adultos") {
        return {
          ...atual,
          adultos: Math.max(
            1,
            Math.min(9 - (totalPassageiros - atual.adultos), atual.adultos + delta),
          ),
        };
      }

      if (delta > 0 && totalPassageiros >= 9) {
        return atual;
      }

      const idades = atual[grupo];

      if (delta > 0) {
        const idadeInicial =
          grupo === "adolescentes"
            ? 14
            : grupo === "criancas"
              ? 7
              : 1;

        return {
          ...atual,
          [grupo]: [...idades, idadeInicial],
        };
      }

      return {
        ...atual,
        [grupo]: idades.slice(0, -1),
      };
    });
  }

  function alterarIdade(
    grupo: "adolescentes" | "criancas" | "bebes",
    indice: number,
    idade: number,
  ) {
    setComposicao((atual) => ({
      ...atual,
      [grupo]: atual[grupo].map((valor, i) =>
        i === indice ? idade : valor,
      ),
    }));
  }

  function set<K extends keyof SearchFormValues>(k: K, value: SearchFormValues[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  function trocar() {
    setV((prev) => ({ ...prev, origem: prev.destino, destino: prev.origem }));
  }

  function submeter(e: React.FormEvent) {
    sessionStorage.setItem(
  "viatorbis-ultima-pesquisa",
  JSON.stringify({
    origem: v.origem.toUpperCase(),
    destino: v.destino.toUpperCase(),
    dataPartida: v.dataPartida,
    dataRegresso: v.dataRegresso,
    idaAntes: v.idaAntes,
    idaDepois: v.idaDepois,
    regressoAntes: v.regressoAntes,
    regressoDepois: v.regressoDepois,
    duracaoMaxima: v.duracaoMaxima,
    passageiros: totalPassageiros,
    idadesPassageiros,
    apenasDiretos: v.apenasDiretos,
  }),
);
    e.preventDefault();
    void navigate({
      to: "/pesquisa",
      search: {
        origem: v.origem.toUpperCase(),
        destino: v.destino.toUpperCase(),
        dataPartida: v.dataPartida,
        dataRegresso: v.dataRegresso,
        idaAntes: v.idaAntes,
        idaDepois: v.idaDepois,
        regressoAntes: v.regressoAntes,
        regressoDepois: v.regressoDepois,
        duracaoMaxima: v.duracaoMaxima,
        passageiros: totalPassageiros,
        idadesPassageiros,
        apenasDiretos: v.apenasDiretos,
        executar: Date.now(),
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

        <div className="mb-4 flex items-center gap-3">
  <span className="text-sm font-medium">Tipo de viagem</span>

  <div className="inline-flex rounded-lg border border-border bg-muted p-1">
    <button
      type="button"
      onClick={() => setTipoViagem("ida-volta")}
      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
        tipoViagem === "ida-volta"
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      Ida e volta
    </button>

    <button
      type="button"
      onClick={() => {
        setTipoViagem("so-ida");
        setV((atual) => ({
          ...atual,
          dataRegresso: "",
        }));
      }}
      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
        tipoViagem === "so-ida"
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      Só ida
    </button>
  </div>
</div>

<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <div>
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

  {tipoViagem === "ida-volta" ? (
    <div>
      <Label htmlFor="regresso">Data de regresso</Label>
      <Input
        id="regresso"
        type="date"
        value={v.dataRegresso}
        onChange={(e) => set("dataRegresso", e.target.value)}
        className="mt-1.5"
      />
    </div>
  ) : null}
</div>
<div className="mt-4 grid gap-4 lg:grid-cols-2">
  <fieldset className="rounded-xl border border-border p-3">
    <legend className="px-1 text-sm font-medium">
      Flexibilidade da ida
    </legend>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label htmlFor="idaAntes">Dias antes</Label>
        <Input
          id="idaAntes"
          type="number"
          min={0}
          max={7}
          value={v.idaAntes}
          onChange={(e) => set("idaAntes", Number(e.target.value))}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="idaDepois">Dias depois</Label>
        <Input
          id="idaDepois"
          type="number"
          min={0}
          max={7}
          value={v.idaDepois}
          onChange={(e) => set("idaDepois", Number(e.target.value))}
          className="mt-1.5"
        />
      </div>
    </div>
  </fieldset>

  {tipoViagem === "ida-volta" ? (
    <fieldset className="rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">
        Flexibilidade do regresso
      </legend>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="regAntes">Dias antes</Label>
          <Input
            id="regAntes"
            type="number"
            min={0}
            max={7}
            value={v.regressoAntes}
            onChange={(e) => set("regressoAntes", Number(e.target.value))}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="regDepois">Dias depois</Label>
          <Input
            id="regDepois"
            type="number"
            min={0}
            max={7}
            value={v.regressoDepois}
            onChange={(e) => set("regressoDepois", Number(e.target.value))}
            className="mt-1.5"
          />
        </div>
      </div>
    </fieldset>
  ) : null}
</div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tipoViagem === "ida-volta" ? (
  <div>
    <Label htmlFor="duracaoMax">Duração máxima (dias)</Label>
    <Input
      id="duracaoMax"
      type="number"
      min={0}
      max={60}
      value={v.duracaoMaxima || ""}
      onChange={(e) => set("duracaoMaxima", Number(e.target.value))}
      placeholder="Sem limite"
      className="mt-1.5"
    />
    <p className="mt-1 text-xs text-muted-foreground">
      Opcional. 0 = sem limite.
    </p>
  </div>
) : null}

        <div className="sm:col-span-2 lg:col-span-2">
  <Label>Passageiros</Label>

  <div className="mt-1.5 rounded-xl border border-border bg-background">
    <button
      type="button"
      onClick={() => setPassageirosAberto((aberto) => !aberto)}
      className="flex w-full items-center justify-between gap-3 p-3 text-left"
      aria-expanded={passageirosAberto}
    >
      <div>
        <p className="text-sm font-medium">
          {composicao.adultos}{" "}
          {composicao.adultos === 1 ? "adulto" : "adultos"}
          {composicao.adolescentes.length > 0
            ? ` · ${composicao.adolescentes.length} ${
                composicao.adolescentes.length === 1
                  ? "adolescente"
                  : "adolescentes"
              }`
            : ""}
          {composicao.criancas.length > 0
            ? ` · ${composicao.criancas.length} ${
                composicao.criancas.length === 1
                  ? "criança"
                  : "crianças"
              }`
            : ""}
          {composicao.bebes.length > 0
            ? ` · ${composicao.bebes.length} ${
                composicao.bebes.length === 1 ? "bebé" : "bebés"
              }`
            : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {totalPassageiros}{" "}
          {totalPassageiros === 1 ? "passageiro" : "passageiros"} no total
        </p>
      </div>

      <span className="text-lg text-muted-foreground">
        {passageirosAberto ? "⌃" : "⌄"}
      </span>
    </button>

    {passageirosAberto ? (
      <div className="border-t border-border p-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Adultos</p>
              <p className="text-xs text-muted-foreground">18 ou mais</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={composicao.adultos <= 1}
                onClick={() => alterarGrupo("adultos", -1)}
              >
                −
              </Button>

              <span className="w-6 text-center text-sm font-medium">
                {composicao.adultos}
              </span>

              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={totalPassageiros >= 9}
                onClick={() => alterarGrupo("adultos", 1)}
              >
                +
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Adolescentes</p>
              <p className="text-xs text-muted-foreground">12–17 anos</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={composicao.adolescentes.length === 0}
                onClick={() => alterarGrupo("adolescentes", -1)}
              >
                −
              </Button>

              <span className="w-6 text-center text-sm font-medium">
                {composicao.adolescentes.length}
              </span>

              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={totalPassageiros >= 9}
                onClick={() => alterarGrupo("adolescentes", 1)}
              >
                +
              </Button>
            </div>
          </div>

          {composicao.adolescentes.map((idade, indice) => (
            <div key={`adolescente-${indice}`} className="ml-4">
              <Label htmlFor={`adolescente-${indice}`}>
                Adolescente {indice + 1} — idade
              </Label>
              <Input
                id={`adolescente-${indice}`}
                type="number"
                min={12}
                max={17}
                value={idade}
                onChange={(e) =>
                  alterarIdade(
                    "adolescentes",
                    indice,
                    Math.min(17, Math.max(12, Number(e.target.value))),
                  )
                }
                className="mt-1.5"
              />
            </div>
          ))}

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Crianças</p>
              <p className="text-xs text-muted-foreground">2–11 anos</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={composicao.criancas.length === 0}
                onClick={() => alterarGrupo("criancas", -1)}
              >
                −
              </Button>

              <span className="w-6 text-center text-sm font-medium">
                {composicao.criancas.length}
              </span>

              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={totalPassageiros >= 9}
                onClick={() => alterarGrupo("criancas", 1)}
              >
                +
              </Button>
            </div>
          </div>

          {composicao.criancas.map((idade, indice) => (
            <div key={`crianca-${indice}`} className="ml-4">
              <Label htmlFor={`crianca-${indice}`}>
                Criança {indice + 1} — idade
              </Label>
              <Input
                id={`crianca-${indice}`}
                type="number"
                min={2}
                max={11}
                value={idade}
                onChange={(e) =>
                  alterarIdade(
                    "criancas",
                    indice,
                    Math.min(11, Math.max(2, Number(e.target.value))),
                  )
                }
                className="mt-1.5"
              />
            </div>
          ))}

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Bebés</p>
              <p className="text-xs text-muted-foreground">0–1 ano</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={composicao.bebes.length === 0}
                onClick={() => alterarGrupo("bebes", -1)}
              >
                −
              </Button>

              <span className="w-6 text-center text-sm font-medium">
                {composicao.bebes.length}
              </span>

              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={totalPassageiros >= 9}
                onClick={() => alterarGrupo("bebes", 1)}
              >
                +
              </Button>
            </div>
          </div>

          {composicao.bebes.map((idade, indice) => (
            <div key={`bebe-${indice}`} className="ml-4">
              <Label htmlFor={`bebe-${indice}`}>
                Bebé {indice + 1} — idade
              </Label>
              <Input
                id={`bebe-${indice}`}
                type="number"
                min={0}
                max={1}
                value={idade}
                onChange={(e) =>
                  alterarIdade(
                    "bebes",
                    indice,
                    Math.min(1, Math.max(0, Number(e.target.value))),
                  )
                }
                className="mt-1.5"
              />
            </div>
          ))}
        </div>
      </div>
    ) : null}
  </div>
</div>

        <div className="flex items-center gap-3 sm:mt-6">
          <Switch
            id="diretos"
            aria-label="Apenas voos diretos"
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
