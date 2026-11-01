# 0016. Seguridad transversal en NestJS: guards, validación, cabeceras, CORS, límites, auditoría y registros

- **Estado:** Propuesta
- **Fecha:** 2026-10-31
- **Fuente:** sección 3.13 (puntos 1 a 11); `CLAUDE.md` (seguridad); guía de agentes (architect, punto 12); RNF-007 a RNF-016, RNF-026; F007, F008, F013, F049, F051, F052, F055 a F057, F059, F065, F075

## Decisión
1. **Guard global que niega por defecto** (`APP_GUARD`): toda ruta debe declarar una marca: `@Public()`, `@PatientChannel()`, `@Roles('admin'|'dispenser')`, `@TelegramWebhook()` o `@JobTrigger()`. Sin marca: 403. Una prueba de integración enumera las rutas (explorador de rutas de NestJS) y falla si alguna no tiene marca o si una ruta `@Public()` no está en la lista aprobada: `GET /health`, `GET /privacy-notice`, `POST /consents/acceptance`, `POST /identity/otp-requests`, `POST /identity/verifications`, `POST /revocations/otp-requests`, `POST /revocations`, `POST /staff/sessions`, `POST /staff/password-resets`, `POST /staff/password-changes`.
2. **Guards por tipo:** `PatientChannelGuard`, `StaffSessionGuard` + `RolesGuard`, `TelegramSecretGuard` (vía grammY), `JobSecretGuard` (bearer en tiempo constante o firma de QStash con `Receiver`).
3. **Validación de entrada:** `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`, DTO con `class-validator` 0.15; límite de cuerpo JSON de 100 KB (Inferido); UUID validados en parámetros. Consultas parametrizadas con Drizzle (ADR 0003).
4. **Cabeceras:** `helmet` 8.3 en la API (HSTS, CSP `default-src 'none'` para respuestas JSON, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`); los estáticos las reciben de `vercel.json` (ADR 0002). HTTPS lo impone Vercel.
5. **CORS:** deshabilitado (mismo origen); un middleware rechaza peticiones que cambian datos si `Origin` no es `APP_ORIGIN`.
6. **CSRF:** token sincronizado para sesiones de personal y dispositivos del paciente (ADR 0014).
7. **Límites de frecuencia** en PostgreSQL (la función no comparte memoria): código por huella de cédula (ADR 0006), inicio de sesión por cuenta (ADR 0014), carga por paciente (ADR 0012), recuperación por huella de correo (ADR 0019). Respuesta 429 con `Retry-After`. Límite adicional por IP con el cortafuegos de Vercel: Pendiente de evaluar (no exigido por el contexto).
8. **Auditoría:** `AuditInterceptor` en rutas `@Roles` que registra, tras el éxito, actor, rol, acción (código en inglés), tipo e id del objetivo y hora; `details` solo con claves permitidas (por ejemplo, `pointId`, `oldCapacity`, `newCapacity`). Incluye inicio y cierre de sesión, intentos fallidos y validaciones de código rechazadas. Tabla de solo inserción (disparador que impide `UPDATE` y `DELETE`). Visible solo para el administrador (Inferido, HU-034 criterio 4).
9. **Registros sin datos sensibles:** logger JSON de NestJS envuelto por un `SafeLogger` que acepta solo campos de una lista (id de correlación, ruta plantilla, método, estado, duración, `code` de error, ids UUID). Nunca se registran cuerpos, consultas con parámetros, mensajes del controlador de PostgreSQL ni respuestas de proveedores. Prueba automática que recorre el flujo y busca en la salida las cédulas, diagnósticos y medicamentos de prueba (F057).
10. **Secretos:** solo en variables de entorno (ADR 0002).
11. **Respuestas con datos del paciente:** `Cache-Control: no-store`.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| `@nestjs/throttler` con almacenamiento en memoria | Integrado | No funciona entre instancias sin servidor; los límites del contexto son por cédula, cuenta y paciente, no por IP |
| Upstash Redis para límites | Rápido | Otra dependencia; PostgreSQL basta para el volumen |
| Middleware de Vercel para proteger paneles | Antes de la función | No protege la API ni sustituye los guards; los estáticos no tienen datos |

## Consecuencias
- Toda ruta nueva exige decidir su acceso; la prueba lo impide olvidar.
- La auditoría no contiene datos del paciente, solo ids.
