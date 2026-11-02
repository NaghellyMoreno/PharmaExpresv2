# 0009. Proveedores de SMS y correo, con modo de prueba

- **Estado:** Aceptada. La usuaria escogió textbee y Resend el 2026-11-01 (cierra R-03) y aprobó las propuestas Inferidas (cuotas, reintentos, sin webhooks de estado). Solo queda configuración externa, listada en Consecuencias.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.2, 3.6, 3.8, 3.12 y 3.13; guía de agentes (architect, punto 5); `docs/04-readiness.md` (R-03); decisión de la usuaria del 2026-11-01 (punto 2)

## Contexto
SMS y correo son reales (sección 3.8). Las pruebas usan los números y correos de la usuaria (sección 3.2). De estos envíos dependen la verificación de identidad, las notificaciones y los enlaces de contraseña del personal.

Restricción nueva (Confirmado, la dio la usuaria el 2026-11-01): es un prototipo universitario (Universidad de Caldas) con presupuesto de US$0. Solo se usan servicios gratuitos o cuentas de estudiante sin tarjeta.

## Decisiones de la usuaria (Confirmado, 2026-11-01)
1. **SMS:** textbee, plan gratuito, desde un teléfono Android con la SIM de la usuaria. Reemplaza a Twilio.
2. **Modo de desarrollo:** `capture`.
3. **Correo:** Resend, plan gratuito, con un dominio gratuito del GitHub Student Developer Pack. Remitente: `notificaciones@<dominio>`.
4. **Presupuesto:** US$0.

## Hechos verificados en la documentación oficial (2026-11-01)
**textbee** (textbee.dev y README del repositorio `vernu/textbee`):
- Convierte un teléfono Android (7.0 o superior) en pasarela de SMS. Los mensajes salen del número de la SIM del teléfono. No funciona en iPhone.
- El teléfono debe tener batería, la aplicación instalada y conexión a internet: "Messages are sent through the phone, so it needs power, the app, and an internet connection". El servidor nunca habla con el teléfono directamente: la API le envía cada mensaje por Firebase Cloud Messaging.
- Plan gratuito: US$0 al mes, sin tarjeta, 1 dispositivo activo, máximo 50 mensajes al día y hasta 300 al mes. Incluye webhooks de estado.
- API REST `POST /send-sms`, con un límite de 60 peticiones por minuto. SDK oficial `@textbee/sdk` 0.4.0 (MIT; versión anterior a 1.0). También funciona con `fetch` sin SDK.
- Sin modo de prueba propio. Es de código abierto (MIT) y se puede alojar por cuenta propia, pero eso exige servidores, así que no se usa.

**Resend** (resend.com/pricing y la documentación de cuotas y dominios):
- Plan gratuito: 3.000 correos al mes y 100 al día. El día es UTC: se reinicia a las 19:00 de Bogotá. Cada destinatario cuenta por separado.
- Hasta 3 dominios verificados, retención de datos de 30 días y 10 peticiones por segundo por equipo.
- Hay que agregar y verificar al menos un dominio propio para enviar. Resend recomienda enviar desde un subdominio.
- La cuenta debe mantener menos de 4 % de rebotes y menos de 0,08 % de spam. Si los supera, el envío puede pausarse.
- Para probar, las direcciones de prueba de Resend (por ejemplo, `delivered@resend.dev`) cuentan en la cuota.
- SDK `resend` 6.37.0 (registro de npm).
- No verificado: si la cuenta gratuita exige tarjeta. La página de precios no lo dice.

**GitHub Student Developer Pack** (education.github.com/pack): ofrece un dominio gratis por 1 año con Namecheap (`.me`) o con .TECH, y dominios gratis con Name.com sin plazo publicado.

## Decisión
1. **Puertos comunes** (sin cambios): `SmsSender` y `EmailSender`, con adaptadores intercambiables por `SMS_PROVIDER` (`textbee`, `capture`) y `EMAIL_PROVIDER` (`resend`, `capture`). El dominio no conoce al proveedor.
2. **Tres modos (`MESSAGING_MODE`):**
   - `capture` (desarrollo local y pruebas automáticas; Confirmado para desarrollo): no envía nada. Guarda cada mensaje en una tabla de prueba que solo existe fuera de producción. Así las pruebas comprueban que ningún texto lleva medicamentos ni diagnósticos (invariante 1). No gasta cuota.
   - `sandbox` (vista previa): envío real, solo a los contactos de prueba de la usuaria (`MESSAGING_ALLOWLIST`). Cualquier otro destino se descarta y se registra sin el dato. textbee no tiene modo de prueba, así que la lista blanca es la única barrera.
   - `live` (producción del prototipo): envío real. Como los datos son simulados, los contactos de la EPS simulada son los de la usuaria (sección 3.2; invariante 6).
