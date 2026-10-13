# Activar notificaciones de NEXORA

La interfaz funciona en la web y en la PWA instalable de NEXORA. Publicar en GitHub Pages NO despliega las reglas ni las Cloud Functions de Firebase. La campana dentro de la web funciona sin push; los avisos con la app cerrada requieren el despliegue completo y el permiso del dispositivo. Una APK que cargue la web en un WebView no obtiene automáticamente notificaciones push nativas: necesita integrar FCM para Android en el proyecto de la APK. No anunciar push como activo hasta completar una prueba real.

## Activación (administrador del proyecto)

1. En Firebase, proyecto `nexora-store-6857a`, publica `firestore.rules` completo. Conserva las reglas anteriores y añade permisos de notificaciones. No usar reglas abiertas.
2. Para desplegar Cloud Functions, Firebase exige un proyecto con facturación Blaze habilitada. El titular del proyecto debe evaluar los posibles cargos y configurar límites/alertas de presupuesto antes de activarlo. No introducir una cuenta de servicio ni claves privadas en la web o GitHub.
3. En un ordenador con Node 22 y Firebase CLI instalado, desde este repositorio:

   ```sh
   npm --prefix functions ci
   firebase login
   firebase deploy --only firestore:rules,functions:nexora-notifications --project nexora-store-6857a
   ```

4. En Firebase → Configuración del proyecto → Cloud Messaging → Certificados push web, genera una clave pública VAPID. Abre `admin-anuncios.html` con una cuenta MVP verificada, despliega «Activar avisos en el celular» y guarda la clave **pública**.
5. En Firestore configura opcionalmente TTL para `notificationDeliveries.expiresAt` para eliminar entregas antiguas. Sin TTL el historial de entregas crece; no afecta al funcionamiento.
6. Cada persona inicia sesión, abre la campana y pulsa «Activar en este celular». Debe permitir notificaciones. La cuenta MVP también necesita activar cada dispositivo.

## Comprobación real antes de anunciarlo

- Usuario A crea un pedido de prueba autorizado. El MVP recibe un aviso y ve el pedido.
- MVP solicita atención; A ve el texto privado y puede ir a soporte. Un usuario B no puede leerlo.
- MVP marca el pedido completado; A ve el estado en su campana y recibe un aviso.
- Usuario A solicita una recarga de saldo por Yape. El MVP ve el aviso «Recarga de saldo pendiente» y puede abrir la página de aprobación; no se acredita dinero automáticamente.
- MVP aprueba la recarga después de comprobar el pago: el saldo de A se acredita mediante el sistema existente y A recibe «¡Tu saldo fue acreditado!». Si el MVP rechaza otra solicitud, el cliente ve «Recarga no aprobada».
- Usuario B no puede leer las notificaciones ni el historial de recargas de A.
- MVP publica un anuncio; usuarios autenticados lo ven y dispositivos registrados reciben un aviso.
- Repetir con la PWA cerrada. Probar permiso denegado, desconexión y cambio/cierre de sesión en un dispositivo compartido. El service worker descarta mensajes de otra cuenta.
- Los permisos de notificaciones y restricciones del sistema operativo pueden afectar la entrega. La campana conserva los avisos aunque el usuario no permita push.

## Implementación

- `notifications.js`: campana, estados de pedidos desde sus registros, avisos privados y anuncios.
- `admin-anuncios.html`: centro de mensajes MVP con acceso directo a pendientes, historial de anuncios, publicación exclusiva con email verificado y configuración de clave pública.
- `notifications.js`: además de los avisos del servidor, muestra solicitudes de recarga del cliente y recargas pendientes del MVP mediante suscripciones en tiempo real, sin exigir que estén desplegadas las Cloud Functions.
- `admin-pedidos.html`: solicitud de atención del cliente.
- `functions/`: eventos de pedidos y recargas Yape, avisos al MVP cuando hay recargas pendientes, confirmaciones privadas al cliente cuando cambian a aprobadas/rechazadas, cola de entregas, difusión de anuncios y tokens únicos por dispositivo. Credenciales de servidor administradas por Firebase.
- `service-worker.js`: push de datos con identidad persistida, deduplicación de eventos y navegación restringida al sitio.

Los eventos de Firebase pueden repetirse. Los IDs de entrega y los avisos MVP son deterministas; el dispositivo descarta duplicados durante dos días. La entrega no constituye confirmación de lectura. El estado leído se guarda por cuenta en cada navegador. Las notificaciones de pantalla bloqueada contienen texto genérico; los detalles solo se muestran tras iniciar sesión. La bandeja muestra hasta 100 avisos recientes. Los anuncios llegan a cuentas con registro `users`; las cuentas de compra ya se registran mediante el flujo existente.
