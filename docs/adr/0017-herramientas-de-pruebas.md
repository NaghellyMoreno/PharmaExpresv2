# 0017. Herramientas de pruebas de backend, frontend, extremo a extremo, accesibilidad y rendimiento

- **Estado:** Propuesta
- **Fecha:** 2026-10-31
- **Fuente:** `CLAUDE.md` (pruebas las define architect); guía de agentes (qa-evaluator); RNF-002, RNF-021, RNF-022, RNF-029 a RNF-031

## Decisión
| Nivel | Herramienta (versión verificada en npm) | Uso |
| --- | --- | --- |
| Backend unitario e integración | Vitest 5.0 + `unplugin-swc` 2.0 (metadatos de decoradores de NestJS) + Supertest 7.3 | Contra PostgreSQL real (Docker local o rama de Neon); incluye concurrencia de reservas con transacciones en paralelo |
| Contrato | Ajv 8.20 + `api/openapi.yaml` | Valida cada respuesta de integración contra el esquema (ADR 0001) |
| Frontend | Vitest 5.0 + Testing Library + jsdom | Componentes y lógica de pantallas |
| Extremo a extremo | Playwright 1.64 | Recorridos web y paneles contra el entorno local o de vista previa; Telegram con actualizaciones simuladas al webhook firmado |
| Accesibilidad | `@axe-core/playwright` 4.14 | Criterios automáticos de WCAG 2.1 A y AA en cada pantalla; revisión manual de teclado (RNF-021) |
| Rendimiento web | Lighthouse CI (`@lhci/cli` 0.15) con 4G lenta simulada | LCP, CLS y TBT; peso del JavaScript inicial (ver ADR 0020) |
| Mensajes | Modo `capture` (ADR 0009) | Revisar que ninguna notificación tenga medicamentos ni diagnósticos |

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Jest (predeterminado de NestJS) | Plantilla de Nest | Dos ejecutores distintos en el monorepo; Vitest sirve a ambos |
| Testcontainers | Base aislada por prueba | Requiere Docker en CI igual; Docker Compose basta |
| Cypress | Popular | Playwright prueba varios navegadores y se integra con axe |

## Consecuencias
- `init.sh` levanta PostgreSQL y corre una prueba de humo con estos comandos (ver `docs/03-arquitectura.md`).
- Las pruebas nunca envían SMS, correos ni Telegram reales salvo que el contrato lo pida (guía de agentes).