3. **Adaptador de SMS (textbee):** envía con la API REST, con la clave de API y el identificador del dispositivo. No usa los webhooks de estado de textbee en el prototipo (Inferido): exigirían un endpoint público más con su propio secreto (sección 3.13, punto 8), y el estado no cambia ningún flujo.
4. **Adaptador de correo (Resend):** remitente `notificaciones@<dominio>` (Confirmado). El dominio se verifica en Resend con los registros DNS que pida la consola.
5. **Cuotas** (Inferido): el adaptador lleva la cuenta de envíos del día y del mes de cada canal. Al llegar al límite del plan (50 SMS al día o 300 al mes; 100 correos al día o 3.000 al mes) no llama al proveedor: el mensaje queda `failed` con el código `quota_exhausted` y se registra sin destinatario. La respuesta al paciente no cambia: el mensaje de la sección 3.2 ya orienta si el código no llega.
6. **Fallos** (sin cambios): envío desde la bandeja de salida con reintentos (ADR 0010). Son 5 intentos con espera creciente (Inferido). Al agotarlos, el mensaje queda `failed` y visible en los logs, sin destinatario. Si el teléfono de textbee está apagado o sin conexión, el SMS no sale.
7. **Contenido** (invariante 1): las plantillas de SMS y correo son una lista cerrada (ADR 0010). Ningún texto lleva nombres de medicamentos, diagnósticos ni cédula. Esto importa más con estos proveedores: el texto pasa por los servidores de textbee y por Firebase, y Resend guarda los correos 30 días.
8. **Logs** (invariante 8): se registran el canal, la plantilla, el resultado y el código de error. Nunca el número, el correo, la cédula ni el cuerpo del mensaje.

## Alternativas consideradas
| Alternativa | Por qué no se escogió |
| --- | --- |
| Twilio | Cobra por segmento y por número: viola la restricción de US$0 |
| Proveedor colombiano (Hablame, LabsMobile) o Amazon SNS | No verificados; la usuaria escogió textbee |
| Enviar el código solo por correo | Contradice la sección 3.2: el SMS es obligatorio |
| Alojar textbee por cuenta propia | Exige servidores permanentes (API, MongoDB, Redis), que Vercel no ofrece |

## Consecuencias
- Cerrado R-03: proveedor, remitente y presupuesto definidos. F003 a F006, F040, F041, F092, F093, las notificaciones y los enlaces del personal se pueden construir en modo `capture`. Funcionan en el sitio publicado cuando la usuaria complete la configuración pendiente.
- Variables de entorno nuevas (nombres Inferidos): `TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`, `RESEND_API_KEY`, `EMAIL_FROM`, `SMS_PROVIDER`, `EMAIL_PROVIDER`, `MESSAGING_MODE` y `MESSAGING_ALLOWLIST`.
- **Riesgos:**
  - La disponibilidad del SMS depende de un teléfono físico de la usuaria. Si está apagado, sin datos o sin la aplicación, no llegan códigos ni notificaciones por SMS. La verificación de identidad queda bloqueada por SMS; el correo llega si el afiliado simulado tiene uno.
  - Con 50 SMS al día, una jornada de pruebas o una demostración puede agotar la cuota. Cada código pedido y cada notificación gastan un SMS.
  - Los SMS salen del número personal de la usuaria, y el costo de cada SMS depende de su plan de telefonía. No se verificó si su plan los incluye: si no los incluye, choca con la restricción de US$0.
  - No se verificó qué pasa si el número de destino es el mismo de la SIM que envía.
  - El dominio gratis del GitHub Student Pack dura 1 año con Namecheap y .TECH. Renovarlo después puede tener costo.
  - `@textbee/sdk` está en versión 0.x: su interfaz puede cambiar. El adaptador puede usar `fetch` directo para aislarse.
- **Dominio (Confirmado, usuaria, 2026-11-01):** el dominio raíz sirve la web y un subdominio se usa para el correo (por ejemplo, `notificaciones@correo.<dominio>`), como recomienda Resend.
- **Configuración antes de publicar (usuaria; no bloquea, se trabaja en modo `capture`):**
  1. Crear las cuentas de textbee y Resend y confirmar que ninguna pidió tarjeta.
  2. Registrar el dominio, apuntar el dominio raíz al proyecto web de Vercel y verificar el subdominio de correo en Resend.
  3. Dejar un teléfono Android dedicado, encendido, cargando y con conexión durante las pruebas y la demostración.
  4. Confirmar que su plan de telefonía incluye los SMS salientes sin costo adicional. Si no los incluye, choca con el presupuesto de US$0 y hay que volver a decidir.
