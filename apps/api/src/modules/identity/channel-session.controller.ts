import { Controller, Get, Header } from '@nestjs/common';
import type { components } from '@pharma/api-contract';
import { DeviceId, DeviceSession } from './device-session.guard.js';
import { IdentityService } from './identity.service.js';

@Controller('me')
export class ChannelSessionController {
  constructor(private readonly identity: IdentityService) {}

  @DeviceSession()
  @Get()
  @Header('Cache-Control', 'no-store')
  getChannelSession(@DeviceId() deviceId: string): Promise<components['schemas']['ChannelSession']> {
    return this.identity.getChannelSession(deviceId);
  }
}
