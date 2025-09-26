/**
 * 气候变化分析平台 - 导航栏交互功能
 * Climate Change Analysis Platform - Header Navigation Interactions
 */

(function() {
  'use strict';

  /**
   * 初始化导航栏功能
   */
  function initHeaderNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = ['overview', 'trends', 'warming', 'baseline', 'spiral', 'geography'];

    /**
     * 平滑滚动到指定区域
     * @param {string} targetId - 目标区域的ID
     */
    function scrollToSection(targetId) {
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        const headerHeight = document.querySelector('.climate-header').offsetHeight;
        const targetPosition = targetElement.offsetTop - headerHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    }

    /**
     * 更新导航栏活跃状态
     * @param {string} activeId - 当前活跃区域的ID
     */
    function updateActiveNavItem(activeId) {
      navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href === `#${activeId}`) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    /**
     * 检测当前可见区域
     */
    function detectCurrentSection() {
      const headerHeight = document.querySelector('.climate-header').offsetHeight;
      const scrollPosition = window.scrollY + headerHeight + 100;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i]);
        if (section && section.offsetTop <= scrollPosition) {
          updateActiveNavItem(sections[i]);
          break;
        }
      }
    }

    // 为导航项添加点击事件监听器
    navItems.forEach(item => {
      item.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        scrollToSection(targetId);
        updateActiveNavItem(targetId);
      });
    });

    // 监听滚动事件，自动更新活跃状态
    let scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(detectCurrentSection, 100);
    });

    // 页面加载完成后检测初始状态
    window.addEventListener('load', function() {
      setTimeout(detectCurrentSection, 500);
    });

    // 监听DOM变化，确保在内容加载后正确检测
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          setTimeout(detectCurrentSection, 300);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 等待DOM加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeaderNavigation);
  } else {
    initHeaderNavigation();
  }

})();