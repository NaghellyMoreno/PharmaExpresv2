# Borrador del aviso de privacidad y tratamiento de datos personales

Estado: **Borrador para validación de la usuaria.** No reemplaza el texto provisional de `apps/api/src/modules/identity/privacy-notice.ts` hasta que la usuaria lo apruebe.
Fuentes: secciones 3.1, 3.2, 3.3, 3.6, 3.10, 3.11 y 3.13 del contexto; HU-001, HU-005, HU-006 y HU-019 de `docs/02-requisitos.md`.

> **Advertencia:** este texto lo propuso un agente de IA a partir del contexto del producto. No es asesoría jurídica. Antes de publicarlo, un asesor jurídico debe validarlo frente a la Ley 1581 de 2012, el Decreto 1377 de 2013 y las demás normas que apliquen. Este borrador solo cita las normas que ya están en el contexto (sección 3.11 y sección 3.2). No incluye contenido legal que el contexto no trae, como la lista completa de derechos del titular, los plazos de respuesta o la conservación de los datos: esos puntos van marcados como [POR DEFINIR].

## 1. Texto propuesto

Campos que no cambian (sección 3.2; se dejan como están en el código):
- `declaration`: "Soy el titular o actúo con su autorización"
- `revocationOption.label`: "Revocar mi autorización"
- `revocationOption.cedulaUseNotice`: "La cédula se usa solo para verificar la identidad y atender la solicitud."

### title

Aviso de privacidad y tratamiento de datos personales

### body

Los párrafos están numerados para la tabla de la sección 2 (A1, A2...). Los números no forman parte del texto que se muestra.

> **[A1] Quién trata tus datos.** El responsable del tratamiento es [POR DEFINIR: nombre del responsable], [POR DEFINIR: tipo y número de identificación], con domicilio en [POR DEFINIR: dirección o ciudad]. Contacto: [POR DEFINIR: correo de contacto]. Pharma Express es un prototipo universitario de la Universidad de Caldas para preparar la entrega de medicamentos en Manizales. [POR DEFINIR: frase sobre la relación con Disfarma].
>
> **[A2] Qué datos usamos.** Tu cédula y los datos que tiene registrados tu EPS (Salud Total o Sanitas): nombre, celular, correo y estado de afiliación. También el chat de Telegram o el navegador desde el que haces las gestiones, y tus solicitudes y citas. No creamos cuentas: los datos de contacto los tomamos de tu EPS.
>
> **[A3] Datos de salud.** Tus fórmulas y tu historia clínica son datos sensibles. Solo los recibimos si das una autorización aparte, que te pediremos antes de cargar cualquier documento.
>
> **[A4] Para qué los usamos.**
> - Verificar tu identidad con tu cédula y un código que enviamos por SMS y por correo.
> - Dejar vinculado tu chat de Telegram o tu navegador durante 3 meses.
> - Revisar de forma preliminar tus fórmulas y la disponibilidad de medicamentos, reservarlos y agendar tu cita. La validación oficial se hace en el punto.
> - Enviarte avisos y recordatorios por la web, Telegram, SMS y correo. Nunca incluyen nombres de medicamentos ni diagnósticos.
>
> **[A5] Si actúas por otra persona.** Si eres cuidador, familiar, tutor o facilitador, declaras que tienes la autorización del titular. Quien ingresa el código correcto puede hacer todas las gestiones del paciente.
>
> **[A6] Con quién se comparten.** Los mensajes los transportan Telegram y los servicios de SMS y correo. [POR DEFINIR: encargados del tratamiento, lugar donde se guardan los datos y, si aplica, transferencia internacional].
>
> **[A7] Tus derechos.** Puedes revocar esta autorización y pedir que eliminemos tus datos en cualquier momento, sin costo, con la opción "Revocar mi autorización" en el inicio de la web y del bot. Para revocar te enviamos un código nuevo, aunque tu canal esté vinculado. El cambio de celular o correo se hace en tu EPS. Para los demás derechos que te da la Ley 1581 de 2012: [POR DEFINIR: derechos, procedimiento y plazos de respuesta], escribiendo a [POR DEFINIR: correo de contacto].
>
> **[A8] Qué pasa al revocar.** Borramos de inmediato tus documentos, los resultados de la revisión, tus solicitudes, tus citas y la vinculación de tus chats y navegadores. Las citas activas se cancelan y te avisamos por SMS y correo. Solo guardamos la prueba de tu autorización y de la revocación (fecha, canal, si fue el titular o un tercero y versión de este aviso), sin tu cédula. Los datos de tu EPS no cambian.
>
> **[A9] Cuánto tiempo los guardamos.** [POR DEFINIR: plazo de conservación de los datos mientras no se revoque].
>
> **[A10] Si no aceptas.** No registramos ningún dato tuyo. Puedes acudir a la atención presencial en el punto.
>
> **[A11] Versión.** Aviso vigente desde [POR DEFINIR: fecha]. Versión [POR DEFINIR: identificador de la versión].

