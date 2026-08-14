# dsh-theme

DSH Web UI 背景图片插件。在 **设置 → 常规** 里新增「背景图片」行：粘贴图片 URL 或从本地文件选择图片，作为 Web UI 底层背景（浅色/深色共用一张，可移除还原）。设置背景后还可调节 **清晰度**（锐化/模糊）与 **遮罩不透明度**（图片透出程度）。

## 一键安装

```sh
dsh plugin --profile web add https://github.com/yuyedaidao/dsh-theme/releases/download/v0.1.0/dsh-theme-0.1.0.tgz
dsh web   # 然后刷新 http://127.0.0.1:3080
```

> 需要本机已安装 `dsh` CLI（`dsh --version` 可确认），并把 `--profile web` 换成你实际使用的 profile。

## 使用

1. 打开 **设置 → 常规**，找到「背景图片」行。
2. 粘贴图片 URL，或点击「选择图片」从本地选择。
3. 设置后可拖动滑块：
   - **清晰度**：负值更柔和（模糊），正值更清晰。
   - **遮罩不透明度**：数值越小，图片透出越清楚。
4. 点击「移除」可还原默认背景。

## 卸载

```sh
dsh plugin --profile web remove dsh-theme
```

## 从源码构建（可选）

仓库不提交构建产物 `.tgz`，需要自行打包：

```sh
git clone https://github.com/yuyedaidao/dsh-theme.git
cd dsh-theme
pnpm pack --pack-destination .
dsh plugin --profile web add ./dsh-theme-0.1.0.tgz
```

## 工作原理

- 双面（host + browser）Cordis 插件：`index.js` 是 node 半（合法入口），`lib/client.js` 是浏览器半。
- 背景图片挂在独立固定层 `#dsh-theme-layer`（`position:fixed; inset:0; z-index:-1`），`filter` 只作用于图片、不模糊 UI。
- 只把底层 token（`--dsw-alias-bg-base`、`--dsw-specific-sidebar-fill`）覆盖为半透明；抬升/悬浮表面（`--dsw-alias-bg-layer-*` 等）保持主题默认不透明，保证设置面板、弹层、菜单可读。
- 持久化用浏览器 `localStorage`（图片 key `dsh-theme:image`，设置 key `dsh-theme:settings`）：当前 dsh 版本的 settings 白名单对第三方插件是硬编码的，Web 客户端无法通过 settings 命名空间读写，因此本地存储是更可靠的选择。
- 本地图片先经 canvas 压缩到最长边 1920px、输出 JPEG，避免 localStorage 膨胀。

## 已知边界

- 图片存浏览器 localStorage（约 5MB 配额）；压缩后通常几百 KB，可接受。换浏览器/清缓存会丢失。
- 远端浏览器（非 `127.0.0.1`）同样可用，不依赖 loopback-only 的 settings RPC。
