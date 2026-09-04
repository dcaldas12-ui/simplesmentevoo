/** Registo controlado do service worker da app (offline).
 * Nunca regista em desenvolvimento nem nas pré-visualizações do editor. */

const CAMINHO_SW = "/sw.js";

function contextoBloqueado() {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function anularRegistosDaApp() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registos = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registos
      .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? "").endsWith(CAMINHO_SW))
      .map((r) => r.unregister()),
  );
}

export function registarServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (contextoBloqueado()) {
    void anularRegistosDaApp();
    return;
  }
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
