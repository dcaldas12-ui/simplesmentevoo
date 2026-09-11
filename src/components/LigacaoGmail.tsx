import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth";
import {
  concluirLigacaoGmail,
  desligarGmail,
  emailsDeViagem,
  estadoGmail,
  iniciarLigacaoGmail,
} from "@/lib/gmail.functions";
import { eventosDeTexto } from "@/lib/eventos-telemovel";

const CONNECTOR_ID = "google_mail";

function esperarConclusao(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;

    const limpar = () => {
      window.removeEventListener("message", aoReceber);

      if (poll !== undefined) {
        window.clearInterval(poll);
      }
    };

    const aoReceber = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        connectorId?: string;
        code?: string | null;
      };

      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        data.connectorId !== CONNECTOR_ID ||
        (data.type !== "appUserConnectorOAuthComplete" &&
          data.type !== "appUserConnectorOAuthFailed")
      ) {
        return;
      }

      limpar();

      if (data.type === "appUserConnectorOAuthComplete") {
        resolve(typeof data.code === "string" ? data.code : null);
        return;
      }

      popup.close();
      reject(new Error("A ligação não foi concluída."));
    };

    window.addEventListener("message", aoReceber);

    poll = window.setInterval(() => {
      if (!popup.closed) {
        return;
      }

      limpar();
      reject(new Error("A janela foi fechada antes de concluir."));
    }, 500);
  });
}

export function LigacaoGmail() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const iniciar = useServerFn(iniciarLigacaoGmail);
  const concluir = useServerFn(concluirLigacaoGmail);
  const desligar = useServerFn(desligarGmail);
  const procurarEmails = useServerFn(emailsDeViagem);

  const [ocupado, setOcupado] = useState(false);
  const [aProcurar, setAProcurar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultados, setResultados] = useState<
    Array<{
      id: string;
      assunto: string;
      texto: string;
    }>
  >([]);

  const estado = useQuery({
    queryKey: ["gmail", "estado"],
    queryFn: () => estadoGmail(),
    enabled: Boolean(session),
  });

  async function ligar() {
    const popup = window.open(
      "",
      "lovable-oauth",
      "width=600,height=720",
    );

    if (!popup) {
      const msg =
        "Permita as janelas pop-up no seu navegador para autorizar o Gmail.";

      setErro(msg);
      toast.error(msg);
      return;
    }

    setOcupado(true);
    setErro(null);

    try {
      const { authorizationUrl } = await iniciar();
      const conclusao = esperarConclusao(popup);

      popup.location.href = authorizationUrl;

      const code = await conclusao;

      if (code) {
        await concluir({ data: { code } });
      }

      await queryClient.invalidateQueries({
        queryKey: ["gmail", "estado"],
      });

      toast.success("Gmail ligado à sua conta.");
    } catch (e) {
      popup.close();

      const msg =
        e instanceof Error
          ? e.message
          : "Não foi possível ligar o Gmail.";

      setErro(msg);
      toast.error(msg);
    } finally {
      setOcupado(false);
    }
  }

  async function procurar() {
    setAProcurar(true);
    setErro(null);
    setResultados([]);

    try {
      const emails = await procurarEmails();

      setResultados(emails);

      if (emails.length === 0) {
        toast.info("Não encontrámos emails de viagem.");
      } else {
        toast.success(
          `${emails.length} email(s) de viagem encontrado(s).`,
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Não foi possível procurar emails no Gmail.";

      setErro(msg);
      toast.error(msg);
    } finally {
      setAProcurar(false);
    }
  }

  async function terminar() {
    setOcupado(true);
    setErro(null);
    setResultados([]);

    try {
      await desligar();

      await queryClient.invalidateQueries({
        queryKey: ["gmail", "estado"],
      });

      toast.success("Ligação ao Gmail terminada.");
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Não foi possível desligar o Gmail.";

      setErro(msg);
      toast.error(msg);
    } finally {
      setOcupado(false);
    }
  }

  const ligado = estado.data?.ligado === true;
  const configurado = estado.data?.configurado !== false;

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary/40 p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Mail className="size-4" aria-hidden />
        Ligar Gmail
      </h2>

      {!session ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Precisa de iniciar sessão na sua conta ViatOrbis para ligar o seu
          Gmail.
        </p>
      ) : !configurado ? (
        <p className="mt-1 text-sm text-muted-foreground">
          A ligação ao Gmail ainda não está configurada nesta app.
        </p>
      ) : estado.isLoading ? (
        <p className="mt-1 text-sm text-muted-foreground">
          A verificar a ligação…
        </p>
      ) : ligado ? (
        <>
          <p className="mt-1 text-sm font-medium text-foreground">
            ✓ Gmail ligado
          </p>

          {estado.data?.email ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Conta: {estado.data.email}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="h-11"
              disabled={aProcurar || ocupado}
              onClick={() => void procurar()}
            >
              {aProcurar
                ? "A procurar emails…"
                : "Procurar emails de viagem"}
            </Button>

            <Button
              variant="outline"
              className="h-11"
              disabled={ocupado || aProcurar}
              onClick={() => void terminar()}
            >
              {ocupado ? "A desligar…" : "Desligar Gmail"}
            </Button>
          </div>

          {resultados.length > 0 ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium">
                Emails encontrados ({resultados.length})
              </p>

              {resultados.map((email) => {
                const eventos = eventosDeTexto(
                  `${email.assunto}\n${email.texto}`,
                );

                return (
                  <div
                    key={email.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <p className="text-sm font-medium">
                      {email.assunto || "Email sem assunto"}
                    </p>

                    {eventos.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {eventos.map((evento) => (
                          <p
                            key={`${email.id}-${evento.id}`}
                            className="text-sm text-muted-foreground"
                          >
                            {evento.titulo}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Email encontrado, mas ainda não foi possível
                        identificar um evento de viagem.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Procuraremos reservas de voos, hotéis, transfers e outros
              eventos de viagem nos emails encontrados.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Ligue a sua própria conta Gmail para, mais tarde, encontrarmos
            voos, hotéis e transfers nas confirmações que recebeu. Pode
            retirar o acesso a qualquer momento.
          </p>

          <Button
            className="mt-3 h-11"
            disabled={ocupado}
            onClick={() => void ligar()}
          >
            {ocupado ? "A abrir o Google…" : "Ligar Gmail"}
          </Button>
        </>
      )}

      {erro ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}