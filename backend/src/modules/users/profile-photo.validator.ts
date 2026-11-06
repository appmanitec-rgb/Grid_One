import { isURL, ValidateBy } from 'class-validator';

const MAX_PHOTO_BYTES = 256000;

export function isProfilePhoto(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('data:')) {
    return (
      value.length <= 4096 &&
      isURL(value, { protocols: ['http', 'https'], require_protocol: true })
    );
  }
  if (value.length > 360000) return false;
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (
    !bytes.length ||
    bytes.length > MAX_PHOTO_BYTES ||
    bytes.toString('base64') !== match[2]
  )
    return false;
  return (
    (match[1] === 'png' &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (match[1] === 'jpeg' &&
      bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
    (match[1] === 'webp' &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP')
  );
}

export function IsProfilePhoto() {
  return ValidateBy({
    name: 'isProfilePhoto',
    validator: {
      validate: isProfilePhoto,
      defaultMessage: () =>
        'Escolha uma foto JPG, PNG ou WebP válida, ou informe um link HTTP/HTTPS.',
    },
  });
}
