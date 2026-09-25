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
  analisarEmailsEmLote,
} from "@/lib/documentos-ia.functions";
import {
  obterLoteEmailsGmail,
  type GmailEmail,
} from "@/lib/gmail.functions";
import { useIdioma } from "@/lib/i18n";

const deteccoesGmailEmCurso = new Map<string, Promise<void>>();
const ultimaDeteccaoGmailEm = new Map<string, number>();
const GMAIL_AUTOMACAO_EVENT = "viatorbis:gmail-auto-change";
const GMAIL_AUTOMACAO_MIN_INTERVALO_MS = 2 * 60 * 1000;
const GMAIL_AUTOMACAO_INTERVALO_MS = 5 * 60 * 1000;
const GMAIL_AUTOMACAO_LIMITE = 50;

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

function viagensParaPesquisaEIA(
  viagens: ViagemParaPesquisaGmail[],
): {
  viagensParaIa: ViagemParaIa[];
} {
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
      !/^\d{4}-\d{2}-\d{2}$/.test(dataFim) ||
      dataFim < dataInicio
    ) {
      continue;
    }

    const passageiros = Array.isArray(viagem.passageiros)
      ? viagem.passageiros
          .slice(0, 20)
          .flatMap((passageiro) => {
            if (!passageiro || typeof passageiro !== "object") {
              return [];
            }

            const item = passageiro as Record<string, unknown>;
            const nome =
              typeof item["nome"] === "string" ? item["nome"].trim() : "";
            const apelido =
              typeof item["apelido"] === "string" ? item["apelido"].trim() : "";

            return nome || apelido ? [{ nome, apelido }] : [];
          })
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

  return { viagensParaIa };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { t } = useIdioma();
  const navigate = useNavigate();

  const procurarLoteGmail = useServerFn(obterLoteEmailsGmail);
  const analisarLote = useServerFn(analisarEmailsEmLote);
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

          const { viagensParaIa } = viagensParaPesquisaEIA(
            (viagens ?? []) as unknown as ViagemParaPesquisaGmail[],
          );

          const modoAnalise = viagensParaIa.length > 0 ? "viagens" : "todos";
          let pageToken: string | null = null;
          let mensagensConsultadas = 0;
          let candidatosIa = 0;
          let descobertas = 0;
          let houveFalhaAoGuardar = false;
          let houveErroDeAnalise = false;
          const novasDescobertasAssuntos: string[] = [];

          do {
            if (cancelado) {
              return;
            }

            const pagina = await procurarLoteGmail({
              data: {
                modo: modoAnalise,
                automatico: true,
                desde: ultimaAnalise,
                limite: 50,
                pageToken,
                incluirAnexos: false,
              },
            });

            mensagensConsultadas += pagina.emails.length;

            if (pagina.emails.length === 0) {
              pageToken = pagina.nextPageToken;
              continue;
            }

            const triagem = await analisarLote({
              data: {
                modoAnalise,
                viagens: modoAnalise === "viagens" ? viagensParaIa : [],
                emails: pagina.emails,
              },
            });

            const mapaTriagem = new Map(
              triagem.resultados.map((resultado) => [resultado.id, resultado]),
            );

            const candidatos = pagina.emails.filter(
              (email) => mapaTriagem.get(email.id)?.relevante === true,
            );

            candidatosIa += candidatos.length;

            const { data: processados, error: erroProcessados } = await supabase
              .from("emails_gmail_processados" as any)
              .select("gmail_message_id")
              .eq("user_id", userIdSeguro)
              .in(
                "gmail_message_id",
                pagina.emails.map((email) => email.id),
              );

            if (erroProcessados) {
              throw erroProcessados;
            }

            const idsJaProcessados = new Set(
              ((processados ?? []) as unknown as Array<{
                gmail_message_id: string;
              }>).map((item) => item.gmail_message_id),
            );

            const candidatosNovos = candidatos.filter(
              (email) => !idsJaProcessados.has(email.id),
            );

            const irrelevantesNovos = pagina.emails.filter(
              (email) =>
                !mapaTriagem.get(email.id)?.relevante &&
                !idsJaProcessados.has(email.id),
            );

            if (irrelevantesNovos.length > 0) {
              const agora = new Date().toISOString();
              const { error } = await supabase
                .from("emails_gmail_processados" as any)
                .upsert(
                  irrelevantesNovos.map((email) => ({
                    user_id: userIdSeguro,
                    gmail_message_id: email.id,
                    relevante: false,
                    categoria: null,
                    referencia: null,
                    assunto: email.assunto || null,
                    ficha: null,
                    estado: "processado",
                    analisado_em: agora,
                  })),
                  {
                    onConflict: "user_id,gmail_message_id",
                  },
                );

              if (error) {
                houveFalhaAoGuardar = true;
                console.error("Erro ao guardar emails Gmail irrelevantes:", error);
              }
            }

            if (candidatosNovos.length > 0) {
              const completos: GmailEmail[] = [];

              for (let inicio = 0; inicio < candidatosNovos.length; inicio += 5) {
                const loteIds = candidatosNovos
                  .slice(inicio, inicio + 5)
                  .map((email) => email.id);
                const respostaComAnexos = await procurarLoteGmail({
                  data: {
                    modo: modoAnalise,
                    automatico: true,
                    desde: ultimaAnalise,
                    limite: loteIds.length,
                    ids: loteIds,
                    incluirAnexos: true,
                  },
                });

                completos.push(...respostaComAnexos.emails);
              }

              const completosPorId = new Map(
                completos.map((email) => [email.id, email]),
              );

              for (const candidato of candidatosNovos) {
                if (cancelado) {
                  return;
                }

                const email = completosPorId.get(candidato.id);
                if (!email) {
                  houveErroDeAnalise = true;
                  continue;
                }

                try {
                  const resultado = await analisar({
                    data: {
                      nome: email.assunto || "Email Gmail",
                      texto: `${email.assunto}

${email.texto}`.trim(),
                      anexos: email.anexos,
                      modoAnalise,
                      viagens: modoAnalise === "viagens" ? viagensParaIa : [],
                    },
                  });

                  const ficha =
                    resultado && typeof resultado === "object"
                      ? (resultado as { ficha?: unknown }).ficha
                      : null;
                  const relevante = resultado?.relevante === true;

                  if (relevante) {
                    descobertas += 1;
                    if (email.assunto.trim()) {
                      novasDescobertasAssuntos.push(email.assunto.trim());
                    }
                  }

                  const { error } = await supabase
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
                        estado: relevante ? "pendente" : "processado",
                        analisado_em: new Date().toISOString(),
                      },
                      {
                        onConflict: "user_id,gmail_message_id",
                      },
                    );

                  if (error) {
                    houveFalhaAoGuardar = true;
                    console.error(
                      "Erro ao guardar email Gmail analisado automaticamente:",
                      error,
                    );
                  }
                } catch (erro) {
                  houveErroDeAnalise = true;
                  console.error("Erro na análise automática de email Gmail:", erro);
                }
              }
            }

            pageToken = pagina.nextPageToken;
          } while (pageToken);

          if (cancelado) {
            return;
          }

          const agora = new Date().toISOString();

          if (!houveFalhaAoGuardar && !houveErroDeAnalise) {
            await supabase
              .from("preferencias_importacao" as any)
              .update({
                ultima_analise_gmail_em: agora,
                updated_at: agora,
              })
              .eq("user_id", userIdSeguro);
          }

          console.info("Gmail: deteção automática concluída", {
            modoAnalise,
            mensagensConsultadas,
            candidatosIa,
            relevantes: descobertas,
            ultimaAnalise,
            houveFalhaAoGuardar,
            houveErroDeAnalise,
          });

          if (mensagensConsultadas > 0 && descobertas === 0) {
            toast.info(
              houveFalhaAoGuardar || houveErroDeAnalise
                ? "A deteção automática verificou os emails novos, mas algumas análises ou gravações falharam."
                : `A deteção automática verificou ${mensagensConsultadas} email${mensagensConsultadas === 1 ? "" : "s"} novo${mensagensConsultadas === 1 ? "" : "s"} e não encontrou informação de viagem relevante.`,
            );
          }

          if (descobertas > 0) {
            const assunto = novasDescobertasAssuntos[0] ?? null;
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
                    void navigate({ to: "/importar" });
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
            console.error("Erro na deteção automática do Gmail:", erro);
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
        if (deteccoesGmailEmCurso.get(userIdSeguro) === tarefa) {
          deteccoesGmailEmCurso.delete(userIdSeguro);
        }
      }
    }

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

    window.addEventListener(GMAIL_AUTOMACAO_EVENT, aoMudarDeteccao);
    document.addEventListener("visibilitychange", aoFicarVisivel);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
      window.removeEventListener(GMAIL_AUTOMACAO_EVENT, aoMudarDeteccao);
      document.removeEventListener("visibilitychange", aoFicarVisivel);
    };
  }, [session?.user.id, analisar, analisarLote, procurarLoteGmail, navigate]);


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