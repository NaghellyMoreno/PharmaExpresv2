import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/db.module.js';

export const CLOCK = Symbol('CLOCK');

/** Reloj de la aplicación (ADR 0021): toda hora de negocio sale de `app.clock_now()`. */
export interface Clock {
  now(): Promise<Date>;
}

@Injectable()
export class DbClock implements Clock {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async now(): Promise<Date> {
    const { rows } = await this.pool.query<{ now: Date }>('SELECT app.clock_now() AS now');
    return rows[0].now;
  }
}
