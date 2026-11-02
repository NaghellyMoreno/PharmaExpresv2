# Requisitos: Pharma Express

Fuentes: `docs/00-contexto-producto.md` (versión 7) y `docs/01-brief.md`. Las decisiones de la usuaria del 2026-11-01 sobre el informe de preparación (`docs/04-readiness.md`) se citan como "Confirmado (usuaria, R-<n>)". La usuaria aprobó en bloque las propuestas de architect, salvo la del ADR 0008 sobre fotos en Telegram; los criterios que dependían de esas propuestas se citan como "Confirmado (propuesta aprobada, ADR <n>)".

Convención: "el usuario" es cualquier persona que usa la web o el bot en nombre de un paciente (paciente, cuidador, tutor o facilitador); el sistema no los distingue (sección 3.3). "Medios del paciente" son: notificación web a los navegadores vinculados, Telegram a los chats vinculados, SMS al celular registrado en la EPS simulada y correo si existe (sección 3.6). Salvo indicación, cada historia aplica igual en web y en Telegram (sección 3.1) y a Salud Total y Sanitas (sección 3.8). Las preguntas citadas como "P<n>" están en `docs/01-brief.md` (resueltas o abiertas). "Confirmado (usuaria, P<n>)" significa respuesta de la usuaria a esa pregunta. Todas las horas son de America/Bogota.

## Historias de usuario

### Consentimiento e identidad

### HU-001: Aceptar el tratamiento de datos
- **Historia:** Como usuario, quiero leer el aviso de privacidad y aceptar el tratamiento de datos antes de dar cualquier dato, para decidir con información si uso el servicio.
- **Fuente:** secciones 3.1 y 3.2 del contexto
- **Criterios de aceptación:**
  1. Dado un usuario que entra por primera vez por web o inicia el bot, cuando se le presenta el servicio, entonces ve el aviso de privacidad y la declaración "soy el titular o actúo con su autorización" antes de que se le pida cualquier dato, incluida la cédula. La única excepción es la opción "Revocar mi autorización" (criterio 5 y HU-019).
  2. Dado el aviso, cuando el usuario acepta, entonces queda registrado si aceptó el titular o un tercero, la fecha, el canal y la versión del aviso (sección 3.2). La fecha registrada es la de la aceptación, no la de un paso posterior (sección 3.2: "Se registra ... la fecha"). Según la arquitectura aprobada, la aceptación queda ligada al paciente cuando se verifica la identidad (HU-002), así que QA comprueba el registro en la base de datos después de esa verificación (R-29).
  3. Dado el aviso, cuando el usuario no acepta, entonces no se registra ningún dato suyo y se le informa que puede acudir a la atención presencial.
  4. Dado Telegram, cuando una persona no ha iniciado el bot, entonces el bot no le escribe.
  5. Dado la pantalla de inicio de la web o del bot, con o sin canal vinculado, cuando se muestra, entonces ofrece también la opción "Revocar mi autorización", que no exige aceptar el aviso de privacidad (sección 3.2).
- **Estado:** Confirmado

### HU-002: Verificar la identidad con cédula y código
- **Historia:** Como usuario, quiero verificar la identidad del paciente con su cédula y un código de un solo uso, para acceder a sus gestiones.
- **Fuente:** sección 3.2 del contexto
- **Criterios de aceptación:**
  1. Dado que aceptó el tratamiento de datos, cuando ingresa una cédula que existe en la EPS simulada, entonces el sistema envía un código de un solo uso por SMS al celular registrado y, si existe, al correo registrado.
  2. Dado un código enviado, cuando se ingresa correctamente dentro de los 10 minutos, entonces la identidad queda verificada y el código ya no puede volver a usarse.
  3. Dado un código enviado, cuando se ingresa uno incorrecto, entonces se rechaza y se descuenta un intento de los 3 disponibles.
  4. Dado cualquier mensaje con el código, cuando se revisa su contenido, entonces no incluye medicamentos ni diagnósticos.
  5. Dado que no se permite el registro de pacientes (sección 3.10), cuando la cédula no existe en la EPS simulada, entonces no se envía ningún código, no se crea ninguna cuenta y se muestra el mismo mensaje del criterio 6.
  6. Dado cualquier cédula, exista o no en la EPS simulada, cuando el usuario pide el código, entonces ve exactamente este mensaje: "Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial." Ni la pantalla, ni el bot, ni la respuesta de la API permiten distinguir si la cédula está afiliada (sección 3.2).
  7. Dado un código de un solo uso enviado (de verificación o de revocación), cuando se revisa, entonces tiene 6 dígitos. Confirmado (usuaria, R-10).
- **Estado:** Confirmado (sección 3.2; criterio 7 respuesta de la usuaria)

### HU-003: Recuperarse de un código vencido o con intentos agotados
- **Historia:** Como usuario, quiero opciones claras cuando el código vence o agoto los intentos, para no quedar bloqueado.
- **Fuente:** secciones 3.2 y 3.13 del contexto
- **Criterios de aceptación:**
  1. Dado un código con más de 10 minutos, cuando se ingresa, entonces se rechaza aunque sea correcto.
  2. Dado un código con 3 intentos fallidos, cuando se ingresa otro valor, incluso el correcto, entonces se rechaza.
  3. Dado un código vencido o agotado, cuando el sistema lo informa, entonces ofrece tres caminos: pedir un código nuevo, recibir orientación para actualizar los datos en la EPS o acudir a la atención presencial.
  4. Dado un código enviado, cuando el usuario pide uno nuevo antes de que pasen 2 minutos, entonces se rechaza la solicitud (sección 3.13, punto 5).
  5. Dado una cédula para la que ya se pidieron 5 códigos en la última hora, cuando se pide otro, entonces se rechaza, por cualquier canal (sección 3.13, punto 5).
  6. Dado un código nuevo enviado, cuando se ingresa el código anterior, entonces se rechaza: cada código nuevo anula el anterior (sección 3.13, punto 5).
  7. Dado que el usuario necesita cambiar el celular o el correo, cuando lo pide, entonces el sistema solo lo orienta hacia la EPS y no permite cambiarlos.
- **Estado:** Confirmado

### Vinculación de canales

### HU-004: Vincular el canal y usarlo hasta su vencimiento
- **Historia:** Como usuario, quiero que mi navegador o chat de Telegram quede vinculado al paciente después de verificar la identidad, para no repetir la verificación en cada gestión.
- **Fuente:** sección 3.3 del contexto
- **Criterios de aceptación:**
  1. Dado un código correcto, cuando se verifica la identidad, entonces el navegador o el chat queda vinculado al paciente.
  2. Dado un canal vinculado, cuando el usuario vuelve antes de 3 meses, entonces puede ver la información y hacer gestiones sin pedir otro código.
  3. Dado un canal con vinculación de más de 3 meses, cuando el usuario intenta consultar o gestionar, entonces el canal no muestra información, no permite gestiones y exige un código nuevo. La revocación sigue disponible, con su propia verificación (HU-019, sección 3.2).
  4. Dado un canal con vinculación vencida, cuando se envía una notificación al paciente, entonces ese canal no la recibe y los SMS y correos sí llegan.
  5. Dado un canal vinculado, cuando el usuario desvincula un paciente en cualquier momento, entonces ese canal deja de mostrar su información, de permitir gestiones y de recibir sus notificaciones, y volver a usarlo exige un código nuevo. Confirmado (usuaria, P14).
  6. Dado un canal vinculado a varios pacientes, cuando el usuario desvincula uno, entonces las demás vinculaciones del canal siguen vigentes. Confirmado (propuesta aprobada, ADR 0007).
- **Estado:** Confirmado

### HU-005: Gestionar a varios pacientes desde un mismo canal
- **Historia:** Como cuidador o facilitador comunitario, quiero vincular varios pacientes a mi navegador o chat, para apoyarlos desde un solo lugar.
- **Fuente:** sección 3.3 del contexto
- **Criterios de aceptación:**
  1. Dado un canal vinculado a un paciente, cuando el usuario verifica la identidad de otro paciente, entonces el canal queda vinculado a ambos, sin límite de cantidad.
  2. Dado un canal vinculado a más de un paciente, cuando el usuario inicia una gestión, entonces debe escoger el paciente antes de continuar.
  3. Dado un paciente escogido, cuando el usuario consulta o gestiona, entonces solo ve y modifica la información de ese paciente.
  4. Dado cada vinculación, cuando una vence, entonces solo esa vinculación deja de funcionar; las demás del mismo canal siguen vigentes.
  5. Dado un canal vinculado a varios pacientes, cuando el usuario debe escoger el paciente, entonces cada uno se identifica por su nombre. Confirmado (usuaria, P13).
- **Estado:** Confirmado (criterio 4: propuesta aprobada, ADR 0007)

### Documentos

### HU-006: Autorizar el tratamiento de datos de salud
- **Historia:** Como usuario, quiero autorizar por separado el tratamiento de datos de salud, para decidir de forma explícita sobre la información sensible del paciente.
- **Fuente:** secciones 3.2 y 3.11 del contexto
- **Criterios de aceptación:**
  1. Dado un canal vinculado sin autorización de datos de salud, cuando el usuario intenta cargar un documento, entonces el sistema pide primero la autorización, separada de la aceptación del tratamiento de datos.
  2. Dado que el usuario no da la autorización, cuando intenta cargar un documento, entonces el sistema no recibe ni guarda el archivo.
  3. Dado el texto de la autorización de datos de salud, en la web y en el bot, cuando se muestra, entonces informa que los documentos se procesan con Microsoft Azure en Estados Unidos. Confirmado (usuaria, decisión sobre el ADR 0012).
  4. Dado una autorización de datos de salud, cuando se registra, entonces queda ligada a la versión del texto que se mostró, para saber si el usuario vio el aviso sobre Microsoft Azure. Inferido (por analogía con la versión del aviso de privacidad, sección 3.2).
- **Estado:** Confirmado (criterio 4 Inferido)

