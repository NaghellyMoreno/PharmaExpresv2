# 0011. Tareas programadas, recordatorios y reverificación

- **Estado:** Pendiente bloqueante (la usuaria escoge el disparador preciso)
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.5, 3.6, 3.13 (punto 8) y 3.14; `CLAUDE.md` (stack); guía de agentes (architect, punto 7); RNF-013, RNF-017, RNF-020; F039, F044 a F049, F077

## Contexto
Precisión que exige el contexto (Confirmado):
- Recordatorio del día anterior entre 19:00 y 21:00 (ventana de 2 horas).
- Recordatorio de dos horas antes con desfase máximo de 10 minutos, con reverificación.
- Recordatorio único a las 48 horas sin disponibilidad (tolerancia no definida).
- Aviso a crónicos 2 días antes de la siguiente fecha habilitada (precisión de día; hora no definida).
- Expiración de la reserva al terminar la ventana.

Restricciones verificadas en la documentación de Vercel (2026-10-31):
- Cron Hobby: una vez al día, precisión por hora (±59 min); expresiones más frecuentes fallan al desplegar. Pro: cada minuto, precisión por minuto.
- `@nestjs/schedule` no sirve (no hay proceso permanente).
- Vercel Workflows: su integración con NestJS es experimental y no está soportada para desplegar en Vercel (guía oficial del Workflow SDK). **Descartada.**

## Decisión común (independiente de la opción)
1. **Despachador único e idempotente:** tabla `scheduled_jobs` (`kind`, `due_at`, `not_after`, referencias, `status`). Endpoint `GET|POST /api/v1/internal/jobs/dispatch` protegido por `JobSecretGuard` (`Authorization: Bearer CRON_SECRET` para Vercel Cron; firma del proveedor para QStash). Toma tareas vencidas con `FOR UPDATE SKIP LOCKED`, comprueba el estado actual (cita activa, paciente no revocado) y las ejecuta.
2. **Programación al confirmar:** al confirmar una cita se crean las tareas que apliquen: día anterior (`due_at` 19:00 del día anterior, `not_after` 21:00; solo si se agendó antes de las 19:00 del día anterior y no es del mismo día), dos horas antes (`due_at` inicio − 2 h, `not_after` + 10 min; solo si se agendó con 2 h o más) y expiración (fin de la ventana). Sin disponibilidad: tarea de 48 h (una por fórmula). Al cerrar una fórmula crónica: aviso 2 días antes de la siguiente fecha habilitada.
3. **Reverificación** dentro de la tarea de dos horas antes, en una transacción: consulta afiliación, vigencia y autorizaciones; si cambió algo, la fórmula queda no apta, libera sus medicamentos en todos los puntos, registra `reverification_events`, cancela las citas que quedan sin líneas y conserva las demás con la misma ventana y el mismo código; afiliación cambiada afecta a todas las fórmulas de la solicitud (sección 3.6).
4. **Respaldo diario con Vercel Cron Hobby** (gratuito, todas las opciones): `0 0 * * *` UTC = 19:00 a 19:59 en Bogotá (sin horario de verano), que cae dentro de la franja de 19:00 a 21:00 y despacha recordatorios del día anterior, avisos de crónicos y limpieza. Es suficiente para esas tareas; no lo es para la de dos horas antes.
5. **La corrección de las reservas no depende del disparador** (expiración perezosa, ADR 0005).

## Opciones para el disparador preciso (dos horas antes, 48 h, expiraciones)
| Opción | Precisión | Costo | A favor | En contra |
| --- | --- | --- | --- | --- |
| A. Vercel Pro con cron `*/5 * * * *` o cada minuto | Por minuto (verificado) | US$20/mes de plataforma con US$20 de crédito de uso (verificado) | Todo en Vercel; el más simple | Costo mensual; Hobby no sirve |
| B. Upstash QStash (`@upstash/qstash` 2.12.1): un mensaje por tarea con `Upstash-Not-Before`, más un cron de QStash cada 5 min como red de seguridad | Mensaje a la hora exacta; red de 5 min | Gratis: 1.000 mensajes al día, retraso máximo 7 días, 10 programaciones (verificado). Pago por uso US$1 por 100.000 | Sin cambiar de plan; funciona con cualquier URL HTTPS; firma verificable | Servicio externo y otra credencial; los avisos de crónicos a más de 7 días los cubre el respaldo diario |
| C. Vercel Queues (`@vercel/queue`) con mensajes diferidos | Retraso de 0 a 7 días (verificado) | Hobby incluye 1.000.000 de operaciones (verificado) | Dentro de Vercel, sin plan Pro | En beta; el consumidor se configura por archivo de función (`experimentalTriggers`) y su uso con NestJS sin configuración no está documentado ni verificado |
| D. Cron externo gratuito (por ejemplo, cron-job.org) | Sin garantía verificada | Gratis | Sin cambiar de plan | Sin acuerdo de servicio; architect no verificó su documentación |

**Recomendación de architect (Inferido):** opción B (QStash), porque cumple los 10 minutos en Hobby sin costo con el volumen del prototipo y no ata el diseño: cambiar a A solo cambia quién llama al despachador.

## Consecuencias
- Pendiente bloqueante para F045, F046 y F077 (y F047, F039 en su notificación): la usuaria escoge A, B, C o D.
- Pendientes de precisión que el contexto no define (no se inventan): (1) si el recordatorio de dos horas antes sale tarde (más de 10 minutos), ¿se envía igual con su reverificación o se omite? Propuesta: se envía y reverifica, y queda registrado como incumplimiento; (2) hora del aviso a crónicos y tolerancia del recordatorio de 48 h. Propuesta: aviso a crónicos con el despacho diario de las 19:00 y 48 h con el disparador preciso.
- Todas las horas se calculan en `America/Bogota` con la base de datos (`AT TIME ZONE`), no con la zona del servidor.
