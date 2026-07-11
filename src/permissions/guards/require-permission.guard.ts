import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CoreConnectorService } from '../../connectors/core/core-connector.service';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class RequirePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly coreConnector: CoreConnectorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const roles: string[] = (request as any).user?.roles ?? [];

    const permissions = await this.coreConnector.getPermissions(roles);

    if (!permissions.includes(requiredPermission)) {
      throw Object.assign(new ForbiddenException('Missing required permission'), {
        bffCode: 'bff-2010',
      });
    }

    return true;
  }
}
