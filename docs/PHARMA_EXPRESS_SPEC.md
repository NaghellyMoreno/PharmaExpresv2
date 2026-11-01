# Pharma Express - Especificación para agentes de IA

Versión: 1
Estado: Aprobado
Aprobación: equipo completo por consenso (Karen, Isabella, Juan Manuel y Camila)
Fuentes: PHARMA_EXPRESS_CONTEXTO.md (contexto base), contexto_revision.md (versión anterior, reemplazada por este documento), sesiones de elicitación con el equipo, Resolución 1604 de 2013 y Guía de trabajo para el Specification Agent.

# 0. Cómo usar este documento

Este documento es la especificación de Pharma Express para los agentes de IA de las etapas posteriores: arquitectura, planificación, implementación y QA. Describe qué debe hacer el sistema y bajo qué condiciones se considera correcto. No define tecnologías, arquitectura, modelo de datos, endpoints ni código.

Estructura:

- Parte A: contexto global que aplica a todas las especificaciones.
- Parte B: una especificación (SPEC) por módulo funcional, con las 17 secciones de la guía del Specification Agent.

Identificadores. La numeración es única en todo el documento.

- DEC: decisión del equipo.
- SPEC: especificación de un módulo.
- HU: historia de usuario.
- RF: requisito funcional.
- RNF: requisito no funcional.
- BR: regla de negocio.
- AC: criterio de aceptación.
- CL: caso límite.
- SUP: supuesto del prototipo.
- OPEN-Q: pregunta abierta.

Origen de cada elemento:

- CB x: contexto base PHARMA_EXPRESS_CONTEXTO.md, sección x.
- DEC-xx: decisión del equipo registrada en A3.
- NORMA: norma citada en A13.
- OPEN-Q-xx: pregunta abierta pendiente de decisión del equipo (A15). En esta versión no hay ninguna.

Precedencia: cuando este documento contradice el contexto base, prevalece este documento, porque recoge las decisiones más recientes del equipo (CB 0.2). Las diferencias están listadas en A16.

Reglas para cualquier agente:

1. Redactar en español de Colombia.
2. No inventar reglas, cifras, integraciones ni comportamientos. Si algo no está en este documento, registrarlo como pregunta abierta y consultar al equipo.
3. No presentar como real lo que el prototipo simula.
4. Presentar siempre la prevalidación como preliminar. La validación oficial ocurre en el punto de dispensación.
5. No incluir nombres de medicamentos ni diagnósticos en ninguna notificación, por ningún canal.
6. No eliminar la atención presencial.
7. No asignar una cita sin existencias reservadas y cupo en la ventana.
8. No tratar identificadores de Telegram (user_id, chat_id, username, nombre visible) como prueba de identidad.
9. No reintroducir lo que este documento declara fuera de alcance (A5.2), en particular cita de continuidad, pendientes, entrega parcial gestionada, reprogramación y reporte de concordancia.
10. Si surge una pregunta abierta, se registra en A15 como OPEN-Q y no se aplica hasta que el equipo la decida.
11. Los mecanismos (cómo leer un documento, cómo enviar un SMS, cómo almacenar datos, qué proveedor usar) corresponden al agente de arquitectura.

# Parte A. Contexto global

## A1. Producto

- Nombre: Pharma Express.
- Tipo: sistema multicanal de pre-dispensación farmacéutica. El entregable es un prototipo funcional con sistemas externos simulados.
- Propósito: que el paciente conozca antes de desplazarse la validez preliminar de sus fórmulas y la disponibilidad de sus medicamentos, y que reciba una cita solo cuando los medicamentos estén reservados.
- Canales: aplicación web y bot de Telegram. Ambos permiten el flujo completo. La atención presencial se mantiene fuera del sistema.
- Contexto geográfico: puntos de dispensación del gestor farmacéutico Disfarma en Manizales, Caldas. En el prototipo los puntos tienen nombres ficticios.
- Población: afiliados de Salud Total y Sanitas. Se prioriza a personas con tratamientos crónicos, adultos mayores y personas con barreras digitales.
- Diferenciador: prevalidación anticipada y reserva del medicamento antes de asignar la cita.
- Resultado esperado: reducir tiempos de espera y desplazamientos innecesarios frente a una línea base externa del proceso presencial. El efecto se evalúa, no se asume.
- Propuesta de valor: traslada el descubrimiento de novedades desde la fila hasta el momento previo al desplazamiento. No promete resolver el abastecimiento ni las autorizaciones.

## A2. Problema

- Problema central (CB 3.1): en los puntos de dispensación, las validaciones necesarias para entregar un medicamento (afiliación, vigencia de la fórmula, cobertura PBS, autorización y disponibilidad) ocurren cuando el paciente ya está en la ventanilla. El paciente puede descubrir una novedad después de una espera prolongada.
- Causa que aborda el proyecto (CB 3.3): el momento y el lugar de la validación, que hoy es fragmentada y tardía.
- Consecuencias que se busca reducir (CB 3.5): desplazamientos improductivos, esperas y congestión, descubrimiento tardío de novedades, riesgo de discontinuidad en tratamientos crónicos y exclusión digital.
- Lo que no es objeto del proyecto (CB 3.1): conectividad, disponibilidad de personal, gestión de inventario del gestor, deudas entre actores y desabastecimiento.
- Brecha frente a soluciones existentes (CB 3.4): otros gestores ofrecen turno virtual o preagendamiento, pero no garantizan que el usuario conozca el resultado preliminar de las validaciones ni que el medicamento esté reservado para su cita.
- Pregunta problema (CB 4): ¿Cómo puede un sistema multicanal de pre-dispensación permitir a los usuarios de puntos de dispensación en Manizales conocer, antes de desplazarse, la validez preliminar de su solicitud y la disponibilidad de sus medicamentos, de forma accesible también para personas con barreras de uso de tecnología?
- Evidencia resumida (CB 3.2): las tutelas en salud crecieron cerca de 18 % entre 2024 y 2025, y entre 36 % y 37 % se relacionan con entrega tardía o incompleta de medicamentos. En Manizales se reportaron esperas de 3 a 5 horas y miles de medicamentos pendientes entre 2025 y 2026. Cerca del 20 % de la población de Manizales es adulta mayor. Las cifras deben contrastarse con las fuentes de A17 antes de una entrega académica.

## A3. Registro de decisiones del equipo

- DEC-01. Telegram es el canal conversacional del prototipo, mediante un bot sobre la Bot API oficial (CB 16).
- DEC-02. WhatsApp queda descartado: sus condiciones actuales para desarrolladores no son factibles para un proyecto estudiantil que busca operar de la forma más real posible.
- DEC-03. Los canales son la aplicación web y el bot de Telegram. Ambos permiten el flujo completo: verificar identidad, vincular el canal, cargar documentos, prevalidar, agendar, consultar, cancelar y recibir notificaciones. No hay aplicación móvil instalable.
- DEC-04. El canal asistido consiste en que un cuidador o un facilitador comunitario gestione en nombre del paciente usando la web o Telegram. La atención presencial sigue disponible fuera del sistema.
- DEC-05. Pharma Express no registra pacientes ni crea cuentas de pacientes. Los datos de afiliación y contacto provienen de la EPS simulada, porque el registro corresponde a cada EPS. Solo el dispensador tiene usuario con rol en el sistema.
- DEC-06. La identidad se verifica con la cédula y un código de un solo uso enviado por SMS al celular registrado en la EPS y, si existe, al correo registrado. Los envíos de SMS y correo son reales; las pruebas se hacen con números y correos de los integrantes del equipo.
- DEC-07. El código de verificación dura 10 minutos y admite 3 intentos.
- DEC-08. La actualización de datos y el cambio del medio de contacto se hacen en la EPS. Pharma Express solo orienta al usuario.
- DEC-09. La aceptación del tratamiento de datos incluye la declaración "soy el titular o actúo con su autorización". El sistema registra si aceptó el titular o un tercero, la fecha y el canal. El titular puede revocar el consentimiento y pedir la eliminación de sus datos; si tiene reservas activas, se eliminan y el cupo y las existencias quedan disponibles para otros pacientes.
- DEC-10. Un mismo chat de Telegram o un mismo navegador puede quedar vinculado a varios pacientes, sin límite. Toda vinculación se reverifica cada 3 meses.
- DEC-11. Quien ingresa el código correcto puede hacer todas las gestiones del paciente. El sistema no distingue entre paciente, cuidador, tutor o facilitador. Esto aplica también a menores y a personas con tutor, cuyo número registrado suele ser el del tutor.
- DEC-12. El usuario carga las fórmulas y la historia clínica en foto o PDF, por la web o por Telegram. El tipo de tratamiento (agudo o crónico) se obtiene del diagnóstico de la historia clínica.
- DEC-13. La vigencia de la fórmula es responsabilidad de la EPS. En el prototipo es un dato de la EPS simulada; los datos de prueba la fijan entre 8 y 9 meses después de la consulta médica.
- DEC-14. La prevalidación sigue este orden: afiliación, vigencia, cobertura PBS y autorización.
- DEC-15. La autorización se consulta en la EPS simulada. Si falta, el sistema solo muestra los puntos, enlaces o trámites de autorización de la EPS del paciente (contenido configurable). El usuario vuelve a consultar por su cuenta; el sistema no tramita autorizaciones ni vigila su estado.
- DEC-16. Una solicitud agrupa las fórmulas y medicamentos de un mismo paciente. La unidad de validación es la fórmula, y cada fórmula es todo o nada: si un medicamento de una fórmula no cumple, la fórmula completa se detiene. Las fórmulas separadas son independientes: las aptas continúan, y para las no aptas se indica que el usuario puede hacer la gestión con su EPS.
- DEC-17. No existe cita de continuidad. Para tratamiento crónico se verifica que la entrega ya esté habilitada. Después de una entrega crónica, el sistema avisa al usuario 2 días antes de la siguiente fecha habilitada para que inicie una nueva prevalidación.
- DEC-18. Los tratamientos agudo y crónico verifican disponibilidad, reservan y agendan. El agudo puede tener cita el mismo día o el día siguiente. El crónico solo puede tener cita el día calendario siguiente. La anticipación máxima es de 1 día.
- DEC-19. La cita es una ventana de 1 hora; ventana y franja son el mismo concepto. Se elimina la tolerancia de 10 minutos. Si el usuario llega antes de la ventana, debe esperar su inicio. La reserva expira al terminar la ventana.
- DEC-20. La reserva se hace por solicitud. Si los medicamentos están en puntos distintos, se informa al usuario y se le permite escoger una cita en cada punto. Si el usuario no recoge un medicamento de una fórmula de la que ya recibió otro medicamento, pierde el medicamento no recogido y el caso de esa fórmula se cierra. Si los medicamentos pertenecen a fórmulas o autorizaciones separadas, la reserva no recogida se libera y el usuario puede pedir otra cita.
- DEC-21. La reserva se confirma de forma atómica al confirmar la cita. Si otra persona confirmó antes, se informa y se muestran otras opciones.
- DEC-22. No hay reprogramación. El usuario puede cancelar en cualquier momento.
- DEC-23. Los recordatorios se envían por todos los canales en dos momentos: entre las 19:00 y las 21:00 del día anterior a la cita y una hora antes de la cita. Todos los usuarios reciben el recordatorio de una hora antes. Los recordatorios solo informan y ofrecen cancelar; no piden confirmación. Al enviar el recordatorio de una hora antes, el sistema vuelve a prevalidar para detectar cambios de estado.
- DEC-24. El código de entrega existe en formato QR y numérico, y el usuario usa el que le resulte más fácil. Es de un solo uso. El usuario lo consulta en la web o en Telegram cuando lo necesite; no tiene que guardarlo al agendar.
- DEC-25. Si no hay disponibilidad, no se crea un pendiente. Se informa al usuario que debe esperar 48 horas para volver a validar y se envía un único recordatorio a las 48 horas. El usuario hace la validación repitiendo el flujo. El sistema no vigila el inventario.
- DEC-26. En el punto, la hora de llegada es el momento en que el dispensador valida el código. El dispensador tiene usuario con rol, ve la prevalidación y registra el resultado de la validación oficial. Si en el punto hay una novedad con algún medicamento, el usuario debe gestionarla con Disfarma; eso no corresponde a Pharma Express.
- DEC-27. Catálogo de motivos de no entrega aprobado: afiliación inactiva; fórmula vencida o inválida; autorización no vigente; medicamento no cubierto; datos del paciente no coinciden; sin existencias pese a reserva; otro, con descripción.
- DEC-28. Las notificaciones se envían por todos los medios que tenga registrados o vinculados el paciente: notificación de la aplicación web, Telegram, SMS y correo. Ninguna notificación, en ningún canal, incluye nombres de medicamentos ni diagnósticos.
- DEC-29. Se incluyen enlaces profundos de Telegram como apoyo opcional, sin datos sensibles en sus parámetros.
- DEC-30. Todos los puntos se simulan con nombres ficticios. Horario, ventanas, capacidad e inventario son parámetros configurables por punto y los fijan los datos de prueba. Los puntos, enlaces y trámites de autorización por EPS también son contenido configurable.
- DEC-31. Salud Total y Sanitas siguen las mismas reglas en la simulación; la EPS es un dato del paciente.
- DEC-32. Quedan fuera de alcance: cita de continuidad, pendientes, entrega parcial gestionada por el sistema, reprogramación, reporte de concordancia, rol de equipo evaluador, medición SUS, metas de desempeño, plazo de conservación de datos, manejo de fallas de las fuentes simuladas y domicilio.
- DEC-33. Se aplica WCAG 2.1 nivel AA a la aplicación web como referencia voluntaria; Telegram sigue las condiciones de su plataforma. La interfaz y los mensajes se redactan en español de Colombia.
- DEC-34. Cuidadores y facilitadores comunitarios están dentro del alcance del prototipo.
- DEC-35. El equipo completo (Karen, Isabella, Juan Manuel y Camila) aprueba por consenso y es responsable de las preguntas abiertas. No hay roles definidos.
- DEC-36. Formato: un archivo Markdown simple para agentes, con parte global y una SPEC por módulo, historias de usuario dentro de cada SPEC y sin diagramas. Aparte, un documento para humanos con los flujos en Mermaid.
- DEC-37. Agudo el mismo día. Para que todos reciban el recordatorio de una hora antes (DEC-23), el mismo día solo se ofrecen ventanas que inicien al menos una hora después del momento de agendar. Deriva de DEC-18 y DEC-23. Afecta: RF-38, BR-17. Aprobada por el equipo (antes OPEN-Q-01).
- DEC-38. Recordatorio de la noche anterior. No se envía si la cita se agenda después de las 21:00 del día anterior, y no aplica a citas del mismo día. El de una hora antes siempre se envía. Deriva de DEC-23. Afecta: RF-55. Aprobada por el equipo (antes OPEN-Q-02).
- DEC-39. Cambio de estado en el recordatorio de una hora antes. Si la nueva prevalidación falla, se cancelan las citas de la fórmula, se liberan existencias y cupos, la fórmula queda no apta y se notifican el motivo y el siguiente paso. Deriva de DEC-23 y CB 9.5. Afecta: RF-57, BR-26. Aprobada por el equipo (antes OPEN-Q-03).
- DEC-40. Medicamento no cubierto por el PBS. Continúa si la EPS simulada lo reporta autorizado; si no, la fórmula queda no apta y se muestran los puntos, enlaces o trámites de la EPS. Esto resuelve una contradicción: una respuesta anterior indicaba terminar el flujo para medicamentos no PBS, y una posterior indica que un medicamento no PBS con autorización separada sí recibe cita. Deriva de DEC-14, DEC-15 y DEC-20. Afecta: RF-29, BR-12. Aprobada por el equipo (antes OPEN-Q-04).
- DEC-41. Clasificación agudo o crónico. Se hace con un catálogo configurable de diagnósticos crónicos cuyo contenido fija el equipo en los datos de prueba; un diagnóstico que no está en el catálogo se trata como agudo. Deriva de DEC-12 y DEC-30. Afecta: RF-30, RF-77, BR-15. Aprobada por el equipo (antes OPEN-Q-05).
- DEC-42. Documento del que no se obtienen los datos. Si el documento es ilegible, está incompleto, no tiene diagnóstico o no coincide con la EPS simulada, se pide cargarlo de nuevo. Si el problema persiste, la fórmula queda no apta y se orienta a la atención presencial. Deriva de DEC-12. Afecta: CL-08, CL-09. Aprobada por el equipo (antes OPEN-Q-06).
- DEC-43. Agrupación de citas. Una cita agrupa todos los medicamentos de la solicitud que se recogen en el mismo punto. Si incluye un medicamento de tratamiento crónico, solo puede ser al día siguiente. La confirmación de todas las citas de una misma fórmula es atómica: se reservan todas o ninguna. Deriva de DEC-18, DEC-20 y DEC-21. Afecta: RF-40, RF-41, BR-18, BR-20. Aprobada por el equipo (antes OPEN-Q-07).
- DEC-44. Pérdida y nueva cita. La pérdida de un medicamento aplica solo si ya se entregó otro medicamento de la misma fórmula. Si no se entregó nada, todo se libera y el usuario puede pedir nueva cita. Obtener una nueva cita siempre requiere iniciar una nueva solicitud. Deriva de DEC-20 y DEC-25. Afecta: RF-47, RF-48, BR-22. Aprobada por el equipo (antes OPEN-Q-08).
- DEC-45. Cierre en el punto. Se registra por medicamento: entregado, o no entregado con motivo del catálogo. Si hay no entregados, se indica que la gestión corresponde a Disfarma. Deriva de DEC-26 y DEC-27. Afecta: RF-64, RF-66. Aprobada por el equipo (antes OPEN-Q-09).
- DEC-46. Vinculación vencida. Se trata como canal no vinculado: no muestra información, no permite gestiones y no recibe notificaciones por ese canal hasta reverificar. Los SMS y correos continúan. Deriva de DEC-10 y CB 18.11. Afecta: BR-07. Aprobada por el equipo (antes OPEN-Q-10).
- DEC-47. Sin ventanas con cupo en los días permitidos, por ejemplo cuando el punto está cerrado al día siguiente. Se informa y se trata igual que sin disponibilidad: espera de 48 horas y recordatorio de revalidación. Deriva de DEC-18 y DEC-25. Afecta: CL-15. Aprobada por el equipo (antes OPEN-Q-11).