### HU-007: Cargar fórmulas e historia clínica
- **Historia:** Como usuario, quiero cargar las fórmulas y la historia clínica en foto o PDF, para que el sistema las prevalide.
- **Fuente:** secciones 3.4, 3.13 y 3.14 del contexto
- **Criterios de aceptación:**
  1. Dado un usuario con autorización de datos de salud, cuando carga un archivo JPG, PNG, HEIC o PDF por la web o por Telegram, entonces el sistema lo recibe y obtiene sus datos con reconocimiento automático de texto (OCR).
  2. Dado un archivo de otro tipo, de más de 10 MB o un PDF de más de 5 páginas, cuando se carga, entonces se rechaza con un mensaje claro que indica los formatos y límites aceptados.
  3. Dado un archivo cuyo contenido real no corresponde a un formato aceptado (por ejemplo, un ejecutable con extensión .jpg), cuando se carga, entonces se rechaza aunque la extensión o el tipo declarado sean válidos.
  4. Dado un archivo válido de hasta 10 MB, cuando se carga en el sitio publicado, entonces se acepta (sección 3.14).
  5. Dado un documento cargado, cuando se guarda, entonces solo es accesible por enlaces temporales y nunca por una dirección pública permanente.
  6. Dado una solicitud, cuando el usuario carga los documentos, entonces carga una sola historia clínica para toda la solicitud y una o varias fórmulas (sección 3.4).
  7. Dado el diagnóstico de cada fórmula, cuando se prevalida, entonces se toma de la EPS simulada y se comprueba que la historia clínica lo contiene; el sistema nunca escoge por su cuenta entre varios diagnósticos de la historia clínica (sección 3.4).
  8. Dado un paciente para el que ya se cargaron 20 archivos en la última hora, cuando se carga otro por cualquier canal, entonces se rechaza con un mensaje claro (sección 3.13, punto 5).
  9. Dado Telegram, cuando el usuario envía un documento como foto normal (no como archivo), entonces el bot la acepta; solo si el OCR no obtiene los datos de esa foto, el bot sugiere enviarla como archivo. Confirmado (usuaria, decisión sobre el ADR 0008, que reemplaza la propuesta de pedir siempre el envío como archivo). La foto fallida cuenta como una carga y el nuevo envío como una recarga de HU-008. Confirmado (propuesta aprobada, ADR 0012: un archivo rechazado cuenta como carga).
  10. Dado que el servicio de OCR no responde, cuando se procesa un documento, entonces esa carga no se descuenta de las 3 de HU-008 y el sistema reintenta. Confirmado (propuesta aprobada, ADR 0012).
- **Estado:** Confirmado

### HU-008: Documento del que no se obtienen datos
- **Historia:** Como usuario, quiero saber cuándo un documento no se pudo leer, para cargarlo de nuevo o buscar otra vía.
- **Fuente:** sección 3.4 del contexto
- **Criterios de aceptación:**
  1. Dado un documento ilegible, incompleto, sin diagnóstico o sin coincidencia con la EPS simulada, cuando se procesa, entonces el sistema pide cargarlo de nuevo e indica el motivo.
  2. Dado una historia clínica que no contiene el diagnóstico que la EPS simulada tiene para una fórmula, cuando se procesa, entonces se pide cargar de nuevo la historia clínica.
  3. Dado un documento, cuando el usuario lo carga, entonces dispone de 3 cargas en total: la inicial y 2 recargas.
  4. Dado que el problema persiste en la tercera carga, cuando se procesa, entonces la fórmula queda no apta, no se ofrece otra carga y se orienta al usuario a la atención presencial.
  5. Dado que la historia clínica falla en la tercera carga por ser ilegible o estar incompleta, cuando se procesa, entonces quedan no aptas todas las fórmulas de la solicitud (sección 3.4).
  6. Dado que la historia clínica se lee pero en la tercera carga sigue sin contener el diagnóstico de una fórmula, cuando se procesa, entonces solo esa fórmula queda no apta y las demás continúan (sección 3.4).
  7. Qué es "coincidencia con la EPS simulada" (sección 3.4). Dado una fórmula, cuando se procesa, entonces coincide si el número de fórmula y la cédula que trae coinciden con los de la EPS simulada. Dado una historia clínica, cuando se procesa, entonces coincide si trae la cédula del paciente y el código CIE-10 del diagnóstico que la EPS simulada tiene para la fórmula; si ese código no aparece en la historia clínica, coincide si trae la descripción de ese diagnóstico, comparada sin tildes ni mayúsculas, aunque la historia clínica traiga otros códigos CIE-10 (lectura (a) del ADR 0012). Si no coincide, aplica la regla de recarga. Confirmado (sección 3.4; usuaria, R-04).
- **Estado:** Confirmado

### Prevalidación

### HU-009: Verificar la afiliación una vez por solicitud
- **Historia:** Como usuario, quiero saber de inmediato si la afiliación del paciente está inactiva, para acudir a la EPS sin perder tiempo.
- **Fuente:** sección 3.4 del contexto
- **Criterios de aceptación:**
  1. Dado una solicitud, cuando empieza la prevalidación, entonces la afiliación se verifica una sola vez para toda la solicitud y antes que cualquier otra regla.
  2. Dado un paciente con afiliación inactiva en la EPS simulada, cuando se prevalida, entonces se detiene toda la solicitud, no se evalúan las demás reglas y se orienta hacia la EPS.
- **Estado:** Confirmado

### HU-010: Verificar vigencia, cobertura PBS y autorización
- **Historia:** Como usuario, quiero saber si cada fórmula está vigente y si sus medicamentos están cubiertos o autorizados, para saber qué puedo reclamar y qué debo gestionar con la EPS.
- **Fuente:** secciones 3.4 y 3.11 del contexto
- **Criterios de aceptación:**
  1. Dado una fórmula, cuando se verifica la vigencia, entonces se usa el dato de vigencia de la EPS simulada y nunca una regla fija de 30 días.
  2. Dado una fórmula no vigente, cuando se prevalida, entonces queda no apta y se indica que requiere una nueva valoración médica.
  3. Dado un medicamento no cubierto por el PBS, cuando está autorizado en la EPS simulada, entonces continúa; cuando no está autorizado, la fórmula queda no apta.
  4. Dado un medicamento al que le falta autorización, cuando se informa, entonces el sistema solo muestra los puntos, enlaces o trámites de autorización configurados para la EPS del paciente; no tramita la autorización ni vigila su estado.
  5. Dado que el usuario obtiene la autorización por su cuenta, cuando quiere continuar, entonces debe volver a consultar; el sistema no le avisa (sección 3.6).
- **Estado:** Confirmado

### HU-011: Clasificar el tratamiento y verificar la habilitación de entrega
- **Historia:** Como usuario con un tratamiento crónico, quiero saber si ya puedo recoger la siguiente dosis, para no desplazarme antes de tiempo.
- **Fuente:** secciones 3.4 y 3.5 del contexto
- **Criterios de aceptación:**
  1. Dado el diagnóstico de la fórmula según la EPS simulada, contenido en la historia clínica, cuando está en el catálogo de diagnósticos crónicos, entonces la fórmula se trata como crónica; cuando no está, se trata como aguda.
  2. Dado una historia clínica con varios diagnósticos, cuando se clasifica cada fórmula, entonces se usa el diagnóstico que la EPS simulada tiene para esa fórmula y no otro de la historia clínica.
  3. Dado una fórmula crónica, cuando la fecha habilitada de entrega es igual o anterior a la fecha de la cita posible (el día calendario siguiente), entonces es apta en esta regla.
  4. Dado una fórmula crónica, cuando la fecha habilitada es posterior a la fecha de la cita posible, entonces queda no apta.
  5. Dado una fórmula aguda, cuando se prevalida, entonces no se evalúa la habilitación de entrega.
- **Estado:** Confirmado

### HU-012: Recibir un resultado preliminar por fórmula, todo o nada
- **Historia:** Como usuario, quiero un resultado claro por cada fórmula, para saber cuáles continúan y cuáles debo gestionar con la EPS.
- **Fuente:** sección 3.4 del contexto
- **Criterios de aceptación:**
  1. Dado una fórmula con varios medicamentos, cuando uno no cumple alguna regla, entonces toda la fórmula queda no apta.
  2. Dado una solicitud con varias fórmulas, cuando unas son aptas y otras no, entonces las aptas continúan a disponibilidad y para las no aptas se indica que se gestionen con la EPS.
  3. Dado cualquier resultado, cuando se muestra, entonces se presenta como preliminar con el aviso de que la validación oficial ocurre en el punto.
  4. Dado cualquier resultado, cuando se muestra, entonces el orden de evaluación es afiliación, vigencia, cobertura PBS, autorización y habilitación de entrega (esta última solo en crónicas).
- **Estado:** Confirmado

### Reserva y agenda

### HU-013: Escoger una ventana según el tipo de tratamiento
- **Historia:** Como usuario, quiero ver las ventanas disponibles en los puntos que tienen mis medicamentos, para escoger cuándo recogerlos.
- **Fuente:** sección 3.5 del contexto
- **Criterios de aceptación:**
  1. Dado fórmulas aptas, cuando se consulta la disponibilidad, entonces solo se ofrecen puntos con existencias del inventario simulado y ventanas de 1 hora con cupo.
  2. Dado una cita solo con medicamentos agudos, cuando se ofrecen ventanas, entonces se muestran las del mismo día que inicien al menos una hora después del momento de agendar y las del día siguiente, y ninguna otra.
  3. Dado una cita con algún medicamento crónico, cuando se ofrecen ventanas, entonces solo se muestran las del día calendario siguiente.
  4. Dado medicamentos disponibles en puntos distintos, cuando se agenda, entonces se agenda una cita por punto.
  5. Dado los horarios, cuando se calculan las ventanas, entonces se usa la zona horaria America/Bogota.
  6. Dado un medicamento con existencias en varios puntos, cuando se agenda, entonces el usuario escoge el punto entre los que tienen existencias y cupo. Confirmado (usuaria, P4).
  7. Dado que el usuario está escogiendo punto y ventana, cuando aún no confirma, entonces no se aparta cupo ni existencias: otra persona puede tomarlos y la confirmación se resuelve según HU-014. Confirmado (usuaria, P6).
- **Estado:** Confirmado

### HU-014: Confirmar las citas sin sobre-reservas
- **Historia:** Como usuario, quiero que mi cita exista solo si mis medicamentos y mi cupo quedaron reservados, para no desplazarme en vano.
- **Fuente:** sección 3.5 del contexto
- **Criterios de aceptación:**
  1. Dado una confirmación, cuando se completa, entonces existen las reservas de existencias y de cupo de cada cita y ninguna cita queda sin medicamentos reservados.
  2. Dado una fórmula con citas en varios puntos, cuando alguna no se puede reservar, entonces no se reserva ninguna de las citas de esa fórmula.
  3. Dado dos usuarios que confirman al mismo tiempo el último cupo o las últimas existencias, cuando ambas confirmaciones llegan, entonces solo una gana y a la otra se le informa y se le muestran las opciones actualizadas.
  4. Dado cualquier ventana, cuando termina un día de pruebas, entonces ninguna ventana tiene más citas que su capacidad y ningún medicamento tiene más unidades reservadas que existencias.
  5. Dado una solicitud con varias fórmulas aptas, cuando el usuario confirma, entonces confirma cada fórmula por separado y el fallo de una no deshace la confirmación de otra. Confirmado (usuaria, P5).
  6. Dado una fórmula que va a un punto donde la solicitud ya tiene una cita confirmada que cumple las reglas de la fórmula, cuando se confirma, entonces se agrega a esa cita, con la misma ventana y el mismo código de entrega, sin ocupar otro cupo; solo reserva sus medicamentos (sección 3.5).
  7. Dado que esa cita no cumple las reglas de la nueva fórmula (por ejemplo, la nueva es crónica y la cita es del mismo día, o es aguda y la ventana inicia en menos de una hora desde el momento de agendar), cuando se agenda, entonces se crea otra cita en ese punto, con su propio código de entrega y su propio cupo, en una ventana permitida para la fórmula (sección 3.5).
