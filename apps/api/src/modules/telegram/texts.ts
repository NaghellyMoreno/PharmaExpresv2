import { PRIVACY_NOTICE } from '../identity/privacy-notice';

/** Cadenas del bot en español de Colombia (contratos/F002.md, anexo de T.1). */
export const BOT_TEXTS = {
  /** El aviso se arma con la misma fuente que la web: PRIVACY_NOTICE. */
  notice: `${PRIVACY_NOTICE.title}\n\n${PRIVACY_NOTICE.body}\n\n${PRIVACY_NOTICE.declaration}`,
  acceptHolder: 'Acepto como titular',
  acceptThirdParty: 'Acepto, actúo con su autorización',
  reject: 'No acepto',
  revoke: PRIVACY_NOTICE.revocationOption.label,
  rejected: 'Sin aceptar el aviso no podemos continuar por Telegram. Puede acudir a la atención presencial.',
  revokePlaceholder: 'Esta opción estará disponible próximamente.',
  askCedula: `Gracias. Escriba la cédula del paciente. ${PRIVACY_NOTICE.revocationOption.cedulaUseNotice}`,
} as const;

/** `callback_data` de los botones: sin datos del usuario y de 64 bytes o menos. */
export const CALLBACKS = {
  acceptHolder: 'accept:holder',
  acceptThirdParty: 'accept:third_party',
  reject: 'reject',
  revoke: 'revoke',
} as const;
