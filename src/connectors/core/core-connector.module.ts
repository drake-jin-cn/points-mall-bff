import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CoreConnectorService } from './core-connector.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('CORE_SERVICE_URL', 'http://localhost:8080'),
        timeout: 5000,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [CoreConnectorService],
  exports: [CoreConnectorService],
})
export class CoreConnectorModule {}
