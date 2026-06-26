import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface EmployeeInfo {
  id: number;
  name: string;
  email: string;
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
      this.logger.warn(
        `verifyCredentials failed status=${status} code=${code} traceId=${traceId}`,
      );
      throw new CoreAuthError(code, status, traceId);
    }
  }
}
