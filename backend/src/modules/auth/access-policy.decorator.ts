import { SetMetadata } from '@nestjs/common';

export const ACCESS_POLICY_METADATA_KEY = 'access_policy_requirements';

export const accessPolicyKeys = [
  'pages.dashboard',
  'pages.proposals',
  'pages.orders',
  'pages.contracts',
  'pages.catalog',
  'pages.clients',
  'pages.equipments',
  'pages.usersControl',
  'catalog.viewCosts',
  'catalog.manageItems',
  'users.manage',
  'users.manageSecurity',
  'users.manageCertifications',
  'users.manageSpecialties',
  'users.manageHierarchy',
  'users.viewLiveLocation',
  'proposals.requestDiscountAboveLimit',
  'proposals.approveBudget',
  'maintenanceOrders.submitVisitReport',
  'maintenanceOrders.approveVisitReport',
  'maintenanceOrders.assignWithOverride',
  'audit.read',
] as const;

export type AccessPolicyKey = (typeof accessPolicyKeys)[number];

export const RequireAccessPolicy = (...keys: AccessPolicyKey[]) =>
  SetMetadata(ACCESS_POLICY_METADATA_KEY, keys);
