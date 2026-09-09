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
import { useMemo, useState } from "react";

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
  duracaoMinima: number;
  duracaoMaxima: number;
  passageiros: number;
  idadesPassageiros?: number[];
  apenasDiretos: boolean;
  maxEscalas: number | null;
  permitirMudancaAeroporto: boolean;
  executar: number;
};

export const Route = createFileRoute("/pesquisa")({
  validateSearch: (
    search: Partial<Record<keyof Busca, unknown>>,
  ): Busca => ({
    origem: String(search["origem"] ?? "LIS").toUpperCase(),
    destino: String(search["destino"] ?? "BCN").toUpperCase(),
    dataPartida: String(search["dataPartida"] ?? ""),
    dataRegresso: String(search["dataRegresso"] ?? ""),
    idaAntes: Number(search["idaAntes"] ?? 2) || 0,
    idaDepois: Number(search["idaDepois"] ?? 2) || 0,
    regressoAntes: Number(search["regressoAntes"] ?? 2) || 0,
    regressoDepois: Number(search["regressoDepois"] ?? 2) || 0,
    duracaoMinima: Number(search["duracaoMinima"] ?? 0) || 0,
    duracaoMaxima: Number(search["duracaoMaxima"] ?? 0) || 0,
    passageiros: Number(search["passageiros"] ?? 1) || 1,
    idadesPassageiros: Array.isArray(search["idadesPassageiros"])
      ? search["idadesPassageiros"]
          .map((idade) => Number(idade))
          .filter(
            (idade) =>
              Number.isInteger(idade) &&
              idade >= 0 &&
              idade <= 17,
          )
      : [],
    apenasDiretos:
      search["apenasDiretos"] === true ||
      search["apenasDiretos"] === "true",
    maxEscalas:
      search["maxEscalas"] == null ||
      search["maxEscalas"] === ""
        ? null
        : Math.max(
            0,
            Math.min(
              2,
              Math.round(Number(search["maxEscalas"])),
            ),
          ),
    permitirMudancaAeroporto:
      search["permitirMudancaAeroporto"] === true ||
      search["permitirMudancaAeroporto"] === "true",
    executar: Number(search["executar"] ?? 0) || 0,
  }),
  head: () => ({
    meta: [
      {
        title:
          "Pesquisa de voos com datas flexíveis — Simplesmente voo",
      },
      {
        name: "description",
        content:
          "Veja todas as combinações de datas dentro da sua flexibilidade, ordenadas do preço mais baixo para o mais alto.",
      },
      {
        property: "og:title",
        content: "Pesquisa de voos com datas flexíveis",
      },
      {
        property: "og:description",
        content:
          "Compare preços por combinação de datas e guarde o voo na sua viagem.",
      },
    ],
  }),
  component: PesquisaPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <p
        role="alert"
        className="mx-auto max-w-6xl px-4 py-16 text-sm text-destructive"
      >
        {error.message}
      </p>
    </AppShell>
  ),
});

const fmtPreco = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
});

function formatarData(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(
    "pt-PT",
    {
      weekday: "short",
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    },
  );
}

function duracao(min: number) {
  return `${Math.floor(min / 60)}h ${String(
    min % 60,
  ).padStart(2, "0")}m`;
}

