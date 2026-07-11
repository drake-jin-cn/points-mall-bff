import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MenusController } from '../menus.controller';
import { MenusService } from '../menus.service';
import { ShopConnectorError } from '../../connectors/shop/shop-connector.service';
import { RequirePermissionGuard } from '../../permissions/guards/require-permission.guard';

describe('MenusController', () => {
  let controller: MenusController;
  let service: jest.Mocked<MenusService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenusController],
      providers: [
        {
          provide: MenusService,
          useValue: {
            getMenusForRoles: jest.fn(),
            getAdminMenuTree: jest.fn(),
            createMenu: jest.fn(),
            updateMenu: jest.fn(),
            deleteMenu: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(RequirePermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MenusController);
    service = module.get(MenusService);
  });

  it('menus() returns the filtered tree for the caller"s roles', async () => {
    service.getMenusForRoles.mockResolvedValue([{ id: 1, label: 'Dashboard' } as any]);

    const req: any = { user: { sub: 1, roles: ['EMPLOYEE'] } };
    const result = await controller.menus(req);

    expect(service.getMenusForRoles).toHaveBeenCalledWith(['EMPLOYEE']);
    expect(result.data).toEqual([{ id: 1, label: 'Dashboard' }]);
  });

  // AC-10: admin CRUD operations succeed and return the underlying Shop payload
  it('adminMenus() returns the full tree from Shop', async () => {
    service.getAdminMenuTree.mockResolvedValue([{ id: 1, label: 'Dashboard' } as any]);

    const result = await controller.adminMenus();

    expect(result.data).toEqual([{ id: 1, label: 'Dashboard' }]);
  });

  it('createMenu() creates and returns the item with the same status as Shop', async () => {
    service.createMenu.mockResolvedValue({ id: 9, label: 'New' } as any);

    const result = await controller.createMenu({ label: 'New' } as any);

    expect(service.createMenu).toHaveBeenCalledWith({ label: 'New' });
    expect(result.data).toEqual({ id: 9, label: 'New' });
  });

  // AC-12: Shop's shop-4011 (delete-with-children conflict) passes through unchanged
  it('deleteMenu() propagates a Shop 409 conflict as ConflictException with code shop-4011', async () => {
    service.deleteMenu.mockRejectedValue(new ShopConnectorError('shop-4011', 409, 'trace-1'));

    await expect(controller.deleteMenu(1)).rejects.toBeInstanceOf(ConflictException);
    try {
      await controller.deleteMenu(1);
      fail('expected to throw');
    } catch (error: any) {
      expect(error.bffCode).toBe('shop-4011');
      expect(error.getStatus()).toBe(409);
    }
  });

  it('updateMenu() propagates a Shop 404 as NotFoundException with the original code', async () => {
    service.updateMenu.mockRejectedValue(new ShopConnectorError('shop-4012', 404, 'trace-2'));

    await expect(controller.updateMenu(999, { label: 'X' } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
