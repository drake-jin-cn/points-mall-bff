import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PermissionsService } from '../permissions.service';
import { CoreAuthError, CoreConnectorService } from '../../connectors/core/core-connector.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let coreConnector: jest.Mocked<CoreConnectorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        {
          provide: CoreConnectorService,
          useValue: { getEmployee: jest.fn(), getPermissions: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PermissionsService);
    coreConnector = module.get(CoreConnectorService);
  });

  // AC-01
  it('getEmployeeProfile returns the profile fetched from Core', async () => {
    const employee = {
      id: 1,
      name: 'Alice',
      email: 'a@b.com',
      isActive: true,
      roles: ['EMPLOYEE'],
    };
    coreConnector.getEmployee.mockResolvedValue(employee as any);

    const result = await service.getEmployeeProfile(1);

    expect(coreConnector.getEmployee).toHaveBeenCalledWith(1);
    expect(result).toEqual(employee);
  });

  // AC-04: core-1012 (404) propagates as 404 with the same code
  it('propagates a Core 404 as NotFoundException with the original code', async () => {
    coreConnector.getEmployee.mockRejectedValue(new CoreAuthError('core-1012', 404, 'trace-1'));

    await expect(service.getEmployeeProfile(999)).rejects.toBeInstanceOf(NotFoundException);
    try {
      await service.getEmployeeProfile(999);
      fail('expected to throw');
    } catch (error: any) {
      expect(error.bffCode).toBe('core-1012');
    }
  });

  it('propagates a Core 401/403 as ForbiddenException with the original code', async () => {
    coreConnector.getEmployee.mockRejectedValue(new CoreAuthError('core-1003', 401, 'trace-2'));

    await expect(service.getEmployeeProfile(1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('degrades any other Core failure to ServiceUnavailableException with bff-2099', async () => {
    coreConnector.getEmployee.mockRejectedValue(new CoreAuthError('core-9999', 503, 'trace-3'));

    await expect(service.getEmployeeProfile(1)).rejects.toBeInstanceOf(ServiceUnavailableException);
    try {
      await service.getEmployeeProfile(1);
      fail('expected to throw');
    } catch (error: any) {
      expect(error.bffCode).toBe('bff-2099');
    }
  });

  // AC-03
  it('getPermissions returns the permission key array for the given roles', async () => {
    coreConnector.getPermissions.mockResolvedValue(['dashboard:view', 'admin:menu:manage']);

    const result = await service.getPermissions(['ADMIN']);

    expect(coreConnector.getPermissions).toHaveBeenCalledWith(['ADMIN']);
    expect(result).toEqual(['dashboard:view', 'admin:menu:manage']);
  });
});
