/* 应用入口：事件绑定与初始化 */

/**
 * 应用初始化主函数
 * 在DOM加载完成后执行，负责：
 * 1. 初始化IndexedDB数据库
 * 2. 加载书籍列表
 * 3. 恢复上次阅读的书籍
 * 4. 初始化语音合成系统
 * 5. 绑定所有UI事件监听器
 * 6. 设置键盘快捷键
 */
window.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  await refreshBookList();

  // 如果有上次阅读的书，自动打开
  const meta = localStorage.getItem('NovelReaderMeta');
  if (meta) {
    const { lastBookId } = JSON.parse(meta);
    if (lastBookId) {
      const book = await getBook(lastBookId);
      if (book) openBook(book);
    }
  }

  // 初始化语音
  /**
   * 初始化语音合成音色
   * 根据当前过滤条件加载可用音色列表
   */
  function initVoices() {
    loadVoices(document.getElementById('voiceFilter').value);
  }
  window.speechSynthesis.onvoiceschanged = initVoices;
  initVoices();

  document.getElementById('voiceSelect').addEventListener('change', e => {
    const idx = parseInt(e.target.value, 10);
    const f = document.getElementById('voiceFilter').value.toLowerCase();
    const filtered = voices.filter(v =>
      v.name.toLowerCase().includes(f) || (v.lang && v.lang.toLowerCase().includes(f))
    );
    
    // 确保索引有效
    if (idx >= 0 && idx < filtered.length) {
      selectedVoice = filtered[idx];
      // 保存选择的音色到本地存储
      if (selectedVoice) {
        localStorage.setItem('selectedVoiceName', selectedVoice.name);
      }
    }
  });

  // 音色过滤防抖处理
  let voiceFilterTimeout;
  document.getElementById('voiceFilter').addEventListener('input', e => {
    clearTimeout(voiceFilterTimeout);
    voiceFilterTimeout = setTimeout(() => {
      loadVoices(e.target.value);
    }, 300); // 300ms防抖延迟
  });

  // 拖拽打开文件
  const dropzone = document.getElementById('dropzone');
  dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add('dragover'); };
  dropzone.ondragleave = () => dropzone.classList.remove('dragover');
  dropzone.ondrop = async e => {
    e.preventDefault(); dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      const book = await parseFile(file);
      await saveBook(book);
      await refreshBookList();
      openBook(book);
    }
  };

  // 文件选择
  document.getElementById('fileInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (file) {
      const book = await parseFile(file);
      await saveBook(book);
      await refreshBookList();
      openBook(book);
    }
  });

  // 翻页
  document.getElementById('btnPrev').onclick = prevPage;
  document.getElementById('btnNext').onclick = nextPage;
  document.getElementById('btnPagePrev').onclick = prevPage;
  document.getElementById('btnPageNext').onclick = nextPage;

  // 朗读
  document.getElementById('btnSpeak').onclick = startSpeaking;
  document.getElementById('btnStop').onclick = stopSpeaking;

  // 全屏
  document.getElementById('btnFullscreen').onclick = toggleFullscreen;

  // 快捷键
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') prevPage();
    else if (e.key === 'ArrowRight') nextPage();
    else if (e.key === ' ') { e.preventDefault(); startSpeaking(); }
    else if (e.key.toLowerCase() === 's') stopSpeaking();
    else if (e.key === 'Escape') {
      // ESC键关闭阅读列表
      const container = document.getElementById('bookListContainer');
      if (container.classList.contains('show')) {
        toggleBookList(false);
      }
    }
  });

  // 触摸滑动翻页（手机端优化）
  let touchStartX = 0;
  let touchEndX = 0;
  const viewport = document.getElementById('viewport');
  
  viewport.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  });
  
  viewport.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  });
  
  function handleSwipe() {
    const swipeThreshold = 50; // 滑动阈值
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        // 向左滑动 - 下一页
        nextPage();
      } else {
        // 向右滑动 - 上一页
        prevPage();
      }
    }
  }
  
  // 手机端阅读列表抽屉触摸滑动关闭
  let listTouchStartX = 0;
  let listTouchEndX = 0;
  const bookListContainer = document.getElementById('bookListContainer');
  
  bookListContainer.addEventListener('touchstart', e => {
    listTouchStartX = e.changedTouches[0].screenX;
  });
  
  bookListContainer.addEventListener('touchend', e => {
    listTouchEndX = e.changedTouches[0].screenX;
    handleListSwipe();
  });
  
  function handleListSwipe() {
    // 只有在手机端且抽屉打开时才处理
    if (window.innerWidth > 768 || !bookListContainer.classList.contains('show')) {
      return;
    }
    
    const swipeThreshold = 80; // 滑动阈值更大一些
    const diff = listTouchStartX - listTouchEndX;
    
    // 向右滑动关闭抽屉
    if (diff < -swipeThreshold) {
      toggleBookList(false);
    }
  }
  
  // 点击翻页区域（手机端大屏幕优化）
  viewport.addEventListener('click', e => {
    if (window.innerWidth > 768) return; // 只在手机端生效
    
    const rect = viewport.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    
    // 左侧1/3区域点击 - 上一页
    if (clickX < width / 3) {
      prevPage();
    }
    // 右侧1/3区域点击 - 下一页
    else if (clickX > width * 2 / 3) {
      nextPage();
    }
    // 中间1/3区域点击 - 不做翻页操作，避免干扰文本选择
  });

  // 显示/隐藏列表
  function toggleBookList(show) {
    const overlay = document.getElementById('bookListOverlay');
    const container = document.getElementById('bookListContainer');
    
    if (show === undefined) {
      show = !container.classList.contains('show');
    }
    
    if (show) {
      overlay.classList.add('show');
      container.classList.add('show');
      document.body.style.overflow = 'hidden'; // 防止背景滚动
    } else {
      overlay.classList.remove('show');
      container.classList.remove('show');
      document.body.style.overflow = ''; // 恢复滚动
    }
  }
  
  document.getElementById('btnToggleList').onclick = () => toggleBookList();
  document.getElementById('btnCloseList').onclick = () => toggleBookList(false);
  document.getElementById('bookListOverlay').onclick = () => toggleBookList(false);
});
