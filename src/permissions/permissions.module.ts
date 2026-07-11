import { Module } from '@nestjs/common';
import { CoreConnectorModule } from '../connectors/core/core-connector.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { RequirePermissionGuard } from './guards/require-permission.guard';

@Module({
  imports: [CoreConnectorModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, RequirePermissionGuard],
  exports: [RequirePermissionGuard],
})
export class PermissionsModule {}
