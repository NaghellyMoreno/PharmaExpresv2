# Pharma Express - Contexto para agentes de IA

Versión: 1
Estado: Aprobado. Se basa en PHARMA_EXPRESS_SPEC.md versión 1.
Responsable: equipo completo por consenso (Karen, Isabella, Juan Manuel y Camila).

# 0. Propósito y precedencia

Este archivo es el punto de entrada para cualquier agente de IA que trabaje en Pharma Express. Le da a cada agente el contexto pertinente, las reglas de trabajo, los límites de su responsabilidad y el formato de su salida. No reemplaza la especificación: la resume y dice cómo usarla.

Documentos del proyecto, en orden de precedencia:

1. Decisiones explícitas más recientes del equipo.
2. PHARMA_EXPRESS_SPEC.md: especificación vigente de qué debe hacer el sistema.
3. Este archivo: contexto, reglas de trabajo y convenciones.
4. PHARMA_EXPRESS_FLUJOS.md: diagramas para personas. Si difiere de la especificación, prevalece la especificación.
5. PHARMA_EXPRESS_CONTEXTO.md: contexto base histórico. Se usa solo para evidencia, problema y referencias. Su flujo canónico quedó modificado; los cambios están en SPEC A16.

Si este archivo y la especificación se contradicen, prevalece la especificación y el agente debe señalar la contradicción.

# 1. Reglas de trabajo para cualquier agente

1. Redactar en español de Colombia.
2. Principio del proyecto: la IA propone, una persona del equipo decide y el equipo valida.
3. No inventar reglas, cifras, integraciones, comportamientos ni normas. Si falta información, registrar una pregunta abierta y detenerse en ese punto.
4. En toda salida, distinguir cuatro tipos de contenido: confirmado (con su DEC o ID de la especificación), inferencia, propuesta y pregunta abierta. Una inferencia nunca se convierte en regla sin aprobación del equipo.
5. Si una propuesta contradice la especificación, señalar la contradicción antes de continuar.
6. No reintroducir lo que está fuera de alcance: cita de continuidad, pendientes, entrega parcial gestionada, reprogramación, reporte de concordancia, SUS, domicilio, aplicación móvil instalable ni WhatsApp.
7. No presentar como real lo simulado. Son simulados la EPS, el inventario, los puntos y la validación oficial. Son reales Telegram, el envío de SMS y el envío de correo.
8. No incluir nombres de medicamentos ni diagnósticos en ninguna notificación, por ningún canal.
9. Presentar siempre la prevalidación como preliminar.
10. Trabajar solo dentro de la responsabilidad del propio agente (sección 7).
11. Citar los identificadores de la especificación (RF, RNF, BR, AC, CL, DEC, OPEN-Q) en lugar de repetir o reinterpretar su contenido.
12. Usar solo la información pertinente a la tarea. No cargar todos los documentos si la tarea no lo requiere.

# 2. Qué debe leer cada agente

Specification Agent:
- PHARMA_EXPRESS_SPEC.md completo y este archivo.
- PHARMA_EXPRESS_CONTEXTO.md solo para evidencia y referencias.

Architecture Agent:
- SPEC Parte A: A1, A5, A6, A7, A8, A10 y A11.
- De cada SPEC: secciones 5 (requisitos funcionales), 7 (reglas de negocio), 12 (dependencias) y 13 (restricciones).
- Sección 6.4 de este archivo (puntos de atención técnica).

Planning Agent:
- Arquitectura aprobada.
- De cada SPEC: secciones 4 (historias de usuario), 5, 11 (criterios de aceptación) y 16 (trazabilidad).
- Sección 6.5 de este archivo (decisiones pendientes de etapas posteriores).

Coding Agent:
- La tarea asignada y la arquitectura aprobada.
- De la SPEC de esa tarea: requisitos funcionales, reglas de negocio, criterios de aceptación y casos límite.
- SPEC A10 (estados) y los RNF aplicables, en especial RNF-04, RNF-08 y RNF-09.

