// ══════════════════════════════════════════════
//  features/msgMenu.js — Message context menu
//  Premium action buttons + separate reaction row
// ══════════════════════════════════════════════

const REACTS = ['❤️','😂','😮','😢','👍','🔥','🎉','😍','💀','🤣'];

// ── Escape JS string literal (for onclick attributes) ──
const escJ = s => String(s)
  .replace(/\\/g,'\\\\').replace(/'/g,"\\'")
  .replace(/"/g,'\\"').replace(/\n/g,'\\n');

// ── SVG icons ──
const IC = {
  reply: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l5-5v3c5 0 9 2.5 10 9-2-4.5-5-6-10-6V13L2 9z"/></svg>`,
  copy:  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="10" rx="2"/><path d="M4 13V4a1 1 0 011-1h8"/></svg>`,
  del:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M8 6V4h4v2M7 6l1 10h4l1-10"/></svg>`,
};

export function initMsgMenu(getState, focusInput) {
  window.showRP = (e, bub, mid, isMe) => {
    e.stopPropagation();
    document.querySelectorAll('.rpk').forEach(p => p.remove());

    // Derive text + sender name from DOM
    const msgRow     = bub.closest('.mr');
    const msgText    = msgRow?.querySelector('.bub')?.innerText?.trim()   || '';
    const domName    = msgRow?.querySelector('.msn')?.textContent?.trim() || '';
    const { CU, CCT } = getState();
    const senderName = isMe ? (CU?.displayName || 'You') : (domName || CCT?.name || '');

    const cl = `document.querySelectorAll('.rpk').forEach(p=>p.remove());`;

    const picker = document.createElement('div');
    picker.className = 'rpk';
    picker.innerHTML = `
      <div class="rpk-actions">
        <button class="rpk-act" onclick="${cl}window.setReply('${escJ(mid)}','${escJ(msgText)}','${escJ(senderName)}')" title="Reply">
          ${IC.reply}<span>Reply</span>
        </button>
        <button class="rpk-act" onclick="${cl}window.copyMsg('${escJ(mid)}')" title="Copy text">
          ${IC.copy}<span>Copy</span>
        </button>
      </div>
      <div class="rpk-sep"></div>
      <div class="rpk-reacts">
        <span class="rpk-rlbl">React</span>
        <div class="rpk-emojis">
          ${REACTS.map(r =>
            `<button class="rpk-em" onclick="${cl}window.addRct('${mid}','${escJ(r)}')">${r}</button>`
          ).join('')}
        </div>
      </div>`;

    bub.appendChild(picker);

    // Close on outside click
    setTimeout(() => document.addEventListener('click', () => {
      picker.remove();
    }, { once: true }), 50);
  };
}
