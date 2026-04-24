このリポジトリの技術スタックを方針書v2.0に準拠させます。

【方針書参照】
meta-go/docs/tech-stack-policy-v2.md を前提として作業してください。

【実施項目】
以下のうち、このリポジトリに該当するものを実施してください。
該当しない項目はスキップして構いません。

### 1. rechartsのdynamic import化
rechartsを static import している箇所を dynamic import に置き換える。

❌ 現状のパターン:
```tsx
import { LineChart, XAxis } from "recharts"
```

✅ 新しいパターン:
```tsx
import dynamic from 'next/dynamic'
const LineChart = dynamic(
  () => import("recharts").then(m => ({ default: m.LineChart })),
  { ssr: false, loading: () => <div className="animate-pulse h-40 bg-muted rounded" /> }
)
const XAxis = dynamic(
  () => import("recharts").then(m => ({ default: m.XAxis })),
  { ssr: false }
)
```

効果: 初期バンドル -250KB程度。
実施条件: rechartsを実際に使用しているファイルすべて。

### 2. @vercel/analytics の導入
package.json に @vercel/analytics がない場合、追加する。

- `npm install @vercel/analytics` 相当（package.jsonを更新）
- `app/layout.tsx` に以下を追加:
```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

実施条件: @vercel/analytics が package.json にない場合のみ。

### 3. 未使用rechartsの削除
rechartsが package.json に入っているが、実際のコードで使用されていない場合、依存から削除する。

- 全ファイルを検索して `import.*recharts` がないか確認
- 一箇所も使用されていなければ package.json から削除

実施条件: rechartsが完全に未使用の場合のみ。

### 4. Layer 2 欠損の補充
以下のLayer 2パッケージが欠けている場合、package.json に追加する：

- zod (バリデーション)
- date-fns (日付操作)
- react-hook-form (フォーム)
- @hookform/resolvers (hook-form連携)

実施条件: それぞれのパッケージが package.json にない場合のみ。
（無理やり全部追加しない。このリポジトリで将来使う可能性が明らかに高いものだけ）

### 5. openai 削除
@anthropic-ai/sdk と openai が両方入っている場合、openai を削除する。

- package.json から "openai" を削除
- コード内で `import OpenAI from 'openai'` している箇所を特定
- 該当箇所を @anthropic-ai/sdk を使う実装に書き換える（もし可能なら）
- 書き換えが困難な場合は、その旨をPR本文に記載して依存削除のみ実施

実施条件: package.json に "openai" がある場合のみ。

【制約】
- package.jsonを変更した場合は package-lock.json も更新してください (npm install または npm i --package-lock-only)
- TypeScriptコンパイルが通ることを確認
- 既存の振る舞いを変えないこと（特にrecharts dynamic import化では見た目が変わらないよう注意）
- 1つでも該当する修正があれば PR を作成、何も該当しなければ PR は作らない

【PR作成】
- ブランチ名: `metago/tech-stack-compliance-v2`
- タイトル: `chore: Tech stack compliance to v2.0 policy`
- 本文:
  MetaGoが自動生成した技術スタック刷新PRです。

  ## 実施した修正
  (実際に行った修正をチェックリスト形式で記載)

  - [ ] rechartsのdynamic import化
  - [ ] @vercel/analytics 導入
  - [ ] 未使用依存削除
  - [ ] Layer 2 欠損補充
  - [ ] openai 削除

  ## 参考
  - 方針書: https://github.com/takakiishikawa/meta-go/blob/main/docs/tech-stack-policy-v2.md

- Labels: `tech-stack-compliance`, `metago-auto`

【dry_runの場合】
変更内容をワークフローログに出力するのみ。コミット・push・PR作成はしない。