QA Agent:
- De cada SPEC: secciones 10 (casos límite), 11 (criterios de aceptación) y 16 (trazabilidad).
- SPEC A11 (cada RNF con su "Se verifica con") y A14 (evaluación del prototipo).

# 3. Capa 1: dominio

## 3.1. Producto y problema

- Pharma Express es un sistema multicanal de pre-dispensación farmacéutica. El entregable es un prototipo funcional con sistemas externos simulados.
- Problema: en los puntos de dispensación de Disfarma en Manizales, las validaciones para entregar un medicamento ocurren cuando el paciente ya está en la ventanilla. El paciente descubre las novedades tarde, después de desplazarse y esperar, a veces varias horas.
- Propuesta de valor: el paciente conoce antes de desplazarse si sus fórmulas cumplen los requisitos y si los medicamentos están disponibles. Solo recibe una cita cuando los medicamentos están reservados.
- Población: afiliados de Salud Total y Sanitas. Se prioriza a personas con tratamientos crónicos, adultos mayores y personas con barreras digitales.
- El producto no resuelve el desabastecimiento, las autorizaciones, las deudas entre actores ni el inventario real del gestor.

## 3.2. Actores

- Paciente: gestiona por la web o por Telegram.
- Persona que actúa por el paciente (cuidador, tutor, familiar): usa el código que llega a los medios del paciente. El sistema no la distingue del paciente.
- Facilitador comunitario: igual que el cuidador, pero con muchos pacientes vinculados a su chat o navegador.
- Dispensador: único actor con usuario y rol. Valida el código, registra la validación oficial y cierra la entrega.
- EPS simulada: fuente de afiliación, contacto, vigencia, autorizaciones y habilitación de entregas crónicas.
- Inventario simulado: existencias por medicamento y por punto.

## 3.3. Glosario esencial

- Solicitud: fórmulas y medicamentos de un mismo paciente gestionados juntos.
- Fórmula: unidad de validación. Es todo o nada.
- Prevalidación: verificación preliminar de afiliación, vigencia, cobertura PBS, autorización y, si la fórmula es crónica, habilitación de entrega.
- Validación oficial: la que registra el dispensador en el punto.
- Ventana: bloque de 1 hora con capacidad limitada. Equivale a la franja.
- Cita: ventana en un punto para recoger los medicamentos reservados en ese punto.
- Reserva: existencias y cupo apartados para una cita.
- Código de entrega: código de un solo uso, en QR y numérico, por cada cita.
- Vinculación: asociación de un chat de Telegram o de un navegador con un paciente. Vence a los 3 meses.
- Sobre-reserva: comprometer más existencias o cupos de los disponibles. La meta es cero.

El glosario completo está en SPEC A9.

## 3.4. Reglas de negocio más importantes

- Sin aceptación del tratamiento de datos no se pide ni se registra nada. La autorización de datos de salud es separada y precede a la carga de documentos (BR-01, BR-02).
- La identidad se verifica con cédula y un código enviado por SMS y por correo a los medios registrados en la EPS. El código dura 10 minutos y admite 3 intentos (BR-03).
- Quien tiene el código puede actuar por el paciente (BR-06, BR-34).
- El orden de la prevalidación es: afiliación, vigencia, PBS, autorización y habilitación crónica (BR-10).
- Cada fórmula es todo o nada, y las fórmulas separadas son independientes (BR-11).
- Una cita aguda puede ser hoy (desde una hora después de agendar) o mañana. Una cita con algún medicamento crónico solo puede ser mañana (BR-17, BR-18).
- No existe una cita sin reserva ni se supera la capacidad de una ventana (BR-19).
- La reserva expira al terminar la ventana. No hay reprogramación (BR-21, BR-23).
- Si ya se entregó parte de una fórmula, lo que no se recoja de esa fórmula se pierde (BR-22).
- Sin disponibilidad no hay pendiente: se envía un recordatorio único a las 48 horas (BR-24, BR-27).
- Un cambio de estado detectado una hora antes de la cita la cancela (BR-26).
- Las novedades en el punto las gestiona el usuario con Disfarma (BR-32).

