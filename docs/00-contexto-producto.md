# Pharma Express - Contexto para agentes de IA

Versión: 7
Estado: Aprobado
Propósito: dar a cualquier agente de IA que trabaje en Pharma Express las reglas de trabajo, el dominio y el contexto del producto, sin importar la tarea que realice.

# 1. Reglas de trabajo

1. Redactar en español de Colombia.
2. Seguir el principio del proyecto: la IA propone y la responsable del proyecto decide y valida.
3. Si falta información para cumplir la tarea, preguntar a la responsable del proyecto. No completar vacíos con suposiciones ni inventar reglas, cifras, normas, integraciones o comportamientos.
4. En toda respuesta, distinguir tres tipos de contenido:
   - Confirmado: lo que está en este archivo o lo que la responsable del proyecto respondió.
   - Inferido: una conclusión propia del agente. Se marca como tal y requiere confirmación.
   - Pendiente: lo que aún no está decidido.
   Una inferencia nunca se convierte en regla sin aprobación de la responsable del proyecto.
5. Si una solicitud contradice el contexto del producto (sección 3), señalar la contradicción y preguntar antes de continuar. No resolverla por cuenta propia.

# 2. Dominio

## 2.1. Producto

- Nombre: Pharma Express.
- Tipo: sistema multicanal de pre-dispensación farmacéutica. El entregable es un prototipo funcional con sistemas externos simulados.
- Propósito: que el paciente conozca antes de desplazarse la validez preliminar de sus fórmulas y la disponibilidad de sus medicamentos, y que reciba una cita solo cuando los medicamentos estén reservados.
- Lugar: puntos de dispensación del gestor farmacéutico Disfarma en Manizales, Caldas.
- Población: afiliados de Salud Total y Sanitas. Se prioriza a personas con tratamientos crónicos, adultos mayores y personas con barreras digitales.
- Diferenciador: prevalidación anticipada y reserva del medicamento antes de asignar la cita.

## 2.2. Problema

- En los puntos de dispensación, las validaciones para entregar un medicamento (afiliación, vigencia de la fórmula, cobertura PBS, autorización y disponibilidad) ocurren cuando el paciente ya está en la ventanilla.
- El paciente descubre las novedades tarde, después de desplazarse y esperar. En Manizales se han reportado esperas de 3 a 5 horas y cientos de usuarios con medicamentos pendientes.
- Consecuencias: desplazamientos inútiles, congestión en los puntos, riesgo de interrumpir tratamientos crónicos y exclusión de quienes no usan tecnología.
- El producto no resuelve el desabastecimiento, las autorizaciones, las deudas entre actores del sistema de salud ni el inventario real del gestor.

## 2.3. Actores

- Paciente: afiliado que gestiona sus fórmulas por la web o por Telegram.
- Persona que actúa por el paciente: cuidador, tutor o familiar que recibe el código en el celular o el correo del paciente. El sistema no la distingue del paciente.
- Facilitador comunitario: apoya a varias personas desde su propio chat o navegador. Opera igual que un cuidador.
- Dispensador: personal del punto. Tiene usuario y rol propios y trabaja en el panel del dispensador.
- Administrador: configura los datos configurables del sistema desde el panel de administración. Tiene usuario y rol propios.
- EPS simulada: fuente de afiliación, datos de contacto, vigencia de fórmulas, autorizaciones y habilitación de entregas crónicas.
- Inventario simulado: fuente de existencias por medicamento y por punto.
- Servicios externos reales: Telegram, SMS y correo. Solo transportan mensajes; no son fuente de identidad.

## 2.4. Glosario

- Pre-dispensación: gestión previa a la entrega: prevalidación, reserva y cita antes del desplazamiento.
- Solicitud: conjunto de fórmulas y medicamentos de un mismo paciente gestionados en una misma gestión.
- Fórmula: prescripción con uno o más medicamentos. Es la unidad de validación y es todo o nada.
- Prevalidación: verificación preliminar de afiliación, vigencia, cobertura PBS, autorización y, si la fórmula es crónica, habilitación de entrega. No sustituye la validación oficial.
- Validación oficial: la que registra el dispensador en el punto.
- Tratamiento agudo o crónico: clasificación de una fórmula según el diagnóstico de la historia clínica.
- Fecha habilitada de entrega: fecha desde la cual se puede entregar la siguiente dosis de una fórmula crónica.
- Ventana: bloque de 1 hora en un punto, con capacidad limitada. Equivale a franja.
- Cita: ventana escogida en un punto para recoger los medicamentos reservados en ese punto.
- Reserva: existencias y cupo apartados para una cita.
- Sobre-reserva: comprometer más existencias o cupos de los disponibles.
- Código de entrega: código de un solo uso, en QR y numérico, ligado a una cita.
- Vinculación: asociación de un chat de Telegram o de un navegador con un paciente después de verificar su identidad.
- PBS: Plan de Beneficios en Salud.
- UPC: Unidad de Pago por Capitación.
- MIPRES: plataforma de prescripción de tecnologías no financiadas con la UPC.

