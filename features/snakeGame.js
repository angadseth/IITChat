// ══════════════════════════════════════════════════════
//  features/snakeGame.js  —  Opens Snake & Ladders game
// ══════════════════════════════════════════════════════

export function initSnakeGame(getState, toastFn) {
  window.openGame = () => {
    const { CU, CCI } = getState();
    if (!CCI) { toastFn('Open a chat first'); return; }
    const name = encodeURIComponent(CU?.displayName || 'Player');
    window.open(
      `game.html?cci=${encodeURIComponent(CCI)}&name=${name}`,
      'iitgame',
      'width=920,height=660,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
    );
  };
}
