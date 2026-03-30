import { decodeJwtPayload, getStoredAccessToken } from "./auth-session";

export type AccessPolicy = {
  pages: {
    dashboard: boolean;
    proposals: boolean;
    orders: boolean;
    contracts: boolean;
    catalog: boolean;
    clients: boolean;
    equipments: boolean;
    usersControl: boolean;
  };
  catalog: {
    viewCosts: boolean;
    manageItems: boolean;
  };
  users: {
    manage: boolean;
    manageSecurity: boolean;
    manageCertifications: boolean;
    manageSpecialties: boolean;
    manageHierarchy: boolean;
    viewLiveLocation: boolean;
  };
  proposals: {
    requestDiscountAboveLimit: boolean;
    approveBudget: boolean;
  };
  maintenanceOrders: {
    submitVisitReport: boolean;
    approveVisitReport: boolean;
    assignWithOverride: boolean;
  };
  audit: {
    read: boolean;
  };
};

export type AccessPages = AccessPolicy["pages"];

type AccessRouteRule = {
  prefix: string;
  permission: keyof AccessPages;
};

const ACCESS_ROUTE_RULES: AccessRouteRule[] = [
  { prefix: "/dashboard/management", permission: "usersControl" },
  { prefix: "/dashboard/automation", permission: "usersControl" },
  { prefix: "/dashboard/reports", permission: "dashboard" },
  { prefix: "/dashboard/monitoring", permission: "orders" },
  { prefix: "/dashboard/sites", permission: "clients" },
  { prefix: "/dashboard/inventory", permission: "catalog" },
  { prefix: "/dashboard/purchase-orders", permission: "catalog" },
  { prefix: "/dashboard/finance", permission: "contracts" },
  { prefix: "/dashboard/hr", permission: "orders" },
  { prefix: "/dashboard/billing", permission: "contracts" },
  { prefix: "/dashboard/costs", permission: "contracts" },
  { prefix: "/dashboard/company-settings", permission: "usersControl" },
  { prefix: "/dashboard/profile", permission: "dashboard" },
  { prefix: "/dashboard/dispatch", permission: "orders" },
  { prefix: "/dashboard/technicians", permission: "orders" },
  { prefix: "/dashboard/opportunities", permission: "proposals" },
  { prefix: "/dashboard/commercial-inspections", permission: "proposals" },
  { prefix: "/dashboard/proposals", permission: "proposals" },
  { prefix: "/dashboard/orders", permission: "orders" },
  { prefix: "/dashboard/contracts", permission: "contracts" },
  { prefix: "/dashboard/catalog", permission: "catalog" },
  { prefix: "/dashboard/suppliers", permission: "catalog" },
  { prefix: "/dashboard/clients", permission: "clients" },
  { prefix: "/dashboard/equipments", permission: "equipments" },
  { prefix: "/dashboard/control", permission: "usersControl" },
];

export function defaultAccessByRole(role: string): AccessPolicy {
  if (role === "ADMIN") {
    return {
      pages: {
        dashboard: true,
        proposals: true,
        orders: true,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        usersControl: true,
      },
      catalog: { viewCosts: true, manageItems: true },
      users: {
        manage: true,
        manageSecurity: true,
        manageCertifications: true,
        manageSpecialties: true,
        manageHierarchy: true,
        viewLiveLocation: true,
      },
      proposals: { requestDiscountAboveLimit: true, approveBudget: true },
      maintenanceOrders: {
        submitVisitReport: true,
        approveVisitReport: true,
        assignWithOverride: true,
      },
      audit: { read: true },
    };
  }

  if (role === "SALES") {
    return {
      pages: {
        dashboard: true,
        proposals: true,
        orders: false,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        usersControl: false,
      },
      catalog: { viewCosts: false, manageItems: false },
      users: {
        manage: false,
        manageSecurity: false,
        manageCertifications: false,
        manageSpecialties: false,
        manageHierarchy: false,
        viewLiveLocation: false,
      },
      proposals: { requestDiscountAboveLimit: true, approveBudget: false },
      maintenanceOrders: {
        submitVisitReport: false,
        approveVisitReport: false,
        assignWithOverride: false,
      },
      audit: { read: false },
    };
  }

  if (role === "TECHNICIAN") {
    return {
      pages: {
        dashboard: true,
        proposals: false,
        orders: true,
        contracts: false,
        catalog: true,
        clients: true,
        equipments: true,
        usersControl: false,
      },
      catalog: { viewCosts: false, manageItems: false },
      users: {
        manage: false,
        manageSecurity: false,
        manageCertifications: false,
        manageSpecialties: false,
        manageHierarchy: false,
        viewLiveLocation: true,
      },
      proposals: { requestDiscountAboveLimit: false, approveBudget: false },
      maintenanceOrders: {
        submitVisitReport: true,
        approveVisitReport: false,
        assignWithOverride: false,
      },
      audit: { read: false },
    };
  }

  if (role === "ENGINEER_APPLICATION") {
    return {
      pages: {
        dashboard: true,
        proposals: true,
        orders: true,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        usersControl: false,
      },
      catalog: { viewCosts: true, manageItems: false },
      users: {
        manage: false,
        manageSecurity: false,
        manageCertifications: false,
        manageSpecialties: true,
        manageHierarchy: false,
        viewLiveLocation: true,
      },
      proposals: { requestDiscountAboveLimit: true, approveBudget: false },
      maintenanceOrders: {
        submitVisitReport: true,
        approveVisitReport: false,
        assignWithOverride: true,
      },
      audit: { read: false },
    };
  }

  if (role === "LOGISTICS") {
    return {
      pages: {
        dashboard: true,
        proposals: false,
        orders: true,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        usersControl: false,
      },
      catalog: { viewCosts: false, manageItems: true },
      users: {
        manage: false,
        manageSecurity: false,
        manageCertifications: false,
        manageSpecialties: false,
        manageHierarchy: false,
        viewLiveLocation: true,
      },
      proposals: { requestDiscountAboveLimit: false, approveBudget: false },
      maintenanceOrders: {
        submitVisitReport: false,
        approveVisitReport: false,
        assignWithOverride: true,
      },
      audit: { read: false },
    };
  }

  if (role === "CLIENT") {
    return {
      pages: {
        dashboard: true,
        proposals: true,
        orders: false,
        contracts: false,
        catalog: false,
        clients: false,
        equipments: false,
        usersControl: false,
      },
      catalog: { viewCosts: false, manageItems: false },
      users: {
        manage: false,
        manageSecurity: false,
        manageCertifications: false,
        manageSpecialties: false,
        manageHierarchy: false,
        viewLiveLocation: false,
      },
      proposals: { requestDiscountAboveLimit: false, approveBudget: false },
      maintenanceOrders: {
        submitVisitReport: false,
        approveVisitReport: false,
        assignWithOverride: false,
      },
      audit: { read: false },
    };
  }

  return {
    pages: {
      dashboard: true,
      proposals: true,
      orders: true,
      contracts: true,
      catalog: true,
      clients: true,
      equipments: true,
      usersControl: false,
    },
    catalog: { viewCosts: false, manageItems: false },
    users: {
      manage: false,
      manageSecurity: false,
      manageCertifications: false,
      manageSpecialties: false,
      manageHierarchy: false,
      viewLiveLocation: false,
    },
    proposals: { requestDiscountAboveLimit: false, approveBudget: false },
    maintenanceOrders: {
      submitVisitReport: true,
      approveVisitReport: false,
      assignWithOverride: false,
    },
    audit: { read: false },
  };
}

