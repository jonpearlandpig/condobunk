import { useRef, useState, useCallback, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

const THRESHOLD = 64;

const PullToRefresh = ({ onRefresh, children, className }: PullToRefreshProps) => {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      const el = containerRef.current;
      // Only activate when scrolled to top
      if (el && el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    },
    [refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const delta = Math.max(0, e.touches[0].clientY - startY.current);
      // Rubber-band effect: diminishing returns past threshold
      const capped = Math.min(delta * 0.5, THRESHOLD * 1.5);
      setPullDistance(capped);
    },
    [refreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current || refreshing) return;
    pulling.current = false;
    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh]);

  // On desktop, just render children directly — no pull gesture
  if (!isMobile) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-auto ${className || ""}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{ height: pullDistance > 0 ? pullDistance : 0 }}
      >
        {(pullDistance > 0 || refreshing) && (
          <Loader2
            className={`h-5 w-5 text-primary transition-opacity ${
              refreshing ? "animate-spin opacity-100" : pullDistance >= THRESHOLD ? "opacity-100" : "opacity-40"
            }`}
          />
        )}
      </div>
      {children}
    </div>
  );
};

export default PullToRefresh;