- **Estado:** Confirmado

### HU-015: Saber qué hacer cuando no hay disponibilidad
- **Historia:** Como usuario, quiero saber cuándo volver a intentarlo si no hay existencias o cupos, para no insistir sin sentido.
- **Fuente:** secciones 3.5 y 3.11 del contexto
- **Criterios de aceptación:**
  1. Dado un medicamento sin existencias en ningún punto, o sin ventanas con cupo en los días permitidos, cuando se consulta la disponibilidad, entonces no se crea un pendiente y se informa que debe esperar 48 horas para volver a validar.
  2. Dado ese caso, cuando pasan 48 horas, entonces el sistema envía un único recordatorio de esa espera por los medios del paciente (criterio 12).
  3. Dado el mensaje y el recordatorio, cuando se leen, entonces presentan las 48 horas como un plazo propio del producto y no como cumplimiento de una norma.
  4. Dado ese caso, cuando el inventario cambia, entonces el sistema no avisa; no vigila el inventario.
  5. Dado ese caso, cuando aún no han pasado 48 horas, entonces no se ofrece volver a validar (sección 3.5: "debe esperar 48 horas para volver a validar").
  6. Dado ese caso, cuando pasan las 48 horas, entonces el usuario vuelve a validar en la misma solicitud, por web o Telegram, sin cargar de nuevo los documentos (sección 3.5; usuaria, R-05). Volver a validar repite las reglas de la prevalidación con los datos ya obtenidos de los documentos y los datos actuales de la EPS simulada, sin volver a leer los documentos ni consumir cargas, y luego consulta otra vez la disponibilidad. Confirmado (propuesta aprobada, ADR 0011).
  7. Dado el recordatorio de las 48 horas, cuando se envía, entonces nunca sale antes de cumplirse las 48 horas y sale como máximo 1 hora después; si la marca de las 48 horas cae entre las 21:00 (incluida) y las 7:00 (excluida), sale a las 7:00 siguientes y la hora de tolerancia se cuenta desde las 7:00. Si una ejecución retrasada llega a caer entre las 21:00 y las 7:00, se pasa a las 7:00. Confirmado (sección 3.5; propuestas aprobadas, ADR 0011). Cierra P41.
  8. Dado ese caso, cuando el usuario no vuelve a validar ni confirma una cita en las 24 horas siguientes al envío del recordatorio de la espera de esa fórmula, entonces la fórmula se cancela (HU-038). Confirmado (sección 3.5).
  9. Dado que la fórmula se cerró o la solicitud se canceló antes de cumplirse las 48 horas, cuando llega la hora del recordatorio, entonces no se envía. Confirmado (propuesta aprobada, ADR 0011: el despachador comprueba el estado actual y una solicitud cancelada cancela sus tareas pendientes). Del mismo modo, si el usuario vuelve a validar la fórmula (posible desde que se cumplen las 48 horas) antes de que salga el recordatorio de la espera vigente, ese recordatorio no se envía, porque el usuario ya retomó la espera; si al volver a validar tampoco hay disponibilidad, rige solo el recordatorio de la espera nueva. Inferido (consecuencia de la propuesta aprobada en el ADR 0011, decisión 9: volver a validar se habilita a las 48 horas del inicio de la espera, aunque el recordatorio salga más tarde; requiere confirmación de la usuaria).
  10. Dado que, al volver a validar, otra vez no hay existencias ni cupo, cuando se informa, entonces empieza una espera nueva con las mismas reglas de los criterios 1 a 9 y 11: se informa otra vez la espera de 48 horas, volver a validar se ofrece de nuevo al cumplirse esas 48 horas, la espera nueva tiene su propio recordatorio a las 48 horas y la fórmula se cancela si no se agenda en las 24 horas siguientes al envío de ese recordatorio. Pasa igual cada vez que, al volver a validar, no hay disponibilidad. Confirmado (sección 3.5; usuaria, P43).
  11. Dado que el recordatorio de las 48 horas sale más de 1 hora tarde por una falla, cuando el sistema lo detecta, entonces lo envía igual y queda registrado como incumplimiento, sin cédulas, diagnósticos ni medicamentos. Confirmado (usuaria, decisión 1 del 2026-11-01).
  12. Dado varias fórmulas de una solicitud que quedan sin disponibilidad en una misma validación, cuando empieza su espera, entonces comparten un solo recordatorio de 48 horas y un solo plazo de cancelación, contados desde esa validación: no hay un recordatorio por fórmula. Si otras fórmulas de la misma solicitud empiezan a esperar en otra validación, esa espera tiene su propio recordatorio y su propio plazo, y el plazo de cada fórmula se cuenta solo desde el recordatorio de su espera. Mientras su espera no se cumple, una fórmula no puede empezar otra (criterio 5). Confirmado (sección 3.5; usuaria, P43). Reemplaza la regla de un único recordatorio por solicitud (R-18). Que "una misma validación" sea una misma consulta de disponibilidad, sea la que sigue a la prevalidación o la de volver a validar: Inferido (lectura directa de la sección 3.5; no bloquea). Que volver a validar se habilite a las 48 horas del aviso de la espera, aunque el recordatorio salga más tarde por la franja nocturna: Confirmado (propuesta aprobada, ADR 0011).
- **Estado:** Confirmado (criterio 12: qué cuenta como "una misma validación", Inferido)

### HU-016: Consultar las citas y el código de entrega
- **Historia:** Como usuario, quiero consultar mis citas y su código de entrega cuando lo necesite, para no tener que guardarlo al agendar.
- **Fuente:** secciones 3.1 y 3.5 del contexto
- **Criterios de aceptación:**
  1. Dado una cita confirmada, cuando el usuario la consulta por web o Telegram con una vinculación vigente, entonces ve el punto, la ventana y el código de entrega en QR y numérico.
  2. Dado cada cita, cuando se genera, entonces tiene un código de entrega propio y de un solo uso.
  3. Dado un canal sin vinculación vigente, cuando se pide el código, entonces no se muestra.
  4. Dado el código de entrega numérico, cuando se muestra, entonces tiene 8 dígitos. Confirmado (usuaria, R-10).
- **Estado:** Confirmado

### HU-017: Cancelar una cita
- **Historia:** Como usuario, quiero cancelar una cita en cualquier momento, para liberar el cupo si no puedo ir.
- **Fuente:** sección 3.5 del contexto
- **Criterios de aceptación:**
  1. Dado una cita activa, cuando el usuario la cancela, entonces se liberan sus existencias y su cupo y el código de entrega deja de ser válido.
  2. Dado una cita cancelada, cuando el usuario quiere otra, entonces debe iniciar una nueva solicitud; no existe reprogramación.
  3. Dado una fórmula de la que el paciente ya recibió una parte, cuando cancela la cita del resto, entonces lo no recogido se pierde y la fórmula se cierra.
  4. Dado una fórmula de la que no recibió nada, cuando cancela, entonces todo se libera.
- **Estado:** Confirmado

### HU-018: Liberar la reserva al terminar la ventana
- **Historia:** Como paciente que busca cita, quiero que las reservas no usadas se liberen al terminar su ventana, para que los medicamentos queden disponibles para otros.
- **Fuente:** sección 3.5 del contexto
- **Criterios de aceptación:**
  1. Dado una cita no atendida, cuando termina su ventana, entonces la reserva expira y el código de entrega deja de ser válido.
  2. Dado que el paciente ya recibió parte de la fórmula y no llega a recoger el resto, cuando expira la reserva, entonces lo no recogido se pierde y la fórmula se cierra; si no recibió nada, todo se libera.
- **Estado:** Confirmado

### HU-019: Revocar el consentimiento y eliminar los datos
- **Historia:** Como titular (o quien actúa con su autorización), quiero revocar el consentimiento y pedir que se eliminen los datos del paciente, para ejercer los derechos sobre la información.
- **Fuente:** secciones 3.2, 3.3, 3.11 y 3.13 del contexto
- **Criterios de aceptación:**
  1. Dado la pantalla de inicio de la web o del bot, con canal vinculado, sin canal vinculado o con la vinculación vencida, cuando el usuario escoge "Revocar mi autorización" e ingresa la cédula, entonces el sistema envía un código nuevo al celular y, si existe, al correo registrados en la EPS simulada, y la revocación solo procede si ese código se ingresa correctamente; una vinculación vigente no basta (sección 3.2).
  2. Dado que el sistema no distingue al titular de un tercero, cuando cualquier persona supera esa verificación, entonces puede revocar, sea cual sea lo que declare en el criterio 16 (secciones 3.2 y 3.3).
  3. Dado una revocación, cuando se completa, entonces se eliminan de inmediato los documentos cargados, los datos del OCR, los resultados de prevalidación, las solicitudes, las citas, las vinculaciones de chats y navegadores y los recordatorios programados del paciente.
  4. Dado un paciente con citas activas, cuando revoca, entonces las citas se cancelan, sus códigos dejan de ser válidos y el cupo y los medicamentos quedan disponibles para otras personas.
  5. Dado una revocación, cuando se revisa la base de datos, entonces se conserva la prueba del consentimiento y de su revocación (fecha, canal, si fue el titular o un tercero y versión del aviso), ligada a una huella cifrada de la cédula y no a la cédula. En la prueba de la revocación, "titular o tercero" es lo que declaró quien revocó (criterio 16), no lo que se declaró al aceptar. Confirmado (usuaria, R-01). La huella cifrada es una huella con clave secreta (HMAC) de la cédula. Confirmado (usuaria, R-24).
  6. Dado las citas canceladas o entregadas del paciente, cuando se revisa la base de datos después de revocar, entonces de cada una queda solo el punto, la ventana, la fecha y el motivo, sin datos del paciente.
  7. Dado una revocación, cuando se completa, entonces se envía una confirmación por SMS al celular registrado y por correo si existe, que indica cuántas citas activas se cancelaron, sin medicamentos, diagnósticos ni puntos (por ejemplo: "Revocaste tu autorización. Eliminamos tus datos y cancelamos tus 2 citas activas.") (sección 3.2).
  8. Dado una revocación, cuando se completa, entonces los datos de la EPS simulada no se modifican.
  9. Dado un canal que estaba vinculado al paciente, cuando se intenta consultar o recibir avisos después de revocar, entonces no muestra información ni recibe notificaciones; los recordatorios programados no se envían.
  10. Dado un paciente con citas activas, cuando revoca, entonces no se envía una notificación de cancelación por cada cita: la confirmación del criterio 7 es el único aviso (sección 3.2).
  11. Dado el código de revocación, cuando se pide y se usa, entonces sigue las mismas reglas del código de verificación: dura 10 minutos, admite 3 intentos, se puede pedir uno nuevo cada 2 minutos, máximo 5 por cédula por hora (contando también los pedidos para verificar la identidad), y cada código nuevo anula el anterior (secciones 3.2 y 3.13, punto 5). Confirmado: la revocación verifica la identidad, y la identidad se verifica con la cédula y ese código, sin distinción en el contexto.
  12. Dado que el usuario escoge "Revocar mi autorización", cuando se le pide la cédula, entonces no se le pide aceptar el aviso de privacidad y se le informa que la cédula se usa solo para verificar la identidad y atender la solicitud (sección 3.2).
  13. Dado que el usuario pide el código de revocación con cualquier cédula, cuando el sistema responde, entonces muestra el mismo mensaje de HU-002 (criterio 6), exista o no la cédula en la EPS simulada (sección 3.2).
  14. Dado una revocación completada desde un canal sin vinculación o con la vinculación vencida, cuando termina, entonces ese canal no queda vinculado a ningún paciente: la revocación no crea ninguna vinculación (sección 3.2).
  15. Dado una revocación, cuando se registra, entonces es la única excepción a "si la persona no acepta, no se registra nada": se guarda la prueba de la revocación del criterio 5 aunque no se haya aceptado el aviso en ese momento (sección 3.2).
  16. Dado el flujo de revocación en la web o en el bot, cuando el usuario revoca, entonces el sistema le pide escoger entre "Soy el titular" y "Actúo con su autorización"; sin esa declaración la revocación no se completa, y lo declarado queda en la prueba de la revocación (criterio 5). Esta declaración no es una aceptación del aviso de privacidad (criterio 12). Confirmado (sección 3.2; usuaria, R-01). En qué paso del flujo se pide (antes o después de la cédula y del código) lo define el diseño: Inferido que no cambia ninguna regla.
