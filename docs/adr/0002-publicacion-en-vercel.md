# 0002. Publicación en Vercel: dos proyectos, mismo origen, entornos y variables

- **Estado:** Propuesta
- **Fecha:** 2026-10-31
- **Fuente:** `CLAUDE.md` (stack, publicación y seguridad), secciones 3.13 y 3.14; RNF-009, RNF-012, RNF-016, RNF-026

## Contexto
La publicación en Vercel es fija. Verificado en la documentación oficial: NestJS se despliega sin configuración como **una sola función** con Fluid compute; entrada `src/main.ts`; cuerpo máximo de petición y respuesta 4,5 MB; duración máxima 300 s en Hobby; tamaño de función 250 MB. Las cookies de sesión deben ser `SameSite`, con CSRF y CORS limitado a los dominios propios. Los archivos estáticos que sirve la CDN no pasan por NestJS.

## Decisión
1. **Dos proyectos de Vercel en el mismo repositorio:** `pharma-express-api` (raíz `apps/api`) y `pharma-express-web` (raíz `apps/web`, salida estática de Vite).
2. **Mismo origen:** `apps/web/vercel.json` reescribe `/api/:path*` hacia el dominio del proyecto API. El navegador solo habla con el dominio web; las cookies `__Host-` son de primera parte; CORS no se habilita (la API rechaza orígenes distintos de `APP_ORIGIN`). Inferido.
3. **Cabeceras de los estáticos** en `apps/web/vercel.json` (`headers`): HSTS, Content-Security-Policy (solo `'self'` para scripts, `connect-src` con el dominio de Blob para la subida firmada), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`. La API pone las suyas con `helmet` (ADR 0016).
4. **Ningún dato en estáticos:** el HTML y el JavaScript de los paneles no contienen datos; todo llega por la API protegida (RNF-026).
5. **Entornos:** local, vista previa por rama (base de datos de rama en Neon, proveedores en modo `sandbox` o `capture`, bot de Telegram de pruebas aparte) y producción.
6. **Variables de entorno:** listadas en `docs/03-arquitectura.md`; `.env.example` con nombres sin valores; nunca en el repositorio (RNF-016). Las de producción solo en el panel de Vercel.
7. **Región:** `iad1` por defecto para la función y la base de datos en la misma región (Inferido; Hobby permite una región).
8. **Desarrollo local:** `docker compose up -d db`, `pnpm --filter api dev`, `pnpm --filter web dev` con proxy de Vite `/api` a la API local; `vercel dev` (CLI 48.4.0 o superior) para reproducir la plataforma.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Dominios separados con CORS y cookies `SameSite=None` | Sin reescrituras | Cookies de terceros bloqueadas por navegadores; CSRF más difícil |
| Servir el SPA desde NestJS | Un solo proyecto | Los estáticos pasarían por la función (lento, más costo); comportamiento de estáticos con NestJS sin configuración no verificado |
| Un proyecto con `vercel.json` personalizado para ambos | Un solo dominio nativo | Pierde la detección sin configuración de NestJS |

## Consecuencias
- Hay una reescritura entre proyectos que debe probarse en la primera vista previa (cookies `__Host-`, cabecera `Origin`, `Set-Cookie`). Si falla, la alternativa es un dominio propio con subdominios y cookies sin prefijo `__Host-` (decisión de la usuaria).
- El límite de 4,5 MB obliga a paginar listados (auditoría) y a no devolver imágenes grandes desde la API.
