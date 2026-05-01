/**
 * Alger Music - Cloudflare Worker
 * 
 * 功能:
 * - 静态文件服务 (./public 目录)
 * - API 请求代理到外部后端
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// 环境变量
const API_BASE = MUSIC_API_URL || ''

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Real-IP', 'X-Real-IP'],
  maxAge: 86400,
}))

// API 代理
if (API_BASE) {
  app.all('/api/*', async (c) => {
    const path = c.req.path.replace('/api', '') || '/'
    const method = c.req.method
    const headers = {}

    const reqHeaders = c.req.headers
    const passHeaders = ['content-type', 'cookie', 'user-agent', 'x-real-ip', 'authorization', 'referer', 'origin']
    for (const key of passHeaders) {
      const val = reqHeaders.get(key)
      if (val) headers[key] = val
    }

    try {
      const url = `${API_BASE}${path}${c.req.query() ? '?' + new URLSearchParams(c.req.query()).toString() : ''}`
      const body = ['POST', 'PUT', 'PATCH'].includes(method)
        ? await c.req.text().catch(() => undefined)
        : undefined

      const response = await fetch(url, { method, headers, body })

      const contentType = response.headers.get('content-type') || 'application/json'
      const data = await response.text()

      return new Response(data, {
        status: response.status,
        headers: {
          'content-type': contentType,
          'access-control-allow-origin': '*',
          'access-control-allow-credentials': 'true',
        },
      })
    } catch (err) {
      return c.json({ code: 502, msg: 'API 请求失败', error: err.message }, 502)
    }
  })
} else {
  app.all('/api/*', (c) =>
    c.json({
      code: 404,
      msg: 'API 未配置。请设置 MUSIC_API_URL 环境变量指向你的 API 后端（如 Vercel 部署的 netease-cloud-music-api）。'
    }, 404)
  )
}

// 前端默认页
app.get('*', serveStatic({ root: './public', rewriteRequestPath: (p) => p }))

export default { fetch: app.fetch }