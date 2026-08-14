# dsh-theme-background

DSH Web UI 背景图片插件。安装后，在 **设置 → 常规** 里新增「背景图片」行：粘贴图片 URL 或从本地文件选择图片，作为 Web UI 底层背景（浅色/深色共用一张，可移除还原）。设置背景后还可手动调节 **清晰度**（锐化/模糊）与 **遮罩不透明度**（图片透出程度）。

## 安装

克隆后先打包（仓库不提交构建产物 `.tgz`）：

```sh
git clone https://github.com/yuyedaidao/dsh-theme.git
cd dsh-theme
pnpm pack --pack-destination .
```

然后安装到目标 profile 并重启 Web UI：

```sh
dsh plugin --profile web add ./dsh-theme-background-0.1.0.tgz
dsh web   # 然后刷新 http://127.0.0.1:3080
```

（也可用本地目录 `dsh plugin --profile web add ./`，但会以 `link:` 安装、解析不到共享模块；推荐用 tarball。）

卸载：

```sh
dsh plugin --profile web remove dsh-theme-background
```

## 工作原理

- 这是一个**双面（host + browser）Cordis 插件**：`index.js` 是 node 半（仅作合法入口，entry fiber 必须存在才会被纳入引导图），`lib/client.js` 是浏览器半。
- **持久化用浏览器 `localStorage`**：图片存 `dsh-theme-background:image`，清晰度/遮罩存 `dsh-theme-background:settings`（JSON `{"clarity":0,"veil":65}`），落在浏览器本地，而非 `~/.dsh/settings.yaml`。原因见下文。
- 本地文件选择后先经 canvas 压缩到最长边 1920px、输出 JPEG，再转 data URL，避免体积过大。
- 背景由客户端注入的一段 `<style>` 实现：图片挂在独立固定层 `#dsh-theme-background-layer`（`position:fixed; inset:0; z-index:-1`）上，这样 `filter` 只作用于图片、不模糊 UI；并把**底层** token（`--dsw-alias-bg-base`、`--dsw-specific-sidebar-fill`）覆盖为半透明，让图片透出。抬升/悬浮表面 token（`--dsw-alias-bg-layer-1/2/3` 等）**不覆盖**，保持主题默认的不透明值，从而保证设置面板、弹层、菜单等可读。

## 两个调节滑块

设置背景图后出现：

- **清晰度**（`-100 … +100`，默认 `0`）：负值对图片加 `filter: blur()`（更柔和），正值加 `filter: contrast() saturate()`（CSS 无原生锐化，用对比度/饱和度增强近似「更清晰」）。
- **遮罩不透明度**（`0 … 100`，默认 `65`）：控制底层画布（`--dsw-alias-bg-base`）与侧边栏（`--dsw-specific-sidebar-fill`）的 alpha；越小图片透出越清楚，`100` 时图片被完全遮住。

## 为什么不用 Host settings

当前 dsh 版本（0.1.0-rc.6）里，`dsh-host-apiproxy` 的 settings 白名单
（`WEB_SETTINGS_NAMESPACES` / `PRODUCT_SETTINGS_NAMESPACES`）是硬编码的：第三方插件即使
`settings.register()` 了命名空间，Web 客户端也无法读写（读被 filter、写返回
`settings-not-exposed`）。把「命名空间可暴露」下沉到 `settings.register()` 是该包注释里
明示的 deferred work，尚未实现。因此本插件改用 localStorage，绕过该限制。

## 运行时依赖

`lib/client.js` 在浏览器里依赖 `react` 与 `@deepseek-ai/dsh-client-runtime/client`，二者由
浏览器静态模块表 / 引导图提供。本包 **不声明 `dependencies`/`peerDependencies`**，从而避免
`dsh plugin add` 触发联网安装。

## 已知边界

- 图片存浏览器 localStorage（约 5MB 配额）；压缩后通常几百 KB，可接受。换浏览器/清缓存会丢失。
- 远端浏览器（非 `127.0.0.1`）同样可用，因为不依赖 loopback-only 的 settings RPC。
- 「锐化」为 CSS 对比度/饱和度近似，非真正的卷积锐化（unsharp mask）；如需真实锐化可后续加内联 SVG `feConvolveMatrix` 滤镜。
- 如发现仍有不透明表面遮挡图片，可在 `lib/client.js` 的 `buildBackgroundCss` 里补充对应 token（仅限底层表面；弹层/菜单/面板等抬升表面应保持不透明以保证可读性）。
