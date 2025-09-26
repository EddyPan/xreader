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
function renderPage() {
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
    p.addEventListener('click', () => {
      if (currentBook) {
        // 停止当前朗读
        window.speechSynthesis.cancel();
        isSpeaking = false;
        
        // 设置新的朗读起始位置
        currentParagraphIndex = i;
        
        // 如果点击的是当前页的其他段落，直接开始朗读
        if (Math.floor(i / pageSize) === currentPage) {
          isSpeaking = true;  // 设置朗读状态为true
          updateSpeakButton();
          speakNextParagraph();
        } else {
          // 如果点击的是其他页的段落，先切换到对应页面
          currentPage = Math.floor(i / pageSize);
          renderPage();
          // 页面切换完成后开始朗读
          setTimeout(() => {
            isSpeaking = true;  // 设置朗读状态为true
            updateSpeakButton();
            speakNextParagraph();
          }, 100);
        }
      }
    });
    viewport.appendChild(p);
  }

  // 更新页码显示，确保总页数计算准确
  const totalPages = Math.ceil(paras.length / pageSize);
  document.getElementById('pageLabel').textContent =
    `第 ${currentPage + 1} / ${totalPages} 页`;

  const progress = Math.floor((end / paras.length) * 100);
  document.getElementById('bookProgress').textContent = `进度：${progress}%`;

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
function nextPage() {
  if (!currentBook) return;
  const maxPage = Math.ceil(currentBook.paras.length / pageSize) - 1;
  if (currentPage < maxPage) {
    currentPage++;
    renderPage();
  }
}

/**
 * 翻到上一页
 * 检查是否到达第一页，如果未到达则减少页码并重新渲染
 * 朗读状态下自动跟随到上一页
 */
function prevPage() {
  if (!currentBook) return;
  if (currentPage > 0) {
    currentPage--;
    renderPage();

  }
}

// ---------------- 朗读功能 ----------------

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
  // 移除之前的高亮
  const viewport = document.getElementById('viewport');
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
    // 确保当前段落可见
    currentParagraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
 * 监听系统语音合成事件
 * 监听系统级别的开始、暂停、结束事件，同步更新UI状态
 */
function setupSpeechEventListeners() {
  if (!window.speechSynthesis) return;
  
  // 监听系统开始朗读事件
  window.speechSynthesis.onstart = function(event) {
    console.log('系统开始朗读事件触发');
    if (!isSpeaking) {
      isSpeaking = true;
      updateSpeakButton();
    }
  };
  
  // 监听系统暂停朗读事件
  window.speechSynthesis.onpause = function(event) {
    console.log('系统暂停朗读事件触发');
    if (isSpeaking) {
      isSpeaking = false;
      updateSpeakButton();
    }
  };
  
  // 监听系统恢复朗读事件
  window.speechSynthesis.onresume = function(event) {
    console.log('系统恢复朗读事件触发');
    if (!isSpeaking) {
      isSpeaking = true;
      updateSpeakButton();
    }
  };
  
  // 监听系统结束朗读事件
  window.speechSynthesis.onend = function(event) {
    console.log('系统结束朗读事件触发');
    if (isSpeaking) {
      isSpeaking = false;
      updateSpeakButton();
      // 清除高亮
      const viewport = document.getElementById('viewport');
      const prevHighlighted = viewport.querySelector('.speaking-paragraph');
      if (prevHighlighted) {
        prevHighlighted.classList.remove('speaking-paragraph');
      }
    }
  };
  
  // 监听系统错误事件
  window.speechSynthesis.onerror = function(event) {
    console.error('系统语音合成错误:', event.error);
    isSpeaking = false;
    updateSpeakButton();
    // 清除高亮
    const viewport = document.getElementById('viewport');
    const prevHighlighted = viewport.querySelector('.speaking-paragraph');
    if (prevHighlighted) {
      prevHighlighted.classList.remove('speaking-paragraph');
    }
  };
}

/**
 * 移除系统语音合成事件监听
 * 用于清理事件监听器，避免内存泄漏
 */