## A4. Objetivos

Objetivo general (CB 6.1, ajustado por DEC-03 y DEC-04): diseñar, desarrollar y evaluar, con sistemas externos simulados, un prototipo funcional de pre-dispensación farmacéutica que opere por aplicación web y por Telegram, con apoyo de cuidadores y facilitadores. Debe permitir al paciente conocer antes de desplazarse la validez preliminar de sus fórmulas y la disponibilidad de sus medicamentos, y recibir una cita solo cuando los medicamentos estén reservados. El propósito es reducir el tiempo de espera y los desplazamientos innecesarios frente a una línea base del proceso presencial en Manizales.

Objetivos específicos:

- OE1 (CB 6.2): caracterizar el proceso de dispensación desde la perspectiva del usuario y construir una línea base externa con tiempos de permanencia y causas de espera o rechazo.
- OE2 (CB 6.2, DEC-14, DEC-17): definir y verificar con casos de prueba las reglas de prevalidación de afiliación, vigencia, cobertura PBS, autorización y habilitación de entrega crónica, sobre datos simulados. La prevalidación es preliminar.
- OE3 (CB 6.2, DEC-19): implementar inventario por punto, reserva temporal y agenda por ventanas de 1 hora, de modo que solo exista cita con medicamento reservado, no haya sobre-reserva, se respete la capacidad y las reservas se liberen al cancelar o expirar.
- OE4 (modificado por DEC-25): cuando no haya disponibilidad, informar la espera de 48 horas y enviar un recordatorio único para volver a validar.
- OE5 (CB 6.2): implementar Telegram con consentimiento, verificación de identidad independiente del perfil de Telegram y minimización de datos. El bot solo se comunica después de que el usuario inicia la interacción.
- OE6 (modificado por DEC-04, DEC-17): implementar el canal asistido para cuidadores, facilitadores y dispositivos compartidos, con ruta alterna cuando la identidad no pueda verificarse. La atención presencial sigue disponible.
- OE7 (modificado por DEC-26): permitir al dispensador validar el código, registrar la validación oficial y cerrar la entrega por medicamento, con trazabilidad.
- OE8 (CB 6.2): incorporar protección de datos personales y sensibles desde el diseño, y WCAG 2.1 nivel AA como referencia voluntaria.
- OE9 (modificado por DEC-32): evaluar el prototipo frente a la línea base con las métricas de A14.

## A5. Alcance

### A5.1. Dentro del alcance

- Consentimiento de tratamiento de datos y autorización separada de datos de salud.
- Verificación de identidad por código y ruta alterna.
- Vinculación de chats de Telegram y navegadores web con uno o varios pacientes.
- Carga de fórmulas e historia clínica.
- Prevalidación preliminar de afiliación, vigencia, cobertura PBS, autorización y habilitación de entrega crónica, con datos simulados.
- Clasificación agudo o crónico según el diagnóstico.
- Consulta de disponibilidad por punto con inventario simulado.
- Reserva, agenda por ventanas de 1 hora y código de entrega QR y numérico.
- Cancelación, expiración y liberación de reservas.
- Recordatorios, avisos y notificaciones con minimización de datos.
- Atención en el punto: validación del código, validación oficial y cierre por medicamento.
- Cuidadores, tutores, facilitadores comunitarios y dispositivos compartidos.
- Revocación del consentimiento y eliminación de datos.
- Evaluación del prototipo con las métricas de A14.

### A5.2. Fuera del alcance

- Cita de continuidad (DEC-17).
- Pendientes y ruta de entrega de 48 horas a cargo del sistema (DEC-25).
- Entrega parcial gestionada por el sistema (DEC-26).
- Reprogramación (DEC-22).
- Reporte de concordancia, marcado de reglas para revisión y rol de equipo evaluador (DEC-32).
- Vigilancia automática del inventario o del estado de autorizaciones (DEC-15, DEC-25).
- Trámite de autorizaciones (DEC-15).
- Registro de pacientes, actualización de datos y cambio de medio de contacto (DEC-05, DEC-08).
- Medición SUS, metas de desempeño y plazo de conservación de datos (DEC-32).
- Manejo de fallas de las fuentes simuladas (DEC-32).
- Domicilio y logística domiciliaria (CB 5.2, DEC-32).
- Aplicación móvil instalable y WhatsApp (DEC-02, DEC-03).
- Desabastecimiento estructural, deudas y cartera entre actores, gestión real de inventario del gestor (CB 5.2).
- Validación oficial real de derechos o autorizaciones por la EPS (CB 5.2).
- Integración real con EPS, MIPRES, ADRES, software de auditoría o inventarios reales (CB 5.2).
- Facturación, cobro o conciliación con EPS (CB 5.2).
- Prescripción o modificación de fórmulas (CB 5.2).
- Uso con datos reales de pacientes (CB 5.2).
- Alianzas con EPS (CB 14.2).

## A6. Restricciones

- Equipo de cuatro personas y duración aproximada de 8 semanas (CB 1).
- El equipo no tiene acceso a Disfarma y trabaja desde afuera (CB 5.3).
- La EPS, el inventario y la validación oficial se simulan (CB 5.3).
- Los servicios externos reales son Telegram, el envío de SMS y el envío de correo (DEC-01, DEC-06). La elección de proveedores corresponde a arquitectura.
- La atención presencial permanece disponible aunque el usuario rechace los consentimientos (CB 5.3).
- La línea base se construye con observación externa, encuestas de salida, requisitos publicados, informes de entes de control y derechos de petición (CB 5.3).
- Se prioriza el flujo central y se evita ampliar el alcance (CB 14.1).

## A7. Supuestos del prototipo

- SUP-01. La EPS simulada provee para cada paciente: cédula, EPS, estado de afiliación, celular registrado y correo registrado si existe. Para cada fórmula provee: vigencia, estado de autorización por medicamento y, si es crónica, la fecha habilitada de la próxima entrega.
- SUP-02. El inventario simulado provee las existencias por medicamento y por punto.
- SUP-03. Los puntos atienden a los pacientes con cita en un módulo de turnos agendados. Es una hipótesis operativa no confirmada con Disfarma (CB 14.2); el prototipo no depende de ella para funcionar.
- SUP-04. La validación oficial se simula: el dispensador registra su resultado en el sistema.
- SUP-05. Las fuentes simuladas siempre responden. El manejo de sus fallas está fuera de alcance (DEC-32).
- SUP-06. En los datos de prueba, la vigencia de las fórmulas está entre 8 y 9 meses después de la consulta médica (DEC-13).
- SUP-07. Los datos de contacto de prueba son números y correos de los integrantes del equipo, usados con su consentimiento. Ningún dato corresponde a pacientes reales (DEC-06, CB 11.1).
- SUP-08. Salud Total y Sanitas aplican las mismas reglas (DEC-31).
- SUP-09. El catálogo de cobertura PBS es simulado.

## A8. Actores

- Paciente: afiliado de Salud Total o Sanitas que gestiona sus fórmulas por la web o por Telegram.
- Persona que actúa por el paciente: cuidador, tutor o familiar que recibe el código en el celular o correo del paciente. El sistema no la distingue del paciente (DEC-11).
- Facilitador comunitario: apoya a varias personas. Opera igual que un cuidador y puede tener muchos pacientes vinculados a su chat o navegador (DEC-10, DEC-11).
- Dispensador: personal del punto. Tiene usuario con rol, valida el código, registra la validación oficial y cierra la entrega (DEC-26).
- EPS simulada: fuente de afiliación, contacto, vigencia, autorizaciones y habilitación de entregas crónicas (SUP-01).
- Inventario simulado: fuente de existencias por punto (SUP-02).
- Servicios externos reales: Telegram, SMS y correo. Solo transportan mensajes; no son fuente de identidad.

## A9. Glosario

