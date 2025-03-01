/********************************
 * sceneGlobals.js
 * グローバル変数や共通定数などを集めたファイル
 ********************************/

// -------------------------------
// ▼ グローバル変数
// -------------------------------
window.apiKey = '';

// シーン一覧
window.scenes = [];

// シナリオ全体の情報
window.currentScenarioId = null;
window.currentScenario = null;
window.scenarioType = null;
window.clearCondition = null;
window.sections = [];

// リクエストキャンセル用
window.currentRequestController = null;
window.cancelRequested = false;

// 要約をメモリ上でも管理
window.sceneSummaries = []; // sceneSummaries[chunkIndex] = { en: '...', ja: '...' }

// 選択されたアイテムを保持するための変数（アイテム使用用）
window.selectedItem = null;

// DOMPurify 用設定
window.DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "hr", "h3", "h4", "h5", "span", "div", "strong", "em"],
  ALLOWED_ATTR: ["style"]
};
