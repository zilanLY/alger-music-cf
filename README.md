# Alger Music - Cloudflare 一键部署

## 架构

```
用户浏览器
    │
    └── alger-music.workers.dev (本 Worker)
              │
              ├── 前端静态文件 → web/dist/
              │
              └── API 请求 (适配器转换格式)
                        │
                        ▼
                  Meting-API-Serverless (同一 Worker 内)
                  ├── /api?server=netease&type=song&id=xxx
                  ├── /api?server=tencent&type=search&...
                  └── 支持: 网易云 / QQ音乐 / 酷狗 / 酷我 / 百度
```

## 连接 GitHub 一键部署

### 1. Cloudflare Dashboard 配置

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Workers & Pages** → **创建应用程序** → **连接到 GitHub**
3. 选择仓库 **`zilanLY/alger-music-cf`**

### 2. 设置构建配置

| 配置项 | 值 |
|--------|-----|
| **生产分支** | `main` |
| **构建命令** | `cd web && npm install && npm run build` |
| **输出目录** | `web/dist` |
| **根目录** | `/` |

### 3. 设置环境变量

在 Pages 设置 → 环境变量中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `METING_API_URL` | `https://your-worker.workers.dev` | 指向 Meting-API-Serverless 地址 |

> **注意**：本项目**已经内置**了 Meting-API-Serverless API，不需要单独部署外部 API。
> 环境变量 `METING_API_URL` 留空即可使用内置 API。

## 内置 API 详细配置

### QQ 音乐 Cookie（获取 VIP 资源）

1. 获取 QQ 音乐 Cookie:
   - 打开 QQ 音乐网页版并登录
   - 按 F12 打开开发者工具 → Network
   - 任意请求中复制 Cookie 头部内容

2. 在 Worker Settings → Variables 中添加:
   - `METING_COOKIE_TENCENT` = 你的 QQ 音乐 Cookie

### Cookie 保活（可选）

如需 QQ 音乐 Cookie 自动续期，还需要：

1. 创建 KV 数据库:
   - **Storage & Databases** → **KV Namespace** → 创建命名空间（如 `meting_kv`）

2. 绑定 KV:
   - Workers → **Bindings** → **Add** → **KV Namespace**
   - Variable name: `METING_KV`
   - KV Namespace: 选择刚创建的

3. 添加定时任务:
   - **Trigger Events** → **Add Cron Trigger**
   - 设置: 每 4 小时执行一次

### 网易云 Cookie

| 变量名 | 说明 |
|--------|------|
| `METING_COOKIE_NETEASE` | 网易云音乐 Cookie |
| `METING_COOKIE_KUGOU` | 酷狗音乐 Cookie |
| `METING_COOKIE_KUWO` | 酷我音乐 Cookie |
| `METING_TOKEN` | API 鉴权密钥（强烈建议设置） |

## 支持的音乐平台

| 平台 | source 值 | 说明 |
|------|-----------|------|
| 网易云音乐 | `0` | 默认，支持 VIP |
| QQ音乐 | `1` | 需要 Cookie |
| 酷狗音乐 | `2` | 需要 Cookie |
| 酷我音乐 | `3` | 需要 Cookie |
| 百度音乐 | `4` | - |