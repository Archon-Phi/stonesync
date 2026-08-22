const { test, expect } = require('@playwright/test');

test.describe('StoneSync AI Analytics & Real-Time Suite', () => {

  test('Page metadata, Canvas board, and AI Evaluation Card initialization', async ({ page }) => {
    // 1. Navigate relative to baseURL
    await page.goto('/go');
    await expect(page).toHaveTitle(/StoneSync/);

    // 2. Verify Canvas element exists and is rendered
    const boardCanvas = page.locator('#go-board');
    await expect(boardCanvas).toBeVisible();

    // 3. Verify Sensei Positional Evaluation Card
    const aiCard = page.locator('#ai-eval-card');
    await expect(aiCard).toBeVisible();

    // 4. Verify Win-Rate split indicators & Score lead badge
    const scoreBadge = page.locator('#score-lead-badge');
    await expect(scoreBadge).toBeVisible();
    await expect(scoreBadge).toContainText(/B\s*\+|\s*W\s*\+|Even/);

    const wrBlackText = page.locator('#wr-black-text');
    await expect(wrBlackText).toContainText('Black');

    const wrWhiteText = page.locator('#wr-white-text');
    await expect(wrWhiteText).toContainText('White');
  });

  test('Sensei Tactical Move Recommendations & Canvas Overlay Toggle', async ({ page }) => {
    await page.goto('/go');

    // 1. Wait for top recommendation items to populate
    const topMoveItem = page.locator('.top-move-item').first();
    await expect(topMoveItem).toBeVisible();

    // 2. Toggle Sensei Hints overlay on canvas via button click
    const btnHints = page.locator('#btn-sensei-hints');
    await expect(btnHints).toBeVisible();
    await btnHints.click();

    // 3. Capture screenshot artifact of Sensei hints overlay
    await page.screenshot({ path: 'artifacts/playwright_sensei_overlay.png', fullPage: true });
  });

  test('SGF Export API Endpoint functionality', async ({ request }) => {
    // API testing using Playwright request fixture
    const response = await request.get('/api/room/main-match/sgf');
    expect(response.ok()).toBeTruthy();

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/x-go-sgf');

    const body = await response.text();
    expect(body).toContain('(;');
    expect(body).toContain('GM[1]'); // SGF Game Mode Go
  });

  test('Local Ollama Agent API Endpoint functionality', async ({ request }) => {
    // Test Ollama health endpoint
    const healthResp = await request.get('/api/ollama/health');
    expect(healthResp.ok()).toBeTruthy();

    const healthData = await healthResp.json();
    expect(healthData.status).toBe('online');
    expect(healthData.config.host).toBe('0.0.0.0');

    // Test Ollama predict move endpoint
    const predictResp = await request.post('/api/ollama/predict', {
      data: {
        session_id: 'e2e-playwright-session',
        board_size: 19,
        current_player: 'W',
        last_move: { r: 15, c: 4, player: 'B', notation: 'E4' },
        captures: { B: 0, W: 0 }
      }
    });
    expect(predictResp.ok()).toBeTruthy();

    const predictData = await predictResp.json();
    expect(predictData.status).toBe('success');
    expect(predictData.session_id).toBe('e2e-playwright-session');
    expect(predictData.prediction).toBeDefined();
    expect(predictData.prediction.suggested_move).toBeDefined();
  });

});

