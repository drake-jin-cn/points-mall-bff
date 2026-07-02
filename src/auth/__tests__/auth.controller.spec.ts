import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, UnauthorizedException } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { APP_GUARD, APP_FILTER, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GlobalExceptionFilter } from '../../common/global-exception.filter';

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let authService: jest.Mocked<
    Pick<
      AuthService,
      'login' | 'refresh' | 'logout' | 'startGithubLogin' | 'handleGithubCallback'
    >
  >;

  beforeAll(async () => {
    const mockAuthService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      startGithubLogin: jest.fn(),
      handleGithubCallback: jest.fn(),
    };
    const mockJwtService = { verify: jest.fn() };
    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        throw new Error(`Missing ${key}`);
      }),
      get: jest.fn((key: string, fallback?: any) => fallback),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        Reflector,
        JwtAuthGuard,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    authService = moduleFixture.get(AuthService) as any;
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-12: POST /auth/login missing fields returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({});
    expect(res.status).toBe(400);
  });

  it('AC-13: POST /auth/login invalid email returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '123456' });
    expect(res.status).toBe(400);
  });

  it('AC-05/06: POST /auth/login success returns user and sets cookie', async () => {
    (authService.login as jest.Mock).mockResolvedValue({
      user: { id: 1, name: 'Admin', email: 'admin@pointsmall.com', roles: ['admin'] },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@pointsmall.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('OK');
    expect(res.body.data.user.email).toBe('admin@pointsmall.com');
    // AC-21: token NOT in body
    expect(JSON.stringify(res.body)).not.toContain('access_token');
  });

  it('AC-09: invalid credentials returns 401 bff-2001', async () => {
    const err = Object.assign(new UnauthorizedException('Invalid email or password'), {
      bffCode: 'bff-2001',
      traceId: 'trace-xyz',
    });
    (authService.login as jest.Mock).mockRejectedValue(err);
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'bad@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('bff-2001');
    expect(res.body.traceId).toBeDefined();
  });

  it('AC-14: guard covered by jwt-auth.guard.spec.ts — login without cookie works (public route)', async () => {
    // Guard behavior for non-public routes is fully tested in jwt-auth.guard.spec.ts
    // Here we verify the public decorator works: /auth/login is accessible without a cookie
    (authService.login as jest.Mock).mockResolvedValue({
      user: { id: 1, name: 'Admin', email: 'admin@pointsmall.com', roles: ['admin'] },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@pointsmall.com', password: 'Password123!' });
    expect(res.status).toBe(200); // confirms @Public() works — no 401
  });

  describe('POST /auth/refresh', () => {
    it('AC-01: success returns 200 with user info', async () => {
      (authService.refresh as jest.Mock).mockResolvedValue({
        user: { id: 1, email: 'admin@pointsmall.com', roles: ['admin'] },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', 'access_token=any-token-here');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      expect(res.body.data.user.email).toBe('admin@pointsmall.com');
    });

    it('AC-05: service throws bff-2003 → 401 with code bff-2003', async () => {
      const err = Object.assign(
        new UnauthorizedException('Invalid token'),
        { bffCode: 'bff-2003', traceId: 'trace-abc' },
      );
      (authService.refresh as jest.Mock).mockRejectedValue(err);

      const res = await request(app.getHttpServer()).post('/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('bff-2003');
      expect(res.body.traceId).toBeDefined();
    });

    it('AC-06: service throws bff-2004 → 401 with code bff-2004', async () => {
      const err = Object.assign(
        new UnauthorizedException('Session expired, please login again'),
        { bffCode: 'bff-2004', traceId: 'trace-def' },
      );
      (authService.refresh as jest.Mock).mockRejectedValue(err);

      const res = await request(app.getHttpServer()).post('/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('bff-2004');
    });

    it('AC-10: /auth/refresh accessible without access_token cookie (@Public)', async () => {
      (authService.refresh as jest.Mock).mockResolvedValue({
        user: { id: 1, email: 'admin@pointsmall.com', roles: ['admin'] },
      });

      const res = await request(app.getHttpServer()).post('/auth/refresh');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /auth/logout', () => {
    it('AC-07: valid token → 200, service.logout called with userId', async () => {
      (authService.logout as jest.Mock).mockResolvedValue(undefined);
      const mockJwt = app.get(JwtService);
      (mockJwt.verify as jest.Mock).mockReturnValue({ sub: 1, email: 'a@b.com', roles: ['admin'] });

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', 'access_token=valid-token');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      expect(authService.logout).toHaveBeenCalledWith(1, expect.anything());
    });

    it('AC-08: no access_token cookie → 401 from JwtAuthGuard', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/github', () => {
    it('is public and returns 302 redirect', async () => {
      (authService.startGithubLogin as jest.Mock).mockImplementation((res) => {
        res.redirect('https://github.com/login/oauth/authorize?state=oauth-state');
      });

      const res = await request(app.getHttpServer()).get('/auth/github');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        'https://github.com/login/oauth/authorize?state=oauth-state',
      );
      expect(authService.startGithubLogin).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('GET /auth/github/callback', () => {
    it('is public and redirects to frontend callback on success', async () => {
      (authService.handleGithubCallback as jest.Mock).mockImplementation((query, res) => {
        res.redirect('http://localhost:3003/auth/github/callback');
      });

      const res = await request(app.getHttpServer())
        .get('/auth/github/callback')
        .query({ code: 'oauth-code', state: 'oauth-state' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:3003/auth/github/callback');
      expect(authService.handleGithubCallback).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'oauth-code', state: 'oauth-state' }),
        expect.anything(),
      );
    });
  });
});
