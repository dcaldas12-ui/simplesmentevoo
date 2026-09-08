import { Share, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PromptEvent = Event & { prompt: () => Promise<void> };

const CHAVE = "sv-instalar-dispensado";

export function InstallHint() {
  const [visivel, setVisivel] = useState(false);
  const [evento, setEvento] = useState<PromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(CHAVE) === "1") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const eIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    const pequeno = window.matchMedia("(max-width: 768px)").matches;

    if (eIos && pequeno) {
      setIos(true);
      setVisivel(true);
    }

    function aoPoderInstalar(e: Event) {
      e.preventDefault();
      setEvento(e as PromptEvent);
      setVisivel(true);
    }

    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    return () => window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
  }, []);

  function dispensar() {
    setVisivel(false);
    try {
      localStorage.setItem(CHAVE, "1");
    } catch {
      /* ignorar */
    }
  }

  if (!visivel) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)] md:inset-x-auto md:bottom-4 md:right-4 md:max-w-sm">
      <div className="flex items-start gap-3">
        <img
          src="/icons/icon-192.png"
          alt="Ícone ViatOrbis"
          width={40}
          height={40}
          loading="lazy"
          className="size-10 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Adicionar ao ecrã principal</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ios ? (
              <>
                No Safari, toque em <Share className="inline size-3" /> Partilhar e depois em
                “Adicionar ao ecrã principal”. Abre como um atalho no telemóvel — não é uma app
                das lojas.
              </>
            ) : (
              "Fica com um atalho no telemóvel, com ecrã inteiro. É um atalho do site, não uma app das lojas."
            )}
          </p>
          {evento ? (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                void evento.prompt();
                dispensar();
              }}
            >
              Adicionar
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar sugestão"
          className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
