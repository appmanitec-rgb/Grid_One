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
});
