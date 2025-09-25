# 安卓Edge浏览器语音加载问题修复

## 问题描述

在安卓Edge浏览器中，`speechSynthesis.getVoices()` 在初始调用时返回空列表，但开启浏览器的"大声朗读"功能一次后就可以正常获取到语音列表。这是一个已知的Web Speech API异步加载问题。

## 问题原因

1. **异步加载机制**：Web Speech API的语音列表是异步加载的
2. **浏览器优化**：某些浏览器（特别是安卓Edge）会延迟加载语音资源以节省资源
3. **初始化时序**：在页面加载时立即调用`getVoices()`可能返回空数组

## 修复方案

### 1. 增强的语音加载检测

在 `reader.js` 中增强了 `isSpeechSynthesisReady()` 函数：

```javascript
function isSpeechSynthesisReady() {
  // 检查浏览器是否支持语音合成
  if (!window.speechSynthesis) {
    console.warn('浏览器不支持语音合成API');
    return false;
  }
  
  const voices = window.speechSynthesis.getVoices();
  
  // 安卓Edge浏览器需要特殊处理：如果voices为空，尝试重新加载
  if (voices.length === 0) {
    console.log('语音列表为空，可能是异步加载未完成');
    return false;
  }
  
  return true;
}
```

### 2. 改进的语音列表加载

在 `loadVoices()` 函数中添加了空列表处理：

```javascript
function loadVoices(filter = '') {
  voices = speechSynthesis.getVoices();
  const voiceSelect = document.getElementById('voiceSelect');
  
  // 如果voices为空，可能是异步加载未完成，等待onvoiceschanged事件
  if (voices.length === 0) {
    console.log('语音列表为空，等待onvoiceschanged事件...');
    return;
  }
  
  // ... 原有的语音处理逻辑
}
```

### 3. 用户友好的错误处理

在 `startSpeaking()` 函数中添加了更好的用户体验：

```javascript
if (!isSpeechSynthesisReady()) {
  console.warn('语音合成系统未就绪，尝试重新加载音色...');
  loadVoices();
  
  // 显示用户友好的提示
  const voiceSelect = document.getElementById('voiceSelect');
  if (voiceSelect.options.length === 0 || (voiceSelect.options.length === 1 && voiceSelect.options[0].disabled)) {
    alert('语音列表正在加载中，请稍后再试。\n\n安卓Edge浏览器提示：如果长时间无法加载，请尝试在浏览器设置中开启"大声朗读"功能一次。');
  }
  
  // 尝试重新初始化语音
  setTimeout(() => {
    if (isSpeechSynthesisReady() && isSpeaking) {
      speakNextParagraph();
    } else if (isSpeaking) {
      // 如果仍然失败，重置状态
      isSpeaking = false;
      updateSpeakButton();
      alert('语音加载失败，请检查浏览器语音设置或稍后再试。');
    }
  }, 1000);
  return;
}
```

### 4. 初始化提示

在 `main.js` 中添加加载状态提示：

```javascript
function initVoices() {
  loadVoices(document.getElementById('voiceFilter').value);
  
  // 如果语音列表仍然为空，在下拉框中显示提示信息
  const voiceSelect = document.getElementById('voiceSelect');
  if (voiceSelect.options.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '正在加载语音列表...';
    opt.disabled = true;
    opt.selected = true;
    voiceSelect.appendChild(opt);
  }
}
```

## 使用方法

### 正常情况
1. 页面加载时自动检测语音列表
2. 如果语音列表为空，显示"正在加载语音列表..."
3. 等待 `onvoiceschanged` 事件触发后自动加载语音

### 安卓Edge浏览器特殊情况
1. 如果语音列表长时间为空，会显示友好提示
2. 提示用户可以在浏览器设置中开启"大声朗读"功能
3. 提供重试机制，最多等待1秒

### 测试工具
使用提供的 `test-voice-loading.html` 文件可以测试语音加载功能：

```bash
# 启动本地服务器
npx http-server -p 8080 -c-1

# 访问测试页面
http://localhost:8080/test-voice-loading.html
```

## 兼容性

- ✅ Chrome (桌面版)
- ✅ Chrome (安卓版)
- ✅ Edge (桌面版)
- ✅ Firefox (桌面版)
- ⚠️ Edge (安卓版) - 需要本修复方案
- ⚠️ 其他基于Chromium的安卓浏览器

## 注意事项

1. **首次使用**：安卓Edge浏览器用户可能需要在浏览器设置中开启"大声朗读"功能一次
2. **网络依赖**：某些语音可能需要网络连接才能加载
3. **权限问题**：确保浏览器有必要的权限
4. **性能考虑**：语音加载是异步的，可能需要等待

## 调试信息

在浏览器控制台中可以查看详细的调试信息：

- `语音列表为空，等待onvoiceschanged事件...`
- `语音合成系统未就绪，尝试重新加载音色...`
- `检测到 X 个语音`

这些信息有助于诊断语音加载问题。