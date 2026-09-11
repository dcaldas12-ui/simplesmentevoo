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
  estadoGmail,
  iniciarLigacaoGmail,
} from "@/lib/gmail.functions";
import { useIdioma } from "@/lib/i18n";

const CONNECTOR_ID = "google_mail";

function esperarConclusao(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const limpar = () => {
      window.removeEventListener("message", aoReceber);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const aoReceber = (event: MessageEvent) => {
      const type = (event.data as { type?: string })?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (event.data as { connectorId?: string })?.connectorId !== CONNECTOR_ID ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      limpar();
      if (type === "appUserConnectorOAuthComplete") {
        const code = (event.data as { code?: string | null })?.code;
        resolve(typeof code === "string" ? code : null);
        return;
      }
      popup.close();
      reject(new Error("A ligação não foi concluída."));
    };
    window.addEventListener("message", aoReceber);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      limpar();
      reject(new Error("A janela foi fechada antes de concluir."));
    }, 500);
  });
}

export function LigacaoGmail({
  autorizou,
  aoEncontrar,
}: {
  autorizou: boolean;
  aoEncontrar: (eventos: EventoEncontrado[]) => void;
}) {
  const { t } = useIdioma();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const iniciar = useServerFn(iniciarLigacaoGmail);
  const concluir = useServerFn(concluirLigacaoGmail);
  const desligar = useServerFn(desligarGmail);
  const lerEmails = useServerFn(emailsDeViagem);
  const [ocupado, setOcupado] = useState(false);

  const estado = useQuery({
    queryKey: ["gmail", "estado"],
    queryFn: () => estadoGmail(),
    enabled: Boolean(session),
  });

  async function ligar() {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) {
      toast.error("Permita janelas pop-up para autorizar o Gmail.");
      return;
    }
    setOcupado(true);
    try {
      const { authorizationUrl } = await iniciar();
      const conclusao = esperarConclusao(popup);
      popup.location.href = authorizationUrl;
      const code = await conclusao;
      if (code) await concluir({ data: { code } });
      await queryClient.invalidateQueries({ queryKey: ["gmail", "estado"] });
      toast.success("Gmail ligado à sua conta.");
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Não foi possível ligar o Gmail.");
    } finally {
      setOcupado(false);
    }
  }

  async function procurar() {
    setOcupado(true);
    try {
      const emails = await lerEmails();
      const encontrados = emails.flatMap((e) =>
        eventosDeTexto(e.texto).map((ev) => ({ ...ev, id: `${e.id}:${ev.id}` })),
      );
      aoEncontrar(encontrados);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler os emails.");
    } finally {
      setOcupado(false);
    }
  }

  async function terminar() {
    setOcupado(true);
    try {
      await desligar();
      await queryClient.invalidateQueries({ queryKey: ["gmail", "estado"] });
      toast.success("Ligação ao Gmail terminada.");
    } finally {
      setOcupado(false);
    }
  }

  const ligado = estado.data?.ligado === true;
  const configurado = estado.data?.configurado !== false;

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary/40 p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Mail className="size-4" aria-hidden /> {t("importar.ligarGoogle")}
      </h2>

      {!session ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Entre na sua conta para ligar o seu Gmail e procurar reservas nos seus emails.
        </p>
      ) : !configurado ? (
        <p className="mt-1 text-sm text-muted-foreground">
          A ligação ao Gmail ainda não está configurada nesta app.
        </p>
      ) : ligado ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Ligado a {estado.data?.email || "a sua conta Google"}. Procuramos apenas emails recentes
            com indícios de viagem e nada é guardado sem a sua escolha.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="h-11" disabled={!autorizou || ocupado} onClick={() => void procurar()}>
              {ocupado ? "A procurar…" : "Procurar reservas no Gmail"}
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={ocupado}
              onClick={() => void terminar()}
            >
              Terminar ligação
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Autorize o acesso de leitura ao seu Gmail para encontrarmos voos, hotéis e transfers nas
            confirmações que recebeu. Pode retirar o acesso a qualquer momento.
          </p>
          <Button className="mt-3 h-11" disabled={ocupado} onClick={() => void ligar()}>
            {ocupado ? "A abrir o Google…" : t("importar.ligarGoogle")}
          </Button>
        </>
      )}
    </div>
  );
}
