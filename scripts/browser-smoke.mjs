import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const action = name => page.locator(`[data-action="${name}"]`);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('shogi-survivor-save-v2')));
const cell = (x, y) => page.locator(`[data-action="cell"][data-x="${x}"][data-y="${y}"]`);
const screenshot = (name, fullPage = false) => page.screenshot({ path: `artifacts/${name}.png`, fullPage });
async function noOverflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'horizontal overflow'); }
async function reset() { await action('new').click(); await action('confirm-new').click(); }

try {
  await mkdir('artifacts', { recursive: true });
  await page.goto(url);
  await page.waitForSelector('.square');
  assert.match(await page.title(), /将棋サバイバー/);
  assert.equal(await page.locator('.square').count(), 25);
  const initial = await state();
  assert.equal(initial.inventory.length, 2);
  assert.deepEqual(initial.inventory.map(p => p.type), ['king', 'pawn']);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width > 650 ? 1050 : 844 });
    await noOverflow();
    if (width === 390 || width === 1440) await screenshot(`formal-prepare-${width}`, true);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // Real deployment controls, a bench and a position swap; the king must stay deployed.
  await page.locator('[data-action="select"][data-id="ally-2"]').click();
  await cell(4, 4).click();
  assert.deepEqual((await state()).inventory[1].position, { x: 4, y: 4 });
  await action('bench').click();
  assert.equal((await state()).inventory[1].position, null);
  await cell(4, 3).click();
  assert.deepEqual((await state()).inventory[1].position, { x: 4, y: 3 });
  await page.locator('[data-action="select"][data-id="ally-1"]').click();
  assert.equal(await action('bench').count(), 0, 'king cannot be benched');
  await cell(4, 3).click();
  assert.deepEqual((await state()).inventory[0].position, { x: 4, y: 3 });
  assert.notDeepEqual((await state()).inventory[1].position, { x: 4, y: 3 });
  await action('arrange').click();
  await reset();
  assert.equal(await action('threats').getAttribute('aria-pressed'), 'true', 'danger shown by default');
  await action('threats').click();
  assert.equal(await action('threats').getAttribute('aria-pressed'), 'false');
  await action('help').click();
  assert.equal(await page.locator('[role="dialog"]').count(), 1);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[role="dialog"]').count(), 0);

  await action('start').click();
  await action('pause').click();
  const before = (await state()).battle.halfTurn;
  await action('step').click();
  assert.equal((await state()).battle.halfTurn, before + 1, 'one step is one half-turn');
  assert.ok((await state()).battle.lastDecision.reason.length);
  await action('speed').filter({ hasText: '4×' }).click();
  const savedBattle = (await state()).battle;
  await page.reload();
  assert.deepEqual((await state()).battle, savedBattle, 'restore exact state and action log');
  assert.match(await action('pause').innerText(), /戦闘を再開/);
  await action('fast-forward').click();
  assert.equal((await state()).phase, 'reward', 'initial two pieces can win');
  await screenshot('formal-reward-mobile');
  const rewardInventory = (await state()).inventory.length;
  await action('reward').first().click();
  assert.equal((await state()).inventory.length, rewardInventory + 1);
  assert.equal((await state()).phase, 'prepare');
  assert.equal((await state()).stageIndex, 1);
  await page.reload();
  assert.equal((await state()).stageIndex, 1);
  await reset();

  // Full campaign, using only visible controls and genuine AI outcomes.
  // The fixture is a chosen strategy, not a fabricated save or a forced win.
  const campaign = [];
  const choices = ['rook', 'rook', 'rook', 'rook', 'rook'];
  for (let encounter = 0; encounter < 5; encounter++) {
    assert.equal((await state()).phase, 'prepare');
    await action('arrange').click();
    await action('start').click();
    await action('fast-forward').click();
    const result = await state();
    campaign.push({ stage: encounter + 1, winner: result.battle.winner, halfTurns: result.battle.halfTurn, endReason: result.battle.endReason });
    assert.equal(result.phase, 'reward', `campaign failed: ${JSON.stringify(campaign)}`);
    assert.equal(result.inventory.length, encounter + 2, 'no growth until a piece is chosen');
    assert.equal(result.rewardChoices.length, 3);
    assert.equal(result.unlockedRelics.includes('othello'), encounter >= 1);
    if (encounter === 1) assert.match(await page.locator('.relic-unlock').innerText(), /オセロの法則/);
    if (encounter >= 2) assert.ok(result.rewardChoices.every(r => r.abilities.length > 0));
    await page.locator(`[data-action="reward"][data-id="reward-${encounter + 1}-${choices[encounter]}"]`).click();
    assert.equal((await state()).inventory.length, encounter + 3);
    if (encounter < 4) assert.equal((await state()).phase, 'prepare');
  }
  assert.equal((await state()).phase, 'victory');
  assert.equal((await state()).victories, 5);
  assert.equal((await state()).inventory.length, 7, 'final victory also awards a piece');
  assert.ok((await state()).inventory.filter(p => p.position).length <= 6);
  await noOverflow();
  await screenshot('formal-victory-mobile');
  await action('retry').click();
  assert.equal((await state()).victories, 0);
  assert.equal((await state()).inventory.length, 2);

  // Expose a lone king; a genuine loss must lead to a playable retry.
  await page.locator('[data-action="select"][data-id="ally-2"]').click();
  await action('bench').click();
  await page.locator('[data-action="select"][data-id="ally-1"]').click();
  await cell(0, 3).click();
  await action('start').click();
  await action('fast-forward').click();
  assert.equal((await state()).phase, 'defeat');
  await screenshot('formal-defeat-mobile');
  await action('retry').click();
  assert.equal((await state()).phase, 'prepare');

  const dist = resolve('dist'), prefix = '/shogi-survivor/';
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!path.startsWith(prefix)) { response.writeHead(404).end(); return; }
      const file = resolve(dist, path.slice(prefix.length) || 'index.html');
      if (!file.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
    await page.waitForSelector('.square');
    assert.match(await page.title(), /将棋サバイバー/);
    assert.equal(await page.locator('.square').count(), 25);
    assert.equal(await page.locator('.board').evaluate(e => getComputedStyle(e).display), 'grid');
    await noOverflow();
    await screenshot('formal-production-subpath');
    await action('start').click();
    await action('fast-forward').click();
    assert.equal((await state()).phase, 'reward');
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.deepEqual(errors, [], 'browser runtime/resource errors');
  console.log(JSON.stringify({ passed: true, viewports: [320, 390, 768, 1440], campaign, finalInventory: 7, productionSubpath: prefix, browserErrors: errors, artifacts: 'artifacts/formal-*.png' }, null, 2));
} finally { await browser.close(); }
