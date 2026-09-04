import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  Clock,
  FileText,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  QrCode,
  Sparkles,
  Star,
  Ticket,
  Upload,
  Wallet,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { OfflineCard } from "@/components/OfflineCard";
import { AppShell } from "@/components/AppShell";
import { DocumentoFicha } from "@/components/DocumentoFicha";
import { EmptyState } from "@/components/EmptyState";
import { WalletDialog } from "@/components/WalletDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { analisarDocumento } from "@/lib/documentos-ia.functions";
import { criarDocumento, documentosDemo } from "@/lib/documentos-demo";
import {
  etiquetaTipo,
  fichaVazia,
  formatarDataHora,
  paraUsarEmBreve,
  seccaoSugerida,
  type DocumentoViagem,
  type FichaDocumento,
  type SeccaoDocumento,
  type TipoFicheiro,
} from "@/lib/documentos";

export const Route = createFileRoute("/documentos-demo")({
  head: () => ({
    meta: [
      { title: "Documentos da viagem com leitura automática — Simplesmente voo" },
      {
        name: "description",
        content:
          "Carregue bilhetes e vouchers e deixe a leitura automática preencher fornecedor, passageiro, referência e horas. Destaque o que vai usar em breve e prepare a carteira digital.",
      },
      {
        property: "og:title",
        content: "Documentos da viagem com leitura automática — Simplesmente voo",
      },
      {
        property: "og:description",
        content:
          "Bilhetes, vouchers e comprovativos organizados por viagem, com ficha editável e destaque para o que vai usar a seguir.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentosDemo,
});

const iconePorTipo = { pdf: FileText, qr: QrCode, email: Mail, imagem: FileText } as const;

const doc = criarDocumento;


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
  const [docs, setDocs] = useState<DocumentoViagem[]>(() => documentosDemo());
  const [fichaAberta, setFichaAberta] = useState<string | null>(null);
  const [walletAberta, setWalletAberta] = useState<string | null>(null);
  const inputFicheiro = useRef<HTMLInputElement>(null);
  const analisar = useServerFn(analisarDocumento);

  const emBreve = paraUsarEmBreve(docs);

  function atualizar(id: string, muda: (d: DocumentoViagem) => DocumentoViagem) {
    setDocs((atuais) => atuais.map((d) => (d.id === id ? muda(d) : d)));
  }

  type EntradaAnalise = { nome: string; texto?: string | null; imagem?: string | null };
  const entradas = useRef<Map<string, EntradaAnalise>>(new Map());

  async function correrAnalise(id: string, entrada: EntradaAnalise) {
    entradas.current.set(id, entrada);
    atualizar(id, (d) => ({ ...d, estadoAnalise: "a_analisar", notaAnalise: undefined }));
    try {
      const r = await analisar({ data: entrada });
      const vazio = Object.values(r.ficha).every((v) => !String(v ?? "").trim());
      atualizar(id, (d) => ({
        ...d,
        ficha: { ...d.ficha, ...r.ficha },
        seccao: r.ficha.tipoDocumento ? seccaoSugerida(r.ficha.tipoDocumento) : d.seccao,
        estadoAnalise: vazio ? "erro" : "concluida",
        notaAnalise: vazio
          ? "O ficheiro foi guardado, mas não conseguimos ler dados. Pode preencher a ficha à mão."
          : r.nota,
      }));
      if (vazio) {
        toast.warning("Ficheiro guardado. Não foi possível ler dados — complete a ficha quando quiser.");
      } else {
        toast.success("Documento analisado e guardado nesta viagem.");
      }
    } catch {
      atualizar(id, (d) => ({
        ...d,
        estadoAnalise: "erro",
        notaAnalise:
          "O ficheiro ficou guardado, mas a leitura falhou. Tente de novo ou preencha a ficha à mão.",
      }));
      toast.error("Ficheiro guardado. A leitura automática falhou — pode tentar de novo.");
    }
  }

  function novoDocumento(
    nome: string,
    tipo: TipoFicheiro,
    seccao: SeccaoDocumento,
    entrada: { texto?: string | null; imagem?: string | null } = {},
  ) {
    const novo = doc({ nome, tipo, seccao, estadoAnalise: "a_analisar", destacar: true });
    setDocs((atuais) => [...atuais, novo]);
    void correrAnalise(novo.id, { nome, ...entrada });
  }

  async function aoEscolherFicheiro(ficheiro: File) {
    const tipoOk =
      ficheiro.type === "application/pdf" || ficheiro.type.startsWith("image/");
    if (!tipoOk) {
      toast.error("Formato não suportado. Escolha um PDF ou uma imagem.");
      return;
    }
    if (ficheiro.size > 20 * 1024 * 1024) {
      toast.error("Ficheiro demasiado grande (máximo 20 MB).");
      return;
    }
    const eImagem = ficheiro.type.startsWith("image/");
    let imagem: string | null = null;
    if (eImagem) {
      imagem = await new Promise<string | null>((resolve) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result));
        leitor.onerror = () => resolve(null);
        leitor.readAsDataURL(ficheiro);
      });
    }
    novoDocumento(ficheiro.name, eImagem ? "imagem" : "pdf", "bilhetes", { imagem });
  }


  function guardarFicha(id: string, ficha: FichaDocumento, destacar: boolean) {
    atualizar(id, (d) => ({
      ...d,
      ficha,
      destacar,
      seccao: ficha.tipoDocumento ? seccaoSugerida(ficha.tipoDocumento) : d.seccao,
    }));
    setFichaAberta(null);
    toast.success("Ficha guardada nesta viagem (demonstração).");
  }

  const docFicha = docs.find((d) => d.id === fichaAberta) ?? null;
  const docWallet = docs.find((d) => d.id === walletAberta) ?? null;

  function Cartao({ d }: { d: DocumentoViagem }) {
    const Icone = iconePorTipo[d.tipo];
    return (
      <li className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            {d.estadoAnalise === "a_analisar" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Icone className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{d.nome}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {d.estadoAnalise === "a_analisar"
                ? "A processar o documento…"
                : d.estadoAnalise === "erro"
                  ? (d.notaAnalise ?? "Ficheiro guardado, sem dados lidos.")
                  : [d.ficha.fornecedor, d.ficha.referencia].filter(Boolean).join(" · ") ||
                    "Guardado nesta viagem"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> {formatarDataHora(d.ficha.dataHora)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                {etiquetaTipo(d.tipo)}
              </span>
              {d.estadoAnalise === "a_analisar" ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                  A analisar
                </span>
              ) : null}
              {d.estadoAnalise === "concluida" ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  Guardado
                </span>
              ) : null}
              {d.ficha.tipoDocumento ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                  {d.ficha.tipoDocumento}
                </span>
              ) : null}
              {d.wallet === "ligado" ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  Carteira preparada
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <Button
            size="sm"
            variant="outline"
            disabled={d.estadoAnalise === "a_analisar"}
            onClick={() => setFichaAberta(d.id)}
          >
            <Pencil className="size-4" /> Ver detalhes
          </Button>
          {d.estadoAnalise === "erro" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const entrada = entradas.current.get(d.id) ?? { nome: d.nome };
                void correrAnalise(d.id, entrada);
              }}
            >
              <Sparkles className="size-4" /> Tentar ler de novo
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={d.estadoAnalise === "a_analisar"}
              onClick={() => setWalletAberta(d.id)}
            >
              <Wallet className="size-4" /> Adicionar à Wallet
            </Button>
          )}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Destacar
            <Switch
              checked={d.destacar}
              onCheckedChange={(v) => atualizar(d.id, (x) => ({ ...x, destacar: v }))}
              aria-label={`Destacar ${d.nome}`}
            />
          </label>
        </div>

      </li>
    );
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
          Carregue um ficheiro e a leitura automática tenta preencher tipo, fornecedor, passageiro,
          local, referência, data/hora e código. Depois é só confirmar na ficha — tudo fica ligado a
          esta viagem.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h2 className="font-display text-lg font-semibold">Férias em Barcelona</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" /> Barcelona, Espanha
            </p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-4" /> 5 dias
            </p>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Link2 className="size-4 text-primary" />
            {docs.length} documento(s) associados a esta viagem
          </p>

          <input
            ref={inputFicheiro}
            type="file"
            aria-label="Escolher ficheiro PDF ou imagem para juntar à viagem"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void aoEscolherFicheiro(f);
              e.target.value = "";
            }}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => inputFicheiro.current?.click()}>
              <Upload className="size-4" /> Carregar ficheiro
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                novoDocumento("Código QR digitalizado", "qr", "bilhetes", {
                  texto: "QR: TP1042 CALDAS/DIOGO LIS BCN 07:45",
                })
              }
            >
              <QrCode className="size-4" /> Digitalizar código QR
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                novoDocumento("Reserva recebida por email", "email", "vouchers", {
                  texto:
                    "De: reservas@hotelgotic.es — Reserva HG-90441 confirmada para Diogo Caldas, check-in às 15:00 em Barcelona.",
                })
              }
            >
              <Mail className="size-4" /> Registar documento por email
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDocs([])}>
              Ver estados vazios
            </Button>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> A leitura automática nunca substitui a
            sua confirmação: todos os campos ficam editáveis.
          </p>
        </div>

        <div className="mt-6">
          <OfflineCard
            documentos={docs}
            viagem={{ titulo: "Férias em Barcelona", periodo: "5 dias · Barcelona, Espanha" }}
          />
        </div>



        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
                <Star className="size-5 text-primary" /> Para usar em breve
              </h2>
              <p className="text-sm text-muted-foreground">
                Documentos destacados, ordenados pela data e hora mais próximas.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/avisos">Ver próximos avisos</Link>
            </Button>
          </div>
          <div className="mt-4">
            {emBreve.length === 0 ? (
              <EmptyState
                icon={Star}
                titulo="Nada para usar já"
                descricao="Ative o botão “Destacar” num documento com data e hora para o ver aqui primeiro."
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {emBreve.map((d) => (
                  <Cartao key={d.id} d={d} />
                ))}
              </ul>
            )}
          </div>
        </section>

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
                  <Button size="sm" variant="outline" onClick={() => inputFicheiro.current?.click()}>
                    <Upload className="size-4" /> Adicionar
                  </Button>
                </div>

                <div className="mt-4">
                  {lista.length === 0 ? (
                    <EmptyState
                      icon={s.icone}
                      titulo={`Sem ${s.titulo.toLowerCase()}`}
                      descricao={s.vazio}
                    >
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button size="sm" onClick={() => inputFicheiro.current?.click()}>
                          <Upload className="size-4" /> Carregar ficheiro
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            novoDocumento("Código QR digitalizado", "qr", s.chave, {
                              texto: "QR: voucher para 2 pessoas",
                            })
                          }
                        >
                          <QrCode className="size-4" /> Adicionar QR
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            novoDocumento("Documento recebido por email", "email", s.chave, {
                              texto: "Documento reencaminhado para a viagem.",
                            })
                          }
                        >
                          <Mail className="size-4" /> Recebido por email
                        </Button>
                      </div>
                    </EmptyState>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {lista.map((d) => (
                        <Cartao key={d.id} d={d} />
                      ))}
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

      <DocumentoFicha
        documento={docFicha}
        aberto={docFicha !== null}
        onFechar={() => setFichaAberta(null)}
        onGuardar={guardarFicha}
      />
      <WalletDialog
        documento={docWallet}
        aberto={docWallet !== null}
        onFechar={() => setWalletAberta(null)}
        onLigar={(id) => {
          atualizar(id, (d) => ({ ...d, wallet: "ligado" }));
          toast.success(
            "Ligação preparada. O passe real fica disponível quando a Apple/Google Wallet estiver configurada.",
          );
        }}
      />
    </AppShell>
  );
}
