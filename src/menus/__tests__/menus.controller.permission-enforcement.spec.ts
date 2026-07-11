import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Reflector } from '@nestjs/core';
import { MenusController } from '../menus.controller';
import { MenusService } from '../menus.service';
import { RequirePermissionGuard } from '../../permissions/guards/require-permission.guard';
import { CoreConnectorService } from '../../connectors/core/core-connector.service';
import { GlobalExceptionFilter } from '../../common/global-exception.filter';

/**
 * AC-11: unlike the other MenusController tests (which stub out RequirePermissionGuard), this
 * spec wires the REAL guard so we can assert the 403 happens before MenusService is ever called.
 */
describe('MenusController + RequirePermissionGuard (AC-11 enforcement)', () => {
  let app: INestApplication;
  let menusService: jest.Mocked<MenusService>;
  let coreConnector: jest.Mocked<CoreConnectorService>;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MenusController],
      providers: [
        Reflector,
        RequirePermissionGuard,
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
        { provide: CoreConnectorService, useValue: { getPermissions: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    menusService = moduleRef.get(MenusService);
    coreConnector = moduleRef.get(CoreConnectorService);
    app.use((req: any, _res: any, next: any) => {
      req.user = { sub: 1, email: 'employee@pointsmall.com', roles: ['EMPLOYEE'] };
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects DELETE /admin/menus/:id with 403 bff-2010 and never calls MenusService.deleteMenu', async () => {
    coreConnector.getPermissions.mockResolvedValue(['dashboard:view']);

    const response = await request(app.getHttpServer()).delete('/admin/menus/1');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('bff-2010');
    expect(menusService.deleteMenu).not.toHaveBeenCalled();
  });

  it('rejects POST /admin/menus with 403 bff-2010 and never calls MenusService.createMenu', async () => {
    coreConnector.getPermissions.mockResolvedValue(['dashboard:view']);

    const response = await request(app.getHttpServer())
      .post('/admin/menus')
      .send({ label: 'Hack' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('bff-2010');
    expect(menusService.createMenu).not.toHaveBeenCalled();
  });
});
