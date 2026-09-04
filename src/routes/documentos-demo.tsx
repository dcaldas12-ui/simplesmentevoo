import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  FileText,
  Link2,
  Mail,
  MapPin,
  Plus,
  QrCode,
  Ticket,
  Upload,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/documentos-demo")({
  head: () => ({
    meta: [
      { title: "Documentos da viagem (demonstração) — Simplesmente voo" },
      {
        name: "description",
        content:
          "Veja como os bilhetes, vouchers e outros documentos ficam organizados e associados a cada viagem: PDF, códigos QR e documentos recebidos por email.",
      },
      {
        property: "og:title",
        content: "Documentos da viagem (demonstração) — Simplesmente voo",
      },
      {
        property: "og:description",
        content:
          "Exemplo prático de gestão de documentos de viagem: bilhetes, vouchers e outros ficheiros sempre à mão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentosDemo,
});

type DocDemo = {
  id: string;
  nome: string;
  tipo: "pdf" | "qr" | "email";
  detalhe: string;
  seccao: "bilhetes" | "vouchers" | "outros";
};

const documentosIniciais: DocDemo[] = [
  {
    id: "1",
    nome: "Cartão de embarque — LIS → BCN",
    tipo: "pdf",
    detalhe: "PDF · 3 out, 07:45 · TP1042",
    seccao: "bilhetes",
  },
  {
    id: "2",
    nome: "Cartão de embarque — BCN → LIS",
    tipo: "qr",
    detalhe: "Código QR · 7 out, 19:20 · TP1049",
    seccao: "bilhetes",
  },
  {
    id: "3",
    nome: "Reserva do hotel Gòtic",
    tipo: "email",
    detalhe: "Recebido de reservas@hotelgotic.es · 12 set",
    seccao: "vouchers",
  },
  {
    id: "4",
    nome: "Transfer aeroporto → centro",
    tipo: "qr",
    detalhe: "Código QR · voucher para 2 pessoas",
    seccao: "vouchers",
  },
  {
    id: "5",
    nome: "Seguro de viagem",
    tipo: "pdf",
    detalhe: "PDF · apólice 88213-A",
    seccao: "outros",
  },
];

const iconePorTipo = { pdf: FileText, qr: QrCode, email: Mail } as const;
const etiquetaPorTipo = {
  pdf: "PDF",
  qr: "Código QR",
  email: "Recebido por email",
} as const;

const seccoes = [
  {
    chave: "bilhetes" as const,
    titulo: "Bilhetes",
    descricao: "Cartões de embarque e bilhetes de comboio ou autocarro.",
    icone: Ticket,
    vazio: "Ainda não há bilhetes nesta viagem. Carregue o PDF ou adicione o código QR.",
  },
  {
    chave: "vouchers" as const,
    titulo: "Vouchers",
    descricao: "Hotéis, transfers, atividades e reservas com voucher.",
    icone: Wallet,
    vazio: "Sem vouchers guardados. Reencaminhe o email da reserva ou carregue o ficheiro.",
  },
  {
    chave: "outros" as const,
    titulo: "Outros documentos",
    descricao: "Seguros, comprovativos, vistos e tudo o resto.",
    icone: FileText,
    vazio: "Nada por aqui. Junte o seguro de viagem ou outros comprovativos.",
  },
];

function DocumentosDemo() {
  const [docs, setDocs] = useState<DocDemo[]>(documentosIniciais);

  function adicionar(tipo: DocDemo["tipo"], seccao: DocDemo["seccao"]) {
    const nomes = {
      pdf: "Novo ficheiro carregado.pdf",
      qr: "Novo código QR digitalizado",
      email: "Documento recebido por email",
    } as const;
    setDocs((atuais) => [
      ...atuais,
      {
        id: crypto.randomUUID(),
        nome: nomes[tipo],
        tipo,
        detalhe: "Adicionado agora · exemplo de demonstração",
        seccao,
      },
    ]);
    toast.success("Documento associado à viagem “Férias em Barcelona” (demonstração).");
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          Modo demonstração · nada é guardado
        </span>

        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
          Documentos da viagem
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Todos os documentos ficam ligados a uma viagem. Assim, quando abre a viagem, tem os
          bilhetes, vouchers e comprovativos no mesmo sítio — mesmo sem rede.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h2 className="font-display text-lg font-semibold">Férias em Barcelona</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" /> Barcelona, Espanha
            </p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-4" /> 3 out — 7 out
            </p>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Link2 className="size-4 text-primary" />
            {docs.length} documento(s) associados a esta viagem
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => adicionar("pdf", "bilhetes")}>
              <Upload className="size-4" /> Carregar ficheiro
            </Button>
            <Button size="sm" variant="outline" onClick={() => adicionar("qr", "bilhetes")}>
              <QrCode className="size-4" /> Digitalizar código QR
            </Button>
            <Button size="sm" variant="outline" onClick={() => adicionar("email", "vouchers")}>
              <Mail className="size-4" /> Registar documento por email
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDocs([])}>
              Ver estados vazios
            </Button>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {seccoes.map((s) => {
            const lista = docs.filter((d) => d.seccao === s.chave);
            return (
              <section key={s.chave}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
                      <s.icone className="size-5 text-primary" /> {s.titulo}
                    </h2>
                    <p className="text-sm text-muted-foreground">{s.descricao}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => adicionar("pdf", s.chave)}>
                    <Plus className="size-4" /> Adicionar
                  </Button>
                </div>

                <div className="mt-4">
                  {lista.length === 0 ? (
                    <EmptyState icon={s.icone} titulo={`Sem ${s.titulo.toLowerCase()}`} descricao={s.vazio}>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button size="sm" onClick={() => adicionar("pdf", s.chave)}>
                          <Upload className="size-4" /> Carregar ficheiro
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => adicionar("qr", s.chave)}>
                          <QrCode className="size-4" /> Adicionar QR
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => adicionar("email", s.chave)}>
                          <Mail className="size-4" /> Recebido por email
                        </Button>
                      </div>
                    </EmptyState>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {lista.map((d) => {
                        const Icone = iconePorTipo[d.tipo];
                        return (
                          <li
                            key={d.id}
                            className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"
                          >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                              <Icone className="size-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{d.nome}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{d.detalhe}</p>
                              <span className="mt-2 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                                {etiquetaPorTipo[d.tipo]}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col items-start gap-3 rounded-2xl border border-border bg-secondary/60 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Quer guardar os seus documentos?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie a sua viagem para guardar bilhetes e vouchers em segurança, só visíveis para si.
            </p>
          </div>
          <Button asChild>
            <Link to="/viagens">Abrir Minhas viagens</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
