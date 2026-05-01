/**
 * Alger Music - Cloudflare Worker
 * 
 * 集成 Meting-API-Serverless API + Alger 适配器 + 前端静态文件
 * 
 * 路由:
 *   /api/*  → Meting 原始格式 (server, type, id)
 *   /cloudsearch, /song/*, /playlist/*, /lyric/* → Alger 格式 → 转换为 Meting → 返回 Alger 格式
 *   /*      → 前端静态文件 (public/)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { LRUCache } from 'lru-cache'

// 导入 Meting-API-Serverless 组件
import { loadConfig } from './utils/config.js'
import { format as lyricFormat } from './utils/lyric.js'
import { readCookieAsync, isAllowedHost } from './utils/cookie.js'

// 平台映射: Alger source 值 (0-4) → Meting server 名
const ALGER_TO_METING = {
  '0': 'netease',
  '1': 'tencent',
  '2': 'kugou',
  '3': 'kuwo',
  '4': 'baidu'
}

// Meting server → 名称映射
const METING_SERVER_NAMES = {
  'netease': '网易云',
  'tencent': 'QQ音乐',
  'kugou': '酷狗',
  'kuwo': '酷我',
  'baidu': '百度'
}

const app = new Hono()

// 缓存
const cache = new LRUCache({ max: 1000, ttl: 1000 * 30 })

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Real-IP'],
  maxAge: 86400,
}))

// ─────────────────────────────────────────────────────────────
// Meting 原始 API: /api?server=tencent&type=search&id=关键词
// ─────────────────────────────────────────────────────────────
app.all('/api', async (c) => {
  const config = loadConfig(c.env, c.req.url)
  const baseUrl = config.meting?.url || new URL(c.req.url).origin
  const token = config.meting?.token || 'token'

  const query = c.req.query()
  const server = query.server || 'netease'
  const type = query.type || 'search'
  const id = query.id || 'hello'
  const authToken = query.token || query.auth || token

  if (!['netease', 'tencent', 'kugou', 'baidu', 'kuwo'].includes(server)) {
    return c.json({ code: 400, msg: 'server 参数不合法' }, 400)
  }
  if (!['song', 'album', 'search', 'artist', 'playlist', 'lrc', 'url', 'pic'].includes(type)) {
    return c.json({ code: 400, msg: 'type 参数不合法' }, 400)
  }

  // 鉴权
  if (['lrc', 'url', 'pic'].includes(type)) {
    const expected = hashjs.hmac(hashjs.sha1, token).update(`${server}${type}${id}`).digest('hex')
    if (expected !== authToken) {
      return c.json({ code: 401, msg: '鉴权失败' }, 401)
    }
  }

  const cacheKey = `${server}/${type}/${id}`
  let data = cache.get(cacheKey)
  if (data === undefined) {
    c.header('x-cache', 'miss')

    try {
      const { default: Meting } = await import('@meting/core')
      const meting = new Meting(server)
      patchEapi(meting)
      meting.format(true)

      const referrer = c.req.header('referer')
      if (isAllowedHost(referrer, config.meting?.cookie?.allowHosts)) {
        const cookie = await readCookieAsync(server, c.env)
        if (cookie) meting.cookie(cookie)
      }

      const methodMap = { search: 'search', song: 'song', album: 'album', artist: 'artist', playlist: 'playlist', lrc: 'lyric', url: 'url', pic: 'pic' }
      const response = await meting[methodMap[type]](id)
      data = JSON.parse(response)
    } catch (err) {
      console.error('[Meting API Error]', err)
      return c.json({ code: 502, msg: '上游 API 调用失败', error: err.message }, 502)
    }

    cache.set(cacheKey, data, { ttl: type === 'url' ? 1000 * 60 * 10 : 1000 * 60 * 60 })
  }

  // 处理响应
  if (type === 'url') {
    let url = data?.url
    if (!url) return c.body(null, 404)
    url = url.replace(/^http:/, 'https:')
    if (server === 'netease') url = url.replace('://m7c.', '://m7.').replace('://m8c.', '://m8.')
    if (server === 'tencent') url = url.replace('://ws.stream.qqmusic.qq.com', '://dl.stream.qqmusic.qq.com')
    return c.redirect(url)
  }
  if (type === 'pic') return c.redirect(data?.url || '')
  if (type === 'lrc') return c.text(lyricFormat(data?.lyric || '', data?.tlyric || ''))

  // 返回统一格式
  return c.json(data.map(x => ({
    title: x.name,
    author: x.artist.join(' / '),
    url: `${baseUrl}/api?server=${server}&type=url&id=${x.url_id}&auth=${hashjs.hmac(hashjs.sha1, token).update(`${server}url${x.url_id}`).digest('hex')}`,
    pic: `${baseUrl}/api?server=${server}&type=pic&id=${x.pic_id}&auth=${hashjs.hmac(hashjs.sha1, token).update(`${server}pic${x.pic_id}`).digest('hex')}`,
    lrc: `${baseUrl}/api?server=${server}&type=lrc&id=${x.lyric_id}&auth=${hashjs.hmac(hashjs.sha1, token).update(`${server}lrc${x.lyric_id}`).digest('hex')}`
  })))
})

// ─────────────────────────────────────────────────────────────
// Alger 格式适配器
// ─────────────────────────────────────────────────────────────

// 搜索
app.get('/cloudsearch', async (c) => {
  const query = c.req.query()
  const keywords = query.keywords || query.keyword || ''
  const limit = parseInt(query.limit || 30)
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  if (!keywords) return c.json({ result: { songs: [], songCount: 0 }, code: 200 })

  try {
    const data = await callMeting(server, 'search', encodeURIComponent(keywords), { limit: Math.min(limit, 50) }, c.env)
    return c.json({
      result: {
        songs: data.map(song => formatSongAlger(song, server)),
        songCount: data.length
      },
      code: 200
    })
  } catch (err) {
    return c.json({ code: 502, msg: err.message }, 502)
  }
})

// 歌曲详情
app.get('/song/detail', async (c) => {
  const query = c.req.query()
  const ids = String(query.ids || query.id || '').split(',')
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  try {
    const songs = await Promise.all(ids.map(id => getSongDetail(server, id.trim(), c.env)))
    return c.json({ songs, code: 200 })
  } catch (err) {
    return c.json({ code: 502, msg: err.message }, 502)
  }
})

// 歌曲播放链接
app.get('/song/url', app.get('/song/url/v1', async (c) => {
  const query = c.req.query()
  const ids = String(query.id || query.ids || '').split(',')
  const br = parseInt(query.br || query.level || 320000)
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  try {
    const results = await Promise.all(ids.map(id => getSongUrl(server, id.trim(), br, c.env)))
    return c.json({ data: results, code: 200 })
  } catch (err) {
    return c.json({ code: 502, msg: err.message }, 502)
  }
}))

// 歌词
app.get('/lyric', async (c) => {
  const query = c.req.query()
  const id = query.id || ''
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  try {
    const data = await callMeting(server, 'lyric', id, {}, c.env)
    return c.json({
      lrc: { lyric: data?.lyric ? lyricFormat(data.lyric, '') : '' },
      tlyric: data?.tlyric ? { version: 0, lyric: lyricFormat(data.tlyric, '') } : null,
      code: 200
    })
  } catch (err) {
    return c.json({ lrc: { lyric: '' }, tlyric: null, code: 200 })
  }
})

// 歌单
app.get('/playlist/detail', async (c) => {
  const query = c.req.query()
  const id = query.id || ''
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  try {
    const data = await callMeting(server, 'playlist', id, {}, c.env)
    return c.json({
      playlist: {
        id: data.id,
        name: data.name,
        description: data.description || '',
        coverImgUrl: data.pic || data.cover || '',
        creator: { nickname: data.author_name || '未知', userId: 0 },
        tracks: (data.tracks || []).map(s => formatSongAlger(s, server)),
        trackCount: data.tracks?.length || 0
      },
      code: 200
    })
  } catch (err) {
    return c.json({ code: 502, msg: err.message }, 502)
  }
})

// 歌手单曲
app.get('/artist/songs', async (c) => {
  const query = c.req.query()
  const id = query.id || ''
  const limit = parseInt(query.limit || 50)
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  try {
    const data = await callMeting(server, 'artist', id, { limit: Math.min(limit, 100) }, c.env)
    return c.json({
      artist: { id, name: data[0]?.artist?.[0]?.name || '未知' },
      hotSongs: data.map(s => formatSongAlger(s, server)),
      code: 200
    })
  } catch (err) {
    return c.json({ code: 502, msg: err.message }, 502)
  }
})

// 专辑
app.get('/album', async (c) => {
  const query = c.req.query()
  const id = query.id || ''
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  try {
    const data = await callMeting(server, 'album', id, {}, c.env)
    return c.json({
      album: {
        id: data.id,
        name: data.name,
        picUrl: data.pic || data.cover || '',
        artist: { name: data.artist?.name || '未知' },
        songs: (data.tracks || []).map((s, i) => ({ ...formatSongAlger(s, server), no: i + 1 }))
      },
      code: 200
    })
  } catch (err) {
    return c.json({ code: 502, msg: err.message }, 502)
  }
})

// 热门搜索
app.get('/search/hot/detail', async (c) => {
  const server = ALGER_TO_METING[c.req.query().source || '0'] || 'netease'
  try {
    const data = await callMeting(server, 'search', '热门', { limit: 20 }, c.env)
    return c.json({
      data: data.slice(0, 10).map((s, i) => ({ searchWord: s.name, score: 10000 - i * 1000 })),
      code: 200
    })
  } catch {
    return c.json({ data: [{ searchWord: '热门歌曲', score: 10000 }], code: 200 })
  }
})

// 排行榜
app.get('/toplist', app.get('/top/list', async (c) => {
  const query = c.req.query()
  const id = query.id || '1'
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  try {
    const data = await callMeting(server, 'playlist', id, {}, c.env)
    return c.json({
      list: {
        id: data.id,
        name: data.name,
        coverImgUrl: data.pic || '',
        tracks: (data.tracks || []).map((s, i) => ({ ...formatSongAlger(s, server), no: i + 1 }))
      },
      code: 200
    })
  } catch (err) {
    return c.json({ code: 502, msg: err.message }, 502)
  }
}))

// MV
app.get('/mv/url', async (c) => {
  const query = c.req.query()
  const id = query.id || ''
  const server = ALGER_TO_METING[query.source || '0'] || 'netease'

  try {
    const data = await callMeting(server, 'url', `mv_${id}`, {}, c.env)
    return c.json({ data: { url: data?.url || '', code: 200 }, code: 200 })
  } catch {
    return c.json({ data: { url: '', code: 404 }, code: 200 })
  }
})

// ─────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────

// 调用 Meting API
async function callMeting(server, type, id, options = {}, env) {
  const config = loadConfig(env, '')
  const token = config.meting?.token || 'token'
  const baseUrl = config.meting?.url || '.'

  const params = new URLSearchParams({ server, type, id: String(id), ...options })
  const url = `${baseUrl}/api?${params}`
  const response = await fetch(url)
  return await response.json()
}

// 获取歌曲详情
async function getSongDetail(server, id, env) {
  const data = await callMeting(server, 'song', id, {}, env)
  const song = Array.isArray(data) ? data[0] : data
  if (!song) return { id: Number(id), name: '未知', ar: [], al: { id: 0, name: '', picUrl: '' }, dt: 0, fee: 0 }
  return formatSongAlger(song, server)
}

// 获取歌曲播放链接
async function getSongUrl(server, id, br, env) {
  const config = loadConfig(env, '')
  const token = config.meting?.token || 'token'
  const authToken = hashjs.hmac(hashjs.sha1, token).update(`${server}url${id}`).digest('hex')
  const baseUrl = config.meting?.url || '.'

  const url = `${baseUrl}/api?server=${server}&type=url&id=${id}&auth=${authToken}`
  let finalUrl = ''
  try {
    const response = await fetch(url, { redirect: 'manual' })
    if (response.status === 302 || response.status === 301) {
      finalUrl = response.headers.get('location') || ''
    } else {
      const data = await response.json()
      finalUrl = data?.url || ''
    }
  } catch { finalUrl = '' }

  return {
    id: Number(id),
    url: finalUrl.replace(/^http:/, 'https:'),
    br,
    size: 0,
    type: 'mp3',
    code: finalUrl ? 200 : 404,
    md5: ''
  }
}

// 转换为 Alger 格式
function formatSongAlger(song, server) {
  const artists = song.artist || song.artists || []
  const artistNames = Array.isArray(artists) ? artists.map(a => typeof a === 'string' ? a : a.name || '') : []
  const artistId = Array.isArray(artists) && artists[0] ? (typeof artists[0] === 'string' ? 0 : artists[0].id || 0) : 0

  return {
    id: song.id || song.url_id || 0,
    name: song.name || song.title || '未知',
    ar: [{ id: artistId, name: artistNames.join(' / ') || '未知' }],
    al: {
      id: song.album_id || song.album?.id || 0,
      name: song.album_name || song.album?.name || song.album_title || '未知',
      picUrl: song.pic || song.pic_url || song.album?.pic || ''
    },
    dt: (song.duration || 0) * 1000,
    fee: 0
  }
}

// 修补网易云 eapi 加密（CF Workers 不支持 Node.js crypto 的 AES-ECB）
async function patchEapi(meting) {
  if (!meting?.provider || meting.provider.name !== 'netease') return
  const proto = Object.getPrototypeOf(meting.provider)
  if (proto.__patchedEapi) return
  proto.__patchedEapi = true

  proto.eapiEncrypt = (req) => {
    const bodyStr = JSON.stringify(req.body)
    const path = req.url.replace(/https?:\/\/[^/]+/, '')
    const signSeed = `nobody${path}use${bodyStr}md5forencrypt`
    const sign = createHash('md5').update(signSeed).digest('hex')
    const payload = `${path}-36cd479b6b5-${bodyStr}-36cd479b6b5-${sign}`

    const key = Buffer.from('e82ckenh8dichen8', 'utf8')
    const textBytes = Buffer.from(payload, 'utf8')
    const padded = aesjs.padding.pkcs7.pad(textBytes)
    const aesEcb = new aesjs.ModeOfOperation.ecb(key)
    const encryptedBytes = aesEcb.encrypt(padded)
    const encryptedHex = Buffer.from(encryptedBytes).toString('hex').toString()

    req.url = req.url.replace('/api/', '/eapi/')
    req.body = { params: encryptedHex }
    return req
  }
}

// 静态文件（前端）
app.get('/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p }))

export default { fetch: app.fetch }