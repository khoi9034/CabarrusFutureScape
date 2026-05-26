"use client";

import { useCallback, useMemo, useState } from "react";
import {
  defaultDashboardRoleId,
  getDashboardRoleById,
} from "@/lib/dashboard/roleRegistry";
import type { DashboardRoleId } from "@/types/userRoles";

export function useRoleState() {
  const [roleId, setRoleId] = useState<DashboardRoleId>(
    defaultDashboardRoleId,
  );

  const activeRole = useMemo(() => getDashboardRoleById(roleId), [roleId]);

  const setDashboardRoleId = useCallback((nextRoleId: DashboardRoleId) => {
    setRoleId(nextRoleId);
  }, []);

  return {
    activeRole,
    roleId,
    setDashboardRoleId,
  };
}
