import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityStep } from './IdentityStep';

// Cadenas del anexo de T.1 (contracts/F003.md), escritas aquí a propósito: la prueba no las toma del código.
const S = {
  approved:
    'Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial.',
  codeLabel: 'Código de verificación',
  verify: 'Verificar',
  verified: 'Identidad verificada',
  incorrect: 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.',
  used: 'Este código ya se usó. Pida un código nuevo.',
  requestError: 'No pudimos enviar el código. Intente de nuevo.',
  cedulaInvalid: 'Cédula inválida. Escriba entre 5 y 12 dígitos.',
  incomplete: 'Código incompleto. Escriba los 6 dígitos.',
  another: 'Verificar otro código',
  cedula: 'Cédula',
  next: 'Continuar',
};

const problem = (status: number, code: string) => new Response(JSON.stringify({ status, code }), { status });
const accepted = () =>
  new Response(JSON.stringify({ challengeId: 'c-1', message: S.approved, resendAvailableInSeconds: 120 }), { status: 202 });
let fetchMock: ReturnType<typeof vi.fn>;
let verifyResponse: () => Response | Promise<Response>;

beforeEach(() => {
  verifyResponse = () => new Response('{}', { status: 200 });
  fetchMock = vi.fn(async (url: string) => (url.endsWith('/otp-requests') ? accepted() : verifyResponse()));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const calls = (suffix: string) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(suffix));
async function toCodeStep(cedula = '1000000001') {
  render(<IdentityStep />);
  await userEvent.type(screen.getByLabelText(S.cedula), cedula);
  await userEvent.click(screen.getByRole('button', { name: S.next }));
  await screen.findByLabelText(S.codeLabel);
}

describe('P-02: pedir el código', () => {
  it('7.1 y 8.1: muestra exactamente el mensaje aprobado en un role=status y el campo del código', async () => {
    await toCodeStep();
    expect(screen.getByRole('status').textContent).toBe(S.approved);
    expect(calls('/identity/otp-requests')).toHaveLength(1);
    expect(JSON.parse(calls('/identity/otp-requests')[0][1].body)).toEqual({ cedula: '1000000001' });
  });

  it.each(['', 'abc', '1234', '1234567890123'])('1.8: la cédula "%s" no envía petición, muestra el error y conserva el foco', async (value) => {
    render(<IdentityStep />);
    const field = screen.getByLabelText(S.cedula);
    if (value) await userEvent.type(field, value);
    await userEvent.click(screen.getByRole('button', { name: S.next }));
    expect(screen.getByRole('alert')).toHaveTextContent(S.cedulaInvalid);
    expect(field).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('7.3: durante la petición el botón está deshabilitado y el mensaje no aparece antes del 202', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));
    render(<IdentityStep />);
    await userEvent.type(screen.getByLabelText(S.cedula), '1000000001');
    await userEvent.click(screen.getByRole('button', { name: S.next }));
    expect(screen.getByRole('button', { name: S.next })).toBeDisabled();
    expect(screen.queryByRole('status')).toBeNull();
    release(accepted());
    expect(await screen.findByRole('status')).toHaveTextContent(S.approved);
  });

  it.each([
    ['5xx', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['401', () => Promise.resolve(problem(401, 'unauthorized'))],
    ['falla de red', () => Promise.reject(new TypeError('network'))],
  ])('7.3 y 1.7: con %s muestra el error y no el mensaje aprobado ni el campo del código', async (_name, answer) => {
    fetchMock.mockImplementation(answer);
    render(<IdentityStep />);
    await userEvent.type(screen.getByLabelText(S.cedula), '1000000001');
    await userEvent.click(screen.getByRole('button', { name: S.next }));
    expect(await screen.findByRole('alert')).toHaveTextContent(S.requestError);
    expect(screen.queryByText(S.approved)).toBeNull();
    expect(screen.queryByLabelText(S.codeLabel)).toBeNull();
    expect(screen.getByRole('button', { name: S.next })).toBeEnabled();
  });
});

describe('P-02: verificar el código', () => {
  it('4.1: un código correcto muestra "Identidad verificada" en un role=status con una sola petición', async () => {
    await toCodeStep();
    await userEvent.type(screen.getByLabelText(S.codeLabel), '204871');
    await userEvent.click(screen.getByRole('button', { name: S.verify }));
    expect(await screen.findByText(S.verified)).toHaveAttribute('role', 'status');
    expect(calls('/identity/verifications')).toHaveLength(1);
    expect(JSON.parse(calls('/identity/verifications')[0][1].body)).toEqual({ challengeId: 'c-1', code: '204871' });
  });

  it.each(['', '12345'])('4.10: el código "%s" no envía petición, muestra el error y conserva el foco', async (value) => {
    await toCodeStep();
    const field = screen.getByLabelText(S.codeLabel);
    if (value) await userEvent.type(field, value);
    await userEvent.click(screen.getByRole('button', { name: S.verify }));
    expect(screen.getByRole('alert')).toHaveTextContent(S.incomplete);
    expect(field).toHaveFocus();
    expect(calls('/identity/verifications')).toHaveLength(0);
  });

  it('4.6: un código incorrecto (422) muestra el mensaje y el campo conserva el foco', async () => {
    verifyResponse = () => problem(422, 'code_incorrect');
    await toCodeStep();
    await userEvent.type(screen.getByLabelText(S.codeLabel), '000000');
    await userEvent.click(screen.getByRole('button', { name: S.verify }));
    expect(await screen.findByRole('alert')).toHaveTextContent(S.incorrect);
    expect(screen.getByLabelText(S.codeLabel)).toHaveFocus();
    expect(screen.queryByText(S.verified)).toBeNull();
  });

  it('6.2: tras el éxito, "Verificar otro código" vuelve al formulario y el mismo código (410 code_superseded) muestra "Código ya usado"', async () => {
    await toCodeStep();
    await userEvent.type(screen.getByLabelText(S.codeLabel), '204871');
    await userEvent.click(screen.getByRole('button', { name: S.verify }));
    await screen.findByText(S.verified);
    verifyResponse = () => problem(410, 'code_superseded');
    await userEvent.click(screen.getByRole('button', { name: S.another }));
    await userEvent.type(screen.getByLabelText(S.codeLabel), '204871');
    await userEvent.click(screen.getByRole('button', { name: S.verify }));
    expect(await screen.findByRole('alert')).toHaveTextContent(S.used);
    expect(screen.queryByText(S.verified)).toBeNull();
    expect(JSON.parse(calls('/identity/verifications')[1][1].body)).toEqual({ challengeId: 'c-1', code: '204871' });
  });

  it('un fallo de red al verificar muestra el error y permite reintentar', async () => {
    verifyResponse = () => Promise.reject(new TypeError('network'));
    await toCodeStep();
    await userEvent.type(screen.getByLabelText(S.codeLabel), '204871');
    await userEvent.click(screen.getByRole('button', { name: S.verify }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: S.verify })).toBeEnabled());
  });
});

