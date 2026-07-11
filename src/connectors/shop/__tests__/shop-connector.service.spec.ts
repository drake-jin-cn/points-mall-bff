import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { ShopConnectorError, ShopConnectorService } from '../shop-connector.service';

describe('ShopConnectorService', () => {
  let service: ShopConnectorService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopConnectorService,
        {
          provide: HttpService,
          useValue: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('internal-key') },
        },
      ],
    }).compile();

    service = module.get(ShopConnectorService);
    httpService = module.get(HttpService);
  });

  it('getMenuTree fetches the tree with INTERNAL_API_KEY header', async () => {
    const tree = [{ id: 1, label: 'Dashboard', children: [] }];
    httpService.get.mockReturnValue(of({ data: { code: 'OK', data: tree } } as any));

    const result = await service.getMenuTree();

    expect(httpService.get).toHaveBeenCalledWith('/internal/admin/menus', {
      headers: { INTERNAL_API_KEY: 'internal-key' },
    });
    expect(result).toEqual(tree);
  });

  it('createMenu posts the input and returns the created item', async () => {
    const created = { id: 2, label: 'New' };
    httpService.post.mockReturnValue(of({ data: { code: 'OK', data: created } } as any));

    const result = await service.createMenu({ label: 'New' });

    expect(httpService.post).toHaveBeenCalledWith(
      '/internal/admin/menus',
      { label: 'New' },
      {
        headers: { INTERNAL_API_KEY: 'internal-key' },
      },
    );
    expect(result).toEqual(created);
  });

  it('updateMenu puts to the id-scoped route', async () => {
    const updated = { id: 2, label: 'Renamed' };
    httpService.put.mockReturnValue(of({ data: { code: 'OK', data: updated } } as any));

    const result = await service.updateMenu(2, { label: 'Renamed' });

    expect(httpService.put).toHaveBeenCalledWith(
      '/internal/admin/menus/2',
      { label: 'Renamed' },
      { headers: { INTERNAL_API_KEY: 'internal-key' } },
    );
    expect(result).toEqual(updated);
  });

  it('deleteMenu calls delete on the id-scoped route', async () => {
    httpService.delete.mockReturnValue(of({ data: { code: 'OK', data: null } } as any));

    await service.deleteMenu(2);

    expect(httpService.delete).toHaveBeenCalledWith('/internal/admin/menus/2', {
      headers: { INTERNAL_API_KEY: 'internal-key' },
    });
  });

  it('wraps HTTP failures in ShopConnectorError, preserving status and code (e.g. shop-4011 conflict)', async () => {
    httpService.delete.mockReturnValue(
      throwError(() => ({
        response: { status: 409, data: { code: 'shop-4011' } },
      })),
    );

    await expect(service.deleteMenu(1)).rejects.toBeInstanceOf(ShopConnectorError);
    await expect(service.deleteMenu(1)).rejects.toMatchObject({
      httpStatus: 409,
      shopCode: 'shop-4011',
    });
  });
});
