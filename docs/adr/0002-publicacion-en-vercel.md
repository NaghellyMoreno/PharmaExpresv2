# 0002. Publicación en Vercel: dos proyectos, mismo origen, dominio, entornos y variables

- **Estado:** Aceptada (2026-11-01). La usuaria aprobó las propuestas de architect y decidió el dominio (raíz para la web, subdominio para el correo). Región, cabeceras de la cámara y modos por entorno son decisiones técnicas.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** `CLAUDE.md` (stack, publicación y seguridad), secciones 3.9, 3.13 y 3.14; RNF-009, RNF-012, RNF-016, RNF-026, RNF-036; ADR 0009, 0011, 0012, 0015, 0021

## Contexto
La publicación en Vercel es fija. Verificado en la documentación oficial: NestJS se despliega sin configuración como **una sola función** con Fluid compute; entrada `src/main.ts`; cuerpo máximo de petición y respuesta 4,5 MB; duración máxima 300 s en Hobby; tamaño de función 250 MB. Las cookies de sesión deben ser `SameSite`, con CSRF y CORS limitado a los dominios propios. Los archivos estáticos que sirve la CDN no pasan por NestJS. Presupuesto de US$0 (sección 3.9).

## Decisión
1. **Dos proyectos de Vercel en el mismo repositorio, plan Hobby:** `pharma-express-api` (raíz `apps/api`) y `pharma-express-web` (raíz `apps/web`, salida estática de Vite).
2. **Mismo origen:** `apps/web/vercel.json` reescribe `/api/:path*` hacia el dominio del proyecto API. El navegador solo habla con el dominio web; las cookies `__Host-` son de primera parte; CORS no se habilita (la API rechaza orígenes distintos de `APP_ORIGIN`).
3. **Dominio (Confirmado, usuaria):** el dominio raíz (`<dominio>`) apunta al proyecto web y es `APP_ORIGIN`; un subdominio (`correo.<dominio>`, nombre Inferido) se verifica en Resend para el remitente (ADR 0009). La API conserva su dominio `*.vercel.app` como destino de la reescritura y de QStash (`PUBLIC_API_URL`); nadie lo usa desde el navegador. Mientras no exista el dominio, la vista previa usa el dominio `*.vercel.app` del proyecto web.
4. **Cabeceras de los estáticos** en `apps/web/vercel.json` (`headers`): HSTS, Content-Security-Policy (`script-src 'self' 'wasm-unsafe-eval'` para el lector de QR, `connect-src 'self'` más el dominio de Blob para la subida firmada, `img-src 'self' data: blob:` para el QR dibujado, `media-src 'self' blob:` para la cámara), `Permissions-Policy: camera=(self)` (solo el propio sitio puede pedir la cámara, que usa el panel del dispensador), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`. La API pone las suyas con `helmet` (ADR 0016).
5. **Ningún dato en estáticos:** el HTML y el JavaScript de los paneles no contienen datos; todo llega por la API protegida (RNF-026).
6. **Entornos y modos (Decisión técnica):**

| Entorno | Base de datos | Mensajería | OCR | Disparador | Bot | Semilla de personal |
| --- | --- | --- | --- | --- | --- | --- |
| Local | PostgreSQL en Docker | `capture` | `capture` | `direct` | Bot de pruebas (opcional) | Administrador y dispensadores de prueba |
| Vista previa | Rama de Neon por rama de git | `capture` por defecto; `sandbox` con `MESSAGING_ALLOWLIST` para probar envíos reales | `capture` por defecto; `azure` para F089 y F090 | `direct` | Bot de pruebas | Administrador y dispensadores de prueba |
| Producción | Rama principal de Neon con `pharma.environment = 'production'` (ADR 0021) | `live` | `azure` | `qstash` + cron diario | Bot de producción | Solo administrador |

7. **Variables de entorno:** listadas en `docs/03-arquitectura.md`; `.env.example` con nombres sin valores; nunca en el repositorio (RNF-016). Las de producción solo en el panel de Vercel.
8. **Región:** `iad1` (Washington D. C., este de Estados Unidos) para la función, con la base de datos en AWS `us-east-1` y el recurso de Azure en East US, para que todo quede cerca y en Estados Unidos, como informa el texto de la autorización de datos de salud (Decisión técnica; Hobby permite una región).
9. **Desarrollo local:** `docker compose up -d db`, `pnpm --filter api dev`, `pnpm --filter web dev` con proxy de Vite `/api` a la API local; `vercel dev` (CLI 48.4.0 o superior) para reproducir la plataforma.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Dominios separados con CORS y cookies `SameSite=None` | Sin reescrituras | Cookies de terceros bloqueadas por navegadores; CSRF más difícil |
| Servir el SPA desde NestJS | Un solo proyecto | Los estáticos pasarían por la función (lento, más costo); comportamiento de estáticos con NestJS sin configuración no verificado |
| Un proyecto con `vercel.json` personalizado para ambos | Un solo dominio nativo | Pierde la detección sin configuración de NestJS |
| Subdominio para la API (`api.<dominio>`) | Sin reescritura | Cookies entre subdominios y CORS; la reescritura es más simple |

## Consecuencias
- Hay una reescritura entre proyectos que debe probarse en la primera vista previa (cookies `__Host-`, cabecera `Origin`, `Set-Cookie`). Si falla, la alternativa es servir la API en un subdominio con cookies sin prefijo `__Host-` (decisión de la usuaria, porque cambia la configuración del dominio).
- El límite de 4,5 MB obliga a paginar listados (auditoría) y a no devolver imágenes grandes desde la API.
- **Configuración antes de publicar (usuaria):** registrar el dominio, apuntar la raíz al proyecto web y fijar `pharma.environment = 'production'` en la base de producción. No bloquea la construcción.
- **API en módulos ES y entrada de la función (2026-11-02, Decisión técnica; hallazgos del primer despliegue):** (1) NestJS 12 se publica solo como módulos ES y el cargador de funciones de Vercel con Node 22 no permite `require()` de módulos ES (`ERR_REQUIRE_ESM`). Se fija `engines.node = 24.x` en `apps/api/package.json` y la versión 24.x en los ajustes del proyecto API. La API también pasó a ESM (`"type": "module"`, `module` y `moduleResolution` en `Node16`, imports relativos con `.js`, `import.meta.dirname`). (2) Vercel toma como entrada el primer archivo de su lista de nombres (`src/app.*`, `src/main.*`, ...): un `src/app.ts` sin exportación por defecto rompe el arranque. Por eso `app.ts` se llama `create-app.ts`, y `src/main.ts` importa `@nestjs/core` directamente, porque el detector lo exige. (3) `helmet` publica tipos para CommonJS y para ESM; el import se escribió para compilar con ambos. Pruebas: 395 de API, 64 de web y 63 de Playwright.