// F005 (contracts/F005.md): caminos de salida, orientación y límites de pedido. Cadenas del anexo escritas a propósito.
const F = {
  expired: 'El código venció. Elija una opción para continuar.',
  exhausted: 'Se agotaron los intentos. Elija una opción para continuar.',
  newCode: 'Pedir un código nuevo',
  eps: 'Actualizar mis datos en la EPS',
  inPerson: 'Acudir a la atención presencial',
  epsGuidance:
    'El celular y el correo se cambian en su EPS (Salud Total o Sanitas), no en Pharma Express. Comuníquese con su EPS para actualizar sus datos y luego pida un código nuevo.',
  inPersonGuidance: 'Puede acudir a la atención presencial en un punto de Disfarma en Manizales.',
  tooSoon: 'Ya enviamos un código hace poco. Espere 2 minutos para pedir uno nuevo.',
  hourly: 'Alcanzó el límite de códigos por hora. Intente más tarde o acuda a la atención presencial.',
};
const NEXT_STEPS = [
  { kind: 'request_new_code', label: F.newCode },
  { kind: 'update_data_at_eps', label: F.eps },
  { kind: 'in_person_service', label: F.inPerson },
];
const gone = (code: string, nextSteps: unknown[] = NEXT_STEPS) => new Response(JSON.stringify({ status: 410, code, nextSteps }), { status: 410 });
const incorrect = (attemptsRemaining: number) => new Response(JSON.stringify({ status: 422, code: 'code_incorrect', attemptsRemaining }), { status: 422 });
async function submitCode(code = '204871') {
  await toCodeStep();
  await userEvent.type(screen.getByLabelText(S.codeLabel), code);
  await userEvent.click(screen.getByRole('button', { name: S.verify }));
}
const threePaths = () => {
  for (const name of [F.newCode, F.eps, F.inPerson]) expect(screen.getByRole('button', { name })).toBeInTheDocument();
};

