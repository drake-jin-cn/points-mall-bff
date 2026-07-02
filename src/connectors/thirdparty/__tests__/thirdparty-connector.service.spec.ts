import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import {
  ThirdPartyConnectorError,
  ThirdPartyConnectorService,
} from '../thirdparty-connector.service';

describe('ThirdPartyConnectorService', () => {
  let service: ThirdPartyConnectorService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThirdPartyConnectorService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ThirdPartyConnectorService);
    httpService = module.get(HttpService);
  });

  it('gets GitHub auth URL with Bearer token and maps response', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          url: 'https://github.com/login/oauth/authorize?state=abc',
          state: 'abc',
        },
      } as any),
    );

    const result = await service.getGithubAuthUrl('service-jwt');

    expect(httpService.get).toHaveBeenCalledWith('/oauth/github/url', {
      headers: {
        Authorization: 'Bearer service-jwt',
      },
    });
    expect(result).toEqual({
      url: 'https://github.com/login/oauth/authorize?state=abc',
      state: 'abc',
    });
  });

  it('exchanges code with Bearer token and maps profile response', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          githubId: '123',
          email: 'octo@example.com',
          name: 'Octo Cat',
          avatar: 'https://avatar.example.com/octo.png',
        },
      } as any),
    );

    const result = await service.exchangeGithubCode('oauth-code', 'service-jwt');

    expect(httpService.get).toHaveBeenCalledWith('/oauth/github/callback', {
      headers: {
        Authorization: 'Bearer service-jwt',
      },
      params: {
        code: 'oauth-code',
      },
    });
    expect(result).toEqual({
      githubId: '123',
      email: 'octo@example.com',
      name: 'Octo Cat',
      avatar: 'https://avatar.example.com/octo.png',
    });
  });

  it('wraps thirdparty HTTP failures in ThirdPartyConnectorError', async () => {
    httpService.get.mockReturnValue(
      throwError(() => ({
        response: {
          status: 401,
          data: {
            message: 'Unauthorized',
          },
        },
      })),
    );

    await expect(service.getGithubAuthUrl('service-jwt')).rejects.toBeInstanceOf(
      ThirdPartyConnectorError,
    );
    await expect(service.getGithubAuthUrl('service-jwt')).rejects.toMatchObject({
      httpStatus: 401,
    });
  });
});
