#!/usr/bin/env node
// playwright-extractor.js
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const MAPPING_FILE = './mapping.json';   // static path

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

export async function runSiteExtraction(url) {
  const allMappings = JSON.parse(await fs.readFile(MAPPING_FILE, 'utf8'));
  const mapping = allMappings[url];
  if (!mapping) {
    throw new Error(`No mapping found for URL: ${url}`);
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Decide how to reach the page
  if (mapping.scenario) {
    console.log(`Running scenario: ${mapping.scenario}`);
    const scenarioPath = path.resolve(mapping.scenario);
    const scenarioFn = (await import(scenarioPath)).default;
    await scenarioFn(page);
  } else {
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle" });
  }

  await disableAnimations(page);

  const timestamp = new Date().toISOString();
  const artifacts = { url, timestamp, mappingSource: MAPPING_FILE, components: [] };

  if (mapping.fullPageScreenshot) {
    try {
      const buffer = await page.screenshot({ fullPage: true, type: 'png' });
      artifacts.fullPageScreenshotBase64 = `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
    } catch (e) {
      console.warn('Full page screenshot failed:', e.message);
    }
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

    // Take screenshot as buffer and convert to base64
    let screenshotBase64 = null;
    try {
      const buffer = await extracted.el.screenshot({ type: 'png' });
      screenshotBase64 = `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
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
      screenshotBase64
    });
  }

  // const outFile = path.join(OUT_DIR, `extraction_${Date.now()}.json`);
  // await fs.writeFile(outFile, JSON.stringify(artifacts, null, 2), 'utf8');
  await browser.close();
  return artifacts;
}