# 3. Contexto del producto

Esta sección describe cómo funciona Pharma Express según lo aprobado por la responsable del proyecto.

## 3.1. Canales

- El producto funciona por una aplicación web y por un bot de Telegram. Ambos permiten el recorrido completo: verificar la identidad, vincular el canal, cargar documentos, prevalidar, agendar, consultar, cancelar y recibir notificaciones.
- La atención presencial sigue disponible fuera del sistema, incluso si la persona no acepta el tratamiento de datos.
- El bot de Telegram solo escribe después de que la persona lo inicia.
- Los identificadores de Telegram (usuario, número de chat, nombre visible) no prueban la identidad de nadie.
- Se pueden usar enlaces directos al bot de Telegram como apoyo opcional. Esos enlaces nunca llevan cédula, diagnósticos, medicamentos ni otros datos sensibles.
- La web del paciente y los paneles del dispensador y del administrador toman WCAG 2.1 nivel AA como referencia voluntaria de accesibilidad.

## 3.2. Identidad y consentimiento

- Pharma Express no registra pacientes ni crea cuentas para ellos. Los datos de afiliación y contacto vienen de la EPS simulada.
- Antes de pedir cualquier dato, el sistema muestra el aviso de privacidad y pide aceptar el tratamiento de datos, con la declaración "soy el titular o actúo con su autorización". Se registra si aceptó el titular o un tercero, la fecha y el canal. Si la persona no acepta, no se registra nada. La única excepción es la revocación, descrita más abajo.
- La identidad se verifica con la cédula y un código de un solo uso. El código llega por SMS al celular registrado en la EPS y, si existe, al correo registrado. Los envíos son reales; las pruebas usan números y correos propios de la responsable del proyecto.
- Al pedir el código, el mensaje es el mismo exista o no la cédula en la EPS simulada, para no revelar quién está afiliado: "Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial."
- El código dura 10 minutos y admite 3 intentos. Si vence o se agotan los intentos, se ofrecen tres caminos: pedir un código nuevo, recibir orientación para actualizar los datos en la EPS o acudir a la atención presencial.
- La actualización de datos y el cambio de celular o correo se hacen en la EPS. El sistema solo orienta.
- La autorización para tratar datos de salud es separada y se pide antes de cargar cualquier documento.
- El titular puede revocar el consentimiento y pedir que se eliminen sus datos. Para revocar se verifica la identidad con un código nuevo pedido en ese momento, aunque el canal esté vinculado. Como el sistema no distingue al titular de un tercero (sección 3.3), revoca quien supere esa verificación.
- La opción "Revocar mi autorización" está en la pantalla de inicio de la web y del bot, también sin canal vinculado o con la vinculación vencida, porque el Decreto 1377 de 2013 (artículo 9) exige mecanismos gratuitos y de fácil acceso. Para revocar no se pide aceptar el aviso de privacidad; se informa que la cédula se usa solo para verificar la identidad y atender la solicitud. La revocación no crea ninguna vinculación.
- La revocación elimina de inmediato los documentos cargados, los datos del OCR, los resultados de prevalidación, las solicitudes, las citas, las vinculaciones de chats y navegadores y los recordatorios programados. Las citas activas se cancelan y el cupo y los medicamentos quedan disponibles para otras personas.
- Se conserva la prueba del consentimiento y de su revocación (fecha, canal, si fue el titular o un tercero y versión del aviso), ligada a una huella de la cédula con clave secreta (HMAC) y no a la cédula. Para dejar esa prueba, el flujo de revocación pide la declaración "Soy el titular" o "Actúo con su autorización". El Decreto 1377 de 2013 (artículo 8) exige conservar la prueba de la autorización. De cada cita cancelada o entregada queda solo el punto, la ventana, la fecha y el motivo, sin datos del paciente.
- Al revocar se envía una confirmación por SMS y correo, para que el titular se entere si lo hizo un tercero. La confirmación indica cuántas citas activas se cancelaron, sin medicamentos ni puntos (por ejemplo: "Revocaste tu autorización. Eliminamos tus datos y cancelamos tus 2 citas activas."); no se envía una notificación de cancelación por cada cita. Los datos de la EPS simulada no se modifican.

