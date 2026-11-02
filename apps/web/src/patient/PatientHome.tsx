import { useCallback, useEffect, useState } from 'react';
import { acceptPrivacyNotice, fetchLinkedBindings, fetchPrivacyNotice, type Binding, type Declarant, type PrivacyNotice } from './api';
import { IdentityStep } from './IdentityStep';
import { LinkedPatient } from './LinkedPatient';
import { REVOKE_PATH, TEXTS } from './texts';

type View =
  | { name: 'loading' }
  | { name: 'error' }
  | { name: 'linked'; bindings: Binding[] }
  | { name: 'notice'; notice: PrivacyNotice }
  | { name: 'rejected'; notice: PrivacyNotice }
  | { name: 'accepted' };

/**
 * Inicio. Primero pregunta a la API si este navegador tiene una vinculación vigente (P-03); si no, P-01 con el aviso.
 * Con vinculación vigente no se repite el aviso ni el código. No se pide ningún dato antes de aceptar (invariante 3).
 */
export function PatientHome() {
  const [view, setView] = useState<View>({ name: 'loading' });

  const load = useCallback(() => {
    setView({ name: 'loading' });
    fetchLinkedBindings()
      .then((bindings) =>
        bindings.length > 0
          ? setView({ name: 'linked', bindings })
          : fetchPrivacyNotice().then((notice) => setView({ name: 'notice', notice })),
      )
      .catch(() => setView({ name: 'error' }));
  }, []);
  useEffect(load, [load]);

  if (view.name === 'accepted') return <IdentityStep />;

  return (
    <main>
      {view.name === 'loading' && <p role="status">Cargando…</p>}
      {view.name === 'error' && (
        <section>
          <p role="alert">{TEXTS.loadError}</p>
          <button type="button" onClick={load}>
            {TEXTS.retry}
          </button>
          <p>
            <a href={REVOKE_PATH}>{TEXTS.revokeLabel}</a>
          </p>
        </section>
      )}
      {view.name === 'linked' && <LinkedPatient bindings={view.bindings} />}
      {view.name === 'rejected' && (
        <section>
          <p role="status">{TEXTS.rejected}</p>
          <button type="button" onClick={() => setView({ name: 'notice', notice: view.notice })}>
            {TEXTS.backToNotice}
          </button>
        </section>
      )}
      {view.name === 'notice' && (
        <NoticeView notice={view.notice} onReject={() => setView({ name: 'rejected', notice: view.notice })} onAccepted={() => setView({ name: 'accepted' })} />
      )}
    </main>
  );
}

function NoticeView(props: { notice: PrivacyNotice; onReject: () => void; onAccepted: () => void }) {
  const { notice } = props;
  const [declarant, setDeclarant] = useState<Declarant | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function accept() {
    // Decisión de F001 (criterio 4.8 c): "Aceptar" está deshabilitado hasta elegir quién acepta.
    if (!declarant || sending) return;
    setSending(true);
    setFailed(false);
    try {
      await acceptPrivacyNotice(notice.version, declarant);
      props.onAccepted();
    } catch {
      setFailed(true);
      setSending(false);
    }
  }

  return (
    <>
      <h1>{notice.title}</h1>
      <p>{notice.body}</p>
      <fieldset>
        <legend>{notice.declaration}</legend>
        <label>
          <input type="radio" name="declarant" checked={declarant === 'holder'} onChange={() => setDeclarant('holder')} />
          {TEXTS.holder}
        </label>
        <label>
          <input type="radio" name="declarant" checked={declarant === 'third_party'} onChange={() => setDeclarant('third_party')} />
          {TEXTS.authorized}
        </label>
      </fieldset>
      {failed && <p role="alert">{TEXTS.acceptError}</p>}
      <div className="actions">
        <button type="button" onClick={accept} disabled={!declarant || sending}>
          {TEXTS.accept}
        </button>
        <button type="button" onClick={props.onReject}>
          {TEXTS.reject}
        </button>
      </div>
      <p>
        <a href={REVOKE_PATH}>{notice.revocationOption.label}</a>
        <br />
        <span>{notice.revocationOption.cedulaUseNotice}</span>
      </p>
    </>
  );
}
