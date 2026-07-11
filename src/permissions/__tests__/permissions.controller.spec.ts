import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from '../permissions.controller';
import { PermissionsService } from '../permissions.service';

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let service: jest.Mocked<PermissionsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        {
          provide: PermissionsService,
          useValue: { getEmployeeProfile: jest.fn(), getPermissions: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(PermissionsController);
    service = module.get(PermissionsService);
  });

  // AC-01
  it('me() looks up the employee profile using sub from the JWT payload', async () => {
    const employee = {
      id: 42,
      name: 'Alice',
      email: 'a@b.com',
      isActive: true,
      roles: ['EMPLOYEE'],
    };
    service.getEmployeeProfile.mockResolvedValue(employee as any);

    const req: any = { user: { sub: 42, roles: ['EMPLOYEE'] } };
    const result = await controller.me(req);

    expect(service.getEmployeeProfile).toHaveBeenCalledWith(42);
    expect(result).toEqual({ code: 'OK', message: 'success', data: employee });
  });

  // AC-03
  it('permissions() looks up permission keys using roles from the JWT payload', async () => {
    service.getPermissions.mockResolvedValue(['dashboard:view']);

    const req: any = { user: { sub: 1, roles: ['ADMIN'] } };
    const result = await controller.permissions(req);

    expect(service.getPermissions).toHaveBeenCalledWith(['ADMIN']);
    expect(result).toEqual({
      code: 'OK',
      message: 'success',
      data: { permissions: ['dashboard:view'] },
    });
  });
});
