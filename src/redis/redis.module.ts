import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.constants';

export { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        return redisUrl
          ? new Redis(redisUrl, { connectTimeout: 5000, commandTimeout: 5000 })
          : new Redis({
              host: config.get<string>('REDIS_HOST', 'localhost'),
              port: config.get<number>('REDIS_PORT', 6379),
              password: config.get<string>('REDIS_PASSWORD') || undefined,
              lazyConnect: true,
              connectTimeout: 5000,
              commandTimeout: 5000,
            });
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
