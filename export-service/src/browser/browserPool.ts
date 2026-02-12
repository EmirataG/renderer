import { createPool, type Pool } from 'generic-pool';
import puppeteer, { type Browser } from 'puppeteer';
import { config } from '../shared/config.js';

/** Create a generic-pool of Puppeteer Browser instances. */
export function createBrowserPool(): Pool<Browser> {
  return createPool<Browser>(
    {
      async create(): Promise<Browser> {
        return puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--use-gl=angle',
            '--enable-features=VizDisplayCompositor',
            '--disable-extensions',
            '--no-first-run',
            '--mute-audio',
          ],
          defaultViewport: null,
        });
      },

      async destroy(browser: Browser): Promise<void> {
        await browser.close();
      },

      async validate(browser: Browser): Promise<boolean> {
        return browser.connected;
      },
    },
    {
      max: config.maxBrowsers,
      min: 0,
      acquireTimeoutMillis: config.browserAcquireTimeoutMs,
      idleTimeoutMillis: config.browserIdleTimeoutMs,
      testOnBorrow: true,
    },
  );
}

/** Module-level browser pool singleton. */
export const browserPool = createBrowserPool();

/** Drain and clear the pool, closing all browsers. */
export async function shutdownPool(): Promise<void> {
  await browserPool.drain();
  await browserPool.clear();
}
