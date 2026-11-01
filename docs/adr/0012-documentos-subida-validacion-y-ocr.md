# 0012. Documentos: subida directa a almacenamiento privado, validación por contenido y OCR

- **Estado:** Propuesta (proveedor de OCR, su costo y criterios de cruce Pendientes de confirmar)
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.4, 3.11, 3.13 (puntos 5 y 6), 3.14 y 3.15; guía de agentes (architect, punto 8); HU-006 a HU-008; RNF-011, RNF-027, RNF-030; F015 a F019, F089, F090

## Contexto
Confirmado: JPG, PNG, HEIC y PDF; máximo 10 MB por archivo y PDF de hasta 5 páginas; 3 cargas por documento; 20 archivos por paciente por hora; validación por contenido real y tamaño; nombre aleatorio; imágenes recodificadas sin metadatos; almacenamiento privado; acceso solo con enlaces temporales. Vercel rechaza más de 4,5 MB por petición a una función (sección 3.14, verificado). El resultado con OCR en máximo 60 s por solicitud con "procesando". Los documentos son datos de salud.

## Decisión
1. **Almacenamiento:** Vercel Blob privado (`@vercel/blob` 2.8.2). Verificado: Private Blob es de disponibilidad general desde 2026-06-30 en todos los planes; `issueSignedToken` y `presignUrl` permiten URL firmadas `put` con `maximumSizeInBytes`, `allowedContentTypes` y `validUntil`, y URL `get` temporales.
2. **Flujo web (sin pasar el archivo por la función):**
   1. `POST .../documents/upload-intents`: el backend comprueba vinculación vigente, autorización de datos de salud, cargas restantes (≤ 3) y el límite de 20 por hora (`upload_events`), y devuelve una URL `put` firmada para `quarantine/<uuid-aleatorio>` con máximo 10 MB, tipos declarados permitidos y vigencia corta (Inferido: 10 minutos).
   2. El navegador sube directo a Blob.
   3. `POST .../documents/{documentId}/completion`: el backend lee el objeto desde Blob (descarga saliente, sin límite de 4,5 MB), valida tamaño real ≤ 10 MB y tipo real por firmas binarias (`file-type` 22.3), y si es PDF cuenta páginas (`unpdf` 2.1) ≤ 5. Imágenes: HEIC se decodifica con `heic-convert` 2.1 (los binarios precompilados de `sharp` no incluyen HEIC); todas se recodifican con `sharp` 0.35 a JPEG o PNG sin metadatos. Guarda el resultado en `documents/<uuid-aleatorio>` y borra la cuarentena. Rechazo: 415 o 422 y la carga cuenta (Inferido).
3. **Flujo Telegram:** el bot descarga con `getFile` y sube desde el servidor a la cuarentena; el resto es igual.
4. **OCR (propuesto):** Google Cloud Vision (`@google-cloud/vision` 6.2.0): imágenes con `DOCUMENT_TEXT_DETECTION`; PDF con `files:annotate` en línea, que procesa como máximo 5 páginas por archivo (verificado), coherente con el límite de la sección 3.4. Procesamiento por documento al completar, en paralelo, con `waitUntil`; la prevalidación arranca cuando todos los documentos de la solicitud están procesados. Si el OCR no responde, el documento queda `ocr_pending`, se reintenta y no consume carga (Inferido).
5. **Cruce con la EPS simulada:** el texto extraído se usa para (a) identificar la fórmula en `sim.formulas` y (b) comprobar que la historia clínica contiene el diagnóstico que la EPS tiene para cada fórmula. El sistema nunca escoge entre diagnósticos (sección 3.4). **Pendiente:** qué campos exactos cuentan como coincidencia (propuesta: número de fórmula y cédula del paciente en la fórmula; código o descripción del diagnóstico en la historia clínica).
6. **Acceso posterior:** solo el backend lee los archivos (SDK o URL `get` firmada de vida corta); ninguna URL pública permanente; la API nunca devuelve el archivo.
7. **Datos extraídos:** solo los campos necesarios en `document_extractions`; nunca en logs.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Subir por la función en partes de menos de 4,5 MB | Sin almacenamiento firmado | Complejo y frágil; la guía de agentes lo desaconseja |
| Supabase Storage o S3 con URL firmadas | Maduros | Otra cuenta y credenciales; Blob privado ya está en Vercel |
| OCR con Tesseract en la función | Sin costo por página | Sin PDF nativo, lento para 60 s en varias páginas; tamaño de función |
| Azure Document Intelligence o AWS Textract | Buen OCR | No verificados en esta revisión; Textract síncrono limitado en PDF |

## Consecuencias
- Pendiente (usuaria): confirmar Google Cloud Vision y su costo (la página oficial de precios no se pudo leer en esta revisión) y los criterios de cruce.
- Límites de Blob Hobby: 1 GB y 2.000 operaciones avanzadas al mes; al exceder, Blob queda bloqueado 30 días (verificado). La limpieza de cuarentena es obligatoria.
- `heic-convert` tiene poca actividad: probar con archivos HEIC reales antes de aprobar F019.
