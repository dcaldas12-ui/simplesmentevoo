import { Loader2, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PdfInterno } from "@/components/PdfInterno";

type Props = {
  aberto: boolean;
  nome: string;
  url: string | null;
  mimeType: string | null;
  aCarregar?: boolean | undefined;
  erro?: string | null | undefined;
  /** Entra automaticamente em modo de leitura assim que o ficheiro estiver pronto. */
  iniciarLeitura?: boolean | undefined;
  onTentarNovamente?: (() => void) | undefined;
  onFechar: () => void;
};

type WakeLock = { released: boolean; release: () => Promise<void> };

/**
 * Visualizador de PDFs e imagens em ecrã completo.
 *
 * Não depende da Fullscreen API (o Safari do iPhone não a suporta em elementos
 * comuns): o diálogo ocupa sempre todo o viewport com `100dvh` e respeita as
 * safe-area insets, mantendo a barra de controlos acessível no topo.
 */
export function VisualizadorDocumento({
  aberto,
  nome,
  url,
  mimeType,
  aCarregar,
  erro,
  iniciarLeitura,
  onTentarNovamente,
  onFechar,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLock | null>(null);
  const [leitura, setLeitura] = useState(false);
  const [ecraAtivo, setEcraAtivo] = useState(false);

  const éImagem = (mimeType ?? "").startsWith("image/");
  const éPdf = mimeType === "application/pdf" || nome.toLowerCase().endsWith(".pdf");

  const libertarWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      /* ignorado */
    }
    wakeLockRef.current = null;
    setEcraAtivo(false);
  }, []);

  const pedirWakeLock = useCallback(async () => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<WakeLock> };
    };
    if (!nav.wakeLock) return;
    try {
      wakeLockRef.current = await nav.wakeLock.request("screen");
      setEcraAtivo(true);
    } catch {
      setEcraAtivo(false);
    }
  }, []);

  const entrarLeitura = useCallback(async () => {
    setLeitura(true);
    // Fullscreen é um extra: no iOS falha e a leitura continua em ecrã completo simulado.
    const el = containerRef.current;
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen();
      } catch {
        /* o browser pode recusar; mantemos o modo de leitura na página */
      }
    }
    await pedirWakeLock();
  }, [pedirWakeLock]);

  // Abre já em modo de leitura quando pedido a partir do cartão do documento.
  const jaAutoAbriu = useRef(false);
  useEffect(() => {
    if (!aberto) {
      jaAutoAbriu.current = false;
      return;
    }
    if (iniciarLeitura && url && !aCarregar && !jaAutoAbriu.current) {
      jaAutoAbriu.current = true;
      void entrarLeitura();
    }
  }, [aberto, iniciarLeitura, url, aCarregar, entrarLeitura]);

  const sairLeitura = useCallback(async () => {
    setLeitura(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignorado */
      }
    }
    await libertarWakeLock();
  }, [libertarWakeLock]);

  // Sai do modo de leitura quando o utilizador sai do ecrã inteiro pelo sistema.
  useEffect(() => {
    const aoMudar = () => {
      if (!document.fullscreenElement) {
        setLeitura(false);
        void libertarWakeLock();
      }
    };
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, [libertarWakeLock]);

  // Repõe o wake lock quando a app volta a ficar visível durante a leitura.
  useEffect(() => {
    const aoVisivel = () => {
      if (leitura && document.visibilityState === "visible" && !wakeLockRef.current) {
        void pedirWakeLock();
      }
    };
    document.addEventListener("visibilitychange", aoVisivel);
    return () => document.removeEventListener("visibilitychange", aoVisivel);
  }, [leitura, pedirWakeLock]);

  useEffect(() => {
    if (!aberto) {
      setLeitura(false);
      void libertarWakeLock();
    }
  }, [aberto, libertarWakeLock]);

  useEffect(() => () => void libertarWakeLock(), [libertarWakeLock]);

  // Bloqueia o scroll da página por trás, para o conteúdo do documento receber o gesto.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  // Gesto/botão "voltar" fecha o visualizador em vez de sair da página.
  useEffect(() => {
    if (!aberto) return;
    window.history.pushState({ visualizador: true }, "");
    const aoVoltar = () => {
      if (leitura) void sairLeitura();
      onFechar();
    };
    window.addEventListener("popstate", aoVoltar);
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      if (window.history.state?.visualizador) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclado = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (leitura) void sairLeitura();
      else onFechar();
    };
    window.addEventListener("keydown", aoTeclado);
    return () => window.removeEventListener("keydown", aoTeclado);
  }, [aberto, leitura, sairLeitura, onFechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overscroll-contain bg-black/80"
      style={{ height: "100dvh" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizador do ficheiro ${nome}`}
    >
      <div
        ref={containerRef}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          ...(leitura ? { backgroundColor: "#ffffff", color: "#111111" } : {}),
        }}
        className={`mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden sm:my-4 sm:rounded-2xl sm:border sm:border-border ${
          leitura ? "max-w-none bg-white" : "bg-card"
        }`}
      >
        <div
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2"
          style={
            leitura
              ? { backgroundColor: "#ffffff", borderColor: "#d4d4d4" }
              : { backgroundColor: "var(--card)" }
          }
        >
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{nome}</p>
          {leitura ? (
            <Button
              size="sm"
              variant="outline"
              className="h-11 min-w-11"
              onClick={() => void sairLeitura()}
            >
              <Minimize2 className="size-4" />{" "}
              <span className="hidden sm:inline">Sair do modo leitura</span>
              <span className="sm:hidden">Sair</span>
            </Button>
          ) : url && !aCarregar ? (
            <Button size="sm" className="h-11 min-w-11" onClick={() => void entrarLeitura()}>
              <Maximize2 className="size-4" />{" "}
              <span className="hidden sm:inline">Ler em ecrã inteiro</span>
              <span className="sm:hidden">Ler</span>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            className="h-11 min-w-11"
            aria-label="Fechar visualizador"
            onClick={onFechar}
          >
            <X className="size-4" /> <span className="hidden sm:inline">Fechar</span>
          </Button>
        </div>

        {leitura ? (
          <p
            className="px-3 py-2 text-xs"
            style={{ backgroundColor: "#f5f5f5", color: "#3f3f3f" }}
            role="note"
          >
            {ecraAtivo
              ? "O ecrã fica ativo enquanto lê. "
              : "Não foi possível manter o ecrã ativo neste dispositivo. "}
            Por restrições do Android, do iPhone e do browser, a app não consegue forçar a
            luminosidade máxima do sistema — aumente-a manualmente se precisar de mais brilho para
            leitura de códigos. Use “Sair” no topo para voltar.
          </p>
        ) : null}

        <div
          className="min-h-0 flex-1 touch-pan-y overflow-auto overscroll-contain"
          style={leitura ? { backgroundColor: "#ffffff" } : undefined}
        >
          {aCarregar ? (
            <p className="flex h-full items-center justify-center gap-2 p-6 text-sm" role="status">
              <Loader2 className="size-4 animate-spin" /> A abrir o ficheiro…
            </p>
          ) : erro || !url ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="max-w-md text-sm text-destructive" role="alert">
                {erro ?? "Não foi possível abrir este ficheiro."}
              </p>
              {onTentarNovamente ? (
                <Button variant="outline" className="h-11" onClick={onTentarNovamente}>
                  <RefreshCw className="size-4" /> Tentar novamente
                </Button>
              ) : null}
            </div>
          ) : éImagem ? (
            <div className="flex min-h-full items-center justify-center p-3">
              <img
                src={url}
                alt={`Pré-visualização do documento ${nome}`}
                className="max-h-full w-auto max-w-full rounded-lg object-contain"
              />
            </div>
          ) : éPdf ? (
            <PdfInterno url={url} nome={nome} />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="max-w-md text-sm text-destructive" role="alert">
                Este formato não pode ser apresentado dentro da app.
              </p>
              {onTentarNovamente ? (
                <Button variant="outline" className="h-11" onClick={onTentarNovamente}>
                  <RefreshCw className="size-4" /> Tentar novamente
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