- Pre-dispensación: gestión previa a la entrega: prevalidación, reserva y cita antes del desplazamiento.
- Solicitud: conjunto de fórmulas y medicamentos de un mismo paciente que se prevalidan y agendan en una misma gestión.
- Fórmula: prescripción que agrupa uno o más medicamentos. Es la unidad de validación todo o nada.
- Prevalidación: verificación preliminar de afiliación, vigencia, cobertura PBS, autorización y habilitación de entrega crónica. No sustituye la validación oficial.
- Validación oficial: la que registra el dispensador en el punto, en representación de la EPS y el gestor.
- Fórmula apta: fórmula que superó todas las verificaciones de la prevalidación.
- Tratamiento agudo o crónico: clasificación de una fórmula según el diagnóstico de la historia clínica.
- Fecha habilitada de entrega: fecha a partir de la cual se puede entregar la siguiente dosis de una fórmula crónica.
- Ventana: bloque de 1 hora en un punto, con capacidad limitada. Equivale a la franja.
- Cita: ventana escogida en un punto para recoger los medicamentos reservados de una solicitud en ese punto.
- Reserva: existencias apartadas para una cita. Se libera al cancelar, al expirar la ventana, al revocar el consentimiento o al detectar un cambio de estado.
- Sobre-reserva: comprometer más existencias o cupos de los disponibles. La meta es cero.
- Código de entrega: código de un solo uso, en QR y numérico, ligado a una cita.
- Vinculación: asociación de un chat de Telegram o un navegador web con un paciente después de verificar su identidad. Vence a los 3 meses.
- Recordatorio de revalidación: aviso único enviado 48 horas después de informar que no había disponibilidad.
- Aviso de próxima entrega: aviso enviado 2 días antes de la fecha habilitada de la siguiente entrega crónica.
- PBS: Plan de Beneficios en Salud.
- UPC: Unidad de Pago por Capitación.
- MIPRES: plataforma de prescripción de tecnologías no financiadas con la UPC.
- RDA: Resumen Digital de Atención.

## A10. Estados

### Fórmula

- Cargada: el documento fue recibido.
- No apta: no superó alguna verificación de la prevalidación o se detectó un cambio de estado antes de la cita. Es un estado final y guarda el motivo.
- Apta: superó la prevalidación.
- Sin disponibilidad: algún medicamento no tiene existencias en ningún punto. Es un estado final y genera el recordatorio de revalidación.
- Agendada: todos sus medicamentos tienen cita confirmada.
- Entregada: todos sus medicamentos quedaron registrados como entregados. Es un estado final.
- Cerrada con medicamentos no entregados: al menos un medicamento quedó como no entregado en el punto, o se perdió por no recogerlo después de recibir otro de la misma fórmula. Es un estado final.
- Liberada: sus citas se cancelaron o expiraron sin que se entregara ningún medicamento. Es un estado final; el usuario puede iniciar una nueva solicitud.

Transiciones:

- Cargada a Apta o No apta: el sistema, al prevalidar.
- Apta a Agendada: el usuario, al confirmar las citas.
- Apta a Sin disponibilidad: el sistema, al no encontrar existencias.
- Agendada a No apta: el sistema, al detectar un cambio de estado en el recordatorio de una hora antes.
- Agendada a Entregada o a Cerrada con medicamentos no entregados: el dispensador, al cerrar la entrega.
- Agendada a Liberada: el usuario al cancelar, o el sistema cuando expiran las ventanas, si no se entregó nada.
- Agendada a Cerrada con medicamentos no entregados: el sistema, cuando se cancela o expira una cita después de que ya se entregó otro medicamento de la misma fórmula.
- Cualquier estado no final a Liberada: el sistema, cuando el titular revoca el consentimiento.

### Cita

- Reservada: existencias y cupo apartados; tiene código de entrega emitido.
- Cumplida: el dispensador validó el código dentro de la ventana.
- Cerrada: el dispensador registró el resultado por medicamento. Es un estado final.
- Cancelada: por el usuario, por revocación del consentimiento o por cambio de estado detectado. Es un estado final.
- Expirada: terminó la ventana sin validación del código. Es un estado final.

### Código de entrega

- Emitido: al confirmar la cita.
- Usado: al validarlo el dispensador. Es un estado final.
- Anulado: cuando la cita se cancela o expira. Es un estado final.

### Vinculación de canal

- Activa: después de verificar la identidad.
- Vencida: a los 3 meses. Se reactiva con un nuevo código.
- Revocada: por el usuario o por revocación del consentimiento. Es un estado final.

## A11. Requisitos no funcionales

- RNF-01. Privacidad. El tratamiento de datos cumple la normativa colombiana aplicable, con la Ley 1581 de 2012 y el Decreto 1377 de 2013 como referencia. Origen: CB 11.1. Se verifica con: revisión de textos de consentimiento, política y flujos.
- RNF-02. Privacidad. El consentimiento general y la autorización de datos de salud son separados, explícitos y voluntarios; la autorización de salud se pide antes de cargar documentos. Origen: CB 11.1. Se verifica con: prueba de flujo.
- RNF-03. Privacidad. Minimización: el sistema solo usa los datos necesarios para prevalidar, agendar y notificar, y usa los documentos cargados solo para la prevalidación. Origen: CB 11.1, DEC-12. Se verifica con: revisión de los datos que se usan en cada paso.
- RNF-04. Privacidad. Ninguna notificación, en ningún canal (web, Telegram, SMS, correo), incluye nombres de medicamentos ni diagnósticos. Los parámetros de los enlaces profundos no incluyen cédula, diagnósticos, medicamentos ni otros datos sensibles. Origen: CB 10.2, DEC-28, DEC-29. Se verifica con: revisión de todas las plantillas de mensaje y enlaces.
- RNF-05. Privacidad. El prototipo no usa datos reales de pacientes. Origen: CB 11.1, SUP-07. Se verifica con: revisión de los datos de prueba.
- RNF-06. Seguridad. La identidad se verifica por un mecanismo independiente del canal; los identificadores de Telegram no son prueba de identidad. Origen: CB 10.2, DEC-06. Se verifica con: prueba de vinculación.
- RNF-07. Seguridad. Solo el dispensador autenticado con su rol puede validar códigos y cerrar entregas. Origen: DEC-26. Se verifica con: prueba de acceso sin rol.
- RNF-08. Trazabilidad. Quedan registrados el consentimiento (quién aceptó, fecha, canal), las verificaciones de identidad, las reservas, cancelaciones, expiraciones, cambios de estado (qué dato cambió y cuándo) y el cierre por medicamento (dispensador, fecha, resultado y motivo). Origen: CB 6.2 OE7, CB 9.5, DEC-09. Se verifica con: revisión de registros después de un escenario completo.
- RNF-09. Integridad. Cero sobre-reservas en pruebas de concurrencia. Nunca existe una cita sin existencias reservadas ni se supera la capacidad de una ventana. Origen: CB 13.2, DEC-21. Se verifica con: prueba de concurrencia.
- RNF-10. Transparencia. La interfaz deja claro que la prevalidación es preliminar, que la validación oficial ocurre en el punto y que la EPS y el inventario son simulados. Origen: CB 14.1, CB 18. Se verifica con: revisión de textos de la interfaz.
- RNF-11. Accesibilidad. La aplicación web cumple WCAG 2.1 nivel AA como referencia voluntaria. Telegram sigue las condiciones de su plataforma. Origen: CB 11.2, DEC-33. Se verifica con: auditoría de accesibilidad de la web.
- RNF-12. Inclusión. Ningún servicio depende de un único canal: existen web, Telegram, canal asistido y atención presencial. Origen: CB 11.2, DEC-04. Se verifica con: revisión de cobertura por canal.
- RNF-13. Compatibilidad. El bot usa la Bot API oficial de Telegram, respeta sus condiciones de uso y no inicia conversación con quien no lo haya contactado. Origen: CB 10.2. Se verifica con: revisión técnica.
- RNF-14. Idioma. La interfaz y los mensajes están en español de Colombia. Origen: DEC-33. Se verifica con: revisión de textos.
- RNF-15. Desempeño. No se fijan metas de tiempo de respuesta, disponibilidad ni escalabilidad para el prototipo. Origen: DEC-32. Se verifica con: no aplica.
- RNF-16. Evaluabilidad. El sistema registra los eventos necesarios para calcular las métricas de A14. Origen: CB 13.2. Se verifica con: cálculo de las métricas con datos de una prueba.

## A12. Flujo de extremo a extremo

1. La persona abre la aplicación web o inicia el bot de Telegram (SPEC-02).
2. El sistema muestra el aviso de privacidad y pide aceptar el tratamiento de datos, con la declaración de titular o tercero. Si no acepta, se le informa la atención presencial y no se registra nada (SPEC-01).
3. La persona ingresa la cédula. El sistema envía un código al celular y al correo registrados en la EPS simulada. Con el código correcto, la identidad queda verificada y el canal queda vinculado. Si falla, se ofrece la ruta alterna (SPEC-01).
4. Si el canal tiene varios pacientes vinculados, la persona escoge para quién gestiona (SPEC-02).
5. El sistema pide la autorización de datos de salud. Si no la da, se le informa la atención presencial (SPEC-01).
6. La persona carga las fórmulas y la historia clínica (SPEC-03).
7. El sistema verifica la afiliación. Si está inactiva, se detiene toda la solicitud y se orienta hacia la EPS (SPEC-03).
8. Por cada fórmula, el sistema verifica vigencia, cobertura PBS y autorización, clasifica el tratamiento según el diagnóstico y, si es crónico, verifica la fecha habilitada de entrega. Cualquier falla deja la fórmula completa como no apta (SPEC-03).
9. El sistema muestra el resultado preliminar por fórmula. Si no hay fórmulas aptas, termina el flujo digital (SPEC-03).
10. Para las fórmulas aptas, el sistema muestra los puntos con existencias. Si una fórmula no tiene existencias en ningún punto, se informa la espera de 48 horas y se programa el recordatorio de revalidación (SPEC-04).
11. La persona escoge punto y ventana en cada punto necesario: agudo, hoy o mañana; crónico, solo mañana (SPEC-04).
12. La persona confirma. El sistema reserva existencias y cupo de forma atómica, emite un código por cita y notifica por todos los medios (SPEC-04, SPEC-05).
13. El sistema envía el recordatorio de la noche anterior, cuando aplica, y el de una hora antes. En este último vuelve a prevalidar; si detecta un cambio de estado, cancela la cita y notifica (SPEC-05).
14. La persona llega dentro de la ventana y muestra el código. El dispensador lo valida, revisa la prevalidación, registra la validación oficial y cierra cada medicamento como entregado o no entregado con motivo (SPEC-06).
15. Si algún medicamento no se entregó, se indica que la gestión corresponde a Disfarma (SPEC-06).
16. Si la fórmula es crónica y se entregó, el sistema envía el aviso de próxima entrega 2 días antes de la siguiente fecha habilitada (SPEC-05).
17. En cualquier momento, la persona puede consultar el estado, cancelar citas, desvincular canales o revocar el consentimiento (SPEC-01, SPEC-02, SPEC-04).

## A13. Contexto normativo

- Ley 1581 de 2012 y Decreto 1377 de 2013: protección de datos personales. Los datos de salud son datos sensibles y requieren autorización explícita del titular. En Pharma Express esto se refleja en DEC-09, RNF-01 y RNF-02.
- Decreto Ley 019 de 2012, artículo 131, y Resolución 1604 de 2013. Las EPS deben entregar los medicamentos de forma completa e inmediata. Cuando la entrega queda incompleta en el momento de la reclamación, deben disponer un mecanismo para entregar lo faltante en máximo 48 horas en el lugar de residencia o trabajo del afiliado, si este lo autoriza; si no lo autoriza, la entrega se hace en sus establecimientos (Res. 1604, art. 1 y art. 7). La obligación es de la EPS y de su red de prestación. En Pharma Express:
  - El sistema no agenda sin existencias reservadas y no gestiona entregas parciales, así que ese mecanismo queda fuera del sistema (DEC-25, DEC-26).
  - No se sabe si Disfarma tiene domicilios. Si en el futuro se confirma, sería una integración nueva que el equipo debe aprobar.
  - La espera de 48 horas que informa Pharma Express cuando no hay disponibilidad es un plazo del producto para volver a validar. No debe presentarse como el cumplimiento de esa norma.
- Decreto Ley 019 de 2012, artículo 120, citado por el contexto base: prohibición de trasladar al usuario trámites para obtener autorizaciones (CB 3.3, CB 17). Por eso Pharma Express solo informa los puntos, enlaces o trámites de la EPS y no pide al usuario tramitar nada (DEC-15).
- Vigencia de las fórmulas: la determina la EPS según la normativa vigente. El sistema usa el dato de la EPS simulada y no aplica la regla histórica de 30 días (CB 3.3, CB 18, DEC-13).
- WCAG 2.1 y Resolución 1519 de 2020 de MinTIC: referencias voluntarias de accesibilidad (CB 17).

## A14. Evaluación del prototipo

Línea base (CB 13.1): observación no participante fuera de los puntos, encuesta de salida, condiciones publicadas por las EPS, informes de entes de control y respuestas a derechos de petición. No se presentan observaciones internas de Disfarma.

Métricas (CB 13.2, ajustadas por DEC-32):

- Tiempo estimado de espera: comparar el escenario del prototipo con la línea base presencial.
- Desplazamientos evitados: viajes innecesarios que se evitarían al detectar novedades antes.
- Novedades detectadas antes del desplazamiento: porcentaje de fórmulas no aptas identificadas por la prevalidación.
- Tasa de éxito por tarea: proporción de personas que completan los flujos principales.
- Sobre-reservas: debe ser cero en pruebas de concurrencia.
- Escenarios asistidos: se resuelven correctamente los casos de cuidador, facilitador, dispositivo compartido y cambio del medio de contacto (orientación hacia la EPS).

Eliminadas: medición SUS y concordancia entre prevalidación y validación oficial (DEC-32).

## A15. Preguntas abiertas

No hay preguntas abiertas. El equipo aprobó las once reglas derivadas que antes figuraban como OPEN-Q-01 a OPEN-Q-11. Quedaron registradas en A3 como DEC-37 a DEC-47.

