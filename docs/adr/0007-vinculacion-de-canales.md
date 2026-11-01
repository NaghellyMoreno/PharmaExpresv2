# 0007. Vinculación de navegador y de chat de Telegram, con vencimiento a 3 meses

- **Estado:** Propuesta
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.1, 3.2 y 3.3; guía de agentes (architect, punto 3); HU-004, HU-005; RNF-004, RNF-007; F009 a F014, F067, F068

## Contexto
Confirmado: tras verificar, el navegador o chat queda vinculado; un canal puede vincular varios pacientes sin límite, identificados por su nombre (P13); toda vinculación vence a los 3 meses; vencida, el canal no muestra información, no permite gestiones ni recibe notificaciones; se puede desvincular en cualquier momento (P14). Los identificadores de Telegram no prueban identidad. Nada se registra antes de aceptar el aviso.

## Decisión
1. **Navegador:** al primer código correcto se crea `browser_devices` con un token aleatorio de 32 bytes en la cookie `__Host-pe_device` (HttpOnly, Secure, SameSite=Strict, Path=/, vida de la cookie 3 meses, Inferido) y se guarda solo su hash SHA-256. Antes de eso no existe ninguna fila del navegador (invariante 3).
2. **Chat:** `telegram_chats` guarda el `chat_id` (necesario para escribir) solo después de que la persona acepta el aviso o escoge revocar; si rechaza, no se guarda nada.
3. **Vinculación:** fila en `channel_bindings` con `expires_at = created_at + 3 meses` (`CHECK`). Nueva verificación del mismo paciente desde el mismo canal crea una nueva vinculación y revoca la anterior. Cada vinculación vence por separado (Inferido, HU-005 criterio 4).
4. **Acceso:** toda ruta del paciente incluye `patientRefId`; `PatientChannelGuard` (web) y `PatientAccessPolicy` (bot) exigen una vinculación vigente entre ese canal y ese paciente; si no existe, 403 sin datos. `GET /me` devuelve solo vinculaciones vigentes (nombre y vencimiento), nunca las vencidas.
5. **Selección de paciente:** la web lleva `patientRefId` en la ruta; el bot pregunta por nombre antes de cada gestión si hay más de uno y guarda la selección en la conversación.
6. **Desvinculación:** `DELETE /me/bindings/{patientRefId}` o comando del bot; marca `revoked_at`; no afecta a las demás (Inferido, HU-004 criterio 6). El navegador también deja de recibir notificaciones web de ese paciente.
7. **Telegram:** el `chat_id` solo localiza el canal; nunca se busca un paciente por nombre visible, usuario o número de Telegram.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| JWT en almacenamiento local | Sin estado | Prohibido para sesiones (sección 3.13); no se puede revocar |
| Cookie por paciente | Aislamiento | Muchas cookies; complica la selección |
| Vincular por número de teléfono de Telegram | Cómodo | Contradice la sección 3.1 |

## Consecuencias
- Borrar cookies del navegador obliga a verificar de nuevo; la vinculación antigua queda huérfana y vence sola.
- La revocación borra en cascada las vinculaciones del paciente (ADR 0018).
