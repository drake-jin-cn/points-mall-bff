import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { CoreAuthError, CoreConnectorService } from '../core-connector.service';

describe('CoreConnectorService', () => {
  let service: CoreConnectorService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoreConnectorService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'INTERNAL_API_KEY') return 'internal-key';
              throw new Error(`Unexpected key ${key}`);
            }),
          },
        },
      ],
    }).compile();

    service = module.get(CoreConnectorService);
    httpService = module.get(HttpService);
  });

  it('posts GitHub profile to core with INTERNAL_API_KEY and maps employee response', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          code: 'OK',
          data: {
            id: 7,
            name: 'Octo Cat',
            email: 'octo@example.com',
            githubId: '123',
            avatarUrl: 'https://avatar.example.com/octo.png',
            isActive: true,
            roles: ['EMPLOYEE'],
          },
        },
      } as any),
    );

    const result = await service.findOrCreateByGithub({
      githubId: '123',
      email: 'octo@example.com',
      name: 'Octo Cat',
      avatarUrl: 'https://avatar.example.com/octo.png',
    });

    expect(httpService.post).toHaveBeenCalledWith(
      '/internal/employees/find-or-create-by-github',
      {
        githubId: '123',
        email: 'octo@example.com',
        name: 'Octo Cat',
        avatarUrl: 'https://avatar.example.com/octo.png',
      },
      {
        headers: {
          INTERNAL_API_KEY: 'internal-key',
        },
      },
    );
    expect(result).toEqual({
      id: 7,
      name: 'Octo Cat',
      email: 'octo@example.com',
      githubId: '123',
      avatarUrl: 'https://avatar.example.com/octo.png',
      isActive: true,
      roles: ['EMPLOYEE'],
    });
  });

  it('wraps find-or-create HTTP failures in CoreAuthError', async () => {
    httpService.post.mockReturnValue(
      throwError(() => ({
        response: {
          status: 503,
          data: {
            code: 'core-9999',
          },
        },
      })),
    );

    await expect(
      service.findOrCreateByGithub({
        githubId: '123',
        email: 'octo@example.com',
        name: 'Octo Cat',
        avatarUrl: null,
      }),
    ).rejects.toBeInstanceOf(CoreAuthError);
    await expect(
      service.findOrCreateByGithub({
        githubId: '123',
        email: 'octo@example.com',
        name: 'Octo Cat',
        avatarUrl: null,
      }),
    ).rejects.toMatchObject({
      httpStatus: 503,
      coreCode: 'core-9999',
    });
  });

  it('getEmployee fetches the profile by id with INTERNAL_API_KEY header', async () => {
    const employee = {
      id: 1,
      name: 'Admin User',
      email: 'admin@pointsmall.com',
      isActive: true,
      roles: ['ADMIN'],
    };
    httpService.get.mockReturnValue(of({ data: { code: 'OK', data: employee } } as any));

    const result = await service.getEmployee(1);

    expect(httpService.get).toHaveBeenCalledWith('/internal/employees/1', {
      headers: { INTERNAL_API_KEY: 'internal-key' },
    });
    expect(result).toEqual(employee);
  });

  it('getEmployee wraps a 404 in CoreAuthError preserving core-1012', async () => {
    httpService.get.mockReturnValue(
      throwError(() => ({ response: { status: 404, data: { code: 'core-1012' } } })),
    );

    await expect(service.getEmployee(999)).rejects.toBeInstanceOf(CoreAuthError);
    await expect(service.getEmployee(999)).rejects.toMatchObject({
      httpStatus: 404,
      coreCode: 'core-1012',
    });
  });

  it('getPermissions requests the comma-joined roles and returns the permission array', async () => {
    httpService.get.mockReturnValue(
      of({
        data: { code: 'OK', data: { permissions: ['dashboard:view', 'admin:menu:manage'] } },
      } as any),
    );

    const result = await service.getPermissions(['ADMIN', 'EMPLOYEE']);

    expect(httpService.get).toHaveBeenCalledWith('/internal/permissions', {
      params: { roles: 'ADMIN,EMPLOYEE' },
      headers: { INTERNAL_API_KEY: 'internal-key' },
    });
    expect(result).toEqual(['dashboard:view', 'admin:menu:manage']);
  });
});
