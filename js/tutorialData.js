// tutorialData.js

window.tutorialGroups = [
  { id: "basic", name: "基本編" },
  { id: "advanced", name: "応用編" }
];

window.tutorials = [
  // 既存のtutorial定義がある場合はそのまま残す
  {
    id: "story1",
    title: "メインページのボタン説明",
    description: "indexページにあるボタンの使い方を順番に説明します。",
    groupId: "basic",
    steps: [
      {
        type: "page",
        match: "index.html",
        message: "indexページの取説開始",
        subSteps: [
          {
            message: "ガチャボタン: キャラ生成画面へ移動します。",
            highlightSelector: "#character-create"
          },
          {
            message: "パーティボタン: 作成したキャラを編成・管理します。",
            highlightSelector: "#party-list"
          },
          {
            message: "倉庫: ガチャで引いたカードが収納されています。",
            highlightSelector: "#show-warehouse-btn"
          },
        ]
      }
    ]
  },
  {
    id: "story3",
    title: "高度な倉庫管理",
    description: "倉庫画面でのソートやフィルタリングなど高度な機能を紹介します。",
    groupId: "advanced",
    steps: [
      // 省略
    ]
  },

  // ======= 既存の「あなたの分身を作成しよう」などがあればそのまま =======
  {
    id: "createAvatar",
    title: "あなたの分身を作成しよう",
    description: "自分だけのアバターを作成するチュートリアルです。",
    groupId: "basic",
    steps: [
      {
        type: "page",
        match: "index.html",
        message: "「あなたの分身」機能の使い方を学びましょう。",
        subSteps: [
          {
            // (1) あなたの分身ボタンを押させる
            message: "まずは「あなたの分身」ボタンを押してください。",
            highlightSelector: "#you-avatar-btn",
            removeOkButton: true,   // 「次へ」ボタンを非表示
            waitForClickOn: "#you-avatar-btn"
          },
          {
            // (2) 名前を入力
            message: "モーダルが開きました。まずは名前を入力しましょう。",
            highlightSelector: "#avatar-name"
          },
          {
            // (3) 性別を入力
            message: "性別を選択してください。",
            highlightSelector: "#avatar-gender-chips"
          },
          {
            // (4) 特技
            message: "特技を入力しましょう。",
            highlightSelector: "#avatar-skill"
          },
          {
            // (5) カードのセリフ
            message: "続いてカードのセリフを入力してください。",
            highlightSelector: "#avatar-serif"
          },
          {
            // (6) レア度
            message: "レア度を選択しましょう。",
            highlightSelector: "#avatar-rarity-chips"
          },
          {
            // (7) 画像生成
            message: "画像生成ボタンを押してみましょう。（押下後は完了までしばらくお待ちください）",
            highlightSelector: ".gen-image-btn"
          },
          {
            // (8) 保存ボタン
            message: "最後に、保存ボタンを押しましょう。",
            highlightSelector: "#avatar-save-btn"
          },
          {
            // (9) 完成
            message: "以上でアバターが完成です！"
          }
        ]
      }
    ]
  },

  // ================================
  // 新規追加「シナリオの作成と進行」
  // ================================
  {
    id: "scenarioCreation",
    title: "シナリオの作成と進行",
    description: "index.html → scenarioWizard.html → scenario.html の流れで新しいシナリオを作成・進行します。",
    groupId: "basic",
    steps: [
      // ---------- index.html ----------
      {
        type: "page",
        match: "index.html",
        message: "シナリオの作成と進行：まずは index.html での操作です。",
        subSteps: [
          {
            message: "「新しいシナリオを始める」ボタンを押してください。",
            highlightSelector: "#start-new-scenario-button",
            removeOkButton: true,   // 次へボタン非表示
            waitForClickOn: "#start-new-scenario-button"
          }
        ]
      },

      // ---------- scenarioWizard.html ----------
      {
        type: "page",
        match: "scenarioWizard.html",
        message: "次にウィザード画面(scenarioWizard.html)で操作を行います。",
        subSteps: [
          {
            message: "あなたの分身（パーティ）を選んでください。",
            highlightSelector: "#wizard-party-list"
          },
          {
            message: "選び終えたら「次へ」ボタンを押しましょう。",
            highlightSelector: "#go-wizard-step1-btn",
            removeOkButton: true,
            waitForClickOn: "#go-wizard-step1-btn"
          },
          {
            message: "ジャンル選択チップで「自由入力」を選択してください。",
            highlightSelector: "#choice-free"
          },
          {
            message: "自由入力ジャンルテキストボックスに「ミステリー」と入力しましょう。",
            highlightSelector: "#free-genre-input"
          },
          {
            message: "「次へ」ボタンを押します。",
            highlightSelector: "#go-step2-btn",
            removeOkButton: true,
            waitForClickOn: "#go-step2-btn"
          },
          {
            message: "「目標達成型（目的達成型）」ボタンを押しましょう。",
            highlightSelector: "#type-objective-btn"
          },
          {
            message: "モーダルでOKを押下し、キャンセルは押さずにしばらく待ちます。",
            highlightSelector: "#confirm-scenario-ok",
            removeOkButton: true,
            waitForClickOn: "#confirm-scenario-ok"
          },
          {
            message: "処理が終わり、シナリオ要約が表示されたら次へ進みます。"
          },
          {
            message: "「このシナリオで始める」ボタンを押してください。",
            highlightSelector: "#start-scenario-button",
            removeOkButton: true,
            waitForClickOn: "#start-scenario-button"
          }
        ]
      },

      // ---------- scenario.html ----------
      {
        type: "page",
        match: "scenario.html",
        message: "新しく作成されたシナリオを進行させてみましょう。",
        subSteps: [
          {
            message: "画面最下部までスクロールし、行動テキストボックスで「自己紹介」と入力してください。",
            highlightSelector: "#player-input"
          },
          {
            message: "次のシーンボタンを押してください。キャンセルは押さず、完了を待ちます。",
            highlightSelector: "#next-scene",
            removeOkButton: true,
            waitForClickOn: "#next-scene"
          },
          {
            message: "次のシーンが表示されたら次へ進みます。"
          },
          {
            message: "これでシナリオの作成は完了です。左上のホームボタンからトップページに戻れます。",
            highlightSelector: "#back-to-menu"
          },
          {
            message: "進行中のシナリオ一覧の一番上の「続きへ」ボタンから、先ほど作成したシナリオにアクセスできます。"
          },
          {
            message: "以上がシナリオの作成と進行でした。"
          }
        ]
      }
    ]
  }

];
