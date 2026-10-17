import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { chromium, webkit } from 'playwright';

const url = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const browserName = (process.env.PLAYWRIGHT_BROWSER ?? 'chromium').toLowerCase();
assert.ok(['chromium', 'webkit'].includes(browserName), 'PLAYWRIGHT_BROWSER must be chromium or webkit');
// Playwright honors PLAYWRIGHT_BROWSERS_PATH supplied by the caller, including a local artifact directory.
const browserType = browserName === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  ...(browserName === 'chromium' && process.env.PLAYWRIGHT_CHANNEL && !process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const action = name => page.locator(`[data-action="${name}"]`);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('shogi-survivor-save-v2')));
const cell = (x, y) => page.locator(`[data-action="cell"][data-x="${x}"][data-y="${y}"]`);
const screenshot = (name, fullPage = false) => page.screenshot({ path: `artifacts/${name}-${browserName}.png`, fullPage });
async function noOverflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'horizontal overflow'); }
async function reset() { await action('new').click(); await action('confirm-new').click(); }

// DOM counts alone cannot detect collapsed grid rows or invisible pieces. Measure the rendered board.
async function assertBoardGeometry(label, expectedPieces = 4) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.evaluate(() => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const visible = element => {
      for (let node = element; node instanceof Element; node = node.parentElement) {
        const css = getComputedStyle(node);
        if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) return false;
      }
      return true;
    };
    const board = document.querySelector('.board');
    if (!board) return null;
    return { board: rect(board), visible: visible(board),
      cells: [...board.querySelectorAll('.square')].map(cell => ({ x: Number(cell.dataset.x), y: Number(cell.dataset.y),
        rect: rect(cell), visible: visible(cell), pieces: [...cell.querySelectorAll('.piece-wrap')].map(piece => ({
          rect: rect(piece), token: rect(piece.querySelector('.piece')), character: rect(piece.querySelector('.piece-character')),
          visible: visible(piece),
        })) })),
    };
  });
  const prefix = `${browserName} ${label}`;
  assert.ok(geometry, `${prefix}: board exists`);
  const { board, cells } = geometry;
  const within = (inner, outer, tolerance = 2) => inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance
    && inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
  const uniqueCenters = values => values.sort((a, b) => a - b).reduce((groups, value) => {
    if (!groups.length || Math.abs(value - groups.at(-1)) > 2) groups.push(value);
    return groups;
  }, []);
  assert.ok(geometry.visible && board.width > 100 && board.height > 100, `${prefix}: board has a visible positive area: ${JSON.stringify(board)}`);
  assert.ok(Math.abs(board.width - board.height) <= 2, `${prefix}: board is square`);
  assert.equal(cells.length, 25, `${prefix}: 25 rendered cells`);
  assert.equal(uniqueCenters(cells.map(c => c.rect.y + c.rect.height / 2)).length, 5, `${prefix}: five distinct row centers`);
  assert.equal(uniqueCenters(cells.map(c => c.rect.x + c.rect.width / 2)).length, 5, `${prefix}: five distinct column centers`);
  for (let y = 0; y < 5; y++) {
    const row = cells.filter(c => c.y === y);
    assert.equal(row.length, 5, `${prefix}: row ${y} has five cells`);
    assert.equal(uniqueCenters(row.map(c => c.rect.x + c.rect.width / 2)).length, 5, `${prefix}: row ${y} has five columns`);
    assert.ok(Math.max(...row.map(c => c.rect.y)) - Math.min(...row.map(c => c.rect.y)) <= 2, `${prefix}: row ${y} is level`);
  }
  for (const cell of cells) {
    const r = cell.rect, cellLabel = `${prefix}: cell ${cell.x},${cell.y}`;
    assert.ok(cell.visible && r.width >= 20 && r.height >= 20, `${cellLabel} has usable area: ${JSON.stringify(r)}`);
    assert.ok(Math.abs(r.width - r.height) <= 2, `${cellLabel} is square: ${r.width}×${r.height}`);
    assert.ok(Math.abs(r.width - board.width / 5) <= 2 && Math.abs(r.height - board.height / 5) <= 2,
      `${cellLabel} occupies one fifth of each board dimension`);
    assert.ok(within(r, board), `${cellLabel} stays inside board`);
    assert.ok(Math.abs(r.x + r.width / 2 - (board.x + (cell.x + 0.5) * board.width / 5)) <= 2
      && Math.abs(r.y + r.height / 2 - (board.y + (cell.y + 0.5) * board.height / 5)) <= 2,
    `${cellLabel} occupies its declared grid coordinates`);
    for (const piece of cell.pieces) {
      for (const [name, box] of Object.entries({ wrapper: piece.rect, token: piece.token, character: piece.character })) {
        assert.ok(piece.visible && box.width > 5 && box.height > 5, `${cellLabel}: visible ${name} has positive size: ${JSON.stringify(box)}`);
        assert.ok(within(box, r), `${cellLabel}: ${name} stays inside its cell: ${JSON.stringify(box)}`);
      }
    }
  }
  assert.equal(cells.reduce((count, cell) => count + cell.pieces.length, 0), expectedPieces, `${prefix}: expected visible board pieces`);
}

