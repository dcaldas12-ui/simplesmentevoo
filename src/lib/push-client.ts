/** Utilitários de browser para notificações push. Só correm no cliente. */

export type SuportePush =
  | "suportado"
  | "sem-service-worker"
  | "sem-push"
  | "sem-notificacoes"
  | "ios-precisa-instalar";

export function verificarSuporte(): SuportePush {
  if (typeof window === "undefined") return "sem-service-worker";
  if (!("serviceWorker" in navigator)) return "sem-service-worker";
  if (!("Notification" in window)) return "sem-notificacoes";
  const janela = globalThis as unknown as Window;
  if (!("PushManager" in janela)) {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua);
    const standalone =
      janela.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (ios && !standalone) return "ios-precisa-instalar";
    return "sem-push";
  }
  return "suportado";
}

function base64UrlParaUint8(base64: string) {
  const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const normal = preenchido.replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(normal);
  const saida = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i += 1) saida[i] = bruto.charCodeAt(i);
  return saida;
}

async function registoPush() {
  return navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
}

export async function subscricaoAtual() {
  if (verificarSuporte() !== "suportado") return null;
  const registos = await navigator.serviceWorker.getRegistrations();
  for (const registo of registos) {
    const sub = await registo.pushManager.getSubscription();
    if (sub) return sub;
  }
  return null;
}

export async function pedirPermissaoESubscrever(chavePublica: string) {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return { permissao, subscricao: null as PushSubscription | null };

  const registo = await registoPush();
  await navigator.serviceWorker.ready;
  const existente = await registo.pushManager.getSubscription();
  const subscricao =
    existente ??
    (await registo.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlParaUint8(chavePublica),
    }));

  return { permissao, subscricao };
}

export function dadosDaSubscricao(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return {
    endpoint: json.endpoint ?? sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };
}

export async function anularSubscricao() {
  const sub = await subscricaoAtual();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
