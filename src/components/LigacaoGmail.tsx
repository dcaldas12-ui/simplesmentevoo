import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Hotel,
  Info,
  Mail,
  Plane,
  Ticket,
  Train,
  Trash2,
  XCircle,
} from "lucide-react";
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
import { analisarDocumento } from "@/lib/documentos-ia.functions";

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

function textoNormalizado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function determinarAcao(
  ficha: Ficha | null,
  assunto: string,
): AcaoSugerida {
  if (!ficha) {
    return "rever";
  }

  const categoria =
    typeof ficha["categoria"] === "string"
      ? ficha["categoria"].toLowerCase()
      : "";

  const tipoDocumento =
    typeof ficha["tipoDocumento"] === "string"
      ? ficha["tipoDocumento"]
      : "";

  const texto = textoNormalizado(
    `${assunto} ${tipoDocumento} ${categoria}`,
  );

  const termosPromocionais = [
    "promocao",
    "promocional",
    "newsletter",
    "oferta",
    "ofertas",
    "desconto",
    "descontos",
    "sale",
    "black friday",
    "melhor preco",
    "melhor preço",
    "ultimas partidas",
    "ultimas ofertas",
    "campaign",
    "marketing",
  ];

  const ePromocional = termosPromocionais.some((termo) =>
    texto.includes(textoNormalizado(termo)),
  );

  if (ePromocional && categoria !== "voo" && categoria !== "hotel") {
    return "ignorar";
  }

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
    return ePromocional ? "ignorar" : "guardar_informacao";
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

    case "ignorar":
      return {
        titulo: "Ignorar este email",
        descricao:
          "Parece tratar-se de uma comunicação promocional ou sem dados úteis de uma viagem.",
      };

    default:
      return {
        titulo: "Rever manualmente",
        descricao:
          "A análise não encontrou informação suficiente para decidir automaticamente.",
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
  const fichaBruta = fichaDaAnalise(item.resultado);

  const ficha: Ficha | null =
    fichaBruta && typeof fichaBruta === "object"
      ? (fichaBruta as Ficha)
      : null;

  const categoria = valorDaFicha(ficha, "categoria");
  const fornecedor = valorDaFicha(ficha, "fornecedor");
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

  if (item.estado === "a_analisar") {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium">
          {item.email.assunto || "Email sem assunto"}
        </p>

        <p className="mt-2 text-sm text-muted-foreground">
          A analisar este email…
        </p>
      </div>
    );
  }

  if (item.estado === "erro") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 text-destructive" />

          <div>
            <p className="text-sm font-medium">
              Não foi possível analisar este email
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {item.email.assunto || "Email sem assunto"}
            </p>

            <p className="mt-2 text-xs text-destructive">
              {item.erro}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const apresentacao = categoriaApresentacao(categoria);
  const Icon = apresentacao.icon;

  const acao = determinarAcao(ficha, item.email.assunto);
  const acaoTexto = textoDaAcao(acao);

  const tituloPrincipal = obterTituloPrincipal(
    ficha,
    item.email.assunto,
  );

  const categoriaTexto = formatarCategoria(categoria);

  const dataFormatada = formatarData(dataHora);
  const dataFimFormatada = formatarData(dataHoraFim);

  const dadosRelevantes = temDadosRelevantes(ficha);

  const eIgnorar = acao === "ignorar";

  return (
    <div
      className={
        eIgnorar
          ? "rounded-2xl border border-border bg-muted/30 p-4"
          : "rounded-2xl border border-border bg-card p-4 shadow-sm"
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            eIgnorar
              ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"
              : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          }
        >
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

      {!eIgnorar && dadosRelevantes ? (
        <div className="mt-4 rounded-xl bg-secondary/50 p-3">
          {categoria === "voo" && (origem || destino) ? (
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <span>{origem || "?"}</span>

              <ChevronRight className="size-4 text-muted-foreground" />

              <span>{destino || "?"}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <CampoResumo
              nome="Companhia"
              valor={companhia}
            />

            <CampoResumo
              nome="Operador"
              valor={operador}
            />

            <CampoResumo
              nome="Referência"
              valor={referencia}
            />

            <CampoResumo
              nome="Voo"
              valor={numeroVoo}
            />

            <CampoResumo
              nome="Local"
              valor={local}
            />

            <CampoResumo
              nome="Data"
              valor={dataFormatada}
            />

            <CampoResumo
              nome={dataFimFormatada ? "Até" : "Código"}
              valor={dataFimFormatada || codigo}
            />

            <CampoResumo
              nome="Quarto"
              valor={quarto}
            />

            <CampoResumo
              nome="Morada"
              valor={morada}
            />

            <CampoResumo
              nome="Tipo de documento"
              valor={tipoDocumento}
            />
          </div>
        </div>
      ) : null}

      <div
        className={
          eIgnorar
            ? "mt-4 rounded-xl border border-border bg-background p-3"
            : "mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"
        }
      >
        <div className="flex items-start gap-3">
          {eIgnorar ? (
            <XCircle className="mt-0.5 size-5 text-muted-foreground" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-5 text-primary" />
          )}

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

        {!eIgnorar ? (
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
              Adicionar à viagem
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
              Ignorar
            </Button>
          </div>
        ) : (
          <div className="mt-3">
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
        )}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Ver detalhes técnicos
        </summary>

        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">
          {JSON.stringify(item.resultado, null, 2)}
        </pre>
      </details>
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

  const [resultados, setResultados] = useState<EmailEncontrado[]>([]);
  const [analises, setAnalises] = useState<ResultadoAnalise[]>([]);
  const [ignorados, setIgnorados] = useState<string[]>([]);

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
    setAnalises([]);
    setIgnorados([]);

    try {
      const emails = await procurarEmails();

      setResultados(emails);

      if (emails.length === 0) {
        toast.info("Não encontrámos emails de viagem.");
        return;
      }

      toast.success(
        `${emails.length} email(s) encontrado(s). A analisar…`,
      );

      const estadosIniciais: ResultadoAnalise[] = emails.map(
        (email) => ({
          email,
          estado: "a_analisar",
        }),
      );

      setAnalises(estadosIniciais);

      for (const email of emails) {
        try {
          const textoCompleto =
            `${email.assunto}\n\n${email.texto}`.trim();

          const resultado = await analisar({
            data: {
              nome: email.assunto || "Email Gmail",
              texto: textoCompleto,
            },
          });

          setAnalises((anteriores) =>
            anteriores.map((item) =>
              item.email.id === email.id
                ? {
                    ...item,
                    estado: "analisado",
                    resultado,
                  }
                : item,
            ),
          );
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.message
              : "Não foi possível analisar este email.";

          setAnalises((anteriores) =>
            anteriores.map((item) =>
              item.email.id === email.id
                ? {
                    ...item,
                    estado: "erro",
                    erro: msg,
                  }
                : item,
            ),
          );
        }
      }

      toast.success("Análise dos emails concluída.");
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

  function ignorar(id: string) {
    setIgnorados((anteriores) => {
      if (anteriores.includes(id)) {
        return anteriores.filter((item) => item !== id);
      }

      return [...anteriores, id];
    });
  }

  const ligado = estado.data?.ligado === true;
  const configurado = estado.data?.configurado !== false;

  const analisesVisiveis = analises.filter(
    (item) => !ignorados.includes(item.email.id),
  );

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
              disabled={ocupado || aProcurar}
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

          {analises.length > 0 ? (
            <div className="mt-5 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    Resultados da análise
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    A ViatOrbis analisa os emails e sugere o que fazer com
                    cada resultado.
                  </p>
                </div>

                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                  {analisesVisiveis.length} de {analises.length}
                </span>
              </div>

              {analisesVisiveis.map((item) => (
                <CartaoResultado
                  key={item.email.id}
                  item={item}
                  aoIgnorar={ignorar}
                />
              ))}

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
            </div>
          ) : resultados.length > 0 ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium">
                Emails encontrados ({resultados.length})
              </p>

              {resultados.map((email) => (
                <div
                  key={email.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <p className="text-sm font-medium">
                    {email.assunto || "Email sem assunto"}
                  </p>
                </div>
              ))}
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