Longitud: alrededor de 2.400 caracteres, con los marcadores. Debe caber en un solo mensaje de Telegram. El límite de 4.096 caracteres por mensaje es un dato técnico que architect o developer deben confirmar (Inferido). Cuando se reemplacen los marcadores, hay que volver a medir.

## 2. Clasificación de cada afirmación

| Párrafo | Afirmación | Estado | Origen |
| --- | --- | --- | --- |
| A1 | Responsable, identificación, domicilio y correo de contacto | Pendiente | El contexto no lo dice |
| A1 | Es un prototipo universitario de la Universidad de Caldas | Confirmado | Secciones 2.1 y 3.9 |
| A1 | Sirve para preparar la entrega de medicamentos en Manizales | Confirmado | Sección 2.1 |
| A1 | Relación con Disfarma | Pendiente | La sección 3.9 dice que el proyecto se desarrolla desde afuera y sin acceso a los sistemas de Disfarma. Decidir si el aviso lo aclara y cómo |
| A2 | Se usa la cédula | Confirmado | Sección 3.2 |
| A2 | Celular, correo y afiliación vienen de la EPS (Salud Total o Sanitas) | Confirmado | Secciones 2.1 y 3.2 |
| A2 | Se usa el nombre del paciente que registra la EPS | Confirmado | HU-005, criterio 5 (respuesta de la usuaria, P13) |
| A2 | Se usa el chat de Telegram o el navegador | Confirmado | Sección 3.3 |
| A2 | Se usan las solicitudes y citas | Confirmado | Secciones 3.2 y 3.5 |
| A2 | No se crean cuentas para los pacientes | Confirmado | Secciones 3.2 y 3.10 |
| A3 | Fórmulas e historia clínica son datos sensibles | Confirmado | Sección 3.11 |
| A3 | La autorización de datos de salud es aparte y se pide antes de cargar documentos | Confirmado | Sección 3.2 |
| A3 | El aviso de Microsoft Azure en Estados Unidos va en la autorización de datos de salud, no en este aviso | Inferido | HU-006, criterio 3. Confirmar si también debe ir aquí |
| A4 | Verificación con cédula y código por SMS y correo | Confirmado | Sección 3.2 |
| A4 | Vinculación del canal durante 3 meses | Confirmado | Sección 3.3 |
| A4 | Revisión preliminar, disponibilidad, reserva y cita; la validación oficial se hace en el punto | Confirmado | Secciones 3.4 y 3.5 |
| A4 | Avisos por web, Telegram, SMS y correo, sin medicamentos ni diagnósticos | Confirmado | Sección 3.6 |
| A4 | Las finalidades se resumen en cuatro puntos, en lenguaje claro | Inferido | Redacción del agente |
| A5 | El tercero declara que tiene la autorización del titular | Confirmado | Sección 3.2 |
| A5 | Quien ingresa el código correcto puede hacer todas las gestiones | Confirmado | Sección 3.3 |
| A6 | Telegram, SMS y correo transportan los mensajes | Confirmado | Secciones 2.3 y 3.8 |
| A6 | Encargados, lugar de almacenamiento y transferencia internacional | Pendiente | El contexto no lo dice. Los ADR 0002 y 0009 registran proveedores y regiones en Estados Unidos, pero si se deben nombrar en el aviso es una decisión legal |
| A7 | Se puede revocar y pedir que se eliminen los datos | Confirmado | Sección 3.2 |
| A7 | La revocación es gratuita y fácil de encontrar, en el inicio de la web y del bot | Confirmado | Sección 3.2 (Decreto 1377 de 2013, artículo 9) |
| A7 | La revocación pide un código nuevo, aunque el canal esté vinculado | Confirmado | Sección 3.2 |
| A7 | El cambio de celular o correo se hace en la EPS | Confirmado | Sección 3.2 |
| A7 | La Ley 1581 de 2012 aplica | Confirmado | Sección 3.11 |
| A7 | Lista de derechos, procedimiento y plazos de respuesta | Pendiente | El contexto no los trae |
| A8 | Lo que se elimina de inmediato al revocar | Confirmado | Sección 3.2. El texto usa "resultados de la revisión" para nombrar los datos del OCR y los resultados de prevalidación, y no nombra los recordatorios programados: Inferido, por brevedad |
| A8 | Las citas activas se cancelan y se avisa por SMS y correo | Confirmado | Sección 3.2 |
| A8 | Se conserva la prueba (fecha, canal, titular o tercero, versión), sin la cédula | Confirmado | Sección 3.2 (huella con clave secreta; Decreto 1377 de 2013, artículo 8) |
| A8 | Los datos de la EPS no cambian | Confirmado | Sección 3.2 |
| A8 | No se menciona el registro anónimo de las citas (punto, ventana, fecha y motivo) | Inferido | Sección 3.2. Se omitió porque no contiene datos del paciente; confirmar si se debe informar |
| A9 | Plazo de conservación | Pendiente | El contexto no lo dice |
| A10 | Si no acepta, no se registra nada | Confirmado | Sección 3.2 |
| A10 | La atención presencial sigue disponible | Confirmado | Sección 3.1 |
| A11 | Fecha de vigencia e identificador de la versión | Pendiente | La sección 3.2 exige registrar la versión; el valor actual del código (`2026-10-v1`) es provisional |
| Todo el texto | Se usa "tú", como en los mensajes aprobados de la sección 3.2 (el texto provisional del código usa "usted") | Inferido | Sección 3.2. Confirmar el tratamiento |
| Todo el texto | No nombra medicamentos ni diagnósticos | Confirmado | Sección 3.6 y CLAUDE.md, invariante 1 |

