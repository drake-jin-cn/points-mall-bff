import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../auth.service';
import {
  CoreConnectorService,
  CoreAuthError,
} from '../../connectors/core/core-connector.service';
import { RedisService } from '../../redis/redis.service';

const mockEmployee = {
  id: 1,
  name: 'Admin',
  email: 'admin@pointsmall.com',
  isActive: true,
  roles: ['admin'],
};

const mockResponse = () => {
  const res: Partial<Response> = { cookie: jest.fn() };
  return res as Response;
};

describe('AuthService', () => {
  let service: AuthService;
  let coreConnector: jest.Mocked<CoreConnectorService>;
  let redisService: jest.Mocked<RedisService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: CoreConnectorService,
          useValue: { verifyCredentials: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed-token') },
        },
        {
          provide: RedisService,
          useValue: { set: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const map: Record<string, string> = {
                JWT_SECRET: 'test-secret',
                JWT_REFRESH_SECRET: 'test-refresh-secret',
                INTERNAL_API_KEY: 'test-key',
              };
              return map[key] ?? (() => { throw new Error(`Missing ${key}`); })();
            }),
            get: jest.fn((key: string, fallback?: string) => {
              const map: Record<string, string> = {
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_EXPIRES_IN: '7d',
                NODE_ENV: 'test',
              };
              return map[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    coreConnector = module.get(CoreConnectorService);
    redisService = module.get(RedisService);
    jwtService = module.get(JwtService);
  });

  describe('login', () => {
    it('AC-05/06/07/08: returns user info and sets cookie + redis on success', async () => {
      coreConnector.verifyCredentials.mockResolvedValue({
        employee: mockEmployee,
        traceId: 'trace-123',
      });
      const res = mockResponse();

      const result = await service.login('admin@pointsmall.com', 'pass', undefined, res);

      expect(result.user).toEqual({
        id: 1,
        name: 'Admin',
        email: 'admin@pointsmall.com',
        roles: ['admin'],
      });
      // AC-06: cookie set as HttpOnly
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'signed-token',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
      // AC-07: access_token signed with correct payload
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 1, email: 'admin@pointsmall.com', roles: ['admin'] },
        expect.objectContaining({ secret: 'test-secret', expiresIn: '15m' }),
      );
      // AC-08: refresh token stored in redis
      expect(redisService.set).toHaveBeenCalledWith(
        'refresh:1',
        'signed-token',
        7 * 24 * 60 * 60,
      );
    });

    it('AC-09: maps core-1001 to bff-2001 UnauthorizedException', async () => {
      coreConnector.verifyCredentials.mockRejectedValue(
        new CoreAuthError('core-1001', 401, 'trace-abc'),
      );
      await expect(
        service.login('bad@email.com', 'wrong', undefined, mockResponse()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('AC-10: maps core-1002 to bff-2002 ForbiddenException', async () => {
      coreConnector.verifyCredentials.mockRejectedValue(
        new CoreAuthError('core-1002', 403, 'trace-abc'),
      );
      await expect(
        service.login('disabled@email.com', 'pass', undefined, mockResponse()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('AC-11: maps unreachable core to ServiceUnavailableException', async () => {
      coreConnector.verifyCredentials.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.login('a@b.com', 'pass', undefined, mockResponse()),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('AC-21: access_token is never in the return value', async () => {
      coreConnector.verifyCredentials.mockResolvedValue({
        employee: mockEmployee,
        traceId: 'trace-123',
      });
      const result = await service.login('admin@pointsmall.com', 'pass', undefined, mockResponse());
      expect(JSON.stringify(result)).not.toContain('signed-token');
    });
  });
});
