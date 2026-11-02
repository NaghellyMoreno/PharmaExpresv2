import { EXIT_PATHS, OTP_REQUEST_MESSAGE } from '../identity/messages';
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
  // F006: cadenas Inferidas, las mismas de la web (F005) para que ambos canales digan lo mismo; la usuaria debe confirmarlas.
  codeExpired: 'El código venció. Elija una opción para continuar.',
  codeExhausted: 'Se agotaron los intentos. Elija una opción para continuar.',
  askCedulaForNewCode: 'Escriba la cédula del paciente para pedir un código nuevo.',
  updateDataAtEps:
    'El celular y el correo se cambian en su EPS (Salud Total o Sanitas), no en Pharma Express. Comuníquese con su EPS para actualizar sus datos y luego pida un código nuevo.',
  inPersonService: 'Puede acudir a la atención presencial en un punto de Disfarma en Manizales.',
  codeTooSoon: 'Ya enviamos un código hace poco. Espere 2 minutos para pedir uno nuevo.',
  /** F010: cadenas Inferidas (B-03 mínima); la usuaria debe confirmarlas. */
  bindingLive: (name: string, date: string) => `Paciente vinculado: ${name}. Vinculación vigente hasta el ${date}.`,
  bindingExpired: 'Su vinculación venció. Para continuar necesita un código nuevo.',
  codeHourlyLimit: 'Alcanzó el límite de códigos por hora. Intente más tarde o acuda a la atención presencial.',
} as const;

/** `callback_data` de los botones: sin datos del usuario y de 64 bytes o menos. */
export const CALLBACKS = {
  acceptHolder: 'accept:holder',
  acceptThirdParty: 'accept:third_party',
  reject: 'reject',
  revoke: 'revoke',
} as const;

/** Botones de los tres caminos de salida (F006): `callback_data` fijo, en el orden y con las etiquetas de `EXIT_PATHS`. */
export const EXIT_PATH_CALLBACKS = {
  request_new_code: 'path:request_new_code',
  update_data_at_eps: 'path:update_data_at_eps',
  in_person_service: 'path:in_person_service',
} as const;
export const EXIT_BUTTONS = EXIT_PATHS.map((path) => ({
  label: path.label,
  data: EXIT_PATH_CALLBACKS[path.kind as keyof typeof EXIT_PATH_CALLBACKS],
}));
