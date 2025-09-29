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
            await deleteBookAndNotify(b.id);
            // 如果删除的是当前正在阅读的书籍，清空当前书籍
            if (currentBook && currentBook.id === b.id) {
              currentBook = null;
              document.getElementById('reader').classList.add('hidden');
              document.getElementById('dropzone').classList.remove('hidden');
              document.getElementById('btnToggleSearch').style.display = 'none';
            }
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

  window.addEventListener('bookdeleted', refreshBookList);

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

  // 初始化语速选择
  function initRateOptions() {
    const rateSelect = document.getElementById('rate');
    let targetRate = 1.0; // Default rate

    try {
      const savedRate = localStorage.getItem('selectedRate');
      if (savedRate && !isNaN(parseFloat(savedRate))) {
        targetRate = parseFloat(savedRate);
      }
    } catch (e) {
      console.warn('Could not access localStorage for reading rate:', e);
    }

    for (let i = 8; i <= 20; i++) {
      const option = document.createElement('option');
      const value = i / 10;
      option.value = value;
      option.textContent = `${value.toFixed(1)}x`;
      // Use Math.abs to handle floating point inaccuracies
      if (Math.abs(value - targetRate) < 0.01) {
        option.selected = true;
      }
      rateSelect.appendChild(option);
    }

    rateSelect.addEventListener('change', (e) => {
      try {
        localStorage.setItem('selectedRate', e.target.value);
      } catch (e) {
        console.warn('Could not access localStorage for saving rate:', e);
      }
    });
  }
  initRateOptions();

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


  // 全屏
  document.getElementById('btnFullscreen').onclick = toggleFullscreen;

  // 快捷键
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') prevPage();
    else if (e.key === 'ArrowRight') nextPage();
    else if (e.key === ' ') { e.preventDefault(); startSpeaking(); }

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
    const swipeThreshold = 100; // 滑动阈值
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

  // 显示/隐藏搜索
  function toggleSearch(show) {
    const overlay = document.getElementById('searchOverlay');
    const container = document.getElementById('searchContainer');
    
    if (show === undefined) {
      show = !container.classList.contains('show');
    }
    
    if (show) {
      overlay.classList.add('show');
      container.classList.add('show');
      document.body.style.overflow = 'hidden'; // 防止背景滚动
      document.getElementById('searchInput').focus();
    } else {
      overlay.classList.remove('show');
      container.classList.remove('show');
      document.body.style.overflow = ''; // 恢复滚动
    }
  }

  document.getElementById('btnToggleSearch').onclick = () => toggleSearch();
  document.getElementById('btnCloseSearch').onclick = () => toggleSearch(false);
  document.getElementById('searchOverlay').onclick = () => toggleSearch(false);

  // 执行搜索
  async function performSearch() {
    const query = document.getElementById('searchInput').value;
    const results = searchInBook(query);
    const resultsEl = document.getElementById('searchResults');
    resultsEl.innerHTML = '';

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="list-item">没有找到匹配的结果</div>';
      return;
    }

    results.forEach(result => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = highlightSearchTerm(result.text, query);
      div.onclick = () => {
        const page = Math.floor(result.index / pageSize);
        currentPage = page;
        renderPage();
        setTimeout(() => {
          const p = document.querySelector(`[data-index="${result.index}"]`);
          if (p) {
            p.scrollIntoView({ behavior: 'smooth', block: 'center' });
            p.classList.add('speaking-paragraph');
            setTimeout(() => p.classList.remove('speaking-paragraph'), 2000);
          }
        }, 100);
        toggleSearch(false);
      };
      resultsEl.appendChild(div);
    });
  }

  document.getElementById('btnSearch').onclick = performSearch;
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // 显示/隐藏同步设置
  async function toggleSyncSettings(show) {
    const overlay = document.getElementById('syncSettingsOverlay');
    const container = document.getElementById('syncSettingsContainer');
    
    if (show === undefined) {
      show = !container.classList.contains('show');
    }
    
    if (show) {
      const settings = await getSyncSettings();
      if (settings) {
        document.getElementById('syncUrl').value = settings.syncUrl || '';
        document.getElementById('syncToken').value = settings.syncToken || '';
      }
      overlay.classList.add('show');
      container.classList.add('show');
      document.body.style.overflow = 'hidden'; // 防止背景滚动
    } else {
      overlay.classList.remove('show');
      container.classList.remove('show');
      document.body.style.overflow = ''; // 恢复滚动
    }
  }

  // 初始化同步按钮状态
  async function initSyncButton() {
    const settings = await getSyncSettings();
    const btnToggleSync = document.getElementById('btnToggleSync');
    if (settings && settings.syncUrl) {
      btnToggleSync.style.display = 'inline-flex';
      if (btnToggleSync.classList.contains('active')) {
        btnToggleSync.textContent = '关闭同步';
      } else {
        btnToggleSync.textContent = '开启同步';
      }
    } else {
      btnToggleSync.style.display = 'none';
    }
  }
  initSyncButton();

  document.getElementById('btnToggleSync').addEventListener('click', async () => {
    const btnToggleSync = document.getElementById('btnToggleSync');
    btnToggleSync.classList.toggle('active');
    initSyncButton();
    if (btnToggleSync.classList.contains('active')) {
      if (confirm('是否同步当前阅读进度？')) {
        fetchAndApplySyncProgress(currentBook);
      }
    }
  });

  document.getElementById('btnSyncSettings').addEventListener('click', () => {
    toggleSyncSettings(true);
  });

  document.getElementById('btnCloseSyncSettings').onclick = () => toggleSyncSettings(false);
  document.getElementById('syncSettingsOverlay').onclick = () => toggleSyncSettings(false);

  document.getElementById('btnSaveSyncSettings').addEventListener('click', async () => {
    const syncUrl = document.getElementById('syncUrl').value;
    const syncToken = document.getElementById('syncToken').value;

    if (!syncUrl) {
      alert('同步接口地址不能为空');
      return;
    }

    try {
      const response = await fetch(`${syncUrl}/health`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${syncToken}`,
        }
      });
      if (response.ok) {
        await saveSyncSettings({ syncUrl, syncToken });
        toggleSyncSettings(false);
        const btnToggleSync = document.getElementById('btnToggleSync');
        btnToggleSync.classList.add('active');
        initSyncButton();
        if (confirm('同步设置已保存，是否立即同步当前阅读进度？')) {
          fetchAndApplySyncProgress(currentBook);
        }
      } else {
        alert('健康检查失败，请检查同步接口地址');
      }
    } catch (error) {
      alert('健康检查请求失败，请检查网络连接和接口地址');
    }
  });

  // --- Theme Switching ---
  function applyTheme(theme) {
    const themeBtn = document.getElementById('btnToggleTheme');
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
      themeBtn.textContent = '日间模式';
    } else {
      document.body.classList.remove('dark-mode');
      themeBtn.textContent = '夜间模式';
    }
  }

  function toggleTheme() {
    const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', newTheme);
    } catch (e) {
      console.warn('Could not access localStorage for saving theme:', e);
    }
    applyTheme(newTheme);
  }

  let savedTheme = 'light';
  try {
    savedTheme = localStorage.getItem('theme') || 'light';
  } catch (e) {
    console.warn('Could not access localStorage for reading theme:', e);
  }
  applyTheme(savedTheme);

  document.getElementById('btnToggleTheme').addEventListener('click', toggleTheme);
});