Los estados de fórmula, cita, código y vinculación están en SPEC A10.

# 4. Capa 2: ingeniería de requisitos

## 4.1. Cómo se expresa cada elemento

- Historia de usuario: "Como [actor], quiero [necesidad], para [objetivo]."
- Requisito funcional: "El sistema debe [comportamiento observable]." Incluye su origen.
- Requisito no funcional: condición de calidad con "Se verifica con: [método]." Si no tiene cifra definida, no se inventa: se declara que no se fija o se registra una pregunta abierta.
- Regla de negocio: regla del dominio, independiente de la tecnología.
- Criterio de aceptación: "Dado [contexto], cuando [acción], entonces [resultado observable]."
- Caso límite: situación extrema o poco frecuente, con su comportamiento esperado.
- Flujos: principal, alternativos y excepciones, en pasos numerados.

## 4.2. Criterios de calidad

Toda salida de especificación o de verificación se revisa con estos criterios de la guía:

- Completitud: no faltan requisitos ni escenarios importantes.
- Consistencia: no hay reglas contradictorias.
- No ambigüedad: ningún término admite interpretaciones incompatibles.
- Verificabilidad: cada criterio puede probarse.
- Trazabilidad: cada requisito llega a un criterio de aceptación.
- No invención: se distinguen hechos, decisiones y preguntas abiertas.
- Delimitación: no se introducen decisiones de arquitectura o implementación.
- Utilidad: los agentes siguientes pueden usar el resultado sin reinterpretar el problema.

## 4.3. Límite entre especificación y diseño técnico en este proyecto

- Especificación: el sistema debe obtener de los documentos cargados los medicamentos y el diagnóstico. Arquitectura: con qué técnica o servicio se leen los documentos.
- Especificación: la confirmación de la reserva es atómica y hay cero sobre-reservas. Arquitectura: cómo se garantiza la atomicidad.
- Especificación: se envían SMS y correos reales. Arquitectura: qué proveedores se usan.
- Especificación: la vinculación vence a los 3 meses. Arquitectura: cómo se representa y controla el vencimiento.
- Especificación: los recordatorios se envían a horas definidas. Arquitectura: cómo se programan las tareas por tiempo.
- Especificación: el dispensador tiene un rol. Arquitectura: cómo se autentica y autoriza.

# 5. Capa 3: convenciones del proyecto

## 5.1. Identificadores

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

La numeración es única en todo el proyecto, con dos dígitos (RF-01).

Convenciones propuestas en este archivo, que requieren aprobación del equipo:

- Un identificador nunca se reutiliza ni se renumera después de aprobado. Lo nuevo toma el siguiente número libre.
- Lo que se elimina en una versión aprobada se conserva con la marca "Eliminado en la versión X por DEC-xx", en lugar de borrarse.
- Los artefactos de etapas posteriores usan sus propios prefijos (por ejemplo, TASK para tareas y TEST para pruebas) y siempre citan los identificadores de la especificación que cubren.

## 5.2. Origen de la información

- CB x: contexto base, sección x.
- DEC-xx: decisión del equipo.
- NORMA: norma citada en SPEC A13.
- OPEN-Q-xx: pregunta abierta pendiente de decisión del equipo. No se aplica hasta que el equipo decida.

## 5.3. Estados de un documento

- Borrador: en construcción.
- Pendiente de aprobación: completo, a la espera de revisión del equipo.
- Aprobado: el equipo lo aprobó por consenso.
- Congelado: aprobado y usado como entrada de la siguiente etapa. Solo cambia mediante una nueva versión.

## 5.4. Gestión de cambios

1. Registrar la decisión nueva como DEC.
2. Identificar los elementos afectados (RF, BR, AC, estados, notificaciones, pruebas).
3. Actualizar los elementos y la sección de trazabilidad.
4. Subir la versión al siguiente número entero (de 1 a 2) y registrar el cambio en el historial.
5. Solicitar aprobación del equipo antes de congelar.

