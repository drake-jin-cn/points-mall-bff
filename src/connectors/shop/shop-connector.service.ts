import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface MenuItemNode {
  id: number;
  label: string;
  path: string | null;
  icon: string | null;
  parent_id: number | null;
  permission_key: string | null;
  sort_order: number;
  is_active: boolean;
  children: MenuItemNode[];
}

export interface MenuItemInput {
  label?: string;
  path?: string | null;
  icon?: string | null;
  parent_id?: number | null;
  permission_key?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export class ShopConnectorError extends Error {
  constructor(
    public readonly shopCode: string,
    public readonly httpStatus: number,
    public readonly traceId: string,
  ) {
    super(shopCode);
  }
}

@Injectable()
export class ShopConnectorService {
  private readonly logger = new Logger(ShopConnectorService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  private headers() {
    return { INTERNAL_API_KEY: this.config.getOrThrow<string>('INTERNAL_API_KEY') };
  }

  async getMenuTree(): Promise<MenuItemNode[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ code: string; data: MenuItemNode[] }>('/internal/admin/menus', {
          headers: this.headers(),
        }),
      );
      return response.data.data;
    } catch (error: any) {
      throw this.wrapError('getMenuTree', error);
    }
  }

  async createMenu(input: MenuItemInput): Promise<MenuItemNode> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ code: string; data: MenuItemNode }>(
          '/internal/admin/menus',
          input,
          { headers: this.headers() },
        ),
      );
      return response.data.data;
    } catch (error: any) {
      throw this.wrapError('createMenu', error);
    }
  }

  async updateMenu(id: number, input: MenuItemInput): Promise<MenuItemNode> {
    try {
      const response = await firstValueFrom(
        this.httpService.put<{ code: string; data: MenuItemNode }>(
          `/internal/admin/menus/${id}`,
          input,
          { headers: this.headers() },
        ),
      );
      return response.data.data;
    } catch (error: any) {
      throw this.wrapError('updateMenu', error);
    }
  }

  async deleteMenu(id: number): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(`/internal/admin/menus/${id}`, { headers: this.headers() }),
      );
    } catch (error: any) {
      throw this.wrapError('deleteMenu', error);
    }
  }

  private wrapError(op: string, error: any): ShopConnectorError {
    const status: number = error?.response?.status ?? 503;
    const code: string = error?.response?.data?.code ?? 'shop-9999';
    const traceId = crypto.randomUUID();
    this.logger.warn(`${op} failed status=${status} code=${code} traceId=${traceId}`);
    return new ShopConnectorError(code, status, traceId);
  }
}
