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
import { analisarDocumento } from "@/lib/documentos-ia.functions";
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

    if (!userId) {
      return;
    }

    const userIdSeguro: string = userId;
    let cancelado = false;

    async function detetarNovosEmails() {
      if (deteccoesGmailEmCurso.has(userIdSeguro)) {
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
              .eq("user_id", userIdSeguro)
              .maybeSingle();

          if (erroPreferencia || cancelado) {
            if (erroPreferencia) {
              console.error(
                "Erro ao verificar preferência de análise automática:",
                erroPreferencia,
              );
            }
            return;
          }

          const preferenciaTipada = preferencia as
            | {
                consentimento_analise_automatica?: boolean;
                ultima_analise_gmail_em?: string | null;
              }
            | null;

          if (
            preferenciaTipada?.consentimento_analise_automatica !== true
          ) {
            return;
          }

          const estado = await verificarGmail();

          if (cancelado || estado?.ligado !== true) {
            return;
          }

          const ultimaAnalise =
            preferenciaTipada.ultima_analise_gmail_em ?? null;

          /*
           * Na primeira execução automática analisamos apenas os últimos
           * 7 dias.
           *
           * Nas seguintes usamos o instante da última verificação e a função
           * Gmail faz uma pequena margem de segurança de 60 segundos.
           */
          const desde = ultimaAnalise
            ? ultimaAnalise
            : new Date(
                Date.now() - 7 * 24 * 60 * 60 * 1000,
              ).toISOString();

          /*
           * A deteção automática usa um limite pequeno.
           * Não precisamos de voltar a descarregar centenas de mensagens
           * a cada minuto.
           */
          const emails = await procurarEmails({
            data: {
              desde,
              limite: 50,
            },
          });

          if (cancelado) {
            return;
          }

          if (emails.length === 0) {
            await supabase
              .from("preferencias_importacao" as any)
              .update({
                ultima_analise_gmail_em: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userIdSeguro);

            return;
          }

          const ids = emails.map((email) => email.id);

          const { data: processados, error: erroProcessados } =
            await supabase
              .from("emails_gmail_processados" as any)
              .select("gmail_message_id")
              .eq("user_id", userIdSeguro)
              .in("gmail_message_id", ids);

          if (erroProcessados || cancelado) {
            if (erroProcessados) {
              console.error(
                "Erro ao verificar emails Gmail já processados:",
                erroProcessados,
              );
            }
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
          const novasDescobertasAssuntos: string[] = [];
          const TAMANHO_LOTE = 3;

          for (
            let inicio = 0;
            inicio < novosEmails.length;
            inicio += TAMANHO_LOTE
          ) {
            if (cancelado) {
              return;
            }

            const lote = novosEmails.slice(
              inicio,
              inicio + TAMANHO_LOTE,
            );

            await Promise.all(
              lote.map(async (email) => {
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

                  const resultadoTipado =
                    resultado && typeof resultado === "object"
                      ? (resultado as {
                          relevante?: boolean;
                          porIa?: boolean;
                        })
                      : null;

                  /*
                   * Se a IA não conseguiu responder, não marcamos o email
                   * como processado. Assim uma falha transitória pode ser
                   * tentada novamente na próxima ronda.
                   */
                  if (resultadoTipado?.porIa !== true) {
                    return;
                  }

                  const relevante =
                    resultadoTipado.relevante === true;

                  if (relevante) {
                    descobertas += 1;

                    if (email.assunto?.trim()) {
                      novasDescobertasAssuntos.push(
                        email.assunto.trim(),
                      );
                    }
                  }

                  const { error: erroGuardar } = await supabase
                    .from("emails_gmail_processados" as any)
                    .upsert(
                      {
                        user_id: userIdSeguro,
                        gmail_message_id: email.id,
                        relevante,
                        categoria: valorFicha(ficha, "categoria"),
                        referencia: valorFicha(ficha, "referencia"),
                        assunto: email.assunto || null,
                        ficha: ficha ?? null,
                        estado: relevante
                          ? "pendente"
                          : "processado",
                        analisado_em: new Date().toISOString(),
                      },
                      {
                        onConflict:
                          "user_id,gmail_message_id",
                      },
                    );

                  if (erroGuardar) {
                    console.error(
                      "Erro ao guardar email Gmail processado:",
                      erroGuardar,
                    );
                  }
                } catch (erro) {
                  console.error(
                    "Erro na deteção automática de email Gmail:",
                    erro,
                  );
                }
              }),
            );
          }

          if (cancelado) {
            return;
          }

          const agora = new Date().toISOString();

          await supabase
            .from("preferencias_importacao" as any)
            .update({
              ultima_analise_gmail_em: agora,
              updated_at: agora,
            })
            .eq("user_id", userIdSeguro);

          if (descobertas > 0 && !cancelado) {
            const assunto =
              novasDescobertasAssuntos[0] ?? null;

            toast.info(
              assunto
                ? `Encontrámos um novo email de viagem: ${assunto}`
                : "Encontrámos uma nova informação de viagem no Gmail.",
              {
                description:
                  descobertas === 1
                    ? "Quer rever e adicionar esta informação à sua viagem?"
                    : `Encontrámos ${descobertas} novas informações de viagem. Quer revê-las e adicioná-las às suas viagens?`,
                action: {
                  label: "Ver",
                  onClick: () => {
                    void navigate({
                      to: "/importar",
                    });
                  },
                },
              },
            );
          }
        } catch (erro) {
          console.error(
            "Erro na deteção automática do Gmail:",
            erro,
          );
        }
      })();

      deteccoesGmailEmCurso.set(userIdSeguro, tarefa);

      try {
        await tarefa;
      } finally {
        if (
          deteccoesGmailEmCurso.get(userIdSeguro) === tarefa
        ) {
          deteccoesGmailEmCurso.delete(userIdSeguro);
        }
      }
    }

    /*
     * A primeira verificação acontece logo ao entrar na aplicação.
     * Depois repetimos a verificação periodicamente.
     */
    void detetarNovosEmails();

    const intervalo = window.setInterval(() => {
      void detetarNovosEmails();
    }, 60_000);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
    };
  }, [
    session?.user.id,
    analisar,
    procurarEmails,
    verificarGmail,
    navigate,
  ]);

  function abrirPesquisa(e: React.MouseEvent) {
    e.preventDefault();

    const guardada = sessionStorage.getItem(
      "viatorbis-ultima-pesquisa",
    );

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
          duracaoMinima:
            Number(ultima.duracaoMinima ?? 0) || 0,
          duracaoMaxima:
            Number(ultima.duracaoMaxima ?? 0) || 0,
          passageiros: ultima.passageiros ?? 1,
          maxEscalas:
            ultima.maxEscalas ??
            (ultima.apenasDiretos ? 0 : null),
          permitirMudancaAeroporto:
            ultima.permitirMudancaAeroporto ?? false,
          apenasDiretos:
            ultima.apenasDiretos ?? false,
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
          <Link
            to="/"
            className="flex items-center gap-2"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Plane className="size-5" />
            </span>

            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">
              ViatOrbis
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {[...ligacoes, ...extras].map((l) => (
              <Button
                key={l.to}
                asChild
                variant="ghost"
                size="sm"
              >
                <Link to={l.to}>
                  <l.icon className="mr-1.5 size-4" />
                  {l.label}
                </Link>
              </Button>
            ))}

            {session ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void sair();
                }}
              >
                <LogOut className="mr-1.5 size-4" />
                Sair
              </Button>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-4">
            <SeletorIdioma />
            <InstallHint />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}