/**
 * Remaining DeepSeek account balance as one composer dock reading.
 *
 * The pill sits in the `conversation.composer.dock` list, one cell to the right
 * of the shipped cache-hit pill, and links to the Platform usage page. It reads
 * the account state and the wallet summary through the `remote.account`
 * service, so it needs no other plugin: the same numbers the Settings →
 * Account page shows, without opening Settings.
 *
 * This file is a hand-written DeepSeek Harness client bundle: the shell
 * evaluates it, `window.__ModuleLoader__.load` receives the factory, and the
 * factory returns the plugin module the client loader applies.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-account-balance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')

    /**
     * Platform rejects an account query that carries no client identity. The
     * Host forwards these fields as `x-client-*` headers, so the version has to
     * look like a DeepSeek Harness client build; update it when the Platform
     * stops accepting this one.
     */
    const CLIENT_VERSION = '0.2.1-rc.3'
    /** Wallet refresh period while the page is visible. */
    const REFRESH_MS = 60_000
    /** Dock cell key; the shipped cache-hit pill is `usage` at order 1. */
    const CELL = 'account-balance'

    const COPY = {
      zh: { label: '剩余额度', balance: '充值余额', bonus: '赠金余额', unavailable: '前往开放平台查看' },
      en: { label: 'Remaining balance', balance: 'Topped-up balance', bonus: 'Granted balance', unavailable: 'View on Platform' },
    }
    const SYMBOL = { CNY: '¥', USD: '$' }

    /** @returns copy for the browser's current language. */
    function copy() {
      const language = (typeof navigator === 'undefined' ? '' : navigator.language || '').toLowerCase()
      return language.startsWith('zh') ? COPY.zh : COPY.en
    }

    /** @returns the identity the Host turns into Platform request headers. */
    function clientMetadata() {
      return {
        version: CLIENT_VERSION,
        locale: typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      }
    }

    /**
     * Format one amount the way the Platform Web client does: two decimals,
     * rounded down, sub-cent values shown as `<0.01`. Display-only arithmetic.
     */
    function format(amount, symbol) {
      if (!(amount > 0)) return `${symbol}0.00`
      if (amount < 0.01) return `<${symbol}0.01`
      const value = Math.floor(amount * 100) / 100
      return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    /** Sum a wallet list per currency in first-seen order. */
    function totals(wallets) {
      const sums = new Map()
      for (const wallet of wallets) {
        const amount = Number(wallet.balance)
        if (!Number.isFinite(amount)) continue
        sums.set(wallet.currency, (sums.get(wallet.currency) || 0) + amount)
      }
      return sums
    }

    /** @returns per-currency readings joined by a space. */
    function readings(sums) {
      return [...sums].map(([currency, amount]) => format(amount, SYMBOL[currency] || '')).join(' ')
    }

    /**
     * Total remaining across both wallets. A currency with nothing left drops
     * out, unless the whole account is empty — then the first currency still
     * reads `0.00` instead of the cell disappearing.
     */
    function remaining(balance) {
      const sums = totals([...balance.value, ...balance.bonusWallets])
      if (sums.size === 0) return undefined
      const funded = new Map([...sums].filter(([, amount]) => amount > 0))
      return readings(funded.size > 0 ? funded : new Map([...sums].slice(0, 1)))
    }

    /**
     * The dock reading. Rendered by the slot after `inject` binds the plugin's
     * `hooks.balance` snapshot to this component's `useBalance` seat.
     */
    function Pill({ useBalance }) {
      const state = useBalance((value) => value)
      if (state === undefined || state.signedIn !== true) return null
      const text = copy()
      const amount = state.amount === undefined ? '--' : state.amount
      return React.createElement(
        'a',
        {
          href: state.href,
          target: '_blank',
          rel: 'noreferrer',
          title: state.breakdown === '' ? text.unavailable : state.breakdown,
          'aria-label': `${text.label} ${amount}`,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            minWidth: 0,
            padding: '1px 8px',
            borderRadius: 'var(--dsw-radius-sm)',
            color: 'var(--dsw-alias-label-tertiary)',
            fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          },
        },
        React.createElement('span', null, amount),
      )
    }

    /** The snapshot the component renders; replaced only when a read changes it. */
    function createStore() {
      let snapshot
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        publish(next) {
          if (JSON.stringify(next) === JSON.stringify(snapshot)) return
          snapshot = next
          for (const listener of listeners) listener()
        },
      }
    }

    /** @returns the plugin body the client loader applies for this row. */
    function apply(ctx) {
      const store = createStore()

      const read = async () => {
        try {
          const [state, balance] = await Promise.all([
            ctx.remote.account.getState(),
            ctx.remote.account.getBalance(clientMetadata()),
          ])
          if (!state.ok) return
          const view = state.value
          const next = { signedIn: view.status === 'credential-stored', href: view.links.usageUrl, amount: undefined, breakdown: '' }
          if (balance.ok && balance.value !== null && balance.value.status === 'ready') {
            const value = balance.value
            next.amount = remaining(value)
            const parts = []
            if (value.value.length > 0) parts.push(`${copy().balance} ${readings(totals(value.value))}`)
            const granted = value.bonusWallets.filter((wallet) => Number(wallet.balance) > 0)
            if (granted.length > 0) parts.push(`${copy().bonus} ${readings(totals(granted))}`)
            next.breakdown = parts.join(' · ')
          }
          store.publish(next)
        } catch {
          // A failed read leaves the last published reading in place; the next
          // period tries again.
        }
      }

      // The cell and its reads follow the peer's account access: a revoked
      // grant takes both down instead of leaving a stale reading behind.
      ctx.remoteAccess.whenAccess('account/watch', () => {
        void read()
        const timer = setInterval(() => { if (!document.hidden) void read() }, REFRESH_MS)
        const registration = ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: CELL,
          order: 2,
          inject: () => ({ hooks: { balance: store } }),
        }, Pill))
        return () => {
          clearInterval(timer)
          registration()
        }
      })
    }

    module.exports = { name: 'account-balance', apply, inject: ['slots', 'remote', 'remote.account', 'remoteAccess'] }
    return module.exports
  },
})
