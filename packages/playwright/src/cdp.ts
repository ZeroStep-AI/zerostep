import { type Page, type Protocol} from './types.js'
import { WEBDRIVER_ELEMENT_KEY } from './config.js'

let cdpSessionByPage = new Map<Page, CDPSession>()

/**
 * Closes the cdp session and clears the global shared reference. This
 * happens automatically when a page closes in a playwright test, so
 * should generally not be necessary.
 */
export const detachCPDSession = async (page: Page) => {
  if (cdpSessionByPage.has(page)) {
    await cdpSessionByPage.get(page)!.detach()
    cdpSessionByPage.delete(page)
  }
}

/**
 * Returns a stable reference to a CDP session.
 */
export const getCDPSession = async (page: Page): Promise<CDPSession> => {
  if (!cdpSessionByPage.has(page)) {
    const session = await page.context().newCDPSession(page)
    cdpSessionByPage.set(page, session)
  }

  return cdpSessionByPage.get(page)!
}

export const getScreenshot = async (page: Page) => {
  const cdpSession = await getCDPSession(page)
  const screenshot = await cdpSession.send('Page.captureScreenshot')
  return screenshot.data // Base64-encoded image data
}

export const scrollIntoView = async (page: Page, args: { id: string }) => {
  const cdpSession = await getCDPSession(page)

  await cdpSession.send('DOM.scrollIntoViewIfNeeded', {
    backendNodeId: parseInt(args.id)
  })
}

export const getTitle = async (page: Page) => {
  const cdpSession = await getCDPSession(page)
  const returnedValue = await cdpSession.send('Runtime.evaluate', {
    expression: 'document.title',
    returnByValue: true,
  })

  return returnedValue.result.value
}

export const get = async (page: Page, args: { url: string }) => {
  const cdpSession = await getCDPSession(page)
  await cdpSession.send('Page.navigate', {
    url: args.url
  })
}

export const resolveNode = async (page: Page, args: Protocol.DOM.resolveNodeParameters) => {
  const cdpSession = await getCDPSession(page)
  const resolvedNodeAsObject = await cdpSession.send('DOM.resolveNode', args)
  return resolvedNodeAsObject.object
}

export const runFunctionOn = async (page: Page, args: { functionDeclaration: string, objectId: string }) => {
  const cdpSession = await getCDPSession(page)
  await cdpSession.send('Runtime.callFunctionOn', {
    functionDeclaration: args.functionDeclaration,
    objectId: args.objectId,
  })
}

export const getDOMSnapshot = async (page: Page) => {
  const cdpSession = await getCDPSession(page)
  const returnValue = await cdpSession.send('DOMSnapshot.captureSnapshot', { computedStyles: [] })
  return returnValue
}

export const clearElement = async (page: Page, args: { id: string }) => {
  const cdpSession = await getCDPSession(page)
  const { nodeId } = await cdpSession.send('DOM.requestNode', { objectId: args.id })
  await cdpSession.send('DOM.setAttributeValue', {
    nodeId: nodeId,
    name: 'value',
    value: '',
  })
}

export const sendKeysToElement = async (page: Page, args: { id: string, value: string[] }) => {
  const cdpSession = await getCDPSession(page)
  const value = args.value[0]

  const { nodeId } = await cdpSession.send('DOM.requestNode', { objectId: args.id })
  await cdpSession.send('DOM.focus', { nodeId: nodeId })

  for (let i = 0; i < value.length; i++) {
    await cdpSession.send('Input.dispatchKeyEvent', {
      type: 'char',
      text: value[i],
    })
  }

  return true
}

export const getElementAttribute = async (page: Page, args: { id: string, name: string }) => {
  const cdpSession = await getCDPSession(page)

  const { nodeId } = await cdpSession.send('DOM.requestNode', { objectId: args.id })
  const { attributes } = await cdpSession.send('DOM.getAttributes', { nodeId: nodeId })

  for (let i = 0; i < attributes.length; i++) {
    if (attributes[i] === args.name) {
      return attributes[i + 1]
    }
  }
}

export const getElementTagName = async (page: Page, args: { id: string }) => {
  const cdpSession = await getCDPSession(page)
  const returnedValue = await cdpSession.send('Runtime.callFunctionOn', {
    functionDeclaration: `function() {return this.tagName}`,
    objectId: args.id,
    returnByValue: true,
  })

  return returnedValue.result.value
}

export const clickElement = async (page: Page, args: { id: string }) => {
  const cdpSession = await getCDPSession(page)
  const { centerX, centerY } = await getContentQuads(page, { backendNodeId: parseInt(args.id) })

  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: centerX,
    y: centerY,
    button: 'left',
    clickCount: 1,
    buttons: 1,
  })

  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: centerX,
    y: centerY,
    button: 'left',
    clickCount: 1,
    buttons: 1,
  })

  return true
}