## 5.5. Formato

Markdown simple: títulos con #, listas con guion, sin negritas, sin tablas, sin emojis y sin diagramas en los archivos para agentes. Los diagramas Mermaid solo van en los documentos para personas.

# 6. Capa 4: contexto actual del producto

## 6.1. Estado

- PHARMA_EXPRESS_SPEC.md versión 1, aprobada por el equipo.
- Contiene 47 decisiones (DEC-01 a DEC-47), 8 SPEC, 25 HU, 84 RF, 16 RNF, 38 BR, 70 AC, 31 CL y 9 SUP.
- No tiene preguntas abiertas. Las 11 reglas derivadas se aprobaron como DEC-37 a DEC-47.

## 6.2. Módulos

- SPEC-01. Consentimiento, identidad y derechos del titular.
- SPEC-02. Canales, vinculación y selección de paciente.
- SPEC-03. Carga de documentos y prevalidación.
- SPEC-04. Disponibilidad, reserva y agenda.
- SPEC-05. Notificaciones y recordatorios.
- SPEC-06. Atención en el punto y cierre de entrega.
- SPEC-07. Canal asistido: cuidadores, tutores y facilitadores.
- SPEC-08. Datos simulados, parámetros y catálogos.

## 6.3. Decisiones clave

- Canales: aplicación web y bot de Telegram, ambos con el flujo completo. WhatsApp está descartado (DEC-02, DEC-03).
- No hay cuentas de pacientes. La identidad se verifica con un código enviado a los medios registrados en la EPS (DEC-05, DEC-06).
- Un chat o navegador puede tener varios pacientes vinculados, sin límite, con reverificación cada 3 meses (DEC-10).
- El usuario carga las fórmulas y la historia clínica. El tipo de tratamiento sale del diagnóstico (DEC-12).
- El sistema no tramita ni vigila autorizaciones: solo informa los puntos, enlaces o trámites de la EPS (DEC-15).
- Agudo y crónico reservan y agendan. No hay cita de continuidad: el crónico recibe un aviso 2 días antes de su próxima entrega (DEC-17, DEC-18).
- Las citas son ventanas de 1 hora. No hay reprogramación y se puede cancelar en cualquier momento (DEC-19, DEC-22).
- Recordatorios entre las 19:00 y las 21:00 del día anterior y una hora antes, con una nueva prevalidación (DEC-23).
- Sin disponibilidad no hay pendiente: un recordatorio único a las 48 horas (DEC-25).
- En el punto, lo no entregado lo gestiona el usuario con Disfarma (DEC-26).
- Fuera de alcance: concordancia, SUS, metas de desempeño, conservación de datos y fallas de las fuentes simuladas (DEC-32).

## 6.4. Puntos de atención técnica para etapas posteriores

No son decisiones de diseño. Son partes de la especificación que el Architecture Agent debe evaluar primero por su costo o su riesgo:

- Lectura de fotos y PDF de fórmulas e historias clínicas (RF-25). Es probablemente la pieza más costosa dentro de las 8 semanas.
- Concurrencia en reservas y cupos, con cero sobre-reservas y confirmación atómica entre varias citas de una misma fórmula (RF-41, RNF-09).
- Tareas programadas por tiempo: recordatorio de la noche anterior, recordatorio de una hora antes con nueva prevalidación, expiración al terminar la ventana, recordatorio a las 48 horas y aviso de próxima entrega (SPEC-04, SPEC-05).
- Mensajería real por cuatro medios (notificación web, Telegram, SMS y correo) con la misma minimización de datos (RF-49, RNF-04).
- Vinculaciones múltiples con vencimiento y revocación (SPEC-02).
- Tratamiento de datos sensibles de salud en documentos cargados (RNF-01 a RNF-03).
- Plazo del proyecto: 8 semanas, equipo de cuatro personas (A6).

