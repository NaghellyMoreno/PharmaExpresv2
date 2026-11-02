import { TEXTS } from './texts';

/** Marcador de P-10: el flujo de revocación es F092. Se puede abrir sin aceptar el aviso (sección 3.2). */
export function RevocationPlaceholder() {
  return (
    <main>
      <h1>{TEXTS.revokeLabel}</h1>
      <p>{TEXTS.revokeSoon}</p>
    </main>
  );
}
