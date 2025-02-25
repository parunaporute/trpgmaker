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

  // ------- チェックボックス -------
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.style.marginRight = "10px";
  cb.style.width = "1.2rem";
  cb.style.height = "1.2rem";

  // 完了かどうか
  const isComplete = localStorage.getItem("completeStory_" + tutorial.id) === "true";
  cb.checked = isComplete;

  // ONにすると完了フラグ、OFFにすると削除
  cb.addEventListener("change", () => {
    if (cb.checked) {
      localStorage.setItem("completeStory_" + tutorial.id, "true");
      // リセットボタンなども消すため再描画
      reRenderRow();
    } else {
      localStorage.removeItem("completeStory_" + tutorial.id);
      // 再描画
      reRenderRow();
    }
  });
  row.appendChild(cb);

  // ------- タイトル（クリックで確認モーダル→OKなら実行） -------
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

  // ------- (途中)表示用の要素を準備（後で中身を確定する） -------
  const partialSpan = document.createElement("span");
  partialSpan.style.marginLeft = "10px";
  partialSpan.style.color = "#f0c040"; // お好みの色
  partialSpan.style.fontWeight = "bold";
  partialSpan.textContent = ""; // 後で "(途中)" になるかもしれない

  // ------- リセットボタン -------
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "リセット";
  resetBtn.style.marginLeft = "10px";
  resetBtn.style.width = "5rem";
  
  resetBtn.style.display = "none"; // 初期は非表示

  resetBtn.addEventListener("click", () => {
    // リセット確認
    if (!confirm(`「${tutorial.title}」の進捗をリセットしますか？`)) {
      return;
    }
    // 全page-stepフラグ削除 + completeStoryフラグ削除
    resetTutorialProgress(tutorial.id);
    // チェックボックスをOFFに
    localStorage.removeItem("completeStory_" + tutorial.id);
    cb.checked = false;
    // 再描画
    reRenderRow();
  });

  // テキストまとめ
  const textContainer = document.createElement("div");
  textContainer.style.display = "flex";
  textContainer.style.flexDirection = "column";

  textContainer.appendChild(titleLink);
  textContainer.appendChild(desc);
  textContainer.appendChild(partialSpan);
  textContainer.appendChild(resetBtn);

  row.appendChild(textContainer);

  // ---- 初期描画 or 再描画時に状態を再チェックする処理 ----
  function reRenderRow() {
    // 1) チェック状態を見直す
    const finished = localStorage.getItem("completeStory_" + tutorial.id) === "true";
    cb.checked = finished;

    // 2) (途中)かどうか判定
    //   → まだcompleteStory_...がfalse かつ 1つ以上のpageStepDone_... がtrue なら (途中)
    const partial = checkPartialSteps(tutorial.id);

    if (!finished && partial) {
      partialSpan.textContent = "(途中)";
      resetBtn.style.display = "inline-block"; // リセットボタン表示
    } else {
      partialSpan.textContent = "";
      resetBtn.style.display = "none";
    }
  }

  // 初期呼び出し
  reRenderRow();

  return row;
}

/**
 * (途中)チェック:
 *  - completeStory_ が false
 *  - かつ 1つ以上の pageStepDone_... が true
 */
function checkPartialSteps(tutorialId) {
  const isComplete = localStorage.getItem("completeStory_" + tutorialId) === "true";
  if (isComplete) {
    return false; // 完了済みなら (途中) ではない
  }

  // tutorialData.js から steps を探し、type==="page" のstep数などをチェック
  const tutorial = window.tutorials.find(t => t.id === tutorialId);
  if (!tutorial) return false;
  const pageSteps = tutorial.steps.filter(s => s.type === "page");
  // ひとつでも localStorage.getItem("pageStepDone_tutorialId_index") === "true" があれば(途中)
  for (let i = 0; i < pageSteps.length; i++) {
    const key = `pageStepDone_${tutorialId}_${i}`;
    const val = localStorage.getItem(key);
    if (val === "true") {
      return true; // 1つでもtrueがあれば(途中)
    }
  }
  return false;
}

/**
 * 指定のチュートリアルIDに関する進捗フラグを全リセット
 */
function resetTutorialProgress(tutorialId) {
  // completeStory_ フラグ削除
  localStorage.removeItem(`completeStory_${tutorialId}`);
  // pageStepDone_ フラグ削除
  const tutorial = window.tutorials.find(t => t.id === tutorialId);
  if (!tutorial) return;
  const pageSteps = tutorial.steps.filter(s => s.type === "page");
  pageSteps.forEach((step, idx) => {
    const key = `pageStepDone_${tutorialId}_${idx}`;
    localStorage.removeItem(key);
  });
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
