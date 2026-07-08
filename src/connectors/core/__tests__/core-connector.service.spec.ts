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
            roles: ['employee'],
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
      roles: ['employee'],
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
});
