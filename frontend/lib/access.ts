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
    finance: boolean;
    inventory: boolean;
    people: boolean;
    usersControl: boolean;
    tickets: boolean;
    serviceReports: boolean;
    technicianPortal: boolean;
  };
  clients: {
    view: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  catalog: {
    viewCosts: boolean;
    manageItems: boolean;
    view: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
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
    view: boolean;
    create: boolean;
    update: boolean;
    approve: boolean;
    cancel: boolean;
    requestDiscountAboveLimit: boolean;
    approveBudget: boolean;
  };
  contracts: {
    view: boolean;
    create: boolean;
    update: boolean;
    activate: boolean;
    cancel: boolean;
  };
  orders: {
    view: boolean;
    create: boolean;
    update: boolean;
    dispatch: boolean;
    finish: boolean;
    cancel: boolean;
  };
  maintenanceOrders: {
    submitVisitReport: boolean;
    approveVisitReport: boolean;
    assignWithOverride: boolean;
  };
  serviceReports: {
    view: boolean;
    create: boolean;
    update: boolean;
    addEvidence: boolean;
    sign: boolean;
    approve: boolean;
    releaseToCustomer: boolean;
    generateDocument: boolean;
    manageShareLinks: boolean;
    cancel: boolean;
  };
  tickets: {
    view: boolean;
    viewOwn: boolean;
    create: boolean;
    update: boolean;
    assign: boolean;
    comment: boolean;
    commentOwn: boolean;
    convertToOrder: boolean;
    resolve: boolean;
    close: boolean;
    cancel: boolean;
  };
  inventory: {
    view: boolean;
    create: boolean;
    update: boolean;
    reserve: boolean;
    consume: boolean;
    adjust: boolean;
  };
  purchaseOrders: {
    view: boolean;
    create: boolean;
    update: boolean;
    approve: boolean;
    receive: boolean;
    cancel: boolean;
  };
  finance: {
    view: boolean;
    create: boolean;
    update: boolean;
    pay: boolean;
    cancel: boolean;
    reconcile: boolean;
  };
  people: {
    view: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  technicians: {
    view: boolean;
    dispatch: boolean;
    schedule: boolean;
  };
  technicianWork: {
    view: boolean;
    checkInOut: boolean;
  };
  reports: {
    view: boolean;
    export: boolean;
  };
  settings: {
    view: boolean;
    update: boolean;
    admin: boolean;
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

type AccessPolicyOverrides = {
  [Section in keyof AccessPolicy]?: Partial<AccessPolicy[Section]>;
};

const ACCESS_ROUTE_RULES: AccessRouteRule[] = [
  { prefix: "/dashboard/management", permission: "usersControl" },
  { prefix: "/dashboard/automation", permission: "usersControl" },
  { prefix: "/dashboard/documents", permission: "dashboard" },
  { prefix: "/dashboard/deliveries", permission: "dashboard" },
  { prefix: "/dashboard/notifications", permission: "dashboard" },
  { prefix: "/dashboard/reports", permission: "dashboard" },
  { prefix: "/dashboard/monitoring", permission: "orders" },
  { prefix: "/dashboard/sites", permission: "clients" },
  { prefix: "/dashboard/inventory", permission: "inventory" },
  { prefix: "/dashboard/purchase-orders", permission: "inventory" },
  { prefix: "/dashboard/finance", permission: "finance" },
  { prefix: "/dashboard/hr", permission: "people" },
  { prefix: "/dashboard/billing", permission: "finance" },
  { prefix: "/dashboard/costs", permission: "finance" },
  { prefix: "/dashboard/company-settings", permission: "usersControl" },
  { prefix: "/dashboard/profile", permission: "dashboard" },
  { prefix: "/dashboard/tecnico", permission: "technicianPortal" },
  { prefix: "/dashboard/atendimento", permission: "tickets" },
  { prefix: "/dashboard/relatorios-tecnicos", permission: "serviceReports" },
  { prefix: "/dashboard/dispatch", permission: "orders" },
  { prefix: "/dashboard/technicians", permission: "orders" },
  { prefix: "/dashboard/opportunities", permission: "proposals" },
  { prefix: "/dashboard/commercial-inspections", permission: "proposals" },
  { prefix: "/dashboard/proposals", permission: "proposals" },
  { prefix: "/dashboard/orders", permission: "orders" },
  { prefix: "/dashboard/contracts", permission: "contracts" },
  { prefix: "/dashboard/catalog", permission: "catalog" },
  { prefix: "/dashboard/suppliers", permission: "inventory" },
  { prefix: "/dashboard/clients", permission: "clients" },
  { prefix: "/dashboard/equipments", permission: "equipments" },
  { prefix: "/dashboard/control", permission: "usersControl" },
];

const EMPTY_ACCESS_POLICY: AccessPolicy = {
  pages: {
    dashboard: false,
    proposals: false,
    orders: false,
    contracts: false,
    catalog: false,
    clients: false,
    equipments: false,
    finance: false,
    inventory: false,
    people: false,
    usersControl: false,
    tickets: false,
    serviceReports: false,
    technicianPortal: false,
  },
  clients: { view: false, create: false, update: false, delete: false },
  catalog: {
    viewCosts: false,
    manageItems: false,
    view: false,
    create: false,
    update: false,
    delete: false,
  },
  users: {
    manage: false,
    manageSecurity: false,
    manageCertifications: false,
    manageSpecialties: false,
    manageHierarchy: false,
    viewLiveLocation: false,
  },
  proposals: {
    view: false,
    create: false,
    update: false,
    approve: false,
    cancel: false,
    requestDiscountAboveLimit: false,
    approveBudget: false,
  },
  contracts: {
    view: false,
    create: false,
    update: false,
    activate: false,
    cancel: false,
  },
  orders: {
    view: false,
    create: false,
    update: false,
    dispatch: false,
    finish: false,
    cancel: false,
  },
  maintenanceOrders: {
    submitVisitReport: false,
    approveVisitReport: false,
    assignWithOverride: false,
  },
  serviceReports: {
    view: false,
    create: false,
    update: false,
    addEvidence: false,
    sign: false,
    approve: false,
    releaseToCustomer: false,
    generateDocument: false,
    manageShareLinks: false,
    cancel: false,
  },
  tickets: {
    view: false,
    viewOwn: false,
    create: false,
    update: false,
    assign: false,
    comment: false,
    commentOwn: false,
    convertToOrder: false,
    resolve: false,
    close: false,
    cancel: false,
  },
  inventory: {
    view: false,
    create: false,
    update: false,
    reserve: false,
    consume: false,
    adjust: false,
  },
  purchaseOrders: {
    view: false,
    create: false,
    update: false,
    approve: false,
    receive: false,
    cancel: false,
  },
  finance: {
    view: false,
    create: false,
    update: false,
    pay: false,
    cancel: false,
    reconcile: false,
  },
  people: { view: false, create: false, update: false, delete: false },
  technicians: { view: false, dispatch: false, schedule: false },
  technicianWork: { view: false, checkInOut: false },
  reports: { view: false, export: false },
  settings: { view: false, update: false, admin: false },
  audit: { read: false },
};

export function defaultAccessByRole(role: string): AccessPolicy {
  if (role === "ADMIN") return allAccess();

  if (role === "MANAGER") {
    return policy({
      pages: {
        dashboard: true,
        proposals: true,
        orders: true,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        finance: true,
        inventory: true,
        people: true,
        usersControl: true,
        tickets: true,
        serviceReports: true,
        technicianPortal: true,
      },
      clients: { view: true, create: true, update: true, delete: true },
      catalog: {
        viewCosts: true,
        manageItems: true,
        view: true,
        create: true,
        update: true,
      },
      users: {
        manage: true,
        manageCertifications: true,
        manageSpecialties: true,
        manageHierarchy: true,
        viewLiveLocation: true,
      },
      proposals: {
        view: true,
        create: true,
        update: true,
        approve: true,
        cancel: true,
        requestDiscountAboveLimit: true,
        approveBudget: true,
      },
      contracts: {
        view: true,
        create: true,
        update: true,
        activate: true,
        cancel: true,
      },
      orders: {
        view: true,
        create: true,
        update: true,
        dispatch: true,
        finish: true,
        cancel: true,
      },
      maintenanceOrders: {
        submitVisitReport: true,
        approveVisitReport: true,
        assignWithOverride: true,
      },
      serviceReports: allServiceReportActions(),
      tickets: {
        view: true,
        create: true,
        update: true,
        assign: true,
        comment: true,
        convertToOrder: true,
        resolve: true,
        close: true,
        cancel: true,
      },
      inventory: {
        view: true,
        create: true,
        update: true,
        reserve: true,
        consume: true,
        adjust: true,
      },
      purchaseOrders: {
        view: true,
        create: true,
        update: true,
        approve: true,
        receive: true,
        cancel: true,
      },
      finance: {
        view: true,
        create: true,
        update: true,
        pay: true,
        cancel: true,
        reconcile: true,
      },
      people: { view: true, create: true, update: true },
      technicians: { view: true, dispatch: true, schedule: true },
      technicianWork: { view: true, checkInOut: true },
      reports: { view: true, export: true },
      settings: { view: true, update: true },
      audit: { read: true },
    });
  }

  if (role === "SALES") {
    return policy({
      pages: {
        dashboard: true,
        proposals: true,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        serviceReports: true,
      },
      clients: { view: true, create: true, update: true },
      catalog: { view: true },
      proposals: {
        view: true,
        create: true,
        update: true,
        requestDiscountAboveLimit: true,
      },
      tickets: { view: true, create: true, update: true, comment: true },
      contracts: { view: true },
      reports: { view: true },
    });
  }

  if (role === "TECHNICIAN") {
    return policy({
      pages: {
        dashboard: true,
        orders: true,
        catalog: true,
        clients: true,
        equipments: true,
        technicianPortal: true,
      },
      clients: { view: true },
      catalog: { view: true },
      orders: { view: true, update: true, finish: true },
      maintenanceOrders: { submitVisitReport: true },
      serviceReports: {
        view: true,
        create: true,
        update: true,
        addEvidence: true,
        sign: true,
      },
      tickets: { viewOwn: true, comment: true, commentOwn: true },
      inventory: { view: true },
      technicians: { view: true, schedule: true },
      technicianWork: { view: true, checkInOut: true },
      users: { viewLiveLocation: true },
    });
  }

  if (role === "ENGINEER_APPLICATION") {
    return policy({
      pages: {
        dashboard: true,
        proposals: true,
        orders: true,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        inventory: true,
        tickets: true,
        serviceReports: true,
        technicianPortal: true,
      },
      clients: { view: true },
      catalog: { viewCosts: true, view: true },
      proposals: {
        view: true,
        create: true,
        update: true,
        requestDiscountAboveLimit: true,
      },
      contracts: { view: true },
      orders: {
        view: true,
        create: true,
        update: true,
        dispatch: true,
        finish: true,
      },
      maintenanceOrders: { submitVisitReport: true, assignWithOverride: true },
      serviceReports: allServiceReportActions(),
      tickets: {
        view: true,
        viewOwn: true,
        create: true,
        update: true,
        assign: true,
        comment: true,
        commentOwn: true,
        convertToOrder: true,
        resolve: true,
        close: true,
        cancel: true,
      },
      inventory: { view: true, reserve: true, consume: true },
      technicians: { view: true, dispatch: true, schedule: true },
      technicianWork: { view: true, checkInOut: true },
      users: { manageSpecialties: true, viewLiveLocation: true },
      reports: { view: true },
    });
  }

  if (role === "LOGISTICS" || role === "SUPPLIES") {
    return policy({
      pages: {
        dashboard: true,
        orders: true,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        inventory: true,
        tickets: role === "LOGISTICS",
        serviceReports: role === "LOGISTICS",
        technicianPortal: role === "LOGISTICS",
      },
      clients: { view: true },
      catalog: {
        view: true,
        viewCosts: role === "SUPPLIES",
        manageItems: true,
        create: true,
        update: true,
      },
      contracts: { view: true },
      orders: { view: true, dispatch: true },
      tickets:
        role === "LOGISTICS"
          ? {
              view: true,
              viewOwn: true,
              update: true,
              assign: true,
              comment: true,
              commentOwn: true,
              convertToOrder: true,
              resolve: true,
              close: true,
            }
          : undefined,
      inventory: {
        view: true,
        create: true,
        update: true,
        reserve: true,
        adjust: true,
      },
      purchaseOrders: {
        view: true,
        create: true,
        update: true,
        approve: true,
        receive: true,
        cancel: true,
      },
      technicians: { view: true, dispatch: true },
      technicianWork:
        role === "LOGISTICS" ? { view: true, checkInOut: true } : undefined,
      serviceReports:
        role === "LOGISTICS" ? allServiceReportActions() : undefined,
      users: { viewLiveLocation: true },
      reports: { view: true },
    });
  }

  if (role === "FINANCE") {
    return policy({
      pages: {
        dashboard: true,
        contracts: true,
        clients: true,
        finance: true,
        tickets: true,
      },
      clients: { view: true },
      contracts: { view: true },
      finance: {
        view: true,
        create: true,
        update: true,
        pay: true,
        cancel: true,
        reconcile: true,
      },
      tickets: { view: true, create: true, comment: true },
      reports: { view: true, export: true },
      audit: { read: true },
    });
  }

  if (role === "HR") {
    return policy({
      pages: { dashboard: true, orders: true, people: true, tickets: true },
      orders: { view: true },
      people: { view: true, create: true, update: true, delete: true },
      technicians: { view: true, schedule: true },
      tickets: { view: true },
      users: { manageCertifications: true, manageSpecialties: true },
      reports: { view: true },
      audit: { read: true },
    });
  }

  if (role === "AUDITOR") {
    return policy({
      pages: {
        dashboard: true,
        proposals: true,
        orders: true,
        contracts: true,
        catalog: true,
        clients: true,
        equipments: true,
        finance: true,
        inventory: true,
        people: true,
        tickets: true,
        serviceReports: true,
      },
      clients: { view: true },
      catalog: { view: true, viewCosts: true },
      proposals: { view: true },
      contracts: { view: true },
      orders: { view: true },
      inventory: { view: true },
      purchaseOrders: { view: true },
      finance: { view: true },
      people: { view: true },
      technicians: { view: true },
      tickets: { view: true },
      serviceReports: { view: true },
      reports: { view: true, export: true },
      audit: { read: true },
    });
  }

  if (role === "CLIENT") {
    return policy({
      pages: { dashboard: true, proposals: true },
      proposals: { view: true, approve: true, cancel: true },
    });
  }

  return policy({
    pages: {
      dashboard: true,
      proposals: true,
      orders: true,
      contracts: true,
      catalog: true,
      clients: true,
      equipments: true,
      serviceReports: true,
    },
    clients: { view: true },
    catalog: { view: true },
    proposals: { view: true, create: true, update: true },
    contracts: { view: true },
    orders: { view: true, update: true },
    maintenanceOrders: { submitVisitReport: true },
    serviceReports: {
      view: true,
      create: true,
      update: true,
      addEvidence: true,
      sign: true,
    },
    inventory: { view: true },
    technicians: { view: true },
    reports: { view: true },
  });
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
  const custom =
    (payload.accessPolicy as AccessPolicyOverrides | undefined) || {};
  return normalizeAccessPolicy(mergeAccessPolicy(defaults, custom));
}

export function canAccessDashboardPath(
  pathname: string,
  pages: AccessPages,
): boolean {
  if (!pathname.startsWith("/dashboard")) return true;
  if (pathname === "/dashboard") return pages.dashboard;

  for (const rule of ACCESS_ROUTE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return pages[rule.permission];
    }
  }

  return pages.dashboard;
}

function policy(overrides: AccessPolicyOverrides): AccessPolicy {
  return normalizeAccessPolicy(
    mergeAccessPolicy(EMPTY_ACCESS_POLICY, overrides),
  );
}

function allAccess(): AccessPolicy {
  return mapAccessPolicy(EMPTY_ACCESS_POLICY, () => true);
}

function mergeAccessPolicy(
  base: AccessPolicy,
  overrides: AccessPolicyOverrides,
): AccessPolicy {
  return {
    pages: mergeSection(base.pages, overrides.pages),
    clients: mergeSection(base.clients, overrides.clients),
    catalog: mergeSection(base.catalog, overrides.catalog),
    users: mergeSection(base.users, overrides.users),
    proposals: mergeSection(base.proposals, overrides.proposals),
    contracts: mergeSection(base.contracts, overrides.contracts),
    orders: mergeSection(base.orders, overrides.orders),
    maintenanceOrders: mergeSection(
      base.maintenanceOrders,
      overrides.maintenanceOrders,
    ),
    serviceReports: mergeSection(base.serviceReports, overrides.serviceReports),
    tickets: mergeSection(base.tickets, overrides.tickets),
    inventory: mergeSection(base.inventory, overrides.inventory),
    purchaseOrders: mergeSection(base.purchaseOrders, overrides.purchaseOrders),
    finance: mergeSection(base.finance, overrides.finance),
    people: mergeSection(base.people, overrides.people),
    technicians: mergeSection(base.technicians, overrides.technicians),
    technicianWork: mergeSection(
      base.technicianWork,
      overrides.technicianWork,
    ),
    reports: mergeSection(base.reports, overrides.reports),
    settings: mergeSection(base.settings, overrides.settings),
    audit: mergeSection(base.audit, overrides.audit),
  };
}

function mergeSection<T extends Record<string, boolean>>(
  base: T,
  overrides?: Partial<T>,
): T {
  const merged = { ...base };
  for (const key of Object.keys(base) as Array<keyof T>) {
    const value = overrides?.[key];
    if (typeof value === "boolean") {
      merged[key] = value as T[keyof T];
    }
  }
  return merged;
}

function mapAccessPolicy(
  input: AccessPolicy,
  mapper: (value: boolean) => boolean,
): AccessPolicy {
  return {
    pages: mapSection(input.pages, mapper),
    clients: mapSection(input.clients, mapper),
    catalog: mapSection(input.catalog, mapper),
    users: mapSection(input.users, mapper),
    proposals: mapSection(input.proposals, mapper),
    contracts: mapSection(input.contracts, mapper),
    orders: mapSection(input.orders, mapper),
    maintenanceOrders: mapSection(input.maintenanceOrders, mapper),
    serviceReports: mapSection(input.serviceReports, mapper),
    tickets: mapSection(input.tickets, mapper),
    inventory: mapSection(input.inventory, mapper),
    purchaseOrders: mapSection(input.purchaseOrders, mapper),
    finance: mapSection(input.finance, mapper),
    people: mapSection(input.people, mapper),
    technicians: mapSection(input.technicians, mapper),
    technicianWork: mapSection(input.technicianWork, mapper),
    reports: mapSection(input.reports, mapper),
    settings: mapSection(input.settings, mapper),
    audit: mapSection(input.audit, mapper),
  };
}

function mapSection<T extends Record<string, boolean>>(
  input: T,
  mapper: (value: boolean) => boolean,
): T {
  const output = { ...input };
  for (const key of Object.keys(input) as Array<keyof T>) {
    output[key] = mapper(input[key]) as T[keyof T];
  }
  return output;
}

function normalizeAccessPolicy(access: AccessPolicy): AccessPolicy {
  return {
    ...access,
    pages: {
      ...access.pages,
      proposals: access.pages.proposals || access.proposals.view,
      orders: access.pages.orders || access.orders.view,
      contracts: access.pages.contracts || access.contracts.view,
      catalog:
        access.pages.catalog ||
        access.catalog.view ||
        access.catalog.manageItems,
      clients: access.pages.clients || access.clients.view,
      finance: access.pages.finance || access.finance.view,
      inventory:
        access.pages.inventory ||
        access.inventory.view ||
        access.purchaseOrders.view,
      people: access.pages.people || access.people.view,
      usersControl: access.pages.usersControl || access.users.manage,
      tickets: access.pages.tickets || access.tickets.view,
      serviceReports:
        access.pages.serviceReports || access.serviceReports.view,
      technicianPortal:
        access.pages.technicianPortal ||
        access.technicianWork.view ||
        access.tickets.viewOwn,
    },
    proposals: {
      ...access.proposals,
      approveBudget: access.proposals.approveBudget || access.proposals.approve,
    },
    catalog: {
      ...access.catalog,
      manageItems:
        access.catalog.manageItems ||
        access.catalog.create ||
        access.catalog.update ||
        access.catalog.delete,
    },
    maintenanceOrders: {
      ...access.maintenanceOrders,
      submitVisitReport:
        access.maintenanceOrders.submitVisitReport || access.orders.finish,
      assignWithOverride:
        access.maintenanceOrders.assignWithOverride || access.orders.dispatch,
    },
    serviceReports: {
      ...access.serviceReports,
      create: access.serviceReports.create || access.serviceReports.update,
      addEvidence:
        access.serviceReports.addEvidence || access.serviceReports.update,
      sign: access.serviceReports.sign || access.serviceReports.update,
      generateDocument:
        access.serviceReports.generateDocument ||
        access.serviceReports.approve,
      manageShareLinks:
        access.serviceReports.manageShareLinks ||
        access.serviceReports.releaseToCustomer,
    },
  };
}

function allServiceReportActions() {
  return {
    view: true,
    create: true,
    update: true,
    addEvidence: true,
    sign: true,
    approve: true,
    releaseToCustomer: true,
    generateDocument: true,
    manageShareLinks: true,
    cancel: true,
  };
}
