import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/auth";
import {
  concluirLigacaoGmail,
  desligarGmail,
  emailsDeViagem,
  estadoGmail,
  iniciarLigacaoGmail,
  type GmailAnexo,
} from "@/lib/gmail.functions";
import { analisarDocumento, type AnaliseDocumentoViagem } from "@/lib/documentos-ia.functions";
import { supabase } from "@/integrations/supabase/client";

const CONNECTOR_ID = "google_mail";
const GMAIL_OAUTH_STORAGE_KEY = "viatorbis:gmail-oauth-result";
const GMAIL_AUTOMACAO_EVENT = "viatorbis:gmail-auto-change";
const GMAIL_PESQUISA_VIAGENS_HISTORICO_DIAS = 180;
const GMAIL_PESQUISA_VIAGENS_MARGEM_FIM_DIAS = 2;

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
  remetente_email: string | null;
  recebido_em: string | null;
  anexos: GmailAnexo[];
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

type GmailProcessado = {
  gmail_message_id: string;
  relevante: boolean;
  estado: string | null;
  ficha: unknown;
};

type Ficha = Record<string, unknown>;

type ViagemEscolha = {
  id: string;
  titulo: string;
  origem: string | null;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  numero_passageiros: number | null;
  passageiros: unknown;
};

type DescobertaAcao = {
  item: ResultadoAnalise;
  acao: AcaoSugerida;
};

type ConfirmacaoDuplicacao = {
  viagemId: string;
  origem: string;
  destino: string;
  companhia: string | null;
  numeroVoo: string | null;
  partida: string | null;
  referencia: string | null;
};

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

