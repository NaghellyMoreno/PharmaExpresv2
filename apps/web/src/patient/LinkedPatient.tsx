import type { Binding } from './api';
import { formatDate, REVOKE_PATH, TEXTS } from './texts';

/**
 * P-03: los pacientes vinculados a este navegador, cada uno con su vencimiento, en orden de creación (F009 y F011).
 * "Vincular otro paciente" e "Iniciar una gestión" solo aparecen si quien la muestra sabe atenderlos.
 */
export function LinkedPatient(props: { bindings: Binding[]; onLinkAnother?: () => void; onStartManagement?: () => void }) {
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
      {(props.onLinkAnother || props.onStartManagement) && (
        <div className="actions">
          {props.onLinkAnother && (
            <button type="button" onClick={props.onLinkAnother}>
              {TEXTS.linkAnother}
            </button>
          )}
          {props.onStartManagement && (
            <button type="button" onClick={props.onStartManagement}>
              {TEXTS.startManagement}
            </button>
          )}
        </div>
      )}
      <p>
        <a href={REVOKE_PATH}>{TEXTS.revokeLabel}</a>
      </p>
    </section>
  );
}
