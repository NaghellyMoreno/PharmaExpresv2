/**
 * Plantillas cerradas del código de verificación (ADR 0010). Su único parámetro es el código: nunca llevan
 * medicamentos, diagnósticos, cédula ni el nombre del paciente (invariante 1).
 * Textos Inferidos hasta que la usuaria los confirme. El SMS no lleva tildes ni la letra ñ, empieza por
 * "Pharma Express:" y cabe en 160 caracteres (sección 3.2).
 */
export function renderOtpSms(code: string): string {
  return `Pharma Express: tu codigo de verificacion es ${code}. Vence en 10 minutos.`;
}

export function renderOtpEmail(code: string): { subject: string; body: string } {
  return {
    subject: 'Pharma Express: codigo de verificacion',
    body: `Tu codigo de verificacion es ${code}. Vence en 10 minutos. Si no lo pediste, ignora este mensaje.`,
  };
}
