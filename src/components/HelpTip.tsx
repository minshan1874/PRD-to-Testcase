import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** 操作说明气泡：页面任意位置的小问号/信息icon */
export default function HelpTip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground ${className ?? ""}`}
          aria-label="操作说明"
        >
          <Info className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-normal" side="top">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}