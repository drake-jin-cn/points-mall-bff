import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequirePermissionGuard } from '../guards/require-permission.guard';
import { CoreConnectorService } from '../../connectors/core/core-connector.service';

const makeContext = (user: any): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RequirePermissionGuard', () => {
  let guard: RequirePermissionGuard;
  let reflector: jest.Mocked<Reflector>;
  let coreConnector: jest.Mocked<CoreConnectorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequirePermissionGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: CoreConnectorService, useValue: { getPermissions: jest.fn() } },
      ],
    }).compile();

    guard = module.get(RequirePermissionGuard);
    reflector = module.get(Reflector);
    coreConnector = module.get(CoreConnectorService);
  });

  it('allows the request through when no permission is required on the route', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(makeContext({ roles: ['EMPLOYEE'] }))).resolves.toBe(true);
    expect(coreConnector.getPermissions).not.toHaveBeenCalled();
  });

  // AC-10: admin (has admin:menu:manage) is allowed through
  it('allows the request through when the user has the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue('admin:menu:manage');
    coreConnector.getPermissions.mockResolvedValue(['dashboard:view', 'admin:menu:manage']);

    await expect(guard.canActivate(makeContext({ roles: ['ADMIN'] }))).resolves.toBe(true);
    expect(coreConnector.getPermissions).toHaveBeenCalledWith(['ADMIN']);
  });

  // AC-11: employee (lacks admin:menu:manage) is rejected with 403 bff-2010, before Shop is called
  it('throws ForbiddenException with bffCode bff-2010 when the user lacks the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue('admin:menu:manage');
    coreConnector.getPermissions.mockResolvedValue(['dashboard:view']);

    await expect(guard.canActivate(makeContext({ roles: ['EMPLOYEE'] }))).rejects.toThrow(
      ForbiddenException,
    );

    try {
      await guard.canActivate(makeContext({ roles: ['EMPLOYEE'] }));
      fail('expected guard to throw');
    } catch (error: any) {
      expect(error.bffCode).toBe('bff-2010');
    }
  });
});
