import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/access.js';

type HealthResponse =
  import('@pharma/api-contract').paths['/health']['get']['responses']['200']['content']['application/json'];

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
