// tutorialData.js

window.tutorialGroups = [
  { id: "basic", name: "基本編" },
  { id: "advanced", name: "応用編" }
];

window.tutorials = [
  {
    id: "apiKeySetup",
    title: "APIキーを設定しよう",
    description: "OpenAI APIキーの入手と設定までの手順を解説します。",
    groupId: "basic",
    steps: [
      {
        type: "page",
        match: "index.html",
        message: "APIキーの設定を行いましょう。",
        subSteps: [
          {
            // step1: set-api-key-buttonを押してモーダルを開く
            message: "まずは「APIキー設定」ボタンを押してください。",
            highlightSelector: "#set-api-key-button",
            removeOkButton: true,
            waitForClickOn: "#set-api-key-button"
          },
          {
            // step2: すでにモーダルが開いている想定 → リンクをハイライト
            message: "「もっと詳しい説明はこちら」のリンクをクリックして、APIキー取得方法を読んでください。",
            highlightSelector: "#open-api-instructions",
            removeOkButton: true,
            waitForClickOn: "#open-api-instructions"
          },
          {
            // step3: 閉じるボタンを押させる
            message: "よく読み、APIキー（sk-から始まる文字列）を取得してください。取得できましたら、説明モーダルの「閉じる」を押してください。",
            highlightSelector: "#close-api-instructions-button",
            removeOkButton: true,
            waitForClickOn: "#close-api-instructions-button"
          },
          {
            message: "取得したAPIキーを入力してください。",
            highlightSelector: "#api-key-input"
          },
          {
            message: "OKボタンを押してください。",
            highlightSelector: "#api-key-ok-button",
            removeOkButton: true,
            waitForClickOn: "#api-key-ok-button"
          },
          {
            message: "以上で、APIキーの設定を終わります。",
            complete: true,
          }
        ]
      }
    ]
  },
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
          {
            message: "以上で、ボタン説明を終わります。",
            complete: true
          }
        ]
      }
    ]
  },
  {
    id: "gachaFlow",
    title: "ガチャの流れ",
    description: "トップ画面 から ガチャ画面 へ進み、ガチャを引いて倉庫で確認するまでの流れを解説します。",
    groupId: "basic", // または適切なグループID
    steps: [
      // 1) index.html
      {
        type: "page",
        match: "index.html",
        message: "ガチャの流れを説明します。",
        subSteps: [
          {
            message: "まずは「ガチャ」ボタンを押してください。",
            highlightSelector: "#character-create",
            removeOkButton: true,
            waitForClickOn: "#character-create"
          }
        ]
      },
      // 2) characterCreate.html
      {
        type: "page",
        match: "characterCreate.html",
        message: "ガチャ画面での操作を行いましょう。",
        subSteps: [
          {
            message: "「エレメントガチャ」ボタンを押してください。",
            highlightSelector: "#gacha-btn",
            removeOkButton: true,
            waitForClickOn: "#gacha-btn"
          },
          {
            message: "OKボタンを押してください。（生成開始）",
            highlightSelector: "#genre-setting-ok-btn",
            removeOkButton: true,
            waitForClickOn: "#genre-setting-ok-btn"
          },
          {
            message: "生成が完了するまでしばらくお待ちください。完了したら次へ進みます。"
            // ここでは特に highlightSelector や waitForClickOn は無く、ダイアログの「次へ」で進行
          },
          {
            message: "生成が確認できたら、戻るボタンを押してindexページへ戻りましょう。",
            // 戻るボタンが #back-to-menu か #back-to-index などのIDかを確認
            highlightSelector: "#back-to-menu",
            removeOkButton: true,
            waitForClickOn: "#back-to-menu"
          }
        ]
      },
      // 3) 再び index.html に戻って倉庫へ
      {
        type: "page",
        match: "index.html",
        message: "ガチャで引いたカードを倉庫で確認しましょう。",
        subSteps: [
          {
            message: "「倉庫」ボタンを押して、今引いたカードを確認してください。",
            highlightSelector: "#show-warehouse-btn",
            removeOkButton: true,
            waitForClickOn: "#show-warehouse-btn"
          },
          {
            message: "倉庫の説明は後ほどするとして、ガチャしたカードが表示されていると思います。",
          },
          {
            // 次のsubStepで閉じるボタンをハイライト
            message: "最後に「×」ボタンを押して倉庫を閉じましょう。",
            highlightSelector: "#close-warehouse-btn",
            removeOkButton: true,
            waitForClickOn: "#close-warehouse-btn"
          },
          {
            message: "これでガチャの説明は以上です。",
            complete: true
          }
        ]
      }
    ]
  },

  {
    id: "story3",
    title: "高度な倉庫管理",
    description: "倉庫画面でのソートやフィルタリング、選択モードなど高度な機能を紹介します。",
    groupId: "advanced",
    steps: [
      {
        type: "page",
        match: "index.html",
        message: "倉庫管理の使い方を説明します。",
        subSteps: [
          {
            // 1) 倉庫を開く
            message: "まずは「倉庫」ボタンを押して、倉庫画面（モーダル）を開きましょう。",
            highlightSelector: "#show-warehouse-btn",
            removeOkButton: true,
            waitForClickOn: "#show-warehouse-btn"
          },
          {
            // 2) 左側タブの紹介
            message: "これが倉庫画面です。",
          },
          {
            // 2) 左側タブの紹介
            message: "画面上のタブをクリックすると、種類ごとにカードを絞り込めます。試しに切り替えてみましょう。",
            highlightSelector: ".warehouse-tabs"
          },
          {
            // 3) ソートドロップダウン
            message: "右上のドロップダウンから、名前順や日時順などのソートを選べます。",
            highlightSelector: "#warehouse-sort-dropdown"
          },
          {
            // 4) ソート方向ボタン
            message: "ソート方向ボタンを押すと、昇順/降順を切り替えられます。",
            highlightSelector: "#warehouse-sort-direction-btn"
          },
          {
            // 7) 選択モードの使い方
            message: "複数のカードを一括操作したい場合は「選択モード」を使いましょう。選択モードをオンにするとカードを複数同時選択ができます。まとめて削除できます。",
            highlightSelector: "#toggle-warehouse-selection-mode-btn",
          },
          {
            // 2) 左側タブの紹介
            message: "カードをクリックすると、赤い枠が付きます。左上の選択したカードを削除ボタンを押すことで、削除が可能になります。",
          },
          {
            // 8) 倉庫を閉じる
            message: "最後に、右上の「×」(倉庫を閉じるボタン)を押して倉庫を閉じましょう。",
            highlightSelector: "#close-warehouse-btn",
            removeOkButton: true,
            waitForClickOn: "#close-warehouse-btn"
          },
          {
            // 9) 完了
            message: "以上で、倉庫画面の高度な管理機能の説明は終わりです。",
            complete: true
          }
        ]
      }
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
            message: "以上でアバターが完成です！",
            complete: true
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
    description: "トップ画面 → シナリオウィザード → シナリオ画面 の流れで新しいシナリオを作成・進行します。",
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
        message: "次にウィザード画面で操作を行います。",
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
            message: "以上がシナリオの作成と進行でした。",
            complete: true
          }
        ]
      }
    ]
  }

];