async function assertHeaderGeometry(label, safe = { top: 0, left: 0, right: 0 }) {
  const header = await page.evaluate(() => {
    const brand = document.querySelector('.brand'), container = document.querySelector('.site-header');
    const rect = node => {
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    if (!brand || !container) return null;
    const walker = document.createTreeWalker(brand, NodeFilter.SHOW_TEXT);
    let node, title = null;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes('将棋サバイバー')) {
        const range = document.createRange(); range.selectNodeContents(node); title = rect(range); break;
      }
    }
    let visible = true;
    for (let node = brand; node instanceof Element; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) visible = false;
    }
    return { rect: rect(container), brand: rect(brand), title, viewport: innerWidth,
      icons: [...container.querySelectorAll('svg.icon')].map(rect), visible };
  });
  const prefix = `${browserName} ${label}: header`;
  assert.ok(header?.visible && header.title, `${prefix} and brand title are rendered`);
  for (const [name, box] of Object.entries({ brand: header.brand, title: header.title })) {
    assert.ok(box.width > 20 && box.height > 8, `${prefix} ${name} has a visible text area: ${JSON.stringify(box)}`);
    assert.ok(box.left >= -1 && box.right <= header.viewport + 1, `${prefix} ${name} stays inside viewport`);
    assert.ok(box.top >= header.rect.top - 2 && box.bottom <= header.rect.bottom + 2, `${prefix} ${name} stays inside header`);
  }
  assert.ok(header.icons.length >= 2, `${prefix} includes help and new-run SVG icons`);
  const protectedLeft = Math.max(header.rect.left, safe.left);
  const protectedRight = Math.min(header.rect.right, header.viewport - safe.right);
  for (const [name, box] of Object.entries({ brand: header.brand, title: header.title,
    ...Object.fromEntries(header.icons.map((box, i) => [`icon-${i}`, box])) })) {
    assert.ok(box.width > 5 && box.height > 5, `${prefix} ${name} has positive area`);
    assert.ok(box.top >= header.rect.top + safe.top - 1 && box.bottom <= header.rect.bottom + 1,
      `${prefix} ${name} stays below ${safe.top}px top safe area: ${JSON.stringify(box)}`);
    assert.ok(box.left >= protectedLeft - 1 && box.right <= protectedRight + 1,
      `${prefix} ${name} stays within left ${safe.left}px and right ${safe.right}px safe areas: ${JSON.stringify(box)}`);
  }
}

try {
  await mkdir('artifacts', { recursive: true });
  await page.goto(url);
  await page.waitForSelector('.square');
  assert.match(await page.title(), /将棋サバイバー/);
  assert.equal(await page.locator('.square').count(), 25);
  const initial = await state();
  assert.equal(initial.inventory.length, 2);
  assert.deepEqual(initial.inventory.map(p => p.type), ['king', 'pawn']);
  const viewports = [
    { width: 320, height: 844 }, { width: 390, height: 844 },
    { width: 393, height: 852 }, { width: 852, height: 393 }, { width: 393, height: 852 },
    { width: 844, height: 390 }, { width: 390, height: 844 },
    { width: 768, height: 1050 }, { width: 1050, height: 768 }, { width: 768, height: 1050 },
    { width: 1440, height: 1050 }, { width: 1050, height: 1440 }, { width: 1440, height: 1050 },
  ];
  for (const viewport of viewports) {
    const { width, height } = viewport;
    await page.setViewportSize(viewport);
    await page.evaluate(() => scrollTo(0, 0));
    await noOverflow();
    await assertBoardGeometry(`${width}×${height} after resize`);
    await assertHeaderGeometry(`${width}×${height} after resize`);
    if (width === 390 || width === 1440 || height === 390) await screenshot(`formal-prepare-${width}x${height}`, true);
  }
  // Headless WebKit reports env(safe-area-inset-*) as zero. Inject the same custom properties
  // used by CSS so notch protection is verified geometrically rather than assumed from DOM presence.
  const safeAreas = [
    { label: 'portrait-top', width: 393, height: 852, insets: { top: 47, left: 0, right: 0 } },
    { label: 'landscape-left', width: 852, height: 393, insets: { top: 0, left: 47, right: 0 } },
    { label: 'landscape-right', width: 852, height: 393, insets: { top: 0, left: 0, right: 47 } },
    { label: 'landscape-both', width: 852, height: 393, insets: { top: 0, left: 47, right: 47 } },
  ];
  for (const profile of safeAreas) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    try {
      await page.evaluate(insets => {
        for (const [side, value] of Object.entries(insets)) document.documentElement.style.setProperty(`--safe-${side}`, `${value}px`);
        scrollTo(0, 0);
      }, profile.insets);
      await noOverflow();
      await assertBoardGeometry(`${profile.label} simulated safe area`);
      await assertHeaderGeometry(`${profile.label} simulated safe area`, profile.insets);
      await screenshot(`formal-safe-area-${profile.label}`, true);
    } catch (error) {
      await screenshot(`formal-safe-area-failure-${profile.label}`, true).catch(() => {});
      throw error;
    } finally {
      await page.evaluate(() => {
        for (const side of ['top', 'left', 'right']) document.documentElement.style.removeProperty(`--safe-${side}`);
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await assertBoardGeometry('390×844 after portrait return');
  await assertHeaderGeometry('390×844 after safe-area reset');

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
    await assertBoardGeometry('production subpath');
    await assertHeaderGeometry('production subpath');
    await screenshot('formal-production-subpath');
    await action('start').click();
    await action('fast-forward').click();
    assert.equal((await state()).phase, 'reward');
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.deepEqual(errors, [], 'browser runtime/resource errors');
  console.log(JSON.stringify({ passed: true, browser: browserName, viewports, safeAreas, campaign, finalInventory: 7, productionSubpath: prefix,
    browserErrors: errors, artifacts: `artifacts/formal-*-${browserName}.png` }, null, 2));
} catch (error) {
  await screenshot('formal-failure', true).catch(() => {});
  throw error;
} finally { await browser.close(); }
