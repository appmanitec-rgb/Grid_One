import { createHash } from 'crypto';

export function clientCredentialVersion(passwordHash: string) {
  return createHash('sha256').update(passwordHash).digest('hex');
}
