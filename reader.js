/* 小说阅读器核心逻辑（翻页、朗读、进度管理） */

let currentBook = null;   // 当前书
let currentPage = 0;      // 当前页码
let pageSize = 20;        // 每页段落数
let isSpeaking = false;   // 是否正在朗读
let currentParagraphIndex = 0; // 朗读到的段落索引
let voices = [];          // 可用音色列表
let selectedVoice = null; // 当前选择的音色

const META_KEY = 'NovelReaderMeta'; // 保存上次阅读信息

// ---------------- 文本处理 ----------------
/**
 * 将文本按段落分割
 * 优化逻辑：出现回车就识别为新段落，删除空段落
 * 处理各种换行符格式，智能识别段落边界
 * @param {string} text - 需要分割的完整文本
 * @returns {Array<string>} 返回段落数组，每个元素是一个段落文本
 */
function splitTextToParas(text) {
  // 第一步：统一换行符格式
  let normalizedText = text
    .replace(/\r\n/g, '\n')  // Windows换行符
    .replace(/\r/g, '\n');   // Mac换行符

  // 第二步：按回车分割，每个回车都作为段落边界
  // 第三步：清理和过滤段落（去首尾空白、压缩连续空格、过滤空段落）
  return normalizedText
    .split('\n')
    .map(paragraph => paragraph.trim().replace(/\s+/g, ' '))
    .filter(paragraph => paragraph.length > 0);
}


/**
 * 渲染当前页面内容
 * 根据当前页码和页面大小显示对应段落
 * 更新页码标签、进度条和保存阅读进度
 * 如果在朗读中，保持当前段落的亮显状态
 */
function renderPage(shouldSaveProgress = true) {
  if (!currentBook) return;
  
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = '';

  const paras = currentBook.paras || [];
  const start = currentPage * pageSize;
  const end = Math.min(paras.length, start + pageSize);

  // 用 DocumentFragment 批量插入，减少回流；段落点击由 viewport 统一委托
  const frag = document.createDocumentFragment();
  for (let i = start; i < end; i++) {
    const p = document.createElement('p');
    p.textContent = paras[i];
    p.dataset.index = i;
    frag.appendChild(p);
  }
  viewport.appendChild(frag);

  // 翻页后，重置滚动条到顶部
  viewport.scrollTop = 0;

  // 更新页码显示，确保总页数计算准确；输入框聚焦时不覆盖用户正在输入的内容
  const totalPages = Math.ceil(paras.length / pageSize);
  const pageInput = document.getElementById('pageInput');
  if (pageInput && document.activeElement !== pageInput) {
    pageInput.value = currentPage + 1;
    pageInput.max = totalPages;
  }
  document.getElementById('pageTotal').textContent = totalPages;

  const progress = paras.length === 0 ? 0 : Math.floor((end / paras.length) * 100);
  document.getElementById('bookProgress').textContent = `进度：${progress}%`;

  if (shouldSaveProgress) {
    // 只有在没有段落进度或当前页不包含保存的段落时，才重置到页面开始
    if (!currentBook.progress || 
        currentBook.progress.page !== currentPage ||
        currentBook.progress.paraIndex < start ||
        currentBook.progress.paraIndex >= end) {
      currentBook.progress = { page: currentPage, paraIndex: start };
    }
    
    saveProgress(currentBook.id, currentBook.progress).then(() => {
      localStorage.setItem(META_KEY, JSON.stringify({ lastBookId: currentBook.id }));
    }).catch(err => {
      console.warn('保存阅读进度失败:', err);
    });
  }
  
  // 当前段落落在本页时保持高亮（朗读中或点击选中后翻页都适用）
  if (currentParagraphIndex >= start && currentParagraphIndex < end) {
    highlightCurrentParagraph(currentParagraphIndex);
  }
}

/**
 * 段落点击统一委托到 viewport，避免每次渲染重复绑定监听器
 * 朗读中点击段落则从该段落重新朗读；非朗读状态点击则更新阅读进度
 * 注意：脚本位于 body 末尾，此处 DOM 已就绪；移动端翻页点击会跳过段落（见 main.js）
 */
