import { test as setup } from '@playwright/test';
import { login } from './helpers/auth';

const authFile = 'storageState.json';

setup('authenticate', async ({ page }) => {
  await login(page);
  await page.context().storageState({ path: authFile });
});
