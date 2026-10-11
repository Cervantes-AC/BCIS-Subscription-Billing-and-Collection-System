import React from 'react';
import { useAuthStore } from '../stores/useAuthStore';

export function usePermission(hasPermission: (permission: string) => boolean) {
  const { user } = useAuthStore();

  React.useEffect(() => {
    if (!user?.role?.permissions) return;

    const userPermissions = user.role.permissions.map((p: any) => p.code);

    // Export permission check functions
    // These can be used inline in components
    ;(window as any).checkPermission = (permission: string) =>
      userPermissions.includes(permission);
  }, [user]);
}