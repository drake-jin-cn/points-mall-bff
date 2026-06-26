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
      const result = await this.coreConnector.verifyCredentials(
        email,
        password,
        inboundTraceId,
      );
      employee = result.employee;
      traceId = result.traceId;
    } catch (error) {
      if (error instanceof CoreAuthError) {
        this.mapCoreError(error);
      }
      throw new ServiceUnavailableException('Authentication service unavailable');
    }

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

    await this.redisService.set(
      `refresh:${employee.id}`,
      refreshToken,
      REFRESH_TOKEN_TTL_SECONDS,
    );

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
      path: '/',
    });

    this.logger.log(
      `Login success employeeId=${employee.id} traceId=${traceId}`,
    );

    return {
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        roles: employee.roles,
      },
    };
  }

  private mapCoreError(error: CoreAuthError): never {
    const { coreCode, httpStatus, traceId } = error;
    if (httpStatus === 401 || coreCode === 'core-1001') {
      throw Object.assign(
        new UnauthorizedException('Invalid email or password'),
        { bffCode: 'bff-2001', traceId },
      );
    }
    if (httpStatus === 403 || coreCode === 'core-1002') {
      throw Object.assign(
        new ForbiddenException('Account disabled'),
        { bffCode: 'bff-2002', traceId },
      );
    }
    throw Object.assign(
      new ServiceUnavailableException('Authentication service unavailable'),
      { bffCode: 'bff-2099', traceId },
    );
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
      sameSite: 'strict',
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
