/*******************************************************
 * common.js
 * アプリ全体で使い回す共通関数をまとめるファイルです。
 *******************************************************/

/**
 * 簡易トーストメッセージの表示
 * （画面右下にふわっと3秒ほど出す）
 */
function showToast(message) {
  // 既存トーストがあれば削除
  const oldToast = document.getElementById("toast-message");
  if (oldToast) {
    oldToast.remove();
  }

  // 新規トースト要素を作成
  const toast = document.createElement("div");
  toast.id = "toast-message";
  toast.textContent = message;

  // スタイル設定
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  toast.style.color = "#fff";
  toast.style.padding = "10px 20px";
  toast.style.borderRadius = "4px";
  toast.style.fontSize = "14px";
  toast.style.zIndex = "9999";
  toast.style.opacity = "0";
  toast.style.transition = "opacity 0.3s ease";

  document.body.appendChild(toast);

  // フェードイン
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  // 3秒後にフェードアウトして削除
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}
window.addEventListener("DOMContentLoaded", async () => {

  // 「取説」ボタンのクリックで tutorialList.html へ遷移
  const tutorialButton = document.getElementById("open-tutorial-list-button");
  tutorialButton.addEventListener("click", () => {
    window.location.href = "tutorialList.html";
  });
});