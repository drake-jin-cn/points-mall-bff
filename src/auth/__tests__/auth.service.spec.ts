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
  const res: Partial<Response> = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
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
          useValue: {
            sign: jest.fn().mockReturnValue('signed-token'),
            decode: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            exists: jest.fn(),
            del: jest.fn(),
          },
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

  describe('refresh', () => {
    const fakePayload = { sub: 1, email: 'admin@pointsmall.com', roles: ['admin'] };

    it('AC-01/03: decodes expired token, checks Redis, issues new access_token cookie', async () => {
      jwtService.decode.mockReturnValue(fakePayload as any);
      redisService.exists.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('new-signed-token' as any);
      const res = mockResponse();

      const result = await service.refresh('expired-token', res);

      expect(jwtService.decode).toHaveBeenCalledWith('expired-token');
      expect(redisService.exists).toHaveBeenCalledWith('refresh:1');
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 1, email: 'admin@pointsmall.com', roles: ['admin'] },
        expect.objectContaining({ secret: 'test-secret', expiresIn: '15m' }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'new-signed-token',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/' }),
      );
      expect(result).toEqual({ user: { id: 1, email: 'admin@pointsmall.com', roles: ['admin'] } });
    });

    it('AC-04: Redis key is NOT renewed (exists called, set NOT called)', async () => {
      jwtService.decode.mockReturnValue(fakePayload as any);
      redisService.exists.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('new-signed-token' as any);

      await service.refresh('expired-token', mockResponse());

      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('AC-05: undefined token throws bff-2003 UnauthorizedException', async () => {
      await expect(service.refresh(undefined, mockResponse())).rejects.toMatchObject({
        response: expect.objectContaining({ statusCode: 401 }),
        bffCode: 'bff-2003',
      });
    });

    it('AC-05: null decode result throws bff-2003', async () => {
      jwtService.decode.mockReturnValue(null as any);

      await expect(service.refresh('bad-token', mockResponse())).rejects.toMatchObject({
        bffCode: 'bff-2003',
      });
    });

    it('AC-05: payload missing sub throws bff-2003', async () => {
      jwtService.decode.mockReturnValue({ email: 'x@x.com' } as any);

      await expect(service.refresh('no-sub-token', mockResponse())).rejects.toMatchObject({
        bffCode: 'bff-2003',
      });
    });

    it('AC-06: Redis key missing throws bff-2004 UnauthorizedException', async () => {
      jwtService.decode.mockReturnValue(fakePayload as any);
      redisService.exists.mockResolvedValue(false);

      await expect(service.refresh('expired-token', mockResponse())).rejects.toMatchObject({
        bffCode: 'bff-2004',
      });
    });
  });

  describe('logout', () => {
    it('AC-07: deletes Redis refresh key and clears access_token cookie', async () => {
      redisService.del.mockResolvedValue();
      const res = mockResponse();

      await service.logout(1, res);

      expect(redisService.del).toHaveBeenCalledWith('refresh:1');
      expect(res.clearCookie).toHaveBeenCalledWith('access_token', { path: '/' });
    });

    it('AC-07: returns void', async () => {
      redisService.del.mockResolvedValue();
      const result = await service.logout(42, mockResponse());
      expect(result).toBeUndefined();
    });
  });
});
