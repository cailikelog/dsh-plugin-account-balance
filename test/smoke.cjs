/**
 * Load the shipped client bundle the way the shell does, apply it to a stub
 * client context, and render the dock cell from the resulting snapshot.
 *
 * Run inside a checkout that can resolve `react` and `react-dom/server`:
 *
 *   NODE_PATH=<checkout>/node_modules node test/smoke.cjs
 */
'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// The bundle renders copy from the browser language; pin it so the assertions
// below do not depend on the machine's locale.
try {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true })
} catch {
  // A runtime that forbids redefining navigator keeps its own language.
}
globalThis.document = { hidden: false }

let definition
globalThis.window = { __ModuleLoader__: { load(value) { definition = value } } }
const source = readFileSync(join(__dirname, '..', 'client.js'), 'utf8')
new Function('window', source)(globalThis.window)
assert.equal(definition.id, 'dsh-plugin-account-balance', 'bundle declares its package id')

const plugin = definition.factory(require)
assert.equal(typeof plugin.apply, 'function', 'factory exports apply')
assert.deepEqual(plugin.inject, ['slots', 'remote', 'remote.account', 'remoteAccess'])

/** One registered dock cell plus the disposer that would remove it. */
const cells = []
let releaseAccess
const ctx = {
  slots: {
    inject(name, callback) {
      assert.equal(name, 'conversation.composer.dock')
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    register(options, component) {
      cells.push({ options, component })
      return () => {}
    },
  },
  remoteAccess: {
    whenAccess(action, callback) {
      assert.equal(action, 'account/watch')
      releaseAccess = callback()
      return releaseAccess
    },
  },
  remote: {
    account: {
      getState: async () => ({
        ok: true,
        value: { status: 'credential-stored', attempt: null, links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' } },
      }),
      getBalance: async () => ({
        ok: true,
        value: {
          status: 'ready',
          value: [{ currency: 'CNY', balance: '9.9995250000000000' }],
          bonusWallets: [{ currency: 'CNY', balance: '5.2646426800000000' }],
        },
      }),
    },
  },
}

plugin.apply(ctx)
assert.equal(cells.length, 1, 'registers exactly one composer dock cell')
const cell = cells[0]
assert.equal(cell.options.id, 'account-balance')
assert.equal(cell.options.order, 2, 'sits right of the cache-hit pill (order 1)')

const injected = cell.options.inject()
const store = injected.hooks.balance

void (async () => {
  // The first wallet read is asynchronous; the store publishes when it lands.
  for (let tick = 0; tick < 50 && store.getSnapshot() === undefined; tick++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  const state = store.getSnapshot()
  assert.equal(state.signedIn, true)
  assert.equal(state.href, 'https://platform.deepseek.com/usage')
  assert.equal(state.amount, '¥15.26', 'totals recharge and granted wallets')
  assert.equal(state.breakdown, 'Topped-up balance ¥9.99 · Granted balance ¥5.26')

  const html = renderToStaticMarkup(React.createElement(cell.component, {
    useBalance: (selector) => selector(state),
  }))
  assert.match(html, /¥15\.26/)
  assert.match(html, /aria-label="Remaining balance ¥15\.26"/)
  assert.match(html, /href="https:\/\/platform\.deepseek\.com\/usage"/)

  releaseAccess()
  process.exit(0)
})()
