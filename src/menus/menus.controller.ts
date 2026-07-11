import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { MenusService } from './menus.service';
import { MenuItemDto } from './dto/menu-item.dto';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { RequirePermissionGuard } from '../permissions/guards/require-permission.guard';
import { ShopConnectorError } from '../connectors/shop/shop-connector.service';
import { ok } from '../common/api-response';

@Controller()
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get('menus')
  async menus(@Req() req: Request) {
    const roles: string[] = (req as any).user?.roles ?? [];
    const tree = await this.menusService.getMenusForRoles(roles);
    return ok(tree);
  }

  @Get('admin/menus')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('admin:menu:manage')
  async adminMenus() {
    try {
      const tree = await this.menusService.getAdminMenuTree();
      return ok(tree);
    } catch (error) {
      throw this.mapShopError(error as ShopConnectorError);
    }
  }

  @Post('admin/menus')
  @HttpCode(201)
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('admin:menu:manage')
  async createMenu(@Body() dto: MenuItemDto) {
    try {
      const created = await this.menusService.createMenu(dto);
      return ok(created);
    } catch (error) {
      throw this.mapShopError(error as ShopConnectorError);
    }
  }

  @Put('admin/menus/:id')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('admin:menu:manage')
  async updateMenu(@Param('id', ParseIntPipe) id: number, @Body() dto: MenuItemDto) {
    try {
      const updated = await this.menusService.updateMenu(id, dto);
      return ok(updated);
    } catch (error) {
      throw this.mapShopError(error as ShopConnectorError);
    }
  }

  @Delete('admin/menus/:id')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('admin:menu:manage')
  async deleteMenu(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.menusService.deleteMenu(id);
      return ok(null);
    } catch (error) {
      throw this.mapShopError(error as ShopConnectorError);
    }
  }

  /**
   * Passes the exact Shop error code + HTTP status through to the client unchanged (e.g.
   * shop-4011 on delete-with-children -> 409), rather than mapping to a generic bff-XXXX code.
   */
  private mapShopError(error: ShopConnectorError): never {
    const { shopCode, httpStatus, traceId } = error;

    if (httpStatus === 400) {
      throw Object.assign(new BadRequestException('Validation failed'), {
        bffCode: shopCode,
        traceId,
      });
    }
    if (httpStatus === 404) {
      throw Object.assign(new NotFoundException('Menu item not found'), {
        bffCode: shopCode,
        traceId,
      });
    }
    if (httpStatus === 409) {
      throw Object.assign(new ConflictException('Conflict'), {
        bffCode: shopCode,
        traceId,
      });
    }
    if (httpStatus === 401 || httpStatus === 403) {
      throw Object.assign(new ForbiddenException('Forbidden'), {
        bffCode: shopCode,
        traceId,
      });
    }
    throw Object.assign(new ServiceUnavailableException('Menu service unavailable'), {
      bffCode: 'bff-2099',
      traceId,
    });
  }
}
