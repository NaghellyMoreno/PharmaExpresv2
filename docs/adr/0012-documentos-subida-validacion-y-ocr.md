# 0012. Documentos: subida directa a almacenamiento privado, validación por contenido y OCR

- **Estado:** Aceptada. La usuaria escogió el OCR y los criterios de coincidencia el 2026-11-01 (cierra R-04), confirmó la lectura (a) de la coincidencia, la región East US y el texto de la autorización de datos de salud, y aprobó las propuestas Inferidas. Solo queda configuración externa (ver Consecuencias).
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.2, 3.4, 3.11, 3.13 (puntos 5, 6 y 10), 3.14 y 3.15; guía de agentes (architect, punto 8); HU-006 a HU-008; RNF-011, RNF-027, RNF-030; F015 a F027, F089, F090; `docs/04-readiness.md` (R-04); decisión de la usuaria del 2026-11-01 (punto 3)

## Contexto
Lo que fija el contexto (Confirmado):
- Formatos JPG, PNG, HEIC y PDF. Máximo 10 MB por archivo y PDF de hasta 5 páginas.
- 3 cargas por documento y 20 archivos por paciente por hora.
- Validación por contenido real y tamaño, nombre aleatorio e imágenes recodificadas sin metadatos.
- Almacenamiento privado, con acceso solo por enlaces temporales.
- Vercel rechaza peticiones de más de 4,5 MB a una función (sección 3.14).
- El resultado con OCR llega en máximo 60 segundos por solicitud, con "procesando" mientras tanto.
- Los documentos son datos de salud (sección 3.11). La autorización para tratarlos se pide antes de cargar cualquier documento (sección 3.2).

Restricción nueva (Confirmado, la dio la usuaria el 2026-11-01): es un prototipo universitario (Universidad de Caldas) con presupuesto de US$0. Solo se usan servicios gratuitos o cuentas de estudiante sin tarjeta.

## Decisiones de la usuaria (Confirmado, 2026-11-01)
1. **OCR:** Azure AI Document Intelligence, modelo Read, nivel S0, pagado con el crédito de Azure for Students. Reemplaza a Google Cloud Vision. No se usa F0, que solo lee 2 páginas y 4 MB.
2. **Coincidencia con la EPS simulada** (ahora también en la sección 3.4 del contexto, versión 7):
   - **Fórmula:** el número de fórmula y la cédula.
   - **Historia clínica:** la cédula y el código CIE-10 del diagnóstico. Si el código de esa fórmula no aparece, la descripción del diagnóstico, comparada sin tildes ni mayúsculas (lectura (a), Confirmada).
3. **Región:** el recurso de Azure se crea en East US (Estados Unidos).
4. **Texto de la autorización de datos de salud:** informa que los documentos se procesan con Microsoft Azure en Estados Unidos (RNF-037), en la web y en el bot.

## Hechos verificados en la documentación oficial (Microsoft Learn y azure.microsoft.com, 2026-11-01)
| Dato | F0 | S0 |
| --- | --- | --- |
| Tamaño máximo del documento | 4 MB | 500 MB |
| Páginas analizadas por petición | 2 | 2.000 |
| Peticiones de análisis por segundo | 1 | 15 (ajustable) |

- **Formatos de Read (API 4.0):** PDF, JPEG/JPG, PNG, BMP, TIFF y HEIF.
- **Precio:** F0 incluye 500 páginas gratis al mes. El precio de Read en S0 no aparece en la página oficial (muestra "$-" por cada 1.000 páginas). Fuentes de terceros citan US$1,50 por cada 1.000 páginas, pero no está verificado.
- **Azure for Students:** US$100 de crédito para 12 meses, sin tarjeta, renovable cada año mientras se sea estudiante. Cuando el crédito se agota, Azure pregunta si se pasa a pago por uso. Si no, la suscripción y sus productos se desactivan.
- **Tratamiento de datos:**
  - Los datos se procesan en la región del recurso.
  - El documento enviado y el resultado se guardan cifrados hasta 24 horas después del análisis y luego se borran solos.
  - La operación "Delete Analyze Result" los borra antes y de forma permanente.
- **SDK:** `@azure-rest/ai-document-intelligence` 1.1.0 (registro de npm), que usa por defecto la API `2024-11-30`. Acepta el archivo en el cuerpo de la petición (`base64Source`). Modelo: `prebuilt-read`.

