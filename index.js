/**
 * Host half of the account-balance pill.
 *
 * The surface is browser-only, so this module only exists so the profile row
 * has a host fiber. The browser half ships through `exports["./client"]` and
 * is discovered from the `dsh.client` declaration in package.json.
 */

/** Host plugin body — no host-side behaviour for this surface plugin. */
export function apply() {}