export const getContentQuads = async (page: Page, args: Protocol.DOM.getContentQuadsParameters) => {
  const cdpSession = await getCDPSession(page)
  const quadsResponse = await cdpSession.send('DOM.getContentQuads', args)

  const [
    topLeftX, topLeftY,
    topRightX, topRightY,
    bottomRightX, bottomRightY,
    bottomLeftX, bottomLeftY,
  ] = quadsResponse.quads[0]

  const width = topRightX - topLeftX
  const height = bottomRightY - topRightY
  const centerX = topLeftX + (width / 2)
  const centerY = topRightY + (height / 2)

  return {
    topLeftX, topLeftY,
    topRightX, topRightY,
    bottomRightX, bottomRightY,
    bottomLeftX, bottomLeftY,
    width, height,
    centerX, centerY,
  }
}

export const focusElement = async (page: Page, args: Protocol.DOM.focusParameters) => {
  const cdpSession = await getCDPSession(page)
  await cdpSession.send('DOM.focus', args)
}

export const getElementRect = async (page: Page, args: { id: string }) => {
  const cdpSession = await getCDPSession(page)
  const returnedValue = await cdpSession.send('Runtime.callFunctionOn', {
    functionDeclaration: `function() {return JSON.parse(JSON.stringify(this.getBoundingClientRect()))}`,
    objectId: args.id,
    returnByValue: true,
  })

  return returnedValue.result.value
}

export const findElements = async (page: Page, args: { using: string, value: string }) => {
  // TODO: Once the backend stops trying to switchFrames() we can remove this special case
  if (args.value === 'iframe') return []

  switch(args.using) {
    case 'css selector':
    case 'tag name':
      return await querySelectorAll(page, { selector: args.value })
    default:
      throw Error(`Unsupported findElements strategy ${args.using}`)
  }
}

export const querySelectorAll = async (page: Page, args: { selector: string }) => {
  const cdpSession = await getCDPSession(page)
  const rootDocumentNode = await cdpSession.send('DOM.getDocument', { depth: -1 })
  const returned = await cdpSession.send('DOM.querySelectorAll', { nodeId: rootDocumentNode.root.nodeId, selector: args.selector })
  const resolvedNodesPromises = returned.nodeIds.map(async (nodeId) => await cdpSession.send('DOM.resolveNode', { nodeId: nodeId }))
  const resolvedNodes = await Promise.all(resolvedNodesPromises)
  const returnValue = resolvedNodes.map((node) => ({ [WEBDRIVER_ELEMENT_KEY]: node.object.objectId }))
  return returnValue
}

export const getCurrentUrl = async (page: Page) => {
  const cdpSession = await getCDPSession(page)
  const returned = await cdpSession.send('Page.getNavigationHistory')
  const returnValue = returned.entries[returned.currentIndex].url
  return returnValue
}

export const executeScript = async (page: Page, args: { script: string, args: any[] }) => {
  const functionDeclaration = `function() { ${args.script} }`
  const functionArgs = args.args.map((arg) => {
    if (typeof arg === 'boolean' || typeof arg === 'string' || typeof arg === 'number') {
      return { value: arg }
    } else if (arg && typeof arg === 'object' && Reflect.has(arg, WEBDRIVER_ELEMENT_KEY)) {
      return { objectId: arg[WEBDRIVER_ELEMENT_KEY] }
    } else {
      return { value: undefined }
    }
  })

  const cdpSession = await getCDPSession(page)
  await cdpSession.send('Runtime.enable')
  const window = await cdpSession.send('Runtime.evaluate', { expression: 'window' })

  const returnedRef = await cdpSession.send('Runtime.callFunctionOn', {
    objectId: window.result.objectId,
    functionDeclaration,
    arguments: functionArgs,
  })

  if (returnedRef.result.className === 'NodeList') {
    const nodeProperties = await cdpSession.send('Runtime.getProperties', {
      objectId: returnedRef.result.objectId!,
      ownProperties: true,
    })
    return nodeProperties.result.map((e) => !isNaN(parseInt(e.name)) ? { [WEBDRIVER_ELEMENT_KEY]: e.value?.objectId } : null).filter(e => e)

  } else if (returnedRef.result.className === 'HTMLHtmlElement') {
    return { [WEBDRIVER_ELEMENT_KEY]: returnedRef.result.objectId }

  } else {
    const returnedValue = await cdpSession.send('Runtime.callFunctionOn', {
      objectId: window.result.objectId,
      functionDeclaration,
      arguments: functionArgs,
      returnByValue: true,
    })

    return returnedValue.result.value
  }
}

type CDPSession = Awaited<ReturnType<ReturnType<Page['context']>['newCDPSession']>>