- **Estado:** Confirmado (sección 3.2; criterio 16 respuesta de la usuaria)

### Notificaciones

### HU-020: Recibir notificaciones por todos los medios sin datos sensibles
- **Historia:** Como usuario, quiero recibir cada aviso por todos los medios del paciente, para enterarme aunque no revise uno de ellos.
- **Fuente:** secciones 3.1, 3.3 y 3.6 del contexto
- **Criterios de aceptación:**
  1. Dado una notificación, cuando se envía, entonces llega como notificación web a cada navegador con vinculación vigente, por Telegram a cada chat con vinculación vigente, por SMS al celular registrado y por correo si existe.
  2. Dado cualquier notificación por cualquier medio, cuando se revisa su contenido, entonces no incluye nombres de medicamentos ni diagnósticos.
  3. Dado un enlace directo al bot de Telegram, cuando se revisa, entonces no lleva cédula, diagnósticos, medicamentos ni otros datos sensibles.
  4. Dado la llegada de un medicamento o la aprobación de una autorización en la EPS, cuando ocurre, entonces el sistema no avisa.
  5. Dado la confirmación de una cita, su cancelación (por el usuario o por la reverificación), su expiración al terminar la ventana o la pérdida de lo no recogido de una fórmula, cuando ocurre, entonces se notifica por los medios del paciente, sin medicamentos ni diagnósticos. Confirmado (usuaria, P12). Excepción: las citas canceladas por una revocación no se notifican una a una; las informa la confirmación de la revocación (HU-019, criterio 10; sección 3.2).
  6. Dado un iPhone, cuando el navegador no permite notificaciones web, entonces el sistema no las garantiza ni pide añadir la web a la pantalla de inicio (eso rozaría la aplicación instalable, fuera de alcance en la sección 3.10); los demás medios siguen llegando. Confirmado (usuaria, R-23).
  7. Dado cualquier SMS (código, notificación, recordatorio o confirmación de revocación), cuando se envía, entonces empieza por "Pharma Express:", no lleva tildes y no pasa de 160 caracteres (RNF-034). Confirmado (usuaria).
- **Estado:** Confirmado

### HU-021: Recibir el recordatorio del día anterior
- **Historia:** Como usuario, quiero un recordatorio la noche anterior a la cita, para planear el desplazamiento.
- **Fuente:** sección 3.6 del contexto
- **Criterios de aceptación:**
  1. Dado una cita agendada antes de las 19:00 del día anterior a la cita, cuando llega ese día anterior, entonces se envía un recordatorio entre las 19:00 y las 21:00.
  2. Dado una cita agendada después de las 19:00 del día anterior, cuando llega la noche, entonces no se envía este recordatorio; la confirmación cumple esa función.
  3. Dado una cita del mismo día, cuando se agenda, entonces no se envía este recordatorio.
  4. Dado el recordatorio, cuando se lee, entonces solo informa y ofrece cancelar; no pide confirmación.
  5. Dado un recordatorio por cualquier medio, cuando el usuario quiere cancelar, entonces la cancelación se hace dentro del flujo autenticado de la web o del bot, con una vinculación vigente; el mensaje no lleva enlaces con datos sensibles. Confirmado (usuaria, P11).
- **Estado:** Confirmado

### HU-022: Recibir el recordatorio dos horas antes, con reverificación
- **Historia:** Como usuario, quiero un recordatorio dos horas antes de la cita y saber si algo cambió, para no ir en vano.
- **Fuente:** sección 3.6 del contexto
- **Criterios de aceptación:**
  1. Dado una cita agendada con 2 horas o más de anticipación, incluidas las del mismo día, cuando faltan dos horas para su inicio, entonces se envía un recordatorio que solo informa y ofrece cancelar.
  2. Dado ese recordatorio, cuando se envía, entonces sale como máximo 10 minutos después de la hora programada (dos horas antes del inicio de la ventana).
  3. Dado una cita agendada con menos de 2 horas de anticipación, cuando se acerca su inicio, entonces no se envía este recordatorio y tampoco se reverifica.
  4. Dado el envío del recordatorio, cuando se envía, entonces el sistema vuelve a verificar afiliación, vigencia y autorizaciones en la EPS simulada.
  5. Dado que cambió la vigencia o una autorización de una fórmula, cuando se reverifica, entonces esa fórmula queda no apta, se liberan sus medicamentos en todos los puntos y se registra qué dato cambió y cuándo.
  6. Dado una cita que queda sin medicamentos por la reverificación, cuando se aplica el cambio, entonces se cancela y libera su cupo.
  7. Dado una cita que conserva medicamentos de otras fórmulas aptas, cuando se aplica el cambio, entonces se mantiene con la misma ventana y el mismo código de entrega, sin los medicamentos de la fórmula que cambió. Confirma P10.
  8. Dado que lo que cambió es la afiliación, cuando se reverifica, entonces quedan no aptas todas las fórmulas de la solicitud y se aplican los criterios 5 y 6.
  9. Dado cualquier cambio detectado, cuando se notifica, entonces el mensaje indica el motivo, si la cita se mantiene y el siguiente paso, sin nombrar medicamentos ni diagnósticos; el detalle se consulta en la web o en Telegram.
  10. Dado un recordatorio por cualquier medio, cuando el usuario quiere cancelar, entonces lo hace dentro del flujo autenticado de la web o del bot (P11).
  11. Dado que el recordatorio no salió dentro de los 10 minutos siguientes a la hora programada, cuando la cita aún no ha empezado, entonces se envía y se reverifica igual; cuando la cita ya empezó, se omite. En ambos casos queda registrado como incumplimiento del plazo de 10 minutos, sin cédulas, diagnósticos ni medicamentos. Confirmado (sección 3.6; usuaria, R-02). Al omitirlo tampoco se reverifica, porque la reverificación ocurre al enviar el recordatorio. Confirmado (propuesta aprobada, ADR 0011).
- **Estado:** Confirmado

### HU-023: Recibir el aviso de nueva prevalidación para crónicos
- **Historia:** Como usuario con un tratamiento crónico, quiero un aviso antes de la siguiente fecha habilitada, para iniciar a tiempo una nueva prevalidación.
- **Fuente:** sección 3.6 del contexto
- **Criterios de aceptación:**
  1. Dado una fórmula crónica entregada, cuando faltan 2 días para la siguiente fecha habilitada de entrega, entonces se envía un aviso por los medios del paciente para que inicie una nueva prevalidación.
  2. Dado ese aviso, cuando se envía, entonces no crea ninguna cita; no existe cita de continuidad.
  3. Dado una fórmula crónica cerrada con algún medicamento no entregado (entrega parcial), cuando faltan 2 días para la siguiente fecha habilitada, entonces también se envía el aviso. Confirmado (usuaria, P22).
  4. Dado el aviso, cuando se envía, entonces sale en el despacho diario de las 19:00 (hora de Bogotá) del día que está 2 días antes de la siguiente fecha habilitada. Confirmado (usuaria, R-02).
- **Estado:** Confirmado

### Panel del dispensador

### HU-024: Iniciar sesión en el panel del dispensador
- **Historia:** Como dispensador, quiero entrar a mi panel con mi usuario, para atender las citas de mi punto.
- **Fuente:** secciones 3.7 y 3.13 del contexto
- **Criterios de aceptación:**
  1. Dado credenciales válidas de rol dispensador de una cuenta activa, cuando inicia sesión, entonces entra a su panel, separado de la experiencia del paciente y del panel de administración.
  2. Dado una petición sin sesión a la API del panel, cuando llega, entonces se rechaza.
  3. Dado una sesión de otro rol (administrador) o de un paciente, cuando pide datos del panel del dispensador, entonces se rechaza.
  4. Dado un dispensador, cuando intenta operar una cita de otro punto, entonces se rechaza.
  5. Dado 5 contraseñas erradas para una cuenta, cuando se intenta de nuevo, entonces la cuenta queda bloqueada 15 minutos, incluso con la contraseña correcta; pasados los 15 minutos puede iniciar sesión.
  6. Dado una sesión abierta, cuando pasan 30 minutos sin actividad, entonces se cierra y la API rechaza sus peticiones.
  7. Dado una sesión con actividad continua, cuando cumple 12 horas, entonces se cierra.
- **Estado:** Confirmado

### HU-025: Validar el código de entrega
- **Historia:** Como dispensador, quiero validar el código de entrega del paciente, para confirmar que su cita es de mi punto y de esta ventana.
- **Fuente:** secciones 3.5 y 3.7 del contexto
- **Criterios de aceptación:**
  1. Dado un código de una cita de su punto, cuando lo valida dentro de la ventana, entonces se acepta y se registra ese momento como la hora de llegada del paciente.
  2. Dado un código de otro punto, cuando lo valida, entonces se rechaza.
  3. Dado un código fuera de su ventana (antes de que inicie o después de que termine), cuando lo valida, entonces se rechaza.
  4. Dado un código ya usado o de una cita cancelada, cuando lo valida, entonces se rechaza.
  5. Dado el código, cuando se ingresa, entonces se acepta tanto la lectura del QR como el código numérico: el panel lee el QR con la cámara del navegador y ofrece un campo para el código numérico, que también sirve con un lector físico USB que escribe el código en ese campo. Confirmado (usuaria, R-10).
- **Estado:** Confirmado

