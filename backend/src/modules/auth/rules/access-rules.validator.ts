import { registerDecorator, ValidationOptions } from 'class-validator';
import { ACCESS_SCREENS } from './access-screens';
import { ORDER_TYPES, PORTFOLIOS } from './access-rules';
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function flags(value: unknown, keys?: readonly string[]) {
  return (
    record(value) &&
    Object.entries(value).every(
      ([key, v]) => (!keys || keys.includes(key)) && typeof v === 'boolean',
    )
  );
}
export function IsAccessRules(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isAccessRules',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (!record(value) || value.version !== 1 || !record(value.screens))
            return false;
          if (
            Object.keys(value).some(
              (k) =>
                ![
                  'version',
                  'screens',
                  'commercial',
                  'orderTypes',
                  'onCallShifts',
                ].includes(k),
            )
          )
            return false;
          for (const [key, screen] of Object.entries(value.screens)) {
            if (
              !ACCESS_SCREENS.some((s) => s.key === key) ||
              !record(screen) ||
              typeof screen.view !== 'boolean' ||
              !flags(screen.actions)
            )
              return false;
          }
          if (
            !flags(value.commercial, PORTFOLIOS) ||
            !flags(value.orderTypes, ORDER_TYPES)
          )
            return false;
          return (
            Array.isArray(value.onCallShifts) &&
            value.onCallShifts.length <= 100 &&
            value.onCallShifts.every((s) => {
              if (
                !record(s) ||
                typeof s.startsAt !== 'string' ||
                typeof s.endsAt !== 'string'
              )
                return false;
              return (
                /Z$|[+-]\d{2}:\d{2}$/.test(s.startsAt) &&
                /Z$|[+-]\d{2}:\d{2}$/.test(s.endsAt) &&
                Number.isFinite(Date.parse(s.startsAt)) &&
                Date.parse(s.startsAt) < Date.parse(s.endsAt)
              );
            })
          );
        },
        defaultMessage() {
          return 'Informe regras válidas e plantões com início e fim, incluindo o fuso horário.';
        },
      },
    });
}
