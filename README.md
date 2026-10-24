# dsh-plugin-account-balance

DeepSeek Harness 插件：在输入框底部统计行里显示**账号剩余额度**，位置紧挨「缓存命中」右边。

A DeepSeek Harness plugin that shows your remaining DeepSeek account balance in the composer dock, right after the cache-hit reading.

![输入框底部统计行，蓝框标出本插件渲染的 ¥14.79](docs/preview.png)

图中蓝框圈出的 `¥14.79` 就是本插件渲染的格子。金额是**充值余额 + 赠金余额按币种合计**：悬停显示拆分（`充值余额 ¥9.99 · 赠金余额 ¥5.26`），点击打开 DeepSeek 平台用量页，页面可见时每 60 秒刷新一次。读不到钱包时显示 `--` 并保留这一格，不会让整行跳动。

## 前提

- DeepSeek Harness 的 Web 界面（`dsh web`），profile 里要有 `conversation.composer.dock` 这个插槽（官方 web 组装自带）。
- 用 **DeepSeek 账号**登录。只用 API Key 的组装没有账号态，插件不会显示任何东西。
- 账号要能查到钱包摘要。查不到时显示 `--`，此时打开 `设置 → 账号与余额` 看到的通常也是"前往开放平台查看"——那是账号侧的问题，不是插件。

## 安装

插件是一个 DSH 插件包（`dsh.bundle.patch` + `dsh.client`），仓库里不带构建产物：`client.js` 是手写的模块装载包，`index.js` 只提供一个空的宿主半边。

手工安装（路径明确，推荐）：

```bash
# 1. 装进 profile 的 node_modules
cd ~/.dsh/profiles/web           # Windows: C:\Users\<你>\.dsh\profiles\web
pnpm add github:cailikelog/dsh-plugin-account-balance

# 2. 在 profile 的 cordis.patch.yml 里插入一行（文件末尾追加，注意 YAML 数组缩进）
- insert:
    - id: dsh-plugin-account-balance:pill
      name: dsh-plugin-account-balance

# 3. 重启
dsh
```

也可以在 `设置 → 插件` 里安装本仓库，再启用；那条路会顺带把包写进 profile 的 `dsh.profile.bundles`。

## 卸载

删掉 `cordis.patch.yml` 里那三行（`- insert:` 和下面两行），`pnpm remove dsh-plugin-account-balance`，重启。

## 实现要点

- 只占一个槽位：`conversation.composer.dock`（列表槽），`id` 为 `account-balance`，`order: 2`——缓存命中那颗是 `order: 1`。
- 数据走 `remote.account`：`getState()` 拿登录态和用量页地址，`getBalance()` 拿钱包摘要。不读取、不复制任何凭据，凭据始终留在宿主进程里。
- 注册和读取都挂在 `remoteAccess.whenAccess('account/watch')` 下：对端没有账号访问权限时不会注册这个格子，权限被收回时一并拆除。
- 不依赖其它插件，也不依赖主题包：颜色走 `--dsw-*` / `--dsh-*` CSS 变量，样式内联。

## 已知限制

- `client.js` 里的 `CLIENT_VERSION = '0.2.1-rc.3'` 会作为 `x-client-version` 发给平台。平台若开始校验版本，改这一个常量即可。
- 金额用浮点数求和、向下取两位，只用于显示，不参与任何计费。
- 与本仓库 `packages/client/ui-settings-account` 里的 `AccountBalancePill` 使用同一个格子 id，**不要同时启用两份**，后注册的会替换先注册的。

## 开发

```bash
pnpm install
pnpm test        # 装载 client.js、跑 apply、断言注册项与渲染结果
```

`test/smoke.cjs` 复刻了浏览器装模块的方式：先给出 `window.__ModuleLoader__`，再执行 `client.js`，用假 `ctx` 跑 `apply`，最后用 React 渲染出那一格。