### HU-026: Registrar la validación oficial y cerrar cada medicamento
- **Historia:** Como dispensador, quiero ver la prevalidación, registrar la validación oficial y cerrar cada medicamento, para dejar constancia de la entrega.
- **Fuente:** secciones 3.5 y 3.7 del contexto
- **Criterios de aceptación:**
  1. Dado un código validado, cuando abre la cita, entonces ve el resultado de la prevalidación de cada fórmula.
  2. Dado la cita, cuando registra la validación oficial, entonces queda guardada.
  3. Dado cada medicamento, cuando lo cierra, entonces lo marca como entregado o no entregado; si es no entregado, debe escoger un motivo: afiliación inactiva; fórmula vencida o inválida; autorización no vigente; medicamento no cubierto; datos del paciente no coinciden; sin existencias pese a reserva; u otro, con descripción obligatoria.
  4. Dado una fórmula con algún medicamento no entregado, cuando se cierra, entonces la fórmula se cierra y el sistema no crea pendientes ni gestiona entregas parciales.
- **Estado:** Confirmado (criterio 3: que la descripción sea obligatoria en "otro" es Inferido de "otro, con descripción")

### Panel de administración

### HU-027: Iniciar sesión en el panel de administración
- **Historia:** Como administrador, quiero entrar a mi panel con mi usuario, para configurar el sistema.
- **Fuente:** secciones 3.12 y 3.13 del contexto
- **Criterios de aceptación:**
  1. Dado credenciales válidas de rol administrador, cuando inicia sesión, entonces entra a su panel, separado del panel del dispensador y de la experiencia del paciente.
  2. Dado una petición sin sesión a la API del panel, cuando llega, entonces se rechaza.
  3. Dado una sesión de dispensador o de un paciente, cuando pide datos o acciones del panel de administración, entonces se rechaza.
  4. Dado 5 contraseñas erradas, cuando se intenta de nuevo, entonces la cuenta queda bloqueada 15 minutos.
  5. Dado una sesión abierta, cuando pasan 15 minutos sin actividad, entonces se cierra; y en ningún caso dura más de 12 horas.
- **Estado:** Confirmado

### HU-028: Configurar puntos de dispensación y horarios
- **Historia:** Como administrador, quiero crear puntos con nombre ficticio y horario y cambiar su nombre y su horario, para definir dónde se atiende.
- **Fuente:** secciones 3.8 y 3.12 del contexto
- **Criterios de aceptación:**
  1. Dado el panel, cuando crea o edita un punto con nombre y horario, entonces el cambio se guarda y se refleja en la disponibilidad que ve el paciente.
  2. Dado un punto con citas activas, cuando el administrador intenta un cambio de horario que deja por fuera ventanas con citas activas, entonces el panel no lo permite, muestra qué ventanas tienen citas activas y ninguna cita se cancela (sección 3.12). La misma regla aplica a la petición directa a la API.
  3. Dado cualquier punto, cuando el administrador amplía su horario, entonces se permite siempre (sección 3.12).
  4. Dado un punto con alguna cita activa, cuando el administrador recorta horas que no tienen citas activas, entonces se permite siempre y las citas activas no cambian (sección 3.12, P35).
  5. Dado un punto, cuando el administrador lo edita, entonces solo puede cambiar el nombre y el horario: no existe opción para desactivar ni borrar un punto, y una petición directa a la API para hacerlo se rechaza sin cambios. Confirmado (usuaria, R-09). Que la creación de puntos se mantenga: Inferido (la sección 3.12 dice "configura puntos de dispensación" y la respuesta a R-09 solo habla de editar); ver P44.
- **Estado:** Confirmado (criterio 5 en parte Inferido)

### HU-029: Configurar ventanas y capacidad
- **Historia:** Como administrador, quiero configurar las ventanas de cada punto y su capacidad, para controlar cuántas citas se atienden.
- **Fuente:** secciones 3.5, 3.8 y 3.12 del contexto
- **Criterios de aceptación:**
  1. Dado un punto, cuando configura ventanas de 1 hora y su capacidad, entonces se reflejan en las ventanas ofrecidas al paciente.
  2. Dado una ventana sin cupo, cuando el paciente busca citas, entonces no se ofrece.
  3. Dado una ventana, cuando se configura su capacidad, entonces se mide en número de citas. Confirmado (usuaria, P7).
  4. Dado una ventana, cuando el administrador la consulta en el panel, entonces ve cuántas citas tiene reservadas.
  5. Dado una ventana con citas reservadas, cuando el administrador intenta fijar una capacidad menor que esas citas, entonces el panel no lo permite, informa el mínimo posible y no cancela ninguna cita.
  6. Dado una ventana con citas activas, cuando el administrador intenta quitarla, entonces el panel no lo permite, la señala como ventana con citas activas y ninguna cita se cancela; la misma regla aplica a la petición directa a la API (sección 3.12).
  7. Dado cualquier punto, cuando el administrador agrega ventanas, entonces se permite siempre (sección 3.12).
  8. Qué citas cuentan como reservadas o activas: las confirmadas que no se han cancelado, no han expirado y no se han atendido. Confirmado (propuesta aprobada, ADR 0005).
- **Estado:** Confirmado

### HU-030: Configurar el inventario simulado por punto
- **Historia:** Como administrador, quiero ajustar las existencias por medicamento y por punto, para simular la disponibilidad.
- **Fuente:** secciones 3.8 y 3.12 del contexto
- **Criterios de aceptación:**
  1. Dado un punto, cuando cambia las existencias de un medicamento, entonces la disponibilidad que ve el paciente refleja el cambio.
  2. Dado un medicamento en un punto, cuando el administrador lo consulta en el panel, entonces ve cuántas unidades están reservadas.
  3. Dado un medicamento con unidades reservadas, cuando el administrador intenta fijar existencias menores que lo reservado, entonces el panel no lo permite, informa el mínimo posible y no cancela ninguna cita.
  4. Qué unidades cuentan como reservadas: las de citas confirmadas que no se han cancelado, no han expirado y no se han entregado. Confirmado (propuesta aprobada, ADR 0005).
- **Estado:** Confirmado

### HU-031: Configurar el catálogo de diagnósticos crónicos
- **Historia:** Como administrador, quiero mantener el catálogo de diagnósticos crónicos, para que la clasificación de tratamientos sea correcta.
- **Fuente:** secciones 3.4, 3.8 y 3.12 del contexto
- **Criterios de aceptación:**
  1. Dado el catálogo, cuando agrega un diagnóstico, entonces las nuevas prevalidaciones con ese diagnóstico se tratan como crónicas.
  2. Dado el catálogo, cuando quita un diagnóstico, entonces las nuevas prevalidaciones con ese diagnóstico se tratan como agudas.
- **Estado:** Confirmado

### HU-032: Configurar los trámites de autorización de cada EPS
- **Historia:** Como administrador, quiero configurar los puntos, enlaces y trámites de autorización de cada EPS, para orientar al paciente cuando falta una autorización.
- **Fuente:** secciones 3.4, 3.8 y 3.12 del contexto
- **Criterios de aceptación:**
  1. Dado una EPS (Salud Total o Sanitas), cuando edita sus puntos, enlaces o trámites, entonces el paciente de esa EPS al que le falta una autorización ve la información actualizada, y no la de la otra EPS.
- **Estado:** Confirmado

### HU-033: Gestionar las cuentas de los dispensadores
- **Historia:** Como administrador, quiero crear cuentas de dispensadores, asignarles un punto, cambiarlo y desactivarlas o reactivarlas, para controlar quién atiende en cada punto.
- **Fuente:** sección 3.12 del contexto
- **Criterios de aceptación:**
  1. Dado el panel de administración, cuando el administrador crea una cuenta de dispensador con su correo y le asigna un punto, entonces el dispensador recibe en ese correo un enlace de un solo uso para definir su contraseña, y el administrador nunca ve ni define esa contraseña.
  2. Dado el enlace, cuando el dispensador lo usa dentro de las 48 horas, entonces define su contraseña, que cumple la política de RNF-035 (mínimo 15 caracteres, sin reglas de composición, sin contraseñas filtradas o comunes), puede iniciar sesión y solo opera las citas de su punto.
  3. Dado un enlace ya usado o con más de 48 horas, cuando se abre, entonces se rechaza y no permite definir la contraseña.
  4. Dado una cuenta, cuando el administrador cambia el punto asignado, entonces desde ese momento el dispensador solo opera las citas del nuevo punto.
  5. Dado una cuenta activa, cuando el administrador la desactiva, entonces ya no puede iniciar sesión y la API rechaza las peticiones de sus sesiones abiertas.
  6. Dado una cuenta desactivada, cuando el administrador la reactiva, entonces el dispensador puede volver a iniciar sesión.
  7. Dado el panel, cuando el administrador gestiona cuentas, entonces no existe opción para borrar una cuenta.
  8. Dado una sesión de dispensador o un canal de paciente, cuando intenta crear, reasignar, desactivar o reactivar cuentas, entonces se rechaza.
  9. Dado cualquiera de estas acciones, cuando se completa, entonces queda en el registro de auditoría (HU-034).
  10. Dado una cuenta de dispensador sin contraseña definida, con su enlace vencido sin usarse o todavía vigente, cuando el administrador envía uno nuevo, entonces el dispensador lo recibe por correo con las mismas reglas (un solo uso, 48 horas) y el enlace anterior queda anulado. La sección 3.12 prevé el reenvío al vencer; la usuaria aprobó permitirlo también antes de vencer. Confirmado (usuaria, P38; propuesta del ADR 0019 aprobada).
  11. Dado una cuenta que ya definió su contraseña, cuando el administrador intenta enviar un enlace de definición, entonces no se ofrece y la petición directa a la API se rechaza. Confirmado (usuaria, P38: "mientras la cuenta no tenga contraseña definida", ADR 0019).
- **Estado:** Confirmado. El rechazo de las sesiones abiertas al desactivar (criterio 5) y que la reactivación conserve la contraseña anterior (criterio 6) son propuestas aprobadas del ADR 0014.

### HU-034: Registrar en auditoría las acciones de los paneles
- **Historia:** Como responsable del proyecto, quiero que las acciones de administradores y dispensadores queden registradas, para saber quién hizo qué y cuándo.
- **Fuente:** sección 3.13 del contexto
- **Criterios de aceptación:**
  1. Dado una acción de un dispensador o un administrador, cuando se completa, entonces queda en el registro de auditoría con quién, qué y cuándo.
  2. Dado el registro de auditoría, cuando se revisa, entonces no contiene cédulas, diagnósticos ni nombres de medicamentos.
  3. Dado el panel de administración, cuando el administrador abre la pantalla de auditoría, entonces consulta las acciones registradas con quién, qué y cuándo. Confirmado (usuaria, P18).
  4. Dado una sesión de dispensador o un canal de paciente, cuando pide la auditoría, entonces se rechaza. Confirmado (sección 3.13, mínimo privilegio; propuesta aprobada, ADR 0016).
- **Estado:** Confirmado

### Solicitudes

