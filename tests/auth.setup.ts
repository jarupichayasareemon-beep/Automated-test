import fs from 'fs';
import { test as setup } from '@playwright/test';
import { login } from './helpers/auth';

const authFile = 'storageState.json';

// ถ้ามี storageState.json อยู่แล้ว (เช่นเซฟไว้ด้วย `npm run save-dev-session`)
// ข้าม login ไปเลย ไม่ต้องเปิด browser ขึ้นมาใหม่ทุกครั้งที่รันเทสต์ — เช็ค
// fs.existsSync() ตอน register เทสต์ (ก่อนเทสต์เริ่มรัน) เพื่อไม่ให้ประกาศ
// fixture `page` เลยในเคสนี้ ถ้าประกาศไว้ใน signature ตัว browser จะถูกเปิด
// ขึ้นมาก่อนเข้า body เทสต์เสมอไม่ว่าจะเรียกใช้ page จริงหรือไม่
//
// ถ้า session หมดอายุ/ใช้ไม่ได้แล้ว ให้รัน `npm run save-dev-session` ใหม่
// เพื่อ login ผ่านหน้าต่าง Chrome จริงแล้วเซฟ storageState.json ทับของเดิม
if (fs.existsSync(authFile)) {
  setup('authenticate (ข้าม — ใช้ storageState.json เดิม)', async () => {
    console.log(`พบ ${authFile} อยู่แล้ว ข้าม login (รัน "npm run save-dev-session" ถ้า session หมดอายุ)`);
  });
} else {
  setup('authenticate', async ({ page }) => {
    await login(page);
    await page.context().storageState({ path: authFile });
  });
}