## 6.5. Decisiones pendientes que corresponden a etapas posteriores

No son vacíos de la especificación. Las propone el agente de la etapa correspondiente y las decide el equipo:

- Arquitectura: mecanismo de lectura de documentos, proveedores de SMS y correo, mecanismo de notificaciones web, representación de vinculaciones y sesiones, programación de tareas por tiempo, almacenamiento de los datos simulados.
- Planificación: prioridad y orden de implementación de las SPEC. El contexto base pide priorizar el flujo central (CB 14.1), pero el equipo aún no ha definido cuáles SPEC son el flujo central.
- QA: datos de prueba concretos para cada criterio de aceptación y escenario de concurrencia.

# 7. Responsabilidades y límites por agente

- Specification Agent: define qué debe hacer el sistema y cuándo es correcto. No elige tecnologías, arquitectura, modelo de datos, endpoints ni componentes, y no escribe código.
- Architecture Agent: define cómo se estructura técnicamente la solución a partir de la especificación aprobada. No cambia reglas de negocio ni alcance; si una regla es técnicamente inviable, la reporta como pregunta al equipo.
- Planning Agent: convierte la especificación y la arquitectura aprobadas en tareas trazables. No agrega funcionalidades ni cambia prioridades sin decisión del equipo.
- Coding Agent: implementa las tareas asignadas según la arquitectura. No cambia comportamiento especificado; si encuentra un vacío, se detiene y pregunta.
- QA Agent: verifica que cada criterio de aceptación y cada RNF tenga evidencia de cumplimiento. No redefine criterios; reporta los que no se pueden verificar.

Cadena de trabajo: equipo, luego Specification Agent (especificación), Architecture Agent (arquitectura), Planning Agent (plan), Coding Agent (código) y QA Agent (verificación). Cada paso requiere que el anterior esté aprobado por el equipo.

# 8. Puntos de control humano

El agente debe detenerse y pedir decisión del equipo cuando:

- Una tarea depende de una OPEN-Q que afecta directamente el resultado.
- Encuentra una contradicción entre documentos o entre reglas.
- Una propuesta cambia el alcance, una regla de negocio, un criterio crítico o una restricción.
- Una decisión tiene impacto legal, de privacidad, de seguridad o de experiencia de usuario.
- Falta una cifra o un dato que cambia el comportamiento.

El equipo aprueba por consenso. Ninguna salida de un agente se usa como entrada de la siguiente etapa hasta que el equipo la apruebe.

# 9. Contrato de salida

Toda salida de un agente debe tener esta estructura:

```
Agente:
Artefacto:
Versión:
Fecha:
Estado: Borrador | Pendiente de aprobación
Documentos de entrada: nombre y versión de cada uno

1. Resultado
2. Trazabilidad: identificadores de la especificación que cubre
3. Supuestos nuevos: marcados como propuesta
4. Preguntas abiertas nuevas: OPEN-Q con responsable "equipo"
5. Contradicciones encontradas
6. Verificación: resultado de la lista de la sección 10
```

# 10. Lista de verificación antes de entregar

- ¿Cada afirmación relevante cita su origen (DEC, CB o identificador de la especificación)?
- ¿Se distinguen lo confirmado, las inferencias, las propuestas y las preguntas abiertas?
- ¿Se evitó inventar cifras, reglas, normas o integraciones?
- ¿Se evitó reintroducir elementos fuera de alcance?
- ¿Se mantiene la separación entre lo simulado y lo real?
- ¿Ninguna notificación ni ejemplo incluye medicamentos o diagnósticos?
- ¿La prevalidación aparece como preliminar?
- ¿El trabajo se mantiene dentro de la responsabilidad del agente?
- ¿Toda contradicción encontrada quedó señalada?
- ¿La salida sigue el contrato de la sección 9 y el formato de la sección 5.5?

# 11. Historial de cambios

- Versión 1: creación a partir de PHARMA_EXPRESS_SPEC.md versión 1 y de la Guía de trabajo para el Specification Agent.
