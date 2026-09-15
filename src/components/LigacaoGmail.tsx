import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Hotel,
  Info,
  Mail,
  PauseCircle,
  Plane,
  PlayCircle,
  Ticket,
  Train,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { analisarDocumento } from "@/lib/documentos-ia.functions";
import { supabase } from "@/integrations/supabase/client";

const CONNECTOR_ID = "google_mail";
const GMAIL_OAUTH_STORAGE_KEY = "viatorbis:gmail-oauth-result";

type OAuthStorageResult =
  | {
      type: "appUserConnectorOAuthComplete";
      connectorId: typeof CONNECTOR_ID;
      code: string;
      createdAt: number;
    }
  | {
      type: "appUserConnectorOAuthFailed";
      connectorId: typeof CONNECTOR_ID;
      error: string;
      errorDescription: string;
      createdAt: number;
    };

function esperarConclusao(popup: Window) {
  return new Promise<string>((resolve, reject) => {
    let pollJanela: number | undefined;
    let pollStorage: number | undefined;
    let terminado = false;

    const limpar = () => {
      window.removeEventListener("message", aoReceberMensagem);
      window.removeEventListener("storage", aoReceberStorage);

      if (pollJanela !== undefined) {
        window.clearInterval(pollJanela);
      }

      if (pollStorage !== undefined) {
        window.clearInterval(pollStorage);
      }
    };

    const concluir = (resultado: OAuthStorageResult) => {
      if (terminado) {
        return;
      }

      terminado = true;
      limpar();

      try {
        window.localStorage.removeItem(GMAIL_OAUTH_STORAGE_KEY);
      } catch {
        // Não impedimos a conclusão caso o localStorage não esteja disponível.
      }

      if (resultado.type === "appUserConnectorOAuthComplete") {
        resolve(resultado.code);
        return;
      }

      popup.close();

      reject(
        new Error(
          resultado.errorDescription ||
            resultado.error ||
            "A ligação ao Gmail não foi concluída.",
        ),
      );
    };

    const processarValor = (valor: string | null) => {
      if (!valor) {
        return;
      }

      try {
        const resultado = JSON.parse(valor) as OAuthStorageResult;

        if (
          resultado?.connectorId !== CONNECTOR_ID ||
          (resultado.type !== "appUserConnectorOAuthComplete" &&
            resultado.type !== "appUserConnectorOAuthFailed")
        ) {
          return;
        }

        if (
          typeof resultado.createdAt !== "number" ||
          Date.now() - resultado.createdAt > 5 * 60 * 1000
        ) {
          return;
        }

        concluir(resultado);
      } catch (error) {
        console.error("Resultado OAuth Gmail inválido:", error);
      }
    };

    const aoReceberStorage = (event: StorageEvent) => {
      if (event.key !== GMAIL_OAUTH_STORAGE_KEY) {
        return;
      }

      processarValor(event.newValue);
    };

    const aoReceberMensagem = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== popup
      ) {
        return;
      }

      const data = event.data;

      if (!data || typeof data !== "object") {
        return;
      }

      const resultado = data as Record<string, unknown>;

      if (
        resultado["connectorId"] !== CONNECTOR_ID ||
        (resultado["type"] !== "appUserConnectorOAuthComplete" &&
          resultado["type"] !== "appUserConnectorOAuthFailed")
      ) {
        return;
      }

      if (
        resultado["type"] === "appUserConnectorOAuthComplete" &&
        typeof resultado["code"] === "string"
      ) {
        concluir({
          type: "appUserConnectorOAuthComplete",
          connectorId: CONNECTOR_ID,
          code: resultado["code"],
          createdAt:
            typeof resultado["createdAt"] === "number"
              ? resultado["createdAt"]
              : Date.now(),
        });

        return;
      }

      concluir({
        type: "appUserConnectorOAuthFailed",
        connectorId: CONNECTOR_ID,
        error:
          typeof resultado["error"] === "string"
            ? resultado["error"]
            : "oauth_error",
        errorDescription:
          typeof resultado["errorDescription"] === "string"
            ? resultado["errorDescription"]
            : "A autorização do Gmail não foi concluída.",
        createdAt:
          typeof resultado["createdAt"] === "number"
            ? resultado["createdAt"]
            : Date.now(),
      });
    };

    window.addEventListener("storage", aoReceberStorage);
    window.addEventListener("message", aoReceberMensagem);

    try {
      processarValor(
        window.localStorage.getItem(GMAIL_OAUTH_STORAGE_KEY),
      );
    } catch {
      // Continuamos com postMessage e polling da janela.
    }

    pollStorage = window.setInterval(() => {
      try {
        processarValor(
          window.localStorage.getItem(GMAIL_OAUTH_STORAGE_KEY),
        );
      } catch {
        // Ignorar e continuar.
      }
    }, 300);

    pollJanela = window.setInterval(() => {
      if (!popup.closed) {
        return;
      }

      if (terminado) {
        return;
      }

      terminado = true;
      limpar();

      try {
        window.localStorage.removeItem(GMAIL_OAUTH_STORAGE_KEY);
      } catch {
        // Ignorar.
      }

      reject(
        new Error(
          "A janela foi fechada antes de concluir a ligação ao Gmail.",
        ),
      );
    }, 500);
  });
}

