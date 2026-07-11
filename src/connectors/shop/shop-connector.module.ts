import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ShopConnectorService } from './shop-connector.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('SHOP_SERVICE_URL', 'http://localhost:8081'),
        timeout: 5000,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ShopConnectorService],
  exports: [ShopConnectorService],
})
export class ShopConnectorModule {}
