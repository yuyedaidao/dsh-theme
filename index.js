// dsh-theme-background host 半。
//
// 说明：当前 dsh 版本里，`dsh-host-apiproxy` 的 settings 白名单
// （WEB_SETTINGS_NAMESPACES / PRODUCT_SETTINGS_NAMESPACES）是硬编码的，第三方
// 插件即使 register 了命名空间，Web 客户端也无法读写（读被 filter、写返回
// settings-not-exposed）。因此本插件的持久化放在浏览器 localStorage（见
// lib/client.js），host 半仅作为一个合法插件入口存在（entry fiber 必须存在，
// dsh-client-modules 才会把它的 ./client 纳入引导图）。
export const name = "dsh-theme-background";

export function apply() {
  // 无 host 侧副作用。
}
