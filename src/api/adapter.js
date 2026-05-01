/**
 * Alger <-> Meting API 适配器
 * 
 * 将 Meting-API-Serverless 的响应格式转换为 AlgerMusicPlayer 期望的格式
 * 
 * Meting 端点: /api?server={tencent|netease|kugou|kuwo}&type={song|playlist|search...}&id={...}
 * Alger 期望:  /cloudsearch?keywords=xxx /song/url?v=xxx&id=xxx 等
 */

const METING_BASE = METING_API_URL || 'https://your-meting-api.workers.dev'

// 平台映射
const PLATFORM_MAP = {
  'netease': 'netease',
  'tencent': 'qq',
  'kugou': 'kugou',
  'kuwo': 'kuwo',
  'baidu': 'baidu'
}

// 反向映射
const ALGER_TO_METING = {
  '0': 'netease',   // 网易云
  '1': 'qq',        // QQ音乐
  '2': 'kugou',     // 酷狗
  '3': 'kuwo',      // 酷我
  '4': 'baidu'      // 百度
}

/**
 * Meting API 调用
 */
async function callMeting(server, type, id, options = {}) {
  const params = new URLSearchParams({
    server,
    type,
    id: String(id),
    ...options
  })
  
  const url = `${METING_BASE}/api?${params}`
  const response = await fetch(url)
  return await response.json()
}

/**
 * 搜索 -> Meting 格式转换
 * Alger: /cloudsearch?keywords=xxx&limit=30
 * Meting: /api?server=tencent&type=search&id=关键词
 */
async function handleCloudSearch(query, limit = 30, server = 'netease') {
  const data = await callMeting(server, 'search', encodeURIComponent(query), { limit })
  
  // 转换为 Alger 格式
  return {
    result: {
      songs: (data || []).map(song => ({
        id: song.id,
        name: song.title,
        artists: song.author?.map(a => ({ name: a })) || [],
        album: { id: song.album_id, name: song.album_title },
        duration: song.duration * 1000,
        fee: song.fee || 0,
        // Meting 返回的额外字段
        url: song.url,
        picurl: song.pic,
        ...song
      })),
      songCount: data.length
    }
  }
}

/**
 * 歌曲详情 -> Meting 格式转换
 * Alger: /song/detail?ids=123456
 * Meting: /api?server=tencent&type=song&id=123456
 */
async function handleSongDetail(ids, server = 'netease') {
  const idList = Array.isArray(ids) ? ids : [ids]
  const data = await callMeting(server, 'song', idList.join(','))
  
  return {
    songs: (data || []).map(song => ({
      id: song.id,
      name: song.title,
      ar: song.author?.map(a => ({ id: 0, name: a })) || [],
      al: { id: song.album_id, name: song.album_title, picUrl: song.pic },
      dt: song.duration * 1000,
      fee: song.fee || 0,
      // 额外字段
      reason: song.reason || '',
      ...song
    })),
    code: 200
  }
}

/**
 * 歌曲播放链接
 * Alger: /song/url?id=123456&br=320000
 * Meting: /api?server=tencent&type=url&id=123456
 */
async function handleSongUrl(ids, br = 320000, server = 'netease') {
  const idList = Array.isArray(ids) ? ids : [ids]
  const data = await callMeting(server, 'url', idList.join(','), { bitrate: br })
  
  return {
    data: (data || []).map(song => ({
      id: song.id,
      url: song.url || null,
      br: song.br || br,
      size: song.size || 0,
      type: song.type || 'mp3',
      code: song.url ? 200 : 404,
      md5: song.md5 || ''
    })),
    code: 200
  }
}

/**
 * 歌单详情
 * Alger: /playlist/detail?id=123456
 * Meting: /api?server=tencent&type=playlist&id=123456
 */
async function handlePlaylistDetail(id, server = 'netease') {
  const data = await callMeting(server, 'playlist', id)
  
  return {
    playlist: {
      id: data.id,
      name: data.title,
      description: data.description,
      coverImgUrl: data.pic,
      creator: data.author ? { 
        nickname: data.author[0], 
        userId: data.author_id || 0 
      } : { nickname: '未知', userId: 0 },
      tracks: (data.tracks || []).map((song, idx) => ({
        id: song.id,
        name: song.title,
        ar: song.author?.map(a => ({ name: a })) || [],
        al: { name: song.album_title, picUrl: song.pic },
        dt: song.duration * 1000,
        no: idx + 1
      })),
      trackCount: data.tracks?.length || 0,
      playCount: data.play_count || 0
    },
    code: 200
  }
}

/**
 * 歌词
 * Alger: /lyric?id=123456
 * Meting: /api?server=tencent&type=lyric&id=123456
 */
