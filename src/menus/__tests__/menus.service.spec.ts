import { Test, TestingModule } from '@nestjs/testing';
import { MenusService } from '../menus.service';
import { CoreConnectorService } from '../../connectors/core/core-connector.service';
import { ShopConnectorService } from '../../connectors/shop/shop-connector.service';

const dashboard = {
  id: 1,
  label: 'Dashboard',
  path: '/dashboard',
  icon: 'dashboard',
  parent_id: null,
  permission_key: 'dashboard:view',
  sort_order: 1,
  is_active: true,
  children: [],
};
const attendance = {
  id: 2,
  label: '考勤打卡',
  path: '/attendance',
  icon: 'clock',
  parent_id: null,
  permission_key: 'attendance:view',
  sort_order: 2,
  is_active: true,
  children: [],
};
const shop = {
  id: 3,
  label: '积分商城',
  path: '/shop',
  icon: 'shop',
  parent_id: null,
  permission_key: 'shop:view',
  sort_order: 3,
  is_active: true,
  children: [],
};
const data = {
  id: 4,
  label: '数据报表',
  path: '/data',
  icon: 'chart',
  parent_id: null,
  permission_key: 'data:view',
  sort_order: 4,
  is_active: true,
  children: [],
};
const menuManage = {
  id: 6,
  label: '菜单管理',
  path: '/admin/menus',
  icon: 'menu',
  parent_id: 5,
  permission_key: 'admin:menu:view',
  sort_order: 1,
  is_active: true,
  children: [],
};
const employeeManage = {
  id: 7,
  label: '员工管理',
  path: '/admin/employees',
  icon: 'users',
  parent_id: 5,
  permission_key: 'admin:employee:view',
  sort_order: 2,
  is_active: true,
  children: [],
};
const settings = {
  id: 5,
  label: '系统设置',
  path: null,
  icon: 'settings',
  parent_id: null,
  permission_key: null,
  sort_order: 5,
  is_active: true,
  children: [menuManage, employeeManage],
};

const fullTree = [dashboard, attendance, shop, data, settings];

describe('MenusService', () => {
  let service: MenusService;
  let coreConnector: jest.Mocked<CoreConnectorService>;
  let shopConnector: jest.Mocked<ShopConnectorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenusService,
        { provide: CoreConnectorService, useValue: { getPermissions: jest.fn() } },
        {
          provide: ShopConnectorService,
          useValue: {
            getMenuTree: jest.fn(),
            createMenu: jest.fn(),
            updateMenu: jest.fn(),
            deleteMenu: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(MenusService);
    coreConnector = module.get(CoreConnectorService);
    shopConnector = module.get(ShopConnectorService);
  });

  // AC-05: admin sees the full tree including the 系统设置 group
  it('admin permissions: returns the full tree with all 7 items reachable', async () => {
    coreConnector.getPermissions.mockResolvedValue([
      'dashboard:view',
      'attendance:view',
      'shop:view',
      'data:view',
      'admin:menu:view',
      'admin:menu:manage',
      'admin:employee:view',
    ]);
    shopConnector.getMenuTree.mockResolvedValue(fullTree as any);

    const result = await service.getMenusForRoles(['ADMIN']);

    expect(result.map((n) => n.label)).toEqual([
      'Dashboard',
      '考勤打卡',
      '积分商城',
      '数据报表',
      '系统设置',
    ]);
    const settingsNode = result.find((n) => n.label === '系统设置')!;
    expect(settingsNode.children.map((c) => c.label)).toEqual(['菜单管理', '员工管理']);
  });

  // AC-06: employee sees only the 3 shared view items, no 系统设置 group, no 数据报表
  it('employee permissions: returns only Dashboard/考勤打卡/积分商城, no settings group, no data report', async () => {
    coreConnector.getPermissions.mockResolvedValue([
      'dashboard:view',
      'attendance:view',
      'shop:view',
    ]);
    shopConnector.getMenuTree.mockResolvedValue(fullTree as any);

    const result = await service.getMenusForRoles(['EMPLOYEE']);

    expect(result.map((n) => n.label)).toEqual(['Dashboard', '考勤打卡', '积分商城']);
    expect(result.find((n) => n.label === '系统设置')).toBeUndefined();
    expect(result.find((n) => n.label === '数据报表')).toBeUndefined();
  });

  // AC-07: sorted by sort_order within each level (input deliberately out of order)
  it('sorts items by sort_order within each level, regardless of input order', async () => {
    coreConnector.getPermissions.mockResolvedValue([
      'dashboard:view',
      'attendance:view',
      'shop:view',
      'data:view',
    ]);
    shopConnector.getMenuTree.mockResolvedValue([data, shop, attendance, dashboard] as any);

    const result = await service.getMenusForRoles(['ADMIN']);

    expect(result.map((n) => n.label)).toEqual(['Dashboard', '考勤打卡', '积分商城', '数据报表']);
  });

  // AC-08: Shop connector throws -> degrade to [], not a 500
  it('degrades to an empty array when the Shop menu tree fetch fails', async () => {
    coreConnector.getPermissions.mockResolvedValue(['dashboard:view']);
    shopConnector.getMenuTree.mockRejectedValue(new Error('shop unreachable'));

    const result = await service.getMenusForRoles(['ADMIN']);

    expect(result).toEqual([]);
  });

  // AC-09: Core permissions call throws -> degrade to [], not a 500
  it('degrades to an empty array when the Core permissions fetch fails', async () => {
    coreConnector.getPermissions.mockRejectedValue(new Error('core unreachable'));
    shopConnector.getMenuTree.mockResolvedValue(fullTree as any);

    const result = await service.getMenusForRoles(['ADMIN']);

    expect(result).toEqual([]);
    expect(shopConnector.getMenuTree).not.toHaveBeenCalled();
  });
});
