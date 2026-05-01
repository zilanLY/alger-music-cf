# Alger Music - Cloudflare 一键部署

直接连接 GitHub 仓库到 Cloudflare Pages 实现一键部署。

## 部署步骤

### 1. 连接 GitHub
1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **连接 GitHub**
3. 授权并选择仓库 `zilanLY/alger-music-cf`

### 2. 创建部署
1. 选择 **直接上传** 或 **GitHub 连接**
2. 配置:
   - **构建命令**: `cd web && npm install && npm run build`
   - **输出目录**: `web/dist`
   - **根目录**: `/`

### 3. 一键部署
以后每次 push 代码到 main 分支，Cloudflare 会自动构建并部署。

## 项目说明

| 目录 | 用途 |
|------|------|
| `web/` | 前端 Vue 项目 |
| `src/` | Worker API（如需） |

## 注意事项

- 前端是纯静态项目，API 需要另外部署（如 Vercel）
- 部署后在 Cloudflare 设置自定义域名即可访问