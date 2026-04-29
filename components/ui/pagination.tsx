"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Pagination as GdsPagination,
  PaginationContent,
  PaginationItem,
  buttonVariants,
} from "@takaki/go-design-system";

interface PaginationProps {
  page: number;
  totalPages: number;
  basePath: string;
}

export function Pagination({ page, totalPages, basePath }: PaginationProps) {
  if (totalPages <= 1) return null;

  function makeHref(p: number) {
    return `${basePath}?page=${p}`;
  }

  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const linkClass = (active: boolean) =>
    buttonVariants({
      variant: active ? "outline" : "ghost",
      size: "icon",
    });
  const navClass = (disabled: boolean) =>
    `${buttonVariants({ variant: "ghost", size: "icon" })} ${
      disabled ? "pointer-events-none opacity-40" : ""
    }`;

  return (
    <GdsPagination className="py-2">
      <PaginationContent>
        <PaginationItem>
          <Link
            href={makeHref(Math.max(1, page - 1))}
            className={navClass(page <= 1)}
            aria-disabled={page <= 1}
            aria-label="前のページ"
          >
            <ChevronLeft className="size-4" />
          </Link>
        </PaginationItem>

        {start > 1 && (
          <>
            <PaginationItem>
              <Link href={makeHref(1)} className={linkClass(false)}>
                1
              </Link>
            </PaginationItem>
            {start > 2 && (
              <PaginationItem>
                <span className="px-1 text-sm text-muted-foreground">…</span>
              </PaginationItem>
            )}
          </>
        )}

        {pages.map((p) => (
          <PaginationItem key={p}>
            <Link
              href={makeHref(p)}
              className={linkClass(p === page)}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </Link>
          </PaginationItem>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && (
              <PaginationItem>
                <span className="px-1 text-sm text-muted-foreground">…</span>
              </PaginationItem>
            )}
            <PaginationItem>
              <Link href={makeHref(totalPages)} className={linkClass(false)}>
                {totalPages}
              </Link>
            </PaginationItem>
          </>
        )}

        <PaginationItem>
          <Link
            href={makeHref(Math.min(totalPages, page + 1))}
            className={navClass(page >= totalPages)}
            aria-disabled={page >= totalPages}
            aria-label="次のページ"
          >
            <ChevronRight className="size-4" />
          </Link>
        </PaginationItem>
      </PaginationContent>
    </GdsPagination>
  );
}
