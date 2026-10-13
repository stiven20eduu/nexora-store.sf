# Activar notificaciones de NEXORA

La interfaz funciona en la web/PWA existente. Publicar en GitHub Pages NO despliega las reglas ni las funciones de Firebase. No anunciar push como activo hasta completar una prueba real.

## Activación (administrador del proyecto)

1. En Firebase, proyecto `nexora-store-6857a`, publica `firestore.rules` completo. Conserva las reglas anteriores y añade permisos de notificaciones. No usar reglas abiertas.
2. Para las funciones, Firebase exige un proyecto con facturación Blaze habilitada. El propietario debe decidir si acepta ese coste. No introducir una cuenta de servicio ni claves privadas en la web o GitHub.
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
- MVP publica un anuncio; usuarios autenticados lo ven y dispositivos registrados reciben un aviso.
- Repetir con la PWA cerrada. Probar permiso denegado, desconexión y cambio/cierre de sesión en un dispositivo compartido. El service worker descarta mensajes de otra cuenta.
- Los permisos de notificaciones y restricciones del sistema operativo pueden afectar la entrega. La campana conserva los avisos aunque el usuario no permita push.

## Implementación

- `notifications.js`: campana, estados de pedidos desde sus registros, avisos privados y anuncios.
- `admin-anuncios.html`: publicación exclusiva para MVP con email verificado y configuración de clave pública.
- `admin-pedidos.html`: solicitud de atención del cliente.
- `functions/`: eventos de pedidos, cola de entregas, difusión de anuncios, tokens únicos por dispositivo. Credenciales de servidor administradas por Firebase.
- `service-worker.js`: push de datos con identidad persistida, deduplicación de eventos y navegación restringida al sitio.

Los eventos de Firebase pueden repetirse. Los IDs de entrega y los avisos MVP son deterministas; el dispositivo descarta duplicados durante dos días. La entrega no constituye confirmación de lectura. El estado leído se guarda por cuenta en cada navegador. Las notificaciones de pantalla bloqueada contienen texto genérico; los detalles solo se muestran tras iniciar sesión. La bandeja muestra hasta 100 avisos recientes. Los anuncios llegan a cuentas con registro `users`; las cuentas de compra ya se registran mediante el flujo existente.
