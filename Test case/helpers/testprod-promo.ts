import { Page } from '@playwright/test';

/**
 * กรอกโปรโมโค้ดผ่านช่อง "Promo Code" บนหน้า event — ยืนยันจากการทดสอบจริงแล้วว่า
 * เป็นคนละกลไกกับ popup "Have a coupon?" ตอน checkout (#input-coupon-code /
 * /v1/users/coupon/redeem) ซึ่งบางโค้ดในอีเว้นนี้ใช้ผ่านทางนั้นไม่ได้เลย
 * นี่คือช่องที่ใช้กับ TC_008/010/011/ฯลฯ ใน CSV
 */
export async function applyPromoCode(page: Page, code: string): Promise<void> {
  const input = page.locator('#input-input-promo-code').first();
  await input.click();
  await input.fill('');
  await input.pressSequentially(code);
  await page.locator('#btn-btn-apply-promocode').first().click();
  await page.waitForTimeout(1_500);
}

export async function clearPromoCode(page: Page): Promise<void> {
  const clearButton = page.getByRole('button', { name: 'Clear' }).first();
  if (await clearButton.isVisible().catch(() => false)) {
    await clearButton.click();
    await page.waitForTimeout(500);
  }
}