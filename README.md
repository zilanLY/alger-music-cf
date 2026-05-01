# Alger Music - Cloudflare Workers + Pages

一键部署到 Cloudflare 的完整解决方案。

## 项目结构

```
alger-music-cf/
├── web/                 # 前端 Vue 项目 (构建后输出到 dist/)
│   ├── src/            # 前端源码
│   ├── dist/           # 构建产物 (gitignore)
│   └── package.json
├── src/
│   ├── index.js        # Cloudflare Worker 入口
│   └── api/            # API 模块
├── public/             # 静态文件目录 (Worker + Pages 共用)
├── wrangler.toml       # Cloudflare 配置
└── .github/
    └── workflows/
        └── deploy.yml  # GitHub Actions 一键部署
```

## 快速开始

### 方式一：GitHub Actions 自动部署

1. Fork 本仓库
2. 在仓库 Settings → Secrets 中添加:
   - `CF_ACCOUNT_ID`: 你的 Cloudflare Account ID
   - `CF_API_TOKEN`: 你的 Cloudflare API Token (Edit Cloudflare Workers 权限)
3. 手动触发 workflow 或 push 代码

### 方式二：本地部署

```bash
# 安装依赖
npm install
cd web && npm install && cd ..

# 开发模式
npm run dev

# 部署到 Cloudflare
npm run deploy
```

## 环境变量

在 Cloudflare Dashboard → Workers → 设置 → 变量 中添加:

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `MUSIC_API_URL` | 自定义网易云 API 地址 | `https://api.example.com` |

## 一键部署脚本

```bash
# 复制下方脚本到终端运行 (需要先设置环境变量)
export CF_ACCOUNT_ID="your-account-id"
export CF_API_TOKEN="your-api-token"

# 构建前端
cd web && npm run build && cd ..

# 部署 Worker
npx wrangler deploy

# 部署 Pages
npx wrangler pages deploy web/dist
```

## 注意事项

- API 部分需要 Node.js 环境，目前建议部署到 Vercel
- 前端可独立部署到 Cloudflare Pages
- 完整部署需要同时配置 Worker 和 Pages