import { useEffect, useRef } from 'react';
import type { Binding } from './api';
import { REVOKE_PATH, TEXTS } from './texts';

/** El encabezado recibe el foco al aparecer la pantalla, para que el teclado no se pierda al desmontarse la anterior. */
function useFocusHeading() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return heading;
}

/** Selección: una opción por paciente vigente, identificada solo por su nombre (HU-005 criterio 5). Vive en memoria. */
export function PatientSelection(props: { bindings: Binding[]; onChoose: (binding: Binding) => void }) {
  const heading = useFocusHeading();
  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {TEXTS.selectTitle}
      </h1>
      <ul>
        {props.bindings.map((b) => (
          <li key={b.patientRefId}>
            <button type="button" onClick={() => props.onChoose(b)}>
              {b.displayName}
            </button>
          </li>
        ))}
      </ul>
      <p>
        <a href={REVOKE_PATH}>{TEXTS.revokeLabel}</a>
      </p>
    </section>
  );
}

/** "Gestión a nombre de" mínima y provisional: aún no hay solicitudes, fórmulas ni citas. No muestra datos de otro paciente. */
export function ManagingFor(props: { name: string; onChange: () => void }) {
  const heading = useFocusHeading();
  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {TEXTS.managingTitle(props.name)}
      </h1>
      <button type="button" onClick={props.onChange}>
        {TEXTS.changePatient}
      </button>
      <p>
        <a href={REVOKE_PATH}>{TEXTS.revokeLabel}</a>
      </p>
    </section>
  );
}