### HU-035: Tener como máximo 2 solicitudes abiertas
- **Historia:** Como usuario, quiero saber cuántas solicitudes puedo tener abiertas para el paciente, para no iniciar una que el sistema no aceptará.
- **Fuente:** sección 3.5 del contexto
- **Criterios de aceptación:**
  1. Dado un paciente con menos de 2 solicitudes abiertas, cuando el usuario inicia una nueva, entonces se permite.
  2. Dado un paciente con 2 solicitudes abiertas, cuando el usuario intenta iniciar otra por web o Telegram, entonces se rechaza con un mensaje que explica el límite.
  3. Dado una solicitud, cuando alguna de sus fórmulas sigue en carga, prevalidación, agenda o con cita activa, entonces cuenta como abierta.
  4. Dado una solicitud en la que cada fórmula quedó entregada, no apta, cancelada o perdida, cuando el usuario inicia una nueva, entonces esa solicitud ya no cuenta como abierta.
  5. El límite es por paciente, no por canal: aplica igual aunque el paciente esté vinculado a varios navegadores y chats. Inferido.
  6. Dado una solicitud que el usuario canceló (HU-037) o cuyas fórmulas se cancelaron por inactividad (HU-038), cuando el usuario inicia una nueva, entonces esa solicitud ya no cuenta como abierta: esas fórmulas quedan "canceladas", uno de los estados de cierre de la sección 3.5. Confirmado (sección 3.5; propuesta aprobada, ADR 0011).
- **Estado:** Confirmado (criterio 5 Inferido)

### Recuperación de contraseña del personal

### HU-036: Recuperar una contraseña olvidada
- **Historia:** Como dispensador o administrador, quiero recuperar mi contraseña olvidada con un enlace a mi correo, para volver a entrar a mi panel sin que nadie más la conozca.
- **Fuente:** secciones 3.12 y 3.13 del contexto
- **Criterios de aceptación:**
  1. Dado la pantalla de inicio de sesión de cualquiera de los dos paneles, cuando la persona pide recuperar la contraseña con su correo, entonces, si la cuenta existe y está activa, recibe por correo un enlace de un solo uso que vence en 30 minutos.
  2. Dado un correo que no corresponde a ninguna cuenta, cuando se pide la recuperación, entonces la respuesta en pantalla es la misma que si la cuenta existiera.
  3. Dado un correo con el que ya se hicieron 3 solicitudes en la última hora, cuando se pide otra, entonces no se envía un nuevo enlace y la respuesta en pantalla es la misma. El límite se cuenta por correo ingresado, exista o no la cuenta. Confirmado (usuaria, P37; propuesta del ADR 0019 aprobada).
  4. Dado un enlace ya usado o con más de 30 minutos, cuando se abre, entonces se rechaza y no permite cambiar la contraseña.
  5. Dado un cambio de contraseña con el enlace, cuando se completa, entonces no se inicia sesión automáticamente, se cierran todas las sesiones abiertas de esa cuenta y se avisa del cambio por correo.
  6. Dado un administrador que perdió el acceso a su correo, cuando necesita recuperar el acceso, entonces el sistema no ofrece otra vía: la responsable del proyecto lo restablece directamente en la base de datos (sección 3.12).
  7. Dado una cuenta de dispensador desactivada, cuando pide la recuperación, entonces recibe la misma respuesta en pantalla y no se le envía ningún enlace. Confirmado (usuaria, P39; propuesta del ADR 0019 aprobada).
  8. Dado un cambio de contraseña con el enlace, cuando se define la nueva, entonces cumple la política de RNF-035 (mínimo 15 caracteres, sin reglas de composición, sin contraseñas filtradas o comunes). Confirmado (usuaria, R-10).
- **Estado:** Confirmado

### Solicitudes: cancelación y cierre

### HU-037: Cancelar una solicitud
- **Historia:** Como usuario, quiero cancelar una solicitud en cualquier momento, para liberar lo reservado y no ocupar una de las 2 solicitudes abiertas.
- **Fuente:** sección 3.5 del contexto y respuesta de la usuaria (R-05)
- **Criterios de aceptación:**
  1. Dado una solicitud abierta, cuando el usuario la cancela por la web o por Telegram, con una vinculación vigente, en cualquier momento (en carga, en prevalidación, esperando las 48 horas, con fórmulas aptas sin cita o con citas activas), entonces sus fórmulas que no estaban cerradas quedan canceladas y la solicitud deja de contar como abierta. Confirmado (sección 3.5; usuaria, R-05).
  2. Dado una solicitud con citas activas, cuando se cancela, entonces sus citas se cancelan, se liberan sus existencias y su cupo y sus códigos de entrega dejan de ser válidos, con las reglas de HU-017. Confirmado (propuesta aprobada, ADR 0011).
  3. Dado una fórmula de la que el paciente ya recibió una parte, cuando se cancela la solicitud, entonces lo no recogido se pierde y la fórmula se cierra (sección 3.5).
  4. Dado una cita cancelada por cancelar la solicitud, cuando ocurre, entonces se notifica su cancelación por los medios del paciente, como cualquier cancelación de cita (HU-020, P12). Inferido. La cancelación de la solicitud en sí no lleva una notificación aparte: Inferido (la usuaria decidió no avisar del cierre por inactividad; el contexto no pide avisar de la cancelación de solicitudes).
  5. Dado una solicitud cancelada, cuando llega la hora de sus recordatorios programados (incluidos los de 48 horas), entonces no se envían. Confirmado (propuesta aprobada, ADR 0011).
  6. Dado una solicitud cancelada, cuando el usuario quiere continuar, entonces no puede reabrirla: debe iniciar una nueva solicitud. Inferido de la sección 3.5 (no hay reprogramación).
  7. Dado un canal sin vinculación vigente o vinculado a otro paciente, cuando pide cancelar la solicitud, incluso directamente por la API, entonces se rechaza sin cambios (sección 3.13).
  8. Dado que el usuario pide cancelar la solicitud, cuando la web o el bot se lo muestran, entonces piden confirmar la cancelación e indican cuántas citas activas se cancelarán, sin nombrar medicamentos ni diagnósticos en el bot ni en la notificación. Inferido (la cancelación es irreversible, criterio 6).
- **Estado:** Confirmado (criterios 1, 2, 3, 5 y 7); criterios 4, 6 y 8 Inferidos

### HU-038: Cierre automático de solicitudes y fórmulas abandonadas
- **Historia:** Como usuario, quiero que una solicitud o una fórmula abandonada se cierre sola, para no quedar bloqueado por el límite de 2 solicitudes abiertas.
- **Fuente:** sección 3.5 del contexto y respuesta de la usuaria (R-05)
- **Criterios de aceptación:**
  1. Dado una solicitud con fórmulas en carga o prevalidación, cuando pasan 24 horas sin actividad de carga o de prevalidación en ella, entonces esas fórmulas se cancelan. Confirmado (sección 3.5; usuaria, R-05). Cuenta como actividad crear la solicitud, pedir una carga, completar una carga y pedir la prevalidación; cada actividad reinicia el plazo. Confirmado (propuesta aprobada, ADR 0011).
  2. Dado una fórmula apta sin cita, cuando pasan 24 horas desde su prevalidación sin que se confirme una cita, entonces se cancela. Confirmado (sección 3.5). Que, si el usuario vuelve a validar (HU-015), el plazo se cuente desde esa nueva prevalidación: Inferido.
  3. Dado una fórmula que quedó sin disponibilidad (HU-015), cuando pasan 24 horas desde el envío del recordatorio de 48 horas de su espera sin que el usuario vuelva a validar ni confirme una cita, entonces se cancela; durante la espera de 48 horas no aplica el criterio 2. Si al volver a validar otra vez no hay disponibilidad, el plazo pasa a contarse desde el recordatorio de la espera nueva; las fórmulas que esperan desde una misma validación se cancelan con el mismo plazo (HU-015, criterios 10 y 12). Confirmado (sección 3.5; usuaria, P43).
  4. Dado una fórmula con cita activa, cuando se evalúa el cierre automático, entonces no se cierra ni se cancela su cita: el cierre automático nunca cancela citas. Confirmado (sección 3.5: el cierre por inactividad solo aplica a carga, prevalidación y fórmulas aptas sin cita).
  5. Dado una fórmula cancelada por inactividad, cuando se consulta en la web o en Telegram, entonces aparece cancelada y cuenta como "cancelada" para el cierre de la solicitud. Si con eso todas las fórmulas de la solicitud quedan cerradas, la solicitud se cierra y deja de contar en el límite de 2. Confirmado (sección 3.5: "se cancelan por inactividad"; propuesta aprobada, ADR 0011).
  6. Dado una cancelación por inactividad de una solicitud o de una fórmula, cuando ocurre, entonces no se envía ninguna notificación al paciente por ningún medio. Confirmado (usuaria, decisión 2 del 2026-11-01). Cierra P42.
- **Estado:** Confirmado (criterio 2 en parte Inferido)

