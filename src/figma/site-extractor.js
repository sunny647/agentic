#!/usr/bin/env node
// playwright-extractor.js
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { mkdirp } from 'mkdirp';
import minimist from 'minimist';

const MAPPING_FILE = './mapping.json';   // static path
const OUT_DIR = './artifacts';           // static output folder

function rgbToHex(rgb) {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return rgb;
  const toHex = n => ('0' + Number(n).toString(16)).slice(-2);
  return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
}

async function disableAnimations(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after { transition: none !important; animation: none !important; }
      ::-webkit-scrollbar { display: none; }
    `
  });
}

// Resolve selector based on hints
async function resolveSelector(page, hints = []) {
  for (const h of hints) {
    try {
      if (h.startsWith('css:')) {
        const sel = h.slice(4);
        if (await page.$(sel)) return sel;
      } else if (h.startsWith('text=')) {
        const text = h.slice(5);
        const loc = page.locator(`text="${text}"`);
        if (await loc.count() > 0) return `text="${text}"`;
      } else if (h.includes('=')) {
        // treat as attribute e.g. data-testid=foo
        const [attr, val] = h.split('=');
        const sel = `[${attr}="${val}"]`;
        if (await page.$(sel)) return sel;
      } else {
        // direct CSS selector
        if (await page.$(h)) return h;
      }
    } catch {
      // ignore and try next
    }
  }
  return null;
}

async function extractElement(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;

  const data = await el.evaluate(e => {
    const cs = window.getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return {
      bounding: { x: r.x, y: r.y, width: r.width, height: r.height },
      computed: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow
      },
      text: (e.innerText || '').slice(0, 200)
    };
  });

  return { el, data };
}

async function run(url) {
  const mapping = JSON.parse(await fs.readFile(MAPPING_FILE, 'utf8'));
  await mkdirp(OUT_DIR);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(url + (mapping.pagePath || ''), { waitUntil: 'networkidle' });
  await disableAnimations(page);

  const timestamp = new Date().toISOString();
  const artifacts = { url, timestamp, mappingSource: MAPPING_FILE, components: [] };

  if (mapping.fullPageScreenshot) {
    const fullPath = path.join(OUT_DIR, `fullpage_${Date.now()}.png`);
    await page.screenshot({ path: fullPath, fullPage: true });
    artifacts.fullPageScreenshot = fullPath;
  }

  for (const comp of mapping.components || []) {
    const sel = await resolveSelector(page, comp.selectorHints || []);
    if (!sel) {
      artifacts.components.push({ name: comp.name, found: false, reason: 'no-selector-found', triedHints: comp.selectorHints });
      continue;
    }

    const extracted = await extractElement(page, sel);
    if (!extracted) {
      artifacts.components.push({ name: comp.name, selector: sel, found: false, reason: 'query-failed' });
      continue;
    }

    const safeName = comp.name.replace(/[^a-z0-9\-_.]/gi, '_');
    const screenshotPath = path.join(OUT_DIR, `${safeName}_${Date.now()}.png`);
    try {
      await extracted.el.screenshot({ path: screenshotPath });
    } catch (e) {
      console.warn('Element screenshot failed for', comp.name, e.message);
    }

    // normalize colors
    const normalized = { ...extracted.data };
    try {
      normalized.computed.color = rgbToHex(normalized.computed.color || '');
      normalized.computed.backgroundColor = rgbToHex(normalized.computed.backgroundColor || '');
    } catch { }

    artifacts.components.push({
      name: comp.name,
      selector: sel,
      found: true,
      data: normalized,
      screenshot: screenshotPath
    });
  }

  const outFile = path.join(OUT_DIR, `extraction_${Date.now()}.json`);
  await fs.writeFile(outFile, JSON.stringify(artifacts, null, 2), 'utf8');
  await browser.close();
  return outFile;
}

// CLI entry
const argv = minimist(process.argv.slice(2));
const url = argv.url || argv.u;

if (!url) {
  console.error('Usage: node playwright-extractor.js --url=https://your-site/page');
  process.exit(1);
}

run(url)
  .then(outFile => {
    console.log('Extraction complete:', outFile);
  })
  .catch(err => {
    console.error('Extractor failed:', err);
    process.exit(2);
  });
