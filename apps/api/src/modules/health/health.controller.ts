import { Controller, Get } from '@nestjs/common';

type HealthResponse =
  import('@pharma/api-contract').paths['/health']['get']['responses']['200']['content']['application/json'];

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