function extrairPercursoDeTexto(
  texto: string,
): { origem: string; destino: string } | null {
  const conteudo = texto.trim();

  if (!conteudo) {
    return null;
  }

  const comNomes = conteudo.match(
    /\b[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .\'-]{1,60}\s*\(([A-Za-z]{3})\)\s*(?:-|–|—|→|>)\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .\'-]{1,60}\s*\(([A-Za-z]{3})\)/i,
  );

  const origemComNomes = comNomes?.[1];
  const destinoComNomes = comNomes?.[2];

  if (origemComNomes && destinoComNomes) {
    return {
      origem: origemComNomes.toUpperCase(),
      destino: destinoComNomes.toUpperCase(),
    };
  }

  const apenasCodigos = conteudo.match(
    /\b([A-Za-z]{3})\s*(?:-|–|—|→|>|\bto\b|\bpara\b)\s*([A-Za-z]{3})\b/i,
  );

  const origemApenasCodigos = apenasCodigos?.[1];
  const destinoApenasCodigos = apenasCodigos?.[2];

  if (origemApenasCodigos && destinoApenasCodigos) {
    return {
      origem: origemApenasCodigos.toUpperCase(),
      destino: destinoApenasCodigos.toUpperCase(),
    };
  }

  return null;
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

function normalizarValorVoo(valor: string | null): string {
  return (valor ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function dataCalendarioVoo(valor: string | null): string | null {
  if (!valor?.trim()) {
    return null;
  }

  const tentativa = new Date(valor);

  if (!Number.isNaN(tentativa.getTime())) {
    return tentativa.toISOString().slice(0, 10);
  }

  return valor.slice(0, 10);
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
  aoAbrirAcao,
}: {
  item: ResultadoAnalise;
  aoIgnorar: (id: string) => void;
  aoAbrirAcao: (item: ResultadoAnalise) => void;
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

          {item.email.remetente_email ||
          item.email.recebido_em ||
          item.email.anexos.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {item.email.remetente_email ? (
                <span>De: {item.email.remetente_email}</span>
              ) : null}
              {item.email.recebido_em ? (
                <span>
                  Recebido:{" "}
                  {formatarData(item.email.recebido_em) ??
                    item.email.recebido_em}
                </span>
              ) : null}
              {item.email.anexos.length > 0 ? (
                <span>
                  {item.email.anexos.length === 1
                    ? "1 anexo analisado"
                    : `${item.email.anexos.length} anexos analisados`}
                </span>
              ) : null}
            </div>
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
            onClick={() => aoAbrirAcao(item)}
          >
            {acaoTexto.titulo}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => aoAbrirAcao(item)}
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


function DialogAcaoDescoberta({
  aberta,
  descoberta,
  viagens,
  aGuardar,
  erro,
  onOpenChange,
  onGuardar,
  onCriarViagem,
}: {
  aberta: boolean;
  descoberta: DescobertaAcao | null;
  viagens: ViagemEscolha[];
  aGuardar: boolean;
  erro: string | null;
  onOpenChange: (open: boolean) => void;
  onGuardar: (viagemId: string) => Promise<void>;
  onCriarViagem: (dados: {
    titulo: string;
    destino: string;
    dataInicio: string;
    dataFim: string;
  }) => Promise<string | null>;
}) {
  const [modoCriar, setModoCriar] = useState(false);
  const [viagemId, setViagemId] = useState("");
  const [novaTitulo, setNovaTitulo] = useState("");
  const [novoDestino, setNovoDestino] = useState("");
  const [novaDataInicio, setNovaDataInicio] = useState("");
  const [novaDataFim, setNovaDataFim] = useState("");

  const fichaBruta = descoberta ? fichaDaAnalise(descoberta.item.resultado) : null;
  const ficha: Ficha | null =
    fichaBruta && typeof fichaBruta === "object"
      ? (fichaBruta as Ficha)
      : null;

  const categoria = valorDaFicha(ficha, "categoria");
  const fornecedor = valorDaFicha(ficha, "fornecedor");
  const companhia = valorDaFicha(ficha, "companhia");
  const operador = valorDaFicha(ficha, "operador");
  const numeroVoo = valorDaFicha(ficha, "numeroVoo");
  const origem = valorDaFicha(ficha, "origem");
  const destino = valorDaFicha(ficha, "destino");
  const referencia = valorDaFicha(ficha, "referencia");
  const dataHora = valorDaFicha(ficha, "dataHora");
  const dataHoraFim = valorDaFicha(ficha, "dataHoraFim");
  const local = valorDaFicha(ficha, "local");
  const percursoFallback = extrairPercursoDeTexto(
    [descoberta?.item.email.assunto ?? "", descoberta?.item.email.texto ?? ""]
      .filter(Boolean)
      .join("\n"),
  );
  const origemExibicao = origem ?? percursoFallback?.origem ?? null;
  const destinoExibicao = destino ?? percursoFallback?.destino ?? null;

  useEffect(() => {
    if (!aberta) return;

    setModoCriar(false);
    setViagemId("");

    const titulo = obterTituloPrincipal(
      ficha,
      descoberta?.item.email.assunto ?? "",
    );
    setNovaTitulo(titulo || "Nova viagem");
    setNovoDestino(destino ?? local ?? "");
    setNovaDataInicio(dataHora ? dataHora.slice(0, 10) : "");
    setNovaDataFim(dataHoraFim ? dataHoraFim.slice(0, 10) : "");
  }, [aberta, viagens, descoberta]);

  async function confirmar() {
    if (modoCriar) {
      if (!novaTitulo.trim()) {
        toast.error("Indique um nome para a nova viagem.");
        return;
      }

      const id = await onCriarViagem({
        titulo: novaTitulo.trim(),
        destino: novoDestino.trim(),
        dataInicio: novaDataInicio,
        dataFim: novaDataFim,
      });

      if (id) {
        try {
          await onGuardar(id);
        } catch (erro) {
          const mensagem =
            erro instanceof Error
              ? erro.message
              : "Não foi possível adicionar esta descoberta à viagem.";

          toast.error(mensagem);
        }
      }
      return;
    }

    if (!viagemId) {
      toast.error("Selecione uma viagem.");
      return;
    }

    try {
      await onGuardar(viagemId);
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível adicionar esta descoberta à viagem.";

      toast.error(mensagem);
    }
  }

  return (
    <Dialog open={aberta} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {modoCriar ? "Criar viagem e adicionar" : "Adicionar à viagem"}
          </DialogTitle>
          <DialogDescription>
            Confirme a viagem onde pretende guardar esta informação. Nada é
            guardado sem a sua confirmação.
          </DialogDescription>
        </DialogHeader>

        {descoberta ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {categoriaApresentacao(categoria).titulo}
              </p>
              <p className="mt-1 text-base font-semibold">
                {obterTituloPrincipal(ficha, descoberta.item.email.assunto)}
              </p>
              {descoberta.item.email.assunto ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {descoberta.item.email.assunto}
                </p>
              ) : null}

              {descoberta.item.email.remetente_email ||
              descoberta.item.email.recebido_em ? (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {descoberta.item.email.remetente_email ? (
                    <p>De: {descoberta.item.email.remetente_email}</p>
                  ) : null}
                  {descoberta.item.email.recebido_em ? (
                    <p>
                      Recebido:{" "}
                      {formatarData(descoberta.item.email.recebido_em) ??
                        descoberta.item.email.recebido_em}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CampoResumo nome="Fornecedor" valor={fornecedor} />
                <CampoResumo nome="Companhia" valor={companhia} />
                <CampoResumo nome="Operador" valor={operador} />
                <CampoResumo nome="Voo" valor={numeroVoo} />
                <CampoResumo
                  nome="Percurso"
                  valor={
                    origemExibicao && destinoExibicao
                      ? `${origemExibicao} → ${destinoExibicao}`
                      : null
                  }
                />
                <CampoResumo nome="Referência" valor={referencia} />
                <CampoResumo nome="Data" valor={formatarData(dataHora)} />
                <CampoResumo
                  nome="Até"
                  valor={formatarData(dataHoraFim)}
                />
                <CampoResumo nome="Local" valor={local} />
              </div>
            </div>

            {modoCriar ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="gmail-nova-viagem-titulo">Nome da viagem</Label>
                  <Input
                    id="gmail-nova-viagem-titulo"
                    value={novaTitulo}
                    onChange={(e) => setNovaTitulo(e.target.value)}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="gmail-nova-viagem-destino">Destino</Label>
                  <Input
                    id="gmail-nova-viagem-destino"
                    value={novoDestino}
                    onChange={(e) => setNovoDestino(e.target.value)}
                    className="mt-1.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="gmail-nova-viagem-inicio">Início</Label>
                    <Input
                      id="gmail-nova-viagem-inicio"
                      type="date"
                      value={novaDataInicio}
                      onChange={(e) => setNovaDataInicio(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gmail-nova-viagem-fim">Fim</Label>
                    <Input
                      id="gmail-nova-viagem-fim"
                      type="date"
                      value={novaDataFim}
                      onChange={(e) => setNovaDataFim(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="gmail-viagem-destino">Viagem de destino</Label>
                <select
                  id="gmail-viagem-destino"
                  value={viagemId}
                  onChange={(e) => setViagemId(e.target.value)}
                  disabled={aGuardar || viagens.length === 0}
                  className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecionar viagem</option>
                  {viagens.map((viagem) => (
                    <option key={viagem.id} value={viagem.id}>
                      {viagem.titulo}
                      {viagem.destino ? ` — ${viagem.destino}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : null}

        {erro ? (
          <p
            className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            {erro}
          </p>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setModoCriar((valor) => !valor)}
            disabled={aGuardar}
          >
            {modoCriar ? "Escolher viagem existente" : "Criar nova viagem"}
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={aGuardar}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmar()}
              disabled={
                aGuardar ||
                !descoberta ||
                (!modoCriar && viagens.length === 0)
              }
            >
              {aGuardar
                ? "A guardar..."
                : modoCriar
                  ? "Criar e adicionar"
                  : "Adicionar à viagem"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [modoAProcurar, setModoAProcurar] = useState<
    "viagens" | "todos" | null
  >(null);
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

  const [descobertaAcao, setDescobertaAcao] =
    useState<DescobertaAcao | null>(null);
  const [aGuardarDescoberta, setAGuardarDescoberta] = useState(false);
  const [duplicacaoPendente, setDuplicacaoPendente] =
    useState<ConfirmacaoDuplicacao | null>(null);

  const viagensQuery = useQuery({
    queryKey: ["viagens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select(
          "id, titulo, origem, destino, data_inicio, data_fim, numero_passageiros, passageiros",
        )
        .order("data_inicio", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as ViagemEscolha[];
    },
    enabled: Boolean(session),
  });

  const viagens = viagensQuery.data ?? [];

  function prepararViagensParaIa(
    lista: ViagemEscolha[],
  ): AnaliseDocumentoViagem[] {
    return lista.flatMap((viagem) => {
      const titulo = viagem.titulo?.trim() ?? "";
      const origem = viagem.origem?.trim() ?? "";
      const destino = viagem.destino?.trim() ?? "";
      const dataInicio = viagem.data_inicio?.trim() ?? "";
      const dataFim = viagem.data_fim?.trim() ?? "";

      if (
        !titulo ||
        !origem ||
        !destino ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)
      ) {
        return [];
      }

      const passageiros = Array.isArray(viagem.passageiros)
        ? viagem.passageiros.flatMap((valor) => {
            if (!valor || typeof valor !== "object") {
              return [];
            }

            const passageiro = valor as Record<string, unknown>;
            const nome =
              typeof passageiro["nome"] === "string"
                ? passageiro["nome"].trim()
                : "";
            const apelido =
              typeof passageiro["apelido"] === "string"
                ? passageiro["apelido"].trim()
                : "";

            if (!nome && !apelido) {
              return [];
            }

            return [{ nome, apelido }];
          })
        : [];

      return [
        {
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
        },
      ];
    });
  }

  function deslocarDataPesquisa(
    valor: string,
    dias: number,
  ): string | null {
    const correspondencia = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!correspondencia) {
      return null;
    }

    const data = new Date(
      Date.UTC(
        Number(correspondencia[1]),
        Number(correspondencia[2]) - 1,
        Number(correspondencia[3]),
      ),
    );

    if (Number.isNaN(data.getTime())) {
      return null;
    }

    data.setUTCDate(data.getUTCDate() + dias);
    return data.toISOString().slice(0, 10);
  }

  function prepararIntervalosPesquisaGmail(
    lista: ViagemEscolha[],
  ): Array<{ inicio: string; fim: string }> {
    const intervalos = lista.flatMap((viagem) => {
      const dataInicio = viagem.data_inicio?.trim() ?? "";
      const dataFim = viagem.data_fim?.trim() ?? "";

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)
      ) {
        return [];
      }

      const inicio = deslocarDataPesquisa(
        dataInicio,
        -GMAIL_PESQUISA_VIAGENS_HISTORICO_DIAS,
      );
      const fim = deslocarDataPesquisa(
        dataFim,
        GMAIL_PESQUISA_VIAGENS_MARGEM_FIM_DIAS,
      );

      if (!inicio || !fim || inicio > fim) {
        return [];
      }

      return [{ inicio, fim }];
    });

    const ordenados = [...intervalos].sort((a, b) =>
      a.inicio.localeCompare(b.inicio),
    );

    const fundidos: Array<{ inicio: string; fim: string }> = [];

    for (const intervalo of ordenados) {
      const anterior = fundidos[fundidos.length - 1];

      if (!anterior) {
        fundidos.push({ ...intervalo });
        continue;
      }

      const fimAnterior = deslocarDataPesquisa(anterior.fim, 1);

      if (fimAnterior && intervalo.inicio <= fimAnterior) {
        if (intervalo.fim > anterior.fim) {
          anterior.fim = intervalo.fim;
        }
        continue;
      }

      fundidos.push({ ...intervalo });
    }

    return fundidos;
  }


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
    window.dispatchEvent(new Event(GMAIL_AUTOMACAO_EVENT));
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
          ultima_analise_gmail_em: novoEstado ? null : undefined,
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
      window.dispatchEvent(new Event(GMAIL_AUTOMACAO_EVENT));
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

  async function procurar(modo: "viagens" | "todos" = "viagens") {
    setAProcurar(true);
    setModoAProcurar(modo);
    setErro(null);
    setAnalises([]);
    setIgnorados([]);

    try {
      const viagensParaIa = prepararViagensParaIa(viagens);

      if (modo === "viagens" && viagensParaIa.length === 0) {
        toast.error(
          "Crie pelo menos uma viagem com origem, destino e datas antes de procurar informação relacionada com as suas viagens.",
        );
        return;
      }

      const intervalosPesquisa =
        modo === "viagens"
          ? prepararIntervalosPesquisaGmail(viagens)
          : [];

      const emails = await procurarEmails({
        data: {
          modo,
          intervalos: intervalosPesquisa,
          limite: 100,
        },
      });

      if (emails.length === 0) {
        toast.info("Não encontrámos candidatos para analisar.");
        return;
      }

      const emailsUnicos = Array.from(
        new Map(emails.map((email) => [email.id, email])).values(),
      );

      const { data: processados, error: erroProcessados } = await supabase
        .from("emails_gmail_processados" as any)
        .select("gmail_message_id, relevante, estado, ficha")
        .eq("user_id", session?.user.id)
        .in(
          "gmail_message_id",
          emailsUnicos.map((email) => email.id),
        );

      if (erroProcessados) {
        console.error(
          "Erro ao verificar emails Gmail já processados na pesquisa manual:",
          erroProcessados,
        );
        throw erroProcessados;
      }

      const processadosPorId = new Map<string, GmailProcessado>(
        ((processados ?? []) as unknown as GmailProcessado[]).map(
          (item) => [item.gmail_message_id, item],
        ),
      );

      const candidatos = emailsUnicos.filter((email) => {
        const processado = processadosPorId.get(email.id);

        return (
          !processado ||
          (processado.estado === "pendente" &&
            processado.relevante === true)
        );
      });

      if (candidatos.length === 0) {
        toast.info(
          "Não encontrámos novas informações de viagem. Os emails já tratados não voltam a ser importados.",
        );
        return;
      }

      toast.info(
        `${candidatos.length} candidato${
          candidatos.length === 1 ? "" : "s"
        } novo${
          candidatos.length === 1 ? "" : "s"
        } ou pendente${
          candidatos.length === 1 ? "" : "s"
        } encontrado${candidatos.length === 1 ? "" : "s"}. A analisar…`,
      );

      const resultadosRelevantes: ResultadoAnalise[] = [];
      const TAMANHO_LOTE = 3;

      for (
        let inicio = 0;
        inicio < candidatos.length;
        inicio += TAMANHO_LOTE
      ) {
        const lote = candidatos.slice(inicio, inicio + TAMANHO_LOTE);

        const analisados = await Promise.all(
          lote.map(async (email) => {
            const textoCompleto =
              `${email.assunto}\n\n${email.texto}`.trim();

            try {
              const resultado = await analisar({
                data: {
                  nome: email.assunto || "Email Gmail",
                  texto: textoCompleto,
                  anexos: email.anexos,
                  modoAnalise: modo,
                  viagens:
                    modo === "viagens"
                      ? viagensParaIa
                      : [],
                },
              });

              const ficha =
                resultado && typeof resultado === "object"
                  ? (resultado as { ficha?: unknown }).ficha
                  : null;

              if (resultado?.relevante === true) {
                const { error: erroGuardarManual } = await supabase
                  .from("emails_gmail_processados" as any)
                  .upsert(
                    {
                      user_id: session?.user.id,
                      gmail_message_id: email.id,
                      relevante: true,
                      categoria: valorDaFicha(ficha, "categoria"),
                      referencia: valorDaFicha(ficha, "referencia"),
                      assunto: email.assunto || null,
                      ficha: ficha ?? null,
                      estado: "pendente",
                      analisado_em: new Date().toISOString(),
                    },
                    {
                      onConflict:
                        "user_id,gmail_message_id",
                    },
                  );

                if (erroGuardarManual) {
                  console.error(
                    "Erro ao guardar email Gmail analisado manualmente:",
                    erroGuardarManual,
                  );
                } else {
                  processadosPorId.set(email.id, {
                    gmail_message_id: email.id,
                    relevante: true,
                    estado: "pendente",
                    ficha: ficha ?? null,
                  });
                }

                return {
                  email,
                  estado: "analisado" as const,
                  resultado,
                };
              }

              const { error: erroGuardarIrrelevante } = await supabase
                .from("emails_gmail_processados" as any)
                .upsert(
                  {
                    user_id: session?.user.id,
                    gmail_message_id: email.id,
                    relevante: false,
                    categoria: null,
                    referencia: null,
                    assunto: email.assunto || null,
                    ficha: null,
                    estado: "processado",
                    analisado_em: new Date().toISOString(),
                  },
                  {
                    onConflict:
                      "user_id,gmail_message_id",
                  },
                );

              if (erroGuardarIrrelevante) {
                console.error(
                  "Erro ao registar email Gmail irrelevante analisado manualmente:",
                  erroGuardarIrrelevante,
                );
              }

              processadosPorId.set(email.id, {
                gmail_message_id: email.id,
                relevante: false,
                estado: "processado",
                ficha: null,
              });
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
      setModoAProcurar(null);
    }
  }

  function abrirAcao(item: ResultadoAnalise) {
    setErro(null);

    const fichaBruta = fichaDaAnalise(item.resultado);
    const ficha: Ficha | null =
      fichaBruta && typeof fichaBruta === "object"
        ? (fichaBruta as Ficha)
        : null;

    setDescobertaAcao({
      item,
      acao: determinarAcao(ficha),
    });
  }

  async function criarViagemParaDescoberta(dados: {
    titulo: string;
    destino: string;
    dataInicio: string;
    dataFim: string;
  }): Promise<string | null> {
    if (!session?.user.id) {
      toast.error("Entre na sua conta para criar a viagem.");
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("viagens")
        .insert({
          titulo: dados.titulo,
          destino: dados.destino || null,
          data_inicio: dados.dataInicio || null,
          data_fim: dados.dataFim || null,
          notas: null,
        })
        .select("id")
        .single();

      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: ["viagens"],
      });

      return data.id as string;
    } catch (erro) {
      toast.error(
        erro instanceof Error
          ? erro.message
          : "Não foi possível criar a viagem.",
      );
      return null;
    }
  }

  async function obterEmailOriginal(
    email: EmailEncontrado,
  ): Promise<EmailEncontrado> {
    if (
      email.texto.trim() ||
      email.remetente_email ||
      email.recebido_em
    ) {
      return email;
    }

    try {
      const emailsAtuais = await procurarEmails();
      return (
        emailsAtuais.find((candidato) => candidato.id === email.id) ?? email
      );
    } catch (erro) {
      console.warn(
        "Não foi possível recuperar os dados completos do email Gmail antes de o guardar:",
        erro,
      );
      return email;
    }
  }

  async function guardarEmailOrigem(
    viagemId: string,
    email: EmailEncontrado,
    opcoes?: {
      tipo?: string;
      qrConteudo?: string | null;
    },
  ): Promise<{
    guardado: boolean;
    anexosGuardados: number;
    anexosTotais: number;
  }> {
    const corpoOriginal = email.texto.trim();

    const resumoEmail = [
      "Email original do Gmail",
      email.assunto ? `Assunto: ${email.assunto}` : null,
      email.remetente_email
        ? `Remetente: ${email.remetente_email}`
        : null,
      email.recebido_em
        ? `Recebido em: ${
            formatarData(email.recebido_em) ?? email.recebido_em
          }`
        : null,
      corpoOriginal
        ? `\n${corpoOriginal.slice(0, 12000)}`
        : "\nO email não disponibilizou texto suficiente para apresentar o conteúdo completo.",
    ]
      .filter(Boolean)
      .join("\n");

    const { error: erroEmail } = await supabase
      .from("documentos")
      .insert({
        viagem_id: viagemId,
        nome: email.assunto || "Email Gmail",
        tipo: opcoes?.tipo || "email",
        origem: "email",
        ficheiro_path: null,
        mime_type: "message/rfc822",
        tamanho_bytes: null,
        qr_conteudo: opcoes?.qrConteudo || null,
        remetente_email: email.remetente_email || null,
        recebido_em: email.recebido_em || null,
        resumo: resumoEmail,
      })
      ;

    if (erroEmail) {
      throw erroEmail;
    }

    let anexosGuardados = 0;
    let anexosTotais = email.anexos.length;

    if (anexosTotais > 0) {
      const userId = session?.user.id;

      if (!userId) {
        console.warn("Sessão indisponível para guardar anexos Gmail.");
      } else {
        for (const [indice, anexo] of email.anexos.entries()) {
          try {
            if (!anexo.data?.trim()) {
              throw new Error("O anexo não contém dados para guardar.");
            }

            const resposta = await fetch(anexo.data);

            if (!resposta.ok) {
              throw new Error(
                `Não foi possível obter o conteúdo do anexo (${resposta.status}).`,
              );
            }

            const blob = await resposta.blob();
            const mimeType =
              anexo.mimeType?.trim() ||
              blob.type ||
              "application/octet-stream";
            const nomeSeguro = (anexo.nome || `anexo-${indice + 1}`)
              .normalize("NFD")
              .replace(/[^\w.-]+/g, "_");
            const path = `${userId}/${viagemId}/gmail/${email.id}/${Date.now()}-${indice}-${nomeSeguro}`;

            const { data: upload, error: erroUpload } = await supabase.storage
              .from("documentos")
              .upload(path, blob, {
                contentType: mimeType,
                upsert: false,
              });

            if (erroUpload) {
              throw erroUpload;
            }

            const pathGuardado = upload?.path ?? null;

            if (!pathGuardado || pathGuardado.split("/")[0] !== userId) {
              if (pathGuardado) {
                await supabase.storage
                  .from("documentos")
                  .remove([pathGuardado]);
              }

              throw new Error(
                "O armazenamento não confirmou o caminho seguro do anexo.",
              );
            }

            const tipoAnexo = mimeType === "application/pdf"
              ? "pdf"
              : mimeType.startsWith("image/")
                ? "imagem"
                : "ficheiro";

            const { error: erroDocumentoAnexo } = await supabase
              .from("documentos")
              .insert({
                viagem_id: viagemId,
                nome: anexo.nome || `Anexo do email ${indice + 1}`,
                tipo: tipoAnexo,
                origem: "email",
                ficheiro_path: pathGuardado,
                mime_type: mimeType,
                tamanho_bytes: blob.size,
                qr_conteudo: null,
                remetente_email: email.remetente_email || null,
                recebido_em: email.recebido_em || null,
                resumo: `Anexo do email: ${email.assunto || "Email Gmail"}`,
              });

            if (erroDocumentoAnexo) {
              await supabase.storage
                .from("documentos")
                .remove([pathGuardado]);
              throw erroDocumentoAnexo;
            }

            anexosGuardados += 1;
          } catch (erro) {
            console.error(
              `Erro ao guardar o anexo Gmail ${anexo.nome || indice + 1}:`,
              erro,
            );
          }
        }
      }
    }

    return {
      guardado: true,
      anexosGuardados,
      anexosTotais,
    };
  }

  function dataIsoSegura(valor: string | null): string | null {
    if (!valor?.trim()) {
      return null;
    }

    const data = new Date(valor);

    return Number.isNaN(data.getTime()) ? null : data.toISOString();
  }

  async function guardarEmailOrigemSemBloquear(
    viagemId: string,
    email: EmailEncontrado,
    opcoes?: {
      tipo?: string;
      qrConteudo?: string | null;
    },
  ): Promise<{
    guardado: boolean;
    anexosGuardados: number;
    anexosTotais: number;
  }> {
    try {
      return await guardarEmailOrigem(viagemId, email, opcoes);
    } catch (erro) {
      console.error(
        "A informação principal foi guardada, mas não foi possível guardar o email original do Gmail:",
        erro,
      );
      return {
        guardado: false,
        anexosGuardados: 0,
        anexosTotais: email.anexos.length,
      };
    }
  }

  async function guardarDescobertaNaViagem(
    viagemId: string,
    forcarDuplicacao = false,
  ) {
    const descoberta = descobertaAcao;
    const userId = session?.user.id;

    if (!descoberta || !userId || !viagemId) {
      return;
    }

    const fichaBruta = fichaDaAnalise(descoberta.item.resultado);
    const ficha: Ficha | null =
      fichaBruta && typeof fichaBruta === "object"
        ? (fichaBruta as Ficha)
        : null;

    const emailId = descoberta.item.email.id;

    setAGuardarDescoberta(true);
    setErro(null);

    try {
      /*
       * A regra de importação é idempotente:
       * cada mensagem Gmail só pode passar uma vez pelo processo
       * de confirmação. Depois de guardada fica em "processado" e
       * não pode voltar a ser adicionada através de refresh ou de
       * uma segunda abertura do mesmo resultado.
       */
      const { data: estadoAtualBruto, error: erroEstadoAtual } =
        await supabase
          .from("emails_gmail_processados" as any)
          .select("id, relevante, estado")
          .eq("user_id", userId)
          .eq("gmail_message_id", emailId)
          .maybeSingle();

      if (erroEstadoAtual) {
        throw erroEstadoAtual;
      }

      const estadoAtual = estadoAtualBruto as unknown as GmailProcessado | null;

      if (
        !estadoAtual ||
        estadoAtual.estado !== "pendente" ||
        estadoAtual.relevante !== true
      ) {
        throw new Error(
          "Esta informação do Gmail já foi tratada ou não está disponível para ser adicionada novamente.",
        );
      }

      const emailOriginal = await obterEmailOriginal(
        descoberta.item.email,
      );

      const categoria =
        (valorDaFicha(ficha, "categoria") ?? "outro")
          .trim()
          .toLowerCase();

      const texto =
        emailOriginal.assunto || "Informação de viagem do Gmail";
      const fornecedor = valorDaFicha(ficha, "fornecedor");
      const operador = valorDaFicha(ficha, "operador");
      const companhia = valorDaFicha(ficha, "companhia");
      const numeroVoo = valorDaFicha(ficha, "numeroVoo");
      const percursoFallback = extrairPercursoDeTexto(
        [emailOriginal.assunto, emailOriginal.texto]
          .filter(Boolean)
          .join("\n"),
      );
      const origem =
        valorDaFicha(ficha, "origem") ??
        percursoFallback?.origem ??
        null;
      const destino =
        valorDaFicha(ficha, "destino") ??
        percursoFallback?.destino ??
        null;
      const referencia = valorDaFicha(ficha, "referencia");
      const dataHora = valorDaFicha(ficha, "dataHora");
      const dataHoraFim = valorDaFicha(ficha, "dataHoraFim");
      const local = valorDaFicha(ficha, "local");
      const morada = valorDaFicha(ficha, "morada");
      const condicoes = valorDaFicha(ficha, "condicoes");

      if (categoria === "voo" && !forcarDuplicacao) {
        const { data: voosExistentes, error: erroVoosExistentes } =
          await supabase
            .from("voos")
            .select(
              "id, companhia, numero_voo, origem, destino, partida, referencia",
            )
            .eq("viagem_id", viagemId);

        if (erroVoosExistentes) {
          throw erroVoosExistentes;
        }

        const origemNormalizada = normalizarValorVoo(origem);
        const destinoNormalizado = normalizarValorVoo(destino);
        const numeroNormalizado = normalizarValorVoo(numeroVoo);
        const referenciaNormalizada = normalizarValorVoo(referencia);
        const dataVoo = dataCalendarioVoo(dataHora);

        const vooDuplicado = (voosExistentes ?? []).find((voo) => {
          const mesmaRota =
            normalizarValorVoo(voo.origem) === origemNormalizada &&
            normalizarValorVoo(voo.destino) === destinoNormalizado;

          if (!mesmaRota) {
            return false;
          }

          const mesmaData =
            dataVoo === null || !voo.partida
              ? dataVoo === null && !voo.partida
              : dataCalendarioVoo(voo.partida) === dataVoo;

          if (!mesmaData) {
            return false;
          }

          const mesmoNumero =
            Boolean(numeroNormalizado) &&
            normalizarValorVoo(voo.numero_voo) === numeroNormalizado;

          const mesmaReferencia =
            Boolean(referenciaNormalizada) &&
            normalizarValorVoo(voo.referencia) === referenciaNormalizada;

          return mesmoNumero || mesmaReferencia;
        });

        if (vooDuplicado) {
          setDuplicacaoPendente({
            viagemId,
            origem: origem || vooDuplicado.origem || "",
            destino: destino || vooDuplicado.destino || "",
            companhia:
              companhia || vooDuplicado.companhia || fornecedor || null,
            numeroVoo: numeroVoo || vooDuplicado.numero_voo || null,
            partida: dataHora || vooDuplicado.partida || null,
            referencia: referencia || vooDuplicado.referencia || null,
          });
          setAGuardarDescoberta(false);
          return;
        }
      }

      let emailOrigemGuardado = {
        guardado: true,
        anexosGuardados: 0,
        anexosTotais: emailOriginal.anexos.length,
      };

      if (categoria === "voo") {
        if (!origem || !destino) {
          throw new Error(
            "Não conseguimos determinar a origem e o destino deste voo a partir do email. Reveja os dados antes de guardar.",
          );
        }

        const { error } = await supabase.from("voos").insert({
          viagem_id: viagemId,
          companhia: companhia || fornecedor || null,
          numero_voo: numeroVoo || null,
          origem: origem.toUpperCase(),
          destino: destino.toUpperCase(),
          partida: dataIsoSegura(dataHora),
          referencia: referencia || null,
          preco: null,
        });

        if (error) throw error;
      } else if (categoria === "hotel") {
        const { error } = await supabase.from("alojamentos").insert({
          viagem_id: viagemId,
          nome: fornecedor || local || texto,
          morada: morada || local || null,
          check_in: dataIsoSegura(dataHora),
          check_out: dataIsoSegura(dataHoraFim),
          referencia: referencia || null,
          preco: null,
          notas: condicoes || null,
        });

        if (error) throw error;
      } else if (
        categoria === "transporte" ||
        categoria === "transfer"
      ) {
        const { error } = await supabase.from("transportes").insert({
          viagem_id: viagemId,
          tipo:
            categoria === "transfer"
              ? "Transfer"
              : fornecedor || operador || "Transporte",
          operador: operador || fornecedor || null,
          origem: origem || null,
          destino: destino || local || null,
          partida: dataIsoSegura(dataHora),
          chegada: dataIsoSegura(dataHoraFim),
          referencia: referencia || null,
          preco: null,
          notas: condicoes || null,
        });

        if (error) throw error;
      } else if (
        categoria === "bilhete" ||
        categoria === "documento"
      ) {
        // O email e os seus anexos são guardados depois, num único ponto,
        // para que o conteúdo original não fique duplicado na viagem.
      } else {
        const { error } = await supabase.from("informacoes").insert({
          viagem_id: viagemId,
          titulo: texto,
          conteudo: [
            fornecedor,
            operador,
            local,
            morada,
            referencia ? `Referência: ${referencia}` : null,
            condicoes,
          ]
            .filter(Boolean)
            .join("\n"),
        });

        if (error) throw error;
      }

      const tipoEmail =
        categoria === "bilhete" || categoria === "documento"
          ? categoria
          : "email";

      emailOrigemGuardado = await guardarEmailOrigemSemBloquear(
        viagemId,
        emailOriginal,
        {
          tipo: tipoEmail,
          qrConteudo: valorDaFicha(ficha, "codigo"),
        },
      );

      /*
       * Marcamos a mensagem como processada imediatamente depois de
       * guardar o conteúdo principal. Assim, mesmo que o registo do
       * email original falhe, uma segunda tentativa não cria uma cópia
       * da reserva.
       */
      const { error: erroMarcarProcessado } = await supabase
        .from("emails_gmail_processados" as any)
        .update({
          estado: "processado",
        })
        .eq("user_id", userId)
        .eq("gmail_message_id", emailId)
        .eq("estado", "pendente");

      if (erroMarcarProcessado) {
        console.error(
          "A informação principal foi guardada, mas não foi possível marcar o email Gmail como processado:",
          erroMarcarProcessado,
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["viagens"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["voos", viagemId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["alojamentos", viagemId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["transportes", viagemId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["documentos", viagemId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["informacoes", viagemId],
        }),
      ]);

      if (!emailOrigemGuardado.guardado) {
        toast.warning(
          "A informação foi adicionada, mas o email original não pôde ser guardado.",
        );
      } else if (
        emailOrigemGuardado.anexosTotais >
        emailOrigemGuardado.anexosGuardados
      ) {
        toast.warning(
          `A informação foi adicionada, mas apenas ${emailOrigemGuardado.anexosGuardados} de ${emailOrigemGuardado.anexosTotais} anexos do email puderam ser guardados.`,
        );
      } else {
        toast.success("Informação adicionada à viagem.");
      }

      setErro(null);
      setDescobertaAcao(null);

      /*
       * Retiramos o resultado dos dois estados locais. Isto evita que
       * o utilizador consiga voltar a clicar no mesmo cartão sem fazer
       * uma nova pesquisa.
       */
      setAnalises((anteriores) =>
        anteriores.filter((item) => item.email.id !== emailId),
      );
      setDescobertasAutomaticas((anteriores) =>
        anteriores.filter(
          (item) => item.gmail_message_id !== emailId,
        ),
      );
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível adicionar esta descoberta à viagem.";

      setErro(mensagem);
      toast.error(mensagem);

      /*
       * Se o email já estiver processado, removemos o cartão local para
       * que uma nova tentativa não volte a apresentar a mesma reserva.
       */
      if (
        mensagem.includes("já foi tratada") ||
        mensagem.includes("já foi tratada ou")
      ) {
        setAnalises((anteriores) =>
          anteriores.filter((item) => item.email.id !== emailId),
        );
        setDescobertasAutomaticas((anteriores) =>
          anteriores.filter(
            (item) => item.gmail_message_id !== emailId,
          ),
        );
      }

      console.error(
        "Erro ao guardar descoberta Gmail numa viagem:",
        erro,
      );
    } finally {
      setAGuardarDescoberta(false);
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
      window.dispatchEvent(new Event(GMAIL_AUTOMACAO_EVENT));
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
        remetente_email: null,
        recebido_em: null,
        anexos: [],
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
              onClick={() => void procurar("viagens")}
            >
              {aProcurar && modoAProcurar === "viagens"
                ? "A procurar e analisar…"
                : "Procurar informação relacionada com as minhas viagens"}
            </Button>

            <Button
              variant="outline"
              className="h-11"
              disabled={aProcurar || ocupado}
              onClick={() => void procurar("todos")}
            >
              {aProcurar && modoAProcurar === "todos"
                ? "A analisar todos os emails…"
                : "Analisar todos os emails"}
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
                    {modoAProcurar === "todos"
                      ? "A analisar todos os emails"
                      : "A analisar informação das suas viagens"}
                  </p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {modoAProcurar === "todos"
                      ? "Estamos a procurar comunicações concretas de viagem em toda a pesquisa Gmail."
                      : "Estamos a cruzar os emails e anexos com as viagens existentes, usando as datas como principal filtro."}
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
                      aoAbrirAcao={abrirAcao}
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
                      aoAbrirAcao={abrirAcao}
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
              O modo personalizado pesquisa desde 180 dias antes de cada viagem
              até 2 dias depois do fim, usando as datas como principal filtro. O
              modo "Analisar todos os emails" faz uma pesquisa sem esse filtro
              temporal.
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

      <Dialog
        open={duplicacaoPendente !== null}
        onOpenChange={(open) => {
          if (!open && !aGuardarDescoberta) {
            setDuplicacaoPendente(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" />
              Voo já adicionado
            </DialogTitle>
            <DialogDescription>
              Encontrámos um voo igual já guardado nesta viagem. Quer
              adicioná-lo novamente?
            </DialogDescription>
          </DialogHeader>

          {duplicacaoPendente ? (
            <div className="rounded-xl bg-secondary/50 p-4">
              <p className="text-sm font-semibold">
                {duplicacaoPendente.origem || "?"} → {duplicacaoPendente.destino || "?"}
              </p>
              <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
                {duplicacaoPendente.companhia ? (
                  <p>Companhia: {duplicacaoPendente.companhia}</p>
                ) : null}
                {duplicacaoPendente.numeroVoo ? (
                  <p>Voo: {duplicacaoPendente.numeroVoo}</p>
                ) : null}
                {duplicacaoPendente.partida ? (
                  <p>Partida: {formatarData(duplicacaoPendente.partida)}</p>
                ) : null}
                {duplicacaoPendente.referencia ? (
                  <p>Referência: {duplicacaoPendente.referencia}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDuplicacaoPendente(null)}
            >
              Não, manter apenas o existente
            </Button>
            <Button
              type="button"
              onClick={() => {
                const pendente = duplicacaoPendente;

                if (!pendente) {
                  return;
                }

                setDuplicacaoPendente(null);
                void guardarDescobertaNaViagem(
                  pendente.viagemId,
                  true,
                );
              }}
            >
              Sim, adicionar novamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogAcaoDescoberta
        aberta={descobertaAcao !== null}
        descoberta={descobertaAcao}
        viagens={viagens}
        aGuardar={aGuardarDescoberta}
        erro={erro}
        onOpenChange={(open) => {
          if (!open && !aGuardarDescoberta) {
            setDescobertaAcao(null);
          }
        }}
        onGuardar={guardarDescobertaNaViagem}
        onCriarViagem={criarViagemParaDescoberta}
      />

      {erro ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}