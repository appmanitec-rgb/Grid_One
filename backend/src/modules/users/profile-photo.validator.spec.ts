import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './dto/update-user.dto';
import { isProfilePhoto } from './profile-photo.validator';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';

describe('profile photo validation', () => {
  it('accepts a bounded uploaded image and an existing web URL', () => {
    expect(isProfilePhoto(png)).toBe(true);
    expect(isProfilePhoto('https://example.com/avatar.jpg')).toBe(true);
  });

  it('rejects malformed, mismatched and executable images', () => {
    for (const photo of [
      'data:image/png;base64,AAAA',
      png.replace('image/png', 'image/jpeg'),
      'data:image/svg+xml;base64,PHN2Zz4=',
      'javascript:alert(1)',
      'file:///avatar.png',
    ]) {
      expect(isProfilePhoto(photo)).toBe(false);
    }
  });

  it('rejects an oversized image even if its signature is valid', () => {
    const bytes = Buffer.alloc(256001);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    expect(
      isProfilePhoto('data:image/png;base64,' + bytes.toString('base64')),
    ).toBe(false);
  });

  it('validates the actual update DTO and allows removing the photo', async () => {
    for (const photo of [png, null]) {
      const errors = await validate(
        plainToInstance(UpdateUserDto, { profilePhotoUrl: photo }),
      );
      expect(errors).toHaveLength(0);
    }
    const errors = await validate(
      plainToInstance(UpdateUserDto, {
        profilePhotoUrl: 'data:image/png;base64,AAAA',
      }),
    );
    expect(errors.map((error) => error.property)).toContain('profilePhotoUrl');
  });
});
