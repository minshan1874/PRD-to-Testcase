const { chromium } = require('/Users/f/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://test-ai-studio.yangf999212.workers.dev', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '生成测试用例' }).waitFor();
  await page.screenshot({ path: 'test-results/generate-test-cases.png', fullPage: true });
  console.log('页面已可视化打开，截图已保存到 test-results/generate-test-cases.png');
  console.log('浏览器将保持打开 30 秒，便于观察页面。');
  await new Promise((resolve) => setTimeout(resolve, 30_000));
  await browser.close();
})();