## A16. Cambios frente al contexto base

- Canales: la aplicación web o móvil pasa a ser solo aplicación web; Telegram tiene flujo completo. Motivo: DEC-03.
- Canal asistido: deja de ser un canal propio y pasa a ser una forma de uso por cuidadores y facilitadores. Motivo: DEC-04.
- Selección de paciente propio o vinculado: se reemplaza por la vinculación de canales a varios pacientes. Motivo: DEC-10, DEC-11.
- Consentimiento registrado del cuidador: se reemplaza por la posesión del código más la declaración de titular o tercero. Motivo: DEC-09, DEC-11.
- Carga de fórmulas desde la EPS simulada: se reemplaza por la carga de documentos por el usuario. Motivo: DEC-12.
- Ruta aguda sin reserva ni cita: el agudo también reserva y agenda. Motivo: DEC-18.
- Tolerancia de 10 minutos: se reemplaza por la ventana de 1 hora. Motivo: DEC-19.
- Recordatorio con confirmación: los recordatorios solo informan y ofrecen cancelar. Motivo: DEC-23.
- Reprogramación: eliminada. Motivo: DEC-22.
- Pendientes, ruta de 48 horas y aviso de llegada del medicamento: se reemplazan por el recordatorio único de revalidación. Motivo: DEC-25.
- Entrega parcial y pendiente en el punto: eliminados. Motivo: DEC-26.
- Cita de continuidad con tiquete impreso: eliminada y reemplazada por el aviso de próxima entrega. Motivo: DEC-17.
- Reporte de concordancia, marcado de reglas y equipo evaluador: eliminados. Motivo: DEC-32.
- SUS: eliminado. Motivo: DEC-32.
- Telegram como único servicio externo real: ahora también lo son SMS y correo. Motivo: DEC-06.
- Paso de verificación PBS no ubicado en el flujo: queda entre vigencia y autorización. Motivo: DEC-14.

## A17. Referencias

- Ley Estatutaria 1581 de 2012: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981
- Decreto 1377 de 2013: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646
- Resolución 1604 de 2013, Ministerio de Salud y Protección Social (texto aportado por el equipo).
- Resolución 4331 de 2012, compilación del Invima: https://normograma.invima.gov.co/compilacion/docs/resolucion_minsaludps_4331_2012.htm
- WCAG 2.1: https://www.w3.org/TR/WCAG21/
- Resolución 1519 de 2020, Anexo 1, MinTIC: https://gobiernodigital.mintic.gov.co/692/articles-160770_Directrices_Accesibilidad_web.pdf
- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram, enlaces profundos: https://core.telegram.org/bots/features
- Telegram, términos para desarrolladores de bots: https://telegram.org/tos/bot-developers
- Telegram, política de privacidad: https://telegram.org/privacy
- Defensoría del Pueblo, 2025-01-29, mesa de trabajo en Manizales: https://www.defensoria.gov.co/-/defensor%C3%ADa-lidera-mesa-de-trabajo-en-manizales-para-garantizar-entrega-oportuna-de-medicamentos-a-afiliados-de-eps-sanitas
- Defensoría del Pueblo, 2026-04-23, tutelas en salud: https://www.defensoria.gov.co/web/guest/-/tutelas-para-invocar-la-proteccion-del-derecho-a-la-salud
- Secretaría de Salud de Manizales, 2026-06-12: https://centrodeinformacion.manizales.gov.co/secretaria-de-salud-de-manizales-mantiene-seguimiento-a-entrega-de-medicamentos-de-las-eps-por-una-atencion-digna-y-oportuna/
- La Patria, 2025-11-18: https://www.lapatria.com/salud/disfarma-bajo-la-lupa-usuarios-sufren-largas-filas-y-problemas-en-el-servicio-de-medicamentos
- La Patria, 2026-06-10: https://www.lapatria.com/salud/crisis-en-disfarma-usuarios-de-esta-eps-enfrentan-largas-filas-y-falta-de-medicamentos-en
- Fundación Luker, 2024, Economía plateada: https://fundacionluker.org.co/wp-content/uploads/2024/04/desarrollo-02-economia-plateada-buenas-practicas-funluker.pdf
- Las demás referencias están en el contexto base, sección 17.

# Parte B. Especificaciones por módulo

Cada SPEC usa las 17 secciones de la guía. Las historias de usuario van en la sección 4. Los RNF globales están en A11; cada SPEC solo indica cuáles aplican.

# SPEC-01. Consentimiento, identidad y derechos del titular

Versión: 1. Estado: aprobado.

## 1. Objetivo

Permitir que solo quien tiene acceso al celular o al correo registrado del paciente en la EPS simulada gestione sus fórmulas, con consentimiento previo del tratamiento de datos y autorización separada para datos de salud, y que el titular pueda revocarlos.

## 2. Contexto

Pharma Express no tiene cuentas de pacientes (DEC-05). La identidad se prueba con un código enviado a los medios registrados en la EPS (DEC-06). Los datos de salud son datos sensibles según la Ley 1581 de 2012 (A13).

## 3. Alcance

Aviso de privacidad, aceptación del tratamiento de datos, ingreso de cédula, envío y verificación del código, ruta alterna, autorización de datos de salud, revocación y eliminación.

## 4. Actores e historias de usuario

Actores: paciente, persona que actúa por el paciente, facilitador, EPS simulada, servicios de SMS y correo.

- HU-01. Como paciente o persona que lo apoya, quiero conocer el aviso de privacidad y aceptarlo antes de dar cualquier dato, para saber cómo se usará la información.
- HU-02. Como paciente o persona que lo apoya, quiero verificar la identidad con un código enviado al celular o correo registrado en la EPS, para gestionar las fórmulas sin ir al punto.
- HU-03. Como paciente o persona que lo apoya, quiero una ruta alterna cuando no recibo el código, para no quedar sin atención.
- HU-04. Como titular, quiero revocar mi consentimiento y pedir que se eliminen mis datos, para ejercer mis derechos.

## 5. Requisitos funcionales

- RF-01. Al iniciar, el sistema debe mostrar el aviso de privacidad y pedir la aceptación del tratamiento de datos antes de solicitar cualquier dato. Origen: CB 9.1, CB 10.2.
- RF-02. La aceptación debe incluir la declaración "soy el titular o actúo con su autorización" y la elección entre titular o tercero. Origen: DEC-09.
- RF-03. El sistema debe registrar si aceptó el titular o un tercero, con fecha, hora y canal. Origen: DEC-09.
- RF-04. Si la persona no acepta, el sistema debe informarle que puede ser atendida de forma presencial y no debe registrar ningún dato. Origen: CB 9.1.
- RF-05. El sistema debe pedir la cédula solo después de la aceptación. Origen: CB 9.1, CB 10.2.
- RF-06. Con la cédula, el sistema debe consultar la EPS simulada y enviar un código de un solo uso por SMS al celular registrado y, si existe, por correo al correo registrado. Origen: DEC-06.
- RF-07. El código debe vencer a los 10 minutos y admitir máximo 3 intentos. Origen: DEC-07.
- RF-08. Con el código correcto, el sistema debe dar por verificada la identidad y vincular el canal según SPEC-02. Origen: CB 10.2, DEC-10.
- RF-09. Si el código vence o se agotan los intentos, el sistema debe anularlo y ofrecer la ruta alterna: solicitar un nuevo código, recibir orientación para actualizar datos en la EPS (contenido configurable por EPS) o acudir a la atención presencial. Después debe volver al ingreso de la cédula. Origen: CB 9.1, DEC-08.
- RF-10. Antes de cualquier carga de documentos, el sistema debe pedir la autorización explícita, voluntaria y separada para el tratamiento de datos de salud. Si no se da, debe informar la atención presencial y no pedir ni guardar datos de salud. Origen: CB 9.1, CB 11.1.
- RF-11. Con la identidad verificada, el sistema debe permitir revocar el consentimiento y pedir la eliminación de los datos, por la web o por Telegram. Origen: DEC-09.
- RF-12. Al revocar, el sistema debe cancelar las citas activas del paciente, anular sus códigos, liberar existencias y cupos, desvincular todos los canales del paciente, eliminar sus datos personales y de salud tratados por el sistema, y confirmar la revocación. Origen: DEC-09.

## 6. Requisitos no funcionales aplicables

RNF-01, RNF-02, RNF-03, RNF-05, RNF-06, RNF-08, RNF-10, RNF-14.

## 7. Reglas de negocio

- BR-01. Sin aceptación del tratamiento de datos no se solicita ni se registra ningún dato. Origen: CB 9.1.
- BR-02. La autorización de datos de salud es separada de la aceptación general y precede a la carga de documentos. Origen: CB 11.1.
- BR-03. La identidad solo se da por verificada con el código correcto, dentro de 10 minutos y en máximo 3 intentos. Origen: DEC-07.
- BR-04. Los identificadores de Telegram no prueban identidad. Origen: CB 10.2.
- BR-05. Pharma Express no crea, modifica ni actualiza datos de pacientes; solo los consulta en la EPS simulada. Origen: DEC-05, DEC-08.
- BR-06. Quien ingresa el código correcto puede actuar en nombre del paciente. Origen: DEC-11.

## 8. Flujo principal

1. La persona abre la web o inicia el bot.
2. El sistema muestra el aviso de privacidad y la declaración de titular o tercero.
3. La persona acepta e indica si es titular o tercero.
4. El sistema registra la aceptación.
5. La persona ingresa la cédula.
6. El sistema envía el código por SMS y, si existe, por correo.
7. La persona ingresa el código dentro de 10 minutos.
8. El sistema verifica la identidad y vincula el canal (SPEC-02).
9. El sistema pide la autorización de datos de salud.
10. La persona autoriza y continúa a SPEC-03.

## 9. Flujos alternativos

- A1. No acepta el tratamiento de datos: se informa la atención presencial; no se registra nada.
- A2. Código incorrecto: se informan los intentos restantes.
- A3. Tercer intento fallido o código vencido: el código se anula y se ofrece la ruta alterna; luego vuelve al paso 5.
- A4. No autoriza datos de salud: se informa la atención presencial; no se piden documentos.
- A5. Revocación: la persona, con identidad verificada, revoca; el sistema aplica RF-12.

## 10. Casos límite

- CL-01. La cédula no existe en la EPS simulada: se informa, se orienta hacia la EPS y se ofrece la atención presencial.
- CL-02. El paciente no tiene celular ni correo registrados: no puede verificarse por canal digital; se orienta hacia la EPS y la atención presencial.
- CL-03. El número registrado es el de un tutor (menor o persona con tutor): el código llega al tutor y el flujo es el mismo (DEC-11).
- CL-04. La persona pide un nuevo código mientras otro sigue vigente: el anterior queda anulado y solo vale el último.

## 11. Criterios de aceptación

- AC-01. Dado que una persona abre la web o inicia el bot, cuando aún no ha aceptado el tratamiento de datos, entonces el sistema no le pide cédula ni ningún otro dato y le muestra el aviso de privacidad.
- AC-02. Dado que la persona no acepta el tratamiento de datos, cuando rechaza, entonces el sistema le informa la atención presencial y no queda ningún registro de ella.
- AC-03. Dado que la persona aceptó como tercero, cuando se consulta el registro, entonces aparecen la condición de tercero, la fecha, la hora y el canal.
- AC-04. Dado que la persona aceptó e ingresó una cédula existente, cuando el sistema envía el código, entonces llega un SMS al celular registrado y un correo al correo registrado, si existe.
- AC-05. Dado un código enviado hace menos de 10 minutos, cuando la persona lo ingresa correctamente, entonces la identidad queda verificada.
- AC-06. Dado un código enviado hace más de 10 minutos, cuando la persona lo ingresa, entonces el sistema lo rechaza y ofrece la ruta alterna.
- AC-07. Dado que la persona falló dos intentos, cuando falla el tercero, entonces el código se anula y se ofrece la ruta alterna.
- AC-08. Dado que la identidad está verificada, cuando la persona no autoriza el tratamiento de datos de salud, entonces el sistema no le pide documentos y le informa la atención presencial.
- AC-09. Dado un paciente con una cita reservada, cuando revoca el consentimiento, entonces la cita queda cancelada, el código anulado, las existencias y el cupo quedan disponibles para otro paciente y sus canales quedan desvinculados.
- AC-10. Dado que se envió un código, cuando se revisa el SMS y el correo, entonces no contienen nombres de medicamentos ni diagnósticos.

## 12. Dependencias

EPS simulada (SUP-01); servicios reales de SMS y correo (A6); SPEC-02 para la vinculación; SPEC-08 para el contenido configurable por EPS.

## 13. Restricciones

Globales (A6). El envío de SMS y correo es real y las pruebas usan contactos de los integrantes del equipo (SUP-07).

## 14. Fuera de alcance

Registro de pacientes, actualización de datos y cambio de medio de contacto (DEC-05, DEC-08). Plazo de conservación de datos (DEC-32).

## 15. Preguntas abiertas

Ninguna.

## 16. Trazabilidad

- HU-01: RF-01, RF-02, RF-03, RF-04, RF-10; BR-01, BR-02; AC-01, AC-02, AC-03, AC-08.
- HU-02: RF-05, RF-06, RF-07, RF-08; BR-03, BR-04, BR-05, BR-06; AC-04, AC-05, AC-10; CL-03.
- HU-03: RF-09; BR-03; AC-06, AC-07; CL-01, CL-02, CL-04.
- HU-04: RF-11, RF-12; AC-09.

