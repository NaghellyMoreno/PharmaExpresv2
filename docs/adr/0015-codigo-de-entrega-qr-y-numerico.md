# 0015. Código de entrega en QR y numérico

- **Estado:** Aceptada (2026-11-01). Longitud de 8 dígitos y lectura del QR con la cámara del navegador más un campo numérico Confirmadas por la usuaria (R-10). La librería de lectura es una decisión técnica.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.5 y 3.7; guía de agentes (architect, punto 11); HU-016, HU-025; RNF-033; F035, F036, F053; `docs/04-readiness.md` (R-10)

## Contexto
Confirmado: cada cita tiene un código de un solo uso, en QR y numérico, que el usuario consulta cuando lo necesita; solo es válido en su punto, dentro de su ventana y una vez; la hora de llegada es el momento de validación; una fórmula agregada a una cita usa el mismo código. El código numérico tiene 8 dígitos. El panel lee el QR con la cámara del navegador y ofrece un campo numérico que también sirve con un lector físico USB que escribe el código (usuaria, R-10).

## Decisión
1. **Generación:** 8 dígitos con `crypto.randomInt(0, 100_000_000)`, con ceros a la izquierda (Confirmado, R-10).
2. **Almacenamiento:** cifrado (AES-256-GCM con `DELIVERY_CODE_ENC_KEY`) para poder mostrarlo al paciente cuando lo pida, más `delivery_code_lookup = HMAC-SHA-256(DELIVERY_CODE_LOOKUP_KEY, código)` para buscarlo; índice único parcial entre citas activas (si choca, se genera otro).
3. **QR:** contiene solo los mismos 8 dígitos, sin datos del paciente ni URL. La web lo dibuja en el navegador (`qrcode` 1.5) con el número también como texto (accesibilidad, F076); el bot envía una imagen generada en el servidor y el número como texto.
4. **Lectura en el panel del dispensador (D-02):**
   - Un solo campo numérico (`inputmode="numeric"`, `autocomplete="off"`, enfocado al abrir la pantalla) que acepta exactamente 8 dígitos y envía al recibir Enter. Un lector físico USB que funciona como teclado escribe los dígitos y Enter en ese campo: no necesita librería (Confirmado, R-10).
   - Botón "Leer QR con la cámara": abre la cámara con `getUserMedia` (exige HTTPS, que ya impone Vercel) y detecta el QR con la API `BarcodeDetector` del navegador cuando existe; si no existe, usa el ponyfill `barcode-detector` 3.2.3 (MIT, ZXing en WebAssembly; versión verificada en el registro de npm el 2026-11-01). El valor leído se escribe en el mismo campo y sigue el mismo camino que el teclado (Decisión técnica).
   - El módulo de cámara y el archivo WebAssembly se cargan solo al pulsar el botón (carga diferida, ADR 0020) y se sirven desde el propio dominio (`locateFile`), no desde una CDN externa, para que la CSP siga siendo `'self'`; la CSP del panel agrega `'wasm-unsafe-eval'` en `script-src` (ADR 0002).
   - Si el navegador niega la cámara, el panel lo explica y el campo numérico sigue disponible.
5. **Validación (`POST /dispenser/code-validations`):** recibe `code` con exactamente 8 dígitos. En una transacción con `FOR UPDATE` de la cita: busca por HMAC; rechaza si no existe o está cancelada, expirada o ya validada (409 `code_used` o `code_invalid`), si es de otro punto (403 `other_point`) o si `app.clock_now()` está fuera de `[starts_at, ends_at)` en `America/Bogota` (409 `outside_window`). Si es válida, registra `arrived_at` y la marca como usada. Cada intento, aceptado o rechazado, queda en la auditoría sin el código (ADR 0016).
6. **Respuestas del paciente** con el código llevan `Cache-Control: no-store`.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Solo hash del código | Más seguro en reposo | El paciente no podría consultarlo después (sección 3.5) |
| QR con token firmado largo | No adivinable | El numérico debe servir igual; aumenta la complejidad sin beneficio |
| `@zxing/browser` 0.2 | Conocida | Versión 0.x de la capa de navegador; `barcode-detector` sigue la API estándar y cede al navegador cuando la tiene |
| Solo lector físico | Sin librería | La usuaria pidió también la cámara |

## Consecuencias
- Cerrada la parte de R-10 sobre códigos y QR.
- El intento de adivinar códigos está acotado por la ventana, el punto y la sesión del dispensador; se registra en auditoría.
- La lectura con cámara depende del permiso del navegador y de la luz del punto; el campo numérico es siempre la alternativa.
