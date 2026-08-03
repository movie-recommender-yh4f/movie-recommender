import { check } from 'k6'
import { browser } from 'k6/browser'
import { getBaseUrl } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'

const PROFILE = 'browser-smoke'

export const options = {
  scenarios: {
    browser: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    browser_web_vital_lcp: ['p(95)<2500'],
    browser_web_vital_cls: ['p(95)<0.1'],
  },
}

export function setup() {
  return preflight(PROFILE)
}

export default async function () {
  const page = await browser.newPage()

  try {
    const response = await page.goto(getBaseUrl(), {
      waitUntil: 'networkidle',
    })

    check(response, {
      'browser navigation succeeded': (result) => result?.status() === 200,
    })
    check(await page.title(), {
      'page title contains NextWatch': (title) => title.includes('NextWatch'),
    })
  } finally {
    await page.close()
  }
}