describe('P-02: caminos de salida (F005)', () => {
  it.each([
    ['1.7: 410 code_expired', () => gone('code_expired'), F.expired],
    ['2.8: 410 code_attempts_exhausted', () => gone('code_attempts_exhausted'), F.exhausted],
    ['2.7: el tercer error (422 con attemptsRemaining 0)', () => incorrect(0), F.exhausted],
  ])('%s quita el campo y "Verificar", muestra el mensaje en role=alert y los tres caminos', async (_n, answer, text) => {
    verifyResponse = answer;
    await submitCode();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('alert').textContent).toBe(text);
    expect(screen.queryByLabelText(S.codeLabel)).toBeNull();
    expect(screen.queryByRole('button', { name: S.verify })).toBeNull();
    expect(screen.queryByText(S.verified)).toBeNull();
    threePaths();
  });

  it('2.7: tras dos errores (422 con attemptsRemaining 1) la pantalla sigue con el campo y sin los caminos', async () => {
    verifyResponse = () => incorrect(1);
    await submitCode();
    expect(await screen.findByRole('alert')).toHaveTextContent(S.incorrect);
    expect(screen.getByLabelText(S.codeLabel)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: F.newCode })).toBeNull();
  });

  it('410 code_superseded no ofrece los caminos y conserva el mensaje de F003', async () => {
    verifyResponse = () => problem(410, 'code_superseded');
    await submitCode();
    expect(await screen.findByRole('alert')).toHaveTextContent(S.used);
    expect(screen.queryByRole('button', { name: F.newCode })).toBeNull();
  });

  it('3.4: "Pedir un código nuevo" vuelve al campo de cédula, vacío y con el foco', async () => {
    verifyResponse = () => gone('code_expired');
    await submitCode();
    await userEvent.click(await screen.findByRole('button', { name: F.newCode }));
    const field = screen.getByLabelText(S.cedula);
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(screen.queryByLabelText(S.codeLabel)).toBeNull();
  });

  it('3.5 y 4.1: los otros dos caminos solo muestran su texto, sin peticiones nuevas', async () => {
    verifyResponse = () => gone('code_attempts_exhausted');
    await submitCode();
    await userEvent.click(await screen.findByRole('button', { name: F.eps }));
    const before = fetchMock.mock.calls.length;
    expect(screen.getByText(F.epsGuidance)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: F.inPerson }));
    expect(screen.getByText(F.inPersonGuidance)).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('4.2: la vista de orientación no tiene formulario ni campos', async () => {
    verifyResponse = () => gone('code_expired');
    const { container } = render(<IdentityStep />);
    await userEvent.type(screen.getByLabelText(S.cedula), '1000000001');
    await userEvent.click(screen.getByRole('button', { name: S.next }));
    await userEvent.type(await screen.findByLabelText(S.codeLabel), '204871');
    await userEvent.click(screen.getByRole('button', { name: S.verify }));
    await userEvent.click(await screen.findByRole('button', { name: F.eps }));
    expect(container.querySelectorAll('form, input, textarea, select')).toHaveLength(0);
  });
});

describe('P-02: límites del pedido (F005)', () => {
  it.each([
    ['code_too_soon', F.tooSoon],
    ['code_hourly_limit', F.hourly],
  ])('el 429 %s muestra su mensaje en role=alert, sin el campo del código ni el mensaje aprobado, y el foco en la cédula', async (code, text) => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ status: 429, code, retryAfterSeconds: 30 }), { status: 429 }));
    render(<IdentityStep />);
    const field = screen.getByLabelText(S.cedula);
    await userEvent.type(field, '1000000001');
    await userEvent.click(screen.getByRole('button', { name: S.next }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('alert').textContent).toBe(text);
    expect(field).toHaveFocus();
    expect(screen.queryByLabelText(S.codeLabel)).toBeNull();
    expect(screen.queryByText(S.approved)).toBeNull();
    expect(screen.getByRole('button', { name: S.next })).toBeEnabled();
  });
});
