# 0020. Rendimiento y su medición (pregunta P40)

- **Estado:** Aceptada (2026-11-01). La usuaria aprobó la propuesta de medición (P40, R-12); las cifras son de la sección 3.15.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** sección 3.15; brief (pregunta abierta P40); RNF-022, RNF-029, RNF-030, RNF-031; F088 a F091

## Contexto
Cifras confirmadas: con 4G lenta simulada, en el 75 % de las visitas: carga de la pantalla principal ≤ 2,5 s, interacción ≤ 200 ms, CLS ≤ 0,1; JavaScript inicial ≤ 200 KB comprimido; 95 % de las consultas normales de la API < 1 s; prevalidación con OCR ≤ 60 s por solicitud con "procesando"; bot ≤ 3 s. Abierto: qué es "consulta normal", cómo se mide "75 % de las visitas" sin tráfico real y a qué web aplica el límite de 200 KB.

## Decisión de diseño (cumple cualquiera de las respuestas)
- SPA con rutas de carga diferida: el paciente no descarga el código de los paneles; sin librerías de interfaz pesadas; QR y Blob cliente cargados solo en sus pantallas; presupuesto de tamaño verificado en la construcción.
- Estáticos en la CDN de Vercel con caché inmutable.
- API: consultas indexadas; sin llamadas externas en consultas normales; envíos y OCR fuera de la respuesta (`waitUntil`).
- Prevalidación: OCR por documento en paralelo al completar cada carga; la pantalla y el bot muestran "procesando" y consultan el estado.
- Bot: respuesta inmediata y trabajo largo después (ADR 0008).

## Medición aprobada (P40, Confirmado)
| Punto | Decisión | Razón |
| --- | --- | --- |
| (a) Consultas normales | Todas las peticiones de la API excepto completar una carga, iniciar la prevalidación, el webhook de Telegram y las tareas programadas | Tienen cifras propias o no son interactivas |
| (b) 75 % de las visitas | 10 mediciones de Lighthouse CI por pantalla principal de cada experiencia en la vista previa publicada, perfil móvil con 4G lenta; cumple si al menos 8 de 10 (≥ 75 %) pasan LCP ≤ 2,5 s y CLS ≤ 0,1; para la interacción, que no se mide en laboratorio, se usa TBT ≤ 200 ms como sustituto más una prueba de Playwright que mide la respuesta a la acción principal con CPU y red limitadas | Sin tráfico real no hay datos de campo |
| (c) Alcance de 200 KB | Por experiencia: el JavaScript inicial de cada entrada (paciente, dispensador, administrador) ≤ 200 KB comprimido | La sección 3.15 habla de "la web"; aplicarlo a las tres es lo más estricto y el diseño lo permite |
| API p95 | Script de carga ligera sobre la vista previa (100 peticiones por ruta normal) midiendo p95 en el servidor con métricas de la función | Reproducible |

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Datos de campo con Speed Insights | Mide visitas reales | Sin tráfico real en el prototipo; costo y alcance del plan no verificados |
| Medir solo una vez | Rápido | No representa "75 % de las visitas" |

## Consecuencias
- Riesgos: suspensión de Neon gratuito y arranques en frío pueden afectar p95 y los 3 s del bot.
- El lector de QR con cámara (`barcode-detector` y su WebAssembly, ADR 0015) se carga solo al pulsar su botón: no cuenta en los 200 KB iniciales del panel del dispensador.
- Volver a validar (sin OCR) y cancelar una solicitud son consultas normales: entran en el p95 de 1 segundo.
