// tutorialList.js
document.addEventListener("DOMContentLoaded", () => {
  const tutorialListContainer = document.getElementById("tutorial-list-container");
  if (!tutorialListContainer) return;

  // グループ情報をマッピング
  const groupMap = {};
  window.tutorialGroups.forEach(g => {
    groupMap[g.id] = g.name;
  });

  // グループごとにチュートリアルをまとめる
  const grouped = {};
  window.tutorials.forEach(t => {
    const gId = t.groupId || "others";
    if (!grouped[gId]) {
      grouped[gId] = [];
    }
    grouped[gId].push(t);
  });

  // グループ単位で出力
  Object.keys(grouped).forEach(groupId => {
    const groupName = groupMap[groupId] || groupId;
    const groupHeader = document.createElement("h3");
    groupHeader.textContent = groupName;
    tutorialListContainer.appendChild(groupHeader);

    grouped[groupId].forEach(tutorial => {
      const tutorialRow = createTutorialRow(tutorial);
      tutorialListContainer.appendChild(tutorialRow);
    });
  });
});

/**
 * 取説1件ぶんのDOMを作成（チェックボックス＋タイトル＋説明）
 */
function createTutorialRow(tutorial) {
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

  // 完了かどうか
  const isComplete = localStorage.getItem("completeStory_" + tutorial.id) === "true";
  cb.checked = isComplete;

  // チェックONなら完了フラグセット、OFFなら削除
  cb.addEventListener("change", () => {
    if (cb.checked) {
      localStorage.setItem("completeStory_" + tutorial.id, "true");
    } else {
      localStorage.removeItem("completeStory_" + tutorial.id);
    }
  });
  row.appendChild(cb);

  // タイトル（クリックで確認モーダル→OKなら実行）
  const titleLink = document.createElement("span");
  titleLink.textContent = tutorial.title;
  titleLink.style.color = "#00bfff";
  titleLink.style.textDecoration = "underline";
  titleLink.style.cursor = "pointer";
  titleLink.style.marginRight = "10px";

  titleLink.addEventListener("click", () => {
    openTutorialConfirmModal(tutorial);
  });

  // 説明文
  const desc = document.createElement("span");
  desc.textContent = tutorial.description;
  desc.style.marginRight = "10px";
  desc.style.opacity = "0.8";

  // まとめる
  const textContainer = document.createElement("div");
  textContainer.style.display = "flex";
  textContainer.style.flexDirection = "column";

  textContainer.appendChild(titleLink);
  textContainer.appendChild(desc);

  row.appendChild(textContainer);

  return row;
}

/**
 * 「この取説を実行しますか？」モーダル
 */
function openTutorialConfirmModal(tutorial) {
  const modal = document.getElementById("tutorial-confirm-modal");
  const msg = document.getElementById("tutorial-confirm-message");
  const okBtn = document.getElementById("tutorial-confirm-ok");
  const cancelBtn = document.getElementById("tutorial-confirm-cancel");

  if (!modal || !msg || !okBtn || !cancelBtn) return;

  msg.textContent = `${tutorial.title} を実行しますか？`;

  modal.classList.add("active");

  const closeModal = () => {
    modal.classList.remove("active");
  };

  okBtn.onclick = () => {
    closeModal();
    // index.html にパラメータ付きで飛ぶ
    const url = `index.html?forceTutorial=${encodeURIComponent(tutorial.id)}`;
    window.location.href = url;
  };

  cancelBtn.onclick = () => {
    closeModal();
  };
}
