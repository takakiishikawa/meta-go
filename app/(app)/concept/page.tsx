import { ConceptPage } from "@takaki/go-design-system"
import { Layers } from "lucide-react"

export default function ConceptPageRoute() {
  return (
    <div className="min-h-full py-8">
      <ConceptPage
        productName="MetaGo"
        productLogo={
          <div
            className="flex items-center justify-center rounded-sm"
            style={{ backgroundColor: "var(--color-primary)", padding: 4 }}
          >
            <Layers className="size-5 text-white" />
          </div>
        }
        tagline="PSF Product Manager — takakiのもう一人のPM"
        coreMessage="MetaGoはgoシリーズ全体を俯瞰し、品質・セキュリティ・コストを自律管理しながら、takakiがプロダクト開発の本質（PSF向上）に集中できる環境を創出する。"
        coreValue="takakiを保守作業から解放し、PSF向上に集中させること。MetaGoが守ることで、takakiは育てることができる。"
        scope={{
          solve: [
            "コード品質・セキュリティの継続的モニタリング",
            "依存関係・技術スタックの最新化",
            "go-design-system準拠率の維持",
            "パフォーマンス・コストの自律管理",
            "PSFスコアの測定と可視化",
            "使用パターン分析と仮説立案支援",
            "承認が必要な変更の整理・提示",
          ],
          notSolve: [
            "goシリーズの機能開発そのもの",
            "ユーザー獲得・マーケティング",
            "goシリーズのコードへの無断変更",
            "他goのSupabaseスキーマの変更",
            "takakiの代わりの意思決定",
          ],
        }}
        productLogic={{
          steps: [
            {
              title: "収集",
              description: "GitHub・Vercel・Supabaseから各goのデータを毎日自動収集する",
            },
            {
              title: "分析",
              description: "収集データをDelivery（品質・セキュリティ等）とDiscovery（PSF・使用パターン）の観点で分析する",
            },
            {
              title: "提案",
              description: "問題を発見したらPRを自動生成、または承認待ちキューに積む",
            },
            {
              title: "実行",
              description: "takakiが承認した変更をマージ、自律実行可能な修正は自動実行する",
            },
            {
              title: "学習",
              description: "実行結果をスコアとして蓄積し、PSF向上への貢献を継続的に改善する",
            },
          ],
          outcome: "takakiが「作ること」に使える時間/週の最大化",
        }}
        resultMetric={{
          title: "takakiが「作ること」に使える時間/週",
          description: "保守作業（依存更新・バグ対応・品質管理）に費やす時間を最小化し、新機能開発・PSF向上活動に集中できる時間を増やす。目標：保守作業 < 1時間/週",
        }}
        behaviorMetrics={[
          {
            title: "自動実行件数/週",
            description: "MetaGoが人間の介入なしに自律実行・マージした変更件数。多いほど保守作業の自動化が進んでいる",
          },
          {
            title: "承認待ち滞留時間",
            description: "承認キューに積まれたアイテムがtakakiに処理されるまでの平均時間。目標: 48時間以内",
          },
          {
            title: "PSF向上に貢献した提案数/月",
            description: "DiscoveryフェーズでMetaGoが立案し、採用された改善提案の数。PSFスコアの上昇に直接紐づく提案を計測",
          },
          {
            title: "Deliveryスコア平均（全go）",
            description: "コード品質・セキュリティ・デザインシステム・パフォーマンスの4カテゴリ平均スコア。100点満点。目標: 85点以上維持",
          },
        ]}
      />
    </div>
  )
}
