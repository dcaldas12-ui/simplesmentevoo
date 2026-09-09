import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarRange,
  ChevronDown,
  Info,
  PlaneTakeoff,
  SearchX,
  Timer,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { GuardarOfertaDialog } from "@/components/GuardarOfertaDialog";
import { ReservarParceiroDialog } from "@/components/ReservarParceiroDialog";
import { SearchForm } from "@/components/SearchForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Oferta } from "@/lib/flight-engine";
import { pesquisarVoos } from "@/lib/flights.functions";

type Busca = {
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
  apenasDiretos: boolean;
  executar: number;
};

export const Route = createFileRoute("/pesquisa")({
  validateSearch: (search: Partial<Record<keyof Busca, unknown>>): Busca => ({
    origem: String(search["origem"] ?? "LIS").toUpperCase(),
    destino: String(search["destino"] ?? "BCN").toUpperCase(),
    dataPartida: String(search["dataPartida"] ?? ""),
    dataRegresso: String(search["dataRegresso"] ?? ""),
    idaAntes: Number(search["idaAntes"] ?? 2) || 0,
    idaDepois: Number(search["idaDepois"] ?? 2) || 0,
    regressoAntes: Number(search["regressoAntes"] ?? 2) || 0,
    regressoDepois: Number(search["regressoDepois"] ?? 2) || 0,
    duracaoMaxima: Number(search["duracaoMaxima"] ?? 0) || 0,
    passageiros: Number(search["passageiros"] ?? 1) || 1,
    apenasDiretos: search["apenasDiretos"] === true || search["apenasDiretos"] === "true",
    executar: Number(search["executar"] ?? 0) || 0,
  }),
  head: () => ({
    meta: [
      { title: "Pesquisa de voos com datas flexíveis — Simplesmente voo" },
      {
        name: "description",
        content:
          "Veja todas as combinações de datas dentro da sua flexibilidade, ordenadas do preço mais baixo para o mais alto.",
      },
      { property: "og:title", content: "Pesquisa de voos com datas flexíveis" },
      {
        property: "og:description",
        content: "Compare preços por combinação de datas e guarde o voo na sua viagem.",
      },
    ],
  }),
  component: PesquisaPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <p role="alert" className="mx-auto max-w-6xl px-4 py-16 text-sm text-destructive">
        {error.message}
      </p>
    </AppShell>
  ),
});

const fmtPreco = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

