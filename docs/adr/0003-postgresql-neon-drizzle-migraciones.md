# 0003. PostgreSQL en Neon, acceso con Drizzle y migraciones con drizzle-kit

- **Estado:** Aceptada (2026-11-01, la usuaria aprobó las propuestas de architect)
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** `CLAUDE.md` (PostgreSQL fijo; migraciones las define architect), secciones 3.5 y 3.13 (consultas parametrizadas)

## Contexto
La base de datos debe garantizar invariantes con restricciones, disparadores y bloqueos de fila (ADR 0004 y 0005). La función es sin servidor: conexiones cortas y agrupadas.

## Decisión
1. **Proveedor:** Neon desde el Marketplace de Vercel. Plan gratuito verificado: 1 GB por proyecto, 100 CU-hora al mes, 10 ramas, suspensión tras 5 minutos sin actividad, restauración a 6 horas. Inferido; la usuaria puede escoger otro PostgreSQL gestionado.
2. **Controlador:** `pg` 8.23 con `Pool` y `attachDatabasePool` de `@vercel/functions` 3.10 (recomendado por Vercel para Fluid compute); cadena de conexión agrupada de Neon.
3. **ORM y consultas:** Drizzle ORM 0.45 (consultas parametrizadas por construcción; `.for('update')` para bloqueos). SQL directo solo con plantillas parametrizadas de Drizzle (`sql\`\``), nunca con concatenación.
4. **Migraciones:** drizzle-kit 0.31; migraciones SQL versionadas en `apps/api/drizzle/`. Las restricciones que Drizzle no modela (disparadores de restricción diferidos, `CHECK` complejos, disparadores de solo inserción) van en migraciones personalizadas (`drizzle-kit generate --custom`).
5. **Esquemas:** `sim` y `app` (ver `docs/03-arquitectura.md`). Usuario de base de datos de la aplicación sin permisos de escritura sobre `sim` en tiempo de ejecución; el cargador de semilla usa otro usuario (Inferido).
6. **Aislamiento:** `READ COMMITTED` con bloqueos explícitos en el orden común del ADR 0005 (decisión 7) y actualizaciones condicionales; reintento único ante interbloqueo o fallo de serialización.
7. **Hora:** toda hora de negocio sale de `app.clock_now()`, también en los `DEFAULT` de las columnas (ADR 0021).
8. **Región:** Neon en AWS `us-east-1`, la más cercana a la función `iad1` (ADR 0002). Decisión técnica.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Prisma | Ecosistema amplio | Bloqueos de fila y SQL personalizado menos directos |
| TypeORM | Integración clásica con NestJS | Migraciones automáticas propensas a errores; mantenimiento irregular |
| Supabase PostgreSQL | Base y almacenamiento juntos | Blob privado de Vercel ya cubre archivos con firma (ADR 0012) |
| `@neondatabase/serverless` 1.2 | Conexión por HTTP/WebSocket | Con Fluid compute un `Pool` de `pg` es suficiente y permite transacciones interactivas estándar |

## Consecuencias
- Pruebas de concurrencia contra PostgreSQL real (local y rama de Neon), nunca contra simulaciones.
- La suspensión del plan gratuito agrega latencia al primer acceso tras inactividad: riesgo para RNF-029 y RNF-031, a medir.
