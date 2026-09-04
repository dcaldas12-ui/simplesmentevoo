import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/** Barra discreta que avisa quando o telemóvel fica sem ligação. */
export function EstadoLigacao() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const atualizar = () => setOffline(!navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>Sem ligação à internet. Vê as páginas já abertas; pesquisas e envios ficam em espera.</span>
    </div>
  );
}