## Decisión
1. **Almacenamiento** (sin cambios): Vercel Blob privado (`@vercel/blob` 2.8.2), con URL firmadas `put` y `get` de vida corta.
2. **Flujo web** (sin cambios): intención de carga con URL firmada a `quarantine/<uuid>`, subida directa a Blob y completado.
   - Al completar, el backend valida el tamaño real y el tipo real por firmas binarias (`file-type` 22.3), y cuenta las páginas del PDF (`unpdf` 2.1).
   - Las imágenes HEIC se convierten con `heic-convert` 2.1, y todas las imágenes se recodifican con `sharp` 0.35 a JPEG o PNG sin metadatos.
   - El resultado se guarda en `documents/<uuid>` y se borra la cuarentena.
   - Aunque Read acepta HEIF, se mantiene la conversión, porque la sección 3.13 (punto 6) exige recodificar.
3. **Flujo Telegram:** el bot descarga el archivo o la foto normal (la de mayor resolución) con `getFile` y lo sube desde el servidor a la cuarentena. Si el OCR de una foto normal falla, el bot sugiere enviarla como archivo (ADR 0008, decisión de la usuaria).
4. **OCR con Azure Read S0:**
   - Se ejecuta por documento al completar la carga, en paralelo y con `waitUntil`. La prevalidación arranca cuando todos los documentos de la solicitud están procesados.
   - El backend envía los bytes ya recodificados en `base64Source`. Nunca entrega a Azure una URL de Blob, así el almacenamiento no se expone a un tercero (Inferido).
   - El análisis es asíncrono: se envía, se consulta hasta que termina y se lee el texto. Con máximo 5 páginas por PDF, cabe en los 60 segundos de la sección 3.15. Se probará con documentos reales de prueba (F089, F090).
   - Al obtener el resultado, el backend llama a "Delete Analyze Result", para que Azure no conserve el documento ni el texto durante 24 horas.
   - Si Azure no responde, responde 429 o la suscripción está desactivada por falta de crédito, el documento queda `ocr_pending`, se reintenta y no consume carga (Inferido).
5. **Autorización de datos de salud antes del envío a Azure** (invariante 3; sección 3.2):
   - **Texto y versión (cierra R-21):** el texto vive en el código del backend con una versión (`health-YYYY-MM-vN`) y se entrega con `GET /api/v1/health-data-notice` (público: no tiene datos del paciente). La web lo muestra en P-04 y el bot usa el mismo servicio en proceso. `POST /patients/{p}/health-data-authorizations` exige la versión vigente (409 si no lo es) y la guarda en `consent_records.notice_version` (`kind = health_data`), con la declaración titular o tercero y el canal. Si el texto cambia, sube la versión y las autorizaciones anteriores dejan de servir para nuevas cargas (Decisión técnica, coherente con el Inferido de HU-006 criterio 4).
   - La intención de carga ya exige una autorización de datos de salud vigente.
   - Además, justo antes de llamar a Azure, el servicio de OCR vuelve a comprobar dos cosas: que la autorización sigue vigente y que el paciente no revocó. Si falla cualquiera, no envía nada y borra el documento.
   - Si el paciente revoca mientras hay un análisis en curso, la revocación borra el documento y su resultado en el sistema y llama a "Delete Analyze Result" para las operaciones de Azure que sigan abiertas (sección 3.2: la revocación elimina los datos del OCR). Para eso, el identificador de la operación de Azure se guarda en `documents.ocr_operation_id` solo mientras no se haya borrado. Si la llamada falla, queda una tarea `ocr_result_purge` sin datos del paciente (ADR 0011 y 0018). Si un análisis en curso termina después de la revocación, el servicio no encuentra el documento, borra el resultado en Azure y descarta el texto.
   - Todos los documentos son de prueba (invariante 6).
6. **Coincidencia con la EPS simulada.** El sistema no busca diagnósticos en general: busca, en el texto, los datos que la EPS simulada ya tiene para ese paciente. Nunca escoge entre varios diagnósticos (sección 3.4).
   - **Fórmula:** se buscan en el texto las fórmulas del paciente verificado en `sim.formulas`, no las de toda la base. Coincide la fórmula cuyo número aparece en el texto, si en el mismo texto aparece la cédula del paciente. Si no coincide ninguna, o coincide más de una, el documento queda en `needs_reupload` (Inferido).
   - **Historia clínica:** para cada fórmula de la solicitud, el texto debe contener la cédula del paciente y el diagnóstico que la EPS simulada tiene para esa fórmula.
     - Primero se busca el código CIE-10 (`sim.diagnoses.code`).
     - Si no está, se busca la descripción (`sim.diagnoses.description`).
     - Si no se lee la cédula, o el texto es ilegible, la historia clínica queda en `needs_reupload`. Si se lee pero falta el diagnóstico de una fórmula, solo esa fórmula sigue la regla de la sección 3.4.
   - **Normalización** (propuestas aprobadas el 2026-11-01; "sin tildes ni mayúsculas" es de la sección 3.4):
     - Cédula: solo dígitos, sin puntos ni espacios.
     - Número de fórmula: sin espacios, guiones ni diferencias de mayúsculas.
     - Código CIE-10: sin mayúsculas, sin el punto y como palabra completa, para que `E11` no coincida dentro de `E119`.
     - Descripción: sin tildes ni mayúsculas (Confirmado). Se descompone en Unicode (NFD), se quitan las marcas diacríticas (lo que también convierte "ñ" en "n") y se pasa a minúsculas. Además se unifican espacios y signos de puntuación (Inferido). Debe aparecer completa y seguida en el texto normalizado del documento; no basta una coincidencia parcial (Inferido).
   - **Dónde ocurre la comparación** (invariante 8): todo pasa en memoria, dentro de la petición que procesa el documento. El texto completo del OCR, el texto normalizado y la descripción del diagnóstico nunca se guardan en la base de datos ni en los logs.
