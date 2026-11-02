import { describe, expect, it } from 'vitest';
import { ConsentCookieService, type ConsentPayload } from '../src/modules/identity/consent-cookie.service';

const payload: ConsentPayload = {
  noticeVersion: '2026-10-v1',
  declarant: 'third_party',
  channel: 'web',
  acceptedAt: '2026-11-01T15:00:00.000Z',
};
const service = new ConsentCookieService('clave-solo-para-pruebas-1');

// Criterio 4.3: cookie firmada con HMAC.
describe('ConsentCookieService', () => {
  it('firma y verifica: la carga útil trae versión, declarante, canal web y fecha', () => {
    expect(service.verify(service.sign(payload))).toEqual(payload);
  });

  it('la carga útil decodificada no trae cédula ni otros datos personales', () => {
    const decoded = JSON.parse(Buffer.from(service.sign(payload).split('.')[0], 'base64url').toString());
    expect(Object.keys(decoded).sort()).toEqual(['acceptedAt', 'channel', 'declarant', 'noticeVersion']);
  });

  it('cambiar un byte de la carga útil hace fallar la verificación', () => {
    const [body, sig] = service.sign(payload).split('.');
    const bytes = Buffer.from(body, 'base64url');
    bytes[5] ^= 1;
    expect(service.verify(`${bytes.toString('base64url')}.${sig}`)).toBeNull();
  });

  it('cambiar un byte de la firma hace fallar la verificación', () => {
    const [body, sig] = service.sign(payload).split('.');
    const bytes = Buffer.from(sig, 'base64url');
    bytes[0] ^= 1;
    expect(service.verify(`${body}.${bytes.toString('base64url')}`)).toBeNull();
  });

  it('una firma hecha con otra clave no verifica', () => {
    const other = new ConsentCookieService('otra-clave-solo-para-pruebas-2');
    expect(service.verify(other.sign(payload))).toBeNull();
  });

  it('valores mal formados no verifican', () => {
    for (const bad of ['', 'abc', 'a.b.c', '.']) expect(service.verify(bad)).toBeNull();
  });

  it('exige una clave', () => {
    expect(() => new ConsentCookieService('')).toThrow();
  });
});
