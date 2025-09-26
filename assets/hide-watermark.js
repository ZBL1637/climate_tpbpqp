/**
 * 功能：移除页面右下角“Made with Manus”水印，同时不影响页面其他内容。
 * 实现策略：
 * 1) 精准匹配：查找指向 manus.im / manus.space 的固定位（fixed）右下角角标链接；
 * 2) 兼容兜底：如果存在容器包裹，则优先移除最近的 fixed 容器，否则仅隐藏链接节点；
 * 3) 持续监听：通过 MutationObserver 和短周期轮询，处理异步注入的水印；
 * 4) 安全性：仅处理包含“Manus”文案或链接到 manus 域的节点，避免误删其他内容。
 */
(function () {
  'use strict';

  /**
   * 判断节点是否为 Manus 角标相关节点
   * @param {HTMLElement} el - 待判断的元素
   * @returns {boolean}
   */
  function isManusBadgeNode(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      const a = el.matches('a[href*="manus.im"], a[href*="manus.space"]') ? el : el.querySelector('a[href*="manus.im"], a[href*="manus.space"]');
      if (!a) return false;
      const text = (a.textContent || '').trim();
      const looksLikeBadgeText = /manus/i.test(text) || /made\s+with/i.test(text);
      // 位置和尺寸启发式，仅用于识别包裹容器
      const root = a.closest('[style*="position: fixed"], [style*="position:fixed"], [style*="position: sticky"], [style*="position:sticky"]') || a;
      const cs = window.getComputedStyle(root);
      const isFixed = cs.position === 'fixed';
      const atCorner = /\bbottom\b/.test(root.getAttribute('style') || '') || /\bright\b/.test(root.getAttribute('style') || '') || (isFixed && (parseInt(cs.right) >= 0 || parseInt(cs.bottom) >= 0));
      const reasonableSize = root.offsetWidth <= 360 && root.offsetHeight <= 160; // 防止大面积元素被误删
      return looksLikeBadgeText && (isFixed || atCorner) && reasonableSize;
    } catch (_) {
      return false;
    }
  }

  /**
   * 执行移除/隐藏逻辑（幂等）
   * @returns {number} - 处理的节点数量
   */
  function removeManusBadgeOnce() {
    let removed = 0;
    // 1) 先处理包含 manus 域链接的角标
    const anchors = document.querySelectorAll('a[href*="manus.im"], a[href*="manus.space"]');
    anchors.forEach(a => {
      try {
        if (!isManusBadgeNode(a)) return;
        const wrapper = a.closest('[style*="position: fixed"], [style*="position:fixed"], [style*="position: sticky"], [style*="position:sticky"]');
        const target = wrapper || a;
        target.style.setProperty('display', 'none', 'important');
        target.setAttribute('aria-hidden', 'true');
        target.setAttribute('data-removed-by', 'hide-watermark');
        removed += 1;
      } catch (_) {}
    });

    // 2) 处理 made-with-* 类名（按钮或链接）
    document.querySelectorAll('[class^="made-with-"], [class*=" made-with-"]').forEach(el => {
      try {
        const text = (el.textContent || '').toLowerCase();
        if (!/manus/.test(text)) return; // 防止误伤
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('data-removed-by', 'hide-watermark');
        removed += 1;
      } catch (_) {}
    });

    // 4) 处理 footer-watermark-root（用户指定的根容器，强制删除/隐藏，覆盖 Shadow DOM）
    try {
      const roots = queryAllDeep('.footer-watermark-root');
      roots.forEach(el => {
        try {
          if (typeof el.remove === 'function') {
            el.remove();
          } else {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            el.setAttribute('hidden', 'true');
          }
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('data-removed-by', 'hide-watermark');
          removed += 1;
        } catch (_) {}
      });
    } catch (_) {}

    // 5) 全局处理 footer-watermark 自定义组件：删除其内部所有 div（含 Shadow DOM）
    try {
      const comps = queryAllDeep('footer-watermark');
      comps.forEach(comp => {
        // 删除 light DOM 下的所有 div
        try {
          comp.querySelectorAll && comp.querySelectorAll('div').forEach(div => { try { div.remove(); removed += 1; } catch (_) {} });
        } catch (_) {}
        // 若存在 shadow DOM，同样删除其中的 div
        try {
          if (comp.shadowRoot) {
            comp.shadowRoot.querySelectorAll('div').forEach(div => { try { div.remove(); removed += 1; } catch (_) {} });
          }
        } catch (_) {}
      });
    } catch (_) {}

    // 6) 处理纯文本 span：<span>Made with Manus</span>
    // 说明：有些水印可能不是链接或按钮，仅以文本形式呈现。此处仅在文本精确匹配时隐藏，避免误伤。
    document.querySelectorAll('span').forEach(el => {
      try {
        const text = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (text === 'made with manus') {
          el.style.setProperty('display', 'none', 'important');
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('data-removed-by', 'hide-watermark');
          removed += 1;
        }
      } catch (_) {}
    });

    return removed;
  }

  /**
   * 初始化：DOM 解析完成后立即执行一次，并挂载监听
   */
  function init() {
    // 首次尝试
    removeManusBadgeOnce();

    // 监听后续动态注入
    try {
      const mo = new MutationObserver(() => {
        removeManusBadgeOnce();
      });
      mo.observe(document.documentElement || document, {
        childList: true,
        subtree: true
      });
    } catch (_) {
      // 某些极端环境不支持 MutationObserver，忽略
    }

    // 短期轮询兜底（最多 5 秒）
    let elapsed = 0;
    const timer = setInterval(() => {
      const n = removeManusBadgeOnce();
      elapsed += 300;
      if (n === 0 && elapsed >= 5000) {
        clearInterval(timer);
      }
      if (elapsed >= 5000) {
        clearInterval(timer);
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/**
   * 在 light DOM 与可访问的 open Shadow DOM 中进行深度选择器查询
   * 说明：用于在自定义组件的 shadowRoot 中同样查找匹配元素
   * @param {string} selector - CSS 选择器
   * @param {ParentNode} root - 起始根（默认 document）
   * @param {number} maxDepth - 最多遍历的 shadow 深度
   * @param {number} maxNodes - 保护性上限，避免极端页面性能问题
   * @returns {HTMLElement[]} 匹配到的元素列表
   */
  function queryAllDeep(selector, root = document, maxDepth = 4, maxNodes = 5000) {
    try {
      const results = [];
      const queue = [{ node: root, depth: 0 }];
      let visited = 0;
      while (queue.length) {
        const { node, depth } = queue.shift();
        if (!node || visited > maxNodes) break;
        if (typeof node.querySelectorAll === 'function') {
          node.querySelectorAll(selector).forEach(el => results.push(el));
          // 扫描当前根下的所有元素，若存在 open shadowRoot 则入队
          const all = node.querySelectorAll('*');
          visited += all.length;
          if (visited > maxNodes) break;
          if (depth < maxDepth) {
            all.forEach(el => {
              if (el && el.shadowRoot) {
                queue.push({ node: el.shadowRoot, depth: depth + 1 });
              }
            });
          }
        }
      }
      return results;
    } catch (_) {
      return [];
    }
  }