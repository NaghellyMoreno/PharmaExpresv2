import { useEffect, useRef, useState, type FormEvent } from 'react';
import { requestVerificationCode, verifyIdentity } from './api';
import { TEXTS } from './texts';

type Phase =
  | { name: 'cedula' }
  | { name: 'code'; challengeId: string; message: string }
  | { name: 'verified'; challengeId: string; message: string };

const CEDULA_FORMAT = /^[0-9]{5,12}$/;
const CODE_FORMAT = /^[0-9]{6}$/;

/**
 * P-02: cédula, código de un solo uso y verificación. El mensaje aprobado sale de la respuesta 202 de la API
 * (idéntico exista o no la cédula) y solo se muestra después de recibirla.
 */
export function IdentityStep() {
  const [phase, setPhase] = useState<Phase>({ name: 'cedula' });
  if (phase.name === 'cedula') return <CedulaForm onAccepted={(r) => setPhase({ name: 'code', ...r })} />;
  if (phase.name === 'verified') {
    return (
      <main>
        <p role="status">{TEXTS.verified}</p>
        <button type="button" onClick={() => setPhase({ ...phase, name: 'code' })}>
          {TEXTS.verifyAnother}
        </button>
      </main>
    );
  }
  return <CodeForm challengeId={phase.challengeId} message={phase.message} onVerified={() => setPhase({ ...phase, name: 'verified' })} />;
}

function CedulaForm(props: { onAccepted: (r: { challengeId: string; message: string }) => void }) {
  const [cedula, setCedula] = useState('');
  const [error, setError] = useState<'invalid' | 'request' | null>(null);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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
    } catch {
      setError('request');
      setPending(false);
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
            {error === 'invalid' ? TEXTS.cedulaInvalid : TEXTS.requestError}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {TEXTS.continue}
        </button>
      </form>
    </main>
  );
}

function CodeForm(props: { challengeId: string; message: string; onVerified: () => void }) {
  const [code, setCode] = useState('');
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
    if (outcome === 'verified') return props.onVerified();
    setError(outcome);
    setPending(false);
    input.current?.focus();
  }

  const errorText = {
    incomplete: TEXTS.codeIncomplete,
    incorrect: TEXTS.codeIncorrect,
    used: TEXTS.codeUsed,
    error: TEXTS.verifyError,
  };
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
