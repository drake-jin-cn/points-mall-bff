import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Marks a route as requiring the given permission key. Must run after JwtAuthGuard has already
 * attached `request.user`, and combined with RequirePermissionGuard, which checks it against
 * Core's permission list for the user's roles.
 */
export const RequirePermission = (permissionKey: string) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissionKey);
