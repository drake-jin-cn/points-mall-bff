import {
  Controller,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { ok } from '../common/api-response';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('github')
  async github(@Res() res: Response) {
    await this.authService.startGithubLogin(res);
  }

  @Public()
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    await this.authService.handleGithubCallback({ code, state, error }, res);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const inboundTraceId = req.headers['x-trace-id'] as string | undefined;
    const result = await this.authService.login(
      dto.email,
      dto.password,
      inboundTraceId,
      res,
    );
    return ok(result);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = req.cookies?.['access_token'];
    const result = await this.authService.refresh(token, res);
    return ok(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = (req as any).user?.sub as number;
    await this.authService.logout(userId, res);
    return ok(null);
  }
}
