/* 小说阅读器核心逻辑（翻页、朗读、进度管理） */

let books = {};           // 所有书
let currentBook = null;   // 当前书
let currentPage = 0;      // 当前页码
let pageSize = 20;        // 每页段落数
let isSpeaking = false;   // 是否正在朗读
let utterance = null;     // 当前朗读对象
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
  let paragraphs = normalizedText.split('\n');
  
  // 第三步：清理和过滤段落
  paragraphs = paragraphs
    .map(paragraph => {
      // 移除段落前后的空白字符
      paragraph = paragraph.trim();
      
      // 移除段落内部的多个连续空格，保留一个
      paragraph = paragraph.replace(/\s+/g, ' ');
      
      return paragraph;
    })
    .filter(paragraph => {
      // 过滤掉空段落（包括只有空格、制表符的段落）
      return paragraph.length > 0;
    });
  
  // 第四步：进一步处理特殊情况
  // 如果段落以句号、问号、感叹号结尾，且长度超过一定阈值，认为是完整段落
  paragraphs = paragraphs.map(paragraph => {
    // 如果段落太短（少于10个字符），考虑与下一段合并
    if (paragraph.length < 10 && paragraphs.indexOf(paragraph) < paragraphs.length - 1) {
      const nextIndex = paragraphs.indexOf(paragraph) + 1;
      if (nextIndex < paragraphs.length) {
        // 检查当前段落是否以标点符号结尾
        const endsWithPunctuation = /[。！？.!?]$/.test(paragraph);
        if (!endsWithPunctuation) {
          // 不与下一段合并，保持独立段落
          return paragraph;
        }
      }
    }
    return paragraph;
  });
  
  // 重新过滤，确保没有空段落
  return paragraphs.filter(paragraph => paragraph.length > 0);
}

/**
 * 测试段落划分功能
 * 用于验证优化后的段落划分逻辑
 * @param {string} testText - 测试文本
 * @returns {void}
 */
function testParagraphSplitting(testText) {
  console.log('=== 段落划分测试 ===');
  console.log('原始文本:');
  console.log(testText);
  console.log('\n划分结果:');
  
  const paragraphs = splitTextToParas(testText);
  
  paragraphs.forEach((paragraph, index) => {
    console.log(`段落 ${index + 1} (${paragraph.length} 字符): "${paragraph}"`);
  });
  
  console.log(`\n总共划分出 ${paragraphs.length} 个段落`);
  console.log('==================');
}

/**
 * 固定每页显示15行，不再根据窗口大小动态调整
 * 确保分页数量稳定，避免刷新后变化
 */
function calcPageSize() {
  
  // 如果当前页码超出范围，调整到最后一页
  if (currentBook && currentPage >= Math.ceil(currentBook.paras.length / pageSize)) {
    currentPage = Math.max(0, Math.ceil(currentBook.paras.length / pageSize) - 1);
  }
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

  for (let i = start; i < end; i++) {
    const p = document.createElement('p');
    p.textContent = paras[i];
    p.dataset.index = i;
    // 添加点击事件，允许用户从指定段落开始朗读
    p.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡，防止触发viewport的翻页事件
      if (currentBook && isSpeaking) {
        // 停止当前朗读，以便从新位置开始
        window.speechSynthesis.cancel();
        isSpeaking = false;

        // 设置新的朗读起始位置
        currentParagraphIndex = i;
        
        // 调用通用的朗读函数，由它来处理所有状态
        startSpeaking();
      } else if (currentBook) {
        // 非朗读状态下，点击段落则更新阅读进度
        currentParagraphIndex = i;
        highlightCurrentParagraph(currentParagraphIndex);
        saveReadingProgress();
      }
    });
    viewport.appendChild(p);
  }

  // 翻页后，重置滚动条到顶部
  viewport.scrollTop = 0;

  // 更新页码显示，确保总页数计算准确
  const totalPages = Math.ceil(paras.length / pageSize);
  document.getElementById('pageLabel').textContent =
    `第 ${currentPage + 1} / ${totalPages} 页`;

  const progress = Math.floor((end / paras.length) * 100);
  document.getElementById('bookProgress').textContent = `进度：${progress}%`;

  if (shouldSaveProgress) {
    // 只有在没有段落进度或当前页不包含保存的段落时，才重置到页面开始
    if (!currentBook.progress || 
        currentBook.progress.page !== currentPage ||
        currentBook.progress.paraIndex < start ||
        currentBook.progress.paraIndex >= end) {
      currentBook.progress = { page: currentPage, paraIndex: start };
    }
    
    saveBook(currentBook).then(() => {
      localStorage.setItem(META_KEY, JSON.stringify({ lastBookId: currentBook.id }));
    });
  }
  
  // 如果在朗读中，重新高亮当前段落
  if (isSpeaking && currentParagraphIndex >= start && currentParagraphIndex < end) {
    highlightCurrentParagraph(currentParagraphIndex);
  }
}

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
 * 高亮显示搜索结果中的关键词
 * @param {string} text - 原始文本
 * @param {string} query - 搜索关键词
 * @returns {string} - 包含高亮标签的HTML字符串
 */
