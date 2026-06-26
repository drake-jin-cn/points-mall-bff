import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(private readonly redisService: RedisService) {}

  @Public()
  @Get()
  async check() {
    let redisStatus = 'ok';
    try {
      await this.redisService.ping();
    } catch {
      redisStatus = 'error';
    }

    return {
      status: redisStatus === 'ok' ? 'ok' : 'degraded',
      service: 'points-mall-bff',
      timestamp: new Date().toISOString(),
      redis: redisStatus,
      uptime: Math.floor(process.uptime()),
    };
  }
}
