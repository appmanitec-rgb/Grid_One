import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
export const decimal = (value: Prisma.Decimal.Value) =>
  new Prisma.Decimal(value);
export const money = (value: Prisma.Decimal.Value) =>
  decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export function freightShares(
  freight: Prisma.Decimal.Value,
  weights: Prisma.Decimal.Value[],
) {
  const total = weights.reduce<Prisma.Decimal>(
    (sum, value) => sum.plus(value),
    decimal(0),
  );
  if (!total.gt(0)) {
    if (decimal(freight).gt(0))
      throw new BadRequestException(
        'Informe uma base positiva para ratear o frete.',
      );
    return weights.map(() => money(0));
  }
  let remaining = money(freight);
  return weights.map((weight, index) => {
    const share =
      index === weights.length - 1
        ? remaining
        : money(freight)
            .mul(weight)
            .div(total)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    remaining = remaining.minus(share);
    return share;
  });
}
export function offerNet(
  quantity: Prisma.Decimal.Value,
  price: Prisma.Decimal.Value,
  discount: Prisma.Decimal.Value,
) {
  return money(
    decimal(quantity).mul(price).mul(decimal(100).minus(discount)).div(100),
  );
}
export function projectedShortage(
  target: number,
  physical: number,
  reserved: number,
  inbound: number,
) {
  return Math.max(0, target - (physical - reserved) - inbound);
}