type EmailEncontrado = {
  id: string;
  assunto: string;
  texto: string;
};

type ResultadoAnalise = {
  email: EmailEncontrado;
  estado: "a_analisar" | "analisado" | "erro";
  resultado?: unknown;
  erro?: string;
};

type DescobertaAutomatica = {
  id: string;
  gmail_message_id: string;
  assunto: string;
  ficha: unknown;
  categoria: string | null;
  referencia: string | null;
  analisado_em: string | null;
};

type Ficha = Record<string, unknown>;

type AcaoSugerida =
  | "adicionar_viagem"
  | "guardar_documento"
  | "guardar_informacao"
  | "ignorar"
  | "rever";

function valorDaFicha(ficha: unknown, campo: string): string | null {
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

function fichaDaAnalise(resultado: unknown): unknown {
  if (!resultado || typeof resultado !== "object") {
    return null;
  }

  const objeto = resultado as Record<string, unknown>;

  if ("ficha" in objeto) {
    return objeto["ficha"];
  }

  return resultado;
}

function analiseEhRelevante(resultado: unknown): boolean {
  if (!resultado || typeof resultado !== "object") {
    return false;
  }

  return (resultado as Record<string, unknown>)["relevante"] === true;
}

function categoriaApresentacao(categoria: string | null): {
  titulo: string;
  icon: typeof Plane;
} {
  switch (categoria) {
    case "voo":
      return {
        titulo: "Reserva de voo",
        icon: Plane,
      };

    case "hotel":
      return {
        titulo: "Reserva de alojamento",
        icon: Hotel,
      };

    case "transporte":
      return {
        titulo: "Reserva de transporte",
        icon: Train,
      };

    case "transfer":
      return {
        titulo: "Transfer",
        icon: Train,
      };

    case "bilhete":
      return {
        titulo: "Bilhete ou voucher",
        icon: Ticket,
      };

    case "documento":
      return {
        titulo: "Documento de viagem",
        icon: FileText,
      };

    case "informacao":
      return {
        titulo: "Informação de viagem",
        icon: Info,
      };

    default:
      return {
        titulo: "Email analisado",
        icon: Mail,
      };
  }
}

function determinarAcao(ficha: Ficha | null): AcaoSugerida {
  if (!ficha) {
    return "rever";
  }

  const categoria =
    typeof ficha["categoria"] === "string"
      ? ficha["categoria"].toLowerCase()
      : "";

  if (
    categoria === "voo" ||
    categoria === "hotel" ||
    categoria === "transporte" ||
    categoria === "transfer" ||
    categoria === "bilhete"
  ) {
    return "adicionar_viagem";
  }

  if (categoria === "documento") {
    return "guardar_documento";
  }

  if (categoria === "informacao") {
    return "guardar_informacao";
  }

  return "rever";
}

function textoDaAcao(acao: AcaoSugerida): {
  titulo: string;
  descricao: string;
} {
  switch (acao) {
    case "adicionar_viagem":
      return {
        titulo: "Adicionar à viagem",
        descricao:
          "Este email parece conter uma reserva ou bilhete relacionado com uma viagem.",
      };

    case "guardar_documento":
      return {
        titulo: "Guardar nos documentos",
        descricao:
          "Este email parece conter um documento que pode ser útil durante a viagem.",
      };

    case "guardar_informacao":
      return {
        titulo: "Guardar como informação",
        descricao:
          "Encontrámos informação potencialmente útil para uma viagem.",
      };

    default:
      return {
        titulo: "Rever manualmente",
        descricao:
          "A análise encontrou informação relacionada com viagem, mas é necessária uma revisão.",
      };
  }
}

function formatarCategoria(categoria: string | null): string | null {
  if (!categoria) {
    return null;
  }

  const nomes: Record<string, string> = {
    voo: "Voo",
    hotel: "Alojamento",
    transporte: "Transporte",
    transfer: "Transfer",
    bilhete: "Bilhete / voucher",
    documento: "Documento",
    informacao: "Informação",
    outro: "Outro",
  };

  return nomes[categoria] ?? categoria;
}

function formatarData(data: string | null): string | null {
  if (!data) {
    return null;
  }

  const dataLimpa = data.trim();

  const tentativa = new Date(dataLimpa);

  if (!Number.isNaN(tentativa.getTime())) {
    return new Intl.DateTimeFormat("pt-PT", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(tentativa);
  }

  return dataLimpa;
}

function obterTituloPrincipal(
  ficha: Ficha | null,
  assunto: string,
): string {
  if (!ficha) {
    return assunto || "Email sem assunto";
  }

  const categoria =
    typeof ficha["categoria"] === "string"
      ? ficha["categoria"]
      : "";

  const companhia =
    typeof ficha["companhia"] === "string"
      ? ficha["companhia"]
      : "";

  const fornecedor =
    typeof ficha["fornecedor"] === "string"
      ? ficha["fornecedor"]
      : "";

  const operador =
    typeof ficha["operador"] === "string"
      ? ficha["operador"]
      : "";

  const origem =
    typeof ficha["origem"] === "string"
      ? ficha["origem"]
      : "";

  const destino =
    typeof ficha["destino"] === "string"
      ? ficha["destino"]
      : "";

  if (categoria === "voo") {
    if (origem && destino) {
      return `${origem} → ${destino}`;
    }

    if (companhia) {
      return companhia;
    }
  }

  if (categoria === "hotel" && fornecedor) {
    return fornecedor;
  }

  if (fornecedor) {
    return fornecedor;
  }

  if (operador) {
    return operador;
  }

  return assunto || "Email sem assunto";
}

function temDadosRelevantes(ficha: Ficha | null): boolean {
  if (!ficha) {
    return false;
  }

  const campos = [
    "fornecedor",
    "operador",
    "referencia",
    "dataHora",
    "dataHoraFim",
    "codigo",
    "companhia",
    "numeroVoo",
    "origem",
    "destino",
    "local",
    "morada",
    "quarto",
  ];

  return campos.some((campo) => {
    const valor = ficha[campo];

    if (typeof valor === "string") {
      return valor.trim().length > 0;
    }

    if (typeof valor === "number") {
      return true;
    }

    return false;
  });
}

function CampoResumo({
  nome,
  valor,
}: {
  nome: string;
  valor: string | null;
}) {
  if (!valor) {
    return null;
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {nome}
      </p>

      <p className="text-sm text-foreground">
        {valor}
      </p>
    </div>
  );
}

function CartaoResultado({
  item,
  aoIgnorar,
}: {
  item: ResultadoAnalise;
  aoIgnorar: (id: string) => void;
}) {
  if (item.estado !== "analisado" || !analiseEhRelevante(item.resultado)) {
    return null;
  }

  const fichaBruta = fichaDaAnalise(item.resultado);

  const ficha: Ficha | null =
    fichaBruta && typeof fichaBruta === "object"
      ? (fichaBruta as Ficha)
      : null;

  const categoria = valorDaFicha(ficha, "categoria");
  const operador = valorDaFicha(ficha, "operador");
  const referencia = valorDaFicha(ficha, "referencia");
  const dataHora = valorDaFicha(ficha, "dataHora");
  const dataHoraFim = valorDaFicha(ficha, "dataHoraFim");
  const companhia = valorDaFicha(ficha, "companhia");
  const numeroVoo = valorDaFicha(ficha, "numeroVoo");
  const origem = valorDaFicha(ficha, "origem");
  const destino = valorDaFicha(ficha, "destino");
  const local = valorDaFicha(ficha, "local");
  const morada = valorDaFicha(ficha, "morada");
  const quarto = valorDaFicha(ficha, "quarto");
  const codigo = valorDaFicha(ficha, "codigo");
  const tipoDocumento = valorDaFicha(ficha, "tipoDocumento");

  const apresentacao = categoriaApresentacao(categoria);
  const Icon = apresentacao.icon;

  const acao = determinarAcao(ficha);
  const acaoTexto = textoDaAcao(acao);

  const tituloPrincipal = obterTituloPrincipal(
    ficha,
    item.email.assunto,
  );

  const categoriaTexto = formatarCategoria(categoria);

  const dataFormatada = formatarData(dataHora);
  const dataFimFormatada = formatarData(dataHoraFim);

  const dadosRelevantes = temDadosRelevantes(ficha);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {apresentacao.titulo}
            </p>

            {categoriaTexto ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                {categoriaTexto}
              </span>
            ) : null}
          </div>

          <h3 className="mt-1 text-base font-semibold leading-tight">
            {tituloPrincipal}
          </h3>

          {item.email.assunto &&
          item.email.assunto !== tituloPrincipal ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {item.email.assunto}
            </p>
          ) : null}
        </div>
      </div>

      {dadosRelevantes ? (
        <div className="mt-4 rounded-xl bg-secondary/50 p-3">
          {categoria === "voo" && (origem || destino) ? (
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <span>{origem || "?"}</span>

              <ChevronRight className="size-4 text-muted-foreground" />

              <span>{destino || "?"}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <CampoResumo nome="Companhia" valor={companhia} />
            <CampoResumo nome="Operador" valor={operador} />
            <CampoResumo nome="Referência" valor={referencia} />
            <CampoResumo nome="Voo" valor={numeroVoo} />
            <CampoResumo nome="Local" valor={local} />
            <CampoResumo nome="Data" valor={dataFormatada} />
            <CampoResumo
              nome={dataFimFormatada ? "Até" : "Código"}
              valor={dataFimFormatada || codigo}
            />
            <CampoResumo nome="Quarto" valor={quarto} />
            <CampoResumo nome="Morada" valor={morada} />
            <CampoResumo nome="Tipo de documento" valor={tipoDocumento} />
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 text-primary" />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sugestão da ViatOrbis
            </p>

            <p className="mt-1 text-sm font-semibold">
              {acaoTexto.titulo}
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {acaoTexto.descricao}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={() => {
              toast.info(
                "A ligação desta ação à viagem será feita no próximo passo.",
              );
            }}
          >
            {acaoTexto.titulo}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => {
              toast.info(
                "Vamos preparar a opção de guardar este elemento no próximo passo.",
              );
            }}
          >
            Rever
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9"
            onClick={() => aoIgnorar(item.email.id)}
          >
            <Trash2 className="mr-1.5 size-4" />
            Remover da lista
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LigacaoGmail() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const iniciar = useServerFn(iniciarLigacaoGmail);
  const concluir = useServerFn(concluirLigacaoGmail);
  const desligar = useServerFn(desligarGmail);
  const procurarEmails = useServerFn(emailsDeViagem);
  const analisar = useServerFn(analisarDocumento);

  const [ocupado, setOcupado] = useState(false);
  const [aProcurar, setAProcurar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [analises, setAnalises] = useState<ResultadoAnalise[]>([]);
  const [ignorados, setIgnorados] = useState<string[]>([]);
  const [descobertasAutomaticas, setDescobertasAutomaticas] = useState<
    DescobertaAutomatica[]
  >([]);
  const [aCarregarAutomaticas, setACarregarAutomaticas] = useState(false);
  const [deteccaoAutomaticaAtiva, setDeteccaoAutomaticaAtiva] = useState<
    boolean | null
  >(null);
  const [aAlterarDeteccaoAutomatica, setAAlterarDeteccaoAutomatica] =
    useState(false);

  async function ligar() {
  /*
   * Limpamos qualquer resultado OAuth antigo antes de começar.
   * Isto evita que uma autorização anterior seja interpretada
   * como sendo a autorização atual.
   */
  try {
    window.localStorage.removeItem(GMAIL_OAUTH_STORAGE_KEY);
  } catch {
    // Continuamos mesmo que o localStorage não esteja disponível.
  }

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
    /*
     * Criamos o listener antes de enviar a janela para o Google.
     * Assim não existe uma janela de oportunidade em que o resultado
     * possa chegar antes de começarmos a ouvi-lo.
     */
    const conclusao = esperarConclusao(popup);

    const { authorizationUrl } = await iniciar();

    popup.location.href = authorizationUrl;

    const code = await conclusao;

    /*
     * O código devolvido pelo gateway é agora trocado pela
     * connection API key e guardado no servidor para o utilizador.
     */
    await concluir({
      data: {
        code,
      },
    });

    /*
     * Só depois da conclusão bem-sucedida pedimos novamente o estado.
     */
    await queryClient.invalidateQueries({
      queryKey: ["gmail", "estado"],
    });

    /*
     * Garantimos que a query é efetivamente atualizada antes
     * de dizermos ao utilizador que o Gmail está ligado.
     */
    await queryClient.refetchQueries({
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

  async function carregarPreferenciaDeteccao() {
    const userId = session?.user.id;

    if (!userId) {
      setDeteccaoAutomaticaAtiva(null);
      return;
    }

    const { data, error } = await supabase
      .from("preferencias_importacao" as any)
      .select("consentimento_analise_automatica")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "Erro ao carregar preferência de deteção automática:",
        error,
      );
      setDeteccaoAutomaticaAtiva(false);
      return;
    }

    const preferencia = data as
      | { consentimento_analise_automatica?: boolean }
      | null;

    setDeteccaoAutomaticaAtiva(
      preferencia?.consentimento_analise_automatica === true,
    );
  }

  async function alterarDeteccaoAutomatica() {
    const userId = session?.user.id;

    if (!userId || deteccaoAutomaticaAtiva === null) {
      return;
    }

    const novoEstado = !deteccaoAutomaticaAtiva;
    const estadoAnterior = deteccaoAutomaticaAtiva;

    setAAlterarDeteccaoAutomatica(true);
    setDeteccaoAutomaticaAtiva(novoEstado);

    try {
      const agora = new Date().toISOString();

      const { error } = await supabase
        .from("preferencias_importacao" as any)
        .upsert({
          user_id: userId,
          consentimento_analise_automatica: novoEstado,
          consentimento_analise_automatica_em: novoEstado ? agora : null,
          updated_at: agora,
        });

      if (error) {
        throw error;
      }

      toast.success(
        novoEstado
          ? "Deteção automática ativada."
          : "Deteção automática parada.",
      );
    } catch (e) {
      console.error(
        "Erro ao alterar deteção automática do Gmail:",
        e,
      );
      setDeteccaoAutomaticaAtiva(estadoAnterior);
      toast.error(
        "Não foi possível alterar a deteção automática.",
      );
    } finally {
      setAAlterarDeteccaoAutomatica(false);
    }
  }

  useEffect(() => {
    void carregarPreferenciaDeteccao();
  }, [session?.user.id]);

  async function procurar() {
    setAProcurar(true);
    setErro(null);
    setAnalises([]);
    setIgnorados([]);

    try {
      const emails = await procurarEmails();

      if (emails.length === 0) {
        toast.info("Não encontrámos candidatos para analisar.");
        return;
      }

      toast.info(
        `${emails.length} candidatos encontrados. A analisar…`,
      );

      const { data: processados, error: erroProcessados } = await supabase
        .from("emails_gmail_processados" as any)
        .select("gmail_message_id")
        .eq("user_id", session?.user.id)
        .in(
          "gmail_message_id",
          emails.map((email) => email.id),
        );

      if (erroProcessados) {
        console.error(
          "Erro ao verificar emails Gmail já processados na pesquisa manual:",
          erroProcessados,
        );
      }

      const idsJaProcessados = new Set(
        ((processados ?? []) as unknown as Array<{
          gmail_message_id: string;
        }>).map((item) => item.gmail_message_id),
      );

      const resultadosRelevantes: ResultadoAnalise[] = [];

      /*
       * Pequenos lotes: evitamos centenas de pedidos simultâneos, mas também
       * não obrigamos o utilizador a esperar por uma análise estritamente
       * sequencial.
       */
      const TAMANHO_LOTE = 3;

      for (let inicio = 0; inicio < emails.length; inicio += TAMANHO_LOTE) {
        const lote = emails.slice(inicio, inicio + TAMANHO_LOTE);

        const analisados = await Promise.all(
          lote.map(async (email) => {
            const textoCompleto = `${email.assunto}\n\n${email.texto}`.trim();

            try {
              const resultado = await analisar({
                data: {
                  nome: email.assunto || "Email Gmail",
                  texto: textoCompleto,
                },
              });

              if (resultado?.relevante === true) {
                const ficha =
                  resultado && typeof resultado === "object"
                    ? (resultado as { ficha?: unknown }).ficha
                    : null;

                if (!idsJaProcessados.has(email.id)) {
                  const { error: erroGuardarManual } = await supabase
                    .from("emails_gmail_processados" as any)
                    .insert({
                      user_id: session?.user.id,
                      gmail_message_id: email.id,
                      relevante: true,
                      categoria: valorDaFicha(ficha, "categoria"),
                      referencia: valorDaFicha(ficha, "referencia"),
                      assunto: email.assunto || null,
                      ficha: ficha ?? null,
                      estado: "processado",
                      analisado_em: new Date().toISOString(),
                    });

                  if (erroGuardarManual) {
                    console.error(
                      "Erro ao registar email Gmail analisado manualmente:",
                      erroGuardarManual,
                    );
                  }
                }

                return {
                  email,
                  estado: "analisado" as const,
                  resultado,
                };
              }

              if (!idsJaProcessados.has(email.id)) {
                const { error: erroGuardarIrrelevante } = await supabase
                  .from("emails_gmail_processados" as any)
                  .insert({
                    user_id: session?.user.id,
                    gmail_message_id: email.id,
                    relevante: false,
                    categoria: null,
                    referencia: null,
                    assunto: email.assunto || null,
                    ficha: null,
                    estado: "processado",
                    analisado_em: new Date().toISOString(),
                  });

                if (erroGuardarIrrelevante) {
                  console.error(
                    "Erro ao registar email Gmail irrelevante analisado manualmente:",
                    erroGuardarIrrelevante,
                  );
                }
              }
            } catch (e) {
              console.error(
                "Erro ao analisar email Gmail:",
                e instanceof Error ? e.message : e,
              );
            }

            return null;
          }),
        );

        for (const resultado of analisados) {
          if (resultado) {
            resultadosRelevantes.push(resultado);
          }
        }

        setAnalises([...resultadosRelevantes]);
      }

      toast.success(
        resultadosRelevantes.length === 0
          ? "Análise concluída. Não encontrámos elementos de viagem relevantes."
          : resultadosRelevantes.length === 1
            ? "Análise concluída. Encontrámos 1 elemento de viagem relevante."
            : `Análise concluída. Encontrámos ${resultadosRelevantes.length} elementos de viagem relevantes.`,
      );
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

  async function ignorar(id: string) {
    setIgnorados((anteriores) =>
      anteriores.includes(id) ? anteriores : [...anteriores, id],
    );

    const userId = session?.user.id;

    if (!userId) {
      return;
    }

    const { error } = await supabase
      .from("emails_gmail_processados" as any)
      .update({
        estado: "ignorado",
      })
      .eq("user_id", userId)
      .eq("gmail_message_id", id);

    if (error) {
      console.error(
        "Erro ao marcar email Gmail como ignorado:",
        error,
      );
      toast.error("Não foi possível remover esta sugestão definitivamente.");
    }
  }

  async function terminar() {
    setOcupado(true);
    setErro(null);
    setAnalises([]);
    setIgnorados([]);

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

  const estado = useQuery({
    queryKey: ["gmail", "estado"],
    queryFn: () => estadoGmail(),
    enabled: Boolean(session),
  });

  const ligado = estado.data?.ligado === true;
  const configurado = estado.data?.configurado !== false;

  useEffect(() => {
    const userId = session?.user.id;

    if (!userId || !ligado) {
      setDescobertasAutomaticas([]);
      return;
    }

    if (deteccaoAutomaticaAtiva !== true) {
      return;
    }

    let cancelado = false;

    async function carregarDescobertasAutomaticas() {
      if (cancelado) {
        return;
      }

      setACarregarAutomaticas(true);

      try {
        const { data, error } = await supabase
          .from("emails_gmail_processados" as any)
          .select(
            "id, gmail_message_id, assunto, ficha, categoria, referencia, analisado_em",
          )
          .eq("user_id", userId)
          .eq("estado", "pendente")
          .eq("relevante", true)
          .order("analisado_em", { ascending: false })
          .limit(50);

        if (error) {
          console.error(
            "Erro ao carregar descobertas automáticas do Gmail:",
            error,
          );
          return;
        }

        if (cancelado) {
          return;
        }

        const descobertas = (data ?? []) as unknown as DescobertaAutomatica[];

        setDescobertasAutomaticas(descobertas);
      } finally {
        if (!cancelado) {
          setACarregarAutomaticas(false);
        }
      }
    }

    void carregarDescobertasAutomaticas();

    const intervalo = window.setInterval(() => {
      void carregarDescobertasAutomaticas();
    }, 10_000);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
    };
  }, [session?.user.id, ligado, deteccaoAutomaticaAtiva]);

  const idsManuais = new Set(analises.map((item) => item.email.id));

  const analisesAutomaticas: ResultadoAnalise[] = descobertasAutomaticas
    .filter(
      (item) =>
        !idsManuais.has(item.gmail_message_id) &&
        !ignorados.includes(item.gmail_message_id),
    )
    .map((item) => ({
      email: {
        id: item.gmail_message_id,
        assunto: item.assunto || "Email Gmail",
        texto: "",
      },
      estado: "analisado",
      resultado: {
        relevante: true,
        ficha: item.ficha,
      },
    }));

  const analisesManuaisVisiveis = analises.filter(
    (item) =>
      item.estado === "analisado" &&
      analiseEhRelevante(item.resultado) &&
      !ignorados.includes(item.email.id),
  );

  const analisesAutomaticasVisiveis = analisesAutomaticas.filter(
    (item) => analiseEhRelevante(item.resultado),
  );

  const numeroRelevantes = analisesManuaisVisiveis.length;
  const numeroAutomaticas = analisesAutomaticasVisiveis.length;
  const numeroIgnorados = ignorados.length;

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

          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            {deteccaoAutomaticaAtiva === true ? (
              <>
                <span
                  className={`size-2 rounded-full ${
                    aCarregarAutomaticas
                      ? "animate-pulse bg-primary"
                      : "bg-primary"
                  }`}
                  aria-hidden
                />
                {aCarregarAutomaticas
                  ? "A verificar novas descobertas automaticamente…"
                  : "Deteção automática ativa — verificamos novas descobertas regularmente."}
              </>
            ) : (
              <>
                <span
                  className="size-2 rounded-full bg-muted-foreground/50"
                  aria-hidden
                />
                Deteção automática parada.
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="h-11"
              disabled={aProcurar || ocupado}
              onClick={() => void procurar()}
            >
              {aProcurar
                ? "A procurar e analisar emails…"
                : "Procurar emails de viagem"}
            </Button>

            <Button
              variant="outline"
              className="h-11"
              disabled={
                ocupado ||
                aProcurar ||
                aAlterarDeteccaoAutomatica ||
                deteccaoAutomaticaAtiva === null
              }
              onClick={() => void alterarDeteccaoAutomatica()}
            >
              {aAlterarDeteccaoAutomatica ? (
                "A alterar…"
              ) : deteccaoAutomaticaAtiva ? (
                <>
                  <PauseCircle className="mr-1.5 size-4" />
                  Parar deteção automática
                </>
              ) : (
                <>
                  <PlayCircle className="mr-1.5 size-4" />
                  Ativar deteção automática
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="h-11"
              disabled={ocupado || aProcurar || aAlterarDeteccaoAutomatica}
              onClick={() => void terminar()}
            >
              {ocupado ? "A desligar…" : "Desligar Gmail"}
            </Button>
          </div>

          {aProcurar ? (
            <div className="mt-5 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="size-4 text-primary" />
                </div>

                <div>
                  <p className="text-sm font-medium">
                    A analisar os seus emails
                  </p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Estamos a procurar reservas, bilhetes, alojamentos e
                    outras informações de viagem.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {analises.length > 0 || analisesAutomaticasVisiveis.length > 0 ? (
            <div className="mt-5 space-y-3">
              {analises.length > 0 ? (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Elementos de viagem encontrados
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Mostramos apenas os emails da pesquisa manual que a análise
                        identificou como relevantes para uma viagem ou evento concreto.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                      {numeroRelevantes}
                    </span>
                  </div>

                  {analisesManuaisVisiveis.map((item) => (
                    <CartaoResultado
                      key={item.email.id}
                      item={item}
                      aoIgnorar={ignorar}
                    />
                  ))}

                  {!aProcurar && numeroRelevantes === 0 ? (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-sm font-medium">
                        Não encontrámos elementos de viagem relevantes.
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Emails promocionais, newsletters e publicidade sem uma
                        reserva, bilhete, evento ou informação concreta foram
                        automaticamente excluídos.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}

              {numeroAutomaticas > 0 ? (
                <>
                  <div className="mt-6 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Novas descobertas automáticas
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Estes elementos foram encontrados automaticamente pelo Gmail.
                        Reveja-os antes de os adicionar a uma viagem.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                      {numeroAutomaticas}
                    </span>
                  </div>

                  {analisesAutomaticasVisiveis.map((item) => (
                    <CartaoResultado
                      key={item.email.id}
                      item={item}
                      aoIgnorar={ignorar}
                    />
                  ))}
                </>
              ) : null}

              {numeroIgnorados > 0 ? (
                <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {numeroIgnorados === 1
                      ? "1 email removido da lista."
                      : `${numeroIgnorados} emails removidos da lista.`}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => setIgnorados([])}
                  >
                    Mostrar novamente
                  </Button>
                </div>
              ) : null}

              {numeroRelevantes > 0 || numeroAutomaticas > 0 ? (
                <div className="rounded-xl border border-primary/10 bg-primary/5 p-3">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Importante:
                      </span>{" "}
                      nada é adicionado automaticamente às suas viagens. A
                      aplicação primeiro analisa os emails e apresenta uma
                      sugestão. A confirmação e a organização das reservas
                      serão feitas no passo seguinte.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Procuraremos reservas de voos, hotéis, transfers, bilhetes e
              outras informações de viagem nos emails encontrados.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Ligue a sua própria conta Gmail para encontrarmos voos, hotéis,
            transfers, bilhetes e outras informações nas confirmações que
            recebeu. Pode retirar o acesso a qualquer momento.
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