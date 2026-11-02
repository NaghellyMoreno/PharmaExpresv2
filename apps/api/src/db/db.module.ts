import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';
import { createPool } from './client.js';

export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: () => createPool() }],
  exports: [PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
