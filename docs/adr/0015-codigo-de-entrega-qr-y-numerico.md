# 0015. Código de entrega en QR y numérico

- **Estado:** Propuesta (longitud y forma de lectura del QR Pendientes)
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.5 y 3.7; guía de agentes (architect, punto 11); HU-016, HU-025; F035, F036, F053

## Contexto
Confirmado: cada cita tiene un código de un solo uso, en QR y numérico, que el usuario consulta cuando lo necesita; solo es válido en su punto, dentro de su ventana y una vez; la hora de llegada es el momento de validación; una fórmula agregada a una cita usa el mismo código.

## Decisión
1. **Generación:** número aleatorio con `crypto.randomInt`. Longitud **Pendiente**; propuesta de 8 dígitos (Inferido).
2. **Almacenamiento:** cifrado (AES-256-GCM con `DELIVERY_CODE_ENC_KEY`) para poder mostrarlo al paciente cuando lo pida, más `delivery_code_lookup = HMAC-SHA-256(DELIVERY_CODE_LOOKUP_KEY, código)` para buscarlo; índice único parcial entre citas activas (si choca, se genera otro).
3. **QR:** contiene solo el mismo número, sin datos del paciente. La web lo dibuja en el navegador (`qrcode` 1.5); el bot envía una imagen generada en el servidor.
4. **Validación (`POST /dispenser/code-validations`):** en una transacción con `FOR UPDATE` de la cita: busca por HMAC; rechaza si no existe o está cancelada, expirada o ya validada (409 `code_used` o `code_invalid`), si es de otro punto (403 `other_point`) o si `now` está fuera de `[starts_at, ends_at)` en `America/Bogota` (409 `outside_window`). Si es válida, registra `arrived_at` y la marca como usada.
5. **Respuestas del paciente** con el código llevan `Cache-Control: no-store`.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Solo hash del código | Más seguro en reposo | El paciente no podría consultarlo después (sección 3.5) |
| QR con token firmado largo | No adivinable | El numérico debe servir igual; aumenta la complejidad sin beneficio |

## Consecuencias
- Pendiente: cómo lee el QR el dispensador. Opciones: lector físico que escribe como teclado (sin librería) o cámara del navegador (librería por escoger). Depende del equipo de los puntos.
- El intento de adivinar códigos está acotado por la ventana, el punto y la sesión del dispensador; se registra en auditoría.