function PesquisaPage() {
  const busca = Route.useSearch();
  const procurar = useServerFn(pesquisarVoos);

  const [flexVisiveis, setFlexVisiveis] = useState(5);
  const [exatasVisiveis, setExatasVisiveis] = useState(5);
  const [mostrarTodasDatas, setMostrarTodasDatas] =
  useState(false);

  const [ordemDatas, setOrdemDatas] = useState<
    "preco" | "proximidade" | "opcoes"
  >("preco");

  const [modoExatas, setModoExatas] = useState<
    "preco" | "companhia"
  >("preco");

  const [companhiaExatas, setCompanhiaExatas] =
    useState<string | null>(null);

  const [modoFlexiveis, setModoFlexiveis] = useState<
    "recomendadas" | "preco" | "companhia"
  >("recomendadas");

  const [companhiaFlexiveis, setCompanhiaFlexiveis] =
    useState<string | null>(null);

  const [combinacaoSelecionada, setCombinacaoSelecionada] =
    useState<{
      partida: string;
      regresso: string | null;
    } | null>(null);

  const { data, isFetching, error } = useQuery({
    queryKey: [
      "voos-v4",
      {
        ...busca,
        executar: undefined,
      },
    ],
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

    const regressoPedido =
      busca.dataRegresso === ""
        ? null
        : busca.dataRegresso;

    const ofertasExatas = todas.filter(
      (o) =>
        o.dataPartida === busca.dataPartida &&
        (o.dataRegresso ?? null) === regressoPedido,
    );

    function selecionarComDiversidade(
      ofertas: Oferta[],
      limite: number,
      _primeirasDiversas: number,
    ): Oferta[] {
      const porCompanhia = new Map<
        string,
        Oferta[]
      >();

      for (const oferta of ofertas) {
        const lista =
          porCompanhia.get(oferta.companhia) ?? [];

        lista.push(oferta);
        porCompanhia.set(oferta.companhia, lista);
      }

      for (const lista of porCompanhia.values()) {
        lista.sort(
          (a, b) =>
            a.precoTotal - b.precoTotal,
        );
      }

      const selecionadas: Oferta[] = [];
      let indice = 0;

      while (selecionadas.length < limite) {
        const ronda: Oferta[] = [];

        for (const lista of porCompanhia.values()) {
          const oferta = lista[indice];

          if (oferta) {
            ronda.push(oferta);
          }
        }

        if (ronda.length === 0) {
          break;
        }

        ronda.sort(
          (a, b) =>
            a.precoTotal - b.precoTotal,
        );

        for (const oferta of ronda) {
          if (selecionadas.length >= limite) {
            break;
          }

          selecionadas.push(oferta);
        }

        indice++;
      }

      return selecionadas;
    }

    const exatas = selecionarComDiversidade(
      ofertasExatas,
      100,
      5,
    );

    const ofertasFlexiveis = todas.filter(
      (o) => !ofertasExatas.includes(o),
    );

    const flexiveisPorPreco = [
      ...ofertasFlexiveis,
    ].sort(
      (a, b) =>
        a.precoTotal - b.precoTotal,
    );

    const flexiveis = selecionarComDiversidade(
      flexiveisPorPreco,
      100,
      5,
    );

    return {
      exatas,
      flexiveis,
    };
  }, [
    data,
    busca.dataPartida,
    busca.dataRegresso,
  ]);


  const melhorExata =
    exatas[0]?.precoTotal ?? null;
      const combinacoesFlexiveis = useMemo(() => {
    const todas = data?.ofertas ?? [];

    const regressoPedido =
      busca.dataRegresso === ""
        ? null
        : busca.dataRegresso;

    const ofertasFlexiveisTodas = todas.filter(
      (oferta) =>
        !(
          oferta.dataPartida === busca.dataPartida &&
          (oferta.dataRegresso ?? null) ===
            regressoPedido
        ),
    );

    const grupos = new Map<
      string,
      {
        partida: string;
        regresso: string | null;
        ofertas: Oferta[];
        melhor: Oferta;
      }
    >();

    for (const oferta of ofertasFlexiveisTodas) {
      const chave = `${oferta.dataPartida}|${
        oferta.dataRegresso ?? ""
      }`;

      const existente = grupos.get(chave);

      if (!existente) {
        grupos.set(chave, {
          partida: oferta.dataPartida,
          regresso:
            oferta.dataRegresso ?? null,
          ofertas: [oferta],
          melhor: oferta,
        });

        continue;
      }

      existente.ofertas.push(oferta);

      if (
        oferta.precoTotal <
        existente.melhor.precoTotal
      ) {
        existente.melhor = oferta;
      }
    }

    return Array.from(grupos.values()).sort(
      (a, b) =>
        a.melhor.precoTotal -
        b.melhor.precoTotal,
    );
  }, [
    data,
    busca.dataPartida,
    busca.dataRegresso,
  ]);

  const combinacoesDatasOrdenadas = useMemo(() => {
    const lista = [...combinacoesFlexiveis];

    const distanciaEmDias = (
      dataA: string,
      dataB: string,
    ) =>
      Math.abs(
        Math.round(
          (new Date(`${dataA}T00:00:00Z`).getTime() -
            new Date(`${dataB}T00:00:00Z`).getTime()) /
            86_400_000,
        ),
      );

    if (ordemDatas === "proximidade") {
      lista.sort((a, b) => {
        const distanciaA =
          distanciaEmDias(
            a.partida,
            busca.dataPartida,
          ) +
          (a.regresso && busca.dataRegresso
            ? distanciaEmDias(
                a.regresso,
                busca.dataRegresso,
              )
            : 0);

        const distanciaB =
          distanciaEmDias(
            b.partida,
            busca.dataPartida,
          ) +
          (b.regresso && busca.dataRegresso
            ? distanciaEmDias(
                b.regresso,
                busca.dataRegresso,
              )
            : 0);

        return (
          distanciaA - distanciaB ||
          a.melhor.precoTotal -
            b.melhor.precoTotal
        );
      });
    } else if (ordemDatas === "opcoes") {
      lista.sort(
        (a, b) =>
          b.ofertas.length -
            a.ofertas.length ||
          a.melhor.precoTotal -
            b.melhor.precoTotal,
      );
    } else {
      lista.sort(
        (a, b) =>
          a.melhor.precoTotal -
          b.melhor.precoTotal,
      );
    }

    return lista;
  }, [
    combinacoesFlexiveis,
    ordemDatas,
    busca.dataPartida,
    busca.dataRegresso,
  ]);

          const recomendacoesDatas = useMemo(() => {
    if (combinacoesFlexiveis.length === 0) {
      return [];
    }

    const maisBarata =
      combinacoesFlexiveis[0]!;

    const maisOpcoes =
      [...combinacoesFlexiveis].sort(
        (a, b) =>
          b.ofertas.length -
          a.ofertas.length,
      )[0]!;

    function distanciaDasDatas(
      combinacao: {
        partida: string;
        regresso: string | null;
      },
    ) {
      const partidaPedida =
        new Date(
          `${busca.dataPartida}T00:00:00Z`,
        );

      const partidaAlternativa =
        new Date(
          `${combinacao.partida}T00:00:00Z`,
        );

      const diferencaPartida =
        Math.abs(
          partidaAlternativa.getTime() -
            partidaPedida.getTime(),
        ) /
        (1000 * 60 * 60 * 24);

      if (
        busca.dataRegresso === "" ||
        combinacao.regresso === null
      ) {
        return diferencaPartida;
      }

      const regressoPedido =
        new Date(
          `${busca.dataRegresso}T00:00:00Z`,
        );

      const regressoAlternativa =
        new Date(
          `${combinacao.regresso}T00:00:00Z`,
        );

      const diferencaRegresso =
        Math.abs(
          regressoAlternativa.getTime() -
            regressoPedido.getTime(),
        ) /
        (1000 * 60 * 60 * 24);

      return (
        diferencaPartida +
        diferencaRegresso
      );
    }

    const candidatasMaisProximas =
      combinacoesFlexiveis
        .filter(
          (combinacao) =>
            !(
              combinacao.partida ===
                maisBarata.partida &&
              combinacao.regresso ===
                maisBarata.regresso
            ) &&
            !(
              combinacao.partida ===
                maisOpcoes.partida &&
              combinacao.regresso ===
                maisOpcoes.regresso
            ),
        )
        .sort(
          (a, b) =>
            distanciaDasDatas(a) -
            distanciaDasDatas(b),
        );

    const maisProxima =
      candidatasMaisProximas[0] ??
      maisBarata;

    return [
      {
        tipo: "mais-barata" as const,
        etiqueta: "🏆 Mais barato",
        combinacao: maisBarata,
      },
      {
        tipo: "mais-opcoes" as const,
        etiqueta: "📅 Mais opções",
        combinacao: maisOpcoes,
      },
      {
        tipo: "mais-proxima" as const,
        etiqueta:
          "🎯 Mais próximo das datas",
        combinacao: maisProxima,
      },
    ].filter(
      (item, indice, lista) =>
        lista.findIndex(
          (outro) =>
            outro.combinacao.partida ===
              item.combinacao.partida &&
            outro.combinacao.regresso ===
              item.combinacao.regresso,
        ) === indice,
    );
  }, [
    combinacoesFlexiveis,
    busca.dataPartida,
    busca.dataRegresso,
  ]);

  const ofertasFlexiveisSelecionadas = useMemo(() => {
    if (!combinacaoSelecionada) {
      return flexiveis;
    }

    return (data?.ofertas ?? []).filter(
      (oferta) =>
        oferta.dataPartida ===
          combinacaoSelecionada.partida &&
        (oferta.dataRegresso ?? null) ===
          combinacaoSelecionada.regresso,
    );
  }, [
    data,
    flexiveis,
    combinacaoSelecionada,
  ]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {busca.origem} → {busca.destino}
          </h1>

          <p className="text-sm text-muted-foreground">
            Ida −{busca.idaAntes}/+
            {busca.idaDepois} dias
            {busca.dataRegresso
              ? ` · Regresso −${busca.regressoAntes}/+${busca.regressoDepois} dias`
              : ""}
            {busca.dataRegresso && busca.duracaoMinima > 0
              ? ` · mínimo ${busca.duracaoMinima} dias de viagem`
              : ""}
            {busca.dataRegresso && busca.duracaoMaxima > 0
              ? ` · máximo ${busca.duracaoMaxima} dias de viagem`
              : ""}{" "}
            · {busca.passageiros}{" "}
            {busca.passageiros === 1
              ? "passageiro"
              : "passageiros"}
          </p>
        </div>

        <SearchForm
          initial={{
            ...busca,
          }}
          compacto
        />

        {data ? (
  <EstadoLigacao dados={data} />
) : null}

{data && !isFetching && !error && data.ofertas.length > 0 ? (
  <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Pesquisa personalizada</Badge>

        <span className="text-sm text-muted-foreground">
          {data.combinacoesConsultadas}{" "}
          {data.combinacoesConsultadas === 1
            ? "combinação de datas analisada"
            : "combinações de datas analisadas"}
          {" · "}
          {data.ofertas.length.toLocaleString("pt-PT")}{" "}
          {data.ofertas.length === 1
            ? "opção de voo encontrada"
            : "opções de voo encontradas"}
        </span>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold">
          Encontrámos as melhores possibilidades para a sua viagem
        </h2>

        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Analisámos as combinações de datas dentro da flexibilidade que definiu
          e encontrámos as opções de voo disponíveis para os seus critérios.
        </p>
      </div>
    </div>
  </section>
) : null}

        {isFetching ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                className="h-24 w-full rounded-2xl"
              />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={SearchX}
            titulo="Não foi possível pesquisar"
            descricao={
              error instanceof Error
                ? error.message
                : "Tente novamente."
            }
          />
        ) : !data ||
          data.ofertas.length === 0 ? (
          <EmptyState
            icon={SearchX}
            titulo="Sem resultados para estas datas"
            descricao="Experimente aumentar a flexibilidade de dias ou escolher outro aeroporto."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Resumo
                etiqueta="Preço mais baixo"
                valor={fmtPreco.format(
                  data.precoMinimo ?? 0,
                )}
              />

              <Resumo
                etiqueta="Preço mediano"
                valor={fmtPreco.format(
                  data.precoMediano ?? 0,
                )}
              />

              <Resumo
                etiqueta="Combinações analisadas"
                valor={`${data.combinacoesConsultadas} de ${data.combinacoesGeradas}`}
              />
            </div>

            <section className="space-y-5">
  <div>
    <div className="flex items-center gap-2">
      <span className="text-xl">⭐</span>

      <h2 className="font-display text-xl font-semibold">
        Recomendados para si
      </h2>
    </div>

    <p className="mt-1 text-sm text-muted-foreground">
      Selecionámos as melhores opções nas datas que pediu,
      procurando combinar preço e diversidade de companhias.
    </p>
  </div>

  {exatas.length === 0 ? (
    <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      Não encontrámos voos exactamente nestas datas.
      Veja as alternativas noutras datas em baixo.
    </div>
  ) : (
    <>
      <div className="grid gap-3">
        {exatas.slice(0, 5).map((oferta, i) => {
          const precoMaisBaixo =
            exatas[0]?.precoTotal ?? oferta.precoTotal;

          const diferencaPreco =
            oferta.precoTotal - precoMaisBaixo;

          return (
            <div
              key={oferta.id}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 px-1">
                <Badge
                  variant={
                    i === 0
                      ? "default"
                      : "secondary"
                  }
                >
                  {i === 0
                    ? "⭐ Melhor preço"
                    : "✈️ Alternativa noutra companhia"}
                </Badge>

                {i > 0 && diferencaPreco > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    +{fmtPreco.format(diferencaPreco)} face à opção mais barata
                  </span>
                ) : null}
              </div>

              <div
                className={
                  i === 0
                    ? "rounded-2xl ring-2 ring-primary/20"
                    : ""
                }
              >
                <CartaoOferta
                  oferta={oferta}
                  melhor={i === 0}
                  passageiros={busca.passageiros}
                />
              </div>
            </div>
          );
        })}
      </div>

      {exatas.length > 5 ? (
        <>
          <div className="rounded-2xl border border-border bg-secondary/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  Há mais {exatas.length - 5} opções nas datas que pediu
                </p>

                <p className="text-sm text-muted-foreground">
                  Explore os restantes resultados por preço ou por companhia.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={
                    modoExatas === "preco"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    setModoExatas("preco");
                    setCompanhiaExatas(null);
                    setExatasVisiveis(5);
                  }}
                >
                  💰 Por preço
                </Button>

                <Button
                  variant={
                    modoExatas === "companhia"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    setModoExatas("companhia");
                    setCompanhiaExatas(null);
                    setExatasVisiveis(5);
                  }}
                >
                  ✈️ Por companhia
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <h3 className="font-display text-lg font-semibold">
                Todas as opções nas datas escolhidas
              </h3>

              <p className="text-sm text-muted-foreground">
                Compare as restantes opções e encontre a combinação que melhor se adapta a si.
              </p>
            </div>

            {modoExatas === "companhia" ? (
              <>
                {companhiaExatas ? (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-display text-lg font-semibold">
                          {companhiaExatas}
                        </p>

                        <p className="text-sm text-muted-foreground">
                          {exatas.filter(
                            (oferta) =>
                              oferta.companhia ===
                              companhiaExatas,
                          ).length}{" "}
                          opções encontradas
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCompanhiaExatas(null);
                          setExatasVisiveis(5);
                        }}
                      >
                        ← Todas as companhias
                      </Button>
                    </div>

                    <ul className="space-y-3">
                      {exatas
                        .filter(
                          (oferta) =>
                            oferta.companhia ===
                            companhiaExatas,
                        )
                        .slice(0, exatasVisiveis)
                        .map((oferta) => (
                          <li key={oferta.id}>
                            <CartaoOferta
                              oferta={oferta}
                              melhor={false}
                              passageiros={
                                busca.passageiros
                              }
                            />
                          </li>
                        ))}
                    </ul>

                    {exatas.filter(
                      (oferta) =>
                        oferta.companhia ===
                        companhiaExatas,
                    ).length > exatasVisiveis ? (
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          setExatasVisiveis(
                            (n) => n + 5,
                          )
                        }
                      >
                        <ChevronDown className="size-4" />
                        Mostrar mais opções
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from(
  new Set(
    exatas.map(
      (oferta) =>
        oferta.companhia,
    ),
  ),
)
  .map((companhia) => {
    const ofertasCompanhia =
      exatas.filter(
        (oferta) =>
          oferta.companhia ===
          companhia,
      );

    const maisBarata =
      [...ofertasCompanhia].sort(
        (a, b) =>
          a.precoTotal -
          b.precoTotal,
      )[0];

    return {
      companhia,
      ofertasCompanhia,
      maisBarata,
    };
  })
  .sort(
    (a, b) =>
      (a.maisBarata?.precoTotal ?? Infinity) -
      (b.maisBarata?.precoTotal ?? Infinity),
  )
  .map(
    ({
      companhia,
      ofertasCompanhia,
      maisBarata,
    }) => {
      const datasMelhorOpcao =
        maisBarata
          ? `${formatarData(
              maisBarata.dataPartida,
            )}${
              maisBarata.dataRegresso
                ? ` → ${formatarData(
                    maisBarata.dataRegresso,
                  )}`
                : ""
            }`
          : "";

      return (
        <button
          key={companhia}
          type="button"
          className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
          onClick={() => {
            setCompanhiaExatas(
              companhia,
            );
            setExatasVisiveis(5);
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display font-semibold">
                {companhia}
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                {ofertasCompanhia.length}{" "}
                {ofertasCompanhia.length === 1
                  ? "opção"
                  : "opções"}{" "}
                · desde{" "}
                {maisBarata
                  ? fmtPreco.format(
                      maisBarata.precoTotal,
                    )
                  : "—"}
              </p>
            </div>

            {maisBarata ? (
              <span className="text-sm font-semibold">
                {fmtPreco.format(
                  maisBarata.precoTotal,
                )}
              </span>
            ) : null}
          </div>

          {maisBarata ? (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                Melhor combinação:{" "}
                <span className="font-medium text-foreground">
                  {datasMelhorOpcao}
                </span>
              </p>

              <p className="text-xs text-muted-foreground">
                {maisBarata.escalas === 0
                  ? "✈️ Voo direto"
                  : `✈️ ${maisBarata.escalas} ${
                      maisBarata.escalas === 1
                        ? "escala"
                        : "escalas"
                    }`}
                {" · "}
                ⏱ {duracao(
                  maisBarata.duracaoMin,
                )}
              </p>
            </div>
          ) : null}

          <p className="mt-3 text-xs font-medium text-primary">
            Ver opções desta companhia →
          </p>
        </button>
      );
    },
  )}
                  </div>
                )}
              </>
            ) : (
              <ul className="space-y-3">
                {exatas
                  .slice(5)
                  .sort(
                    (a, b) =>
                      a.precoTotal -
                      b.precoTotal,
                  )
                  .slice(
                    0,
                    exatasVisiveis,
                  )
                  .map((oferta) => (
                    <li key={oferta.id}>
                      <CartaoOferta
                        oferta={oferta}
                        melhor={false}
                        passageiros={
                          busca.passageiros
                        }
                      />
                    </li>
                  ))}
              </ul>
            )}

            {modoExatas === "preco" &&
            exatas.length > 10 ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                {exatasVisiveis <
                exatas.length - 5 ? (
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setExatasVisiveis(
                        (n) => n + 5,
                      )
                    }
                  >
                    <ChevronDown className="size-4" />
                    Mostrar mais opções
                  </Button>
                ) : null}

                {exatasVisiveis >=
                exatas.length - 5 ? (
                  <Button
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setExatasVisiveis(5)
                    }
                  >
                    Mostrar menos
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  )}
</section>

            {flexiveis.length > 0 ? (
                            <section className="space-y-4 rounded-2xl border border-border bg-secondary/30 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
                    <CalendarRange className="size-5" />
                    Encontre uma data melhor
                  </h2>

                  <p className="text-sm text-muted-foreground">
                    Encontrámos {combinacoesFlexiveis.length}{" "}
                    {combinacoesFlexiveis.length === 1
                      ? "combinação de datas"
                      : "combinações de datas"}{" "}
                    dentro da flexibilidade que definiu.
                  </p>
                </div>

                                                <div className="grid gap-3 md:grid-cols-3">
                  {recomendacoesDatas.map(
                    (recomendacao, indice) => {
                      const combinacao =
                        recomendacao.combinacao;

                      const poupanca =
                        melhorExata !== null
                          ? Math.max(
                              0,
                              Math.round(
                                (melhorExata -
                                  combinacao.melhor
                                    .precoTotal) *
                                  100,
                              ) / 100,
                            )
                          : 0;

                      const percentagemPoupanca =
                        melhorExata !== null &&
                        melhorExata > 0
                          ? Math.round(
                              (poupanca /
                                melhorExata) *
                                100,
                            )
                          : 0;
                      const descricaoRecomendacao =
                        recomendacao.tipo ===
                        "mais-barata"
                          ? "Menor preço encontrado"
                          : recomendacao.tipo ===
                              "mais-opcoes"
                            ? "Maior variedade de voos"
                            : "Altera menos as datas que pediu";

                      return (
                        <button
                          type="button"
                          key={`${recomendacao.tipo}-${combinacao.partida}-${combinacao.regresso ?? ""}`}
                          onClick={() => {
                            setCombinacaoSelecionada({
                              partida: combinacao.partida,
                              regresso: combinacao.regresso,
                            });
                            setModoFlexiveis("recomendadas");
                            setCompanhiaFlexiveis(null);
                            setFlexVisiveis(5);
                          }}
                          className={
                            (combinacaoSelecionada
                              ? combinacaoSelecionada.partida ===
                                  combinacao.partida &&
                                combinacaoSelecionada.regresso ===
                                  combinacao.regresso
                              : indice === 0)
                              ? "w-full rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left transition hover:border-primary/50"
                              : "w-full rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge
                              variant={
                                (combinacaoSelecionada
                                  ? combinacaoSelecionada.partida ===
                                      combinacao.partida &&
                                    combinacaoSelecionada.regresso ===
                                      combinacao.regresso
                                  : indice === 0)
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {recomendacao.etiqueta}
                            </Badge>

                            <span className="font-display text-lg font-semibold">
                              {fmtPreco.format(
                                combinacao.melhor
                                  .precoTotal,
                              )}
                            </span>
                          </div>

                          <p className="mt-3 font-medium">
                            {formatarData(
                              combinacao.partida,
                            )}
                            {combinacao.regresso
                              ? ` → ${formatarData(
                                  combinacao.regresso,
                                )}`
                              : ""}
                          </p>
                          <p className="mt-1 text-xs font-medium text-primary">
                            {descricaoRecomendacao}
                          </p>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {
                              combinacao.melhor
                                .companhia
                            }
                            {" · "}
                            {combinacao.melhor
                              .escalas === 0
                              ? "Direto"
                              : `${combinacao.melhor.escalas} ${
                                  combinacao.melhor
                                    .escalas === 1
                                    ? "escala"
                                    : "escalas"
                                }`}
                            {" · "}
                            {duracao(
                              combinacao.melhor
                                .duracaoMin,
                            )}
                          </p>

                          {melhorExata !==
                            null &&
                          poupanca > 0 ? (
                            <div className="mt-3 rounded-xl bg-primary/10 px-3 py-2">
                              <p className="text-sm font-semibold text-primary">
                                💚 Poupa{" "}
                                {fmtPreco.format(
                                  poupanca,
                                )}
                                {percentagemPoupanca >
                                0 ? (
                                  <span className="ml-1">
                                    ·{" "}
                                    {
                                      percentagemPoupanca
                                    }
                                    % mais barato
                                  </span>
                                ) : null}
                              </p>

                              <p className="mt-0.5 text-xs text-muted-foreground">
                                face à melhor opção nas
                                datas escolhidas
                              </p>
                            </div>
                          ) : melhorExata !==
                              null &&
                            combinacao.melhor
                              .precoTotal ===
                              melhorExata ? (
                            <div className="mt-3 rounded-xl bg-secondary px-3 py-2">
                            <p className="text-sm font-medium">
                                Mesmo preço
                              </p>

                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Não paga mais por alterar as datas
                              </p>
                            </div>
                          ) : null}

                          <p className="mt-3 text-xs text-muted-foreground">
                            {
                              combinacao.ofertas
                                .length
                            }{" "}
                            {combinacao.ofertas
                              .length === 1
                              ? "opção de voo"
                              : "opções de voo"}{" "}
                            nesta combinação
                          </p>
                        </button>
                      );
                    },
                  )}
                </div>

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      Explore todas as combinações
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Compare as {combinacoesFlexiveis.length}{" "}
                      {combinacoesFlexiveis.length === 1
                        ? "combinação de datas encontrada"
                        : "combinações de datas encontradas"}.
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMostrarTodasDatas(
                        (mostrar) => !mostrar,
                      )
                    }
                  >
                    {mostrarTodasDatas
                      ? "Ocultar combinações"
                      : `Ver todas (${combinacoesFlexiveis.length})`}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={
                      modoFlexiveis ===
                      "recomendadas"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setModoFlexiveis(
                        "recomendadas",
                      );
                      setCompanhiaFlexiveis(
                        null,
                      );
                      setFlexVisiveis(3);
                    }}
                  >
                    Recomendadas
                  </Button>

                  <Button
                    variant={
                      modoFlexiveis ===
                      "preco"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setModoFlexiveis(
                        "preco",
                      );
                      setCompanhiaFlexiveis(
                        null,
                      );
                      setFlexVisiveis(3);
                    }}
                  >
                    Por preço
                  </Button>

                  <Button
                    variant={
                      modoFlexiveis ===
                      "companhia"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setModoFlexiveis(
                        "companhia",
                      );
                      setFlexVisiveis(3);
                    }}
                  >
                    Por companhia
                  </Button>
                </div>

                                {mostrarTodasDatas ? (
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          Todas as combinações de datas
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ordemDatas === "preco"
                            ? "Ordenadas pelo melhor preço encontrado."
                            : ordemDatas === "proximidade"
                              ? "Primeiro as combinações mais próximas das datas que pediu."
                              : "Primeiro as combinações com mais opções de voo disponíveis."}
                        </p>
                      </div>

                      <span className="text-xs text-muted-foreground">
                        {combinacoesFlexiveis.length} combinações
                      </span>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
  <Button
    variant={ordemDatas === "preco" ? "default" : "outline"}
    size="sm"
    onClick={() => setOrdemDatas("preco")}
  >
    💰 Por preço
  </Button>

  <Button
    variant={
      ordemDatas === "opcoes"
        ? "default"
        : "outline"
    }
    size="sm"
    onClick={() => setOrdemDatas("opcoes")}
  >
    📅 Mais opções
  </Button>

  <Button
    variant={
      ordemDatas === "proximidade"
        ? "default"
        : "outline"
    }
    size="sm"
    onClick={() => setOrdemDatas("proximidade")}
  >
    🎯 Mais próximas das datas
  </Button>
</div>

                    <div className="space-y-2">
                      {combinacoesDatasOrdenadas.map(
                        (combinacao, indice) => {
                          const poupanca =
                            melhorExata !== null
                              ? Math.max(
                                  0,
                                  Math.round(
                                    (melhorExata -
                                      combinacao.melhor
                                        .precoTotal) *
                                      100,
                                  ) / 100,
                                )
                              : 0;

                          return (
                            <button
                              type="button"
                              key={`${combinacao.partida}|${
                                combinacao.regresso ?? ""
                              }`}
                              onClick={() => {
                                setCombinacaoSelecionada({
                                  partida: combinacao.partida,
                                  regresso: combinacao.regresso,
                                });
                                setModoFlexiveis("recomendadas");
                                setCompanhiaFlexiveis(null);
                                setFlexVisiveis(5);
                              }}
                              className={`flex w-full flex-col gap-2 rounded-xl border px-3 py-3 text-left transition sm:flex-row sm:items-center sm:justify-between ${
                                combinacaoSelecionada?.partida ===
                                  combinacao.partida &&
                                combinacaoSelecionada?.regresso ===
                                  combinacao.regresso
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/40 hover:bg-primary/5"
                              }`}
                            >
                              <div>
                                <p className="font-medium">
                                  {indice + 1}.{" "}
                                  {formatarData(
                                    combinacao.partida,
                                  )}
                                  {combinacao.regresso
                                    ? ` → ${formatarData(
                                        combinacao.regresso,
                                      )}`
                                    : ""}
                                </p>

                                <p className="text-xs text-muted-foreground">
                                  {combinacao.melhor
                                    .companhia}
                                  {" · "}
                                  {combinacao.melhor
                                    .escalas === 0
                                    ? "Direto"
                                    : `${combinacao.melhor.escalas} ${
                                        combinacao.melhor
                                          .escalas === 1
                                          ? "escala"
                                          : "escalas"
                                      }`}
                                  {" · "}
                                  {duracao(
                                    combinacao.melhor
                                      .duracaoMin,
                                  )}
                                  {" · "}
                                  {
                                    combinacao.ofertas
                                      .length
                                  }{" "}
                                  {combinacao
                                    .ofertas.length === 1
                                    ? "opção"
                                    : "opções"}
                                </p>
                              </div>

                              <div className="text-left sm:text-right">
                                <p className="font-display font-semibold">
                                  {fmtPreco.format(
                                    combinacao.melhor
                                      .precoTotal,
                                  )}
                                </p>

                                {poupanca > 0 ? (
                                  <p className="text-xs font-medium text-primary">
                                    Poupa{" "}
                                    {fmtPreco.format(
                                      poupanca,
                                    )}
                                  </p>
                                ) : melhorExata !==
                                    null &&
                                  combinacao.melhor
                                    .precoTotal ===
                                    melhorExata ? (
                                  <p className="text-xs text-muted-foreground">
                                    Mesmo preço
                                  </p>
                                ) : null}
                              </div>
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                ) : null}

                {combinacaoSelecionada ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        A ver voos para{" "}
                        {formatarData(
                          combinacaoSelecionada.partida,
                        )}
                        {combinacaoSelecionada.regresso
                          ? ` → ${formatarData(
                              combinacaoSelecionada.regresso,
                            )}`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Mostramos apenas as opções desta combinação de datas.
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCombinacaoSelecionada(null);
                        setFlexVisiveis(3);
                      }}
                    >
                      Todas as datas
                    </Button>
                  </div>
                ) : null}

                {modoFlexiveis ===
                "companhia" ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from(
                      new Set(
                        ofertasFlexiveisSelecionadas.map(
                          (oferta) =>
                            oferta.companhia,
                        ),
                      ),
                    ).map((companhia) => (
                      <Button
                        key={companhia}
                        variant={
                          companhiaFlexiveis ===
                          companhia
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          setCompanhiaFlexiveis(
                            companhia,
                          );
                          setFlexVisiveis(3);
                        }}
                      >
                        {companhia}
                      </Button>
                    ))}
                  </div>
                ) : null}

                <ul className="space-y-3">
                  {(() => {
                    let ofertasParaMostrar =
                      ofertasFlexiveisSelecionadas;

                    if (
                      modoFlexiveis ===
                        "companhia" &&
                      companhiaFlexiveis
                    ) {
                      ofertasParaMostrar =
                        ofertasParaMostrar.filter(
                          (oferta) =>
                            oferta.companhia ===
                            companhiaFlexiveis,
                        );
                    }

                    if (
                      modoFlexiveis ===
                      "preco"
                    ) {
                      ofertasParaMostrar = [
                        ...ofertasParaMostrar,
                      ].sort(
                        (a, b) =>
                          a.precoTotal -
                          b.precoTotal,
                      );
                    }

                    return ofertasParaMostrar
                      .slice(
                        0,
                        flexVisiveis,
                      )
                      .map((oferta) => (
                        <li
                          key={oferta.id}
                        >
                          <CartaoOferta
                            oferta={oferta}
                            melhor={false}
                            passageiros={
                              busca.passageiros
                            }
                            pedido={{
                              partida:
                                busca.dataPartida,
                              regresso:
                                busca.dataRegresso ===
                                ""
                                  ? null
                                  : busca.dataRegresso,
                            }}
                            {...(melhorExata !==
                            null
                              ? {
                                  referencia:
                                    melhorExata,
                                }
                              : {})}
                          />
                        </li>
                      ));
                  })()}
                </ul>

                {flexVisiveis <
                ofertasFlexiveisSelecionadas.length ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        setFlexVisiveis(
                          (n) => n + 5,
                        )
                      }
                    >
                      <ChevronDown className="size-4" />{" "}
                      Ver mais opções
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        setFlexVisiveis(
                          flexiveis.length,
                        )
                      }
                    >
                      Ver todos os preços (
                      {flexiveis.length})
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setFlexVisiveis(3)
                    }
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

