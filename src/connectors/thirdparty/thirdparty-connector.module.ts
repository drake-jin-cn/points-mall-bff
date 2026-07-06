import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThirdPartyConnectorService } from './thirdparty-connector.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>(
          'THIRDPARTY_SERVICE_URL',
          'http://localhost:8084',
        ),
        timeout: 15000,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ThirdPartyConnectorService],
  exports: [ThirdPartyConnectorService],
})
export class ThirdPartyConnectorModule {}
