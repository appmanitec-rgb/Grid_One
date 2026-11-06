const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const formatCurrency = (value: number | string) =>
  currency.format(Number(value));
/** Receives percentage points: 5 means 5%, not 500%. */
export const formatPercent = (value: number | string) =>
  percent.format(Number(value)) + "%";
export const formatQuantity = (value: number | string) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(
    Number(value),
  );

/** Calendar fields retain their ISO day, independently of the browser time zone. */
export function formatCalendarDate(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {},
) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!match) return "-";
  const [, year, month, day] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    ...(options.dateStyle
      ? {}
      : { day: "2-digit", month: "2-digit", year: "numeric" }),
    ...options,
    timeZone: "UTC",
  }).format(date);
}

export function formatDocument(value?: string | null) {
  if (!value) return "Não informado";
  const digits = value.replace(/\D/g, "");
  if (/^\d{14}$/.test(value))
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  if (/^\d{11}$/.test(value))
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return value;
}