export function decodeToken() {
  const token = getStoredAccessToken();
  if (!token) return null;
  return decodeJwtPayload(token);
}

export function getAccessFromToken(): AccessPolicy {
  const payload = decodeToken();
  if (!payload) return defaultAccessByRole("NORMAL");
  if (payload.isSystemMaster || payload.role === "ADMIN") {
    return defaultAccessByRole("ADMIN");
  }

  const defaults = defaultAccessByRole(payload.role || "NORMAL");
  const custom = (payload.accessPolicy as Partial<AccessPolicy> | undefined) || {};

  const access = {
    pages: {
      dashboard: readBool(custom?.pages?.dashboard, defaults.pages.dashboard),
      proposals: readBool(custom?.pages?.proposals, defaults.pages.proposals),
      orders: readBool(custom?.pages?.orders, defaults.pages.orders),
      contracts: readBool(custom?.pages?.contracts, defaults.pages.contracts),
      catalog: readBool(custom?.pages?.catalog, defaults.pages.catalog),
      clients: readBool(custom?.pages?.clients, defaults.pages.clients),
      equipments: readBool(custom?.pages?.equipments, defaults.pages.equipments),
      usersControl: readBool(custom?.pages?.usersControl, defaults.pages.usersControl),
    },
    catalog: {
      viewCosts: readBool(custom?.catalog?.viewCosts, defaults.catalog.viewCosts),
      manageItems: readBool(custom?.catalog?.manageItems, defaults.catalog.manageItems),
    },
    users: {
      manage: readBool(custom?.users?.manage, defaults.users.manage),
      manageSecurity: readBool(custom?.users?.manageSecurity, defaults.users.manageSecurity),
      manageCertifications: readBool(custom?.users?.manageCertifications, defaults.users.manageCertifications),
      manageSpecialties: readBool(custom?.users?.manageSpecialties, defaults.users.manageSpecialties),
      manageHierarchy: readBool(custom?.users?.manageHierarchy, defaults.users.manageHierarchy),
      viewLiveLocation: readBool(custom?.users?.viewLiveLocation, defaults.users.viewLiveLocation),
    },
    proposals: {
      requestDiscountAboveLimit: readBool(custom?.proposals?.requestDiscountAboveLimit, defaults.proposals.requestDiscountAboveLimit),
      approveBudget: readBool(custom?.proposals?.approveBudget, defaults.proposals.approveBudget),
    },
    maintenanceOrders: {
      submitVisitReport: readBool(custom?.maintenanceOrders?.submitVisitReport, defaults.maintenanceOrders.submitVisitReport),
      approveVisitReport: readBool(custom?.maintenanceOrders?.approveVisitReport, defaults.maintenanceOrders.approveVisitReport),
      assignWithOverride: readBool(custom?.maintenanceOrders?.assignWithOverride, defaults.maintenanceOrders.assignWithOverride),
    },
    audit: {
      read: readBool(custom?.audit?.read, defaults.audit.read),
    },
  };

  return normalizeAccessPolicy(access);
}

export function canAccessDashboardPath(pathname: string, pages: AccessPages): boolean {
  if (!pathname.startsWith("/dashboard")) return true;
  if (pathname === "/dashboard") return pages.dashboard;

  for (const rule of ACCESS_ROUTE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return pages[rule.permission];
    }
  }

  return pages.dashboard;
}

function readBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeAccessPolicy(access: AccessPolicy): AccessPolicy {
  return {
    ...access,
    pages: {
      ...access.pages,
      usersControl: access.pages.usersControl || access.users.manage,
    },
  };
}
