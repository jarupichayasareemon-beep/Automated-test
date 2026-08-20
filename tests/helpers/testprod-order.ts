import { Page, Locator } from '@playwright/test';

/**
 * กรอกส่วน Shipping Method บนหน้า checkout ด้วยที่อยู่ปลอมแต่ถูกต้องตามรูปแบบ
 * จำเป็นต้องกรอกก่อนถึงจะจ่ายเงินได้บนอีเว้นนี้ (ต่างจากอีเว้น regression ตัวเก่า
 * ที่แค่เลือก radio ก็พอ)
 *
 * Province/District/Sub District/Postal Code เป็น autocomplete แบบไล่ตามลำดับ
 * (cascading) ยืนยันจากการทดสอบจริง: แต่ละช่องจะมี option ให้เลือกก็ต่อเมื่อ
 * ช่องก่อนหน้าถูกเลือกแล้ว (Province -> District -> Sub District -> Postal
 * Code) และพอถึงระดับ Sub District/Postal Code จะเหลือ option ให้เลือกแค่ตัว
 * เดียว ดังนั้น "คลิกช่อง แล้วคลิก option แรก" ใช้ได้กับทั้ง 4 ช่อง โดยไม่ต้อง
 * รู้ชื่อเขต/ตำบล/รหัสไปรษณีย์จริงล่วงหน้าเลย
 */
export async function fillShippingAddress(page: Page): Promise<void> {
  await page.locator('#input-shipping-name-input').fill('Test Buyer');
  await page.locator('#input-shipping-phone-input').fill('812345678');
  await page.locator('#input-shipping-address').fill('123 Test Street');

  for (const fieldId of ['#autocomplete-province', '#autocomplete-district', '#autocomplete-sub_district', '#autocomplete-zipcode']) {
    const field = page.locator(fieldId);
    await field.click();
    if (fieldId === '#autocomplete-province') {
      await field.fill('Bangkok');
    }
    await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 5_000 });
    await page.getByRole('option').first().click();
  }
}

export function paymentChannelBox(page: Page, name: string): Locator {
  return page
    .locator(`[id="payment-channel-${name}"]`)
    .locator('xpath=ancestor::div[contains(@class,"MuiBox-root")][1]');
}

/**
 * กล่องเลือกแบบ MUI พวกนี้ (Payment Channel, Refund Protection) ตอนเลือกแล้วจะ
 * เปลี่ยนสีขอบ (border) ไม่ใช่เปลี่ยน class name ที่ตายตัว — ยืนยันจากการทดสอบจริง:
 * ตอนไม่ได้เลือกจะเป็น rgb(235, 235, 235) เสมอ ส่วนตอนเลือกแล้วแต่ละส่วนจะใช้
 * สีต่างกัน (ฟ้าอ่อนสำหรับ Payment Channel, เขียวสำหรับ Refund Protection)
 * เช็คแค่ "ไม่ใช่สีเทาตอนไม่เลือก" จะได้ไม่ต้อง hardcode ว่าส่วนไหนใช้สีอะไรตอนเลือก
 */
export async function isHighlighted(locator: Locator): Promise<boolean> {
  const border = await locator.evaluate((el) => getComputedStyle(el).borderColor);
  return border !== 'rgb(235, 235, 235)';
}
