import { ValidationPipe } from '@nestjs/common';
import { UpdateMyProfileDto } from './update-my-profile.dto';

describe('own profile input boundary', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const transform = (body: Record<string, unknown>) =>
    pipe.transform(body, {
      type: 'body',
      metatype: UpdateMyProfileDto,
    });
  it('accepts personal edits and clearing optional photo/department', async () => {
    await expect(
      transform({ name: 'Maria', profilePhotoUrl: null, department: null }),
    ).resolves.toBeInstanceOf(UpdateMyProfileDto);
  });
  it.each([
    'role',
    'accessPolicy',
    'portalPermissions',
    'linkedClientId',
    'isSystemMaster',
    'passwordHash',
    'hourCost',
  ])(
    'rejects protected field %s instead of passing it to Prisma',
    async (field) => {
      await expect(
        transform({ name: 'Maria', [field]: ['all'] }),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it.each(['name', 'email', 'password'])(
    'rejects null for %s',
    async (field) => {
      await expect(transform({ [field]: null })).rejects.toMatchObject({
        status: 400,
      });
    },
  );
  it.each([
    { password: 'nova-senha-segura' },
    {
      password: 'curta',
      currentPassword: 'senha-atual',
      confirmPassword: 'curta',
    },
    {
      password: 'á'.repeat(37),
      currentPassword: 'senha-atual',
      confirmPassword: 'á'.repeat(37),
    },
  ])('rejects an incomplete, weak or oversized password edit', async (body) => {
    await expect(transform(body)).rejects.toMatchObject({ status: 400 });
  });
});
