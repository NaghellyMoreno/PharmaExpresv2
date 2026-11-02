# 0010. Notificaciones multicanal, plantillas sin datos sensibles y notificaciones web

- **Estado:** Aceptada (2026-11-01). La usuaria escogió la opción (a) para iPhone (R-23).
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.1, 3.2, 3.3, 3.5, 3.6 y 3.10; guía de agentes (architect, punto 6); HU-020, HU-037 (criterio 4), HU-038 (criterio 6); RNF-001, RNF-034; F042, F043, F066, F098, F099

## Contexto
Confirmado: cada notificación va a navegadores y chats con vinculación vigente, al SMS registrado y al correo si existe; ninguna incluye medicamentos ni diagnósticos; eventos notificados: confirmación, cancelación, expiración, pérdida de lo no recogido, recordatorios, cambios por reverificación, 48 h y crónicos (P12); las cancelaciones por revocación no se notifican una a una; las cancelaciones por inactividad no se notifican (usuaria, decisión 2 del 2026-11-01); todo SMS empieza por "Pharma Express:", no lleva tildes y tiene máximo 160 caracteres (RNF-034).

## Decisión
1. **Bandeja de salida:** cada caso de uso inserta en `notification_outbox` dentro de su transacción; después del commit se intenta el envío con `waitUntil`; el despachador (ADR 0011) reintenta lo pendiente. Envíos idempotentes por (notificación, medio, destino).
2. **Resolución de destinos al enviar** (no al crear): navegadores y chats con vinculación vigente en ese momento; celular y correo leídos de `sim.affiliates`.
3. **Plantillas cerradas:** catálogo en código, una por evento, con parámetros tipados de una lista permitida: fecha, hora de la ventana, nombre ficticio del punto, cantidad de citas, código de motivo genérico (por ejemplo, `affiliation_changed`), siguiente paso. No existe parámetro para medicamento ni diagnóstico. La confirmación de revocación tampoco lleva el punto (sección 3.2). Un disparador en la base de datos rechaza claves fuera de la lista. Prueba automática: busca en todos los mensajes capturados los nombres de medicamentos y diagnósticos del catálogo simulado.
4. **Formato del SMS (RNF-034):** cada plantilla tiene una variante SMS sin tildes que empieza por "Pharma Express:". Una prueba renderiza cada plantilla con los valores más largos posibles de sus parámetros (por ejemplo, el nombre de punto más largo permitido, 120 caracteres) y falla si pasa de 160 caracteres o si contiene caracteres fuera de GSM-7. Si el nombre del punto no cabe, la variante SMS omite el punto y remite a la web o al bot (Decisión técnica).
5. **Eventos sin notificación:** cierre por inactividad de solicitudes y fórmulas (Confirmado) y cancelaciones de citas por revocación (la confirmación de la revocación es el único aviso). Cancelar una solicitud notifica la cancelación de cada cita activa que tenía, como cualquier cancelación de cita, y no envía un aviso aparte de la solicitud (Inferido en HU-037, criterio 4).
6. **Enlaces:** solo a la web o al bot sin parámetros con datos; la cancelación desde un recordatorio ocurre dentro del flujo autenticado (P11).
7. **Notificaciones web:** estándar Web Push con claves VAPID y la librería `web-push` 3.6.7 (verificada en npm, motor Node 16 o superior). El service worker del SPA se registra solo cuando el usuario activa las notificaciones con un gesto; la suscripción se guarda en `browser_devices.push_subscription` con `PUT /me/push-subscription` y se borra con `DELETE /me/push-subscription`. El contenido de la notificación es el mismo texto de la plantilla. Suscripciones que responden 404/410 se borran.
8. **iPhone y iPad (usuaria, opción (a), Confirmado):** no se garantizan las notificaciones web en iOS. La web no publica un manifiesto de aplicación instalable ni pide añadirla a la pantalla de inicio (eso rozaría la aplicación móvil instalable, fuera de alcance en la sección 3.10). Si el navegador no ofrece la API de notificaciones, la pantalla P-11 lo explica y recuerda que los avisos llegan por SMS, correo y Telegram.
9. **Vinculación vencida:** sin vinculación vigente, ese navegador o chat no recibe nada; SMS y correo siguen (sección 3.3).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Opción (b) para iPhone: manifiesto e instalación en la pantalla de inicio | Avisos web en iOS | Podría leerse como aplicación instalable (fuera de alcance); la usuaria la descartó |
| Firebase Cloud Messaging | Panel y SDK | Otra dependencia y cuenta; Web Push estándar basta |
| Envío directo sin bandeja | Simple | Un fallo del proveedor pierde el aviso |
| Texto libre por evento | Flexible | Riesgo de filtrar medicamentos (invariante 1) |

## Consecuencias
- Cerrado R-23.
- Los navegadores pueden negar el permiso; los demás medios siguen funcionando.
- Las cuotas gratuitas de SMS (50 al día) y correo (100 al día) limitan cuántas notificaciones salen en una jornada de pruebas (ADR 0009).
