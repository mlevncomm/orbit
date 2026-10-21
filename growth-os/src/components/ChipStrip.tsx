"use client";

import { useEffect, useRef, useState } from "react";

export function ChipStrip({
  children,
  wrap = false,
}: {
  children: React.ReactNode;
  wrap?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);

  useEffect(() => {
    if (wrap) return;
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setLeft(el.scrollLeft > 6);
      setRight(max > 6 && el.scrollLeft < max - 6);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [wrap]);

  function nudge(dir: number) {
    ref.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  }

  if (wrap) {
    return (
      <div className="chip-strip wrap">
        <div className="chip-row wrap">{children}</div>
      </div>
    );
  }

  return (
    <div className={`chip-strip${left ? " fade-l" : ""}${right ? " fade-r" : ""}`}>
      {left ? (
        <button type="button" className="chip-nav prev" aria-label="Sola kaydır" onClick={() => nudge(-1)}>
          ‹
        </button>
      ) : null}
      <div className="chip-row" ref={ref}>
        {children}
      </div>
      {right ? (
        <button type="button" className="chip-nav next" aria-label="Sağa kaydır" onClick={() => nudge(1)}>
          ›
        </button>
      ) : null}
    </div>
  );
}