function highlightSearchTerm(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
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
    } else if (response.status !== 200) {
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
  
  // 保存到数据库（异步，不阻塞朗读流程）
  saveBook(currentBook).then(() => {
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
  const voices = window.speechSynthesis.getVoices();
  return voices.length > 0 && window.speechSynthesis;
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

/**
 * 朗读下一段文本
 * 创建语音合成对象，设置语速和音色
 * 自动翻页并继续朗读下一段，直到文本结束
 * 实时保存朗读进度到数据库并高亮当前段落
 */
function speakNextParagraph() {
  if (!currentBook) return;

  const paras = currentBook.paras;
  if (currentParagraphIndex >= paras.length) {
    isSpeaking = false;
    // 朗读完成时保存最终进度
    saveReadingProgress();
    // 清除高亮
    const viewport = document.getElementById('viewport');
    const prevHighlighted = viewport.querySelector('.speaking-paragraph');
    if (prevHighlighted) {
      prevHighlighted.classList.remove('speaking-paragraph');
    }
    return;
  }

  const text = paras[currentParagraphIndex];
  utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = parseFloat(document.getElementById('rate').value);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onstart = () => {
    // 开始朗读时高亮当前段落
    highlightCurrentParagraph(currentParagraphIndex);
  };

  utterance.onend = () => {
    currentParagraphIndex++;
    const pageIndex = Math.floor(currentParagraphIndex / pageSize);
    if (pageIndex !== currentPage) {
      currentPage = pageIndex;
      renderPage();
    } else {
      // 在同一页内只保存进度，不重新渲染页面
      saveReadingProgress();
    }
    
    if (isSpeaking) {
      speakNextParagraph();
    } else {
      updateSpeakButton();
    }
  };

  // 开始朗读时保存进度和高亮
  saveReadingProgress();
  highlightCurrentParagraph(currentParagraphIndex);
  
  isSpeaking = true;
  window.speechSynthesis.speak(utterance);
}

/**
 * 更新朗读按钮的显示状态
 * 根据isSpeaking状态更新按钮文字和样式，同时控制音频控制元素的显示
 */
function updateSpeakButton() {
  const btnSpeak = document.getElementById('btnSpeak');
  const speechControls = document.querySelector('.speech-controls');
  
  if (isSpeaking) {
    btnSpeak.textContent = '暂停';
    btnSpeak.classList.add('speaking');
    speechControls.classList.add('speaking');
  } else {
    btnSpeak.textContent = '朗读';
    btnSpeak.classList.remove('speaking');
    speechControls.classList.remove('speaking');
  }
}

/**
 * 开始或停止朗读功能
 * 如果在朗读，则停止；如果已停止，则开始朗读。
 */
function startSpeaking() {
  if (!currentBook) return;

  // 如果语音正在活动（包括朗读或暂停状态），则停止
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    saveReadingProgress(); // 停止时保存进度
    updateSpeakButton();
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
   
  // 确保开始前状态干净
  window.speechSynthesis.cancel();
   
  // 设置为朗读状态
  isSpeaking = true;
  updateSpeakButton();

  // Directly call speakNextParagraph without delay
  if (isSpeaking) {
    speakNextParagraph();
  }
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
    document.body.style.overflow = 'visible';
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
  window.speechSynthesis.cancel();
  isSpeaking = false;
  
  currentBook = book;
  
  // 设置固定页面大小
  calcPageSize();
  
  // 保存上次阅读位置信息，用于后续高亮显示
  const savedProgress = book.progress;
  let targetParaIndex = -1;
  
  // 恢复阅读进度
  if (savedProgress && savedProgress.paraIndex !== undefined) {
    // 基于段落索引计算页面位置
    currentPage = Math.floor(savedProgress.paraIndex / pageSize);
    currentParagraphIndex = savedProgress.paraIndex;
    targetParaIndex = savedProgress.paraIndex;
  } else {
    // 使用保存的页面位置或默认第一页
    currentPage = book.progress?.page || 0;
    currentParagraphIndex = book.progress?.paraIndex || 0;
    targetParaIndex = book.progress?.paraIndex || 0;
  }

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
  if (targetParaIndex >= 0 && targetParaIndex < book.paras.length) {
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
  window.dispatchEvent(new CustomEvent('bookdeleted'));
}
