# 0019. Detalles de recuperación y enlaces del personal (preguntas P37 a P39)

- **Estado:** Propuesta (la usuaria confirma cada punto; no son reglas)
- **Fecha:** 2026-10-31
- **Fuente:** sección 3.12; brief (preguntas abiertas P37 a P39); HU-033 (criterio 10), HU-036 (criterios 3 y 7); F082 a F084

## Contexto
La sección 3.12 no precisa cómo se cuenta el límite de recuperaciones, si el enlace de definición se puede reenviar antes de vencer, ni qué pasa con una cuenta desactivada que pide recuperar.

## Decisión propuesta
| Pregunta | Propuesta de architect | Razón | Cómo queda el diseño mientras tanto |
| --- | --- | --- | --- |
| P37: ¿el límite de 3 solicitudes por hora se cuenta por cuenta? ¿La respuesta cambia al superarlo? | Por correo ingresado (huella HMAC del correo normalizado), exista o no la cuenta; al superarlo la respuesta es la misma 202 y no se envía enlace | Contar también correos inexistentes impide deducir qué cuentas existen por el comportamiento; misma respuesta (criterio 2 de HU-036) | Tabla `password_reset_requests` por huella; `POST /staff/password-resets` siempre 202 |
| P38: ¿reenviar el enlace de definición antes de que venza? | Sí, permitirlo en cualquier momento mientras la cuenta no tenga contraseña definida; el nuevo anula el anterior | Cubre el caso del correo no recibido sin esperar 48 h; no amplía privilegios (el enlace anterior queda anulado) | `POST /admin/dispensers/{id}/setup-links` acepta ambos casos; si la usuaria confirma "solo al vencer", responde 409 `setup_link_still_valid` antes de vencer |
| P39: ¿una cuenta desactivada puede recuperar? | No: misma respuesta en pantalla y no se envía enlace | Desactivar debe impedir el acceso (sección 3.12); la misma respuesta evita revelar el estado | El servicio no emite token si `active = false` |

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| P37 por IP | Frena ataques masivos | Detrás de proxies comparte IP; no es lo que dice el contexto |
| P38 solo al vencer (lectura literal) | Literal | Un dispensador sin correo recibido espera hasta 48 h |
| P39 permitir y reactivar | Autoservicio | Anularía la desactivación del administrador |

## Consecuencias
- Hasta que la usuaria responda, los criterios siguen marcados como Inferidos en los requisitos; el contrato soporta ambas variantes de P38.