## 3.3. Vinculación de canales y apoyo de terceros

- Después de verificar la identidad, el chat de Telegram o el navegador queda vinculado al paciente.
- Un mismo chat o navegador puede quedar vinculado a varios pacientes, sin límite. Si hay más de uno, se escoge el paciente antes de cada gestión.
- Toda vinculación vence a los 3 meses y exige un código nuevo. Mientras está vencida, ese canal no muestra información, no permite gestiones y no recibe notificaciones. Los SMS y correos siguen llegando.
- Quien ingresa el código correcto puede hacer todas las gestiones del paciente. El sistema no distingue entre paciente, cuidador, tutor o facilitador.
- Esto aplica también a menores y a personas con tutor, cuyo número registrado suele ser el del tutor.
- El apoyo de terceros no es una interfaz aparte: es un cuidador o un facilitador comunitario usando la web o Telegram en nombre del paciente.

## 3.4. Documentos y prevalidación

- El usuario carga las fórmulas y la historia clínica, en foto o PDF, por la web o por Telegram. Se carga una sola historia clínica por solicitud.
- Formatos aceptados: JPG, PNG, HEIC y PDF. Máximo 10 MB por archivo y PDF de hasta 5 páginas.
- Los datos de los documentos se obtienen con reconocimiento automático de texto (OCR). Si el reconocimiento no obtiene los datos, aplica la regla siguiente.
- Si de un documento no se obtienen los datos (ilegible, incompleto, sin diagnóstico o sin coincidencia con la EPS simulada), se pide cargarlo de nuevo. Cada documento admite 3 cargas en total: la inicial y 2 recargas. Si el problema persiste en la tercera carga, la fórmula queda no apta y se orienta a la atención presencial.
- El tipo de tratamiento sale del diagnóstico. Un catálogo configurable define qué diagnósticos son crónicos; cualquier otro se trata como agudo.
- El diagnóstico de cada fórmula es un dato de la EPS simulada, y la historia clínica debe contenerlo; si no lo contiene, aplica la regla de recarga. El sistema nunca escoge por su cuenta entre varios diagnósticos de la historia clínica. Base: el Decreto 2200 de 2005 (artículos 16 y 17) exige que la fórmula permita relacionar los medicamentos con el diagnóstico y que este conste en la historia clínica, pero no que la fórmula lo traiga.
- Hay coincidencia con la EPS simulada cuando la fórmula muestra su número y la cédula del paciente, y la historia clínica muestra la cédula y el código CIE-10 del diagnóstico de esa fórmula; si el código no aparece, basta la descripción del diagnóstico, comparada sin tildes ni mayúsculas.
- Si la historia clínica falla en la tercera carga por ser ilegible o estar incompleta, quedan no aptas todas las fórmulas de la solicitud. Si se lee pero le falta el diagnóstico de una fórmula, solo esa fórmula queda no apta.
- La prevalidación sigue este orden:
  1. Afiliación activa. Se verifica una vez por solicitud. Si está inactiva, se detiene toda la solicitud y se orienta hacia la EPS.
  2. Vigencia de la fórmula. Es un dato de la EPS simulada; en los datos de prueba va de 8 a 9 meses después de la consulta. No se usa la regla antigua de 30 días. Si no está vigente, se indica que requiere una nueva valoración médica.
  3. Cobertura PBS de cada medicamento. Un medicamento no cubierto solo continúa si está autorizado.
  4. Autorización de cada medicamento, consultada en la EPS simulada. Si falta, el sistema solo muestra los puntos, enlaces o trámites de autorización de la EPS del paciente. No tramita autorizaciones ni vigila su estado; el usuario vuelve a consultar por su cuenta.
  5. Habilitación de entrega, solo para fórmulas crónicas. La fórmula es apta si la fecha habilitada es igual o anterior a la fecha de la cita posible.
- Cada fórmula es todo o nada: si un medicamento no cumple, toda la fórmula queda no apta.
- Las fórmulas separadas son independientes. Las aptas continúan; para las no aptas se indica que se gestionen con la EPS.
- Todo resultado se presenta como preliminar, con el aviso de que la validación oficial ocurre en el punto.

## 3.5. Disponibilidad, reserva y agenda