## 3. Datos que la usuaria debe proveer o decidir

Marcadores [POR DEFINIR] del texto:
1. Nombre del responsable del tratamiento: la usuaria, la Universidad de Caldas u otro (A1).
2. Tipo y número de identificación del responsable (A1).
3. Domicilio o dirección del responsable (A1).
4. Correo de contacto para consultas y reclamos (A1 y A7).
5. Frase sobre la relación con Disfarma, o si se omite (A1).
6. Encargados del tratamiento, lugar donde se guardan los datos y, si aplica, transferencia internacional (A6).
7. Derechos del titular, procedimiento y plazos de respuesta según la Ley 1581 de 2012, validados por el asesor jurídico (A7).
8. Plazo de conservación de los datos mientras no se revoque (A9).
9. Fecha de vigencia e identificador de la versión del aviso (A11).

Decisiones adicionales (no tienen marcador en el texto):
10. Si el aviso debe decir que el prototipo usa datos ficticios y pedir que no se ingresen datos reales (sección 3.10). Recomendación: sí, con una frase corta en A1, porque el prototipo no puede recibir datos reales de pacientes.
11. Si este aviso también debe informar el procesamiento con Microsoft Azure en Estados Unidos, o basta con la autorización de datos de salud (HU-006, criterio 3). Recomendación: dejarlo en la autorización de datos de salud, que es donde se procesan los documentos.
12. Tratamiento de "tú" o "usted". Recomendación: "tú", como en los mensajes aprobados de la sección 3.2.
13. Quién valida el texto (el asesor jurídico) y antes de qué fecha, para publicarlo.
