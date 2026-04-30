import {
  Badge,
  Card,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@takaki/go-design-system";
import { Pagination } from "@/components/common/pagination";
import { isResolved } from "@/lib/metago/items";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#FF5630",
  high: "#FF8B00",
  medium: "#FF991F",
  low: "#36B37E",
};

export interface IssueItem {
  id: string;
  category: string;
  title: string;
  description?: string | null;
  severity?: string | null;
  state: string;
  products?: { display_name?: string; primary_color?: string } | null;
}

interface IssueListProps {
  items: IssueItem[];
  noun?: string;
  page?: number;
  pageSize?: number;
  basePath?: string;
  showSeverity?: boolean;
}

export function IssueList({
  items,
  noun = "issue",
  page = 1,
  pageSize = 20,
  basePath,
  showSeverity = false,
}: IssueListProps) {
  const open = items.filter((i) => !isResolved(i.state));

  if (open.length === 0) {
    return (
      <EmptyState
        title="すべて解決済み"
        description={`未解決の${noun}はありません。新しい検出があれば自動でここに追加されます。`}
      />
    );
  }

  const totalPages = Math.ceil(open.length / pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paged = open.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold text-foreground">
        未解決の{noun}{" "}
        <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>
          ({open.length}件)
        </span>
      </span>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-surface-subtle">
            <TableRow>
              <TableHead className="px-4 py-3 text-xs">プロダクト</TableHead>
              <TableHead className="px-4 py-3 text-xs">カテゴリ</TableHead>
              {showSeverity && (
                <TableHead className="px-4 py-3 text-xs">重大度</TableHead>
              )}
              <TableHead className="px-4 py-3 text-xs">内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          item.products?.primary_color || "#6B7280",
                      }}
                    />
                    <span className="text-sm text-foreground whitespace-nowrap">
                      {item.products?.display_name ?? "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant="outline">{item.category}</Badge>
                </TableCell>
                {showSeverity && (
                  <TableCell className="px-4 py-3">
                    {item.severity ? (
                      <Badge
                        className="text-white"
                        style={{
                          backgroundColor:
                            SEVERITY_COLORS[item.severity] ?? "#6B7280",
                        }}
                      >
                        {item.severity}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="px-4 py-3 max-w-xs">
                  <div className="text-sm font-medium text-foreground">
                    {item.title}
                  </div>
                  {item.description && (
                    <div
                      className="text-xs mt-0.5 line-clamp-2"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {item.description}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {basePath && totalPages > 1 && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          basePath={basePath}
        />
      )}
    </div>
  );
}
