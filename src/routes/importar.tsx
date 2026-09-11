import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { LigacaoGmail } from "@/components/LigacaoGmail";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth";
import { eventosDaFicha } from "@/lib/avisos";
import { guardarAviso } from "@/lib/avisos.functions";
import {
  eventosDeICS,
  eventosDeTexto,
  fichaDoEvento,
  formatarEvento,
  type EventoEncontrado,
} from "@/lib/eventos-telemovel";
import { useIdioma } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Importar eventos de viagem — Simplesmente voo" },
      {
        name: "description",
        content:
          "Com a sua autorização, encontramos voos, hotéis e transfers no calendário ou nos emails do seu telemóvel e sugerimos adicioná-los à app.",
      },
      {
        property: "og:title",
        content: "Importar eventos de viagem — Simplesmente voo",
      },
      {
        property: "og:description",
        content:
          "Detete voos, hotéis e transfers no seu calendário e crie avisos automaticamente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Importar,
});

const rotuloCategoria: Record<string, string> = {
  voo: "Voo",
  hotel: "Alojamento",
  transfer: "Transfer",
  outro: "Outro",
};

function Importar() {
  const { t, idioma } = useIdioma();
  const { session } = useSession();

  const [autorizou, setAutorizou] = useState(false);
  const [aCarregarConsentimento, setACarregarConsentimento] = useState(true);
  const [texto, setTexto] = useState("");
  const [eventos, setEventos] = useState<EventoEncontrado[] | null>(null);
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function carregarConsentimento() {
      const userId = session?.user.id;

      if (!userId) {
        if (!cancelado) {
          setACarregarConsentimento(false);
        }
        return;
      }

      setACarregarConsentimento(true);

      const chaveLocal = `simplesmentevoo:consentimento-importacao:${userId}`;
      const valorLocal = window.localStorage.getItem(chaveLocal);

      if (!cancelado && valorLocal !== null) {
        setAutorizou(valorLocal === "true");
      }

      const { data: dados, error } = await supabase
        .from("preferencias_importacao" as any)
        .select("consentimento_analise_automatica")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelado) {
        return;
      }

      if (error) {
        console.error("Erro ao carregar consentimento de importação:", error);
        // Se já existir uma escolha local, mantemo-la mesmo que o Supabase
        // esteja temporariamente indisponível.
        if (valorLocal === null) {
          setAutorizou(false);
        }
      } else {
        const data = dados as
          | { consentimento_analise_automatica?: boolean }
          | null;
        const valorSupabase = data?.consentimento_analise_automatica === true;

        // O estado guardado localmente é usado como cópia imediata da escolha
        // do utilizador. Se não existir, usamos o valor da conta no Supabase.
        if (valorLocal === null) {
          setAutorizou(valorSupabase);
          window.localStorage.setItem(chaveLocal, String(valorSupabase));
        }
      }

      setACarregarConsentimento(false);
    }

    void carregarConsentimento();

    return () => {
      cancelado = true;
    };
  }, [session?.user.id]);

  async function alterarConsentimento(valor: boolean) {
    if (!session?.user.id) {
      setAutorizou(valor);
      return;
    }

    const estadoAnterior = autorizou;
    const chaveLocal = `simplesmentevoo:consentimento-importacao:${session.user.id}`;

    setAutorizou(valor);
    window.localStorage.setItem(chaveLocal, String(valor));

    const { error } = await supabase
      .from("preferencias_importacao" as any)
      .upsert(
        {
          user_id: session.user.id,
          consentimento_analise_automatica: valor,
          consentimento_analise_automatica_em: valor
            ? new Date().toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        },
      );

    if (error) {
      console.error("Erro ao guardar consentimento de importação:", error);
      // A escolha local continua disponível nesta sessão/navegador.
      // Mantemos também o estado visual para não fazer desaparecer uma
      // autorização que o utilizador acabou de dar.
      setAutorizou(valor);
      toast.error(
        "A autorização ficou guardada neste dispositivo, mas não foi possível sincronizá-la com a conta."
      );
      return;
    }

    toast.success(
      valor
        ? "Autorização guardada."
        : "Autorização para análise automática desativada.",
    );
  }

  function receber(encontrados: EventoEncontrado[]) {
    setEventos(encontrados);
    setSelecionados(
      Object.fromEntries(encontrados.map((evento) => [evento.id, true])),
    );

    if (encontrados.length === 0) {
      toast.info(t("importar.nenhum"));
    }
  }

  async function aoEscolherFicheiro(ficheiro: File) {
    try {
      receber(eventosDeICS(await ficheiro.text()));
    } catch {
      toast.error("Não conseguimos ler este ficheiro de calendário.");
    }
  }

  async function adicionar() {
    const escolhidos = (eventos ?? []).filter(
      (evento) => selecionados[evento.id],
    );

    if (escolhidos.length === 0) {
      return;
    }

    if (!session) {
      toast.info("Entre na sua conta para guardar estes avisos.");
      return;
    }

    setAGuardar(true);
    let criados = 0;

    try {
      for (const evento of escolhidos) {
        for (const derivado of eventosDaFicha(
          fichaDoEvento(evento),
          evento.titulo,
        )) {
          await guardarAviso({
            data: {
              tipo: derivado.tipo,
              titulo: derivado.titulo,
              local: derivado.local,
              quando: derivado.quando,
              antecipacaoMin: derivado.antecipacaoMin,
              ativo: true,
              origem:
                evento.origem === "calendario" ? "calendário" : "texto",
            },
          });

          criados += 1;
        }
      }

      toast.success(
        `${criados} aviso(s) criado(s) a partir dos eventos escolhidos.`,
      );
    } catch (erro) {
      toast.error(
        erro instanceof Error
          ? erro.message
          : "Não foi possível guardar os avisos.",
      );
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("importar.titulo")}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {t("importar.intro")}
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 size-5 text-primary"
              aria-hidden
            />

            <div className="flex-1">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consentimento-importar"
                  checked={autorizou}
                  disabled={aCarregarConsentimento}
                  onCheckedChange={(valor) => {
                    void alterarConsentimento(valor === true);
                  }}
                  className="mt-0.5"
                />

                <Label
                  htmlFor="consentimento-importar"
                  className="text-sm font-normal leading-snug"
                >
                  {t("importar.consentimento")}
                </Label>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {t("importar.privacidade")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <CalendarClock
              className="size-5 text-primary"
              aria-hidden
            />

            <h2 className="mt-3 font-display text-base font-semibold">
              Calendário do telemóvel
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              No iPhone ou Android, exporte/partilhe o evento ou o calendário
              em ficheiro .ics e escolha-o aqui. Nada sai do seu dispositivo
              nesta fase.
            </p>

            <Button
              asChild
              className="mt-4 h-11 w-full"
              disabled={!autorizou || aCarregarConsentimento}
            >
              <label>
                <Upload className="size-4" />
                {t("importar.escolher")}

                <input
                  type="file"
                  accept=".ics,text/calendar"
                  className="sr-only"
                  disabled={!autorizou || aCarregarConsentimento}
                  onChange={(e) => {
                    const ficheiro = e.target.files?.[0];

                    if (ficheiro) {
                      void aoEscolherFicheiro(ficheiro);
                    }

                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-base font-semibold">
              Email ou outra app
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              {t("importar.colar")}
            </p>

            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={!autorizou || aCarregarConsentimento}
              rows={4}
              className="mt-3"
              aria-label={t("importar.colar")}
            />

            <Button
              variant="outline"
              className="mt-3 h-11 w-full"
              disabled={
                !autorizou ||
                aCarregarConsentimento ||
                !texto.trim()
              }
              onClick={() => receber(eventosDeTexto(texto))}
            >
              {t("importar.analisar")}
            </Button>
          </div>
        </div>

        <LigacaoGmail />

        {eventos ? (
          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold">
              {t("importar.encontrados")} ({eventos.length})
            </h2>

            {eventos.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("importar.nenhum")}
              </p>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {eventos.map((evento) => (
                    <li
                      key={evento.id}
                      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
                    >
                      <Checkbox
                        id={`ev-${evento.id}`}
                        checked={Boolean(selecionados[evento.id])}
                        onCheckedChange={(valor) =>
                          setSelecionados((estado) => ({
                            ...estado,
                            [evento.id]: valor === true,
                          }))
                        }
                        className="mt-1"
                      />

                      <Label
                        htmlFor={`ev-${evento.id}`}
                        className="flex-1 font-normal"
                      >
                        <span className="block text-sm font-medium">
                          {evento.titulo}
                        </span>

                        <span className="mt-1 block text-xs text-muted-foreground">
                          {rotuloCategoria[evento.categoria]} ·{" "}
                          {formatarEvento(evento.inicio, idioma)}
                          {evento.local ? ` · ${evento.local}` : ""}
                          {evento.numeroVoo
                            ? ` · ${evento.numeroVoo}`
                            : ""}
                        </span>
                      </Label>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-4 h-11 w-full sm:w-auto"
                  onClick={() => void adicionar()}
                  disabled={aGuardar}
                >
                  <CheckCircle2 className="size-4" />

                  {aGuardar
                    ? "A guardar…"
                    : t("importar.adicionar")}
                </Button>

                {!session ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Entre na sua conta para guardar estes avisos na app.
                  </p>
                ) : null}
              </>
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}