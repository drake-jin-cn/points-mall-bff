import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let bffCode = 'bff-9999';
    let message = 'Internal error';
    let traceId: string = crypto.randomUUID();

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const ext = exception as any;
      bffCode = ext.bffCode ?? this.statusToCode(status);
      traceId = ext.traceId ?? traceId;
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : (body as any).message ?? message;
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    res.status(status).json({
      code: bffCode,
      message,
      data: null,
      traceId,
    });
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'bff-4000',
      401: 'bff-4001',
      403: 'bff-4003',
      404: 'bff-4004',
      503: 'bff-2099',
    };
    return map[status] ?? 'bff-9999';
  }
}
