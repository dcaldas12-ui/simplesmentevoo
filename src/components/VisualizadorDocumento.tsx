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
 * Visualizador de PDFs e imagens com modo de leitura em ecrã inteiro,
 * fundo claro de alto contraste e pedido de Screen Wake Lock quando suportado.
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
      className="fixed inset-0 z-50 flex flex-col bg-black/70 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizador do ficheiro ${nome}`}
    >
      <div
        ref={containerRef}
        style={leitura ? { backgroundColor: "#ffffff", color: "#111111" } : undefined}
        className={`mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-none border border-border sm:rounded-2xl ${
          leitura ? "max-w-none" : "bg-card"
        }`}
      >
        <div
          className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2"
          style={leitura ? { backgroundColor: "#ffffff", borderColor: "#d4d4d4" } : undefined}
        >
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{nome}</p>
          {leitura ? (
            <Button size="sm" variant="outline" onClick={() => void sairLeitura()}>
              <Minimize2 className="size-4" /> Sair do modo leitura
            </Button>
          ) : url && !aCarregar ? (
            <Button size="sm" onClick={() => void entrarLeitura()}>
              <Maximize2 className="size-4" /> Ler em ecrã inteiro
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" aria-label="Fechar visualizador" onClick={onFechar}>
            <X className="size-4" />
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
            leitura de códigos.
          </p>
        ) : null}

        <div
          className="flex-1 overflow-auto"
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
                <Button variant="outline" onClick={onTentarNovamente}>
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
                <Button variant="outline" onClick={onTentarNovamente}>
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
