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
  // F005 (cadenas con asterisco del anexo: Inferido hasta que la usuaria las confirme).
  codeExpired: 'El código venció. Elija una opción para continuar.',
  attemptsExhausted: 'Se agotaron los intentos. Elija una opción para continuar.',
  epsGuidance:
    'El celular y el correo se cambian en su EPS (Salud Total o Sanitas), no en Pharma Express. Comuníquese con su EPS para actualizar sus datos y luego pida un código nuevo.',
  inPersonGuidance: 'Puede acudir a la atención presencial en un punto de Disfarma en Manizales.',
  tooSoon: 'Ya enviamos un código hace poco. Espere 2 minutos para pedir uno nuevo.',
  hourlyLimit: 'Alcanzó el límite de códigos por hora. Intente más tarde o acuda a la atención presencial.',
} as const;

/** Los tres caminos de salida, en orden. Se usan cuando la respuesta no los trae (tercer error). */
export const EXIT_STEPS: Array<{ kind: 'request_new_code' | 'update_data_at_eps' | 'in_person_service'; label: string }> = [
  { kind: 'request_new_code', label: 'Pedir un código nuevo' },
  { kind: 'update_data_at_eps', label: 'Actualizar mis datos en la EPS' },
  { kind: 'in_person_service', label: 'Acudir a la atención presencial' },
];

/** Ruta de revocación (P-10). El enlace nunca lleva parámetros (invariante 1). */
export const REVOKE_PATH = '/revocar';