- Tanto los tratamientos agudos como los crónicos verifican disponibilidad, reservan y agendan.
- Nunca existe una cita sin medicamentos reservados ni se supera la capacidad de una ventana. La meta es cero sobre-reservas.
- Cuándo puede ser la cita:
  - Agudo: el mismo día, en ventanas que inicien al menos una hora después de agendar, o el día siguiente.
  - Crónico: solo el día calendario siguiente.
  - Si una cita incluye algún medicamento crónico, aplica la regla del crónico.
- La cita es una ventana de 1 hora. Si el paciente llega antes, espera a que inicie. La reserva expira al terminar la ventana.
- La reserva se hace por solicitud. Si los medicamentos están en puntos distintos, se agenda una cita por punto.
- Si una fórmula va a un punto donde la solicitud ya tiene una cita confirmada y esa cita cumple las reglas de la fórmula (por ejemplo, el día permitido para crónicos), se agrega a esa cita: misma ventana y mismo código de entrega, sin ocupar otro cupo. Solo reserva sus medicamentos. Si no las cumple, se crea otra cita en ese punto, con su propio código y su cupo.
- Un paciente puede tener como máximo 2 solicitudes abiertas. Una solicitud está abierta mientras alguna de sus fórmulas siga en carga, prevalidación, agenda o con cita activa, y se cierra cuando cada fórmula quedó entregada, no apta, cancelada o perdida por no recogerla.
- La confirmación es atómica: las citas de una misma fórmula se reservan todas o ninguna. Si otra persona confirmó antes, se informa y se muestran las opciones actualizadas.
- Cada cita tiene un código de entrega de un solo uso, en QR y numérico. El usuario lo consulta en la web o en Telegram cuando lo necesita; no tiene que guardarlo al agendar.
- No hay reprogramación. El usuario puede cancelar en cualquier momento. Para obtener otra cita debe iniciar una nueva solicitud.
- Si el paciente ya recibió parte de una fórmula y no recoge el resto (porque cancela o no llega), lo no recogido se pierde y la fórmula se cierra. Si no recibió nada, todo se libera.
- Si un medicamento no tiene existencias en ningún punto, o no hay ventanas con cupo en los días permitidos, no se crea un pendiente. Se informa que debe esperar 48 horas para volver a validar y se envía un único recordatorio a las 48 horas. El sistema no vigila el inventario.
- Ese recordatorio sale hasta 1 hora después de las 48 horas, nunca antes; si cae entre las 21:00 y las 7:00, sale a las 7:00. Desde él se vuelve a validar en la misma solicitud, sin cargar otra vez los documentos.
- Si al volver a validar tampoco hay disponibilidad, empieza una espera nueva con las mismas reglas: su propio recordatorio a las 48 horas y cancelación si la fórmula no se agenda en las 24 horas siguientes a ese recordatorio. Las fórmulas que quedan esperando en una misma validación comparten un solo recordatorio y un solo plazo.
- El usuario puede cancelar una solicitud en cualquier momento. Además, se cancelan por inactividad: una solicitud con 24 horas sin actividad en carga o prevalidación, y una fórmula apta sin cita 24 horas después de prevalidarse (o 24 horas después del recordatorio de 48 horas, si estaba esperando).

## 3.6. Notificaciones y recordatorios

- Cada notificación se envía por todos los medios del paciente: notificación de la web a los navegadores vinculados, Telegram a los chats vinculados, SMS al celular registrado y correo si existe.
- Ninguna notificación, por ningún medio, incluye nombres de medicamentos ni diagnósticos.
- Hay dos recordatorios por cita:
  - Entre las 19:00 y las 21:00 del día anterior. No se envía en citas del mismo día ni si la cita se agendó después de las 19:00 del día anterior: en ese caso la confirmación cumple esa función.
  - Dos horas antes de la cita. Sale como máximo 10 minutos después de la hora programada. No se envía si la cita se agendó con menos de 2 horas de anticipación.
