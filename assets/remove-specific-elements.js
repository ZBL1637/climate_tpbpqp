/**
 * 功能：根据给定的结构选择器，安全地移除页面上匹配的元素（包括后续异步注入的节点）。
 * 用例：用户提供的要移除的结构为 5 层嵌套的卡片分组容器（grid 列表）。
 * 
 * 说明：
 * - 我们按用户给出的片段进行特征匹配：外层 .grid.grid-cols-12.gap-6 内部的卡片组容器
 *   （即 "col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" 的 div）。
 * - 仅移除该特定分组容器，不触碰其他内容；并加入幂等保护属性。
 * - 监听 DOM 变化，若此结构被异步渲染（React/Vite 入口脚本加载后生成），同样会被移除。
 */
(function () {
  'use strict';

  /**
   * 判断一个元素是否为目标卡片分组容器
   * @param {Element} el - DOM 元素
   * @returns {boolean}
   */
  function isTargetGroup(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      if (el.getAttribute('data-removed-by') === 'remove-specific-elements') return false;
      const classList = el.classList;
      if (!classList) return false;
      // 仅在 class 完整包含下列关键类名时识别
      const required = ['col-span-12', 'grid', 'grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-4', 'gap-4', 'mb-6'];
      const ok = required.every(c => classList.contains(c));
      if (!ok) return false;
      // 必须位于一个 12 列的父 grid 中，避免误删其它类似单列网格
      const parent = el.closest('div.grid.grid-cols-12.gap-6');
      return !!parent;
    } catch (_) {
      return false;
    }
  }

  /**
   * 尝试移除一次匹配到的目标结构（幂等）
   * @returns {number} 已处理的节点数量
   */
  function removeOnce() {
    let count = 0;
    // 精准选择：只在 12 栏主网格下面查找该卡片分组容器
    document.querySelectorAll('div.grid.grid-cols-12.gap-6 > div').forEach(el => {
      try {
        if (!isTargetGroup(el)) return;
        // 优先删除整个分组容器
        if (typeof el.remove === 'function') {
          el.setAttribute('data-removed-by', 'remove-specific-elements');
          el.remove();
        } else {
          el.style.setProperty('display', 'none', 'important');
          el.setAttribute('hidden', 'true');
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('data-removed-by', 'remove-specific-elements');
        }
        count += 1;
      } catch (_) {}
    });
  
    // 新增：按标题移除“地理模式”单个卡片
    count += removeCardByTitle('地理模式');
    // 新增：移除“关键发现”红色提示面板
    count += removeKeyFindingsPanel();
    // 新增：更新“数据更新时间：2024年”到 2025年
    count += updateDataYear(2025);
    // 新增：移除信息条中的“查看数据源”和“方法说明”
    count += removeInfoBarAnchors(['查看数据源', '方法说明']);
    // 新增：移除标题导航栏
    removeHeaderNavigation();
  
    return count;
  }

  /**
   * 规范化文本：去除首尾空白并压缩中间多余空白
   * @param {string} s
   * @returns {string}
   */
  function normText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * 根据卡片标题精确移除单个卡片（如：地理模式）
   * 安全策略：
   * 1) 仅匹配标题文本完全等于 title 的元素（主要在 .text-lg 或 [data-slot="card-title"] 中）；
   * 2) 向上定位到含 .pb-3（标题区域）的容器，再取其父节点作为卡片根；
   * 3) 进一步校验卡片根内是否包含特征内容（例如地理模式的要点列表），避免误删；
   * 4) 幂等：被处理元素会标记 data-removed-by。
   * @param {string} title - 卡片标题（如“地理模式”）
   * @returns {number} - 删除的卡片数量
   */
  function removeCardByTitle(title) {
    let removed = 0;
    const candidates = Array.from(document.querySelectorAll('.text-lg, .font-semibold.text-lg, [data-slot="card-title"]'));
    const titleCandidates = candidates.filter(el => normText(el.textContent) === normText(title));

    titleCandidates.forEach(headingEl => {
      try {
        // 1) 找到标题区域（通常带有 .pb-3）
        const headerWrap = headingEl.closest('.pb-3') || headingEl.parentElement;
        if (!headerWrap) return;
        // 2) 卡片根是标题区域的父节点
        let cardRoot = headerWrap.parentElement;
        if (!cardRoot) return;
        if (cardRoot.getAttribute('data-removed-by') === 'remove-specific-elements') return;

        // 3) 进一步校验内容特征（适配“地理模式”这张卡片）
        const contentBlock = cardRoot.querySelector('.space-y-2.text-sm.text-gray-700');
        const textSlice = contentBlock ? normText(contentBlock.textContent) : '';
        const keywords = ['北极放大', '陆地海洋', '季节差异', '区域变化'];
        const looksLikeGeoPattern = contentBlock && keywords.every(k => textSlice.includes(k));
        if (!looksLikeGeoPattern) return; // 若不满足特征，避免误删

        // 4) 移除整张卡片
        if (typeof cardRoot.remove === 'function') {
          cardRoot.setAttribute('data-removed-by', 'remove-specific-elements');
          cardRoot.remove();
        } else {
          cardRoot.style.setProperty('display', 'none', 'important');
          cardRoot.setAttribute('hidden', 'true');
          cardRoot.setAttribute('aria-hidden', 'true');
          cardRoot.setAttribute('data-removed-by', 'remove-specific-elements');
        }
        removed += 1;
      } catch (_) {}
    });

    return removed;
  }

  /**
   * 根据标题“关键发现”精确移除红色提示面板
   * 安全策略：
   * 1) 锁定 h4 标题文本为“关键发现”；
   * 2) 向上寻找包含红色背景等类的面板容器（优先匹配 .bg-red-50，辅以 .rounded-lg/.p-4 等类）；
   * 3) 在面板容器内校验四条要点关键词，确保是目标模块；
   * 4) 幂等防护 data-removed-by，失败时退化为隐藏。
   * @returns {number} - 删除的面板数量
   */
  function removeKeyFindingsPanel() {
    let removed = 0;
    const headings = Array.from(document.querySelectorAll('h4, [data-slot="card-title"]'));
    const targets = headings.filter(h => normText(h.textContent) === '关键发现');

    targets.forEach(h => {
      try {
        // 自标题向上找红色提示面板容器
        let panel = h.closest('div');
        while (panel && panel.nodeType === 1) {
          const cl = panel.classList || { contains: () => false };
          if (cl.contains('bg-red-50')) break;
          panel = panel.parentElement;
        }
        if (!panel) return;
        if (panel.getAttribute('data-removed-by') === 'remove-specific-elements') return;

        // 进一步校验内容特征
        const content = panel.querySelector('.grid, .text-sm');
        const text = content ? normText(content.textContent) : '';
        const must = ['加速变暖', '基线漂移', '地理差异', '临界逼近'];
        const looksLike = must.every(k => text.includes(k));
        if (!looksLike) return; // 不满足关键词校验，避免误删

        // 删除或隐藏
        if (typeof panel.remove === 'function') {
          panel.setAttribute('data-removed-by', 'remove-specific-elements');
          panel.remove();
        } else {
          panel.style.setProperty('display', 'none', 'important');
          panel.setAttribute('hidden', 'true');
          panel.setAttribute('aria-hidden', 'true');
          panel.setAttribute('data-removed-by', 'remove-specific-elements');
        }
        removed += 1;
      } catch (_) {}
    });

    return removed;
  }

  /**
   * 查询页面中“信息条”容器（包含若干 span 与锚点，示例类：
   * .flex.flex-wrap.items-center.justify-center.gap-4.text-sm.text-gray-500）
   * @returns {Element[]} 匹配到的容器数组
   */
  function queryInfoBars() {
    return Array.from(document.querySelectorAll('div.flex.flex-wrap.items-center.justify-center.gap-4.text-sm.text-gray-500'));
  }

  /**
   * 在“信息条”中将“数据更新时间：yyyy年”更新为指定年份（如 2025）
   * - 先在信息条容器中查找 span；若未找到容器，则退化为全局 span 搜索
   * - 幂等：若已为目标年份则不重复改动
   * @param {number} targetYear 目标年份
   * @returns {number} 修改的节点数量
   */
  function updateDataYear(targetYear) {
    let changed = 0;
    const containers = queryInfoBars();
    let spans = [];
    if (containers.length) {
      containers.forEach(c => { spans.push(...c.querySelectorAll('span')); });
    } else {
      spans = Array.from(document.querySelectorAll('span'));
    }
    spans.forEach(sp => {
      const t = normText(sp.textContent);
      if (t.startsWith('数据更新时间：') && /年$/.test(t)) {
        const replaced = t.replace(/(数据更新时间：)\s*\d{4}(年)/, `$1${targetYear}$2`);
        if (replaced !== t) {
          sp.textContent = replaced;
          changed += 1;
        }
      }
    });
    return changed;
  }

  /**
   * 在“信息条”中移除指定标题的超链接（如“查看数据源”、“方法说明”）
   * - 同时清理相邻的分隔符“•”，保持视觉整洁
   * - 若找不到信息条容器则退化为全局匹配
   * @param {string[]} titles 需要移除的锚点文本列表
   * @returns {number} 删除的节点数量（包含锚点与分隔符）
   */
  function removeInfoBarAnchors(titles) {
    let removed = 0;
    const targets = new Set(titles.map(t => normText(t)));
    const containers = queryInfoBars();
    let anchors = [];
    if (containers.length) {
      containers.forEach(c => { anchors.push(...c.querySelectorAll('a')); });
    } else {
      anchors = Array.from(document.querySelectorAll('a'));
    }
    anchors.forEach(a => {
      const txt = normText(a.textContent);
      if (targets.has(txt)) {
        removed += removeAnchorAndAdjacentBullets(a);
      }
    });
    return removed;
  }

  /**
   * 移除给定锚点节点，并尽量清理其左右两侧紧邻的“•”分隔符
   * @param {HTMLAnchorElement} anchor 目标超链接元素
   * @returns {number} 删除的节点数量
   */
  function removeAnchorAndAdjacentBullets(anchor) {
    let r = 0;
    try {
      const prev = anchor.previousElementSibling;
      if (prev && prev.tagName === 'SPAN' && normText(prev.textContent) === '•') {
        prev.setAttribute('data-removed-by', 'remove-specific-elements');
        prev.remove();
        r++;
      }
      const next = anchor.nextElementSibling;
      if (next && next.tagName === 'SPAN' && normText(next.textContent) === '•') {
        next.setAttribute('data-removed-by', 'remove-specific-elements');
        next.remove();
        r++;
      }
      anchor.setAttribute('data-removed-by', 'remove-specific-elements');
      anchor.remove();
      r++;
    } catch (_) {}
    return r;
  }

  /**
   * 新增：移除标题导航栏（<header class="climate-header">）
   * 根据固定的 header 结构与类名安全移除标题导航栏。
   * - 仅移除 class="climate-header" 的 <header> 元素。
   * - 保留其他页面结构与样式脚本。
   * - 幂等保护：只移除一次，并标记 data-removed-by。
   */
  function removeHeaderNavigation() {
    try {
      const header = document.querySelector('header.climate-header');
      if (!header) return;
  
      // 已被移除标记
      if (header.dataset.removedBy === 'remove-specific-elements') return;
  
      // 进一步结构确认，避免误删：
      const title = header.querySelector('.header-title h1');
      const nav = header.querySelector('.header-nav');
      if (!title || !nav) return; // 结构不符，跳过
  
      // 安全移除（移除前打标记）
      header.setAttribute('data-removed-by', 'remove-specific-elements');
      header.remove();
    } catch (err) {
      // 失败时退化为隐藏，避免阻塞
      const header = document.querySelector('header.climate-header');
      if (header) {
        header.style.display = 'none';
        header.setAttribute('data-removed-by', 'remove-specific-elements');
      }
    }
  }

  /**
   * 初始化并监听后续变更
   */
  function init() {
    removeOnce();
    // 监听异步渲染
    try {
      const mo = new MutationObserver(() => { removeOnce(); });
      mo.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (_) {}
    // 短时轮询兜底（最多 5 秒）
    let elapsed = 0;
    const timer = setInterval(() => {
      const n = removeOnce();
      elapsed += 300;
      if ((n === 0 && elapsed >= 5000) || elapsed >= 5000) {
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

// 已移除外部包装 IIFE：removeHeaderNavigation 已在 removeOnce 与 init 流程中处理，无需重复包装。