// tutorialManager.js
(function(){
  if (!window.tutorials || !Array.isArray(window.tutorials)) {
    console.warn("No tutorials found.");
    return;
  }

  document.addEventListener("DOMContentLoaded", initTutorial);

  function initTutorial() {
    for (const story of window.tutorials) {
      if (localStorage.getItem("skipStory_" + story.id) === "true") continue;
      if (localStorage.getItem("completeStory_" + story.id) === "true") continue;

      for (const step of story.steps) {
        if (step.type === "page") {
          if (isCurrentPage(step.match)) {
            startStep(story, step);
            break;
          }
        } else if (step.type === "click") {
          const el = document.querySelector(step.match);
          if (el) {
            el.addEventListener("click", () => startStep(story, step), { once:true });
          }
        }
      }
    }
  }

  function startStep(story, step) {
    if (!step.subSteps || step.subSteps.length === 0) {
      // 単発
      showDialogWithHighlight(story.title, step.message, null, (action)=>{
        if (action.skip) {
          localStorage.setItem("skipStory_" + story.id, "true");
        } else if (action.ok) {
          localStorage.setItem("completeStory_" + story.id, "true");
        }
      });
      return;
    }
    let currentSub = 0;
    function showNextSub() {
      if (currentSub >= step.subSteps.length) {
        localStorage.setItem("completeStory_" + story.id, "true");
        return;
      }
      const sub = step.subSteps[currentSub];
      showDialogWithHighlight(story.title, sub.message, sub.highlightSelector, (action)=>{
        if (action.skip) {
          localStorage.setItem("skipStory_" + story.id, "true");
        } else if (action.cancel) {
          // 中断
        } else if (action.ok) {
          currentSub++;
          showNextSub();
        }
      });
    }
    showNextSub();
  }

  /**
   * ダイアログ表示:
   * 1) overlay
   * 2) dialog box (opacity=0 → scroll完了後にopacity=1でフェードイン)
   * 3) highlightSelectorがあれば scrollIntoView + waitForScrollEnd
   * 4) positionDialog
   */
  function showDialogWithHighlight(title, message, highlightSelector, onClose) {
    // overlay
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.4)";
    overlay.style.zIndex = 9998;

    // dialog box
    const box = document.createElement("div");
    box.style.position = "absolute";
    box.style.zIndex = 10000;
    box.style.background = "rgb(255 242 207 / 88%)";
    box.style.color = "#000";

    box.style.padding = "15px";
    box.style.borderRadius = "2px";
    box.style.width = "300px";
    box.style.boxSizing = "border-box";
    box.style.opacity = "0";  // 初期は透明
    box.style.transition = "opacity 0.25s";

    // Title
    const h2 = document.createElement("h2");
    h2.textContent = title;
    box.appendChild(h2);

    // Message
    const p = document.createElement("p");
    p.textContent = message;
    box.appendChild(p);

    // 「次は表示しない」
    const skipWrap = document.createElement("div");
    skipWrap.style.margin = "8px 0";
    const skipCheck = document.createElement("input");
    skipCheck.type = "checkbox";
    skipCheck.id = "tutorial-skip-checkbox";
    const skipLabel = document.createElement("label");
    skipLabel.setAttribute("for", "tutorial-skip-checkbox");
    skipLabel.textContent = "次は表示しない";
    skipWrap.appendChild(skipCheck);
    skipWrap.appendChild(skipLabel);
    box.appendChild(skipWrap);

    // ボタン (次へ / キャンセル)
    const btnWrap = document.createElement("div");
    btnWrap.style.display = "flex";
    btnWrap.style.justifyContent = "center";
    btnWrap.style.gap = "10px";

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "次へ";
    nextBtn.addEventListener("click", () => {
      closeDialog({ ok:true, skip:skipCheck.checked, cancel:false });
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "キャンセル";
    cancelBtn.addEventListener("click", () => {
      closeDialog({ ok:false, skip:skipCheck.checked, cancel:true });
    });

    btnWrap.appendChild(nextBtn);
    btnWrap.appendChild(cancelBtn);
    box.appendChild(btnWrap);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // highlight
    let highlightEl = null;
    if (highlightSelector) {
      highlightEl = document.querySelector(highlightSelector);
      if (highlightEl) {
        highlightEl.classList.add("tutorial-highlight");
        // scrollIntoView
        highlightEl.scrollIntoView({ block:"center", inline:"center", behavior:"smooth" });
        // スクロール完了待ち
        waitForScrollEnd(highlightEl, () => {
          positionDialogWithAvoidOverlap(box, highlightEl);
          requestAnimationFrame(()=> {
            box.style.opacity="1"; // フェードイン
          });
        });
      } else {
        positionCenter(box);
        requestAnimationFrame(()=> { box.style.opacity="1"; });
      }
    } else {
      positionCenter(box);
      requestAnimationFrame(()=> { box.style.opacity="1"; });
    }

    function removeHighlight() {
      if (highlightEl) {
        highlightEl.classList.remove("tutorial-highlight");
      }
    }
    function closeDialog(actionObj) {
      removeHighlight();
      document.body.removeChild(overlay);
      if (onClose) onClose(actionObj);
    }
  }

  // スクロール完了をポーリング
  function waitForScrollEnd(el, onDone) {
    let stableCount = 0;
    let lastTop = null;
    function step() {
      const rect = el.getBoundingClientRect();
      const nowTop = rect.top;
      if (lastTop !== null && Math.abs(nowTop - lastTop) < 0.5) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastTop = nowTop;
      if (stableCount > 5) {
        onDone();
      } else {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // 位置決め (上下 → 重なり → 横ずらし → 画面端クリップ)
  function positionDialogWithAvoidOverlap(dialog, hlEl) {
    const rect = hlEl.getBoundingClientRect();
    const dw = dialog.offsetWidth;
    const dh = dialog.offsetHeight;

    // 1) 上下に配置
    const spaceBelow = window.innerHeight - rect.bottom;
    let topPos;
    if (spaceBelow > dh + 10) {
      // 下
      topPos = rect.bottom + 10;
    } else {
      // 上
      topPos = rect.top - dh - 10;
    }
    let leftPos = rect.left;

    // 2) 画面端クリップ(仮)
    if (topPos < 0) topPos = 0;
    if (leftPos + dw > window.innerWidth) {
      leftPos = window.innerWidth - dw - 10;
    }
    if (leftPos < 0) leftPos = 0;

    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";

    // 3) 重なりチェック → overlap してたら横ずらし
    //   bounding box の重複を判定
    const boxRect = dialog.getBoundingClientRect();
    if (checkOverlap(rect, boxRect)) {
      // 重なり有り → 左右にずらす
      shiftHorizontallyToAvoidOverlap(dialog, rect, boxRect);
    }

    // 4) 最終的な画面端クリップ
    finalClip(dialog);
  }

  // bounding box が重なっているかチェック
  function checkOverlap(r1, r2) {
    const overlapX = (r1.left < r2.right) && (r1.right > r2.left);
    const overlapY = (r1.top < r2.bottom) && (r1.bottom > r2.top);
    return (overlapX && overlapY);
  }

  // 左右どちらかにずらして重なり回避
  function shiftHorizontallyToAvoidOverlap(dialog, highlightRect, boxRect) {
    // 例: ハイライト要素の x 中心点を比較して
    // 画面中央 or highlightRect中心より左にあるなら 右にずらす、といった判断
    const highlightCenterX = (highlightRect.left + highlightRect.right)/2;
    const screenCenterX = window.innerWidth / 2;
    const dw = boxRect.width;
    const leftNow = boxRect.left;

    let newLeft;
    if (highlightCenterX < screenCenterX) {
      // ハイライトが画面の左寄り → ダイアログを highlight右側 に置く
      newLeft = highlightRect.right + 10;
    } else {
      // 右寄り → ダイアログを highlight左側 - 幅
      newLeft = highlightRect.left - dw - 10;
    }
    if (newLeft < 0) newLeft = 0;
    if (newLeft + dw > window.innerWidth) {
      newLeft = window.innerWidth - dw - 10;
    }

    dialog.style.left = newLeft + "px";
  }

  // 画面端クリップ
  function finalClip(dialog) {
    const boxRect = dialog.getBoundingClientRect();
    let topPos = boxRect.top;
    let leftPos = boxRect.left;
    const dw = boxRect.width;
    const dh = boxRect.height;

    if (topPos < 0) topPos = 0;
    if (topPos + dh > window.innerHeight) {
      topPos = window.innerHeight - dh - 10;
      if (topPos < 0) topPos = 0; 
    }

    if (leftPos < 0) leftPos = 0;
    if (leftPos + dw > window.innerWidth) {
      leftPos = window.innerWidth - dw - 10;
      if (leftPos < 0) leftPos = 0;
    }
    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";
  }

  // 画面中央に配置(ハイライト無し)
  function positionCenter(dialog) {
    const dw = dialog.offsetWidth;
    const dh = dialog.offsetHeight;
    let topPos = (window.innerHeight - dh)/2;
    let leftPos = (window.innerWidth - dw)/2;
    if (topPos < 0) topPos=0;
    if (leftPos < 0) leftPos=0;
    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";
  }

  function isCurrentPage(pageName) {
    const currentFile = location.pathname.split("/").pop();
    return (currentFile === pageName);
  }

})();