## 17. Historial de cambios

- Versión 1: creación con DEC-05 a DEC-11.

# SPEC-02. Canales, vinculación y selección de paciente

Versión: 1. Estado: aprobado.

## 1. Objetivo

Permitir que la web y Telegram ofrezcan el flujo completo, que un chat o navegador quede vinculado a uno o varios pacientes y que siempre sea explícito para quién se está gestionando.

## 2. Contexto

Telegram es un canal real, pero no es fuente de identidad (CB 2.2). Un bot no puede iniciar una conversación con quien nunca lo contactó (CB 10.2). Cuidadores y facilitadores gestionan a varios pacientes desde un mismo chat o navegador (DEC-10).

## 3. Alcance

Inicio del bot, política de privacidad del bot, vinculación y desvinculación de canales, vencimiento a los 3 meses, selección de paciente, enlaces profundos y consulta de estado.

## 4. Actores e historias de usuario

Actores: paciente, persona que actúa por el paciente, facilitador, Telegram.

- HU-05. Como paciente, quiero hacer todo el proceso por Telegram o por la web, para usar el canal que me resulte más fácil.
- HU-06. Como cuidador o facilitador, quiero tener a varios pacientes vinculados a mi chat o navegador y escoger para quién gestiono, para no mezclar las gestiones de distintas personas.
- HU-07. Como paciente, quiero consultar en cualquier momento el estado de mis fórmulas, mis citas y el código de entrega, para saber qué hacer sin llamar ni ir al punto.

## 5. Requisitos funcionales

- RF-13. La web y el bot deben permitir el flujo completo: verificar identidad, vincular el canal, cargar documentos, prevalidar, agendar, consultar el estado, ver el código de entrega, cancelar, desvincular y revocar. Origen: DEC-03.
- RF-14. El bot solo debe interactuar después de que la persona lo inicie voluntariamente. Origen: CB 10.2.
- RF-15. El bot debe publicar o enlazar una política de privacidad accesible que explique qué datos recopila, para qué, cómo se conservan y cómo solicitar su eliminación. Origen: CB 10.2.
- RF-16. Después de verificar la identidad, el sistema debe vincular el chat de Telegram o el navegador web con el paciente. Origen: CB 10.2, DEC-10.
- RF-17. Un mismo chat o navegador debe poder vincularse a varios pacientes, sin límite. Origen: DEC-10.
- RF-18. Si el chat o navegador tiene más de un paciente vinculado, el sistema debe exigir que se escoja el paciente antes de cualquier gestión y mostrar durante toda la gestión cuál es el paciente escogido. Origen: CB 10.3, DEC-10.
- RF-19. Cada vinculación debe vencer a los 3 meses. Para reactivarla, el sistema debe exigir un nuevo código (SPEC-01). Origen: DEC-10.
- RF-20. El sistema debe permitir desvincular un paciente de un chat o navegador. Origen: CB 10.2.
- RF-21. La web debe ofrecer un enlace profundo para abrir el bot. Sus parámetros no deben contener cédula, diagnósticos, medicamentos ni otros datos sensibles. Origen: CB 10.2, DEC-29.
- RF-22. El sistema debe mostrar, dentro del flujo autenticado, el estado de cada fórmula, las citas con su punto y ventana, y el código de entrega en QR y numérico. Origen: CB 10.1, DEC-24.

## 6. Requisitos no funcionales aplicables

RNF-04, RNF-06, RNF-11, RNF-12, RNF-13, RNF-14.

## 7. Reglas de negocio

- BR-07. Una vinculación vencida se trata como canal no vinculado: no muestra información, no permite gestiones y no recibe notificaciones por ese canal hasta reverificar. Los SMS y correos continúan. Origen: DEC-46.
- BR-08. Los nombres de medicamentos y los diagnósticos solo se muestran dentro del flujo autenticado, con autorización de datos de salud vigente. Origen: CB 10.2.
- BR-09. Por Telegram no se envía ningún mensaje antes de que la persona haya iniciado el bot y su chat esté vinculado a una identidad verificada. Origen: CB 18.

## 8. Flujo principal

1. La persona inicia el bot o abre la web.
2. Si el canal ya tiene vinculaciones activas, el sistema muestra los pacientes vinculados y pide escoger uno o agregar otro.
3. Para agregar un paciente, se sigue SPEC-01 y el canal queda vinculado.
4. Con el paciente escogido, la persona continúa con la gestión (SPEC-03, SPEC-04) o consulta el estado.

## 9. Flujos alternativos

- A1. Vinculación vencida: el sistema pide un nuevo código antes de continuar.
- A2. Desvinculación: la persona escoge el paciente y lo desvincula; el canal deja de recibir notificaciones de ese paciente.
- A3. Desde la web, la persona usa el enlace profundo para continuar en Telegram; en Telegram se verifica la identidad según SPEC-01.

## 10. Casos límite

- CL-05. Un paciente vinculado revoca su consentimiento desde otro canal: desaparece de la lista de todos los canales donde estaba vinculado.
- CL-06. La persona bloquea el bot: no recibe mensajes por Telegram; los demás canales siguen funcionando.
- CL-07. Dos personas vinculan a un mismo paciente desde canales distintos: ambas vinculaciones son válidas y ambas reciben notificaciones.

## 11. Criterios de aceptación

- AC-11. Dado que una persona nunca ha iniciado el bot, cuando se revisa el sistema, entonces no se le ha enviado ningún mensaje por Telegram.
- AC-12. Dado que la identidad se verificó en Telegram, cuando se consulta la vinculación, entonces el chat está asociado al paciente y la verificación no dependió del user_id, chat_id, username ni del nombre visible.
- AC-13. Dado un chat con tres pacientes vinculados, cuando la persona quiere gestionar, entonces el sistema exige escoger uno y lo muestra en cada paso.
- AC-14. Dado un chat con un paciente vinculado hace más de 3 meses, cuando la persona intenta gestionar o consultar, entonces el sistema pide un nuevo código.
- AC-15. Dado un chat con la vinculación vencida, cuando se envía un recordatorio de ese paciente, entonces no llega por Telegram, pero sí llega por SMS y por correo.
- AC-16. Dado un enlace profundo generado por la web, cuando se revisan sus parámetros, entonces no contiene cédula, medicamentos, diagnósticos ni otros datos sensibles.
- AC-17. Dado un paciente desvinculado de un navegador, cuando se envía una notificación de ese paciente, entonces no llega a ese navegador.
- AC-18. Dado un paciente con una cita confirmada, cuando consulta el estado por la web o por Telegram, entonces ve el punto, la ventana y el código en QR y numérico.

## 12. Dependencias

SPEC-01 para la verificación de identidad; Telegram Bot API (RNF-13).

## 13. Restricciones

Condiciones de uso de la plataforma Telegram (CB 10.2).

## 14. Fuera de alcance

Aplicación móvil instalable y WhatsApp (DEC-02, DEC-03).

## 15. Preguntas abiertas

Ninguna.

## 16. Trazabilidad

- HU-05: RF-13, RF-14, RF-15, RF-21; BR-09; AC-11, AC-12, AC-16; CL-06.
- HU-06: RF-16, RF-17, RF-18, RF-19, RF-20; BR-07; AC-13, AC-14, AC-15, AC-17; CL-05, CL-07.
- HU-07: RF-22; BR-08; AC-18.

## 17. Historial de cambios

- Versión 1: creación con DEC-03, DEC-10 y DEC-29.

# SPEC-03. Carga de documentos y prevalidación

Versión: 1. Estado: aprobado.

## 1. Objetivo

Que el paciente sepa antes de desplazarse, fórmula por fórmula, si su solicitud cumple preliminarmente los requisitos de afiliación, vigencia, cobertura PBS, autorización y habilitación de entrega crónica.

## 2. Contexto

Hoy estas validaciones ocurren en la ventanilla (CB 3.1). En el prototipo se hacen con datos simulados (SUP-01, SUP-09) y son siempre preliminares (RNF-10). El usuario carga los documentos (DEC-12).

## 3. Alcance

Carga de fórmulas e historia clínica, obtención de los datos necesarios, verificaciones en orden, clasificación agudo o crónico, resultado por fórmula y orientación ante cada motivo de no aptitud.

## 4. Actores e historias de usuario

Actores: paciente, persona que actúa por el paciente, EPS simulada.

- HU-08. Como paciente, quiero cargar mis fórmulas y mi historia clínica desde la web o Telegram, para que se revisen sin ir al punto.
- HU-09. Como paciente, quiero saber antes de desplazarme si cada fórmula cumple los requisitos, para no hacer una fila inútil.
- HU-10. Como paciente, quiero que, cuando una fórmula no cumpla, se me diga el motivo y qué hacer, por ejemplo dónde gestionar la autorización con mi EPS, para resolverlo por el camino correcto.

## 5. Requisitos funcionales

- RF-23. Con la autorización de datos de salud, el sistema debe pedir la carga de las fórmulas y de la historia clínica, en foto o PDF, por la web o por Telegram. Origen: DEC-12.
- RF-24. Una solicitud debe admitir varias fórmulas del mismo paciente. Origen: DEC-16.
- RF-25. El sistema debe obtener de los documentos los medicamentos de cada fórmula y el diagnóstico. El mecanismo corresponde a arquitectura. Origen: DEC-12.
- RF-26. El sistema debe verificar primero la afiliación activa en la EPS simulada. Si está inactiva, debe detener toda la solicitud y orientar hacia la EPS. Origen: CB 9.2, DEC-14.
- RF-27. Por cada fórmula, el sistema debe verificar la vigencia con el dato de la EPS simulada. Si no está vigente, la fórmula queda no apta y se indica que se requiere una nueva valoración médica. Origen: CB 9.2, DEC-13.
- RF-28. Por cada medicamento, el sistema debe verificar la cobertura PBS con el catálogo simulado. Origen: DEC-14, SUP-09.
- RF-29. Por cada medicamento, el sistema debe verificar en la EPS simulada si requiere autorización y si la tiene. Un medicamento no cubierto por el PBS continúa solo si está autorizado. Si falta una autorización, la fórmula queda no apta y el sistema muestra los puntos, enlaces o trámites de autorización de la EPS del paciente. Origen: DEC-15, DEC-40.
- RF-30. El sistema debe clasificar cada fórmula como aguda o crónica según el diagnóstico, usando el catálogo configurable de diagnósticos crónicos. Origen: DEC-12, DEC-41.
- RF-31. Para cada fórmula crónica, el sistema debe verificar que la fecha habilitada de la próxima entrega sea igual o anterior a la fecha de la cita posible (el día siguiente). Si no lo es, la fórmula queda no apta y se informa la fecha habilitada. Origen: DEC-17.
- RF-32. Si cualquier verificación falla para un medicamento, toda su fórmula queda no apta. Las demás fórmulas se evalúan de forma independiente. Origen: DEC-16.
- RF-33. El sistema debe mostrar el resultado por fórmula (apta, o no apta con motivo y siguiente paso) e indicar que el resultado es preliminar y que la validación oficial ocurre en el punto. Origen: CB 8.2, RNF-10.
- RF-34. Si hay al menos una fórmula apta, el sistema debe continuar a disponibilidad solo con las aptas e indicar que las no aptas pueden gestionarse con la EPS. Origen: DEC-16.
- RF-35. Si ninguna fórmula es apta, el sistema debe terminar el flujo digital mostrando los motivos y los siguientes pasos. Origen: CB 9.2.

## 6. Requisitos no funcionales aplicables

RNF-02, RNF-03, RNF-05, RNF-08, RNF-10, RNF-16.

## 7. Reglas de negocio

- BR-10. El orden de verificación es: afiliación (una vez por solicitud), vigencia (por fórmula), cobertura PBS (por medicamento), autorización (por medicamento), habilitación de entrega (solo fórmulas crónicas). Origen: DEC-14, DEC-17.
- BR-11. Cada fórmula es todo o nada; las fórmulas separadas son independientes. Origen: DEC-16.
- BR-12. Un medicamento no cubierto por el PBS requiere autorización para continuar. Origen: DEC-40.
- BR-13. La vigencia es un dato de la EPS simulada; no se aplica una regla fija de 30 días. Origen: DEC-13, CB 18.
- BR-14. El sistema no tramita autorizaciones ni vigila su estado; el usuario vuelve a consultar por su cuenta. Origen: DEC-15.
- BR-15. Un diagnóstico que está en el catálogo de crónicos clasifica la fórmula como crónica; cualquier otro, como aguda. Origen: DEC-41.
- BR-16. Toda prevalidación es preliminar y no sustituye la validación oficial. Origen: CB 8.2.

## 8. Flujo principal

1. La persona carga las fórmulas y la historia clínica.
2. El sistema obtiene los medicamentos por fórmula y el diagnóstico.
3. El sistema verifica la afiliación.
4. Por cada fórmula: vigencia; por cada medicamento: PBS y autorización; clasificación agudo o crónico; si es crónica, habilitación de entrega.
5. El sistema muestra el resultado preliminar por fórmula.
6. Las fórmulas aptas continúan a SPEC-04.

## 9. Flujos alternativos

- A1. Afiliación inactiva: se detiene toda la solicitud y se orienta hacia la EPS.
- A2. Fórmula no vigente: la fórmula queda no apta y se indica una nueva valoración médica.
- A3. Falta autorización: la fórmula queda no apta y se muestran los puntos, enlaces o trámites de la EPS.
- A4. Fórmula crónica aún no habilitada: la fórmula queda no apta y se informa la fecha habilitada.
- A5. Ninguna fórmula apta: termina el flujo digital con los motivos.

