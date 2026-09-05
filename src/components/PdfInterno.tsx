import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { Button } from "@/components/ui/button";

GlobalWorkerOptions.workerSrc = workerSrc;

type Props = {
  url: string;
  nome: string;
};

function PaginaPdf({ pdf, numero }: { pdf: PDFDocumentProxy; numero: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let tarefa: { cancel: () => void } | null = null;

    async function desenhar() {
      const canvas = canvasRef.current;
      const wrapper = wrapperRef.current;
      if (!canvas || !wrapper) return;
      try {
        const pagina = await pdf.getPage(numero);
        if (cancelado) return;
        const base = pagina.getViewport({ scale: 1 });
        const largura = Math.max(280, Math.min(wrapper.clientWidth, 1100));
        const escalaCss = largura / base.width;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pagina.getViewport({ scale: escalaCss * pixelRatio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
        const contexto = canvas.getContext("2d", { alpha: false });
        if (!contexto) throw new Error("Canvas indisponível");
        const render = pagina.render({ canvas, canvasContext: contexto, viewport });
        tarefa = render;
        await render.promise;
      } catch (e) {
        if (!cancelado && !(e instanceof Error && e.name === "RenderingCancelledException")) {
          setErro(true);
        }
      }
    }

    void desenhar();
    return () => {
      cancelado = true;
      tarefa?.cancel();
    };
  }, [numero, pdf]);

  return (
    <div ref={wrapperRef} className="flex w-full justify-center" aria-label={`Página ${numero}`}>
      {erro ? (
        <p className="p-6 text-sm text-destructive">Não foi possível apresentar esta página.</p>
      ) : (
        <canvas ref={canvasRef} className="max-w-full bg-white shadow-sm" />
      )}
    </div>
  );
}

export function PdfInterno({ url, nome }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    const tarefa = getDocument({ url });
    setPdf(null);
    setErro(null);
    tarefa.promise
      .then((documento) => {
        if (ativo) setPdf(documento);
        else void documento.destroy();
      })
      .catch(() => {
        if (!ativo) return;
        setErro("O PDF foi descarregado, mas não foi possível apresentar o conteúdo.");
      });
    return () => {
      ativo = false;
      void tarefa.destroy();
    };
  }, [url, tentativa]);

  if (erro) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-md text-sm text-destructive" role="alert">
          {erro}
        </p>
        <Button variant="outline" onClick={() => setTentativa((valor) => valor + 1)}>
          <RefreshCw className="size-4" /> Tentar novamente
        </Button>
      </div>
    );
  }

  if (!pdf) {
    return (
      <p className="flex min-h-64 items-center justify-center gap-2 p-6 text-sm" role="status">
        <Loader2 className="size-4 animate-spin" /> A preparar o PDF…
      </p>
    );
  }

  return (
    <div className="space-y-4 bg-muted/40 p-2 sm:p-4" aria-label={`Conteúdo do PDF ${nome}`}>
      {Array.from({ length: pdf.numPages }, (_, indice) => (
        <PaginaPdf key={indice + 1} pdf={pdf} numero={indice + 1} />
      ))}
    </div>
  );
}
