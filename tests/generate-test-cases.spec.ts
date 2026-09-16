import { test } from '@playwright/test';
import { GenerateTestCasesPage } from './pages/GenerateTestCasesPage';

test.describe('生成测试用例', () => {
  test.setTimeout(180_000);

  test('输入 PRD 后应成功生成测试用例', async ({ page }) => {
    const generatePage = new GenerateTestCasesPage(page);

    await generatePage.goto();
    await generatePage.expectLoaded();
    await generatePage.uploadPrd('tests/fixtures/login-requirement.md');

    await generatePage.generate();
    await generatePage.expectGeneratedCases();
  });
});
