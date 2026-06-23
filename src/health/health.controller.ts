import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
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
