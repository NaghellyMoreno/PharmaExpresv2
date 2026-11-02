# 0021. Reloj de la aplicación y mecanismo de prueba de tiempo

- **Estado:** Aceptada (2026-11-01). Decisión técnica (guía de agentes: la toma architect con la opción más simple y segura).
- **Fecha:** 2026-11-01
- **Fuente:** `docs/04-readiness.md` (R-06); `docs/02-requisitos.md` (RP-03); ADR 0005 (hora de la base de datos), 0011 (tareas), 0014 (sesiones), 0017 (pruebas); F005, F009, F045, F047, F050, F058, F078, F082, F084, F096 a F098

## Contexto
Doce funcionalidades piden "el mecanismo de prueba de tiempo de la arquitectura" para llevar plazos a 10 minutos, 24 horas, 48 horas, 3 meses y 12 horas, y para simular retrasos del recordatorio de dos horas antes y del de 48 horas. Las horas de negocio salen de PostgreSQL (`now()`), así que los relojes simulados de Vitest no sirven: no mueven la base de datos. Además, las pruebas de extremo a extremo corren contra la función desplegada en vista previa, donde no se puede tocar el reloj del servidor.

## Decisión
1. **Un solo reloj de negocio en la base de datos.** La migración inicial crea:
   - `app.test_clock(id smallint PRIMARY KEY CHECK (id = 1), offset_seconds bigint NOT NULL DEFAULT 0 CHECK (offset_seconds >= 0))` con una sola fila.
   - `app.clock_now() RETURNS timestamptz`: `now() + make_interval(secs => offset_seconds)` leído de esa fila. Es `STABLE`: dentro de una transacción devuelve siempre la misma hora, como `now()`.
2. **Regla de uso.** Toda hora de negocio (vencimientos de códigos, enlaces y vinculaciones, sesiones, ventanas, reglas de agudo y crónico, tareas programadas, inactividad, 48 horas, auditoría) sale de `app.clock_now()`:
   - En SQL, los `DEFAULT` de columnas de tiempo y las consultas usan `app.clock_now()`, nunca `now()` ni `CURRENT_TIMESTAMP`.
   - En TypeScript, el servicio `Clock` obtiene la hora con `SELECT app.clock_now()` al inicio de cada transacción o petición y la pasa a las funciones puras (franjas, 19:00, 7:00), que la reciben como parámetro y se prueban con Vitest sin reloj.
   - Una regla de ESLint (`no-restricted-syntax`) prohíbe `Date.now()` y `new Date()` sin argumentos fuera de `Clock`, y una prueba busca `now()` y `CURRENT_TIMESTAMP` en las migraciones y consultas, salvo en `app.clock_now()`.
3. **Cómo se mueve (solo fuera de producción).** Comando `pnpm --filter api test:clock advance <duración> | set <segundos> | reset`, que usa el usuario de la semilla (el de la aplicación no tiene permiso de escritura sobre `app.test_clock`). Las pruebas de extremo a extremo lo llaman con `child_process` y después llaman al despachador con `CRON_SECRET` para ejecutar las tareas vencidas. No hay endpoint HTTP: el sitio publicado no gana superficie de ataque.
4. **Barreras en producción.**
   - En la base de producción se fija una vez `ALTER DATABASE ... SET pharma.environment = 'production'` (Configuración antes de publicar). Un disparador sobre `app.test_clock` rechaza cualquier `offset_seconds` distinto de 0 si `current_setting('pharma.environment', true) = 'production'`.
   - El comando se niega a ejecutarse si `VERCEL_ENV=production`.
   - El usuario de base de datos de la aplicación solo tiene `SELECT` sobre `app.test_clock`.
5. **Cómo se simulan los casos de las funcionalidades.**
   - Vencer un plazo (código de 10 minutos, enlace de 30 minutos o 48 horas, vinculación de 3 meses, sesión de 12 horas, inactividad de 15 o 30 minutos): `advance` hasta pasar el plazo y repetir la petición.
   - Recordatorios: `advance` hasta la hora de la tarea y llamar al despachador. Para "sale a tiempo", se llama justo después de `due_at`.
   - Retraso por falla (F045, F047): `advance` hasta después de `not_after` (por ejemplo, `due_at` + 15 minutos, o pasado el inicio de la ventana) **sin** llamar antes al despachador, y luego llamarlo. El despachador ve que va tarde y registra `late_sent` o `late_skipped`.
   - Reglas por hora del día (10:15, 19:30, 23:30): `set` para que `app.clock_now()` caiga en la siguiente ocurrencia de esa hora de Bogotá (como el desfase no puede ser negativo, si ya pasó hoy, cae mañana).
6. **Límites conocidos.**
   - Solo avanza: `offset_seconds >= 0`. Para volver atrás se hace `reset` y se recrean los datos de la prueba (en local, base nueva; en vista previa, rama nueva de Neon o limpieza de las tablas `app` con el comando de semilla).
   - El desfase es global para toda la base: en vista previa afecta a cualquiera que use esa rama al mismo tiempo. Las pruebas que mueven el reloj corren en serie y terminan con `reset`.
   - No mueve relojes externos: vencimiento de las URL firmadas de Blob, `Max-Age` de las cookies, `notBefore` de QStash, fechas de Telegram ni cuotas diarias de los proveedores. Por eso en vista previa se usa `SCHEDULER_MODE=direct` (ADR 0011) y la prueba del enlace temporal vencido de Blob (F015) espera el tiempo real de vida de la URL, que es corto (10 minutos).
   - Vitest con relojes simulados se sigue usando solo para funciones puras que reciben la hora como parámetro.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Relojes simulados de Vitest (`vi.useFakeTimers`) | Integrados | No mueven `now()` de PostgreSQL ni sirven contra la vista previa |
| Reescribir marcas de tiempo en las filas (restar 48 h a `created_at`) | Sin código de producción | Hay que saber qué columnas tocar en cada caso; frágil y fácil de equivocar con los `CHECK` de vencimiento |
| Reloj inyectable solo en TypeScript, con la hora pasada como parámetro a cada consulta | Sin función en la base | Cualquier `DEFAULT now()` olvidado rompe la prueba; muchas firmas de consulta cambian |
| Endpoint HTTP de prueba para mover el reloj | Fácil de llamar desde Playwright | Superficie de ataque en la función publicada |
| `libfaketime` en el contenedor de PostgreSQL | Mueve todo el reloj | No disponible en Neon (vista previa) |

## Consecuencias
- Cerrado R-06 y RP-03. Los pasos "mecanismo de prueba de tiempo de la arquitectura" de `feature_list.json` usan el comando `test:clock`.
- Una consulta por petición para leer la hora (o se toma junto con la primera consulta de la transacción). Impacto despreciable.
- El developer debe usar `app.clock_now()` desde la primera migración; cambiarlo después obliga a revisar todas las consultas.
