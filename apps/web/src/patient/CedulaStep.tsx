import { TEXTS } from './texts';

/** P-02 (esqueleto de F001): solo el campo de cédula; la verificación es de F003, así que no se envía nada. */
export function CedulaStep() {
  return (
    <main>
      <form onSubmit={(e) => e.preventDefault()}>
        <label>
          {TEXTS.cedula}
          <input type="text" name="cedula" inputMode="numeric" autoComplete="off" />
        </label>
        <button type="submit">{TEXTS.continue}</button>
      </form>
    </main>
  );
}