- Si el recordatorio de dos horas antes sale con más de 10 minutos de retraso, se envía y se reverifica si la cita aún no empieza, y se omite si ya empezó; los dos casos se registran como incumplimiento.
- Los recordatorios solo informan y ofrecen cancelar. No piden confirmación.
- Al enviar el recordatorio de dos horas antes, el sistema vuelve a verificar afiliación, vigencia y autorizaciones. Si algo cambió en una fórmula, esa fórmula queda no apta, se liberan sus medicamentos en todos los puntos y se registra qué dato cambió y cuándo. Una cita que queda sin medicamentos se cancela y libera su cupo; una cita que conserva medicamentos de otras fórmulas aptas se mantiene, con la misma ventana y el mismo código. Si lo que cambió es la afiliación, afecta a todas las fórmulas de la solicitud. Se notifica el motivo, si la cita se mantiene y el siguiente paso, sin nombrar medicamentos; el detalle se consulta en la web o en Telegram. Si ese recordatorio no se envía por la poca anticipación, tampoco se reverifica: la prevalidación es reciente.
- No existe cita de continuidad. Después de entregar una fórmula crónica, el sistema avisa 2 días antes de la siguiente fecha habilitada, a las 19:00, para que el usuario inicie una nueva prevalidación.
- El sistema no avisa cuando llega un medicamento ni cuando la EPS aprueba una autorización.

## 3.7. Atención en el punto

- El dispensador trabaja en un panel web propio, separado de la experiencia del paciente, al que entra con su usuario de rol dispensador.
- La hora de llegada del paciente es el momento en que el dispensador valida el código.
- El código solo es válido en su punto, dentro de su ventana y una sola vez.
- El dispensador ve la prevalidación, registra la validación oficial y cierra cada medicamento como entregado o no entregado.
- Motivos de no entrega: afiliación inactiva; fórmula vencida o inválida; autorización no vigente; medicamento no cubierto; datos del paciente no coinciden; sin existencias pese a reserva; otro, con descripción.
- Si en el punto hay una novedad con algún medicamento, el usuario la gestiona con Disfarma. El sistema no crea pendientes ni gestiona entregas parciales.

## 3.8. Datos simulados y configuración

- Son simulados la EPS, el inventario, los puntos de dispensación y la validación oficial. Son reales Telegram, el envío de SMS y el envío de correo.
- Todos los puntos tienen nombres ficticios. Su horario, ventanas, capacidad e inventario son configurables desde el panel de administración.
- Los puntos, enlaces y trámites de autorización de cada EPS y el catálogo de diagnósticos crónicos también son configurables desde ese panel.
- Los datos simulados (EPS, inventario, puntos y catálogo) los arma la responsable del proyecto. Los agentes pueden proponer su formato, no su contenido.
- Salud Total y Sanitas siguen las mismas reglas; la EPS es un dato del paciente.

## 3.9. Restricciones del proyecto

- El proyecto no tiene acceso a los sistemas de Disfarma y se desarrolla desde afuera.
- Es un prototipo universitario (Universidad de Caldas) con presupuesto de US$0: solo se usan servicios gratuitos o cuentas de estudiante sin tarjeta.

## 3.10. Fuera de alcance

- Cita de continuidad.
- Pendientes y entrega parcial gestionada por el sistema.
- Reprogramación.
- Reporte de concordancia entre prevalidación y validación oficial.
- Vigilancia automática del inventario o de las autorizaciones.
- Trámite de autorizaciones.
- Registro de pacientes y actualización de sus datos.
- Domicilio.
- Aplicación móvil instalable y WhatsApp.
- Medición SUS y metas de desempeño.
- Integración real con EPS, MIPRES, ADRES o inventarios reales.
- Facturación, prescripción o modificación de fórmulas.
- Uso de datos reales de pacientes.

## 3.11. Contexto normativo

- Ley 1581 de 2012 y Decreto 1377 de 2013: los datos de salud son sensibles y requieren autorización explícita del titular.
- Decreto Ley 019 de 2012, artículo 131, y Resolución 1604 de 2013: si la entrega queda incompleta al reclamar, la EPS debe entregar lo faltante en máximo 48 horas. Es una obligación de la EPS y de su red, no de Pharma Express. La espera de 48 horas que informa Pharma Express cuando no hay disponibilidad es un plazo propio para volver a validar y no debe presentarse como cumplimiento de esa norma.
- Decreto Ley 019 de 2012, artículo 120: prohíbe trasladar al usuario trámites de autorización. Por eso el sistema solo informa los puntos, enlaces o trámites de la EPS.

## 3.12. Administración

