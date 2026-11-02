import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { PrivacyNotice } from './api';

const notice: PrivacyNotice = {
  version: 'v-prueba',
  title: 'Título de prueba 1',
  body: 'Cuerpo de prueba 1',
  declaration: 'Soy el titular o actúo con su autorización',
  revocationOption: {
    label: 'Revocar mi autorización',
    cedulaUseNotice: 'La cédula se usa solo para verificar la identidad y atender la solicitud.',
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.history.pushState({}, '', '/');
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? new Response(null, { status: 204 }) : json(notice),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

describe('P-01 Inicio', () => {
  it('muestra el aviso que llega de la API, con encabezado h1 y la declaración', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Título de prueba 1' })).toBeInTheDocument();
    expect(screen.getByText('Cuerpo de prueba 1')).toBeInTheDocument();
    expect(screen.getByText(notice.declaration)).toBeInTheDocument();
  });

  it('no tiene campo de cédula ni inputs de texto, correo o teléfono (criterio 1.3)', async () => {
    const { container } = render(<App />);
    await screen.findByRole('heading', { level: 1 });
    expect(container.querySelectorAll('input[type=text], input[type=tel], input[type=email], input[type=number], input[name*=cedula i]')).toHaveLength(0);
    expect(screen.queryByLabelText('Cédula')).toBeNull();
  });

  it('muestra "Revocar mi autorización" como enlace a /revocar sin parámetros y la frase de la cédula', async () => {
    render(<App />);
    const link = await screen.findByRole('link', { name: 'Revocar mi autorización' });
    expect(link.getAttribute('href')).toBe('/revocar');
    expect(screen.getByText(notice.revocationOption.cedulaUseNotice)).toBeInTheDocument();
  });

  it('"Aceptar" está deshabilitado mientras no se elija quién acepta y no envía petición', async () => {
    render(<App />);
    const accept = await screen.findByRole('button', { name: 'Aceptar' });
    expect(accept).toBeDisabled();
    await userEvent.click(accept);
    expect(posts()).toHaveLength(0);
  });

  it('al rechazar muestra la atención presencial, no hace peticiones y se puede volver al aviso', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'No acepto' }));
    expect(screen.getByText(/atención presencial/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Cédula')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Volver al aviso' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Título de prueba 1' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Actúo con su autorización', 'third_party'],
    ['Soy el titular', 'holder'],
  ])('al elegir "%s" envía declarant %s con la versión vigente y pasa a la cédula', async (label, declarant) => {
    render(<App />);
    await userEvent.click(await screen.findByLabelText(label));
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByLabelText('Cédula')).toBeInTheDocument();
    const [url, init] = posts()[0];
    expect(url).toBe('/api/v1/consents/acceptance');
    expect(JSON.parse(init.body)).toEqual({ noticeVersion: 'v-prueba', declarant });
  });

  it('si la aceptación falla muestra el error y no muestra la cédula', async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ status: 409 }, 409) : json(notice),
    );
    render(<App />);
    await userEvent.click(await screen.findByLabelText('Soy el titular'));
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByText('No pudimos registrar su aceptación. Intente de nuevo.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cédula')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
  });

  // F003 sustituye el criterio 5.3 de F001 (el esqueleto de P-02 no enviaba nada): ahora la cédula va a /identity/otp-requests.
  it('tras aceptar, el botón de P-02 pide el código a /identity/otp-requests y no a otra ruta', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/identity/otp-requests')) return json({ challengeId: 'c-1', message: 'Mensaje de prueba', resendAvailableInSeconds: 120 }, 202);
      return init?.method === 'POST' ? new Response(null, { status: 204 }) : json(notice);
    });
    render(<App />);
    await userEvent.click(await screen.findByLabelText('Soy el titular'));
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await userEvent.type(await screen.findByLabelText('Cédula'), '1000000001');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Mensaje de prueba')).toBeInTheDocument();
    expect(posts().map(([u]) => u)).toEqual(['/api/v1/consents/acceptance', '/api/v1/identity/otp-requests']);
  });

  it('si el aviso no carga muestra el error y "Reintentar", sin botones de aceptar ni cédula, y reintentar funciona', async () => {
    fetchMock.mockImplementationOnce(async () => json({}, 500));
    render(<App />);
    expect(await screen.findByText('No pudimos cargar el aviso de privacidad. Intente de nuevo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'No acepto' })).toBeNull();
    expect(screen.queryByLabelText('Cédula')).toBeNull();
    expect(screen.getByRole('link', { name: 'Revocar mi autorización' }).getAttribute('href')).toBe('/revocar');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Título de prueba 1' })).toBeInTheDocument());
  });
});

describe('/revocar', () => {
  it('muestra el marcador sin aviso, sin cédula y sin peticiones', () => {
    window.history.pushState({}, '', '/revocar');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Revocar mi autorización' })).toBeInTheDocument();
    expect(screen.getByText('Esta opción estará disponible próximamente.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
    expect(screen.queryByLabelText('Cédula')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
