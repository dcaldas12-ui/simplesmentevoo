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
const ultimaDeteccaoGmailEm = new Map<string, number>();
const GMAIL_AUTOMACAO_EVENT = "viatorbis:gmail-auto-change";
const GMAIL_AUTOMACAO_MIN_INTERVALO_MS = 2 * 60 * 1000;
const GMAIL_AUTOMACAO_INTERVALO_MS = 5 * 60 * 1000;
const GMAIL_AUTOMACAO_LIMITE = 3;

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

function erroEhQuotaGmail(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro ?? "");
  const normalizada = mensagem.toLowerCase();

  return (
    normalizada.includes("http 403") ||
    normalizada.includes("http 429") ||
    normalizada.includes("total_query_cost") ||
    normalizada.includes("rate_limit_exceeded") ||
    normalizada.includes("ratelimitexceeded") ||
    normalizada.includes("quota exceeded")
  );
}

type ViagemParaPesquisaGmail = {
  id: string;
  titulo: string;
  origem: string | null;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  numero_passageiros: number | null;
  passageiros: unknown;
};

type ViagemParaIa = {
  titulo: string;
  origem: string;
  destino: string;
  dataInicio: string;
  dataFim: string;
  numeroPassageiros: number | null;
  passageiros: Array<{
    nome: string;
    apelido: string;
  }>;
};

function deslocarDataIso(
  data: string,
  dias: number,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data;
  }

  const valor = new Date(`${data}T00:00:00Z`);

  if (Number.isNaN(valor.getTime())) {
    return data;
  }

  valor.setUTCDate(valor.getUTCDate() + dias);

  return valor.toISOString().slice(0, 10);
}

function viagensParaPesquisaEIA(
  viagens: ViagemParaPesquisaGmail[],
): {
  intervalos: Array<{ inicio: string; fim: string }>;
  viagensParaIa: ViagemParaIa[];
} {
  const intervalos: Array<{ inicio: string; fim: string }> = [];
  const viagensParaIa: ViagemParaIa[] = [];

  for (const viagem of viagens) {
    const titulo = viagem.titulo?.trim();
    const origem = viagem.origem?.trim();
    const destino = viagem.destino?.trim();
    const dataInicio = viagem.data_inicio?.trim();
    const dataFim = viagem.data_fim?.trim();

    if (
      !titulo ||
      !origem ||
      !destino ||
      !dataInicio ||
      !dataFim ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)
    ) {
      continue;
    }

    if (dataFim < dataInicio) {
      continue;
    }

    intervalos.push({
      inicio: deslocarDataIso(dataInicio, -2),
      fim: deslocarDataIso(dataFim, 2),
    });

    const passageiros = Array.isArray(viagem.passageiros)
      ? viagem.passageiros
          .slice(0, 20)
          .map((passageiro) => {
            if (!passageiro || typeof passageiro !== "object") {
              return null;
            }

            const item = passageiro as Record<string, unknown>;
            const nome =
              typeof item["nome"] === "string"
                ? item["nome"].trim()
                : "";
            const apelido =
              typeof item["apelido"] === "string"
                ? item["apelido"].trim()
                : "";

            if (!nome && !apelido) {
              return null;
            }

            return {
              nome,
              apelido,
            };
          })
          .filter(
            (
              passageiro,
            ): passageiro is {
              nome: string;
              apelido: string;
            } => passageiro !== null,
          )
      : [];

    viagensParaIa.push({
      titulo,
      origem,
      destino,
      dataInicio,
      dataFim,
      numeroPassageiros:
        typeof viagem.numero_passageiros === "number" &&
        Number.isFinite(viagem.numero_passageiros) &&
        viagem.numero_passageiros >= 1
          ? Math.floor(viagem.numero_passageiros)
          : null,
      passageiros,
    });
  }

  return {
    intervalos,
    viagensParaIa,
  };
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

      const agoraTimestamp = Date.now();
      const ultimaExecucao = ultimaDeteccaoGmailEm.get(userIdSeguro) ?? 0;

      if (
        agoraTimestamp - ultimaExecucao < GMAIL_AUTOMACAO_MIN_INTERVALO_MS
      ) {
        return;
      }

      ultimaDeteccaoGmailEm.set(userIdSeguro, agoraTimestamp);

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
           * A deteção automática usa as viagens existentes como filtro de
           * pesquisa no Gmail. Cada viagem é pesquisada com uma margem de
           * dois dias antes e depois das respetivas datas.
           *
           * O mesmo contexto é enviado à IA para que a decisão final tenha em
           * conta as datas, a origem, o destino e os passageiros da viagem.
           *
           * `ultima_analise_gmail_em` continua a servir apenas como marca
           * temporal da última ronda concluída; não é usado como fronteira da
           * pesquisa Gmail.
           */
          const { data: viagens, error: erroViagens } = await supabase
            .from("viagens")
            .select(
              "id, titulo, origem, destino, data_inicio, data_fim, numero_passageiros, passageiros",
            )
            .eq("user_id", userIdSeguro)
            .order("data_inicio", {
              ascending: true,
              nullsFirst: false,
            });

          if (erroViagens || cancelado) {
            if (erroViagens) {
              console.error(
                "Erro ao carregar viagens para a deteção automática do Gmail:",
                erroViagens,
              );
            }

            return;
          }

          const {
            intervalos,
            viagensParaIa,
          } = viagensParaPesquisaEIA(
            (viagens ?? []) as unknown as ViagemParaPesquisaGmail[],
          );

          if (intervalos.length === 0) {
            console.info(
              "Gmail: deteção automática sem viagens válidas para pesquisar",
            );

            return;
          }

          const emails = await procurarEmails({
            data: {
              desde: ultimaAnalise,
              limite: GMAIL_AUTOMACAO_LIMITE,
              automatico: true,
              modo: "viagens",
              intervalos,
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
              ultimaAnalise,
              intervalos: intervalos.length,
            });

            return;
          }

          const ids = emails.map((email) => email.id);

          console.info("Gmail: deteção automática encontrou candidatos", {
            quantidade: emails.length,
            ultimaAnalise,
            intervalos: intervalos.length,
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
              ultimaAnalise,
              intervalos: intervalos.length,
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
                  anexos: email.anexos,
                  modoAnalise: "viagens",
                  viagens: viagensParaIa,
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
          if (erroEhQuotaGmail(erro)) {
            console.warn(
              "Gmail: deteção automática adiada por limite de utilização.",
              erro,
            );
          } else {
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
    }, GMAIL_AUTOMACAO_INTERVALO_MS);

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
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">
                  Entrar
                </Link>
              </Button>
            )}
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