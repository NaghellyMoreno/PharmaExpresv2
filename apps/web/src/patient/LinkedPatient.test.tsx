import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

// F009: el inicio reconoce al navegador vinculado con GET /me (contracts/F009.md, criterios 2.4, 2.9 y 2.10).
const binding = { patientRefId: '11111111-1111-4111-8111-111111111111', displayName: 'Paciente Ficticio Uno', expiresAt: '2027-02-28T17:00:00.000Z', hasHealthDataAuthorization: false };
const session = (bindings: unknown[]) => ({ bindings, csrfToken: 'token-de-prueba', pushEnabled: false });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const notice = { version: 'v', title: 'Aviso de prueba', body: 'Cuerpo', declaration: 'Declaro', revocationOption: { label: 'Revocar mi autorización', cedulaUseNotice: 'x' } };

let fetchMock: ReturnType<typeof vi.fn>;
const urls = () => fetchMock.mock.calls.map(([url]) => String(url));
function stub(me: () => Response | Promise<Response>) {
  fetchMock = vi.fn(async (url: string) => (String(url).endsWith('/me') ? me() : json(notice)));
  vi.stubGlobal('fetch', fetchMock);
}
beforeEach(() => window.history.pushState({}, '', '/'));
afterEach(() => vi.unstubAllGlobals());

describe('P-03 mínima', () => {
  it('con una vinculación vigente muestra al paciente y el vencimiento, sin aviso ni campos, y no pide el aviso', async () => {
    stub(() => json(session([binding])));
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Paciente vinculado' })).toBeInTheDocument();
    expect(screen.getByText('Paciente Ficticio Uno')).toBeInTheDocument();
    expect(screen.getByText('Vinculación vigente hasta el 28 de febrero de 2027.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revocar mi autorización' })).toHaveAttribute('href', '/revocar');
    expect(screen.queryByText('Aviso de prueba')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(urls().filter((u) => u.endsWith('/privacy-notice'))).toHaveLength(0);
  });

  it.each([
    ['401', () => json({ title: 'x' }, 401)],
    ['bindings vacío', () => json(session([]))],
  ])('con %s sigue el recorrido normal: muestra el aviso y ningún nombre', async (_name, me) => {
    stub(me);
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de prueba' })).toBeInTheDocument();
    expect(screen.queryByText('Paciente Ficticio Uno')).toBeNull();
  });

  it('mientras responde muestra "Cargando…"; si falla muestra el error con "Reintentar" y "Revocar", y reintenta', async () => {
    let calls = 0;
    stub(() => (++calls === 1 ? json({}, 500) : json(session([binding]))));
    render(<App />);
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos');
    expect(screen.getByRole('link', { name: 'Revocar mi autorización' })).toBeInTheDocument();
    expect(screen.queryByText('Paciente Ficticio Uno')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Paciente Ficticio Uno')).toBeInTheDocument();
  });

  it('un corte de red muestra el error y no el aviso', async () => {
    stub(() => Promise.reject(new TypeError('red')));
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Aviso de prueba')).toBeNull();
  });
});
