# Alger Music - Cloudflare Pages 部署

## 架构

```
用户浏览器
    │
    ├── 前端静态文件 → Cloudflare Pages (workers.dev 或自定义域名)
    │
    └── /api/* 请求 → Cloudflare Workers (代理到你的 API 后端)
                         │
                         └── Vercel / Leapcell 等 → netease-cloud-music-api-alger
```

## 连接 GitHub 一键部署

### 1. Cloudflare Dashboard 配置

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Workers & Pages** → **创建应用程序** → **连接到 GitHub**
3. 选择仓库 **`zilanLY/alger-music-cf`**

### 2. 设置构建配置

在 Cloudflare 创建 Pages 应用时，配置如下：

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
| `VITE_API` | `https://你的-worker.workers.dev` | API 代理地址（部署 Worker 后填写） |

### 4. 部署 Worker（API 代理）

```bash
# 本地测试
npx wrangler dev

# 部署到 Cloudflare Workers
npx wrangler deploy
```

部署后需要在 Worker 设置中添加环境变量 `MUSIC_API_URL`，指向你的 API 后端地址（如 Vercel 上的 netease-cloud-music-api-alger）。

## 手动部署（不连接 GitHub）

```bash
# 克隆仓库
git clone https://github.com/zilanLY/alger-music-cf.git
cd alger-music-cf

# 部署前端
npx wrangler pages deploy web/dist

# 部署 Worker
npx wrangler deploy
```

## 自定义域名（可选）

在 Cloudflare Pages 的自定义域设置中绑定你的域名即可。