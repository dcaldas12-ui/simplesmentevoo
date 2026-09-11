import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BellRing,
  CircleHelp,
  CalendarPlus,
  LogOut,
  Luggage,
  Plane,
  Search,
  UserCog,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import { InstallHint } from "@/components/InstallHint";
import { SeletorIdioma } from "@/components/SeletorIdioma";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import {
  analisarDocumento,
} from "@/lib/documentos-ia.functions";
import {
  emailsDeViagem,
  estadoGmail,
} from "@/lib/gmail.functions";
import { useIdioma } from "@/lib/i18n";

const deteccoesGmailEmCurso = new Map<string, Promise<void>>();

function valorFicha(
  ficha: unknown,
  campo: string,
): string | null {
  if (!ficha || typeof ficha !== "object") {
    return null;
  }

  const valor = (ficha as Record<string, unknown>)[campo];

  if (typeof valor === "string" && valor.trim()) {
    return valor.trim();
  }

  if (typeof valor === "number") {
    return String(valor);
  }

  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { t } = useIdioma();
  const navigate = useNavigate();

  const verificarGmail = useServerFn(estadoGmail);
  const procurarEmails = useServerFn(emailsDeViagem);
  const analisar = useServerFn(analisarDocumento);

  useEffect(() => {
    const userId = session?.user.id;

    if (!userId || deteccoesGmailEmCurso.has(userId)) {
      return;
    }

    const tarefa = (async () => {
      try {
        const { data: preferencia, error: erroPreferencia } =
          await supabase
            .from("preferencias_importacao" as any)
            .select(
              "consentimento_analise_automatica, ultima_analise_gmail_em",
            )
            .eq("user_id", userId)
            .maybeSingle();

        if (erroPreferencia) {
          return;
        }

        const preferenciaTipada = preferencia as
          | {
              consentimento_analise_automatica?: boolean;
              ultima_analise_gmail_em?: string | null;
            }
          | null;

        if (preferenciaTipada?.consentimento_analise_automatica !== true) {
          return;
        }

        const estado = await verificarGmail();

        if (estado?.ligado !== true) {
          return;
        }

        const ultimaAnalise =
          preferenciaTipada.ultima_analise_gmail_em ?? null;

        /*
         * Na primeira execução automática não voltamos a analisar um ano
         * inteiro de histórico. A pesquisa manual continua disponível para
         * esse efeito. A partir daqui, cada execução procura desde a última
         * análise automática.
         */
        const desde = ultimaAnalise
          ? ultimaAnalise
          : new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000,
            ).toISOString();

        const emails = await procurarEmails({
          data: { desde },
        });

        if (emails.length === 0) {
          await supabase
            .from("preferencias_importacao" as any)
            .update({
              ultima_analise_gmail_em: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);

          return;
        }

        const ids = emails.map((email) => email.id);

        const { data: processados, error: erroProcessados } =
          await supabase
            .from("emails_gmail_processados" as any)
            .select("gmail_message_id")
            .eq("user_id", userId)
            .in("gmail_message_id", ids);

        if (erroProcessados) {
          return;
        }

        const idsJaProcessados = new Set(
  ((processados ?? []) as unknown as Array<{
    gmail_message_id: string;
  }>).map((item) => item.gmail_message_id),
);

        const novosEmails = emails.filter(
          (email) => !idsJaProcessados.has(email.id),
        );

        let descobertas = 0;

        for (const email of novosEmails) {
          try {
            const resultado = await analisar({
              data: {
                nome: email.assunto || "Email Gmail",
                texto: `${email.assunto}\n\n${email.texto}`.trim(),
              },
            });

            const ficha =
              resultado && typeof resultado === "object"
                ? (resultado as { ficha?: unknown }).ficha
                : null;

            const relevante =
              resultado &&
              typeof resultado === "object" &&
              (resultado as { relevante?: boolean }).relevante === true;

            if (relevante) {
              descobertas += 1;
            }

            await supabase
              .from("emails_gmail_processados" as any)
              .upsert(
                {
                  user_id: userId,
                  gmail_message_id: email.id,
                  relevante,
                  categoria: valorFicha(ficha, "categoria"),
                  referencia: valorFicha(ficha, "referencia"),
                  assunto: email.assunto || null,
                  ficha: ficha ?? null,
                  estado: relevante ? "pendente" : "processado",
                  analisado_em: new Date().toISOString(),
                },
                {
                  onConflict: "user_id,gmail_message_id",
                },
              );
          } catch (erro) {
            console.error(
              "Erro na deteção automática de email Gmail:",
              erro,
            );
          }
        }

        await supabase
          .from("preferencias_importacao" as any)
          .update({
            ultima_analise_gmail_em: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (descobertas > 0) {
          toast.info(
            descobertas === 1
              ? "Encontrámos uma nova informação de viagem no Gmail."
              : `Encontrámos ${descobertas} novas informações de viagem no Gmail.`,
          );
        }
      } catch (erro) {
        console.error("Erro na deteção automática do Gmail:", erro);
      }
    })();

    deteccoesGmailEmCurso.set(userId, tarefa);

    void tarefa.finally(() => {
      if (deteccoesGmailEmCurso.get(userId) === tarefa) {
        deteccoesGmailEmCurso.delete(userId);
      }
    });
  }, [session?.user.id]);

  function abrirPesquisa(e: React.MouseEvent) {
    e.preventDefault();

    const guardada = sessionStorage.getItem("viatorbis-ultima-pesquisa");

    if (!guardada) {
      void navigate({
        to: "/pesquisa",
        search: {
          origem: "LIS",
          destino: "BCN",
          dataPartida: "",
          dataRegresso: "",
          idaAntes: 0,
          idaDepois: 0,
          regressoAntes: 0,
          regressoDepois: 0,
          duracaoMinima: 0,
          duracaoMaxima: 0,
          passageiros: 1,
          maxEscalas: null,
          permitirMudancaAeroporto: false,
          apenasDiretos: false,
          executar: 0,
        },
      });
      return;
    }

    try {
      const ultima = JSON.parse(guardada) as {
        origem?: string;
        destino?: string;
        dataPartida?: string;
        dataRegresso?: string;
        idaAntes?: number;
        idaDepois?: number;
        regressoAntes?: number;
        regressoDepois?: number;
        duracaoMinima?: number | "";
        duracaoMaxima?: number | "";
        passageiros?: number;
        maxEscalas?: number | null;
        permitirMudancaAeroporto?: boolean;
        apenasDiretos?: boolean;
      };

      if (!ultima.origem || !ultima.destino) {
        void navigate({
          to: "/pesquisa",
          search: {
            origem: "LIS",
            destino: "BCN",
            dataPartida: "",
            dataRegresso: "",
            idaAntes: 0,
            idaDepois: 0,
            regressoAntes: 0,
            regressoDepois: 0,
            duracaoMinima: 0,
            duracaoMaxima: 0,
            passageiros: 1,
            maxEscalas: null,
            permitirMudancaAeroporto: false,
            apenasDiretos: false,
            executar: 0,
          },
        });
        return;
      }

      void navigate({
        to: "/pesquisa",
        search: {
          origem: ultima.origem,
          destino: ultima.destino,
          dataPartida: ultima.dataPartida ?? "",
          dataRegresso: ultima.dataRegresso ?? "",
          idaAntes: ultima.idaAntes ?? 0,
          idaDepois: ultima.idaDepois ?? 0,
          regressoAntes: ultima.regressoAntes ?? 0,
          regressoDepois: ultima.regressoDepois ?? 0,
          duracaoMinima: Number(ultima.duracaoMinima ?? 0) || 0,
          duracaoMaxima: Number(ultima.duracaoMaxima ?? 0) || 0,
          passageiros: ultima.passageiros ?? 1,
          maxEscalas:
            ultima.maxEscalas ??
            (ultima.apenasDiretos ? 0 : null),
          permitirMudancaAeroporto:
            ultima.permitirMudancaAeroporto ?? false,
          apenasDiretos: ultima.apenasDiretos ?? false,
          executar: 0,
        },
      });
    } catch {
      void navigate({
        to: "/pesquisa",
        search: {
          origem: "LIS",
          destino: "BCN",
          dataPartida: "",
          dataRegresso: "",
          idaAntes: 0,
          idaDepois: 0,
          regressoAntes: 0,
          regressoDepois: 0,
          duracaoMinima: 0,
          duracaoMaxima: 0,
          passageiros: 1,
          maxEscalas: null,
          permitirMudancaAeroporto: false,
          apenasDiretos: false,
          executar: 0,
        },
      });
    }
  }

  async function sair() {
    await supabase.auth.signOut();
    void navigate({ to: "/" });
  }

  const ligacoes = [
    {
      to: "/pesquisa" as const,
      icon: Search,
      label: t("nav.pesquisar"),
    },
    {
      to: "/viagens" as const,
      icon: Luggage,
      label: t("nav.viagens"),
    },
    {
      to: "/importar" as const,
      icon: CalendarPlus,
      label: t("nav.importar"),
    },
    {
      to: "/avisos" as const,
      icon: BellRing,
      label: t("nav.avisos"),
    },
  ];

  const extras = [
    ...(session
      ? [
          {
            to: "/conta" as const,
            icon: UserCog,
            label: "Conta",
          },
        ]
      : []),
    {
      to: "/ajuda" as const,
      icon: CircleHelp,
      label: t("nav.ajuda"),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Plane className="size-5" />
            </span>

            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">
              ViatOrbis
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {[...ligacoes, ...extras].map((l) => (
              <Button key={l.to} asChild variant="ghost" size="sm">
                {"search" in l && l.search ? (
                  <Link to={l.to} search={l.search}>
                    <l.icon className="size-4" /> {l.label}
                  </Link>
                ) : (
                  <Link
                    to={l.to}
                    onClick={
                      l.to === "/pesquisa" ? abrirPesquisa : undefined
                    }
                  >
                    <l.icon className="size-4" /> {l.label}
                  </Link>
                )}
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <SeletorIdioma />

            {session ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void sair()}
                className="h-10 md:h-9"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">
                  {t("nav.sair")}
                </span>
              </Button>
            ) : (
              <Button asChild size="sm" className="h-10 md:h-9">
                <Link to="/auth">{t("nav.entrar")}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      <footer className="hidden border-t border-border/70 py-6 text-center text-sm text-muted-foreground md:block">
        <p>{t("rodape.slogan")}</p>

        <p className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link to="/ajuda" className="underline underline-offset-4">
            {t("rodape.ajuda")}
          </Link>

          <Link
            to="/privacidade"
            className="underline underline-offset-4"
          >
            {t("rodape.privacidade")}
          </Link>

          <Link to="/termos" className="underline underline-offset-4">
            {t("rodape.termos")}
          </Link>
        </p>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto flex w-full max-w-lg items-stretch">
          {ligacoes.map((l) => (
            <li key={l.to} className="flex-1">
              {"search" in l && l.search ? (
                <Link
                  to={l.to}
                  search={l.search}
                  activeProps={{ className: "text-primary" }}
                  className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
                >
                  <l.icon className="size-5" />
                  {l.label}
                </Link>
              ) : (
                <Link
                  to={l.to}
                  onClick={
                    l.to === "/pesquisa" ? abrirPesquisa : undefined
                  }
                  activeProps={{ className: "text-primary" }}
                  className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
                >
                  <l.icon className="size-5" />
                  {l.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <InstallHint />
    </div>
  );
}