## 10. Casos límite

- CL-08. Documento ilegible, incompleto o sin diagnóstico: se pide cargarlo de nuevo; si persiste, la fórmula queda no apta y se orienta a la atención presencial (DEC-42).
- CL-09. Fórmula cargada que no coincide con ningún registro de la EPS simulada: mismo tratamiento que CL-08 (DEC-42).
- CL-10. Solicitud mixta con una fórmula aguda y otra crónica: cada una se clasifica y se evalúa por separado.
- CL-11. Fórmula con un medicamento PBS y otro no PBS sin autorización: toda la fórmula queda no apta.
- CL-12. Fórmula crónica cuya fecha habilitada es exactamente el día siguiente: es apta, porque la cita crónica es al día siguiente.

## 11. Criterios de aceptación

- AC-19. Dado que la persona no ha dado la autorización de datos de salud, cuando intenta cargar documentos, entonces el sistema no lo permite.
- AC-20. Dado un paciente con afiliación inactiva en la EPS simulada, cuando prevalida, entonces toda la solicitud se detiene y se muestra la orientación hacia la EPS.
- AC-21. Dada una fórmula con vigencia vencida en la EPS simulada, cuando se prevalida, entonces queda no apta con el motivo "fórmula no vigente" y la indicación de nueva valoración médica.
- AC-22. Dada una fórmula con tres medicamentos, uno de ellos sin autorización, cuando se prevalida, entonces toda la fórmula queda no apta y se muestran los puntos, enlaces o trámites de la EPS del paciente.
- AC-23. Dadas dos fórmulas, una apta y otra no apta, cuando termina la prevalidación, entonces la apta continúa a disponibilidad y para la no apta se indica que puede gestionarse con la EPS.
- AC-24. Dado un medicamento no cubierto por el PBS y autorizado en la EPS simulada, cuando se prevalida, entonces no bloquea su fórmula.
- AC-25. Dado un diagnóstico que está en el catálogo de crónicos, cuando se clasifica la fórmula, entonces queda como crónica.
- AC-26. Dada una fórmula crónica con fecha habilitada dentro de cinco días, cuando se prevalida, entonces queda no apta y se informa la fecha habilitada.
- AC-27. Dado cualquier resultado de prevalidación, cuando se muestra, entonces incluye el aviso de que es preliminar y de que la validación oficial ocurre en el punto.
- AC-28. Dado que ninguna fórmula es apta, cuando termina la prevalidación, entonces el flujo digital termina con los motivos y siguientes pasos, sin ofrecer disponibilidad.
- AC-29. Dada la afiliación verificada, cuando se prevalidan las fórmulas, entonces la cobertura PBS se verifica después de la vigencia y antes de la autorización.
- AC-30. Dado un documento ilegible, cuando el sistema no obtiene los datos, entonces pide cargarlo de nuevo.

## 12. Dependencias

EPS simulada (SUP-01); catálogo PBS simulado (SUP-09); catálogo de diagnósticos crónicos y contenido por EPS (SPEC-08); SPEC-01 por la autorización de datos de salud.

## 13. Restricciones

La lectura de documentos debe ser realizable por el equipo en 8 semanas (A6). Solo se usan documentos de prueba (RNF-05).

## 14. Fuera de alcance

Trámite y vigilancia de autorizaciones (DEC-15); validación oficial real (CB 5.2); prescripción o modificación de fórmulas (CB 5.2); integración con MIPRES (CB 5.2).

## 15. Preguntas abiertas

Ninguna.

## 16. Trazabilidad

- HU-08: RF-23, RF-24, RF-25; AC-19, AC-30; CL-08, CL-09.
- HU-09: RF-26, RF-27, RF-28, RF-30, RF-31, RF-32, RF-33, RF-34; BR-10, BR-11, BR-12, BR-13, BR-15, BR-16; AC-20, AC-21, AC-23, AC-24, AC-25, AC-26, AC-27, AC-29; CL-10, CL-11, CL-12.
- HU-10: RF-29, RF-35; BR-14; AC-22, AC-28.

## 17. Historial de cambios

- Versión 1: creación con DEC-12 a DEC-17.

# SPEC-04. Disponibilidad, reserva y agenda

Versión: 1. Estado: aprobado.

## 1. Objetivo

Que el paciente solo reciba una cita cuando sus medicamentos estén reservados en un punto y haya cupo en la ventana escogida, sin sobre-reservas.

## 2. Contexto

Es el diferenciador del producto: prevalidación más reserva antes de la cita (CB 2). Aplica a tratamientos agudos y crónicos (DEC-18).

## 3. Alcance

Consulta de existencias por punto, ventanas permitidas, citas por punto, confirmación atómica, código de entrega, cancelación, expiración, pérdida y sin disponibilidad.

## 4. Actores e historias de usuario

Actores: paciente, persona que actúa por el paciente, inventario simulado.

- HU-11. Como paciente, quiero ver en qué puntos están mis medicamentos y escoger una ventana con cupo, para ir solo cuando estén reservados para mí.
- HU-12. Como paciente con medicamentos en puntos distintos, quiero escoger una cita en cada punto, para recibir todo lo formulado.
- HU-13. Como paciente, quiero cancelar mi cita en cualquier momento, para liberar el medicamento si no puedo ir.
- HU-14. Como paciente sin disponibilidad, quiero saber cuándo volver a intentar, para no desplazarme en vano.

## 5. Requisitos funcionales

- RF-36. Para las fórmulas aptas, el sistema debe consultar el inventario simulado y mostrar los puntos con existencias de cada medicamento. Origen: CB 9.3.
- RF-37. El sistema debe ofrecer solo ventanas con cupo. Origen: CB 9.3.
- RF-38. Para una cita que solo incluye medicamentos de tratamiento agudo, el sistema debe ofrecer ventanas del mismo día que inicien al menos una hora después del momento de agendar, y ventanas del día siguiente. Para una cita que incluye un medicamento de tratamiento crónico, solo ventanas del día calendario siguiente. Origen: DEC-18, DEC-37, DEC-43.
- RF-39. Si los medicamentos no están todos en un mismo punto, el sistema debe informarlo y permitir escoger una cita en cada punto necesario. Origen: DEC-20.
- RF-40. Cada cita debe agrupar los medicamentos de la solicitud que se recogen en ese punto. Origen: DEC-43.
- RF-41. Al confirmar, el sistema debe reservar las existencias y el cupo de forma atómica. Todas las citas de una misma fórmula se confirman juntas o ninguna. Si otra persona confirmó antes, el sistema debe informarlo y mostrar las opciones actualizadas. Origen: DEC-21, DEC-43.
- RF-42. Por cada cita confirmada, el sistema debe emitir un código de entrega de un solo uso, en QR y numérico. Origen: DEC-24.
- RF-43. Al confirmar, el sistema debe enviar la notificación de confirmación según SPEC-05. Origen: DEC-28.
- RF-44. Si algún medicamento de una fórmula apta no tiene existencias en ningún punto, la fórmula no se agenda. El sistema debe informar que se deben esperar 48 horas para volver a validar y programar el recordatorio de revalidación (SPEC-05). Origen: DEC-25.
- RF-45. El usuario debe poder cancelar una cita en cualquier momento antes de su validación. La cancelación anula el código y libera existencias y cupo de inmediato. Origen: DEC-22.
- RF-46. Una cita debe expirar al terminar su ventana si el código no fue validado. La expiración anula el código y libera existencias y cupo. Origen: DEC-19.
- RF-47. Si una cita se cancela o expira después de que ya se entregó otro medicamento de la misma fórmula, el medicamento no recogido se pierde, la fórmula queda cerrada con medicamentos no entregados y se notifica al usuario. Origen: DEC-20, DEC-44.
- RF-48. Si una cita se cancela o expira y no se había entregado nada de esa fórmula, la fórmula queda liberada y el usuario puede pedir una nueva cita iniciando una nueva solicitud. Origen: DEC-20, DEC-44.

## 6. Requisitos no funcionales aplicables

RNF-08, RNF-09, RNF-10, RNF-16.

## 7. Reglas de negocio

- BR-17. Agudo: cita el mismo día (desde una hora después de agendar) o el día siguiente. Crónico: solo el día calendario siguiente. Origen: DEC-18, DEC-37.
- BR-18. Si una cita incluye al menos un medicamento de tratamiento crónico, aplica la regla del crónico. Origen: DEC-43.
- BR-19. No existe cita sin existencias reservadas ni con la capacidad de la ventana superada. Origen: CB 18, RNF-09.
- BR-20. La reserva es por solicitud. Las citas de una misma fórmula se confirman todas o ninguna. Origen: DEC-20, DEC-43.
- BR-21. La ventana dura 1 hora; la reserva expira al terminar la ventana. Origen: DEC-19.
- BR-22. Si ya se entregó parte de una fórmula, lo que no se recoja de esa fórmula se pierde. Si no se entregó nada, todo se libera. Origen: DEC-20, DEC-44.
- BR-23. No hay reprogramación: para otra fecha, el usuario cancela e inicia una nueva solicitud. Origen: DEC-22, DEC-44.
- BR-24. Sin disponibilidad no se crea un pendiente ni se vigila el inventario. Origen: DEC-25.

## 8. Flujo principal

1. El sistema muestra los puntos con existencias para las fórmulas aptas.
2. La persona escoge el punto o los puntos.
3. Por cada punto, la persona escoge una ventana con cupo dentro de los días permitidos.
4. La persona confirma.
5. El sistema reserva de forma atómica y emite un código por cita.
6. El sistema envía la confirmación por todos los medios (SPEC-05).

## 9. Flujos alternativos

- A1. Sin existencias en ningún punto para una fórmula: no se agenda esa fórmula; se informa la espera de 48 horas y se programa el recordatorio.
- A2. Otra persona confirmó antes: se informa y se muestran las opciones actualizadas.
- A3. Cancelación por el usuario: se anula el código y se libera; aplica RF-47 o RF-48.
- A4. Expiración de la ventana: se anula el código y se libera; aplica RF-47 o RF-48.

## 10. Casos límite

- CL-13. Dos personas confirman al mismo tiempo la última unidad de un medicamento: solo una obtiene la reserva; la otra recibe el aviso y opciones actualizadas.
- CL-14. Dos personas confirman al mismo tiempo el último cupo de una ventana: solo una obtiene la cita.
- CL-15. No hay ventanas con cupo en los días permitidos, por ejemplo porque el punto está cerrado al día siguiente: se informa y se trata igual que sin disponibilidad (DEC-47).
- CL-16. Una fórmula tiene el medicamento A en el punto 1 y el B en el punto 2: se crean dos citas y se confirman juntas.
- CL-17. El paciente recoge A en el punto 1 y no llega al punto 2 por B, de la misma fórmula: B se pierde y la fórmula se cierra.
- CL-18. El paciente no llega a ninguna de las citas de una fórmula: todo se libera y puede iniciar una nueva solicitud.

## 11. Criterios de aceptación

- AC-31. Dada una fórmula apta, cuando se consulta la disponibilidad, entonces solo se muestran puntos con existencias de sus medicamentos.
- AC-32. Dada una ventana sin cupo, cuando la persona busca ventanas, entonces esa ventana no aparece.
- AC-33. Dada una fórmula crónica, cuando se muestran las ventanas, entonces solo aparecen ventanas del día calendario siguiente.
- AC-34. Dada una fórmula aguda y la hora actual 14:20, cuando se muestran las ventanas del mismo día, entonces la primera ventana ofrecida inicia a las 15:20 o después.
- AC-35. Dados los medicamentos de una fórmula en dos puntos, cuando la persona confirma, entonces se reservan las dos citas o ninguna.
- AC-36. Dadas 50 confirmaciones simultáneas sobre 10 unidades, cuando terminan, entonces hay 10 reservas como máximo y ninguna sobre-reserva.
- AC-37. Dada una cita confirmada, cuando se consulta, entonces tiene un código de un solo uso en QR y numérico.
- AC-38. Dada una cita reservada, cuando el usuario la cancela, entonces el código queda anulado y las existencias y el cupo aparecen disponibles para otra persona.
- AC-39. Dada una cita cuya ventana terminó sin validación del código, cuando se revisa, entonces está expirada, el código anulado y las existencias liberadas.
- AC-40. Dado que el paciente recibió A de una fórmula y la cita de B, de la misma fórmula, expiró, cuando se revisa la fórmula, entonces está cerrada con medicamentos no entregados y se notificó al usuario.
- AC-41. Dado un medicamento sin existencias en ningún punto, cuando se consulta la disponibilidad, entonces se informa la espera de 48 horas y queda programado un único recordatorio.
- AC-42. Dada una cita cancelada, cuando la persona quiere otra fecha, entonces el sistema no ofrece reprogramar y le indica iniciar una nueva solicitud.

## 12. Dependencias

Inventario simulado (SUP-02); parámetros de puntos (SPEC-08); SPEC-03 por las fórmulas aptas; SPEC-05 por las notificaciones.

## 13. Restricciones

Globales (A6).

## 14. Fuera de alcance

Pendientes, reprogramación y vigilancia del inventario (DEC-22, DEC-25, DEC-32).

## 15. Preguntas abiertas

Ninguna.

## 16. Trazabilidad

