# 0008. Bot de Telegram por webhook con grammY dentro de NestJS

- **Estado:** Propuesta
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.1, 3.13 (punto 8) y 3.15; guía de agentes (architect, punto 4); RNF-013, RNF-019, RNF-031; F002, F004, F006, F007, F010, F012, F014, F016, F018, F090

## Contexto
No hay procesos permanentes: el bot solo puede funcionar por webhook. El webhook verifica un secreto. El bot responde, o muestra "procesando", en máximo 3 segundos. Telegram reenvía la actualización si no recibe 2XX y procesa en orden por chat (verificado en core.telegram.org y grammy.dev).

## Decisión
1. **Librería:** grammY 1.46.0 (verificado en npm; `webhookCallback(bot, adapter, { secretToken, onTimeout, timeoutMilliseconds })` verificado en la referencia oficial). Adaptador `express`, que es la plataforma por defecto de NestJS, montado en `POST /api/v1/telegram/webhook`.
2. **Secreto:** `setWebhook` con `secret_token` (1 a 256 caracteres `A-Z a-z 0-9 _ -`); Telegram lo envía en `X-Telegram-Bot-Api-Secret-Token`; grammY lo compara antes de procesar. Sin secreto correcto: 401 sin efectos.
3. **3 segundos:** el manejador hace solo trabajo corto (lecturas a la base de datos y respuesta). Para trabajo largo (pedir código, OCR, prevalidación, revocación) envía primero "Procesando…" y continúa con `waitUntil` de `@vercel/functions` 3.10 (mismo límite que la función, 300 s en Hobby); el resultado llega como nuevo mensaje. `botInfo` se pasa al construir el bot para evitar `getMe` en arranques en frío.
4. **Errores:** con secreto válido el webhook responde 200 aunque el caso de uso falle (el usuario recibe un mensaje de error), para no bloquear el chat con reintentos. `last_update_id` por chat descarta duplicados cuando existe la fila del chat.
5. **Conversación:** estado mínimo en `telegram_chats.conversation` (paso actual, paciente escogido). Antes de aceptar el aviso no hay fila: el botón de aceptación lleva la elección (titular o tercero) en su `callback_data`.
6. **Mismos casos de uso:** los manejadores llaman a los servicios de aplicación con `ChannelContext { channel: 'telegram', chatId }`; la política de acceso es la misma que en la web.
7. **Archivos:** el bot descarga con `getFile` (límite de descarga de bots de 20 MB, por encima de los 10 MB permitidos) desde el servidor y los sube a Blob en cuarentena; luego sigue el mismo flujo del ADR 0012.
8. **Código de entrega:** se envía como imagen QR generada en el servidor (`qrcode` 1.5) y como texto.
9. **Solo escribe a quien lo inició:** el bot solo envía mensajes a `chat_id` de chats que escribieron primero (RNF-019); los enlaces `t.me/<bot>` no llevan parámetros con datos.
10. **Modo de prueba:** bot de Telegram distinto para vista previa y local (token de pruebas).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Telegraf con `nestjs-telegraf` | Decoradores de NestJS | Más acoplado al ciclo de vida de NestJS; grammY tiene adaptadores explícitos para webhook y mejor documentación de despliegue sin servidor |
| Polling | Simple en local | No funciona en Vercel (guía de agentes) |
| Llamar a la API HTTP propia desde el bot | Mismo contrato | Doble salto, sesiones artificiales y más latencia |

## Consecuencias
- Riesgo: arranque en frío de NestJS cerca de los 3 s; medir en vista previa (F090).
- Las fotos enviadas como foto llegan comprimidas; el bot sugiere enviarlas como archivo (Inferido).
