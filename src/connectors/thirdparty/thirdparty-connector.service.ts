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

export interface OidcAuthUrlResult {
  /** IdP authorization URL to redirect the browser to */
  url: string;
  /**
   * Concatenated string in format "state|codeVerifier".
   * BFF splits it: state → Redis key, codeVerifier → value (TTL 5min).
   */
  stateWithVerifier: string;
}

export interface OidcProfileResult {
  /** Immutable IdP user identifier (sub claim), used for find-or-create */
  sub: string;
  email: string;
  name: string;
  preferredUsername: string;
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

  /**
   * Requests OIDC authorization URL (with PKCE) from ThirdPartyConnector.
   * Returned stateWithVerifier is "state|codeVerifier"; BFF splits and stores in Redis.
   */
  async getOidcAuthUrl(serviceJwt: string): Promise<OidcAuthUrlResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ url: string; state: string }>('/oauth/oidc/url', {
          headers: { Authorization: `Bearer ${serviceJwt}` },
        }),
      );
      // ThirdPartyConnector returns state field as "state|codeVerifier"
      return { url: response.data.url, stateWithVerifier: response.data.state };
    } catch (error: any) {
      const status = error?.response?.status ?? 503;
      const message = error?.response?.data?.message ?? 'Thirdparty OIDC url failed';
      this.logger.warn(`getOidcAuthUrl failed status=${status}`);
      throw new ThirdPartyConnectorError(status, message);
    }
  }

  /**
   * Exchanges authorization code + code_verifier for id_token via ThirdPartyConnector.
   * ThirdPartyConnector performs JWKS verification and returns normalized user profile.
   */
  async exchangeOidcCode(
    code: string,
    codeVerifier: string,
    serviceJwt: string,
  ): Promise<OidcProfileResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<OidcProfileResult>(
          '/oauth/oidc/callback',
          { code, codeVerifier },
          { headers: { Authorization: `Bearer ${serviceJwt}` } },
        ),
      );
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status ?? 503;
      const message = error?.response?.data?.message ?? 'Thirdparty OIDC callback failed';
      this.logger.warn(`exchangeOidcCode failed status=${status}`);
      throw new ThirdPartyConnectorError(status, message);
    }
  }
}
