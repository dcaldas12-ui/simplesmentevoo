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
import { emailsDeViagem } from "@/lib/gmail.functions";
import { useIdioma } from "@/lib/i18n";

const deteccoesGmailEmCurso = new Map<string, Promise<void>>();
const GMAIL_AUTOMACAO_EVENT = "viatorbis:gmail-auto-change";

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
      if (cancelado || deteccoesGmailEmCurso.has(userIdSeguro)) {
        return;
      }

      const tarefa = (async () => {
        try {
          /*
           * A preferência é lida a cada execução, e não apenas quando o
           * AppShell é montado. Assim, ativar/desativar a deteção na página
           * do Gmail passa a ter efeito imediato sem exigir reload.
           */
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

          const ultimaAnalise =
            preferenciaTipada.ultima_analise_gmail_em ?? null;

          /*
           * A pesquisa automática usa uma janela móvel no Gmail e não depende
           * de `ultima_analise_gmail_em` como fronteira. Assim, um email que
           * chegue entre duas rondas não pode ficar perdido atrás de um
           * timestamp avançado.
           *
           * A tabela `emails_gmail_processados` faz a deduplicação.
           */
          const desde = ultimaAnalise;

          const emails = await procurarEmails({
            data: {
              desde,
              limite: 20,
              automatico: true,
            },
          });

          if (cancelado) {
            return;
          }

          const agora = new Date().toISOString();

          if (emails.length === 0) {
            await supabase
              .from("preferencias_importacao" as any)
              .update({
                ultima_analise_gmail_em: agora,
                updated_at: agora,
              })
              .eq("user_id", userIdSeguro);

            console.info("Gmail: deteção automática sem novos candidatos", {
              desde,
            });

            return;
          }

          const ids = emails.map((email) => email.id);

          console.info("Gmail: deteção automática encontrou candidatos", {
            quantidade: emails.length,
            desde,
            primeiroAssunto: emails[0]?.assunto ?? "",
          });

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

          if (novosEmails.length === 0) {
            /*
             * Os candidatos encontrados já foram tratados manual ou
             * automaticamente. Avançamos a marca temporal para não repetir
             * a mesma pesquisa a cada minuto.
             */
            await supabase
              .from("preferencias_importacao" as any)
              .update({
                ultima_analise_gmail_em: agora,
                updated_at: agora,
              })
              .eq("user_id", userIdSeguro);

            console.info("Gmail: candidatos já processados", {
              quantidade: emails.length,
              desde,
            });

            return;
          }

          toast.info(
            `Deteção Gmail: ${novosEmails.length} novo${
              novosEmails.length === 1 ? "" : "s"
            } candidato${novosEmails.length === 1 ? "" : "s"} encontrado${
              novosEmails.length === 1 ? "" : "s"
            }.`,
          );

          let descobertas = 0;
          let houveFallbackDeAnalise = false;
          let houveFalhaAoGuardar = false;
          const novasDescobertasAssuntos: string[] = [];

          /*
           * Na deteção automática analisamos um email de cada vez.
           * Evita rajadas para o gateway de IA e torna o comportamento mais
           * previsível quando há limites de utilização.
           */
          for (const email of novosEmails) {
            if (cancelado) {
              return;
            }

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
               * O modo automático deve aceitar o mesmo resultado que o modo
               * manual. Quando a IA falha (por exemplo, por limite 429), a
               * função `analisarDocumento` devolve um resultado provisório
               * calculado localmente, com `porIa: false`.
               *
               * Esse resultado continua a ser útil e deve ser guardado:
               * caso contrário, o mesmo email seria encontrado em todas as
               * rondas e nunca chegaria à tabela `emails_gmail_processados`.
               */
              if (resultadoTipado?.porIa !== true) {
                houveFallbackDeAnalise = true;
                console.warn(
                  "Gmail: Gemini indisponível; a análise automática vai usar o resultado local provisório.",
                  {
                    gmailMessageId: email.id,
                    assunto: email.assunto,
                    resultado,
                  },
                );
              }

              const relevante =
                resultadoTipado?.relevante === true;

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
                houveFalhaAoGuardar = true;
                console.error(
                  "Erro ao guardar email Gmail processado:",
                  erroGuardar,
                );
              }
            } catch (erro) {
              houveFallbackDeAnalise = true;
              console.error(
                "Erro na deteção automática de email Gmail:",
                erro,
              );
            }
          }

          if (cancelado) {
            return;
          }

          /*
           * `ultima_analise_gmail_em` regista apenas o instante da última ronda.
           * A análise provisória por fallback local também conta como tratamento
           * concluído para efeitos da ronda; a tabela `emails_gmail_processados`
           * garante que o mesmo email não volta a ser tratado indefinidamente.
           */
          if (!houveFalhaAoGuardar) {
            await supabase
              .from("preferencias_importacao" as any)
              .update({
                ultima_analise_gmail_em: agora,
                updated_at: agora,
              })
              .eq("user_id", userIdSeguro);
          }

          console.info("Gmail: deteção automática concluída", {
            candidatos: emails.length,
            novos: novosEmails.length,
            relevantes: descobertas,
            houveFallbackDeAnalise,
            houveFalhaAoGuardar,
          });

          if (novosEmails.length > 0 && descobertas === 0) {
            toast.info(
              houveFalhaAoGuardar
                ? "A deteção automática encontrou novos emails, mas não conseguiu guardar todos os resultados."
                : houveFallbackDeAnalise
                  ? `A deteção automática analisou ${novosEmails.length} novo${
                      novosEmails.length === 1 ? "" : "s"
                    } email${
                      novosEmails.length === 1 ? "" : "s"
                    } com análise local provisória porque a IA não estava disponível.`
                  : `A deteção automática analisou ${novosEmails.length} novo${
                    novosEmails.length === 1 ? "" : "s"
                  } email${
                    novosEmails.length === 1 ? "" : "s"
                  } e não encontrou uma reserva ou evento de viagem relevante.`,
            );
          }

          if (descobertas > 0) {
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

          if (!cancelado) {
            toast.error(
              erro instanceof Error
                ? `Deteção Gmail: ${erro.message}`
                : "A deteção automática do Gmail falhou.",
            );
          }
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
     * Corre imediatamente ao entrar, depois a cada minuto, quando a página
     * volta a ficar visível e também quando o botão de deteção automática
     * é ativado/desativado.
     */
    void detetarNovosEmails();

    const intervalo = window.setInterval(() => {
      void detetarNovosEmails();
    }, 60_000);

    const aoMudarDeteccao = () => {
      void detetarNovosEmails();
    };

    const aoFicarVisivel = () => {
      if (document.visibilityState === "visible") {
        void detetarNovosEmails();
      }
    };

    window.addEventListener(
      GMAIL_AUTOMACAO_EVENT,
      aoMudarDeteccao,
    );
    document.addEventListener(
      "visibilitychange",
      aoFicarVisivel,
    );

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
      window.removeEventListener(
        GMAIL_AUTOMACAO_EVENT,
        aoMudarDeteccao,
      );
      document.removeEventListener(
        "visibilitychange",
        aoFicarVisivel,
      );
    };
  }, [session?.user.id, analisar, procurarEmails, navigate]);

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