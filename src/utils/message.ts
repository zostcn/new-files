/**
 * 极简全局提示，替代 UI 组件库的 Message 插件
 */
type MessageType = 'success' | 'error' | 'info';

const COLORS: Record<MessageType, string> = {
  success: '#00a870',
  error: '#d54941',
  info: '#0052d9',
};

const DURATION = 3000;

let container: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement('div');
    container.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
    document.body.appendChild(container);
  }
  return container;
}

function show(type: MessageType, text: string) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `padding:8px 16px;border-radius:4px;font-size:14px;line-height:1.5;color:#fff;background:${COLORS[type]};box-shadow:0 2px 8px rgba(0,0,0,.15);transition:opacity .2s;`;
  getContainer().appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, DURATION);
}

export const message = {
  success: (text: string) => show('success', text),
  error: (text: string) => show('error', text),
  info: (text: string) => show('info', text),
};
