# Guía de agentes: Pharma Express

Reglas propias de este proyecto para cada agente. Complementan los agentes y skills genéricos del sistema; si algo de aquí choca con el contexto, manda el contexto.

## Todos los agentes: cuándo preguntar a la usuaria
- Presupuesto US$0: es un prototipo universitario (Universidad de Caldas). Solo se usan servicios gratuitos o cuentas de estudiante sin tarjeta. Nunca propongas un servicio de pago.
- Pregunta a la usuaria solo si la decisión:
  1. cambia lo que ve o vive el paciente, el dispensador o el administrador, y el contexto no la cubre;
  2. tiene costo;
  3. contradice el contexto;
  4. no se puede deshacer;
  5. requiere una acción suya (crear cuentas, dominio, teléfono).
- Todo lo demás es una decisión técnica: tómala con la opción más simple y segura, escríbela en el ADR como "Decisión técnica" y no la preguntes. Ejemplos: nombres de variables, reintentos, frecuencias internas, normalización de textos, bordes de franjas horarias, estados internos, regiones de los servicios y librerías gratuitas. La aprobación de la arquitectura en la compuerta 2 las aprueba en bloque.
- Haz una sola ronda de preguntas por fase, todas juntas, cada una con tu recomendación. Si la usuaria responde "acepto las recomendaciones", aplícalas todas.
- La configuración externa que falta (cuentas, dominio, teléfono, precios por confirmar) no bloquea: se construye y se prueba en modo `capture` o con datos simulados. Lístala en una sección "Configuración antes de publicar".
- Es un prototipo: prefiere lo simple a lo exhaustivo. No diseñes para escala ni para casos que el contexto no menciona.

## product-manager
- Orden del recorrido para `priority`: consentimiento e identidad, vinculación de canales, documentos, prevalidación, reserva y agenda, notificaciones, panel del dispensador y panel de administración.
- Canales: web y Telegram. Una funcionalidad por canal cuando la capacidad existe en ambos.
- Cada panel lleva funcionalidades de seguridad: acceso sin sesión, con otro rol y, en el panel del dispensador, sobre otro punto (sección 3.13).
- Cifras exactas del contexto: código de 10 minutos y 3 intentos (sección 3.2); vinculación de 3 meses (sección 3.3); ventanas de 1 hora, reglas de agudo y crónico y espera de 48 horas (sección 3.5); recordatorios de 19:00 a 21:00 y dos horas antes con tolerancia de 10 minutos, y aviso de crónicos 2 días antes (sección 3.6); 3 cargas por documento, archivos de máximo 10 MB y PDF de hasta 5 páginas (sección 3.4); máximo 2 solicitudes abiertas (sección 3.5); revocación (sección 3.2); sesiones del personal, recuperación de contraseña y límites de frecuencia (secciones 3.12 y 3.13); WCAG 2.1 nivel AA en todas las pantallas web (sección 3.1); cifras de rendimiento (sección 3.15).
- Errores comunes:
  - Usar la regla antigua de 30 días de vigencia: la vigencia es un dato de la EPS simulada (sección 3.4).
  - Presentar la espera de 48 horas como cumplimiento normativo: es un plazo propio del producto (sección 3.11).
  - Criterios que muestran medicamentos o diagnósticos en una notificación (sección 3.6).
  - Convertir en alcance entregas parciales, reprogramación u otros puntos de la sección 3.10.

## architect
Decisiones obligatorias, además de las de la skill write-architecture. Cada una lleva un ADR.
1. Concurrencia de reservas: cero sobre-reservas y confirmación atómica en la base de datos (sección 3.5).
2. Código de un solo uso: generación, almacenamiento con hash, vencimiento e intentos (sección 3.2).
3. Vinculación de navegador y de chat de Telegram, con vencimiento a 3 meses (sección 3.3).
4. Bot de Telegram por webhook, con una librería compatible con NestJS (sección 3.1).
5. Proveedores de SMS y correo, con modo de prueba. Proveedor y costo están pendientes: propón opciones.
6. Notificaciones web a navegadores vinculados (sección 3.6).
7. Recordatorios y reverificación (secciones 3.5 y 3.6). En el plan Hobby de Vercel las tareas programadas corren una vez al día con hasta 59 minutos de desfase, y el módulo de tareas programadas de NestJS no sirve porque no hay un proceso permanente. El recordatorio de dos horas antes admite 10 minutos de tolerancia. Compara plan Pro, colas o flujos de Vercel y un servicio externo de mensajes programados (por ejemplo, Upstash QStash), y deja la elección a la usuaria.
8. OCR (ya decidido): servicio, almacenamiento privado y cruce con la EPS simulada (sección 3.4). Los documentos son datos de salud (sección 3.11) y la función de Vercel para Node.js admite hasta 250 MB.
9. EPS, inventario, puntos y catálogo simulados: formato y carga. El contenido lo arma la usuaria (sección 3.8).
10. Paneles del dispensador y del administrador: autenticación, sesiones y roles (secciones 3.7, 3.12 y 3.13). Las cuentas de dispensadores las crea el administrador, con enlace de un solo uso para definir la contraseña (sección 3.12).
11. Código de entrega en QR y numérico (sección 3.5).
12. Seguridad de la sección 3.13 en NestJS: guard global que niega por defecto, con excepciones públicas explícitas; guard y decorador de roles; validación global de entrada; cabeceras de seguridad; limitación de intentos; CORS; cookies seguras y auditoría.
13. Monorepo TypeScript: cómo comparten tipos React y NestJS a partir de `api/openapi.yaml`, y cómo se comprueba que el código no se desvíe del contrato.

Errores comunes:
- Diseñar que los identificadores de Telegram identifican a alguien (sección 3.1).
- Endpoints que devuelvan medicamentos o diagnósticos a un canal sin vinculación vigente.
- Confiar en que el middleware protege archivos servidos por la CDN de Vercel: no pasan por NestJS.
- Subir los archivos a través de una función: Vercel rechaza peticiones de más de 4,5 MB (sección 3.14). La subida va directo al almacenamiento privado, con autorización previa del backend.
- Polling del bot, procesos permanentes o el módulo de tareas programadas de NestJS: no funcionan en Vercel.

## readiness-reviewer
- Las 13 decisiones de la sección architect tienen ADR. La de recordatorios tiene una opción elegida por la usuaria o está marcada como pendiente bloqueante.
- Cada requisito de la sección 3.13 tiene RNF y mecanismo.
- Las decisiones técnicas y la configuración externa pendiente no son hallazgos. Solo es hallazgo lo que impide construir o probar una funcionalidad, o lo que contradice el contexto.
- CONCERNS permite avanzar a la implementación; los hallazgos menores se corrigen durante ella. Solo un hallazgo crítico da FAIL.

## developer
- Datos de prueba: solo ficticios y los contactos de prueba de la usuaria (sección 3.2).
- Zona horaria `America/Bogota` en todo cálculo de ventanas, citas y recordatorios.

## qa-evaluator
- Paneles: además del acceso sin sesión y con otro rol, el dispensador no puede operar citas de otro punto (sección 3.13).
- Reserva y agenda: dos confirmaciones simultáneas sobre el último cupo; solo una gana (sección 3.5).
- Notificaciones por cualquier canal: nunca muestran medicamentos ni diagnósticos (sección 3.6).
- Telegram, SMS y correo: usa el modo de prueba de la arquitectura; envíos reales solo si el contrato lo pide.
