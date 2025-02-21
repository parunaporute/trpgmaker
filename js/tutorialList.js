// tutorialList.js
document.addEventListener("DOMContentLoaded", () => {
  const tutorialListContainer = document.getElementById("tutorial-list-container");
  if (!tutorialListContainer) return;

  // グループ（tutorialGroups）をもとに見出し表示
  // tutorialGroups: [{id: "basic", name: "基本編"}, {id: "advanced", name: "応用編"}...]
  // tutorials: [{id, title, description, groupId, ...}, ...]

  // グループID -> グループ情報
  const groupMap = {};
  window.tutorialGroups.forEach(g => {
    groupMap[g.id] = g.name;
  });

  // グループごとにまとめる
  // { basic: [tutorial1, tutorial2...], advanced: [tutorial3...] }
  const grouped = {};
  window.tutorials.forEach(t => {
    const gId = t.groupId || "others";
    if (!grouped[gId]) {
      grouped[gId] = [];
    }
    grouped[gId].push(t);
  });

  // グループIDの順番で出力
  Object.keys(grouped).forEach(groupId => {
    // グループ名を表示
    const groupName = groupMap[groupId] || groupId;
    const groupHeader = document.createElement("h3");
    groupHeader.textContent = groupName;
    tutorialListContainer.appendChild(groupHeader);

    // グループ内の取説一覧
    grouped[groupId].forEach(tutorial => {
      const tutorialRow = createTutorialRow(tutorial);
      tutorialListContainer.appendChild(tutorialRow);
    });
  });
});

/**
 * 取説1件ぶんのDOMを作成
 * ・チェックボックス
 * ・タイトル（リンク）
 * ・説明文
 */
function createTutorialRow(tutorial) {
  // 親要素
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "flex-start";
  row.style.marginBottom = "10px";

  // チェックボックス
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.style.marginRight = "10px";
  cb.style.width = "1.2rem";
  cb.style.height = "1.2rem";

  // 取説が完了済み or スキップ扱いかどうか
  const isComplete = localStorage.getItem("completeStory_" + tutorial.id) === "true"
    || localStorage.getItem("skipStory_" + tutorial.id) === "true";

  if (isComplete) {
    cb.checked = true;
  }

  cb.addEventListener("change", () => {
    if (cb.checked) {
      // チェックつけた → completeStory_xxx をセット
      localStorage.setItem("completeStory_" + tutorial.id, "true");
      // 今回は skipStory_xxx は触らない（スキップ状態も同じフラグで扱わない方針なら空のまま）
      // ※ご要望により「スキップも完了と同じフラグでOK」とのことならこちらは不要
    } else {
      // チェック外した → completeStory_xxx, skipStory_xxx とも削除
      localStorage.removeItem("completeStory_" + tutorial.id);
      localStorage.removeItem("skipStory_" + tutorial.id);
    }
  });

  row.appendChild(cb);

  // タイトル（リンク相当: クリックで確認モーダルを表示 → OK押下で実行）
  const titleLink = document.createElement("span");
  titleLink.textContent = tutorial.title;
  titleLink.style.color = "#00bfff";
  titleLink.style.textDecoration = "underline";
  titleLink.style.cursor = "pointer";
  titleLink.style.marginRight = "10px";

  titleLink.addEventListener("click", () => {
    // 「この取説を実行しますか？」モーダルを表示
    openTutorialConfirmModal(tutorial);
  });

  // 説明文
  const desc = document.createElement("span");
  desc.textContent = tutorial.description;
  desc.style.marginRight = "10px";
  desc.style.opacity = "0.8";

  // タイトルや説明をまとめる内包要素
  const textContainer = document.createElement("div");
  textContainer.style.display = "flex";
  textContainer.style.flexDirection = "column";

  textContainer.appendChild(titleLink);
  textContainer.appendChild(desc);

  row.appendChild(textContainer);

  return row;
}

/**
 * 「この取説を実行しますか？」という確認モーダル
 * OKで、index.html にパラメータ付きで飛ぶ （例: ?forceTutorial=story1）
 */
function openTutorialConfirmModal(tutorial) {
  const modal = document.getElementById("tutorial-confirm-modal");
  const msg = document.getElementById("tutorial-confirm-message");
  const okBtn = document.getElementById("tutorial-confirm-ok");
  const cancelBtn = document.getElementById("tutorial-confirm-cancel");

  if (!modal || !msg || !okBtn || !cancelBtn) return;

  msg.textContent = `${tutorial.title} を実行しますか？`;

  // 表示
  modal.classList.add("active");

  // ボタンクリックで閉じる
  const closeModal = () => {
    modal.classList.remove("active");
  };

  okBtn.onclick = () => {
    closeModal();
    // index.html へ遷移し、クエリパラメータで強制実行
    const url = `index.html?forceTutorial=${encodeURIComponent(tutorial.id)}`;
    window.location.href = url;
  };

  cancelBtn.onclick = () => {
    closeModal();
  };
}
