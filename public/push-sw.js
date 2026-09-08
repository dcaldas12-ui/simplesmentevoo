/* Service worker dedicado a notificações push (não faz cache da app). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { title: "ViatOrbis", body: event.data ? event.data.text() : "" };
  }

  const titulo = dados.title || "ViatOrbis";
  const opcoes = {
    body: dados.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: dados.tag || "simplesmente-voo",
    data: { url: dados.url || "/avisos" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/avisos";
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const janela of janelas) {
        if ("focus" in janela) {
          await janela.focus();
          if ("navigate" in janela) await janela.navigate(destino);
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
