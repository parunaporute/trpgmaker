function initCarousel() {
  const track = document.querySelector(".carousel-track");
  if (!track) return;

  let cells = Array.from(track.querySelectorAll(".carousel-cell"));
  if (cells.length < 1) return;

  const tabBtns = Array.from(document.querySelectorAll(".carousel-tab"));

  // 1) 先頭と末尾のクローンを作る（is-clonedクラス付与）
  const firstClone = cells[0].cloneNode(true);
  firstClone.classList.add("is-cloned");
  const lastClone = cells[cells.length - 1].cloneNode(true);
  lastClone.innerHTML = "";
  lastClone.classList.add("is-cloned");
  track.appendChild(firstClone);
  track.insertBefore(lastClone, track.firstElementChild);

  // 2) クローンを含む全セルを再取得
  let allCells = Array.from(track.querySelectorAll(".carousel-cell"));

  let currentIndex = 1; // 初期は「先頭クローンの直後」＝1
  let cellWidth = 0;
  let currentTranslate = 0;
  let prevTranslate = 0;
  let isDragging = false;
  let startX = 0;
  let animationId = 0;

  // 3) タブボタンクリックで移動
  tabBtns.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      currentIndex = i + 1; // クローンが1枚あるので＋1
      setPositionByIndex(true);
      updateActiveTab(i);
    });
  });

  function updateActiveTab(realIndex) {
    tabBtns.forEach(t => t.classList.remove("active"));
    if (tabBtns[realIndex]) {
      tabBtns[realIndex].classList.add("active");
    }
  }

  // 4) ウィンドウリサイズや初期表示時にセル幅を計測
  function updateCellWidth() {
    const anyCell = allCells[0];
    if (!anyCell) return;
    cellWidth = anyCell.offsetWidth;
    if (!cellWidth) {
      requestAnimationFrame(updateCellWidth);
      return;
    }
    setPositionByIndex(false);
  }

  window.addEventListener("resize", updateCellWidth);
  updateCellWidth();

  // 5) ドラッグ / スワイプ関連
  track.addEventListener("pointerdown", dragStart);
  track.addEventListener("pointermove", dragAction);
  track.addEventListener("pointerup", dragEnd);
  track.addEventListener("pointercancel", dragEnd);
  track.addEventListener("pointerleave", dragEnd);

  function dragStart(e) {
    if (!cellWidth) return;

    const tag = e.target.tagName.toLowerCase();
    if (["textarea", "input", "button", "select"].includes(tag)) {
      return;
    }

    isDragging = true;
    track.style.transition = "none";
    startX = e.clientX;
    prevTranslate = currentTranslate;
    animationId = requestAnimationFrame(animation);
  }

  function dragAction(e) {
    if (!isDragging) return;
    const currentX = e.clientX;
    const diff = currentX - startX;
    currentTranslate = prevTranslate + diff;

    // クローンを含む範囲内で強制クリップ
    const maxTranslate = 0;
    const minTranslate = -cellWidth * (allCells.length - 1);
    if (currentTranslate > maxTranslate) {
      currentTranslate = maxTranslate;
    } else if (currentTranslate < minTranslate) {
      currentTranslate = minTranslate;
    }

    e.preventDefault(); // スクロール制御
  }

  function dragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    cancelAnimationFrame(animationId);

    const movedBy = currentTranslate - prevTranslate;
    const threshold = cellWidth * 0.1;
    if (movedBy < -threshold) {
      currentIndex++;
    } else if (movedBy > threshold) {
      currentIndex--;
    }

    setPositionByIndex(true);
  }

  function animation() {
    track.style.transform = `translateX(${currentTranslate}px)`;
    if (isDragging) requestAnimationFrame(animation);
  }

  // 6) インデックスに応じた位置へ移動
  function setPositionByIndex(smooth) {
    const oldTransform = track.style.transform; // 変更前のtransform

    if (smooth) {
      track.style.transition = "transform 0.3s";
    } else {
      track.style.transition = "none";
    }
    currentTranslate = -cellWidth * currentIndex;
    const newTransform = `translateX(${currentTranslate}px)`;
    track.style.transform = newTransform;

    // もしトランスフォームが変化しない（＝トランジションが発火しない）ならフォールバック
    if (smooth && oldTransform === newTransform) {
      handleTransitionEndManually();
    }
  }

  // 7) transitionend でクローンセルかを判定し、本物セルへ飛ばす
  track.addEventListener("transitionend", () => {
    handleTransitionEndManually();
  });

  // 8) 手動フォールバック呼び出し用の関数
  function handleTransitionEndManually() {
    // 幅未確定なら何もしない
    if (!cellWidth) return;

    // もし先頭クローン(index=0)にいる
    if (currentIndex === 0) {
      track.style.transition = "none";
      currentIndex = cells.length; // 本物の末尾
      currentTranslate = -cellWidth * currentIndex;
      track.style.transform = `translateX(${currentTranslate}px)`;
    }
    // もし末尾クローン(index=allCells.length - 1)にいる
    else if (currentIndex === allCells.length - 1) {
      track.style.transition = "none";
      currentIndex = 1; // 本物の先頭
      currentTranslate = -cellWidth * currentIndex;
      track.style.transform = `translateX(${currentTranslate}px)`;
    }

    // タブ更新
    let realIndex = currentIndex - 1;
    if (realIndex < 0) realIndex = 0;
    if (realIndex >= cells.length) realIndex = cells.length - 1;
    updateActiveTab(realIndex);
  }
}

// 複製セルに含まれるIDを削除
function removeDuplicateIDs() {
  // クローンセル（.is-cloned）を探す
  const clonedCells = document.querySelectorAll(".carousel-cell.is-cloned");
  // 配下にある id を削除
  clonedCells.forEach(cell => {
    const elemsWithId = cell.querySelectorAll("[id]");
    elemsWithId.forEach(el => {
      el.removeAttribute("id");
    });
  });
}
