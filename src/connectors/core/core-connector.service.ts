import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface EmployeeInfo {
  id: number;
  name: string;
  email: string;
  githubId?: string;
  oidcSub?: string;
  avatarUrl?: string | null;
  isActive: boolean;
  roles: string[];
}

export interface CoreVerifyResult {
  employee: EmployeeInfo;
  traceId: string;
}

export class CoreAuthError extends Error {
  constructor(
    public readonly coreCode: string,
    public readonly httpStatus: number,
    public readonly traceId: string,
  ) {
    super(coreCode);
  }
}

@Injectable()
export class CoreConnectorService {
  private readonly logger = new Logger(CoreConnectorService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async verifyCredentials(
    email: string,
    password: string,
    inboundTraceId?: string,
  ): Promise<CoreVerifyResult> {
    const traceId = inboundTraceId ?? crypto.randomUUID();
    const apiKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ code: string; data: EmployeeInfo }>(
          '/internal/auth/verify',
          { email, password },
          {
            headers: {
              INTERNAL_API_KEY: apiKey,
              'X-Trace-Id': traceId,
            },
          },
        ),
      );
      return { employee: response.data.data, traceId };
    } catch (error: any) {
      const status: number = error?.response?.status ?? 503;
      const code: string = error?.response?.data?.code ?? 'core-9999';
      this.logger.warn(`verifyCredentials failed status=${status} code=${code} traceId=${traceId}`);
      throw new CoreAuthError(code, status, traceId);
    }
  }

  async findOrCreateByGithub(profile: {
    githubId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  }): Promise<EmployeeInfo> {
    const apiKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ code: string; data: EmployeeInfo }>(
          '/internal/employees/find-or-create-by-github',
          profile,
          {
            headers: {
              INTERNAL_API_KEY: apiKey,
            },
          },
        ),
      );
      return response.data.data;
    } catch (error: any) {
      const status: number = error?.response?.status ?? 503;
      const code: string = error?.response?.data?.code ?? 'core-9999';
      const traceId = crypto.randomUUID();
      this.logger.warn(
        `findOrCreateByGithub failed status=${status} code=${code} traceId=${traceId}`,
      );
      throw new CoreAuthError(code, status, traceId);
    }
  }

  /**
   * Find or create an employee record by OIDC sub (IdP user unique ID).
   * Mirrors findOrCreateByGithub; Core implements idempotent upsert.
   */
  async findOrCreateBySub(profile: {
    sub: string;
    email: string;
    name: string;
  }): Promise<EmployeeInfo> {
    const apiKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ code: string; data: EmployeeInfo }>(
          '/internal/employees/find-or-create-by-oidc',
          profile,
          { headers: { INTERNAL_API_KEY: apiKey } },
        ),
      );
      return response.data.data;
    } catch (error: any) {
      const status: number = error?.response?.status ?? 503;
      const code: string = error?.response?.data?.code ?? 'core-9999';
      const traceId = crypto.randomUUID();
      this.logger.warn(`findOrCreateBySub failed status=${status} code=${code} traceId=${traceId}`);
      throw new CoreAuthError(code, status, traceId);
    }
  }

  /** Fetch an employee's profile by id (used by GET /employees/me). */
  async getEmployee(id: number): Promise<EmployeeInfo> {
    const apiKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ code: string; data: EmployeeInfo }>(`/internal/employees/${id}`, {
          headers: { INTERNAL_API_KEY: apiKey },
        }),
      );
      return response.data.data;
    } catch (error: any) {
      const status: number = error?.response?.status ?? 503;
      const code: string = error?.response?.data?.code ?? 'core-9999';
      const traceId = crypto.randomUUID();
      this.logger.warn(`getEmployee failed status=${status} code=${code} traceId=${traceId}`);
      throw new CoreAuthError(code, status, traceId);
    }
  }

  /** Fetch the deduplicated union of permission keys granted to the given role names. */
  async getPermissions(roles: string[]): Promise<string[]> {
    const apiKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ code: string; data: { permissions: string[] } }>(
          '/internal/permissions',
          {
            params: { roles: roles.join(',') },
            headers: { INTERNAL_API_KEY: apiKey },
          },
        ),
      );
      return response.data.data.permissions;
    } catch (error: any) {
      const status: number = error?.response?.status ?? 503;
      const code: string = error?.response?.data?.code ?? 'core-9999';
      const traceId = crypto.randomUUID();
      this.logger.warn(`getPermissions failed status=${status} code=${code} traceId=${traceId}`);
      throw new CoreAuthError(code, status, traceId);
    }
  }
}
