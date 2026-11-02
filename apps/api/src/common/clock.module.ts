import { Global, Module } from '@nestjs/common';
import { CLOCK, DbClock } from './clock.js';

/** Reloj de la aplicación disponible para todos los módulos (ADR 0021). */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: DbClock }],
  exports: [CLOCK],
})
export class ClockModule {}
