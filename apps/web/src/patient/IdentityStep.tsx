import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CodeRequestRejected, requestVerificationCode, verifyIdentity, type Binding, type NextStep } from './api';
import { LinkedPatient } from './LinkedPatient';
import { EXIT_STEPS, TEXTS } from './texts';

type Phase =
  | { name: 'cedula'; focus?: boolean }
  | { name: 'code'; challengeId: string; message: string }
  | { name: 'verified'; challengeId: string; message: string; binding?: Binding };

const CEDULA_FORMAT = /^[0-9]{5,12}$/;
const CODE_FORMAT = /^[0-9]{6}$/;

/**
 * P-02: cédula, código de un solo uso y verificación. El mensaje aprobado sale de la respuesta 202 de la API
 * (idéntico exista o no la cédula) y solo se muestra después de recibirla.
 */
export function IdentityStep() {
  const [phase, setPhase] = useState<Phase>({ name: 'cedula' });
  if (phase.name === 'cedula') return <CedulaForm focusOnMount={phase.focus} onAccepted={(r) => setPhase({ name: 'code', ...r })} />;
  if (phase.name === 'verified') {
    return (
      <main>
        <p role="status">{TEXTS.verified}</p>
        {phase.binding && <LinkedPatient bindings={[phase.binding]} />}
        <button type="button" onClick={() => setPhase({ ...phase, name: 'code' })}>
          {TEXTS.verifyAnother}
        </button>
      </main>
    );
  }
  return (
    <CodeForm
      challengeId={phase.challengeId}
      message={phase.message}
      onVerified={(binding) => setPhase({ ...phase, name: 'verified', binding })}
      onNewCode={() => setPhase({ name: 'cedula', focus: true })}
    />
  );
}

type CedulaError = 'invalid' | 'request' | 'too_soon' | 'hourly_limit';
const CEDULA_ERROR_TEXT: Record<CedulaError, string> = {
  invalid: TEXTS.cedulaInvalid,
  request: TEXTS.requestError,
  too_soon: TEXTS.tooSoon,
  hourly_limit: TEXTS.hourlyLimit,
};

function CedulaForm(props: { focusOnMount?: boolean; onAccepted: (r: { challengeId: string; message: string }) => void }) {
  const [cedula, setCedula] = useState('');
  const [error, setError] = useState<CedulaError | null>(null);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.focusOnMount) input.current?.focus();
  }, [props.focusOnMount]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    // Sin petición si el formato es inválido; el foco vuelve al campo.
    if (!CEDULA_FORMAT.test(cedula)) {
      setError('invalid');
      input.current?.focus();
      return;
    }
    setError(null);
    setPending(true);
    try {
      const accepted = await requestVerificationCode(cedula);
      props.onAccepted({ challengeId: accepted.challengeId, message: accepted.message });
    } catch (e) {
      // Un 429 deja el foco en el campo de cédula; no hay cuenta regresiva.
      setError(e instanceof CodeRequestRejected ? e.reason : 'request');
      setPending(false);
      if (e instanceof CodeRequestRejected) input.current?.focus();
    }
  }

  return (
    <main>
      <form onSubmit={submit} noValidate>
        <label>
          {TEXTS.cedula}
          <input
            ref={input}
            type="text"
            name="cedula"
            inputMode="numeric"
            autoComplete="off"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            aria-invalid={error === 'invalid'}
            aria-describedby={error ? 'cedula-error' : undefined}
          />
        </label>
        {error && (
          <p role="alert" id="cedula-error">
            {CEDULA_ERROR_TEXT[error]}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {TEXTS.continue}
        </button>
      </form>
    </main>
  );
}

function CodeForm(props: { challengeId: string; message: string; onVerified: (binding?: Binding) => void; onNewCode: () => void }) {
  const [code, setCode] = useState('');
  const [exit, setExit] = useState<{ reason: 'expired' | 'exhausted'; nextSteps: NextStep[] } | null>(null);
  const [error, setError] = useState<'incomplete' | 'incorrect' | 'used' | 'error' | null>(null);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!CODE_FORMAT.test(code)) {
      setError('incomplete');
      input.current?.focus();
      return;
    }
    setError(null);
    setPending(true);
    const outcome = await verifyIdentity(props.challengeId, code);
    if (outcome.kind === 'verified') return props.onVerified(outcome.binding);
    if (outcome.kind === 'expired' || outcome.kind === 'exhausted') return setExit({ reason: outcome.kind, nextSteps: outcome.nextSteps });
    if (outcome.kind === 'exhausted_now') return setExit({ reason: 'exhausted', nextSteps: [] });
    setError(outcome.kind);
    setPending(false);
    input.current?.focus();
  }

  const errorText = {
    incomplete: TEXTS.codeIncomplete,
    incorrect: TEXTS.codeIncorrect,
    used: TEXTS.codeUsed,
    error: TEXTS.verifyError,
  };
  if (exit) return <ExitPaths reason={exit.reason} nextSteps={exit.nextSteps} onNewCode={props.onNewCode} />;
  return (
    <main>
      <p role="status">{props.message}</p>
      <form onSubmit={submit} noValidate>
        <label>
          {TEXTS.codeLabel}
          <input
            ref={input}
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? 'code-error' : undefined}
          />
        </label>
        {error && (
          <p role="alert" id="code-error">
            {errorText[error]}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {TEXTS.verify}
        </button>
      </form>
    </main>
  );
}

/**
 * Código vencido o con intentos agotados: el campo del código sale y se ofrecen los tres caminos (HU-003 criterios 4 a 7).
 * Los caminos "EPS" y "atención presencial" solo muestran texto: nunca hay un formulario para cambiar el celular o el correo.
 */
function ExitPaths(props: { reason: 'expired' | 'exhausted'; nextSteps: NextStep[]; onNewCode: () => void }) {
  const [guidance, setGuidance] = useState<string | null>(null);
  const label = (kind: NextStep['kind'], fallback: string) => props.nextSteps.find((s) => s.kind === kind)?.label ?? fallback;
  const action = {
    request_new_code: props.onNewCode,
    update_data_at_eps: () => setGuidance(TEXTS.epsGuidance),
    in_person_service: () => setGuidance(TEXTS.inPersonGuidance),
  };
  return (
    <main>
      <p role="alert">{props.reason === 'expired' ? TEXTS.codeExpired : TEXTS.attemptsExhausted}</p>
      <ul>
        {EXIT_STEPS.map((step) => (
          <li key={step.kind}>
            <button type="button" onClick={action[step.kind]}>
              {label(step.kind, step.label)}
            </button>
          </li>
        ))}
      </ul>
      {guidance && <p role="status">{guidance}</p>}
    </main>
  );
}
