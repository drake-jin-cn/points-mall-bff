import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import {
  CoreAuthError,
  CoreConnectorService,
  EmployeeInfo,
} from '../connectors/core/core-connector.service';
import { ThirdPartyConnectorService } from '../connectors/thirdparty/thirdparty-connector.service';
import { RedisService } from '../redis/redis.service';

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000; // 15 min

export interface LoginResult {
  user: Pick<EmployeeInfo, 'id' | 'name' | 'email' | 'roles'>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly coreConnector: CoreConnectorService,
    private readonly thirdPartyConnector: ThirdPartyConnectorService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    inboundTraceId: string | undefined,
    res: Response,
  ): Promise<LoginResult> {
    let employee: EmployeeInfo;
    let traceId: string;

    try {
      const result = await this.coreConnector.verifyCredentials(email, password, inboundTraceId);
      employee = result.employee;
      traceId = result.traceId;
    } catch (error) {
      if (error instanceof CoreAuthError) {
        this.mapCoreError(error);
      }
      throw new ServiceUnavailableException('Authentication service unavailable');
    }

    await this.issueEmployeeSession(employee, res);

    this.logger.log(`Login success employeeId=${employee.id} traceId=${traceId}`);

    return {
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        roles: employee.roles,
      },
    };
  }

  async startGithubLogin(res: Response): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3003');
    try {
      const serviceJwt = this.signServiceJwt();
      const { url, state } = await this.thirdPartyConnector.getGithubAuthUrl(serviceJwt);
      await this.redisService.set(`oauth:github:state:${state}`, '1', 300);
      res.redirect(url);
    } catch (error) {
      this.logger.warn(`GitHub OAuth start failed: ${(error as Error).message}`);
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  /**
   * OIDC SSO entry: generate authorization URL and redirect to IdP.
   *
   * ThirdPartyConnector returns "state|codeVerifier"; BFF splits it:
   *   - state       → Redis key: oidc:pkce:{state}, used as CSRF guard on callback
   *   - codeVerifier → Redis value, used to exchange tokens on callback
   */
  async startSsoLogin(res: Response): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3003');
    try {
      const serviceJwt = this.signServiceJwt();
      const { url, stateWithVerifier } = await this.thirdPartyConnector.getOidcAuthUrl(serviceJwt);

      // Split "state|codeVerifier"
      const pipeIndex = stateWithVerifier.indexOf('|');
      const state = stateWithVerifier.substring(0, pipeIndex);
      const codeVerifier = stateWithVerifier.substring(pipeIndex + 1);

      // Store in Redis: key = state, value = codeVerifier, TTL = 5 min
      await this.redisService.set(`oidc:pkce:${state}`, codeVerifier, 300);

      res.redirect(url);
    } catch (error) {
      this.logger.warn(`OIDC SSO start failed: ${(error as Error).message}`);
      res.redirect(`${frontendUrl}/login?error=sso_failed`);
    }
  }

  /**
   * OIDC SSO callback: validate state (CSRF guard), exchange id_token, create employee session.
   */
  async handleSsoCallback(
    query: { code?: string; state?: string; error?: string },
    res: Response,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3003');

    if (query.error === 'access_denied') {
      res.redirect(`${frontendUrl}/login?error=sso_cancelled`);
      return;
    }

    const stateKey = `oidc:pkce:${query.state ?? ''}`;

    // Retrieve code_verifier from Redis (presence of state key also validates against CSRF)
    let codeVerifier: string | null;
    try {
      codeVerifier = query.state ? await this.redisService.get(stateKey) : null;
    } catch (error) {
      this.logger.warn(`Redis error checking OIDC state: ${(error as Error).message}`);
      res.redirect(`${frontendUrl}/login?error=sso_failed`);
      return;
    }

    if (!codeVerifier) {
      // state missing or expired — CSRF attack or replay attempt
      res.redirect(`${frontendUrl}/login?error=sso_state_invalid`);
      return;
    }

    // Delete state key immediately (one-time use, prevents replay)
    try {
      await this.redisService.del(stateKey);
    } catch (error) {
      this.logger.warn(`Redis error deleting OIDC state: ${(error as Error).message}`);
    }

    try {
      const serviceJwt = this.signServiceJwt();
      const profile = await this.thirdPartyConnector.exchangeOidcCode(
        query.code ?? '',
        codeVerifier,
        serviceJwt,
      );

      const employee = await this.coreConnector.findOrCreateBySub({
        sub: profile.sub,
        email: profile.email,
        name: profile.name,
      });

      await this.issueEmployeeSession(employee, res);
      // SSO login succeeded — BFF already Set-Cookie, frontend needs no token handling
      res.redirect(`${frontendUrl}/dashboard`);
    } catch (error) {
      this.logger.warn(`OIDC SSO callback failed: ${(error as Error).message}`);
      res.redirect(`${frontendUrl}/login?error=sso_failed`);
    }
  }

  async handleGithubCallback(
    query: { code?: string; state?: string; error?: string },
    res: Response,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3003');

    if (query.error === 'access_denied') {
      res.redirect(`${frontendUrl}/login?error=oauth_cancelled`);
      return;
    }

    const stateKey = `oauth:github:state:${query.state ?? ''}`;
    let hasState: boolean;
    try {
      hasState = query.state ? await this.redisService.exists(stateKey) : false;
    } catch (error) {
      this.logger.warn(`Redis error checking OAuth state: ${(error as Error).message}`);
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
      return;
    }

    if (!hasState) {
      res.redirect(`${frontendUrl}/login?error=oauth_state_invalid`);
      return;
    }

    try {
      await this.redisService.del(stateKey);
    } catch (error) {
      this.logger.warn(`Redis error deleting OAuth state: ${(error as Error).message}`);
    }

    try {
      const serviceJwt = this.signServiceJwt();
      const profile = await this.thirdPartyConnector.exchangeGithubCode(
        query.code ?? '',
        serviceJwt,
      );
      const employee = await this.coreConnector.findOrCreateByGithub({
        githubId: profile.githubId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatar,
      });

      await this.issueEmployeeSession(employee, res);
      res.redirect(`${frontendUrl}/auth/github/callback`);
    } catch (error) {
      this.logger.warn(`GitHub OAuth callback failed: ${(error as Error).message}`);
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  private signServiceJwt(): string {
    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    return this.jwtService.sign({ sub: 'bff-service' }, { secret: jwtSecret, expiresIn: '60s' });
  }

  private async issueEmployeeSession(employee: EmployeeInfo, res: Response): Promise<void> {
    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const jwtRefreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');

    const accessToken = this.jwtService.sign(
      { sub: employee.id, email: employee.email, roles: employee.roles },
      { secret: jwtSecret, expiresIn: accessExpiresIn as any },
    );

    const refreshToken = this.jwtService.sign(
      { sub: employee.id },
      { secret: jwtRefreshSecret, expiresIn: refreshExpiresIn as any },
    );

    await this.redisService.set(`refresh:${employee.id}`, refreshToken, REFRESH_TOKEN_TTL_SECONDS);

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      // In production the frontend and BFF are deployed on different subdomains
      // (e.g. Render's *.onrender.com is a Public Suffix List entry, so each
      // subdomain is its own "site"), making this a cross-site request from the
      // browser's cookie policy perspective. SameSite=Strict/Lax would silently
      // drop the cookie there, so we relax to None (requires Secure, already
      // true in production). Locally frontend/BFF share the "localhost" site,
      // so Strict is kept for the extra CSRF protection.
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }

  private mapCoreError(error: CoreAuthError): never {
    const { coreCode, httpStatus, traceId } = error;
    if (httpStatus === 401 || coreCode === 'core-1001') {
      throw Object.assign(new UnauthorizedException('Invalid email or password'), {
        bffCode: 'bff-2001',
        traceId,
      });
    }
    if (httpStatus === 403 || coreCode === 'core-1002') {
      throw Object.assign(new ForbiddenException('Account disabled'), {
        bffCode: 'bff-2002',
        traceId,
      });
    }
    throw Object.assign(new ServiceUnavailableException('Authentication service unavailable'), {
      bffCode: 'bff-2099',
      traceId,
    });
  }

  async refresh(
    expiredToken: string | undefined,
    res: Response,
  ): Promise<{ user: { id: number; email: string; roles: string[] } }> {
    if (!expiredToken) {
      throw Object.assign(new UnauthorizedException('Invalid token'), {
        bffCode: 'bff-2003',
      });
    }

    const payload = this.jwtService.decode(expiredToken);
    if (!payload || typeof payload !== 'object' || typeof (payload as any).sub !== 'number') {
      throw Object.assign(new UnauthorizedException('Invalid token'), {
        bffCode: 'bff-2003',
      });
    }

    const { sub, email, roles } = payload as { sub: number; email: string; roles: string[] };

    const exists = await this.redisService.exists(`refresh:${sub}`);
    if (!exists) {
      throw Object.assign(new UnauthorizedException('Session expired, please login again'), {
        bffCode: 'bff-2004',
      });
    }

    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');

    const newToken = this.jwtService.sign(
      { sub, email, roles },
      { secret: jwtSecret, expiresIn: accessExpiresIn as any },
    );

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie('access_token', newToken, {
      httpOnly: true,
      secure: isProduction,
      // See issueEmployeeSession() for why this differs from Strict in production.
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    this.logger.log(`Token refreshed for userId=${sub}`);
    return { user: { id: sub, email, roles } };
  }

  async logout(userId: number, res: Response): Promise<void> {
    await this.redisService.del(`refresh:${userId}`);
    res.clearCookie('access_token', { path: '/' });
    this.logger.log(`User logged out userId=${userId}`);
  }
}
