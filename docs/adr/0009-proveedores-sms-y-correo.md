# 0009. Proveedores de SMS y correo, con modo de prueba

- **Estado:** Pendiente (proveedor y costo los decide la usuaria)
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.2, 3.6, 3.8 y 3.12; guía de agentes (architect, punto 5); brief (riesgo "Proveedor y costo de SMS y correo no definidos")

## Contexto
SMS y correo son reales (sección 3.8); las pruebas usan los números y correos de la usuaria (sección 3.2). Bloquean la verificación de identidad, las notificaciones y los enlaces de contraseña del personal. El proveedor y el costo están Pendientes.

## Decisión
1. **Puerto común:** `SmsSender` y `EmailSender` con adaptadores intercambiables por variable (`SMS_PROVIDER`, `EMAIL_PROVIDER`). El dominio no conoce al proveedor.
2. **Tres modos (`MESSAGING_MODE`):**
   - `capture` (local y pruebas automáticas): no envía nada; guarda los mensajes en una tabla de prueba solo existente fuera de producción, para que las pruebas revisen que no hay medicamentos ni diagnósticos.
   - `sandbox` (vista previa): credenciales de prueba del proveedor o lista blanca: solo se envía a los contactos de prueba de la usuaria (`MESSAGING_ALLOWLIST`); cualquier otro destino se descarta y se registra sin el dato.
   - `live` (producción del prototipo): envío real; con datos simulados, los contactos de la EPS simulada son los de la usuaria.
3. **Fallos:** envío desde la bandeja de salida con reintentos (ADR 0010); 5 intentos con espera creciente (Inferido); tras agotar, queda `failed` y visible en logs sin destinatario.
4. **Opciones propuestas (para que la usuaria escoja):**

SMS:
| Opción | Modo de prueba verificado | Costo verificado | Observaciones |
| --- | --- | --- | --- |
| Twilio (SDK `twilio` 6.2.0) | Credenciales de prueba con números mágicos (`+15005550006`): no cobra ni entrega | US$0,0592 por segmento a Colombia más US$0,001 por mensaje fallido; número desde US$1,15/mes (página de precios de Twilio, Colombia) | Registro de remitente en Colombia no documentado en la página; a confirmar |
| Proveedor colombiano (por ejemplo, Hablame o LabsMobile) | No verificado | No verificado | Posible menor costo local; architect no verificó su documentación: requiere que la usuaria lo proponga |
| Amazon SNS | No verificado en esta revisión | No verificado | Requiere cuenta AWS |

Correo:
| Opción | Modo de prueba verificado | Costo verificado | Observaciones |
| --- | --- | --- | --- |
| Resend (SDK `resend` 6.37.0) | Direcciones `delivered@resend.dev`, `bounced@resend.dev`, etc. (cuentan en la cuota) | Gratis: 3.000 correos al mes, 100 al día, 3 dominios; Pro US$20/mes | Requiere dominio propio verificado para enviar a terceros |
| Otro (Brevo, Amazon SES) | No verificado | No verificado | |

Recomendación de architect (Inferido): Twilio para SMS y Resend para correo, por tener modo de prueba documentado y SDK en TypeScript.

## Alternativas consideradas
Las de las tablas. También se descartó enviar el código solo por correo: contradice la sección 3.2 (SMS obligatorio).

## Consecuencias
- Pendiente bloqueante para F003 a F006 y F040 a F048 en producción: proveedor, cuenta, remitente y presupuesto.
- Pendiente: dominio de correo propio para Resend (o el proveedor escogido).