async function handleLyric(id, server = 'netease') {
  const data = await callMeting(server, 'lyric', id)
  
  // 转换歌词格式
  let lrc = { lyric: data.lrc?.lyric || '' }
  let tlyric = data.tlrc?.lyric ? { version: data.tlrc.version, lyric: data.tlrc.lyric } : null
  
  return {
    lrc,
    tlyric,
    code: 200
  }
}

/**
 * 热门搜索
 * Alger: /search/hot/detail
 * Meting: 暂无，用模拟数据
 */
async function handleHotSearch() {
  return {
    data: [
      { searchWord: '周杰伦', score: 100000 },
      { searchWord: '陈奕迅', score: 80000 },
      { searchWord: '林俊杰', score: 70000 },
      { searchWord: '邓紫棋', score: 60000 },
      { searchWord: '蔡依林', score: 50000 }
    ],
    code: 200
  }
}

/**
 * 每日推荐歌曲
 * Alger: /recommend/songs
 * Meting: 没有直接对应，用推荐歌单代替
 */
async function handleDailyRecommend(server = 'netease') {
  // Meting 没有每日推荐的直接实现，返回空
  return {
    data: [],
    code: 200,
    message: '每日推荐需要登录 Cookie，请通过歌单获取'
  }
}

/**
 * 歌手单曲
 * Alger: /artist/songs?id=123456
 * Meting: /api?server=tencent&type=artist&id=123456
 */
async function handleArtistSongs(id, limit = 50, server = 'netease') {
  const data = await callMeting(server, 'artist', id, { limit })
  
  return {
    artist: {
      id: data.artist_id,
      name: data.artist_name
    },
    hotSongs: (data || []).map(song => ({
      id: song.id,
      name: song.title,
      ar: song.author?.map(a => ({ name: a })) || [],
      al: { id: song.album_id, name: song.album_title, picUrl: song.pic },
      dt: song.duration * 1000
    })),
    code: 200
  }
}

/**
 * 专辑详情
 * Alger: /album?id=123456
 * Meting: /api?server=tencent&type=album&id=123456
 */
async function handleAlbumDetail(id, server = 'netease') {
  const data = await callMeting(server, 'album', id)
  
  return {
    album: {
      id: data.id,
      name: data.title,
      picUrl: data.pic,
      artist: data.author?.[0] ? { name: data.author[0] } : { name: '未知' },
      songs: (data.tracks || []).map((song, idx) => ({
        id: song.id,
        name: song.title,
        ar: song.author?.map(a => ({ name: a })) || [],
        dt: song.duration * 1000,
        no: idx + 1
      }))
    },
    code: 200
  }
}

/**
 * 排行榜
 * Alger: /toplist?id=0
 * Meting: /api?server=tencent&type=toplist&id=1
 */
async function handleTopList(id = 1, server = 'netease') {
  const data = await callMeting(server, 'toplist', id)
  
  return {
    list: {
      id: data.id,
      name: data.title,
      coverImgUrl: data.pic,
      tracks: (data.tracks || []).map((song, idx) => ({
        id: song.id,
        name: song.title,
        ar: song.author?.map(a => ({ name: a })) || [],
        al: { name: song.album_title },
        dt: song.duration * 1000,
        no: idx + 1
      }))
    },
    code: 200
  }
}

// 路由映射表 - Alger 路径 -> 处理函数
export const ROUTE_MAP = {
  // 搜索
  '/cloudsearch': handleCloudSearch,
  '/search/hot/detail': handleHotSearch,
  
  // 歌曲
  '/song/detail': handleSongDetail,
  '/song/url': handleSongUrl,
  '/song/url/v1': handleSongUrl, // Alger 有两个版本
  
  // 歌词
  '/lyric': handleLyric,
  
  // 歌单
  '/playlist/detail': handlePlaylistDetail,
  
  // 歌手
  '/artist/songs': handleArtistSongs,
  
  // 专辑
  '/album': handleAlbumDetail,
  
  // 推荐
  '/recommend/songs': handleDailyRecommend,
  
  // 排行榜
  '/toplist': handleTopList,
  '/top/list': handleTopList
}

/**
 * 路由分发
 */
export async function handleAlgerRequest(path, query, env) {
  const METING_API = env.METING_API_URL || METING_BASE
  
  // 解析查询参数
  const params = new URLSearchParams(query)
  
  // 获取平台参数 (Alger 用数字 0-4, Meting 用名称)
  const source = params.get('source') || params.get('server') || '0'
  const server = ALGER_TO_METING[source] || 'netease'
  
  // 查找处理函数
  const handler = ROUTE_MAP[path]
  if (!handler) {
    // 未匹配的路由，直接透传到 Meting
    const url = `${METING_API}/api?${query}`
    const response = await fetch(url)
    return await response.json()
  }
  
  // 调用对应的处理函数
  try {
    return await handler(query, params, server, env)
  } catch (err) {
    console.error(`[Adapter] Error handling ${path}:`, err)
    return { code: 500, msg: err.message }
  }
}

export default { handleAlgerRequest, ROUTE_MAP }