- El administrador es un rol con usuario propio y un panel web separado del panel del dispensador y de la experiencia del paciente.
- Desde su panel configura: puntos de dispensación (nombre ficticio y horario), ventanas y su capacidad, inventario simulado por punto, catálogo de diagnósticos crónicos, y puntos, enlaces y trámites de autorización de cada EPS.
- El administrador crea las cuentas de los dispensadores y les asigna un punto. El dispensador recibe en su correo un enlace de un solo uso, que vence en 48 horas, para definir su contraseña. El administrador nunca la conoce. Si el enlace vence sin usarse, el administrador puede enviar uno nuevo, que anula el anterior.
- Dispensadores y administradores pueden recuperar una contraseña olvidada con un enlace por correo, de un solo uso, que vence en 30 minutos, con máximo 3 solicitudes por hora. La respuesta es la misma exista o no la cuenta. Después del cambio no se inicia sesión automáticamente, se cierran todas las sesiones abiertas y se avisa por correo. Si el administrador pierde acceso a su correo, la responsable del proyecto lo restablece directamente en la base de datos.
- El administrador puede cambiar el punto asignado y desactivar o reactivar cuentas. Las cuentas no se borran, para conservar la auditoría.
- El panel no permite bajar el inventario ni la capacidad de una ventana por debajo de lo ya reservado, y muestra lo reservado. Tampoco permite cambios de horario que dejen por fuera ventanas con citas activas ni quitar ventanas que las tengan, y muestra cuáles son. Recortar horas sin citas, ampliar el horario o agregar ventanas se permite siempre. Ningún ajuste de configuración cancela citas.

## 3.13. Seguridad

1. La autenticación y la autorización se verifican en el backend en cada petición, con guards y middleware de NestJS. La interfaz nunca es la única barrera.
2. Denegar por defecto: todo endpoint de un panel exige un rol explícito, y el paciente solo accede con una vinculación vigente.
3. Mínimo privilegio: cada rol solo accede a las funciones de su panel, y el dispensador solo opera las citas de su punto.
4. Las contraseñas de dispensadores y administradores se guardan con un algoritmo de hash robusto. Las sesiones duran como máximo 12 horas y se cierran tras 30 minutos sin actividad en el panel del dispensador y 15 minutos en el del administrador. Tras 5 contraseñas erradas, la cuenta se bloquea 15 minutos. Las sesiones usan cookies HttpOnly, Secure y SameSite, nunca el almacenamiento local del navegador, con protección CSRF y CORS limitado a los dominios propios.
5. Hay límites de intentos y de frecuencia para el código de un solo uso, el inicio de sesión y la carga de documentos. Se puede pedir un código nuevo cada 2 minutos, con máximo 5 por cédula por hora, y cada código nuevo anula el anterior. Se cargan máximo 20 archivos por paciente por hora.
6. Toda entrada se valida en el backend y las consultas a la base de datos son parametrizadas. Los archivos cargados se validan por su contenido real y su tamaño, no por la extensión ni por el tipo que declara el navegador; se renombran con un identificador aleatorio; las imágenes se vuelven a codificar, lo que borra sus metadatos (como la ubicación); se guardan en almacenamiento privado y solo se accede a ellos con enlaces temporales.
7. Todo el sitio usa HTTPS y cabeceras de seguridad (HSTS, Content-Security-Policy, X-Content-Type-Options).
8. El webhook de Telegram y las tareas programadas verifican un secreto antes de ejecutarse.
9. Las acciones de administradores y dispensadores quedan en un registro de auditoría (quién, qué y cuándo).
10. Ningún registro (logs o auditoría) incluye cédulas, diagnósticos ni nombres de medicamentos.
11. Los secretos viven solo en variables de entorno, locales y de Vercel, nunca en el repositorio.

## 3.14. Publicación

- El prototipo se publica en Vercel.
- Vercel no acepta peticiones de más de 4,5 MB a una función, así que los archivos de hasta 10 MB no pueden pasar por el backend al subirse.
- El repositorio git y su remoto los crea y administra la responsable del proyecto.

## 3.15. Rendimiento

Las mediciones de la web se hacen con conexión 4G lenta simulada, porque muchos usuarios están en zonas rurales.

- Web del paciente y paneles, medidos en el 75 % de las visitas (umbrales "bueno" de Core Web Vitals de Google): la pantalla principal carga en 2,5 segundos o menos, la respuesta a una interacción toma 200 milisegundos o menos y el contenido no salta (CLS de 0,1 o menos).
- El JavaScript inicial de la web pesa máximo 200 KB comprimido.
- El 95 % de las consultas normales a la API responde en menos de 1 segundo.
- La prevalidación con OCR entrega su resultado en máximo 60 segundos por solicitud y muestra un mensaje de "procesando" mientras tanto.
- El bot de Telegram responde, o muestra "procesando", en máximo 3 segundos.
