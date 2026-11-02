import type { components } from '@pharma/api-contract';

/** Mensaje aprobado al pedir el código (HU-002 criterio 6, sección 3.2). Idéntico exista o no la cédula. */
export const OTP_REQUEST_MESSAGE =
  'Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial.';

export const RESEND_AVAILABLE_IN_SECONDS = 120;

/** Los tres caminos de salida de un código vencido o con intentos agotados (HU-003 criterio 5, sección 3.2). Etiquetas Inferido (F005). */
export const EXIT_PATHS: components['schemas']['NextStep'][] = [
  { kind: 'request_new_code', label: 'Pedir un código nuevo' },
  { kind: 'update_data_at_eps', label: 'Actualizar mis datos en la EPS' },
  { kind: 'in_person_service', label: 'Acudir a la atención presencial' },
];

/** Espera mínima entre dos códigos de una misma cédula y máximo por hora (ADR 0006, decisión 4). */
export const MIN_SECONDS_BETWEEN_CODES = 120;
export const MAX_CODES_PER_HOUR = 5;
