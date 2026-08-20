import { Locator, Page } from '@playwright/test';
import { firstVisible } from './testprod-tickets';

/**
 * id ของ Add-on บนหน้า Add-on ของอีเว้นที่ใช้ regression (/order/{id}/add-on)
 * ยืนยันจากการเปิดดู DOM จริง
 */
export const ADDONS = {
  toteBag: { id: 'cd7d6118f13411f0915501117567899b', name: 'Tote Bag' },
  bag: { id: 'cd7d64c8f13411f0967801117567899b', name: 'Bag' },
} as const;

export async function addonQuantity(page: Page, addonId: string): Promise<Locator> {
  return firstVisible(page.locator(`#text-ticket-${addonId}-quantity`));
}

export async function increaseAddonQuantity(page: Page, addonId: string, times = 1): Promise<void> {
  const qtySpan = await addonQuantity(page, addonId);
  const plusButton = qtySpan.locator('xpath=following-sibling::button[1]');
  for (let i = 0; i < times; i++) {
    await plusButton.click();
  }
}

export async function decreaseAddonQuantity(page: Page, addonId: string, times = 1): Promise<void> {
  const qtySpan = await addonQuantity(page, addonId);
  const minusButton = qtySpan.locator('xpath=preceding-sibling::button[1]');
  for (let i = 0; i < times; i++) {
    await minusButton.click();
  }
}