function removeSpeechEventListeners() {
  if (!window.speechSynthesis) return;
  
  window.speechSynthesis.onstart = null;
  window.speechSynthesis.onpause = null;
  window.speechSynthesis.onresume = null;
  window.speechSynthesis.onend = null;
  window.speechSynthesis.onerror = null;
}

/**
 * 设置媒体会话事件监听
 * 支持浏览器媒体控制（如媒体键、通知栏控制）
 */
function setupMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
      console.log('媒体会话播放事件');
      startSpeaking();
    });
    
    navigator.mediaSession.setActionHandler('pause', () => {
      console.log('媒体会话暂停事件');
      if (isSpeaking) {
        window.speechSynthesis.pause();
        isSpeaking = false;
        updateSpeakButton();
      }
    });
    
    navigator.mediaSession.setActionHandler('stop', () => {
      console.log('媒体会话停止事件');
      stopSpeaking();
    });
    
    // 设置媒体会话元数据
    if (currentBook) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `朗读: ${currentBook.name}`,
        artist: '小说阅读器',
        album: '朗读模式'
      });
    }
  }
}

/**
 * 设置页面可见性变化监听
 * 当页面隐藏时暂停朗读，显示时恢复
 */
function setupVisibilityChange() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isSpeaking) {
      console.log('页面隐藏，暂停朗读');
      window.speechSynthesis.pause();
      isSpeaking = false;
      updateSpeakButton();
    } else if (!document.hidden && window.speechSynthesis.paused && window.speechSynthesis.speaking) {
      console.log('页面显示，恢复朗读');
      window.speechSynthesis.resume();
      isSpeaking = true;
      updateSpeakButton();
    }
  });
}

/**
 * 开始或暂停朗读功能
 * 处理三种状态：开始朗读、暂停朗读、恢复朗读
 * 从当前阅读进度或保存的段落位置开始朗读
 * 增强系统事件监听，确保状态同步
 */
function startSpeaking() {
  if (!currentBook) return;
  
  // 检查语音合成系统是否就绪
  if (!isSpeechSynthesisReady()) {
    console.warn('语音合成系统未就绪，尝试重新加载音色...');
    loadVoices();
    setTimeout(() => {
      if (isSpeechSynthesisReady() && isSpeaking) {
        speakNextParagraph();
      }
    }, 500);
    return;
  }
   
  // 如果正在朗读，暂停
  if (isSpeaking) {
    window.speechSynthesis.pause();
    isSpeaking = false;
    updateSpeakButton();
    console.log('用户手动暂停朗读');
    return;
  }
   
  // 如果已暂停，恢复朗读
  if (window.speechSynthesis.paused && window.speechSynthesis.speaking) {
    window.speechSynthesis.resume();
    isSpeaking = true;
    updateSpeakButton();
    console.log('用户手动恢复朗读');
    return;
  }
   
  // 停止任何正在进行的朗读，确保状态干净
  window.speechSynthesis.cancel();
   
  // 开始新的朗读
  // 优先使用保存的段落进度，确保从断点继续
  const savedProgress = currentBook.progress;
  if (savedProgress?.paraIndex !== undefined) {
    // 检查保存的段落是否在当前书籍范围内
    if (savedProgress.paraIndex >= 0 && savedProgress.paraIndex < currentBook.paras.length) {
      currentParagraphIndex = savedProgress.paraIndex;
      // 如果保存的段落不在当前页，切换到对应页面
      const savedPage = Math.floor(savedProgress.paraIndex / pageSize);
      if (savedPage !== currentPage) {
        currentPage = savedPage;
        renderPage();
        // 等待页面渲染完成
        setTimeout(() => {
          if (isSpeaking) {
            speakNextParagraph();
          }
        }, 200);
        return;
      }
    } else {
      currentParagraphIndex = currentPage * pageSize;
    }
  } else {
    currentParagraphIndex = currentPage * pageSize;
  }
  
  isSpeaking = true;
  updateSpeakButton();
   
  // 延迟一小段时间确保语音合成系统准备好
  setTimeout(() => {
    if (isSpeaking) {
      speakNextParagraph();
    }
  }, 100);
}

