import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

// F011 (contracts/F011.md): P-03 con varios pacientes, "Iniciar una gestión", selección y "gestión a nombre de".
// Las cadenas están escritas aquí a propósito (T.1), no tomadas del código.
const A = { patientRefId: '11111111-1111-4111-8111-111111111111', displayName: 'Paciente Ficticio Uno', expiresAt: '2027-03-01T17:00:00.000Z', hasHealthDataAuthorization: false };
const B = { patientRefId: '22222222-2222-4222-8222-222222222222', displayName: 'Paciente Ficticio Dos', expiresAt: '2027-05-01T17:00:00.000Z', hasHealthDataAuthorization: false };
const session = (bindings: unknown[]) => ({ bindings, csrfToken: 'token-de-prueba', pushEnabled: false });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const notice = { version: 'v', title: 'Aviso de prueba', body: 'Cuerpo', declaration: 'Declaro', revocationOption: { label: 'Revocar mi autorización', cedulaUseNotice: 'x' } };

let fetchMock: ReturnType<typeof vi.fn>;
let meResponses: Array<() => Response | Promise<Response>>;
const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/api\/v1/, '')}`);
function stub(...me: Array<() => Response | Promise<Response>>) {
  meResponses = me;
  fetchMock = vi.fn(async (url: string) => {
    if (!String(url).endsWith('/me')) return json(notice);
    const next = meResponses.length > 1 ? meResponses.shift()! : meResponses[0];
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
}
beforeEach(() => window.history.pushState({}, '', '/'));
afterEach(() => vi.unstubAllGlobals());

describe('P-03 con varios pacientes', () => {
  it('lista A y luego B con su vencimiento y ofrece "Vincular otro paciente", "Iniciar una gestión" y "Revocar mi autorización"', async () => {
    stub(() => json(session([A, B])));
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Paciente vinculado' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Paciente Ficticio UnoVinculación vigente hasta el 1 de marzo de 2027.',
      'Paciente Ficticio DosVinculación vigente hasta el 1 de mayo de 2027.',
    ]);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Vincular otro paciente', 'Iniciar una gestión']);
    expect(screen.getByRole('link', { name: 'Revocar mi autorización' })).toHaveAttribute('href', '/revocar');
  });

  it('"Vincular otro paciente" lleva al aviso (P-01) sin cédula ni nombres', async () => {
    stub(() => json(session([A])));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Vincular otro paciente' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de prueba' })).toBeInTheDocument();
    expect(screen.queryByText('Paciente Ficticio Uno')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(calls().filter((c) => c.startsWith('POST'))).toEqual([]);
  });
});

describe('Iniciar una gestión', () => {
  it('con dos vinculaciones consulta GET /me y muestra la selección con solo los nombres, sin continuar hasta escoger', async () => {
    stub(() => json(session([A, B])));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar una gestión' }));
    expect(await screen.findByRole('heading', { level: 1, name: '¿A nombre de quién va a hacer la gestión?' })).toBeInTheDocument();
    expect(calls().filter((c) => c === 'GET /me')).toHaveLength(2);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Paciente Ficticio Uno', 'Paciente Ficticio Dos']);
    expect(screen.getByRole('link', { name: 'Revocar mi autorización' })).toBeInTheDocument();
    expect(screen.queryByText(/Gestionando a nombre de/)).toBeNull();
    expect(screen.queryByText(/Vinculación vigente/)).toBeNull();
  });

  it('al escoger B muestra "Gestionando a nombre de Paciente Ficticio Dos" sin ningún dato de A; "Cambiar de paciente" vuelve a la selección', async () => {
    stub(() => json(session([A, B])));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar una gestión' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Paciente Ficticio Dos' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Gestionando a nombre de Paciente Ficticio Dos' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Paciente Ficticio Uno|marzo|11111111/);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cambiar de paciente']);
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar de paciente' }));
    expect(await screen.findByRole('heading', { level: 1, name: '¿A nombre de quién va a hacer la gestión?' })).toBeInTheDocument();
    expect(within(document.body).getAllByRole('button')).toHaveLength(2);
  });

  it('al escoger A es simétrico: ningún dato de B', async () => {
    stub(() => json(session([A, B])));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar una gestión' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Paciente Ficticio Uno' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Gestionando a nombre de Paciente Ficticio Uno' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Paciente Ficticio Dos|mayo|22222222/);
  });

  it('con una sola vinculación pasa directo a la gestión; "Cambiar de paciente" vuelve a P-03 porque no hay nada que escoger', async () => {
    stub(() => json(session([B])));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar una gestión' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestionando a nombre de Paciente Ficticio Dos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '¿A nombre de quién va a hacer la gestión?' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar de paciente' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Paciente vinculado' })).toBeInTheDocument();
  });

  it('si A venció con la página abierta, la segunda consulta solo trae a B y no se ofrece a A', async () => {
    stub(() => json(session([A, B])), () => json(session([B])));
    render(<App />);
    expect(await screen.findByText('Paciente Ficticio Uno')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar una gestión' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestionando a nombre de Paciente Ficticio Dos' })).toBeInTheDocument();
    expect(screen.queryByText('Paciente Ficticio Uno')).toBeNull();
  });

  it.each([
    ['500', () => json({}, 500)],
    ['un corte de red', () => Promise.reject(new TypeError('red'))],
  ])('ante %s muestra el error de sesión sin nombres; "Reintentar" repite y continúa', async (_n, failure) => {
    stub(() => json(session([A, B])), failure, () => json(session([A, B])));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar una gestión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar su sesión. Intente de nuevo.');
    expect(screen.queryByText('Paciente Ficticio Uno')).toBeNull();
    expect(screen.getByRole('link', { name: 'Revocar mi autorización' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: '¿A nombre de quién va a hacer la gestión?' })).toBeInTheDocument();
  });

  it('con 401 vuelve al aviso (P-01)', async () => {
    stub(() => json(session([A, B])), () => json({ title: 'x' }, 401));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar una gestión' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de prueba' })).toBeInTheDocument();
    expect(screen.queryByText('Paciente Ficticio Uno')).toBeNull();
  });

  it('la selección no se guarda en almacenamiento ni en la URL', async () => {
    stub(() => json(session([A, B])));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar una gestión' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Paciente Ficticio Dos' }));
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).toBe('{}');
    expect(window.location.href).toBe('http://localhost:3000/');
    expect(window.location.search + window.location.hash).toBe('');
  });
});