document.getElementById('viewport').addEventListener('click', (e) => {
  const p = e.target.closest('p[data-index]');
  if (!p || !currentBook) return;
  const index = parseInt(p.dataset.index, 10);

  if (isSpeaking) {
    // 停止当前朗读，以便从新位置开始
    stopSpeaking();
    currentParagraphIndex = index;
    startSpeaking();
  } else {
    // 非朗读状态下，点击段落则更新阅读进度
    currentParagraphIndex = index;
    highlightCurrentParagraph(index);
    saveReadingProgress();
  }
});

/**
 * 翻到下一页
 * 检查是否到达最后一页，如果未到达则增加页码并重新渲染
 * 朗读时自动跟随到下一页
 */
function animatePageTurn(direction, shouldSaveProgress = true) {
    const viewport = document.getElementById('viewport');
    const animationDuration = 150; // Must match CSS animation time in ms

    if (viewport.dataset.animating === 'true') return;
    viewport.dataset.animating = 'true';

    viewport.classList.add('animating-out');

    setTimeout(() => {
        if (direction === 'next') {
            currentPage++;
        } else {
            currentPage--;
        }
        renderPage(shouldSaveProgress); // Update content while invisible

        viewport.classList.remove('animating-out');
        viewport.classList.add('animating-in');

        setTimeout(() => {
            viewport.classList.remove('animating-in');
            viewport.dataset.animating = 'false';
        }, animationDuration);

    }, animationDuration);
}

function nextPage() {
  if (!currentBook) return;
  const maxPage = Math.ceil(currentBook.paras.length / pageSize) - 1;
  if (currentPage < maxPage) {
    animatePageTurn('next', !isSpeaking);
  }
}

function prevPage() {
  if (!currentBook) return;
  if (currentPage > 0) {
    animatePageTurn('prev', !isSpeaking);
  }
}

// ---------------- 搜索功能 ----------------
/**
 * 在当前书籍中搜索关键词
 * @param {string} query - 搜索关键词
 * @returns {Array<{index: number, text: string}>} - 匹配的段落列表，包含索引和文本
 */
function searchInBook(query) {
  if (!currentBook || !query) return [];

  const results = [];
  const lowerCaseQuery = query.toLowerCase();

  currentBook.paras.forEach((p, index) => {
    if (p.toLowerCase().includes(lowerCaseQuery)) {
      results.push({ index, text: p });
    }
  });

  return results;
}

/**
 * 转义正则表达式中的特殊字符
 * @param {string} s - 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 转义 HTML 特殊字符，防止内容被当作 HTML 解析
 * @param {string} s - 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * 高亮显示搜索结果中的关键词
 * 文本与关键词均先转义，避免 XSS 与正则注入
 * @param {string} text - 原始文本
 * @param {string} query - 搜索关键词
 * @returns {string} - 包含高亮标签的HTML字符串
 */
function highlightSearchTerm(text, query) {
  const safeText = escapeHtml(text);
  if (!query) return safeText;
  const regex = new RegExp(`(${escapeRegExp(escapeHtml(query))})`, 'gi');
  return safeText.replace(regex, '<span class="highlight">$1</span>');
}

// ---------------- 朗读功能 ----------------


let syncTimeout;

/**
 * 同步书籍内容到远程服务器
 * @param {Object} book - 书籍对象
 * @param {Object} settings - 同步设置
 */
async function syncBookContent(book, settings) {
  try {
    const response = await fetch(`${settings.syncUrl}/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.syncToken}`,
      },
      body: JSON.stringify({
        bookId: book.id,
        content: book.text,
      }),
    });

    if (response.ok) {
      book.synced = true;
      await saveBook(book);
    } else {
      console.error('同步书籍内容失败:', response.statusText);
    }
  } catch (error) {
    console.error('同步书籍内容请求失败:', error);
  }
}

/**
 * 获取并应用同步的阅读进度
 * @param {Object} book - 书籍对象
 */
