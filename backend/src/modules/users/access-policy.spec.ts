import { UserRole } from '@prisma/client';
import { defaultAccessPolicyByRole } from './access-policy';

describe('defaultAccessPolicyByRole', () => {
  it('keeps technician on own queues without global ticket or finance access', () => {
    const access = defaultAccessPolicyByRole(UserRole.TECHNICIAN);

    expect(access.pages.technicianPortal).toBe(true);
    expect(access.technicianWork.view).toBe(true);
    expect(access.technicianWork.checkInOut).toBe(true);
    expect(access.tickets.viewOwn).toBe(true);
    expect(access.tickets.commentOwn).toBe(true);
    expect(access.tickets.view).toBe(false);
    expect(access.finance.view).toBe(false);
  });

  it('allows manager to operate technician work and global tickets', () => {
    const access = defaultAccessPolicyByRole(UserRole.MANAGER);

    expect(access.pages.technicianPortal).toBe(true);
    expect(access.technicianWork.checkInOut).toBe(true);
    expect(access.tickets.view).toBe(true);
    expect(access.tickets.viewOwn).toBe(true);
  });

  it('keeps client restricted away from internal ERP modules', () => {
    const access = defaultAccessPolicyByRole(UserRole.CLIENT);

    expect(access.pages.dashboard).toBe(true);
    expect(access.pages.proposals).toBe(true);
    expect(access.proposals.view).toBe(true);
    expect(access.proposals.approve).toBe(true);
    expect(access.pages.finance).toBe(false);
    expect(access.pages.people).toBe(false);
    expect(access.pages.inventory).toBe(false);
    expect(access.pages.technicianPortal).toBe(false);
    expect(access.serviceReports.view).toBe(false);
  });

  it('allows operation profile to handle tickets, dispatch and service reports without finance access', () => {
    const access = defaultAccessPolicyByRole(UserRole.LOGISTICS);

    expect(access.pages.orders).toBe(true);
    expect(access.pages.tickets).toBe(true);
    expect(access.pages.serviceReports).toBe(true);
    expect(access.orders.dispatch).toBe(true);
    expect(access.tickets.convertToOrder).toBe(true);
    expect(access.serviceReports.approve).toBe(true);
    expect(access.finance.view).toBe(false);
  });
});
