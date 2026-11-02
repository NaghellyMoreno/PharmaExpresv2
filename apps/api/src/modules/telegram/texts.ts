import { OTP_REQUEST_MESSAGE } from '../identity/messages';
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
  /** Mensaje aprobado al pedir el código (HU-002 criterio 6): el mismo de la web, exista o no la cédula. */
  codeRequested: OTP_REQUEST_MESSAGE,
  // Cadenas Inferidas del contrato de F004 (anexo de T.1); la usuaria debe confirmarlas.
  verified: 'Identidad verificada',
  codeIncorrect: 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.',
  codeUsed: 'Este código ya se usó. Pida un código nuevo.',
  cedulaInvalid: 'Cédula inválida. Escriba entre 5 y 12 dígitos.',
  codeIncomplete: 'Código incompleto. Escriba los 6 dígitos.',
  codeNotSent: 'No pudimos enviar el código. Intente de nuevo.',
  codeNotVerified: 'No pudimos verificar el código. Intente de nuevo.',
} as const;

/** `callback_data` de los botones: sin datos del usuario y de 64 bytes o menos. */
export const CALLBACKS = {
  acceptHolder: 'accept:holder',
  acceptThirdParty: 'accept:third_party',
  reject: 'reject',
  revoke: 'revoke',
} as const;
