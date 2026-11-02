import type { Binding } from './api';
import { formatDate, REVOKE_PATH, TEXTS } from './texts';

/** P-03 mínima: el paciente vinculado a este navegador y el vencimiento. Sin selección ni desvinculación (F011). */
export function LinkedPatient(props: { bindings: Binding[] }) {
  return (
    <section>
      <h1>{TEXTS.linkedTitle}</h1>
      <ul>
        {props.bindings.map((b) => (
          <li key={b.patientRefId}>
            <strong>{b.displayName}</strong>
            <br />
            <span>{TEXTS.linkedUntil(formatDate(b.expiresAt))}</span>
          </li>
        ))}
      </ul>
      <p>
        <a href={REVOKE_PATH}>{TEXTS.revokeLabel}</a>
      </p>
    </section>
  );
}
