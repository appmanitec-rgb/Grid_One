export const normalizeCnpj = (value?: string | null) =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const hasCnpjFormat = (value?: string | null) =>
  /^[A-Z0-9]{12}[0-9]{2}$/.test(normalizeCnpj(value));

export function isValidCnpj(value?: string | null) {
  const cnpj = normalizeCnpj(value);
  if (!hasCnpjFormat(cnpj) || /^([0-9])\1{13}$/.test(cnpj)) return false;

  const values = [...cnpj.slice(0, 12)].map((char) => char.charCodeAt(0) - 48);
  const checkDigit = (weights: number[]) => {
    const remainder =
      values.reduce(
        (sum, current, index) => sum + current * weights[index],
        0,
      ) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = checkDigit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  values.push(first);
  const second = checkDigit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.slice(12) === `${first}${second}`;
}
