# Entrega privada de códigos de Roblox — NEXORA STORE

## Alcance
Esta mejora afecta **solo los pedidos cuyo juego es Roblox**. Las recargas de otros juegos siguen con el flujo habitual. No se reactivan las ventas de Robux en mantenimiento ni se crean códigos falsos. Usa exclusivamente códigos legítimos que puedan revenderse según las condiciones del proveedor y de Roblox.

## Flujo de atención (MVP)
1. El cliente compra el producto disponible y el pedido se registra en su cuenta.
2. El MVP abre `admin-pedidos.html` y verifica que el pago esté realmente confirmado.
3. Cuando el pedido Roblox esté en estado **Pago verificado** o **En proceso**, aparece un formulario para el código.
4. El MVP pega un código válido de Roblox (6 a 80 caracteres, letras/números/guiones) y confirma.
5. Una única transacción de Firestore crea el registro privado de entrega y cambia el pedido a **Completado**. No se puede completar Roblox sin código nuevo.
6. El cliente abre **Mis compras** (`compras.html`) desde su sesión, selecciona el pedido, toca **Ver mi código Roblox**, lo copia y puede abrir la página oficial `https://www.roblox.com/redeem`.
7. Los códigos pertenecen al pedido y no se enumeran públicamente. La entrega de un mismo pedido no puede editarse ni repetirse desde la web.

Los pedidos Roblox anteriores que ya estén completados, pero no tengan un registro nuevo de entrega, mostrarán un mensaje para contactar a soporte. No se fabrican códigos ni se modifica el historial anterior.

## Activación necesaria
**IMPORTANTE:** GitHub Pages no publica reglas de Firestore. Para evitar que aparezca un formulario que todavía no puede guardar códigos, realiza este orden:

1. Revisa esta rama y prepara la aprobación del cambio.
2. Publica **el archivo `firestore.rules` de esta rama** en Firebase, preferiblemente tras pasar los tests en emulador.
3. Fusiona la rama con `main` para publicar la interfaz web mediante GitHub Pages.
4. Comprueba el flujo con una cuenta de prueba y datos autorizados; no uses códigos vendibles reales en pruebas.

Comando con la CLI de Firebase, desde el repositorio actualizado (requiere acceso al proyecto Firebase):
```sh
firebase deploy --only firestore:rules --project nexora-store-6857a
```

Para probar localmente las reglas (requiere Node.js, Java, Firebase CLI y dependencias):
```sh
npm --prefix tests install
npm --prefix tests run test:rules
```

## Controles
- Solo un MVP con correo verificado puede entregar un código.
- No se entrega un código de Roblox si el pedido está pendiente de verificación, cancelado o completado.
- El cliente propietario puede leer el código de su pedido **solamente después** de completarlo.
- Otros clientes no tienen acceso al código.
- El código no se incluye en el repositorio ni en una URL pública.
- Si falta un código en un pedido antiguo, soporte debe revisar el caso; nunca inventar uno.

**Pendiente de validar:** los tests del emulador y la prueba de extremo a extremo con el Firebase del proyecto. Hasta aprobar y publicar ambos lados (reglas + web), la función no está activa en producción.
