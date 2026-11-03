# Sharing Notes 使用统计

管理看板：https://sharingnotes-analytics.sharingnotes-service.workers.dev/

首次使用管理员口令登录，点击“创建通行密钥”，按浏览器提示用 Touch ID / Face ID 或密码管理器保存。之后可使用通行密钥登录，查看最近 7 天／30 天的访问次数、笔记打开、专注时长、阅读节点与错误。热门笔记可点击打开。环境诊断显示最近 100 条开启分享的记录。

使用数据按天汇总，不建立访客或会话档案。环境诊断独立保存 IP、User-Agent、平台、语言和视口，不保存 Canvas、音频、字体枚举，不与笔记关联。设置关闭后，后续请求不保存环境诊断，但基础统计继续。随机事件 ID 仅用于重试去重。

诊断和去重记录按接收时间保留 30 天，使用汇总按自然日保留约 30 天。每小时及收到收集请求时清理过期数据。Cloudflare 数据库恢复快照和平台网络处理受其自身保留规则约束，应用清理不等同于平台备份擦除。

## 部署与维护

在仓库根目录运行：

```bash
npx wrangler login
npx wrangler d1 migrations apply sharingnotes-analytics --remote --config analytics/wrangler.jsonc
npx wrangler deploy --config analytics/wrangler.jsonc
```

管理员口令通过 `wrangler secret put ADMIN_SECRET --config analytics/wrangler.jsonc` 配置，不能写入仓库。更换口令会使旧登录会话失效。

```bash
node --test analytics/tests/*.test.js
npm test
```

免费版达到额度后日志接收可能失败，网页阅读继续，待发送队列最多 200 条、保存 5 天。公开上报接口不能证明事件来自真实用户；Origin 校验和实例频率限制只减少误用，统计用于趋势分析。

管理员通行密钥属于授权配置，不按 30 天清理；只有统计日志按期限清理。私钥由设备或密码管理器保管，服务端只保存公钥。
