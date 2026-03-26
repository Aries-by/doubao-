// ==UserScript==
// @name         豆包去水印
// @namespace    http://tampermonkey.net/
// @version      3.1.1
// @description  精简版UI
// @author       Gemini
// @match        https://www.doubao.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=doubao.com
// @grant        none
// @license      GPL-3.0
// ==/UserScript==

(function() {
    'use strict';

    let isCollapsed = true;
    let isDragging = false;
    let startX, startY, initialX, initialY;
    const MAX_LOG_COUNT = 30;
    const POS_KEY = 'db_helper_saved_pos';

    const styles = `
        #db-helper-wrapper {
            position: fixed;
            bottom: 80px;
            right: 16px;
            z-index: 2147483647;
            touch-action: none; 
            user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            transition: opacity 0.3s ease;
        }
        #db-helper-ball {
            width: 40px;
            height: 40px;
            background: #10a37f;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(16, 163, 127, 0.3);
            cursor: move;
            transition: transform 0.2s, background 0.2s;
            color: #ffffff;
            font-size: 16px;
            font-weight: 600;
        }
        #db-helper-ball:active { transform: scale(0.9); }
        #db-helper-panel {
            width: 260px;
            background: #ffffff;
            border: 1px solid #e5e5e5;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
            display: none;
            flex-direction: column;
            overflow: hidden;
            transform-origin: bottom right;
        }
        .is-expanded #db-helper-ball { display: none; }
        .is-expanded #db-helper-panel { display: flex; animation: panelShow 0.15s ease-out; }
        #db-helper-header {
            padding: 8px 12px;
            background: #fcfcfc;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
        }
        #db-helper-title { font-size: 12px; font-weight: 600; color: #1a1a1a; }
        #db-helper-close { cursor: pointer; padding: 2px 6px; color: #999; font-size: 18px; line-height: 1; border-radius: 4px; }
        #db-helper-close:hover { background: #f0f0f0; color: #333; }
        #db-helper-log-container {
            height: 150px;
            overflow-y: auto;
            padding: 10px;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.5;
        }
        .log-entry { margin-bottom: 4px; border-bottom: 1px solid #f8f8f8; padding-bottom: 4px; }
        .log-time { color: #ccc; margin-right: 6px; font-size: 10px; }
        .log-msg-info { color: #666; }
        .log-msg-success { color: #10a37f; font-weight: 500; }
        .log-msg-error { color: #f33; }
        #db-helper-log-container::-webkit-scrollbar { width: 4px; }
        #db-helper-log-container::-webkit-scrollbar-thumb { background: #eee; border-radius: 4px; }
        @keyframes panelShow {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
    `;

    function addLog(message, type = 'info') {
        const container = document.getElementById('db-helper-log-container');
        if (!container) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        entry.innerHTML = `<span class="log-time">${timeStr}</span><span class="log-msg-${type}">${message}</span>`;
        container.appendChild(entry);
        while (container.children.length > MAX_LOG_COUNT) {
            container.removeChild(container.firstChild);
        }
        container.scrollTop = container.scrollHeight;
    }

    function enforceBoundaries(element) {
        const rect = element.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        let nL = Math.max(0, Math.min(maxX, rect.left));
        let nT = Math.max(0, Math.min(maxY, rect.top));
        element.style.left = nL + 'px';
        element.style.top = nT + 'px';
    }

    function initUI() {
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        const wrapper = document.createElement('div');
        wrapper.id = 'db-helper-wrapper';
        wrapper.innerHTML = `
            <div id="db-helper-ball">豆</div>
            <div id="db-helper-panel">
                <div id="db-helper-header">
                    <div id="db-helper-title">豆包助手</div>
                    <div id="db-helper-close">×</div>
                </div>
                <div id="db-helper-log-container"></div>
            </div>
        `;
        document.body.appendChild(wrapper);

        const ball = document.getElementById('db-helper-ball');
        const header = document.getElementById('db-helper-header');
        const closeBtn = document.getElementById('db-helper-close');

        const savedPos = localStorage.getItem(POS_KEY);
        if (savedPos) {
            try {
                const p = JSON.parse(savedPos);
                wrapper.style.bottom = 'auto';
                wrapper.style.right = 'auto';
                wrapper.style.left = p.left + 'px';
                wrapper.style.top = p.top + 'px';
                requestAnimationFrame(() => enforceBoundaries(wrapper));
            } catch (e) {}
        }

        const onStart = (e) => {
            if (e.target === closeBtn) return;
            isDragging = false;
            const touch = e.type === 'touchstart' ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = wrapper.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            wrapper.style.bottom = 'auto';
            wrapper.style.right = 'auto';
            wrapper.style.left = initialX + 'px';
            wrapper.style.top = initialY + 'px';
            document.addEventListener(e.type === 'touchstart' ? 'touchmove' : 'mousemove', onMove, { passive: false });
            document.addEventListener(e.type === 'touchstart' ? 'touchend' : 'mouseup', onEnd);
        };

        const onMove = (e) => {
            const touch = e.type === 'touchmove' ? e.touches[0] : e;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                isDragging = true;
                e.preventDefault(); 
                let nX = Math.max(0, Math.min(window.innerWidth - wrapper.offsetWidth, initialX + dx));
                let nY = Math.max(0, Math.min(window.innerHeight - wrapper.offsetHeight, initialY + dy));
                wrapper.style.left = nX + 'px';
                wrapper.style.top = nY + 'px';
            }
        };

        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchend', onEnd);
            if (isDragging) {
                const rect = wrapper.getBoundingClientRect();
                localStorage.setItem(POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
            }
        };

        window.addEventListener('resize', () => enforceBoundaries(wrapper));
        ball.addEventListener('mousedown', onStart);
        ball.addEventListener('touchstart', onStart);
        header.addEventListener('mousedown', onStart);
        header.addEventListener('touchstart', onStart);
        ball.addEventListener('click', () => {
            if (isDragging) return;
            wrapper.classList.add('is-expanded');
            setTimeout(() => enforceBoundaries(wrapper), 30);
        });
        closeBtn.onclick = () => {
            wrapper.classList.remove('is-expanded');
            setTimeout(() => enforceBoundaries(wrapper), 30);
        };
        addLog("已就绪", "success");
    }

    function findAllKeysInJson(obj, key) {
        const results = [];
        function search(current) {
            if (current && typeof current === 'object') {
                if (!Array.isArray(current) && Object.prototype.hasOwnProperty.call(current, key)) {
                    results.push(current[key]);
                }
                const items = Array.isArray(current) ? current : Object.values(current);
                for (const item of items) search(item);
            }
        }
        search(obj);
        return results;
    }

    let _parse = JSON.parse;
    JSON.parse = function(data) {
        let jsonData;
        try { jsonData = _parse(data); } catch (e) { return _parse(data); }
        if (typeof data === 'string' && data.includes('creations')) {
            try {
                let creations = findAllKeysInJson(jsonData, 'creations');
                if (creations.length > 0) {
                    let count = 0;
                    creations.forEach(c => {
                        if (Array.isArray(c)) {
                            c.forEach(item => {
                                if (item.image?.image_ori_raw?.url) {
                                    const raw = item.image.image_ori_raw.url;
                                    item.image.image_ori.url = raw;
                                    item.image.image_preview.url = raw;
                                    item.image.image_thumb.url = raw;
                                    count++;
                                }
                            });
                        }
                    });
                    if (count > 0) {
                        addLog(`拦截 ${count} 张图`, "info");
                        addLog(`已换为无水印原图`, "success");
                    }
                }
            } catch (err) {}
        }
        return jsonData;
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') initUI();
    else document.addEventListener('DOMContentLoaded', initUI);
})();