# 0014. Autenticación, sesiones, contraseñas y roles de dispensadores y administradores

- **Estado:** Aceptada (2026-11-01). Política de contraseña Confirmada por la usuaria (R-10); la decisión 1 fija con una decisión técnica cómo se rechazan las contraseñas filtradas o comunes. La decisión 4 cierra R-14.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.7, 3.12 y 3.13; guía de agentes (architect, punto 10); HU-024, HU-027, HU-033, HU-036; RNF-007 a RNF-010, RNF-035; F050 a F055, F058, F059, F071, F072, F078, F079, F082 a F084; `docs/04-readiness.md` (R-10, R-14)

## Contexto
Confirmado: hash robusto; sesión máxima de 12 h; cierre tras 30 min sin actividad (dispensador) y 15 min (administrador); bloqueo de 15 min tras 5 contraseñas erradas; cookies HttpOnly, Secure y SameSite, nunca almacenamiento local; CSRF; CORS propio. El administrador crea cuentas de dispensador con punto; el dispensador define su contraseña con un enlace de un solo uso de 48 h; el reenvío anula el anterior; recuperación con enlace de 30 min y máximo 3 solicitudes por hora con respuesta igual exista o no la cuenta; tras el cambio no hay inicio automático, se cierran las sesiones y se avisa por correo; cuentas sin borrado. Contraseña de mínimo 15 caracteres, sin reglas de composición, rechazando las filtradas o comunes (usuaria, R-10; RNF-035).

## Decisión
1. **Contraseñas:**
   - Hash Argon2id con `@node-rs/argon2` 2.2.2 (binarios precompilados, sin compilación en Vercel), con los parámetros mínimos de OWASP para Argon2id.
   - **Política (Confirmado, R-10):** mínimo 15 caracteres (contados como puntos de código Unicode tras normalizar a NFC) y máximo 256; sin reglas de composición; se aceptan espacios y cualquier carácter imprimible.
   - **Filtradas o comunes (Decisión técnica):** se consulta la API Pwned Passwords de Have I Been Pwned por rango (k-anonimato): el backend calcula el SHA-1 de la contraseña, envía solo los 5 primeros caracteres hexadecimales a `https://api.pwnedpasswords.com/range/{prefijo}` con la cabecera `Add-Padding: true` y busca el resto en la respuesta. Si aparece con cualquier conteo, se rechaza (422 `password_breached`). La contraseña nunca sale del servidor. Verificado en la documentación oficial (haveibeenpwned.com/API/v3, 2026-11-01): gratuita, sin clave de API y sin límite de frecuencia. Las contraseñas comunes de las listas públicas están en ese corpus, así que una sola consulta cubre "filtradas o comunes".
   - No se agregan otras reglas de rechazo (por ejemplo, palabras del contexto): la usuaria fijó la política y una regla más cambiaría lo que vive el personal.
   - Si la API no responde en 3 segundos o falla, no se guarda la contraseña y se responde 503 `password_check_unavailable` para que la persona reintente; el enlace no se consume (Decisión técnica: falla cerrada, la más segura).
   - En modo `capture` (local y pruebas) un adaptador simulado reconoce una lista corta de contraseñas filtradas de prueba, sin llamar a la API.