function formatarData(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function duracao(min: number) {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

function PesquisaPage() {
  const busca = Route.useSearch();
  const procurar = useServerFn(pesquisarVoos);
  const [flexVisiveis, setFlexVisiveis] = useState(3);

  const { data, isFetching, error } = useQuery({
  queryKey: ["voos-v4", { ...busca, executar: undefined }],
  queryFn: () => procurar({ data: busca }),
  enabled: busca.executar > 0,
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

  const { exatas, flexiveis } = useMemo(() => {
    const todas = data?.ofertas ?? [];
    const regressoPedido = busca.dataRegresso === "" ? null : busca.dataRegresso;
    const exatas = todas.filter(
      (o) => o.dataPartida === busca.dataPartida && (o.dataRegresso ?? null) === regressoPedido,
    );
    const flexiveis = todas.filter((o) => !exatas.includes(o));
    return { exatas: exatas.slice(0, 5), flexiveis };
  }, [data, busca.dataPartida, busca.dataRegresso]);

  const melhorExata = exatas[0]?.precoTotal ?? null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {busca.origem} → {busca.destino}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ida −{busca.idaAntes}/+{busca.idaDepois} dias
            {busca.dataRegresso
              ? ` · Regresso −${busca.regressoAntes}/+${busca.regressoDepois} dias`
              : ""}
            {busca.duracaoMaxima > 0 ? ` · até ${busca.duracaoMaxima} dias de viagem` : ""} ·{" "}
            {busca.passageiros}{" "}
            {busca.passageiros === 1 ? "passageiro" : "passageiros"}
          </p>
        </div>

        <SearchForm
  initial={{
    ...busca,
  }}
  compacto
/>
        {data ? <EstadoLigacao dados={data} /> : null}


        {isFetching ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={SearchX}
            titulo="Não foi possível pesquisar"
            descricao={error instanceof Error ? error.message : "Tente novamente."}
          />
        ) : !data || data.ofertas.length === 0 ? (
          <EmptyState
            icon={SearchX}
            titulo="Sem resultados para estas datas"
            descricao="Experimente aumentar a flexibilidade de dias ou escolher outro aeroporto."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Resumo etiqueta="Preço mais baixo" valor={fmtPreco.format(data.precoMinimo ?? 0)} />
              <Resumo
                etiqueta="Preço mediano"
                valor={fmtPreco.format(data.precoMediano ?? 0)}
              />
              <Resumo
                etiqueta="Combinações analisadas"
                valor={`${data.combinacoesConsultadas} de ${data.combinacoesGeradas}`}
              />
            </div>

            <section className="space-y-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Nas datas que pediu</h2>
                <p className="text-sm text-muted-foreground">
                  As 5 opções mais baratas para {formatarData(busca.dataPartida)}
                  {busca.dataRegresso ? ` · regresso ${formatarData(busca.dataRegresso)}` : ""}.
                </p>
              </div>

              {exatas.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Não encontrámos voos exactamente nestas datas. Veja as alternativas em baixo.
                </div>
              ) : (
                <ul className="space-y-3">
                  {exatas.map((oferta, i) => (
                    <li key={oferta.id}>
                      <CartaoOferta oferta={oferta} melhor={i === 0} passageiros={busca.passageiros} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {flexiveis.length > 0 ? (
              <section className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                    <CalendarRange className="size-5" /> Datas flexíveis: opções mais baratas
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Alternativas dentro das margens indicadas, ordenadas pelo preço.
                  </p>
                </div>

                <ul className="space-y-3">
                  {flexiveis.slice(0, flexVisiveis).map((oferta) => (
                    <li key={oferta.id}>
                      <CartaoOferta
                        oferta={oferta}
                        melhor={false}
                        passageiros={busca.passageiros}
                        pedido={{
                          partida: busca.dataPartida,
                          regresso: busca.dataRegresso === "" ? null : busca.dataRegresso,
                        }}
                        {...(melhorExata !== null ? { referencia: melhorExata } : {})}
                      />
                    </li>
                  ))}
                </ul>

                {flexVisiveis < flexiveis.length ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setFlexVisiveis((n) => n + 5)}
                    >
                      <ChevronDown className="size-4" /> Ver mais opções
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={() => setFlexVisiveis(flexiveis.length)}
                    >
                      Ver todos os preços ({flexiveis.length})
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={() => setFlexVisiveis(3)}
                  >
                    Mostrar menos
                  </Button>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Resumo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 font-display text-xl font-semibold">{valor}</p>
    </div>
  );
}

function CartaoOferta({
  oferta,
  melhor,
  pedido,
  referencia,
  passageiros,
}: {
  oferta: Oferta;
  melhor: boolean;
  pedido?: { partida: string; regresso: string | null };
  referencia?: number;
  passageiros: number;
}) {
  const ofertaComRegresso = oferta as Oferta & {
  horaPartidaRegresso?: string;
  horaChegadaRegresso?: string;
  duracaoMinRegresso?: number;
  escalasRegresso?: number;
};
  const partidaMudou = pedido ? oferta.dataPartida !== pedido.partida : false;
  const regressoMudou = pedido
    ? (oferta.dataRegresso ?? null) !== (pedido.regresso ?? null)
    : false;
  const poupanca =
    referencia !== undefined ? Math.round((referencia - oferta.precoTotal) * 100) / 100 : 0;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display font-semibold">{oferta.companhia}</span>
          <Badge variant="secondary">{oferta.numeroVoo}</Badge>
          {melhor ? <Badge>Melhor preço</Badge> : null}
          {poupanca > 0 ? <Badge>Poupa {fmtPreco.format(poupanca)}</Badge> : null}
          {oferta.escalas === 0 ? <Badge variant="outline">Direto</Badge> : null}
          {oferta.bagagemIncluida ? <Badge variant="outline">Bagagem incluída</Badge> : null}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span
            className={`inline-flex items-center gap-1.5 ${partidaMudou ? "font-medium text-primary" : "text-foreground"}`}
          >
            <PlaneTakeoff className="size-4" />
            {formatarData(oferta.dataPartida)} · {oferta.horaPartida} → {oferta.horaChegada}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="size-4" /> {duracao(oferta.duracaoMin)}
          </span>
          {oferta.dataRegresso ? (
  <span
    className={
      regressoMudou
        ? "font-medium text-primary"
        : "text-foreground"
    }
  >
    Regresso: {formatarData(oferta.dataRegresso)} ·{" "}
    {ofertaComRegresso.horaPartidaRegresso} →{" "}
    {ofertaComRegresso.horaChegadaRegresso}
  </span>
) : null}
{oferta.dataRegresso &&
ofertaComRegresso.duracaoMinRegresso !== undefined ? (
  <span className="inline-flex items-center gap-1.5">
    <Timer className="size-4" />{" "}
    {duracao(ofertaComRegresso.duracaoMinRegresso)}
  </span>
) : null}
        </p>
        {partidaMudou || regressoMudou ? (
          <p className="mt-1 text-xs text-primary">
            Datas alteradas face ao que pediu
            {pedido
              ? ` (${formatarData(pedido.partida)}${pedido.regresso ? ` → ${formatarData(pedido.regresso)}` : ""})`
              : ""}
          </p>
        ) : null}
      </div>


      <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end">
        <div className="text-right">
          {oferta.precoIndisponivel ? (
            <p className="font-display text-base font-semibold text-muted-foreground">
              Preço indisponível
            </p>
          ) : (
            <>
              <p className="font-display text-xl font-semibold">
                {fmtPreco.format(oferta.precoTotal)}
                <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                  Preço total da viagem
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {passageiros} passageiro{passageiros === 1 ? "" : "s"}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ReservarParceiroDialog oferta={oferta} />
          <GuardarOfertaDialog oferta={oferta} />
        </div>
      </div>
    </div>
  );
}

function EstadoLigacao({
  dados,
}: {
  dados: {
    estadoFornecedor: string;
    fornecedor: string;
    emFalta?: string[] | undefined;
    aviso?: string | undefined;
  };
}) {
  const ativo = dados.estadoFornecedor === "ativo";
  const titulo = ativo
    ? `Preços em direto via ${dados.fornecedor}`
    : dados.estadoFornecedor === "limite"
      ? "Limite de pedidos do fornecedor atingido"
      : dados.estadoFornecedor === "erro"
        ? "O fornecedor de voos não respondeu"
        : "Ligação ao  por ativar";

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${
        ativo
          ? "border-primary/30 bg-primary/5 text-foreground"
          : "border-border bg-secondary/60 text-secondary-foreground"
      }`}
    >
      <Info className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">{titulo}</p>
        {dados.aviso ? <p>{dados.aviso}</p> : null}
        {!ativo && dados.emFalta && dados.emFalta.length > 0 ? (
          <p className="text-xs">
            Para ativar preços reais e reserváveis é preciso um acesso aprovado ao  e
            guardar a chave {dados.emFalta.join(", ")} nas definições da app. Enquanto isso não
            acontecer, mostramos apenas resultados simulados.
          </p>
        ) : null}
      </div>
    </div>
  );
}

