import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useIdioma } from "@/lib/i18n";

const CHAVE = "simplesmentevoo.consentimento";

export function ConsentimentoCookies() {
  const { t } = useIdioma();
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(CHAVE)) setMostrar(true);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  if (!mostrar) return null;

  function aceitar() {
    try {
      window.localStorage.setItem(CHAVE, new Date().toISOString());
    } catch {
      /* armazenamento indisponível */
    }
    setMostrar(false);
  }

  return (
    <div
      role="dialog"
      aria-label={t("consent.titulo")}
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto w-[min(40rem,calc(100%-1.5rem))] rounded-2xl border border-border bg-card p-4 shadow-lg md:bottom-4"
    >
      <h2 className="font-display text-sm font-semibold">{t("consent.titulo")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("consent.texto")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-10" onClick={aceitar}>
          {t("consent.aceitar")}
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-10">
          <Link to="/privacidade">{t("consent.saber")}</Link>
        </Button>
      </div>
    </div>
  );
}