## Requisitos no funcionales
| ID | Requisito | Cómo se verifica | Fuente |
| --- | --- | --- | --- |
| RNF-001 | Ninguna notificación ni enlace incluye nombres de medicamentos ni diagnósticos; los enlaces al bot no llevan cédula ni otros datos sensibles (invariante 1) | Revisar el texto de cada mensaje enviado por web, Telegram, SMS y correo en el modo de prueba, y cada enlace al bot | Secciones 3.1 y 3.6 |
| RNF-002 | Cero sobre-reservas: ninguna cita sin medicamentos reservados ni ventana por encima de su capacidad; las citas de una misma fórmula se confirman todas o ninguna; el panel de administración no permite bajar inventario ni capacidad por debajo de lo reservado (invariante 2) | Prueba de dos confirmaciones simultáneas sobre el último cupo; prueba de fallo en una de las citas de una fórmula; intento de bajar inventario o capacidad por debajo de lo reservado y comprobación de que se rechaza sin cancelar citas | Secciones 3.5 y 3.12 |
| RNF-003 | No se registra nada antes de aceptar el tratamiento de datos, con la única excepción de la revocación, que se registra sin aceptar el aviso; la autorización de datos de salud se pide antes de cargar cualquier documento (invariante 3, precisado por la sección 3.2 del contexto vigente, versión 7) | Rechazar el aviso y comprobar que no quedó ningún dato; revocar sin aceptar el aviso y comprobar que solo queda la prueba de la revocación ligada a la huella de la cédula; intentar cargar sin autorización y comprobar que se rechaza | Sección 3.2 |
| RNF-004 | Los identificadores de Telegram no prueban identidad; solo la cédula y el código de un solo uso la verifican (invariante 4) | Desde un chat nuevo con el mismo nombre visible o usuario, intentar consultar datos de un paciente y comprobar que se pide verificación | Secciones 3.1 y 3.2 |
| RNF-005 | Cada fórmula es todo o nada y todo resultado de prevalidación se presenta como preliminar (invariante 5) | Fórmula con un medicamento no autorizado queda no apta completa; cada pantalla o mensaje de resultado incluye el aviso | Sección 3.4 |
| RNF-006 | Nunca se usan datos reales de pacientes; las pruebas usan datos ficticios y los contactos propios de la responsable del proyecto (invariante 6) | Revisión de los datos simulados y de los contactos de prueba | Secciones 3.2, 3.8 y 3.10 |
| RNF-007 | Autenticación y autorización en el backend en cada petición; denegar por defecto: todo endpoint de panel exige un rol explícito y el paciente solo accede con una vinculación vigente (invariante 7). Las únicas acciones del paciente sin vinculación vigente son pedir y usar el código (verificación y revocación) y revocar tras superar esa verificación; ninguna devuelve datos del paciente (secciones 3.2 y 3.13) | Llamar directamente a la API (sin la interfaz) sin sesión, con otro rol y con vinculación vencida, y comprobar el rechazo; comprobar que la revocación sin vinculación exige el código correcto | Secciones 3.2 y 3.13 (1 y 2) |
| RNF-008 | Mínimo privilegio: cada rol solo accede a su panel y el dispensador solo opera las citas de su punto | Un dispensador del punto A intenta validar un código o cerrar medicamentos de una cita del punto B y es rechazado | Sección 3.13 (3) |
| RNF-009 | Contraseñas de dispensadores y administradores con hash robusto; sesiones de máximo 12 horas, cerradas tras 30 minutos sin actividad en el panel del dispensador y 15 minutos en el de administración; cookies HttpOnly, Secure y SameSite, nunca almacenamiento local del navegador; protección CSRF y CORS limitado a los dominios propios | Inspeccionar las cookies de sesión y el almacenamiento local; enviar una petición que cambia datos sin token CSRF y desde otro origen y comprobar el rechazo; dejar inactiva cada sesión el tiempo indicado y comprobar el rechazo | Sección 3.13 (4) |
| RNF-010 | Límites de intentos y de frecuencia: código de un solo uso (de verificación y de revocación) con 3 intentos y 10 minutos de vigencia; un código nuevo cada 2 minutos como mínimo, máximo 5 por cédula por hora, y cada código nuevo anula el anterior; inicio de sesión con bloqueo de 15 minutos tras 5 contraseñas erradas; carga de máximo 20 archivos por paciente por hora; recuperación de contraseña con máximo 3 solicitudes por hora | Superar cada límite, por la interfaz y por la API, y comprobar el rechazo; usar un código anterior después de pedir uno nuevo y comprobar el rechazo | Secciones 3.2, 3.12 y 3.13 (4 y 5) |
| RNF-011 | Toda entrada se valida en el backend y las consultas son parametrizadas. Archivos: solo JPG, PNG, HEIC y PDF, máximo 10 MB, PDF de hasta 5 páginas, validados por su contenido real y su tamaño (no por la extensión ni el tipo declarado); se renombran con un identificador aleatorio; las imágenes se vuelven a codificar y pierden sus metadatos (como la ubicación); se guardan en almacenamiento privado y solo se accede con enlaces temporales | Enviar entradas malformadas e intentos de inyección y comprobar el rechazo sin efectos; cargar un ejecutable renombrado, un archivo de más de 10 MB y un PDF de 6 páginas; cargar una foto con ubicación y comprobar que el archivo guardado no la tiene y tiene nombre aleatorio; abrir un enlace temporal vencido | Secciones 3.4 y 3.13 (6) |
| RNF-012 | Todo el sitio usa HTTPS y cabeceras HSTS, Content-Security-Policy y X-Content-Type-Options | Inspeccionar las respuestas del sitio publicado y de la API | Sección 3.13 (7) |
| RNF-013 | El webhook de Telegram y las tareas programadas verifican un secreto antes de ejecutarse | Llamar al webhook y a cada tarea sin el secreto o con uno incorrecto y comprobar el rechazo sin efectos | Sección 3.13 (8) |
| RNF-014 | Las acciones de administradores y dispensadores quedan en un registro de auditoría con quién, qué y cuándo | Hacer acciones en ambos paneles y revisarlas en la pantalla de auditoría del panel de administración (P18, respuesta de la usuaria) | Sección 3.13 (9) |
| RNF-015 | Ningún registro (logs o auditoría) incluye cédulas, diagnósticos ni nombres de medicamentos (invariante 8) | Recorrer el flujo completo y buscar en logs y auditoría las cédulas, diagnósticos y medicamentos de prueba | Sección 3.13 (10) |
| RNF-016 | Los secretos viven solo en variables de entorno locales y de Vercel, nunca en el repositorio | Buscar credenciales en el repositorio; comprobar que `.env.example` solo tiene nombres | Sección 3.13 (11) |
| RNF-017 | Ventanas, citas y recordatorios se calculan en la zona horaria America/Bogota | Agendar y recibir recordatorios con el servidor en otra zona horaria y comprobar las horas | `CLAUDE.md` (convenciones) |
| RNF-018 | Textos visibles en español de Colombia en web, bot, paneles y mensajes | Revisión de las pantallas y mensajes | Sección 1 |
| RNF-019 | El bot de Telegram solo escribe a personas que lo iniciaron | Un chat que no ha iniciado el bot no recibe mensajes | Sección 3.1 |
| RNF-020 | Los recordatorios se envían en sus franjas: entre 19:00 y 21:00 del día anterior, y dos horas antes de la cita con un desfase máximo de 10 minutos después de la hora programada. Si el de dos horas se retrasa más de 10 minutos, se envía (con reverificación) si la cita no ha empezado y se omite si ya empezó; ambos casos se registran como incumplimiento. El recordatorio de 48 horas, uno solo por cada espera (las fórmulas que quedan esperando en una misma validación comparten uno; una espera nueva tras volver a validar tiene el suyo), sale entre las 48 horas y 1 hora después, nunca antes, y a las 7:00 si la marca cae entre las 21:00 y las 7:00 (con la hora de tolerancia contada desde las 7:00); si sale más de 1 hora tarde por una falla, se envía igual y se registra como incumplimiento. El aviso a crónicos sale en el despacho diario de las 19:00 del día que está 2 días antes de la fecha habilitada. Los registros de incumplimiento no llevan cédulas, diagnósticos ni medicamentos | Citas de prueba con horas conocidas; registrar la hora de envío de cada recordatorio; simular retrasos del envío de dos horas y del de 48 horas y revisar el registro de incumplimientos; volver a validar sin disponibilidad y comprobar que la espera nueva recibe su propio recordatorio | Secciones 3.5 (versión 7) y 3.6, `CLAUDE.md` (stack) y respuestas de la usuaria (R-02, decisión 1 del 2026-11-01 y P43, que reemplaza R-18) |
| RNF-021 | Accesibilidad adecuada para adultos mayores y personas con barreras digitales: la web del paciente y los paneles del dispensador y de administración toman WCAG 2.1 nivel AA como referencia voluntaria (no como obligación legal) | Revisión de las pantallas de la web del paciente y de ambos paneles contra los criterios de nivel A y AA de WCAG 2.1: uso solo con teclado, textos alternativos, contraste, etiquetas de formularios y mensajes de error | Secciones 2.1 y 3.1 |
| RNF-022 | Rendimiento de la web del paciente y de los paneles del dispensador y de administración, medido con conexión 4G lenta simulada: en el 75 % de las visitas, la pantalla principal carga en 2,5 segundos o menos, la respuesta a una interacción toma 200 milisegundos o menos y el contenido no salta (CLS de 0,1 o menos), umbrales "bueno" de Core Web Vitals de Google. El JavaScript inicial de la web pesa máximo 200 KB comprimido | Método aprobado (P40, propuesta del ADR 0020): en la vista previa publicada, con perfil móvil y 4G lenta simulada, 10 mediciones de laboratorio de la pantalla principal de cada experiencia; cumple si al menos 8 de 10 pasan carga de 2,5 s o menos y CLS de 0,1 o menos; la interacción, que no se mide en laboratorio, se sustituye por un tiempo total de bloqueo (TBT) de 200 ms o menos más una prueba automatizada que mide la respuesta a la acción principal con CPU y red limitadas. El límite de 200 KB aplica al JavaScript inicial de cada experiencia (paciente, dispensador y administrador) | Sección 3.15 y respuesta de la usuaria (P40) |
| RNF-023 | Salud Total y Sanitas siguen las mismas reglas; la EPS es un dato del paciente | Repetir los casos de prevalidación con pacientes de ambas EPS | Sección 3.8 |
| RNF-024 | La espera de 48 horas se presenta como plazo propio del producto, no como cumplimiento de una norma | Revisión del texto de los mensajes | Sección 3.11 |
| RNF-025 | El sistema solo informa trámites de autorización; nunca los tramita ni traslada al usuario trámites que corresponden a la EPS | Revisión del flujo de autorización faltante | Secciones 3.4 y 3.11 |
| RNF-026 | Ninguna pantalla protegida depende de que la CDN pase por el middleware: los datos solo llegan por la API protegida | Pedir los archivos estáticos de un panel sin sesión: no contienen datos; la API rechaza sin sesión | `CLAUDE.md` (seguridad) |
| RNF-027 | En el sitio publicado se pueden cargar archivos válidos de hasta 10 MB, aunque Vercel rechaza peticiones de más de 4,5 MB a una función | Cargar en el sitio publicado un JPG y un PDF válidos de entre 4,5 MB y 10 MB y comprobar que se aceptan y se procesan | Secciones 3.4 y 3.14 |
| RNF-028 | Tras una revocación, la base de datos solo conserva la prueba del consentimiento y de la revocación (fecha, canal, titular o tercero y versión del aviso) ligada a una huella cifrada de la cédula, nunca a la cédula en claro, y de cada cita cancelada o entregada solo punto, ventana, fecha y motivo. En la revocación, "titular o tercero" es lo que declaró quien revocó (HU-019, criterio 16). La huella es un HMAC de la cédula con clave secreta | Revocar con un paciente de prueba que tenga documentos, citas y vinculaciones, declarando una vez "titular" y otra "tercero"; buscar en la base de datos su cédula, nombre, documentos, diagnósticos y medicamentos y comprobar que no aparecen; comprobar que la prueba del consentimiento y de la revocación existe, que registra lo declarado y que la huella no es la cédula | Sección 3.2 y respuestas de la usuaria (R-01, R-24) |
| RNF-029 | El 95 % de las consultas normales a la API responde en menos de 1 segundo. "Consultas normales" son todas las peticiones a la API excepto completar una carga, iniciar la prevalidación, el webhook de Telegram y las tareas programadas (P40, propuesta del ADR 0020 aprobada) | En la vista previa publicada, carga ligera de 100 peticiones por cada ruta normal, con el tiempo medido en el servidor; el percentil 95 debe ser menor de 1 segundo | Sección 3.15 y respuesta de la usuaria (P40) |
| RNF-030 | La prevalidación con OCR entrega su resultado en máximo 60 segundos por solicitud y muestra un mensaje de "procesando" mientras tanto, en la web y en Telegram | Prevalidar en el sitio publicado una solicitud con varias fórmulas y su historia clínica, por web y por Telegram; medir el tiempo hasta el resultado y comprobar que se muestra "procesando" mientras tanto | Sección 3.15 |
| RNF-031 | El bot de Telegram responde, o muestra "procesando", en máximo 3 segundos | Enviar al bot mensajes de cada paso del recorrido y medir el tiempo hasta la primera respuesta | Sección 3.15 |
| RNF-032 | Pedir un código (de verificación o de revocación) no revela si una cédula está afiliada: el mensaje es el mismo exista o no la cédula en la EPS simulada, con el texto aprobado, y la respuesta de la API tampoco distingue los dos casos | Pedir el código con una cédula afiliada y con una inexistente, por web, por Telegram y directamente por la API, y comparar el mensaje y la respuesta | Sección 3.2 |
| RNF-033 | Formato de los códigos: el código de un solo uso (verificación y revocación) tiene 6 dígitos; el código de entrega tiene un QR y un código numérico de 8 dígitos. El panel del dispensador lee el QR con la cámara del navegador y ofrece un campo numérico que también sirve con un lector físico USB | Pedir códigos de un solo uso y contar sus dígitos; consultar citas y contar los dígitos del código de entrega; validar en el panel con la cámara, con el teclado y con un lector USB | Secciones 3.2 y 3.5 y respuesta de la usuaria (R-10) |
| RNF-034 | Todo SMS empieza por "Pharma Express:", no lleva tildes y tiene máximo 160 caracteres | Revisar en el modo de prueba el texto de cada tipo de SMS (código, notificaciones, recordatorios, confirmación de revocación) | Sección 3.6 y respuesta de la usuaria |
| RNF-035 | Las contraseñas de dispensadores y administradores tienen mínimo 15 caracteres, sin reglas de composición (no se exigen mayúsculas, números ni símbolos), y se rechazan las contraseñas filtradas o comunes; aplica al definirla con el enlace y al recuperarla | Intentar contraseñas de 14 caracteres, comunes o filtradas y comprobar el rechazo; usar una de 15 caracteres solo con minúsculas, no común, y comprobar que se acepta | Secciones 3.12 y 3.13 (4) y respuesta de la usuaria (R-10) |
| RNF-036 | Presupuesto de US$0: el prototipo solo usa servicios gratuitos o cuentas de estudiante sin tarjeta. La configuración externa (cuentas, dominios, teléfono Android para SMS, plan de SMS) la hace la usuaria antes de publicar; mientras tanto, todo se construye y se prueba en modo `capture` o con datos simulados, y ninguna funcionalidad queda bloqueada por esa configuración | Revisar que ningún servicio usado exige tarjeta ni pago; ejecutar las pruebas de cada funcionalidad en modo `capture` sin cuentas externas | Sección 3.9 y decisión 11 de la usuaria (2026-11-01) |
| RNF-037 | El texto de la autorización de datos de salud informa que los documentos se procesan con Microsoft Azure en Estados Unidos, en la web y en el bot | Leer el texto de la autorización en la web y en el bot antes de cargar un documento | Sección 3.2 y decisión de la usuaria sobre el ADR 0012 |

