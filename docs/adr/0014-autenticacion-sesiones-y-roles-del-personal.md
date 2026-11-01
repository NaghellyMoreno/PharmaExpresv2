# 0014. Autenticación, sesiones y roles de dispensadores y administradores

- **Estado:** Propuesta
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.7, 3.12 y 3.13; guía de agentes (architect, punto 10); HU-024, HU-027, HU-033, HU-036; RNF-007 a RNF-010; F050 a F055, F058, F059, F071, F072, F078, F079, F082 a F084

## Contexto
Confirmado: hash robusto; sesión máxima de 12 h; cierre tras 30 min sin actividad (dispensador) y 15 min (administrador); bloqueo de 15 min tras 5 contraseñas erradas; cookies HttpOnly, Secure y SameSite, nunca almacenamiento local; CSRF; CORS propio. El administrador crea cuentas de dispensador con punto; el dispensador define su contraseña con un enlace de un solo uso de 48 h; reenvío anula el anterior; recuperación con enlace de 30 min y máximo 3 solicitudes por hora con respuesta igual exista o no la cuenta; tras el cambio no hay inicio automático, se cierran las sesiones y se avisa por correo; cuentas sin borrado.

## Decisión
1. **Contraseñas:** Argon2id con `@node-rs/argon2` 2.2.2 (binarios precompilados, sin compilación en Vercel). Parámetros mínimos de OWASP para Argon2id (Inferido). Política de contraseña **Pendiente** (propuesta: mínimo 12 caracteres y rechazo de las más comunes).
2. **Sesión opaca en base de datos:** token aleatorio de 32 bytes en la cookie `__Host-pe_staff` (HttpOnly, Secure, SameSite=Strict, Path=/, sin `Max-Age` más allá de 12 h); en `staff_sessions` solo su hash. `StaffSessionGuard` en cada petición: existe, no revocada, `now < absolute_expires_at` (12 h), `now − last_activity_at <` 30 o 15 min según rol, usuario activo; luego actualiza `last_activity_at`. Cualquier falla: 401 y cookie borrada.
3. **Roles:** `@Roles('admin')` o `@Roles('dispenser')`; un usuario tiene un solo rol. El inicio de sesión indica el panel; una cuenta de un rol no entra al otro panel. El dispensador se filtra por su `point_id` leído en cada petición (el cambio de punto aplica de inmediato).
4. **Bloqueo:** `failed_attempts` y `locked_until` por cuenta en una sentencia atómica; al 5.º error, `locked_until = now + 15 min`. Mensaje de error genérico, igual para cuenta inexistente, contraseña errada o bloqueo (Inferido, para no revelar cuentas).
5. **CSRF:** token sincronizado: al crear la sesión se genera un token, se devuelve en el cuerpo y en `GET /staff/sessions/current`, y se guarda su hash; toda petición que cambia datos exige `X-CSRF-Token` igual y una cabecera `Origin` igual a `APP_ORIGIN`. Lo mismo aplica al dispositivo del paciente (ADR 0007). Peticiones sin sesión (inicio de sesión, pedir código) exigen solo `Origin`.
6. **Enlaces de un solo uso:** `staff_tokens` con token aleatorio de 32 bytes, solo su hash; propósito `setup` (48 h) o `reset` (30 min); emitir uno nuevo marca `superseded_at` en el vigente. Enlace `https://<web>/personal/contrasena#token=...` (fragmento: no llega a registros ni a `Referer`). `POST /staff/password-changes` consume el token, guarda el hash, revoca todas las sesiones de la cuenta, envía aviso por correo y no inicia sesión.
7. **Recuperación:** `POST /staff/password-resets` siempre responde 202 con el mismo mensaje; registra la solicitud por huella del correo; si la cuenta existe, está activa y no superó 3 en la última hora, envía el enlace (detalles en ADR 0019).
8. **Desactivación:** `active = false` rechaza el inicio de sesión y las sesiones abiertas en la siguiente petición (el guard lee `active`). Reactivar conserva la contraseña anterior (Inferido, HU-033).
9. **Administrador sin correo:** sin vía en el sistema; la usuaria lo restablece en la base de datos (sección 3.12).
10. **Primer administrador:** se crea con un comando de semilla que emite un enlace de definición de contraseña (Inferido).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| JWT en cookie | Sin consulta a la base | No permite inactividad ni revocación inmediata sin lista negra |
| `express-session` con almacén en PostgreSQL | Librería conocida | Menos control sobre inactividad por rol y CSRF; la tabla propia es pequeña |
| bcrypt | Muy usado | Argon2id es la recomendación preferente actual de OWASP |
| Doble envío de cookie para CSRF (`csrf-csrf`) | Sin estado | Ya hay sesión en base de datos; el token sincronizado es más simple |

## Consecuencias
- Cada petición de personal hace una lectura y una escritura de sesión (aceptable para el volumen del prototipo; medir para RNF-029).
- Pendiente: política de contraseña.