- HU-11: RF-36, RF-37, RF-38, RF-41, RF-42, RF-43; BR-17, BR-18, BR-19, BR-21; AC-31, AC-32, AC-33, AC-34, AC-36, AC-37; CL-13, CL-14, CL-15.
- HU-12: RF-39, RF-40, RF-47; BR-20, BR-22; AC-35, AC-40; CL-16, CL-17.
- HU-13: RF-45, RF-46, RF-48; BR-23; AC-38, AC-39, AC-42; CL-18.
- HU-14: RF-44; BR-24; AC-41.

## 17. Historial de cambios

- Versión 1: creación con DEC-18 a DEC-22, DEC-24 y DEC-25.

# SPEC-05. Notificaciones y recordatorios

Versión: 1. Estado: aprobado.

## 1. Objetivo

Mantener informado al paciente por todos sus medios registrados o vinculados, sin exponer datos de salud, y detectar cambios de estado antes de que se desplace.

## 2. Contexto

Las notificaciones sustituyen la incertidumbre de la fila (CB 2.1). Deben aplicar minimización en todos los canales (DEC-28). El sistema no vigila inventario ni autorizaciones (DEC-15, DEC-25).

## 3. Alcance

Confirmación, recordatorio de la noche anterior, recordatorio de una hora antes con nueva prevalidación, cancelación, expiración, pérdida, recordatorio de revalidación a las 48 horas y aviso de próxima entrega crónica.

## 4. Actores e historias de usuario

Actores: paciente, persona que actúa por el paciente, facilitador, Telegram, SMS, correo.

- HU-15. Como paciente, quiero recibir la confirmación y los recordatorios de mi cita por todos mis medios, para no olvidarla.
- HU-16. Como paciente, quiero saber antes de salir si algo cambió en mi afiliación, vigencia o autorización, para no desplazarme en vano.
- HU-17. Como paciente con tratamiento crónico, quiero que se me avise cuando se acerca mi siguiente entrega, para no interrumpir el tratamiento.

## 5. Requisitos funcionales

- RF-49. El sistema debe enviar cada notificación por todos los medios del paciente: notificación de la web a los navegadores vinculados, Telegram a los chats vinculados, SMS al celular registrado y correo al correo registrado, si existe. Origen: DEC-28.
- RF-50. El sistema debe enviar notificaciones de: confirmación de cita, recordatorio de la noche anterior, recordatorio de una hora antes, cancelación, expiración, pérdida de medicamento, recordatorio de revalidación y aviso de próxima entrega. Origen: CB 12, DEC-17, DEC-23, DEC-25.
- RF-51. Ninguna notificación debe incluir nombres de medicamentos ni diagnósticos. Pueden incluir el punto, la fecha, la ventana y la instrucción de consultar el detalle dentro del flujo autenticado. Origen: DEC-28, RNF-04.
- RF-52. Los recordatorios solo deben informar y ofrecer cancelar; no deben pedir confirmación. Origen: DEC-23.
- RF-53. Si el recordatorio ofrece cancelar, la cancelación debe hacerse dentro del flujo autenticado del canal. Origen: DEC-22, BR-08.
- RF-54. El sistema debe enviar un recordatorio una hora antes de cada cita, a todos los pacientes. Origen: DEC-23.
- RF-55. Para citas del día siguiente, el sistema debe enviar un recordatorio entre las 19:00 y las 21:00 del día anterior, salvo que la cita se haya agendado después de las 21:00 de ese día. Origen: DEC-23, DEC-38.
- RF-56. Al enviar el recordatorio de una hora antes, el sistema debe volver a verificar en la EPS simulada la afiliación, la vigencia y las autorizaciones de las fórmulas de la cita. Origen: DEC-23.
- RF-57. Si la nueva verificación detecta un cambio, el sistema debe cancelar las citas de la fórmula afectada, anular sus códigos, liberar existencias y cupos, dejar la fórmula como no apta, registrar qué dato cambió y cuándo, y notificar el motivo y el siguiente paso. Origen: CB 9.5, DEC-39.
- RF-58. El sistema debe enviar un único recordatorio de revalidación 48 horas después de informar que no había disponibilidad, y un aviso de próxima entrega 2 días antes de la siguiente fecha habilitada de cada fórmula crónica entregada. Origen: DEC-17, DEC-25.

## 6. Requisitos no funcionales aplicables

RNF-04, RNF-08, RNF-12, RNF-13, RNF-14.

## 7. Reglas de negocio

- BR-25. Minimización en todos los canales: sin medicamentos ni diagnósticos. Origen: DEC-28.
- BR-26. Un cambio de estado detectado antes de la cita cancela la cita y deja la fórmula como no apta. Origen: DEC-39.
- BR-27. El recordatorio de revalidación se envía una sola vez; después, el usuario gestiona por su cuenta. Origen: DEC-25.
- BR-28. El sistema no avisa cuando llega un medicamento ni cuando la EPS autoriza, porque no vigila esos estados. Origen: DEC-15, DEC-25.

## 8. Flujo principal

1. Al confirmar la cita, el sistema envía la confirmación.
2. Si la cita es del día siguiente y se agendó antes de las 21:00, el sistema envía el recordatorio entre las 19:00 y las 21:00 del día anterior.
3. Una hora antes, el sistema vuelve a verificar y envía el recordatorio.
4. Si no hay cambios, la cita sigue reservada.
5. Después de una entrega crónica, el sistema programa el aviso de próxima entrega.

## 9. Flujos alternativos

- A1. Cambio de estado una hora antes: se cancela y se notifica el motivo (RF-57).
- A2. Sin disponibilidad: a las 48 horas se envía el recordatorio de revalidación.
- A3. Cancelación o expiración: se notifica según RF-50.

## 10. Casos límite

- CL-19. Cita del día siguiente agendada a las 22:00: no se envía el recordatorio de la noche anterior; sí el de una hora antes.
- CL-20. Paciente sin correo registrado y sin canales vinculados: recibe las notificaciones solo por SMS.
- CL-21. El paciente revocó el consentimiento antes del aviso de próxima entrega: no se envía.
- CL-22. Un facilitador tiene vinculados diez pacientes con citas: cada notificación identifica al paciente sin incluir datos de salud, para que el facilitador sepa a quién corresponde.

## 11. Criterios de aceptación

- AC-43. Dada una cita confirmada, cuando se envía la confirmación, entonces llega por SMS, por correo si existe, por Telegram si hay chat vinculado y a la web si hay navegador vinculado.
- AC-44. Dada cualquier notificación, cuando se revisa su contenido en cualquier canal, entonces no contiene nombres de medicamentos ni diagnósticos.
- AC-45. Dada una cita a las 10:00, cuando son las 09:00, entonces el paciente recibe el recordatorio.
- AC-46. Dada una cita del día siguiente agendada a las 15:00, cuando son entre las 19:00 y las 21:00, entonces el paciente recibe el recordatorio de la noche anterior.
- AC-47. Dado un recordatorio, cuando el paciente lo recibe, entonces no se le pide confirmar y se le ofrece cancelar.
- AC-48. Dado que la afiliación se volvió inactiva después de agendar, cuando se envía el recordatorio de una hora antes, entonces la cita queda cancelada, las existencias se liberan, la fórmula queda no apta y el paciente recibe el motivo y el siguiente paso.
- AC-49. Dado que no hubo disponibilidad, cuando pasan 48 horas, entonces el paciente recibe un recordatorio y no recibe ninguno más por esa causa.
- AC-50. Dada una fórmula crónica entregada con siguiente fecha habilitada el día 15, cuando es el día 13, entonces el paciente recibe el aviso de próxima entrega.
- AC-51. Dado un cambio de estado detectado, cuando se revisa el registro, entonces consta qué dato cambió y cuándo.

## 12. Dependencias

Servicios reales de Telegram, SMS y correo (A6); SPEC-02 por las vinculaciones; SPEC-03 por las verificaciones; SPEC-04 por las citas.

## 13. Restricciones

Telegram solo envía mensajes a chats que iniciaron el bot y están vinculados (BR-09).

## 14. Fuera de alcance

Aviso de llegada de medicamentos, aviso de autorización aprobada y confirmación de asistencia (DEC-15, DEC-23, DEC-25).

## 15. Preguntas abiertas

Ninguna.

## 16. Trazabilidad

- HU-15: RF-49, RF-50, RF-51, RF-52, RF-53, RF-54, RF-55; BR-25; AC-43, AC-44, AC-45, AC-46, AC-47; CL-19, CL-20, CL-22.
- HU-16: RF-56, RF-57; BR-26; AC-48, AC-51.
- HU-17: RF-58; BR-27, BR-28; AC-49, AC-50; CL-21.

## 17. Historial de cambios

- Versión 1: creación con DEC-17, DEC-23, DEC-25 y DEC-28.

# SPEC-06. Atención en el punto y cierre de entrega

Versión: 1. Estado: aprobado.

## 1. Objetivo

Permitir que el dispensador valide el código, registre la validación oficial y cierre cada medicamento con trazabilidad.

## 2. Contexto

La validación oficial ocurre en el punto (CB 8.2) y en el prototipo se simula (SUP-04). Pharma Express no gestiona pendientes ni entregas parciales; las novedades en el punto las gestiona el usuario con Disfarma (DEC-26).

## 3. Alcance

Autenticación del dispensador, validación del código, control de la ventana, consulta de la prevalidación, registro de la validación oficial, cierre por medicamento y aviso de próxima entrega crónica.

## 4. Actores e historias de usuario

Actores: dispensador, paciente, persona que actúa por el paciente.

- HU-18. Como dispensador, quiero validar el código de entrega y ver la prevalidación, para atender más rápido a quien viene con cita.
- HU-19. Como dispensador, quiero registrar por cada medicamento si lo entregué o no, y por qué, para dejar trazabilidad.
- HU-20. Como paciente, quiero saber qué hacer si en el punto no me entregan algún medicamento, para acudir a quien corresponde.

## 5. Requisitos funcionales

- RF-59. El dispensador debe autenticarse con un usuario de rol dispensador asignado a un punto. Origen: DEC-26.
- RF-60. El dispensador debe poder validar el código en QR o numérico. El sistema debe verificar que el código pertenezca a una cita de su punto, que no esté usado ni anulado y que la hora actual esté dentro de la ventana. Origen: DEC-19, DEC-24.
- RF-61. Si el código se presenta antes de la ventana, el sistema debe indicar que el paciente debe esperar el inicio de la ventana. Origen: DEC-19.
- RF-62. Si el código se presenta después de la ventana, el sistema debe indicar que la cita expiró e informar que el paciente puede acudir a la atención presencial o iniciar una nueva solicitud. Origen: CB 9.4, DEC-19, DEC-22.
- RF-63. Al validar el código, el sistema debe registrar la hora de llegada y mostrar al dispensador el paciente, las fórmulas, los medicamentos reservados y el resultado de la prevalidación, indicando que es preliminar. Origen: DEC-26.
- RF-64. El dispensador debe registrar la validación oficial y cerrar cada medicamento como entregado o como no entregado con un motivo del catálogo (DEC-27). Origen: DEC-26, DEC-27, DEC-45.
- RF-65. Al cerrar, el sistema debe marcar el código como usado y la cita como cerrada, y actualizar el estado de cada fórmula (A10). Origen: CB 6.2 OE7.
- RF-66. Si algún medicamento quedó como no entregado, el sistema debe indicar al paciente que la gestión corresponde a Disfarma y no debe crear pendientes ni seguimiento. Origen: DEC-26, DEC-45.
- RF-67. Si una fórmula crónica quedó entregada, el sistema debe programar el aviso de próxima entrega (SPEC-05). Origen: DEC-17.
- RF-68. El sistema debe registrar el dispensador, la fecha y hora, y el resultado y motivo por medicamento. Origen: CB 6.2 OE7, RNF-08.

## 6. Requisitos no funcionales aplicables

RNF-07, RNF-08, RNF-10, RNF-11, RNF-14, RNF-16.

## 7. Reglas de negocio

- BR-29. El código de entrega es de un solo uso y solo es válido en su punto y dentro de su ventana. Origen: DEC-19, DEC-24.
- BR-30. La hora de llegada es el momento en que el dispensador valida el código. Origen: DEC-26.
- BR-31. La validación oficial del dispensador prevalece sobre la prevalidación. Origen: CB 8.2.
- BR-32. No se crean pendientes ni entregas parciales gestionadas; lo no entregado lo gestiona el usuario con Disfarma. Origen: DEC-26.
- BR-33. Solo un dispensador autenticado puede validar códigos y cerrar entregas. Origen: DEC-26.

## 8. Flujo principal

1. El paciente llega dentro de la ventana y muestra el código.
2. El dispensador lo valida.
3. El sistema registra la llegada y muestra la prevalidación.
4. El dispensador hace la validación oficial y entrega.
5. El dispensador cierra cada medicamento como entregado.
6. El sistema marca el código como usado, cierra la cita y actualiza las fórmulas.
7. Si hay fórmulas crónicas entregadas, programa el aviso de próxima entrega.

## 9. Flujos alternativos

- A1. Llegada antes de la ventana: se indica esperar.
- A2. Llegada después de la ventana: la cita ya expiró; se indica atención presencial o nueva solicitud.
- A3. Algún medicamento no entregado: se registra con motivo y se indica al paciente que gestione con Disfarma.
- A4. Código de otro punto, usado o anulado: se rechaza con el motivo.

## 10. Casos límite

