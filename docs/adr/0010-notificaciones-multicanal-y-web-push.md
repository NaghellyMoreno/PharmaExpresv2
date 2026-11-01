# 0010. Notificaciones multicanal, plantillas sin datos sensibles y notificaciones web

- **Estado:** Propuesta (iPhone Pendiente)
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.1, 3.2, 3.3 y 3.6; guía de agentes (architect, punto 6); HU-020; RNF-001; F042, F043, F066

## Contexto
Confirmado: cada notificación va a navegadores y chats con vinculación vigente, al SMS registrado y al correo si existe; ninguna incluye medicamentos ni diagnósticos; eventos notificados: confirmación, cancelación, expiración, pérdida de lo no recogido, recordatorios, cambios por reverificación, 48 h y crónicos (P12); las cancelaciones por revocación no se notifican una a una.

## Decisión
1. **Bandeja de salida:** cada caso de uso inserta en `notification_outbox` dentro de su transacción; después del commit se intenta el envío con `waitUntil`; el despachador (ADR 0011) reintenta lo pendiente. Envíos idempotentes por (notificación, medio, destino).
2. **Resolución de destinos al enviar** (no al crear): navegadores y chats con vinculación vigente en ese momento; celular y correo leídos de `sim.affiliates`.
3. **Plantillas cerradas:** catálogo en código, una por evento, con parámetros tipados de una lista permitida: fecha, hora de la ventana, nombre ficticio del punto, cantidad de citas, código de motivo genérico (por ejemplo, `affiliation_changed`), siguiente paso. No existe parámetro para medicamento ni diagnóstico. La confirmación de revocación tampoco lleva el punto (sección 3.2). Un disparador en la base de datos rechaza claves fuera de la lista. Prueba automática: busca en todos los mensajes capturados los nombres de medicamentos y diagnósticos del catálogo simulado.
4. **Enlaces:** solo a la web o al bot sin parámetros con datos; la cancelación desde un recordatorio ocurre dentro del flujo autenticado (P11).
5. **Notificaciones web:** estándar Web Push con claves VAPID y la librería `web-push` 3.6.7 (verificada en npm, motor Node 16 o superior). El service worker del SPA se registra solo cuando el usuario activa las notificaciones con un gesto; la suscripción se guarda en `browser_devices.push_subscription` con `PUT /me/push-subscription`. El contenido de la notificación es el mismo texto de la plantilla. Suscripciones que responden 404/410 se borran.
6. **Vinculación vencida:** sin vinculación vigente, ese navegador o chat no recibe nada; SMS y correo siguen (sección 3.3).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Firebase Cloud Messaging | Panel y SDK | Otra dependencia y cuenta; Web Push estándar basta |
| Envío directo sin bandeja | Simple | Un fallo del proveedor pierde el aviso |
| Texto libre por evento | Flexible | Riesgo de filtrar medicamentos (invariante 1) |

## Consecuencias
- **Pendiente (usuaria):** según WebKit, en iPhone y iPad las notificaciones web solo funcionan en apps web añadidas a la pantalla de inicio; la aplicación móvil instalable está fuera de alcance (sección 3.10). Opciones: (a) aceptar que en iOS no lleguen avisos web (los demás medios sí); (b) permitir añadir la web a la pantalla de inicio con un manifiesto, lo que podría leerse como "aplicación instalable". Architect no lo resuelve por su cuenta.
- Los navegadores pueden negar el permiso (riesgo Inferido del brief).
