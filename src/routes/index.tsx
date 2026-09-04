import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarRange, FileText, Luggage, Sparkles, TrendingDown } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { SearchForm } from "@/components/SearchForm";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Simplesmente voo — voos baratos com datas flexíveis" },
      {
        name: "description",
        content:
          "Compare todas as combinações de datas dentro da sua margem de flexibilidade, veja os preços mais baixos e organize as suas viagens e documentos num só sítio.",
      },
      { property: "og:title", content: "Simplesmente voo — voos baratos com datas flexíveis" },
      {
        property: "og:description",
        content:
          "Pesquisa de voos com flexibilidade de datas, gestão de viagens e documentos de viagem organizados.",
      },
    ],
  }),
  component: Index,
});

const destaques = [
  {
    icon: CalendarRange,
    titulo: "Todas as datas possíveis",
    texto:
      "Indique a margem de dias e geramos todas as combinações de ida e volta dentro dessa janela.",
  },
  {
    icon: TrendingDown,
    titulo: "Ordenado pelo preço",
    texto: "As opções aparecem da mais barata para a mais cara, com o preço total já calculado.",
  },
  {
    icon: Luggage,
    titulo: "Minhas viagens",
    texto: "Guarde voos em viagens organizadas, com datas, referências e notas.",
  },
  {
    icon: FileText,
    titulo: "Documentos sempre à mão",
    texto: "Cartões de embarque em PDF, códigos QR e documentos recebidos por email.",
  },
];

function Index() {
  return (
    <AppShell>
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-14 text-primary-foreground sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium">
            <Sparkles className="size-3.5" /> Pesquisa flexível de datas
          </span>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Encontre o voo mais barato dentro dos dias em que pode viajar
          </h1>
          <p className="mt-4 max-w-xl text-primary-foreground/80">
            Diga-nos para onde quer ir e quantos dias de margem tem. Nós testamos todas as
            combinações de datas e mostramos as melhores opções, de forma transparente.
          </p>
        </div>
      </section>

      <div className="mx-auto -mt-6 w-full max-w-6xl px-4">
        <SearchForm />
      </div>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {destaques.map((d) => (
          <div key={d.titulo} className="rounded-2xl border border-border bg-card p-5">
            <d.icon className="size-5 text-accent-foreground" />
            <h2 className="mt-3 font-display text-base font-semibold">{d.titulo}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{d.texto}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mb-8 w-full max-w-6xl px-4">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-primary/40 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              Viagem de demonstração
            </span>
            <h2 className="mt-3 font-display text-xl font-semibold">
              Documentos da viagem — Férias em Barcelona
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Veja como bilhetes, vouchers e outros documentos (PDF, código QR ou recebidos por
              email) ficam associados a cada viagem. Sem conta e sem compromisso.
            </p>
          </div>
          <Button asChild size="lg" variant="outline">
            <Link to="/documentos-demo">
              <FileText className="size-4" /> Ver documentos da viagem
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto mb-16 w-full max-w-6xl px-4">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-secondary/60 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Já tem viagens marcadas?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie uma viagem, junte os voos e guarde todos os documentos no mesmo sítio.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/viagens">Abrir Minhas viagens</Link>
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