## Trazabilidad
| Historia | Funcionalidades |
| --- | --- |
| HU-001 | F001, F002, F003, F004, F014, F092, F093 |
| HU-002 | F003, F004 |
| HU-003 | F005, F006 |
| HU-004 | F009, F010, F013, F014, F035, F036, F042, F067, F068 |
| HU-005 | F011, F012, F035, F036 |
| HU-006 | F015, F016 |
| HU-007 | F015, F016, F019 |
| HU-008 | F017, F018 |
| HU-009 | F020, F021 |
| HU-010 | F022, F023 |
| HU-011 | F024, F025 |
| HU-012 | F026, F027 |
| HU-013 | F028, F029 |
| HU-014 | F030, F031, F032, F080, F081, F086, F087 |
| HU-015 | F033, F034, F047, F096, F097 |
| HU-016 | F035, F036 |
| HU-017 | F037, F038, F099 |
| HU-018 | F039, F099 |
| HU-019 | F040, F041, F043, F092, F093, F100 |
| HU-020 | F042, F043, F066, F092, F093, F099 |
| HU-021 | F044 |
| HU-022 | F045, F046, F077 |
| HU-023 | F048 |
| HU-024 | F050, F051, F052, F055 |
| HU-025 | F053 |
| HU-026 | F054 |
| HU-027 | F058, F059, F055 |
| HU-028 | F060, F085 |
| HU-029 | F061, F074, F085 |
| HU-030 | F062, F073 |
| HU-031 | F063 |
| HU-032 | F064 |
| HU-033 | F071, F072, F078, F079, F084 |
| HU-034 | F056, F065, F057, F075 |
| HU-035 | F069, F070, F094, F095, F098, F099 |
| HU-036 | F072, F082, F083 |
| HU-037 | F094, F095, F066 |
| HU-038 | F098 |

Funcionalidades transversales sin historia propia, ligadas a RNF: F007 (RNF-013, webhook), F008 (RNF-012), F049 (RNF-013, tareas programadas), F057 (RNF-015), F076 (RNF-021, accesibilidad de la web y de los paneles), F088 (RNF-022, rendimiento de la web y de los paneles), F089 (RNF-030, prevalidación con OCR en la web), F090 (RNF-030 y RNF-031, bot y prevalidación con OCR en Telegram), F091 (RNF-029, tiempos de la API). RNF-027 se verifica en F019; RNF-010 en F005, F006, F019, F050, F058, F082, F083, F092 y F093; RNF-028 en F040, F041, F092, F093 y F100; RNF-032 en F003, F004, F092 y F093; RNF-003 y RNF-007 (excepción de la revocación) en F092 y F093; RNF-020 en F044, F045, F047 y F048; RNF-033 en F003, F004, F035, F036 y F053; RNF-034 en F003, F004 y F043; RNF-035 en F078, F082 y F083; RNF-036 en todas, porque cada una se prueba en modo `capture` o con datos simulados; RNF-037 en F015 y F016.

### Orden de construcción y dependencias (R-07 y R-27)
Las prioridades se ajustaron para que ninguna funcionalidad dependa, para aprobarse, de otra de prioridad posterior. Las verificaciones que necesitan el panel del dispensador o el de administración se movieron a funcionalidades de esa prioridad o posterior; el paso original indica a dónde se movió. Cambios de prioridad: F069 y F070 (3 → 5), F043, F048 y F055 (6 o 7 → 8). Nuevas funcionalidades que reciben pasos movidos: F099 y F100 (prioridad 8). F050 y el resto del panel del dispensador (prioridad 7) usan la semilla de dispensadores (RP-01) en lugar de las cuentas que crea F071 (prioridad 8), y la política de contraseña se prueba al definirla en F078 (prioridad 8) y al recuperarla en F082. F040 y F080 (prioridad 5) solo verifican en la base de datos lo que el panel del dispensador comprueba después en F053 y F054 (prioridad 7); F048 pasó a prioridad 8 porque necesita entregar una fórmula en F054. La recuperación de contraseña de una cuenta desactivada se movió de F082 (prioridad 7) a F072 (prioridad 8), porque desactivar una cuenta es del panel de administración. Ubicar en prioridad 8 funcionalidades que no son del panel de administración, solo para que vayan después del panel del dispensador: Inferido. Dentro de una misma prioridad, la funcionalidad que se cita entre paréntesis en un paso (por ejemplo, "F054") se construye antes, salvo cuando el paso dice que algo "se verifica en" esa funcionalidad o que se "detalla" en ella: eso es una remisión hacia una funcionalidad posterior, no una dependencia.

Ajustes de R-27 (vinculación, prioridad 2): en prioridad 2 todavía no existen solicitudes (prioridad 3), citas (prioridad 5) ni rutas de la API con datos de un paciente concreto. Por eso:
- F011 y F012 (prioridad 2) solo verifican que, al escoger un paciente, el canal muestra su nombre y ningún dato del otro. Que solo se vean las solicitudes, fórmulas y citas del paciente escogido se movió a F035 (web) y F036 (Telegram), de prioridad 5.
- F013 pasó de prioridad 2 a 3 y usa la autorización de datos de salud del paciente (F015, primera operación sobre un paciente concreto) para probar el rechazo sin vinculación, con la vinculación de otro paciente y con una vinculación vencida. El mismo rechazo en la consulta de citas se movió a F035 (prioridad 5).
- F014 (prioridad 2) pide desde el chat ajeno las gestiones del paciente, sin nombrar las citas. Pedir las citas desde ese chat se movió a F036 (prioridad 5).
- Con esto, ninguna funcionalidad de prioridad 2 depende de otra de prioridad mayor.

Ajuste de R-29 (registro de la aceptación, prioridad 1): F001 y F002 verifican que, tras aceptar, se pide la cédula; la comprobación en la base de datos del registro de la aceptación (titular o tercero, fecha de la aceptación, canal y versión del aviso) se movió a F003 (web) y F004 (Telegram), de la misma prioridad, porque la aceptación queda ligada al paciente al verificar la identidad. F001 y F002 se construyen antes que F003 y F004.

## Requisitos de prueba para la arquitectura
Lo que las funcionalidades necesitan para probarse en su turno. El product-manager no decide cómo se construye; el architect lo define.

| ID | Requisito | Lo necesitan | Estado |
| --- | --- | --- | --- |
| RP-01 | Semilla de dispensadores de prueba: al menos dos cuentas de dispensador activas, con contraseña definida, asignadas a puntos distintos (A y B), con datos ficticios y correos de prueba de la responsable del proyecto, para probar el panel del dispensador (prioridad 7) antes de que el administrador pueda crear cuentas (F071, prioridad 8). En qué entornos existe la semilla lo define el architect | F050, F051, F052, F053, F054, F056, F082 | Confirmado (orden de la usuaria, R-07); detalle de diseño del architect |
| RP-02 | Mecanismo de datos de prueba para cambiar existencias del inventario simulado sin el panel de administración (prioridad 8) | F033, F042, F096, F097 | Inferido |
| RP-03 | Mecanismo de prueba de tiempo (hallazgo R-06 del informe de preparación) que permita llevar plazos a 24 horas, 48 horas, 3 meses y similares, y simular el retraso del envío de dos horas y del de 48 horas. Los pasos de prueba se refieren a él como "el mecanismo de prueba de tiempo de la arquitectura" | F005, F009, F011, F013, F045, F047, F050, F058, F078, F082, F084, F096, F097, F098 | Confirmado: resuelto por architect en el ADR 0021 (reloj de la aplicación y pruebas de tiempo), que cierra R-06 |

## Pendientes
Lo que no se pudo especificar sin una decisión de la usuaria (detalle en las preguntas abiertas de `docs/01-brief.md`). P37 a P43 quedaron resueltas por la usuaria (propuestas de los ADR 0011, 0019 y 0020 aprobadas, decisiones del 2026-11-01 y, para P43, la sección 3.5 de la versión 7 del contexto), igual que los hallazgos R-01, R-04, R-05, R-07, R-09, R-10, R-12, R-18 (reemplazado por P43), R-23, R-24, R-25 y R-26.
- P44: si el administrador puede seguir creando puntos o solo editar nombre y horario de los existentes (HU-028, criterio 5). No bloquea: F060 prueba la creación y, si la usuaria la quita, se borra ese paso.
- Inferidos que siguen esperando confirmación explícita: ver el último párrafo de las preguntas abiertas de `docs/01-brief.md`.
