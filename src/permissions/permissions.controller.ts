import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { PermissionsService } from './permissions.service';
import { ok } from '../common/api-response';

@Controller()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('employees/me')
  async me(@Req() req: Request) {
    const userId = (req as any).user?.sub as number;
    const profile = await this.permissionsService.getEmployeeProfile(userId);
    return ok(profile);
  }

  @Get('permissions')
  async permissions(@Req() req: Request) {
    const roles: string[] = (req as any).user?.roles ?? [];
    const permissions = await this.permissionsService.getPermissions(roles);
    return ok({ permissions });
  }
}
