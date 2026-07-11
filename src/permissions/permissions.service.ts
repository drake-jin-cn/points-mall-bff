import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CoreAuthError,
  CoreConnectorService,
  EmployeeInfo,
} from '../connectors/core/core-connector.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly coreConnector: CoreConnectorService) {}

  async getEmployeeProfile(id: number): Promise<EmployeeInfo> {
    try {
      return await this.coreConnector.getEmployee(id);
    } catch (error) {
      throw this.mapCoreError(error as CoreAuthError);
    }
  }

  async getPermissions(roles: string[]): Promise<string[]> {
    return this.coreConnector.getPermissions(roles);
  }

  /**
   * Propagates the exact upstream Core error code + HTTP status to the client (e.g. core-1012 ->
   * 404), rather than mapping it to a generic bff-XXXX code — the caller needs to know precisely
   * why the lookup failed.
   */
  private mapCoreError(error: CoreAuthError): never {
    const { coreCode, httpStatus, traceId } = error;

    if (httpStatus === 404) {
      throw Object.assign(new NotFoundException('Employee not found'), {
        bffCode: coreCode,
        traceId,
      });
    }
    if (httpStatus === 401 || httpStatus === 403) {
      throw Object.assign(new ForbiddenException('Forbidden'), {
        bffCode: coreCode,
        traceId,
      });
    }
    throw Object.assign(new ServiceUnavailableException('Employee service unavailable'), {
      bffCode: 'bff-2099',
      traceId,
    });
  }
}