async function fetchAndApplySyncProgress(book) {
  console.log('Fetching and applying sync progress for book:', book.id);
  const settings = await getSyncSettings();
  if (!settings || !settings.syncUrl) {
    console.log('Sync settings not found. Aborting sync.');
    return;
  }

  console.log('Sync settings found:', settings);
  try {
    const url = `${settings.syncUrl}/sync/${book.id}`;
    console.log('Fetching from URL:', url);
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${settings.syncToken}`,
      },
    });

    console.log('Fetch response:', response);

    if (response.ok) {
      const data = await response.json();
      console.log('Sync data received:', data);
      if (data.progress) {
        const remoteProgress = data.progress;
        const localProgress = book.progress || { page: 0, paraIndex: 0 };

        if (remoteProgress.paraIndex > localProgress.paraIndex) {
          if (confirm(`检测到云端有新的阅读进度 (第${remoteProgress.page + 1}页)，是否同步？`)) {
            currentPage = remoteProgress.page;
            currentParagraphIndex = remoteProgress.paraIndex;
            renderPage();
            setTimeout(() => {
              highlightCurrentParagraph(currentParagraphIndex);
            }, 100);
          }
        }
      }
    } else {
      alert('获取同步进度失败，请检查网络或服务器状态。');
      console.error('获取同步进度失败:', response.statusText);
    }
  } catch (error) {
    alert('获取同步进度失败，请检查网络或服务器状态。');
    console.error('获取同步进度请求失败:', error);
  }
}

/**
 * 同步阅读进度到远程服务器
 */
async function syncReadingProgress() {
  const settings = await getSyncSettings();
  if (!settings || !settings.syncUrl) {
    return;
  }

  if (!currentBook) return;

  if (!currentBook.synced) {
    await syncBookContent(currentBook, settings);
  }

  try {
    const response = await fetch(`${settings.syncUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.syncToken}`,
      },
      body: JSON.stringify({
        bookId: currentBook.id,
        progress: {
          page: currentPage,
          paraIndex: currentParagraphIndex,
        },
      }),
    });

    if (!response.ok) {
      console.error('同步失败:', response.statusText);
    }
  } catch (error) {
    console.error('同步请求失败:', error);
  }
}

/**
 * 保存当前阅读进度到数据库
 * 包括当前页码和朗读到的段落索引
 * 使用防抖机制避免频繁保存影响性能
 */
function saveReadingProgress() {
  if (!currentBook) return;
  
  // 更新当前书籍的进度信息
  currentBook.progress = { 
    page: currentPage, 
    paraIndex: currentParagraphIndex 
  };
  
  // 进度独立存储（异步，不阻塞朗读流程），避免整本书反复写入
  saveProgress(currentBook.id, currentBook.progress).then(() => {
    localStorage.setItem(META_KEY, JSON.stringify({ lastBookId: currentBook.id }));

    // 如果开启了同步，则触发同步
    if (document.getElementById('btnToggleSync').classList.contains('active')) {
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(syncReadingProgress, 3000); // 3秒防抖
    }
  }).catch(err => {
    console.warn('保存阅读进度失败:', err);
  });
}

/**
 * 检查语音合成系统是否准备就绪
 * 确保voices已加载且有可用音色
 * @returns {boolean} 语音合成是否可用
 */
function isSpeechSynthesisReady() {
  return Boolean(window.speechSynthesis) && window.speechSynthesis.getVoices().length > 0;
}
/**
 * 高亮显示当前朗读的段落
 * 移除之前的高亮，为当前段落添加高亮样式
 * @param {number} index - 要高亮显示的段落索引
 */
function highlightCurrentParagraph(index) {
  const viewport = document.getElementById('viewport');
  
  // 移除之前的高亮
  const prevHighlighted = viewport.querySelector('.speaking-paragraph');
  if (prevHighlighted) {
    prevHighlighted.classList.remove('speaking-paragraph');
  }

  // 翻到正在朗读的页码
  const pageIndex = Math.floor(index / pageSize);
  if (pageIndex !== currentPage) {
    currentPage = pageIndex;
    renderPage();
  }
  
  // 高亮当前段落
  const currentParagraph = viewport.querySelector(`[data-index="${index}"]`);
  if (currentParagraph) {
    currentParagraph.classList.add('speaking-paragraph');

    const viewportRect = viewport.getBoundingClientRect();
    const pRect = currentParagraph.getBoundingClientRect();

    // 如果段落不在视口可见区域内，则滚动
    if (pRect.top < viewportRect.top || pRect.bottom > viewportRect.bottom) {
        // 计算滚动量，将段落居中
        const desiredPTop = (viewportRect.height / 2) - (pRect.height / 2);
        const currentPTop = pRect.top - viewportRect.top;
        const scrollAmount = currentPTop - desiredPTop;

        viewport.scrollBy({
            top: scrollAmount,
            behavior: 'smooth'
        });
    }
  }
}

// ---------------- 朗读状态与配置 ----------------

/**
 * 是否为 Android 平台：Android 上 pause() 实际会 cancel() 掉朗读，需跳过保活与暂停逻辑
 */
const IS_ANDROID = /Android/i.test(navigator.userAgent);

/**
 * 是否支持真正的暂停/续播（桌面浏览器支持，Android 不支持）
 */
const SUPPORTS_PAUSE = !IS_ANDROID;

/**
 * 是否支持 onboundary 事件（驱动段落级高亮；部分平台/音色不触发，需时间估算兜底）
 */
const SUPPORTS_BOUNDARY = !IS_ANDROID;

/**
 * 队列中最多保留的语音块数量：当前在播块 + 预读块，双块预读压缩块间空档
 */
const MAX_SPEAK_QUEUE = 2;

/**
 * 每一条语音最多合并的字符数
 * 把连续多段合并成"一条"语音连续播报，减少 utterance 边界数量，从而消除段间空档
 * 数值越大段间停顿越少，但单条时长越长、越依赖下方的长文本保活，可按需调整
 */
const SPEAK_CHUNK_CHARS = 200;

let isPaused = false;            // 是否处于暂停状态
let activeChunk = null;          // 当前正在播放的语音块
let speakSessionId = 0;          // 朗读会话标识，防止旧定时器污染新会话
let boundaryTimer = null;        // onboundary 兜底定时器
let boundaryTickIndex = -1;      // 兜底模式下已处理到的段落下标
let keepAliveTimer = null;       // Chrome 长文本保活定时器
let watchdogTimer = null;        // 语音块播放看门狗

/**
 * 已排入语音队列的最后一段的段落索引
 * 用于朗读过程中持续预读下一条语音块，避免重复入队
 */
let queuedChunkEndPara = -1;

/**
 * 启动长文本保活
 * Chrome 桌面版连续朗读约 15 秒后会自动中断，通过周期性 pause/resume 规避
 */
function startKeepAlive() {
  if (IS_ANDROID) return;
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    // 暂停状态下不续播，避免被保活打断
    if (isSpeaking && !isPaused && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);
}

/**
 * 停止长文本保活
 */
function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/**
 * 估算语速对应的每秒字符数（粗略值，用于时间兜底与看门狗）
 * @returns {number} 每秒约朗读的字符数
 */
function getCharsPerSecond() {
  const rate = parseFloat(document.getElementById('rate').value) || 1.0;
  return 5.0 * rate;
}

/**
 * 停止 onboundary 时间兜底定时器
 */
function stopBoundaryFallback() {
  if (boundaryTimer) {
    clearTimeout(boundaryTimer);
    boundaryTimer = null;
  }
}

/**
 * 按段落进入当前语音块的顺序，依次调度高亮推进
 * @param {Object} chunk - 语音块
 * @param {number} sessionId - 会话标识
 * @param {number} offsetIndex - chunk.offsets 中的下标
 */
function scheduleParagraphTick(chunk, sessionId, offsetIndex) {
  const o = chunk.offsets[offsetIndex];
  const paraIndex = o.paraIndex;

  // 段落变化时更新高亮与进度
  if (paraIndex !== currentParagraphIndex) {
    currentParagraphIndex = paraIndex;
    highlightCurrentParagraph(paraIndex);
    saveReadingProgress();
  }

  boundaryTickIndex = offsetIndex;
  const nextIndex = offsetIndex + 1;
  if (nextIndex >= chunk.offsets.length) return;

  const nextO = chunk.offsets[nextIndex];
  const chars = nextO.charIndex - o.charIndex;
  const delay = Math.max(120, (chars / getCharsPerSecond()) * 1000);
  boundaryTimer = setTimeout(() => {
    if (isSpeaking && !isPaused && activeChunk === chunk && speakSessionId === sessionId) {
      scheduleParagraphTick(chunk, sessionId, nextIndex);
    }
  }, delay);
}

/**
 * 启动 onboundary 兜底：先短延迟探测事件是否可用，不可用则按时间估算推进高亮
 * @param {Object} chunk - 当前语音块
 * @param {number} sessionId - 会话标识
 */
function startBoundaryFallback(chunk, sessionId) {
  stopBoundaryFallback();
  boundaryTickIndex = -1;
  if (SUPPORTS_BOUNDARY) return;
  if (!chunk || chunk.offsets.length <= 1) return;

  // 给真实 onboundary 一个优先机会；若 400ms 内没触发，则按时间估算推进
  boundaryTimer = setTimeout(() => {
    if (boundaryTickIndex >= 0) return;
    if (isSpeaking && !isPaused && activeChunk === chunk && speakSessionId === sessionId) {
      scheduleParagraphTick(chunk, sessionId, 0);
    }
  }, 400);
}

/**
 * 暂停看门狗定时器
 */
function stopWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

/**
 * 为当前语音块启动看门狗：在预估时长 + 宽限内若无 onend，强制跳下一块，防止卡死
 * @param {Object} chunk - 当前语音块
 * @param {number} sessionId - 会话标识
 */
function startWatchdog(chunk, sessionId) {
  stopWatchdog();
  const estimated = (chunk.text.length / getCharsPerSecond()) * 1000;
  const timeout = estimated + 4000;
  watchdogTimer = setTimeout(() => {
    if (isSpeaking && !isPaused && activeChunk === chunk && speakSessionId === sessionId) {
      console.warn('语音块超时未结束，强制跳下一块');
      advanceAfterChunk(chunk);
    }
  }, timeout);
}

/**
 * 从指定段落开始，向后合并若干段，构建一条用于连续朗读的文本
 * @param {number} startIndex - 起始段落索引
 * @returns {{text: string, startIndex: number, endIndex: number, offsets: Array<{charIndex: number, paraIndex: number}>}}
 */
function buildSpeakChunk(startIndex) {
  const paras = currentBook.paras;
  const parts = [];
  const offsets = [];
  let pos = 0;
  let i = startIndex;

  // 段落之间用换行分隔，既保留自然停顿，又便于把字符位置映射回段落
  while (i < paras.length && (parts.length === 0 || pos + paras[i].length <= SPEAK_CHUNK_CHARS)) {
    offsets.push({ charIndex: pos, paraIndex: i });
    parts.push(paras[i]);
    pos += paras[i].length + 1; // +1 为分隔符长度
    i++;
  }

  return { text: parts.join('\n'), startIndex, endIndex: i - 1, offsets };
}

/**
 * 根据朗读到的字符位置定位所属段落
 * @param {Object} chunk - 语音块
 * @param {number} charIndex - onboundary 事件给出的字符位置
 * @returns {number} 段落索引
 */
function resolveParaIndex(chunk, charIndex) {
  let result = chunk.startIndex;
  for (const o of chunk.offsets) {
    if (o.charIndex <= charIndex) {
      result = o.paraIndex;
    } else {
      break;
    }
  }
  return result;
}

/**
 * 补齐语音队列，使队列中始终保持 MAX_SPEAK_QUEUE 条语音块
 * @param {Object} currentChunk - 当前正在播放的语音块
 */
function ensureQueue(currentChunk) {
  if (!currentBook) return;
  let enqueued = Math.max(0, queuedChunkEndPara - currentChunk.endIndex);
  while (enqueued < MAX_SPEAK_QUEUE && queuedChunkEndPara < currentBook.paras.length - 1) {
    enqueueChunk(queuedChunkEndPara + 1);
    enqueued++;
  }
}

/**
 * 当前语音块结束/出错后的通用推进逻辑：停止看门狗与兜底，播放下一块或收尾
 * @param {Object} chunk - 刚结束或出错的语音块
 */
function advanceAfterChunk(chunk) {
  stopWatchdog();
  stopBoundaryFallback();

  if (chunk.endIndex >= currentBook.paras.length - 1) {
    finishSpeaking();
    return;
  }

  // 队列里已有下一块时浏览器会自动续播；否则补入队
  if (queuedChunkEndPara <= chunk.endIndex) {
    enqueueChunk(chunk.endIndex + 1);
  }
}

/**
 * 入队一条语音块
 * 多条合并后播报，段间不再有合成启动空档；由 onboundary 驱动段落级高亮与进度
 * @param {number} startIndex - 该语音块的起始段落索引
 */
function enqueueChunk(startIndex) {
  if (!currentBook || startIndex < 0 || startIndex >= currentBook.paras.length) return;

  const chunk = buildSpeakChunk(startIndex);
  const u = new SpeechSynthesisUtterance(chunk.text);
  u.rate = parseFloat(document.getElementById('rate').value);
  if (selectedVoice) {
    u.voice = selectedVoice;
  }

  u.onstart = () => {
    if (!isSpeaking) return;
    activeChunk = chunk;
    currentParagraphIndex = chunk.startIndex;
    highlightCurrentParagraph(chunk.startIndex);
    saveReadingProgress();
    startKeepAlive();
    startBoundaryFallback(chunk, speakSessionId);
    startWatchdog(chunk, speakSessionId);
    // 播放期间把队列补齐到 MAX_SPEAK_QUEUE 块，保证块间无缝
    ensureQueue(chunk);
  };

  u.onboundary = (e) => {
    if (!isSpeaking) return;
    boundaryTickIndex = 0; // 标记真实 onboundary 已生效，停止时间兜底
    const paraIndex = resolveParaIndex(chunk, e.charIndex);
    if (paraIndex !== currentParagraphIndex) {
      currentParagraphIndex = paraIndex;
      highlightCurrentParagraph(paraIndex);
      saveReadingProgress();
    }
  };

  u.onend = () => {
    if (!isSpeaking) return;
    advanceAfterChunk(chunk);
  };

  u.onerror = (e) => {
    if (!isSpeaking) return;
    console.warn('语音块播放出错:', e && e.error);
    // 无论何种错误都继续推进队列，避免朗读卡死
    advanceAfterChunk(chunk);
  };

  queuedChunkEndPara = Math.max(queuedChunkEndPara, chunk.endIndex);
  window.speechSynthesis.speak(u);
}

/**
 * 停止朗读并复位所有状态与定时器
 */
function stopSpeaking() {
  speakSessionId++;
  window.speechSynthesis.cancel();
  stopKeepAlive();
  stopBoundaryFallback();
  stopWatchdog();
  activeChunk = null;
  isSpeaking = false;
  isPaused = false;
  saveReadingProgress();
  updateSpeakButton();
}

/**
 * 朗读自然结束时的收尾：复位状态、保存进度、清除高亮、停止保活
 */
function finishSpeaking() {
  isSpeaking = false;
  isPaused = false;
  activeChunk = null;
  stopKeepAlive();
  stopBoundaryFallback();
  stopWatchdog();
  currentParagraphIndex = currentBook.paras.length;
  saveReadingProgress();

  const viewport = document.getElementById('viewport');
  const prevHighlighted = viewport.querySelector('.speaking-paragraph');
  if (prevHighlighted) {
    prevHighlighted.classList.remove('speaking-paragraph');
  }

  updateSpeakButton();
}

let btnSpeakEl = null;
let speechControlsEl = null;

/**
 * 更新朗读按钮的显示状态
 * 根据isSpeaking/isPaused状态更新按钮文字和样式，同时控制音频控制元素的显示
 */
function updateSpeakButton() {
  if (!btnSpeakEl) {
    btnSpeakEl = document.getElementById('btnSpeak');
    speechControlsEl = document.querySelector('.speech-controls');
  }

  if (isPaused) {
    btnSpeakEl.textContent = '继续';
    btnSpeakEl.classList.add('speaking');
    speechControlsEl.classList.add('speaking');
  } else if (isSpeaking) {
    btnSpeakEl.textContent = '暂停';
    btnSpeakEl.classList.add('speaking');
    speechControlsEl.classList.add('speaking');
  } else {
    btnSpeakEl.textContent = '朗读';
    btnSpeakEl.classList.remove('speaking');
    speechControlsEl.classList.remove('speaking');
  }
}

/**
 * 开始/暂停/继续朗读
 * 桌面浏览器支持真正的暂停/续播；Android 上 pause 会中断朗读，降级为停止/重新开始
 */
function startSpeaking() {
  if (!currentBook) return;

  // 暂停状态下点击：继续播放，并重启看门狗（暂停期间触发后已失效）
  if (isPaused && SUPPORTS_PAUSE) {
    window.speechSynthesis.resume();
    isPaused = false;
    if (activeChunk) {
      startWatchdog(activeChunk, speakSessionId);
    }
    updateSpeakButton();
    return;
  }

  // 正在朗读且支持暂停：暂停
  if (window.speechSynthesis.speaking && !isPaused && SUPPORTS_PAUSE) {
    window.speechSynthesis.pause();
    isPaused = true;
    updateSpeakButton();
    return;
  }

  // 正在朗读但不支持暂停（Android）：停止
  if (window.speechSynthesis.speaking) {
    stopSpeaking();
    return;
  }

  // --- 以下是开始新朗读的逻辑 ---

  // 朗读时，将阅读器标题滚动到视野内，最大化阅读区域
  const readerHeader = document.querySelector('.reader-header');
  if (readerHeader) {
    readerHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 检查语音合成系统是否就绪
  if (!isSpeechSynthesisReady()) {
    console.warn('语音合成系统未就绪，尝试重新加载音色...');
    loadVoices(); // 尝试加载音色
    // 短暂延迟后重试
    setTimeout(() => {
      if (isSpeechSynthesisReady()) {
        startSpeaking(); // 再次尝试开始
      } else {
        alert('语音功能加载失败，请刷新页面或更换浏览器重试。');
      }
    }, 500);
    return;
  }

  // 已读到结尾时从头开始朗读，避免按钮看似无响应
  if (currentParagraphIndex >= currentBook.paras.length) {
    currentParagraphIndex = 0;
    currentPage = 0;
    renderPage();
  }

  // 确保开始前状态干净，并开启新会话
  stopSpeaking();

  // 设置为朗读状态
  isSpeaking = true;
  isPaused = false;
  updateSpeakButton();

  // 入队当前语音块并预读下一条，合并多段连续播报，减少跨段空档
  queuedChunkEndPara = currentParagraphIndex - 1;
  enqueueChunk(currentParagraphIndex);
  ensureQueue({ endIndex: queuedChunkEndPara });
}

/**
 * 切换全屏阅读模式
 * 在全屏和普通模式之间切换，最大化阅读区域
 */
function toggleFullscreen() {
  const reader = document.getElementById('reader');
  if (reader.classList.contains('fullscreen')) {
    reader.classList.remove('fullscreen');
    document.body.style.removeProperty("overflow");
  } else {
    reader.classList.add('fullscreen');
    document.body.style.overflow = 'hidden'; // 全屏时禁止背景滚动
  }
}

// ---------------- 音色管理 ----------------
/**
 * 加载可用的语音合成音色
 * 获取系统支持的语音列表，并根据过滤条件筛选
 * 更新音色选择下拉框并自动选择第一个匹配的音色
 * @param {string} filter - 可选的过滤字符串，用于筛选音色名称或语言
 */
function loadVoices(filter = '') {
  voices = speechSynthesis.getVoices();
  const voiceSelect = document.getElementById('voiceSelect');
  
  // 优先使用本地存储的音色选择，回退到当前选择的音色
  const savedVoiceName = localStorage.getItem('selectedVoiceName');
  const currentVoiceName = savedVoiceName || (selectedVoice ? selectedVoice.name : null);
  
  voiceSelect.innerHTML = '';

  const f = filter.toLowerCase();
  const filtered = voices.filter(v =>
    v.name.toLowerCase().includes(f) || (v.lang && v.lang.toLowerCase().includes(f))
  );

  let selectedIndex = -1;
  filtered.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
    
    // 如果找到了之前选中的音色，记录其索引
    if (currentVoiceName && v.name === currentVoiceName) {
      selectedIndex = i;
    }
  });

  // 如果有之前选中的音色且仍然存在，保持选择；否则选择第一个
  if (selectedIndex >= 0) {
    voiceSelect.selectedIndex = selectedIndex;
    selectedVoice = filtered[selectedIndex];
  } else if (filtered.length > 0) {
    // 尝试查找中文音色作为默认值
    const chineseVoice = filtered.find(v => v.lang.toLowerCase().includes('zh'));
    if (chineseVoice) {
      selectedVoice = chineseVoice;
      voiceSelect.selectedIndex = filtered.indexOf(chineseVoice);
    } else {
      selectedVoice = filtered[0];
    }
    // 保存默认选择
    localStorage.setItem('selectedVoiceName', selectedVoice.name);
  }
}

// ---------------- 打开/加载书 ----------------

/**
 * 从书名中移除文件扩展名
 * @param {Object} book - 书籍对象
 * @returns {string} - 清理后的书名
 */
function getCleanBookName(book) {
    if (!book || !book.name) return "";
    const lastDotIndex = book.name.lastIndexOf('.');
    if (lastDotIndex > 0) { // 大于0以避免处理像.bashrc这样的隐藏文件
        return book.name.substring(0, lastDotIndex);
    }
    return book.name;
}

/**
 * 打开并显示指定书籍
 * 设置当前书籍和页码，更新UI显示，隐藏文件选择区域
 * 触发页面渲染显示书籍内容，自动高亮上次阅读位置
 * @param {Object} book - 书籍对象，包含文本、段落等信息
 */
async function openBook(book) {
  // 清理之前的朗读状态
  stopSpeaking();

  currentBook = book;

  // 恢复阅读进度：优先取独立存储的进度，兼容旧版内嵌在书籍对象中的进度
  const savedProgress = (await getProgress(book.id)) || book.progress;
  const targetParaIndex = savedProgress?.paraIndex || 0;
  currentParagraphIndex = targetParaIndex;
  currentPage = Math.floor(targetParaIndex / pageSize);

  const cleanBookName = getCleanBookName(book);
  document.title = cleanBookName + ' - 小说阅读器';
  document.getElementById('bookTitle').textContent = cleanBookName;
  document.getElementById('reader').classList.remove('hidden');
  document.getElementById('dropzone').classList.add('hidden');
  document.getElementById('btnToggleSearch').style.display = 'inline-flex';

  // 初始化朗读按钮状态
  updateSpeakButton();

  // 渲染页面
  renderPage();

  // 设置媒体会话，用于系统级播放控制
  
  // 延迟高亮上次阅读位置，确保页面渲染完成
  if (targetParaIndex < book.paras.length) {
    setTimeout(() => {
      highlightCurrentParagraph(currentParagraphIndex);
    }, 100);
  }
}

/**
 * 解析文本文件内容
 * 读取文件内容并按段落分割，构建书籍对象
 * @param {File} file - 要解析的文本文件对象
 * @returns {Promise<Object>} 返回包含书籍信息的对象Promise
 */
function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      const paras = splitTextToParas(text);
      resolve({ id: file.name, name: file.name, text, paras, progress: {}, synced: false });
    };
    reader.onerror = e => reject(e);
    reader.readAsText(file, 'utf-8');
  });
}

// ---------------- 书籍列表 ----------------
/**
 * 从数据库中删除指定书籍
 * @param {string} id - 要删除的书籍ID
 * @returns {Promise<void>} 删除完成的Promise
 */
async function deleteBookAndNotify(id) {
  await deleteBook(id);
  await deleteProgress(id);
  window.dispatchEvent(new CustomEvent('bookdeleted'));
}
