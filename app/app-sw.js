/* Service worker do App do Aluno hospedado — recebe as notificações push. */
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.t || "TORQUE FIT 💜", {
    body: d.b || "",
    icon: "../assets/icons/icon-192.png",
    badge: "../assets/icons/icon-192.png",
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window" }).then(function (lista) {
    if (lista.length) return lista[0].focus();
    return clients.openWindow("./");
  }));
});
