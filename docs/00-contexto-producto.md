# Pharma Express - Contexto para agentes de IA

Versión: 3
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

## 3.2. Identidad y consentimiento

- Pharma Express no registra pacientes ni crea cuentas para ellos. Los datos de afiliación y contacto vienen de la EPS simulada.
- Antes de pedir cualquier dato, el sistema muestra el aviso de privacidad y pide aceptar el tratamiento de datos, con la declaración "soy el titular o actúo con su autorización". Se registra si aceptó el titular o un tercero, la fecha y el canal. Si la persona no acepta, no se registra nada.
- La identidad se verifica con la cédula y un código de un solo uso. El código llega por SMS al celular registrado en la EPS y, si existe, al correo registrado. Los envíos son reales; las pruebas usan números y correos propios de la responsable del proyecto.
- El código dura 10 minutos y admite 3 intentos. Si vence o se agotan los intentos, se ofrecen tres caminos: pedir un código nuevo, recibir orientación para actualizar los datos en la EPS o acudir a la atención presencial.
- La actualización de datos y el cambio de celular o correo se hacen en la EPS. El sistema solo orienta.
- La autorización para tratar datos de salud es separada y se pide antes de cargar cualquier documento.
- El titular puede revocar el consentimiento y pedir que se eliminen sus datos. Si tiene reservas activas, se eliminan y el cupo y los medicamentos quedan disponibles para otras personas.

## 3.3. Vinculación de canales y apoyo de terceros

- Después de verificar la identidad, el chat de Telegram o el navegador queda vinculado al paciente.
- Un mismo chat o navegador puede quedar vinculado a varios pacientes, sin límite. Si hay más de uno, se escoge el paciente antes de cada gestión.
- Toda vinculación vence a los 3 meses y exige un código nuevo. Mientras está vencida, ese canal no muestra información, no permite gestiones y no recibe notificaciones. Los SMS y correos siguen llegando.
- Quien ingresa el código correcto puede hacer todas las gestiones del paciente. El sistema no distingue entre paciente, cuidador, tutor o facilitador.
- Esto aplica también a menores y a personas con tutor, cuyo número registrado suele ser el del tutor.
- El apoyo de terceros no es una interfaz aparte: es un cuidador o un facilitador comunitario usando la web o Telegram en nombre del paciente.

## 3.4. Documentos y prevalidación

- El usuario carga las fórmulas y la historia clínica, en foto o PDF, por la web o por Telegram.
- Los datos de los documentos se obtienen con reconocimiento automático de texto (OCR). Si el reconocimiento no obtiene los datos, aplica la regla siguiente.
- Si de un documento no se obtienen los datos (ilegible, incompleto, sin diagnóstico o sin coincidencia con la EPS simulada), se pide cargarlo de nuevo. Si el problema persiste, la fórmula queda no apta y se orienta a la atención presencial.
- El tipo de tratamiento sale del diagnóstico. Un catálogo configurable define qué diagnósticos son crónicos; cualquier otro se trata como agudo.
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
- La confirmación es atómica: las citas de una misma fórmula se reservan todas o ninguna. Si otra persona confirmó antes, se informa y se muestran las opciones actualizadas.
- Cada cita tiene un código de entrega de un solo uso, en QR y numérico. El usuario lo consulta en la web o en Telegram cuando lo necesita; no tiene que guardarlo al agendar.
- No hay reprogramación. El usuario puede cancelar en cualquier momento. Para obtener otra cita debe iniciar una nueva solicitud.
- Si el paciente ya recibió parte de una fórmula y no recoge el resto (porque cancela o no llega), lo no recogido se pierde y la fórmula se cierra. Si no recibió nada, todo se libera.
- Si un medicamento no tiene existencias en ningún punto, o no hay ventanas con cupo en los días permitidos, no se crea un pendiente. Se informa que debe esperar 48 horas para volver a validar y se envía un único recordatorio a las 48 horas. El sistema no vigila el inventario.

## 3.6. Notificaciones y recordatorios

- Cada notificación se envía por todos los medios del paciente: notificación de la web a los navegadores vinculados, Telegram a los chats vinculados, SMS al celular registrado y correo si existe.
- Ninguna notificación, por ningún medio, incluye nombres de medicamentos ni diagnósticos.
- Hay dos recordatorios por cita:
  - Entre las 19:00 y las 21:00 del día anterior. No se envía si la cita se agendó después de las 21:00 ni en citas del mismo día.
  - Una hora antes de la cita. Lo reciben todos.
- Los recordatorios solo informan y ofrecen cancelar. No piden confirmación.
- Al enviar el recordatorio de una hora antes, el sistema vuelve a verificar afiliación, vigencia y autorizaciones. Si algo cambió, cancela las citas de la fórmula, libera los medicamentos y cupos, deja la fórmula no apta, registra qué dato cambió y cuándo, y notifica el motivo y el siguiente paso.
- No existe cita de continuidad. Después de entregar una fórmula crónica, el sistema avisa 2 días antes de la siguiente fecha habilitada para que el usuario inicie una nueva prevalidación.
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
- Pendiente de confirmar: el administrador crea las cuentas de los dispensadores, les asigna un punto y las desactiva.

## 3.13. Seguridad

1. La autenticación y la autorización se verifican en el backend en cada petición, con guards y middleware de NestJS. La interfaz nunca es la única barrera.
2. Denegar por defecto: todo endpoint de un panel exige un rol explícito, y el paciente solo accede con una vinculación vigente.
3. Mínimo privilegio: cada rol solo accede a las funciones de su panel, y el dispensador solo opera las citas de su punto.
4. Las contraseñas de dispensadores y administradores se guardan con un algoritmo de hash robusto. Las sesiones vencen y usan cookies HttpOnly, Secure y SameSite, con protección CSRF y CORS limitado a los dominios propios.
5. Hay límites de intentos y de frecuencia para el código de un solo uso, el inicio de sesión y la carga de documentos.
6. Toda entrada se valida en el backend y las consultas a la base de datos son parametrizadas. Los archivos cargados se validan por tipo y tamaño, se guardan en almacenamiento privado y solo se accede a ellos con enlaces temporales.
7. Todo el sitio usa HTTPS y cabeceras de seguridad (HSTS, Content-Security-Policy, X-Content-Type-Options).
8. El webhook de Telegram y las tareas programadas verifican un secreto antes de ejecutarse.
9. Las acciones de administradores y dispensadores quedan en un registro de auditoría (quién, qué y cuándo).
10. Ningún registro (logs o auditoría) incluye cédulas, diagnósticos ni nombres de medicamentos.
11. Los secretos viven solo en variables de entorno, locales y de Vercel, nunca en el repositorio.

## 3.14. Publicación

- El prototipo se publica en Vercel.
- El repositorio git y su remoto los crea y administra la responsable del proyecto.
