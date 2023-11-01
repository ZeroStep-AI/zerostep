import { type Page } from './types.js'
import * as cdp from './cdp.js'

export const clickElement = async (page: Page, args: { id: string }) => {
  const { centerX, centerY } = await cdp.getContentQuads(page, { backendNodeId: parseInt(args.id) })
  await clickLocation(page, { x: centerX, y: centerY })
}

export const sendKeysToElement = async (page: Page, args: { id: string, value: string }) => {
  await cdp.focusElement(page, { backendNodeId: parseInt(args.id) })
  await sendKeys(page, args)
}

export const hoverElement = async (page: Page, args: { id: string }) => {
  const { centerX, centerY } = await cdp.getContentQuads(page, { backendNodeId: parseInt(args.id) })
  await hoverLocation(page, { x: centerX, y: centerY })
}

export const clickLocation = async (page: Page, args: { x: number, y: number }) => {
  await hoverLocation(page, args)
  await page.mouse.click(args.x, args.y)
}

export const sendKeys = async (page: Page, args: { value: string }) => {
  await page.keyboard.type(args.value)
}

export const hoverLocation = async (page: Page, args: { x: number, y: number }) => {
  await page.mouse.move(args.x, args.y)
}

export const getViewportMetadata = async (page: Page) => {
  const metadata = await page.evaluate(() => {
    return {
      viewportWidth: window.visualViewport?.width || 0,
      viewportHeight: window.visualViewport?.height || 0,
      pixelRatio: window.devicePixelRatio,
    }
  })

  return metadata
}

export const getSnapshot = async (page: Page) => {
  const domSnapshotPromise = cdp.getDOMSnapshot(page).then((r) => JSON.stringify(r))
  const screenshotPromise = cdp.getScreenshot(page)
  const viewportPromise = getViewportMetadata(page)

  const [
    dom,
    screenshot,
    { viewportWidth, viewportHeight, pixelRatio },
  ] = await Promise.all([domSnapshotPromise, screenshotPromise, viewportPromise])

  return { dom, screenshot, viewportWidth, viewportHeight, pixelRatio }
}

export const keypressEnter = async (page: Page) => {
  await page.keyboard.press('Enter')
}

export const navigate = async (page: Page, args: { url: string }) => {
  await page.goto(args.url)
}

export const scrollPage = async (page: Page, args: { target: ScrollType }) => {
  await page.evaluate((evalArgs) => {
    // The viewport should be defined, but if it somehow isn't pick a reasonable default
    const viewportHeight = window.visualViewport?.height ?? 720
    // For relative scrolls, attempt to scroll by 75% of the viewport height
    const relativeScrollDistance = 0.75 * viewportHeight
    const elementToScroll = document.scrollingElement || document.body

    switch (evalArgs.target) {
      case 'top':
        return elementToScroll.scrollTo({ top: 0 })
      case 'bottom':
        return elementToScroll.scrollTo({ top: elementToScroll.scrollHeight })
      case 'up':
        return elementToScroll.scrollBy({ top: -relativeScrollDistance })
      case 'down':
        return elementToScroll.scrollBy({ top: relativeScrollDistance })
      default:
        throw Error(`Unsupported scroll target ${evalArgs.target}`)
    }
  }, args)
}

export type ScrollType =
  | 'up'
  | 'down'
  | 'bottom'
  | 'top'