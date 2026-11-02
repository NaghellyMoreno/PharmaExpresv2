// Textos de la interfaz del paciente (español de Colombia). Los del aviso vienen de la API.
export const TEXTS = {
  holder: 'Soy el titular',
  authorized: 'Actúo con su autorización',
  accept: 'Aceptar',
  reject: 'No acepto',
  rejected: 'Sin aceptar el aviso no podemos continuar por la web. Puede acudir a la atención presencial.',
  backToNotice: 'Volver al aviso',
  loadError: 'No pudimos cargar el aviso de privacidad. Intente de nuevo.',
  retry: 'Reintentar',
  acceptError: 'No pudimos registrar su aceptación. Intente de nuevo.',
  revokeLabel: 'Revocar mi autorización',
  revokeSoon: 'Esta opción estará disponible próximamente.',
  cedula: 'Cédula',
  continue: 'Continuar',
  // P-02 (F003). Las cadenas con asterisco del anexo del contrato son Inferido hasta que la usuaria las confirme.
  codeLabel: 'Código de verificación',
  verify: 'Verificar',
  verified: 'Identidad verificada',
  codeIncorrect: 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.',
  codeUsed: 'Este código ya se usó. Pida un código nuevo.',
  requestError: 'No pudimos enviar el código. Intente de nuevo.',
  cedulaInvalid: 'Cédula inválida. Escriba entre 5 y 12 dígitos.',
  codeIncomplete: 'Código incompleto. Escriba los 6 dígitos.',
  verifyAnother: 'Verificar otro código',
  // Fuera del anexo: errores de red o del servidor al verificar, y códigos vencidos o con intentos agotados (F005).
  verifyError: 'No pudimos verificar el código. Intente de nuevo.',
} as const;

/** Ruta de revocación (P-10). El enlace nunca lleva parámetros (invariante 1). */
export const REVOKE_PATH = '/revocar';
