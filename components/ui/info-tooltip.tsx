"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@takaki/go-design-system";

export function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1 inline-flex items-center">
            <Info
              className="size-3 cursor-help"
              style={{ color: "var(--color-text-secondary)" }}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-56 whitespace-normal text-xs leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
