import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CoreConnectorModule } from '../connectors/core/core-connector.module';
import { ThirdPartyConnectorModule } from '../connectors/thirdparty/thirdparty-connector.module';

@Module({
  imports: [
    JwtModule.register({}), // secrets injected dynamically per call
    CoreConnectorModule,
    ThirdPartyConnectorModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
