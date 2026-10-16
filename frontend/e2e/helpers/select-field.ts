import { expect, type Locator } from "@playwright/test";

/** Exercise either a native small list or the searchable field through its UI. */
export async function selectFieldOption(field: Locator, value: string) {
  if (await field.evaluate((element) => element.tagName === "SELECT")) {
    await field.selectOption(value);
    return;
  }
  const label = await field.evaluate((element, wanted) => {
    const select = element.nextElementSibling as HTMLSelectElement;
    return Array.from(select.options).find((option) => option.value === wanted)
      ?.label;
  }, value);
  expect(label).toBeDefined();
  await field.fill(label!);
  await field.press("Enter");
  await expect(field).toHaveValue(label!);
}
