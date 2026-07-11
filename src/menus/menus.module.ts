import { Module } from '@nestjs/common';
import { CoreConnectorModule } from '../connectors/core/core-connector.module';
import { ShopConnectorModule } from '../connectors/shop/shop-connector.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

@Module({
  imports: [CoreConnectorModule, ShopConnectorModule, PermissionsModule],
  controllers: [MenusController],
  providers: [MenusService],
})
export class MenusModule {}