function Resumo({
  etiqueta,
  valor,
}: {
  etiqueta: string;
  valor: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </p>
      <p className="mt-1 font-display text-xl font-semibold">
        {valor}
      </p>
    </div>
  );
}

function CartaoOferta({
  oferta,
  melhor,
  passageiros,
  pedido,
  referencia,
}: {
  oferta: Oferta;
  melhor: boolean;
  passageiros: number;
  pedido?: {
    partida: string;
    regresso: string | null;
  };
  referencia?: number;
}) {
  const [mostrarDetalhes, setMostrarDetalhes] =
    useState(false);

  const ofertaComRegresso = oferta as Oferta & {
    horaPartidaRegresso?: string;
    horaChegadaRegresso?: string;
    duracaoMinRegresso?: number;
    escalasRegresso?: number;
  };

  const partidaMudou = pedido
    ? oferta.dataPartida !== pedido.partida
    : false;

  const regressoMudou = pedido
    ? (oferta.dataRegresso ?? null) !==
      (pedido.regresso ?? null)
    : false;

  const poupanca =
    referencia !== undefined
      ? Math.round(
          (referencia -
            oferta.precoTotal) *
            100,
        ) / 100
      : 0;

  const temRegresso =
    Boolean(oferta.dataRegresso);

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card transition ${
        melhor
          ? "border-primary/30 shadow-sm"
          : "border-border"
      }`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-semibold">
                {oferta.companhia}
              </span>

              <Badge variant="secondary">
                {oferta.numeroVoo}
              </Badge>

              {melhor ? (
                <Badge>⭐ Melhor preço</Badge>
              ) : null}

              {poupanca > 0 ? (
                <Badge>
                  Poupa{" "}
                  {fmtPreco.format(poupanca)}
                </Badge>
              ) : null}

              {oferta.escalas === 0 ? (
                <Badge variant="outline">
                  Direto
                </Badge>
              ) : (
                <Badge variant="outline">
                  {oferta.escalas}{" "}
                  {oferta.escalas === 1
                    ? "escala"
                    : "escalas"}
                </Badge>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div
                className={`rounded-xl border p-3 ${
                  partidaMudou
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-secondary/20"
                }`}
              >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ida
                </p>

                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="font-display text-lg font-semibold">
                      {oferta.horaPartida}
                    </p>
                    <p className="text-xs font-medium">
                      {oferta.origem}
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {duracao(
                        oferta.duracaoMin,
                      )}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="text-center">
                    <p className="font-display text-lg font-semibold">
                      {oferta.horaChegada}
                    </p>
                    <p className="text-xs font-medium">
                      {oferta.destino}
                    </p>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {formatarData(
                    oferta.dataPartida,
                  )}{" "}
                  ·{" "}
                  {oferta.escalas === 0
                    ? "Voo direto"
                    : `${oferta.escalas} ${
                        oferta.escalas === 1
                          ? "escala"
                          : "escalas"
                      }`}
                </p>
              </div>

              {temRegresso ? (
                <div
                  className={`rounded-xl border p-3 ${
                    regressoMudou
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-secondary/20"
                  }`}
                >
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Regresso
                  </p>

                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="font-display text-lg font-semibold">
                        {ofertaComRegresso.horaPartidaRegresso ??
                          "—"}
                      </p>
                      <p className="text-xs font-medium">
                        {oferta.destino}
                      </p>
                    </div>

                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {ofertaComRegresso.duracaoMinRegresso !==
                        undefined
                          ? duracao(
                              ofertaComRegresso.duracaoMinRegresso,
                            )
                          : "—"}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    <div className="text-center">
                      <p className="font-display text-lg font-semibold">
                        {ofertaComRegresso.horaChegadaRegresso ??
                          "—"}
                      </p>
                      <p className="text-xs font-medium">
                        {oferta.origem}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatarData(
                      oferta.dataRegresso!,
                    )}{" "}
                    ·{" "}
                    {ofertaComRegresso.escalasRegresso ===
                    undefined
                      ? "Informação de escalas"
                      : ofertaComRegresso.escalasRegresso ===
                          0
                        ? "Voo direto"
                        : `${ofertaComRegresso.escalasRegresso} ${
                            ofertaComRegresso.escalasRegresso ===
                            1
                              ? "escala"
                              : "escalas"
                          }`}
                  </p>
                </div>
              ) : null}
            </div>

            {partidaMudou || regressoMudou ? (
              <p className="mt-3 text-xs font-medium text-primary">
                Datas alteradas face ao que pediu
                {pedido
                  ? ` (${formatarData(
                      pedido.partida,
                    )}${
                      pedido.regresso
                        ? ` → ${formatarData(
                            pedido.regresso,
                          )}`
                        : ""
                    })`
                  : ""}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t pt-4 lg:w-52 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="text-left lg:text-right">
              {oferta.precoIndisponivel ? (
                <p className="font-display text-base font-semibold text-muted-foreground">
                  Preço indisponível
                </p>
              ) : (
                <>
                  <p className="font-display text-2xl font-semibold">
                    {fmtPreco.format(
                      oferta.precoTotal,
                    )}
                  </p>

                  <p className="text-xs font-medium text-muted-foreground">
                    Preço total da viagem
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {passageiros}{" "}
                    {passageiros === 1
                      ? "passageiro"
                      : "passageiros"}{" "}
                    ·{" "}
                    {fmtPreco.format(
                      oferta.precoPorPassageiro,
                    )}{" "}
                    / pessoa
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <ReservarParceiroDialog
                oferta={oferta}
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  setMostrarDetalhes(
                    (mostrar) => !mostrar,
                  )
                }
              >
                <ChevronDown
                  className={`size-4 transition-transform ${
                    mostrarDetalhes
                      ? "rotate-180"
                      : ""
                  }`}
                />
                {mostrarDetalhes
                  ? "Ocultar detalhes"
                  : "Ver detalhes"}
              </Button>

              <GuardarOfertaDialog
                oferta={oferta}
              />
            </div>
          </div>
        </div>
      </div>

      {mostrarDetalhes ? (
        <div className="border-t border-border bg-secondary/20 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Companhia
              </p>
              <p className="mt-1 text-sm font-medium">
                {oferta.companhia}
              </p>
              <p className="text-xs text-muted-foreground">
                Voo {oferta.numeroVoo}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ida
              </p>
              <p className="mt-1 text-sm font-medium">
                {formatarData(
                  oferta.dataPartida,
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {oferta.horaPartida} →{" "}
                {oferta.horaChegada} ·{" "}
                {duracao(
                  oferta.duracaoMin,
                )}
              </p>
            </div>

            {temRegresso ? (
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Regresso
                </p>
                <p className="mt-1 text-sm font-medium">
                  {formatarData(
                    oferta.dataRegresso!,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ofertaComRegresso.horaPartidaRegresso ??
                    "—"}{" "}
                  →{" "}
                  {ofertaComRegresso.horaChegadaRegresso ??
                    "—"}
                  {ofertaComRegresso.duracaoMinRegresso !==
                  undefined
                    ? ` · ${duracao(
                        ofertaComRegresso.duracaoMinRegresso,
                      )}`
                    : ""}
                </p>
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Escalas
              </p>
              <p className="mt-1 text-sm font-medium">
                {oferta.escalas === 0
                  ? "Direto"
                  : `${oferta.escalas} ${
                      oferta.escalas === 1
                        ? "escala"
                        : "escalas"
                    } na ida`}
              </p>
              {temRegresso &&
              ofertaComRegresso.escalasRegresso !==
                undefined ? (
                <p className="text-xs text-muted-foreground">
                  Regresso:{" "}
                  {ofertaComRegresso.escalasRegresso ===
                  0
                    ? "direto"
                    : `${ofertaComRegresso.escalasRegresso} ${
                        ofertaComRegresso.escalasRegresso ===
                        1
                          ? "escala"
                          : "escalas"
                      }`}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                O que está incluído
              </p>
              <p className="mt-1 text-sm font-medium">
                {oferta.bagagemIncluida
                  ? "✓ Bagagem incluída"
                  : "Bagagem não indicada"}
              </p>
              <p className="text-xs text-muted-foreground">
                Confirme as condições finais no parceiro antes de reservar.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Passageiros
              </p>
              <p className="mt-1 text-sm font-medium">
                {passageiros}{" "}
                {passageiros === 1
                  ? "passageiro"
                  : "passageiros"}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtPreco.format(
                  oferta.precoPorPassageiro,
                )}{" "}
                por passageiro
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              O preço e as condições podem mudar até ao momento da reserva. A compra é concluída no parceiro indicado.
            </p>
          </div>
        </div>
      ) : null}
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
  const ativo =
    dados.estadoFornecedor === "ativo";

  const titulo = ativo
    ? `Preços em direto via ${dados.fornecedor}`
    : dados.estadoFornecedor ===
        "limite"
      ? "Limite de pedidos do fornecedor atingido"
      : dados.estadoFornecedor ===
          "erro"
        ? "O fornecedor de voos não respondeu"
        : "Ligação ao fornecedor por ativar";

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
        <p className="font-medium">
          {titulo}
        </p>

        {dados.aviso ? (
          <p>{dados.aviso}</p>
        ) : null}

        {!ativo &&
        dados.emFalta &&
        dados.emFalta.length > 0 ? (
          <p className="text-xs">
            Para ativar preços reais e
            reserváveis é preciso um acesso
            aprovado ao fornecedor de voos e
            guardar a chave{" "}
            {dados.emFalta.join(", ")} nas
            definições da app. Enquanto isso
            não acontecer, mostramos apenas
            resultados simulados.
          </p>
        ) : null}
      </div>
    </div>
  );
}
