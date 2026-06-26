import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'points-mall-bff',
      timestamp: new Date().toISOString(),
      db: 'ok', // BFF has no direct DB connection
      uptime: Math.floor(process.uptime()),
    };
  }
}
