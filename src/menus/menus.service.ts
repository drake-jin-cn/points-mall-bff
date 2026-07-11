import { Injectable, Logger } from '@nestjs/common';
import { CoreConnectorService } from '../connectors/core/core-connector.service';
import {
  MenuItemInput,
  MenuItemNode,
  ShopConnectorService,
} from '../connectors/shop/shop-connector.service';

@Injectable()
export class MenusService {
  private readonly logger = new Logger(MenusService.name);

  constructor(
    private readonly coreConnector: CoreConnectorService,
    private readonly shopConnector: ShopConnectorService,
  ) {}

  /**
   * Fetches the user's permissions + the full menu tree, filters recursively by permission key,
   * and sorts by sort_order. Degrades to an empty tree (never a 500) if either downstream call
   * fails — a broken/slow Shop or Core call must not break the whole dashboard shell.
   */
  async getMenusForRoles(roles: string[]): Promise<MenuItemNode[]> {
    let permissions: string[];
    let tree: MenuItemNode[];

    try {
      permissions = await this.coreConnector.getPermissions(roles);
    } catch (error) {
      this.logger.warn(`bff-2099: permissions fetch failed for /menus, degrading to []`, error);
      return [];
    }

    try {
      tree = await this.shopConnector.getMenuTree();
    } catch (error) {
      this.logger.warn(`bff-2099: menu tree fetch failed for /menus, degrading to []`, error);
      return [];
    }

    const permissionSet = new Set(permissions);
    return this.filterTree(tree, permissionSet);
  }

  private filterTree(nodes: MenuItemNode[], permissionSet: Set<string>): MenuItemNode[] {
    const result: MenuItemNode[] = [];

    for (const node of nodes) {
      const hasOwnChildren = (node.children?.length ?? 0) > 0;
      const filteredChildren = this.filterTree(node.children ?? [], permissionSet);
      const hasDirectPermission =
        node.permission_key == null || permissionSet.has(node.permission_key);
      // Group nodes (defined by having children in the source tree) are gated purely by
      // whether any child survives filtering — a null permission_key on a group must not
      // make it visible when every child was filtered out. Leaf nodes keep the simple rule.
      const visible = hasOwnChildren ? filteredChildren.length > 0 : hasDirectPermission;

      if (visible) {
        result.push({ ...node, children: filteredChildren });
      }
    }

    return result.sort((a, b) => a.sort_order - b.sort_order);
  }

  async getAdminMenuTree(): Promise<MenuItemNode[]> {
    return this.shopConnector.getMenuTree();
  }

  async createMenu(input: MenuItemInput): Promise<MenuItemNode> {
    return this.shopConnector.createMenu(input);
  }

  async updateMenu(id: number, input: MenuItemInput): Promise<MenuItemNode> {
    return this.shopConnector.updateMenu(id, input);
  }

  async deleteMenu(id: number): Promise<void> {
    return this.shopConnector.deleteMenu(id);
  }
}