2. **Sesión opaca en base de datos:** token aleatorio de 32 bytes en la cookie `__Host-pe_staff` (HttpOnly, Secure, SameSite=Strict, Path=/, sin `Max-Age` más allá de 12 h); en `staff_sessions` solo su hash. `StaffSessionGuard` en cada petición: existe, no revocada, `app.clock_now() < absolute_expires_at` (12 h), `app.clock_now() − last_activity_at <` 30 o 15 min según rol, usuario activo; luego actualiza `last_activity_at`. Cualquier falla: 401 y cookie borrada.
3. **Roles:** `@Roles('admin')` o `@Roles('dispenser')`; un usuario tiene un solo rol. El inicio de sesión indica el panel; una cuenta de un rol no entra al otro panel. El dispensador se filtra por su `point_id` leído en cada petición (el cambio de punto aplica de inmediato).
4. **Bloqueo y respuesta genérica (cierra R-14):** `failed_attempts` y `locked_until` por cuenta en una sentencia atómica; al 5.º error, `locked_until = app.clock_now() + 15 min`. `POST /staff/sessions` responde **siempre 401 `invalid_credentials`** con el mismo cuerpo para cuenta inexistente, contraseña errada, cuenta desactivada, cuenta sin contraseña definida, panel equivocado o cuenta bloqueada. No existe un 429 de inicio de sesión. Para que el tiempo tampoco distinga, con una cuenta inexistente se calcula igual un hash Argon2id contra un hash ficticio.
5. **CSRF:** token sincronizado: al crear la sesión se genera un token, se devuelve en el cuerpo y en `GET /staff/sessions/current`, y se guarda su hash; toda petición que cambia datos exige `X-CSRF-Token` igual y una cabecera `Origin` igual a `APP_ORIGIN`. Lo mismo aplica al dispositivo del paciente (ADR 0007). Peticiones sin sesión (inicio de sesión, pedir código, recuperación, definir contraseña) exigen solo `Origin`.
6. **Enlaces de un solo uso:** `staff_tokens` con token aleatorio de 32 bytes, solo su hash; propósito `setup` (48 h) o `reset` (30 min); emitir uno nuevo marca `superseded_at` en el vigente. Enlace `https://<web>/personal/contrasena#token=...` (fragmento: no llega a registros ni a `Referer`). `POST /staff/password-changes` aplica la política de la decisión 1, consume el token, guarda el hash, revoca todas las sesiones de la cuenta, envía aviso por correo y no inicia sesión.
7. **Recuperación:** `POST /staff/password-resets` siempre responde 202 con el mismo mensaje; registra la solicitud por huella HMAC del correo normalizado (`EMAIL_FINGERPRINT_KEY`); si la cuenta existe, está activa y no superó 3 en la última hora, envía el enlace (ADR 0019).
8. **Desactivación:** `active = false` rechaza el inicio de sesión y las sesiones abiertas en la siguiente petición (el guard lee `active`). Reactivar conserva la contraseña anterior (Confirmado, propuesta aprobada).
9. **Administrador sin correo:** sin vía en el sistema; la usuaria lo restablece en la base de datos (sección 3.12).
10. **Primer administrador y dispensadores de prueba:** comando de semilla (ADR 0013, decisión 6).
11. **Auditoría de rutas públicas del personal:** ver ADR 0016, decisión 9 (cierra R-15).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Lista local de contraseñas comunes (por ejemplo, 100.000 más frecuentes) | Sin dependencia externa | No cubre "filtradas"; hay que elegir, verificar y empaquetar la lista |
| Pwned Passwords con falla abierta | La definición nunca se bloquea | Aceptaría contraseñas filtradas mientras la API falle |
| `zxcvbn` | Estima la fortaleza | No es lo que pide la usuaria (filtradas o comunes); agrega peso |
| 429 distinto para cuentas bloqueadas | Mensaje más útil | Revela que la cuenta existe (R-14) |
| JWT en cookie | Sin consulta a la base | No permite inactividad ni revocación inmediata sin lista negra |
| `express-session` con almacén en PostgreSQL | Librería conocida | Menos control sobre inactividad por rol y CSRF; la tabla propia es pequeña |
| bcrypt | Muy usado | Argon2id es la recomendación preferente actual de OWASP |

## Consecuencias
- Cerrados R-10 (parte de contraseña) y R-14.
- Definir o recuperar una contraseña depende de una API gratuita externa; si está caída, la persona reintenta más tarde.
- Cada petición de personal hace una lectura y una escritura de sesión (aceptable para el volumen del prototipo; se mide para RNF-029).
- La persona bloqueada no sabe que está bloqueada; el mensaje genérico le sugiere esperar unos minutos o recuperar la contraseña.
