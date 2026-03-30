import { UserRole } from '@prisma/client';

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

export const allAccessPolicy: AccessPolicy = {
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
  catalog: {
    viewCosts: true,
    manageItems: true,
  },
  users: {
    manage: true,
    manageSecurity: true,
    manageCertifications: true,
    manageSpecialties: true,
    manageHierarchy: true,
    viewLiveLocation: true,
  },
  proposals: {
    requestDiscountAboveLimit: true,
    approveBudget: true,
  },
  maintenanceOrders: {
    submitVisitReport: true,
    approveVisitReport: true,
    assignWithOverride: true,
  },
  audit: {
    read: true,
  },
};

export function defaultAccessPolicyByRole(role: UserRole): AccessPolicy {
  if (role === UserRole.ADMIN) return allAccessPolicy;

  if (role === UserRole.SALES) {
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
      catalog: {
        viewCosts: false,
        manageItems: false,
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
        requestDiscountAboveLimit: true,
        approveBudget: false,
      },
      maintenanceOrders: {
        submitVisitReport: false,
        approveVisitReport: false,
        assignWithOverride: false,
      },
      audit: {
        read: false,
      },
    };
  }

  if (role === UserRole.TECHNICIAN) {
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
      catalog: {
        viewCosts: false,
        manageItems: false,
      },
      users: {
        manage: false,
        manageSecurity: false,
        manageCertifications: false,
        manageSpecialties: false,
        manageHierarchy: false,
        viewLiveLocation: true,
      },
      proposals: {
        requestDiscountAboveLimit: false,
        approveBudget: false,
      },
      maintenanceOrders: {
        submitVisitReport: true,
        approveVisitReport: false,
        assignWithOverride: false,
      },
      audit: {
        read: false,
      },
    };
  }

  if (role === UserRole.ENGINEER_APPLICATION) {
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
      catalog: {
        viewCosts: true,
        manageItems: false,
      },
      users: {
        manage: false,
        manageSecurity: false,
        manageCertifications: false,
        manageSpecialties: true,
        manageHierarchy: false,
        viewLiveLocation: true,
      },
      proposals: {
        requestDiscountAboveLimit: true,
        approveBudget: false,
      },
      maintenanceOrders: {
        submitVisitReport: true,
        approveVisitReport: false,
        assignWithOverride: true,
      },
      audit: {
        read: false,
      },
    };
  }

  if (role === UserRole.LOGISTICS) {
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
      catalog: {
        viewCosts: false,
        manageItems: true,
      },
      users: {
        manage: false,
        manageSecurity: false,
        manageCertifications: false,
        manageSpecialties: false,
        manageHierarchy: false,
        viewLiveLocation: true,
      },
      proposals: {
        requestDiscountAboveLimit: false,
        approveBudget: false,
      },
      maintenanceOrders: {
        submitVisitReport: false,
        approveVisitReport: false,
        assignWithOverride: true,
      },
      audit: {
        read: false,
      },
    };
  }

  if (role === UserRole.CLIENT) {
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
      catalog: {
        viewCosts: false,
        manageItems: false,
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
        requestDiscountAboveLimit: false,
        approveBudget: false,
      },
      maintenanceOrders: {
        submitVisitReport: false,
        approveVisitReport: false,
        assignWithOverride: false,
      },
      audit: {
        read: false,
      },
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
    catalog: {
      viewCosts: false,
      manageItems: false,
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
      requestDiscountAboveLimit: false,
      approveBudget: false,
    },
    maintenanceOrders: {
      submitVisitReport: true,
      approveVisitReport: false,
      assignWithOverride: false,
    },
    audit: {
      read: false,
    },
  };
}

export function effectiveAccessPolicy(
  role: UserRole,
  customPolicy: unknown,
): AccessPolicy {
  const defaults = defaultAccessPolicyByRole(role);
  if (!customPolicy || typeof customPolicy !== 'object') {
    return defaults;
  }

  const policy = customPolicy as any;
  return {
    pages: {
      dashboard: boolOrDefault(
        policy?.pages?.dashboard,
        defaults.pages.dashboard,
      ),
      proposals: boolOrDefault(
        policy?.pages?.proposals,
        defaults.pages.proposals,
      ),
      orders: boolOrDefault(policy?.pages?.orders, defaults.pages.orders),
      contracts: boolOrDefault(
        policy?.pages?.contracts,
        defaults.pages.contracts,
      ),
      catalog: boolOrDefault(policy?.pages?.catalog, defaults.pages.catalog),
      clients: boolOrDefault(policy?.pages?.clients, defaults.pages.clients),
      equipments: boolOrDefault(
        policy?.pages?.equipments,
        defaults.pages.equipments,
      ),
      usersControl: boolOrDefault(
        policy?.pages?.usersControl,
        defaults.pages.usersControl,
      ),
    },
    catalog: {
      viewCosts: boolOrDefault(
        policy?.catalog?.viewCosts,
        defaults.catalog.viewCosts,
      ),
      manageItems: boolOrDefault(
        policy?.catalog?.manageItems,
        defaults.catalog.manageItems,
      ),
    },
    users: {
      manage: boolOrDefault(policy?.users?.manage, defaults.users.manage),
      manageSecurity: boolOrDefault(
        policy?.users?.manageSecurity,
        defaults.users.manageSecurity,
      ),
      manageCertifications: boolOrDefault(
        policy?.users?.manageCertifications,
        defaults.users.manageCertifications,
      ),
      manageSpecialties: boolOrDefault(
        policy?.users?.manageSpecialties,
        defaults.users.manageSpecialties,
      ),
      manageHierarchy: boolOrDefault(
        policy?.users?.manageHierarchy,
        defaults.users.manageHierarchy,
      ),
      viewLiveLocation: boolOrDefault(
        policy?.users?.viewLiveLocation,
        defaults.users.viewLiveLocation,
      ),
    },
    proposals: {
      requestDiscountAboveLimit: boolOrDefault(
        policy?.proposals?.requestDiscountAboveLimit,
        defaults.proposals.requestDiscountAboveLimit,
      ),
      approveBudget: boolOrDefault(
        policy?.proposals?.approveBudget,
        defaults.proposals.approveBudget,
      ),
    },
    maintenanceOrders: {
      submitVisitReport: boolOrDefault(
        policy?.maintenanceOrders?.submitVisitReport,
        defaults.maintenanceOrders.submitVisitReport,
      ),
      approveVisitReport: boolOrDefault(
        policy?.maintenanceOrders?.approveVisitReport,
        defaults.maintenanceOrders.approveVisitReport,
      ),
      assignWithOverride: boolOrDefault(
        policy?.maintenanceOrders?.assignWithOverride,
        defaults.maintenanceOrders.assignWithOverride,
      ),
    },
    audit: {
      read: boolOrDefault(policy?.audit?.read, defaults.audit.read),
    },
  };
}

function boolOrDefault(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}
