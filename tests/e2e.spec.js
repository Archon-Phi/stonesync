const { test, expect } = require('@playwright/test');

test.describe('StoneSync E2E UI Suite', () => {
  test('Verify Go Board, Canvas, & Sensei AI Evaluation Panel', async ({ page }) => {
    // 1. Navigate to local app
    await page.goto('http://127.0.0.1:8085/go');
    await expect(page).toHaveTitle(/StoneSync/);

    // 2. Verify Canvas Board is visible
    const boardCanvas = page.locator('#go-board');
    await expect(boardCanvas).toBeVisible();

    // 3. Verify Sensei AI Evaluation Card components
    const aiCard = page.locator('#ai-eval-card');
    await expect(aiCard).toBeVisible();

    const scoreLeadBadge = page.locator('#score-lead-badge');
    await expect(scoreLeadBadge).toBeVisible();

    const wrBlackText = page.locator('#wr-black-text');
    await expect(wrBlackText).toContainText('Black');

    const wrWhiteText = page.locator('#wr-white-text');
    await expect(wrWhiteText).toContainText('White');

    // 4. Verify top recommended move items populate
    const topMoveItems = page.locator('.top-move-item');
    await expect(topMoveItems.first()).toBeVisible({ timeout: 5000 });

    // 5. Toggle Sensei Hints button
    const btnSensei = page.locator('#btn-sensei-hints');
    await btnSensei.click();
    await expect(btnSensei).toHaveClass(/active/);

    // 6. Click on board canvas to place a stone
    const box = await boardCanvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
    }

    // 7. Verify telemetry updates after move
    const lastMove = page.locator('#last-move-text');
    await expect(lastMove).not.toHaveText('—');

    // 8. Capture screenshot for verification
    await page.screenshot({ path: 'artifacts/playwright_e2e_screenshot.png', fullPage: true });
  });
});