- CL-23. El paciente presenta el código de una cita de otro punto: se rechaza e indica el punto correcto.
- CL-24. El paciente intenta usar dos veces el mismo código: la segunda vez se rechaza por código usado.
- CL-25. El dispensador cierra un medicamento como no entregado por "sin existencias pese a reserva": la fórmula queda cerrada con medicamentos no entregados y se orienta hacia Disfarma.
- CL-26. El paciente llega un minuto antes de terminar la ventana: se atiende normalmente.

## 11. Criterios de aceptación

- AC-52. Dada una persona sin rol de dispensador, cuando intenta validar un código, entonces el sistema lo impide.
- AC-53. Dada una cita de 10:00 a 11:00, cuando el código se valida a las 10:30, entonces se registra la llegada a las 10:30 y se muestra la prevalidación con el aviso de que es preliminar.
- AC-54. Dada una cita de 10:00 a 11:00, cuando el código se presenta a las 09:40, entonces el sistema indica esperar hasta las 10:00.
- AC-55. Dada una cita de 10:00 a 11:00, cuando el código se presenta a las 11:05, entonces el sistema indica que la cita expiró.
- AC-56. Dado un código ya usado, cuando se valida de nuevo, entonces se rechaza.
- AC-57. Dada una cita con dos medicamentos, cuando el dispensador cierra uno como entregado y otro como no entregado con motivo, entonces ambos resultados quedan registrados con dispensador, fecha y hora.
- AC-58. Dado un medicamento no entregado, cuando se cierra la cita, entonces el paciente recibe la indicación de gestionar con Disfarma y no se crea ningún pendiente.
- AC-59. Dada una fórmula crónica entregada, cuando se cierra la cita, entonces queda programado el aviso de próxima entrega.
- AC-60. Dado el catálogo de motivos, cuando el dispensador cierra un medicamento como no entregado, entonces solo puede escoger motivos del catálogo, y "otro" exige una descripción.

## 12. Dependencias

SPEC-04 por las citas y códigos; SPEC-05 por el aviso de próxima entrega; catálogo de motivos (SPEC-08).

## 13. Restricciones

El módulo de turnos agendados es una hipótesis operativa (SUP-03).

## 14. Fuera de alcance

Pendientes, entregas parciales gestionadas, domicilio y reporte de concordancia (DEC-26, DEC-32).

## 15. Preguntas abiertas

Ninguna.

## 16. Trazabilidad

- HU-18: RF-59, RF-60, RF-61, RF-62, RF-63; BR-29, BR-30, BR-31, BR-33; AC-52, AC-53, AC-54, AC-55, AC-56; CL-23, CL-24, CL-26.
- HU-19: RF-64, RF-65, RF-68; AC-57, AC-60.
- HU-20: RF-66, RF-67; BR-32; AC-58, AC-59; CL-25.

## 17. Historial de cambios

- Versión 1: creación con DEC-19, DEC-24, DEC-26 y DEC-27.

# SPEC-07. Canal asistido: cuidadores, tutores y facilitadores

Versión: 1. Estado: aprobado.

## 1. Objetivo

Que las personas con barreras digitales puedan usar Pharma Express con ayuda de un cuidador, tutor o facilitador comunitario, sin depender de un único canal.

## 2. Contexto

Existe una brecha digital significativa en adultos mayores (CB 3.2). El canal asistido no es una interfaz propia: es el uso de la web o de Telegram por una persona que apoya al paciente (DEC-04). El sistema no distingue a esa persona del paciente (DEC-11).

## 3. Alcance

Gestión en nombre del paciente con el código, declaración de titular o tercero, facilitador con muchos pacientes, dispositivos compartidos, menores y personas con tutor, y orientación ante el cambio del medio de contacto.

## 4. Actores e historias de usuario

Actores: cuidador, tutor, facilitador comunitario, paciente.

- HU-21. Como cuidador de un adulto mayor, quiero gestionar sus fórmulas con el código que le llega a su celular, para ayudarle sin que tenga que usar la tecnología.
- HU-22. Como facilitador comunitario, quiero apoyar a varias personas desde mi celular, escogiendo a cada una antes de gestionar, para no confundir sus trámites.
- HU-23. Como paciente que cambió de número, quiero saber dónde actualizarlo, para volver a recibir los códigos.

## 5. Requisitos funcionales

- RF-69. Cualquier persona que ingrese el código recibido en los medios del paciente debe poder hacer todas las gestiones del paciente. Origen: DEC-11.
- RF-70. Al aceptar el tratamiento de datos, la persona debe declarar si es el titular o un tercero que actúa con su autorización (RF-02). Origen: DEC-09.
- RF-71. Un facilitador debe poder vincular su chat o navegador a muchos pacientes y escoger el paciente antes de cada gestión (RF-17, RF-18). Origen: DEC-10.
- RF-72. Si el número registrado del paciente es el de su tutor, el flujo debe ser el mismo. Origen: DEC-11.
- RF-73. Ante un cambio de medio de contacto, el sistema debe orientar al usuario para actualizarlo en su EPS (contenido configurable) y no debe modificar datos. Origen: DEC-08.
- RF-74. La web y el bot deben informar que la atención presencial sigue disponible. Origen: CB 10.3, RNF-12.

## 6. Requisitos no funcionales aplicables

RNF-01, RNF-06, RNF-11, RNF-12.

## 7. Reglas de negocio

- BR-34. La posesión del código es la condición para actuar por el paciente; no hay registro de cuidadores. Origen: DEC-11.
- BR-35. No hay límite de pacientes por chat o navegador. Origen: DEC-10.
- BR-36. Pharma Express no modifica datos de contacto; eso corresponde a la EPS. Origen: DEC-08.

## 8. Flujo principal

1. El cuidador o facilitador abre la web o el bot.
2. Acepta el tratamiento de datos declarándose tercero.
3. Ingresa la cédula del paciente.
4. El paciente recibe el código y se lo comunica, o el cuidador lo recibe si el número registrado es el suyo.
5. El cuidador ingresa el código, el canal queda vinculado y continúa el flujo normal.

## 9. Flujos alternativos

- A1. El facilitador agrega otro paciente: repite los pasos 3 a 5 y el paciente se suma a la lista del canal.
- A2. El paciente cambió de número y el código no le llega: se aplica la ruta alterna y se orienta hacia la EPS.

## 10. Casos límite

- CL-27. Un celular compartido tiene vinculados a la mamá y al papá: antes de cada gestión se escoge a uno y el sistema muestra de quién se trata.
- CL-28. El cuidador deja de apoyar al paciente: el paciente o quien tenga el código puede desvincular ese canal (RF-20) o revocar el consentimiento.
- CL-29. Un facilitador tiene 40 pacientes vinculados: todos son accesibles y cada vinculación vence a los 3 meses.

## 11. Criterios de aceptación

- AC-61. Dado que un cuidador ingresa el código correcto del paciente, cuando intenta cualquier gestión, entonces el sistema lo permite igual que al paciente.
- AC-62. Dado que la persona se declaró tercero, cuando se consulta el registro, entonces consta como tercero con fecha y canal.
- AC-63. Dado un facilitador con cinco pacientes vinculados, cuando inicia una gestión, entonces debe escoger a uno y ese paciente se muestra en cada paso.
- AC-64. Dado un paciente que cambió de número, cuando busca ayuda, entonces el sistema muestra la orientación de su EPS y no ofrece editar el número.
- AC-65. Dada cualquier pantalla inicial de la web o del bot, cuando se muestra, entonces informa que la atención presencial sigue disponible.

## 12. Dependencias

SPEC-01 y SPEC-02.

## 13. Restricciones

Globales (A6).

## 14. Fuera de alcance

Registro de cuidadores, límite de pacientes por facilitador y actualización de datos (DEC-05, DEC-08, DEC-10).

## 15. Preguntas abiertas

Ninguna.

## 16. Trazabilidad

- HU-21: RF-69, RF-70, RF-72; BR-34; AC-61, AC-62.
- HU-22: RF-71; BR-35; AC-63; CL-27, CL-28, CL-29.
- HU-23: RF-73, RF-74; BR-36; AC-64, AC-65.

## 17. Historial de cambios

- Versión 1: creación con DEC-04, DEC-08, DEC-10 y DEC-11.

# SPEC-08. Datos simulados, parámetros y catálogos

Versión: 1. Estado: aprobado.

## 1. Objetivo

Definir qué información simulada y configurable necesita el prototipo, sin presentarla como integración real.

## 2. Contexto

El equipo no tiene acceso a Disfarma ni a las EPS (CB 5.3). Los sistemas externos se simulan con datos de prueba construidos a partir de evidencia documentada (CB 14.1).

## 3. Alcance

EPS simulada, catálogo PBS, catálogo de diagnósticos crónicos, puntos e inventario, contenido por EPS, catálogo de motivos de no entrega y registro de eventos para la evaluación.

## 4. Actores e historias de usuario

Actores: equipo (como responsable de los datos de prueba), EPS simulada, inventario simulado.

- HU-24. Como equipo, queremos configurar puntos, ventanas, capacidades, inventario y contenido por EPS sin cambiar el comportamiento del sistema, para probar distintos escenarios.
- HU-25. Como equipo, queremos que el sistema registre los eventos necesarios, para calcular las métricas de evaluación.

## 5. Requisitos funcionales

- RF-75. La EPS simulada debe proveer por paciente: cédula, EPS, estado de afiliación, celular registrado y correo registrado si existe. Por fórmula debe proveer: vigencia, estado de autorización por medicamento y, si es crónica, la fecha habilitada de la próxima entrega. Origen: SUP-01.
- RF-76. Debe existir un catálogo simulado de cobertura PBS por medicamento. Origen: SUP-09.
- RF-77. Debe existir un catálogo configurable de diagnósticos crónicos. Origen: DEC-41.
- RF-78. Cada punto ficticio debe tener horario, ventanas de 1 hora, capacidad por ventana e inventario por medicamento, todos configurables. Origen: DEC-30.
- RF-79. Por cada EPS debe existir contenido configurable con los puntos, enlaces o trámites de autorización y la orientación para actualizar datos. Origen: DEC-08, DEC-15, DEC-30.
- RF-80. Debe existir el catálogo de motivos de no entrega de DEC-27. Origen: DEC-27.
- RF-81. Los datos de prueba deben usar como contacto solo números y correos de los integrantes del equipo, con su consentimiento, y ningún dato de pacientes reales. Origen: SUP-07.
- RF-82. Las vigencias de las fórmulas de prueba deben estar entre 8 y 9 meses después de la consulta médica. Origen: DEC-13.
- RF-83. Los cambios de estado en la EPS simulada (por ejemplo, afiliación inactiva) deben poder provocarse durante las pruebas para verificar la nueva prevalidación de una hora antes. Origen: DEC-23.
- RF-84. El sistema debe registrar los eventos necesarios para las métricas de A14: resultados de prevalidación por fórmula, citas confirmadas, canceladas y expiradas, intentos de sobre-reserva rechazados, llegadas y cierres. Origen: CB 13.2, RNF-16.

## 6. Requisitos no funcionales aplicables

RNF-05, RNF-09, RNF-10, RNF-16.

## 7. Reglas de negocio

- BR-37. Todo lo simulado debe identificarse como tal en la interfaz y en la documentación. Origen: CB 18.
- BR-38. Salud Total y Sanitas aplican las mismas reglas; la EPS es un dato del paciente. Origen: DEC-31.

## 8. Flujo principal

1. El equipo carga los pacientes, fórmulas, catálogos, puntos e inventario de prueba.
2. El sistema los usa en SPEC-01 a SPEC-06.
3. El sistema registra los eventos para la evaluación.

## 9. Flujos alternativos

- A1. El equipo cambia un parámetro de un punto: las nuevas consultas de disponibilidad lo reflejan.

## 10. Casos límite

- CL-30. Un punto con capacidad cero en una ventana: esa ventana no se ofrece.
- CL-31. Un medicamento sin entrada en el catálogo PBS: se trata como no cubierto y requiere autorización (BR-12).

## 11. Criterios de aceptación

- AC-66. Dado un parámetro de capacidad modificado, cuando se consultan las ventanas, entonces se refleja el nuevo valor.
- AC-67. Dados los datos de prueba, cuando se revisan, entonces no contienen datos de pacientes reales y los contactos son de los integrantes del equipo.
- AC-68. Dada la afiliación de un paciente de prueba cambiada a inactiva, cuando se envía el recordatorio de una hora antes, entonces se aplica RF-57.
- AC-69. Dada una prueba completa, cuando se revisan los registros, entonces permiten calcular las métricas de A14.
- AC-70. Dada cualquier pantalla con resultados de la EPS o del inventario, cuando se muestra, entonces indica que la información es simulada.

## 12. Dependencias

Evidencia documentada del contexto base para construir datos realistas (CB 14.1).

## 13. Restricciones

Los datos de prueba no deben presentarse como observaciones internas de Disfarma (CB 13.1).

## 14. Fuera de alcance

Integración real con EPS, inventarios, MIPRES o ADRES (CB 5.2). Manejo de fallas de las fuentes simuladas (DEC-32).

## 15. Preguntas abiertas

Ninguna.

## 16. Trazabilidad

- HU-24: RF-75, RF-76, RF-77, RF-78, RF-79, RF-80, RF-81, RF-82, RF-83; BR-37, BR-38; AC-66, AC-67, AC-68, AC-70; CL-30, CL-31.
- HU-25: RF-84; AC-69.

## 17. Historial de cambios

- Versión 1: creación con DEC-13, DEC-27, DEC-30 y DEC-31.
