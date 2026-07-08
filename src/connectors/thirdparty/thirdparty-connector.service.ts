import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface GithubAuthUrlResult {
  url: string;
  state: string;
}

export interface GithubProfileResult {
  githubId: string;
  email: string;
  name: string;
  avatar: string | null;
}

export class ThirdPartyConnectorError extends Error {
  constructor(
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ThirdPartyConnectorService {
  private readonly logger = new Logger(ThirdPartyConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  async getGithubAuthUrl(serviceJwt: string): Promise<GithubAuthUrlResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GithubAuthUrlResult>('/oauth/github/url', {
          headers: {
            Authorization: `Bearer ${serviceJwt}`,
          },
        }),
      );
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status ?? 503;
      const message = error?.response?.data?.message ?? 'Thirdparty request failed';
      this.logger.warn(`getGithubAuthUrl failed status=${status}`);
      throw new ThirdPartyConnectorError(status, message);
    }
  }

  async exchangeGithubCode(code: string, serviceJwt: string): Promise<GithubProfileResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GithubProfileResult>('/oauth/github/callback', {
          headers: {
            Authorization: `Bearer ${serviceJwt}`,
          },
          params: {
            code,
          },
        }),
      );
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status ?? 503;
      const message = error?.response?.data?.message ?? 'Thirdparty request failed';
      this.logger.warn(`exchangeGithubCode failed status=${status}`);
      throw new ThirdPartyConnectorError(status, message);
    }
  }
}