7. **Datos que se guardan del OCR:** `document_extractions` deja de guardar campos de texto y guarda solo el resultado del cruce:
   - el identificador de la fórmula simulada encontrada;
   - si coincidió la cédula (sí o no);
   - por cada fórmula, si coincidió el diagnóstico y el método (`code` o `description`);
   - el motivo de rechazo, si lo hay.

   No guarda la cédula, el número de fórmula, el código ni la descripción del diagnóstico, ni los nombres de medicamentos: el diagnóstico y los medicamentos se leen siempre de la EPS simulada. Esto basta para volver a validar a las 48 horas en la misma solicitud sin llamar de nuevo al OCR (ADR 0011).
8. **Logs** (invariante 8):
   - Del OCR se registra solo el identificador del documento, la duración, el número de páginas, el resultado (`matched`, `needs_reupload`, `ocr_pending`) y el código de error de Azure.
   - El registro HTTP del SDK de Azure (`AZURE_LOG_LEVEL`) queda apagado en vista previa y producción (Inferido).
   - Ningún error incluye el cuerpo de la respuesta de Azure.
9. **Acceso posterior** (sin cambios): solo el backend lee los archivos. No hay URL públicas permanentes y la API nunca devuelve el archivo.

## Alternativas consideradas
| Alternativa | Por qué no se escogió |
| --- | --- |
| Google Cloud Vision | Reemplazada por decisión de la usuaria. Su precio no se pudo verificar |
| Azure Read F0 | Solo analiza 2 páginas y archivos de 4 MB; la sección 3.4 admite 5 páginas y 10 MB |
| Tesseract en la función | Sin PDF nativo, lento para 60 segundos con varias páginas, y aumenta el tamaño de la función |
| AWS Textract | No verificado |
| Subir por la función en partes de menos de 4,5 MB | Complejo y frágil; la guía de agentes lo desaconseja |

## Consecuencias
- Cerrados R-04 y R-21. F015 a F027, F089 y F090 se pueden construir; en local y en pruebas automáticas el OCR usa un adaptador `capture` que devuelve el texto de documentos de prueba conocidos (`OCR_PROVIDER=capture`, Decisión técnica), sin llamar a Azure.
- Variables de entorno: `OCR_PROVIDER` (`azure`, `capture`), `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` y `AZURE_DOCUMENT_INTELLIGENCE_KEY`.
- Los datos simulados (ADR 0013) traen en `sim.diagnoses` el código CIE-10 y la descripción de cada diagnóstico, ambos obligatorios, y los documentos de prueba deben mostrar esos mismos datos. El contenido lo arma la usuaria (sección 3.8).
- **Riesgos:**
  - El costo se paga con el crédito de estudiante. Si se agota, la suscripción se desactiva: no se cobra, pero el OCR deja de funcionar y las solicitudes quedan en `ocr_pending`. Como el precio de Read S0 no está verificado en la página oficial, no se puede estimar cuántas páginas cubre el crédito.
  - No se verificó en la documentación oficial que el modelo Read de la versión 2024-11-30 esté disponible en East US para una suscripción Azure for Students; las listas de regiones encontradas hablan de versiones preliminares. Se confirma al crear el recurso.
  - Límites de Blob en Hobby: 1 GB y 2.000 operaciones avanzadas al mes. Si se exceden, Blob queda bloqueado 30 días. La limpieza de la cuarentena es obligatoria.
  - `heic-convert` tiene poca actividad. Hay que probarlo con archivos HEIC reales antes de aprobar F019.
- **Configuración antes de publicar (usuaria; no bloquea):** crear el recurso Document Intelligence S0 en East US con Azure for Students, confirmar que no pidió tarjeta y revisar el precio de Read S0 en el portal o la calculadora de Azure.
