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
} as const;

/** Ruta de revocación (P-10). El enlace nunca lleva parámetros (invariante 1). */
export const REVOKE_PATH = '/revocar';
