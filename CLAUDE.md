# Pharma Express

Prototipo funcional de pre-dispensación farmacéutica, por aplicación web y bot de Telegram, para los puntos de Disfarma en Manizales. Tiene tres experiencias: la del paciente (web y Telegram), el panel del dispensador y el panel de administración. Sistemas externos simulados (EPS, inventario, puntos, validación oficial); Telegram, SMS y correo son reales. Se publica en Vercel.

**Fuente de verdad del producto:** `docs/00-contexto-producto.md` (versión 7, aprobada). Ningún requisito, diseño ni código puede contradecirlo. Léelo por secciones, según la tarea.

**Sistema de agentes:** los agentes y skills son genéricos y están instalados en `~/.claude`. Las reglas propias de este proyecto para cada agente están en `docs/guia-agentes.md`.

## Reglas de trabajo
- Redacta en español de Colombia: documentos, interfaz, mensajes al usuario y commits.
- La IA propone; la responsable del proyecto (la usuaria) decide y valida.
- No inventes reglas, cifras, normas, integraciones ni comportamientos. Si falta información, pregunta. Si eres un subagente y no puedes preguntar, detente en ese punto y repórtalo como pendiente al orquestador.
- Distingue siempre **Confirmado** (está en el contexto o lo respondió la usuaria), **Inferido** (conclusión propia, requiere confirmación) y **Pendiente** (no decidido). Una inferencia de producto nunca se vuelve regla sin aprobación. Los detalles técnicos los decide el agente y quedan en el ADR; cuándo preguntar está en `docs/guia-agentes.md` (Todos los agentes).
- Si una tarea contradice el contexto del producto, señala la contradicción y detente.
- Para citar el contexto escribe "sección 3.4" o "secciones 3.1 y 3.6". No uses el símbolo de párrafo.

## Stack y despliegue (fijos)
- Presupuesto: US$0. Es un prototipo universitario (Universidad de Caldas); solo servicios gratuitos o cuentas de estudiante sin tarjeta.
- Lenguaje: TypeScript en todo el proyecto.
- Frontend: React + Vite.
- Backend: NestJS.
- Base de datos: PostgreSQL.
- Publicación: Vercel. NestJS corre como una sola función sin servidor: no hay procesos permanentes (el módulo de tareas programadas de NestJS no sirve), el bot de Telegram funciona por webhook y las tareas en segundo plano usan los servicios de Vercel o servicios externos.
- En el plan gratuito (Hobby) de Vercel, las tareas programadas corren como máximo una vez al día y con hasta 59 minutos de desfase. Los recordatorios del contexto (sección 3.6) necesitan más precisión: la solución es una decisión de arquitectura con ADR.
- Librerías del bot, SMS, correo, OCR, migraciones, pruebas y gestores de paquetes: las define architect en un ADR, con versiones verificadas en la documentación oficial.

## Mapa del repositorio
| Ruta | Contenido | Quién escribe |
| --- | --- | --- |
| `docs/00-contexto-producto.md` | Contexto aprobado del producto | Solo la usuaria |
| `docs/guia-agentes.md` | Reglas del proyecto para cada agente | Solo la usuaria |
| `docs/01-brief.md`, `docs/02-requisitos.md` | Brief y requisitos | product-manager |
| `docs/03-arquitectura.md`, `docs/adr/` | Arquitectura y decisiones | architect |
| `api/openapi.yaml` | Contrato entre frontend y backend | architect |
| `docs/04-readiness.md` | Revisión de preparación | readiness-reviewer |
| `feature_list.json` | Funcionalidades y estado `passes` | product-manager crea; solo qa-evaluator cambia `passes` |
| `contracts/<id>.md` | Contrato de terminado por funcionalidad | developer propone, qa-evaluator revisa |
| `qa/<id>.md` | Informe de QA por funcionalidad | qa-evaluator |
| `progress.md` | Bitácora: una línea por trabajo terminado | developer |
| `init.sh` | Levanta el entorno y corre una prueba de humo | developer |

## Flujo
- Modo proyecto: `claude --agent orchestrator`. Modo cambio (ajustes pequeños): `claude`.
- Una funcionalidad a la vez, con contrato aprobado antes de escribir código.
- Al empezar una sesión de código: leer `progress.md`, `git log --oneline -10` y ejecutar `./init.sh`.
- Git: nunca ejecutes `git init` ni configures remotos; los crea la usuaria. Si no hay repositorio, detente y pídeselo.

## Invariantes del producto (el código nunca los rompe)
1. Ninguna notificación ni enlace incluye nombres de medicamentos ni diagnósticos; los enlaces al bot tampoco llevan cédula ni otros datos sensibles (secciones 3.1 y 3.6).
2. Nunca hay una cita sin medicamentos reservados ni una ventana por encima de su capacidad: cero sobre-reservas. Las citas de una misma fórmula se confirman todas o ninguna (sección 3.5).
3. No se registra nada antes de aceptar el tratamiento de datos. La única excepción es la revocación: se puede revocar sin aceptar el aviso, y solo se conserva la prueba que exige la sección 3.2. La autorización de datos de salud se pide antes de cargar cualquier documento (sección 3.2).
4. Los identificadores de Telegram no prueban identidad. Solo la cédula y el código de un solo uso la verifican (secciones 3.1 y 3.2).
5. Cada fórmula es todo o nada, y todo resultado de prevalidación se presenta como preliminar (sección 3.4).
6. Nunca se usan datos reales de pacientes (secciones 3.2 y 3.10).
7. Toda petición a un panel se autentica y autoriza en el backend; denegar por defecto, y cada rol solo accede a lo suyo (sección 3.13).
8. Ningún registro (logs o auditoría) incluye cédulas, diagnósticos ni nombres de medicamentos (sección 3.13).

## Seguridad
- Los requisitos completos están en la sección 3.13: guards, middleware y validación de NestJS, sesiones, límites de intentos, validación de archivos, cabeceras, auditoría.
- En Vercel, los archivos que sirve la CDN no pasan por el middleware de NestJS. Ninguna pantalla protegida depende de eso: los datos solo llegan por la API protegida.
- Credenciales (Telegram, SMS, correo, OCR, base de datos) solo en `.env` y en las variables de entorno de Vercel. `.env` nunca se lee ni se sube al repositorio; `.env.example` lleva los nombres sin valores.

## Convenciones
- Zona horaria `America/Bogota` para ventanas, citas y recordatorios.
- Identificadores de código (variables, funciones, tablas, endpoints) en inglés; textos visibles para el usuario en español de Colombia.
- Un commit por funcionalidad o corrección, con mensaje descriptivo en español.