/**
 * 停止朗读功能
 * 完全取消当前的语音合成，保存当前断点位置
 * 停止朗读时保留当前段落位置，便于下次继续
 * 增强系统事件处理，确保状态正确同步
 */
function stopSpeaking() {
  if (!currentBook) return;
  
  // 完全停止语音合成并清理状态
  window.speechSynthesis.cancel();
  isSpeaking = false;
  
  // 保存当前断点位置，不重置到页面开始
  saveReadingProgress();
  
  // 清除高亮显示
  const viewport = document.getElementById('viewport');
  const prevHighlighted = viewport.querySelector('.speaking-paragraph');
  if (prevHighlighted) {
    prevHighlighted.classList.remove('speaking-paragraph');
  }
  
  updateSpeakButton();
  console.log('用户手动停止朗读');
}

/**
 * 切换全屏阅读模式
 * 在全屏和普通模式之间切换，最大化阅读区域
 */
function toggleFullscreen() {
  const reader = document.getElementById('reader');
  if (reader.classList.contains('fullscreen')) {
    reader.classList.remove('fullscreen');
    document.body.style.overflow = 'hidden';
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
    selectedVoice = filtered[0];
    // 保存默认选择
    localStorage.setItem('selectedVoiceName', selectedVoice.name);
  }
}

// ---------------- 打开/加载书 ----------------
/**
 * 打开并显示指定书籍
 * 设置当前书籍和页码，更新UI显示，隐藏文件选择区域
 * 触发页面渲染显示书籍内容，自动高亮上次阅读位置
 * @param {Object} book - 书籍对象，包含文本、段落等信息
 */
function openBook(book) {
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

  document.title = book.name + ' - 小说阅读器';
  document.getElementById('bookTitle').textContent = book.name;
  document.getElementById('reader').classList.remove('hidden');
  document.getElementById('dropzone').classList.add('hidden');

  // 初始化朗读按钮状态
  updateSpeakButton();
  
  // 更新媒体会话元数据
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `朗读: ${book.name}`,
      artist: '小说阅读器',
      album: '朗读模式'
    });
  }

  // 渲染页面
  renderPage();
  
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
      resolve({ id: file.name, name: file.name, text, paras, progress: {} });
    };
    reader.onerror = e => reject(e);
    reader.readAsText(file, 'utf-8');
  });
}

// ---------------- 书籍列表 ----------------
/**
 * 刷新书籍列表显示
 * 从数据库获取所有书籍，创建可点击的书籍项
 * 每个书籍项包含书名和删除按钮
 * 点击书籍项时会加载完整书籍信息并打开阅读
 * 点击删除按钮会删除对应书籍
 */
async function refreshBookList() {
  const listEl = document.getElementById('bookList');
  listEl.innerHTML = '';

  const books = await getAllBooks();
  books.forEach(b => {
    const div = document.createElement('div');
    div.className = 'book-item';
    
    // 创建书籍名称元素
    const bookName = document.createElement('span');
    bookName.className = 'book-name';
    bookName.textContent = b.name;
    bookName.onclick = async () => {
      const full = await getBook(b.id);
      openBook(full);
      // 打开书籍后自动关闭阅读列表
      document.getElementById('bookListOverlay').classList.remove('show');
      document.getElementById('bookListContainer').classList.remove('show');
      document.body.style.overflow = '';
    };
    
    // 创建删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '删除';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      if (confirm(`确定要删除《${b.name}》吗？`)) {
        try {
          await deleteBook(b.id);
          // 如果删除的是当前正在阅读的书籍，清空当前书籍
          if (currentBook && currentBook.id === b.id) {
            currentBook = null;
            document.getElementById('reader').classList.add('hidden');
            document.getElementById('dropzone').classList.remove('hidden');
          }
          // 刷新列表
          await refreshBookList();
        } catch (error) {
          console.error('删除书籍失败:', error);
          alert('删除失败，请重试');
        }
      }
    };
    
    div.appendChild(bookName);
    div.appendChild(deleteBtn);
    listEl.appendChild(div);
  });
}
