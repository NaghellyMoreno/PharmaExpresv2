import type { components } from '@pharma/api-contract';

export type PrivacyNotice = components['schemas']['PrivacyNotice'];

/**
 * Aviso vigente. Las versiones de los textos viven en el código (docs/03-arquitectura.md).
 * PENDIENTE: el texto es provisional; la usuaria o un abogado debe aprobar el definitivo
 * (responsable del tratamiento, finalidades, derechos y canal de contacto) antes de publicar.
 */
export const PRIVACY_NOTICE: PrivacyNotice = {
  version: '2026-10-v1',
  title: 'Aviso de privacidad y tratamiento de datos personales',
  body:
    'Texto provisional, pendiente de aprobación. Este aviso explicará quién trata sus datos personales, ' +
    'para qué y cómo ejercer sus derechos. Para continuar por la web debe aceptarlo; ' +
    'si no lo acepta, puede acudir a la atención presencial.',
  declaration: 'Soy el titular o actúo con su autorización',
  revocationOption: {
    label: 'Revocar mi autorización',
    cedulaUseNotice: 'La cédula se usa solo para verificar la identidad y atender la solicitud.',
  },
};
