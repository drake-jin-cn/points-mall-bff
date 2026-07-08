import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const makeContext = (cookies: Record<string, string> = {}): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ cookies }),
    }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: JwtService, useValue: { verify: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    guard = module.get(JwtAuthGuard);
    reflector = module.get(Reflector);
    jwtService = module.get(JwtService);
  });

  it('AC-17: @Public() routes pass without token', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('AC-14: missing cookie throws UnauthorizedException', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
  });

  it('AC-15: expired/invalid token throws UnauthorizedException', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    expect(() => guard.canActivate(makeContext({ access_token: 'bad.token' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('AC-14 valid token: attaches payload and returns true', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const payload = { sub: 1, email: 'a@b.com', roles: ['admin'] };
    jwtService.verify.mockReturnValue(payload as any);
    const req: any = { cookies: { access_token: 'valid.token' } };
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.user).toEqual(payload);
  });
});
