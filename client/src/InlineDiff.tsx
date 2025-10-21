import React, { useMemo, useLayoutEffect, useRef, useState } from "react";
import { diffWordsWithSpace, type Change } from "diff";

interface InlineDiffProps {
  oldValue: string;
  newValue: string;
  leftTitle?: string;
  rightTitle?: string;
}

const InlineDiff: React.FC<InlineDiffProps> = ({
  oldValue,
  newValue,
  leftTitle = "Original",
  rightTitle = "Corrected",
}) => {
  // Split inputs into paragraphs so we can align with variable spacing
  const oldParas = useMemo(() => (oldValue || "").split(/\n\s*\n+/g), [oldValue]);
  const newParas = useMemo(() => (newValue || "").split(/\n\s*\n+/g), [newValue]);
  const rows = Math.max(oldParas.length, newParas.length);

  // Precompute per-row token diffs
  const rowTokens = useMemo(() => {
    const arr: Change[][] = [];
    for (let i = 0; i < rows; i++) {
      const leftText = oldParas[i] ?? "";
      const rightText = newParas[i] ?? "";
      arr.push(diffWordsWithSpace(leftText, rightText) as Change[]);
    }
    return arr;
  }, [rows, oldParas, newParas]);

  // Refs to measure each paragraph height
  const leftRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const rightRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  // Extra spacers after each paragraph to match counterpart height
  const [leftExtra, setLeftExtra] = useState<number[]>([]);
  const [rightExtra, setRightExtra] = useState<number[]>([]);

  useLayoutEffect(() => {
    const l: number[] = new Array(rows).fill(0);
    const r: number[] = new Array(rows).fill(0);
    for (let i = 0; i < rows; i++) {
      const lh = leftRefs.current[i]?.offsetHeight ?? 0;
      const rh = rightRefs.current[i]?.offsetHeight ?? 0;
      if (lh < rh) l[i] = rh - lh;
      else if (rh < lh) r[i] = lh - rh;
    }
    setLeftExtra(l);
    setRightExtra(r);
  }, [rows, rowTokens]);

  // Recompute on resize for responsiveness
  useLayoutEffect(() => {
    const handler = () => {
      const l: number[] = new Array(rows).fill(0);
      const r: number[] = new Array(rows).fill(0);
      for (let i = 0; i < rows; i++) {
        const lh = leftRefs.current[i]?.offsetHeight ?? 0;
        const rh = rightRefs.current[i]?.offsetHeight ?? 0;
        if (lh < rh) l[i] = rh - lh;
        else if (rh < lh) r[i] = lh - rh;
      }
      setLeftExtra(l);
      setRightExtra(r);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [rows, rowTokens]);

  const renderTokens = (
    tokens: Change[],
    side: "left" | "right",
    keyPrefix: string
  ) => {
    const parts: React.ReactNode[] = [];
    let keyIdx = 0;
    tokens.forEach((t, i) => {
      const isAdded = !!t.added;
      const isRemoved = !!t.removed;
      const keep = side === "left" ? !isAdded : !isRemoved;
      if (!keep) return;

      const cls = isAdded
        ? "inline-diff-added"
        : isRemoved
        ? "inline-diff-removed"
        : undefined;

      const lines = t.value.split("\n");
      lines.forEach((line, lIdx) => {
        if (line.length > 0) {
          parts.push(
            <span className={cls} key={`${keyPrefix}-t-${i}-${lIdx}-${keyIdx++}`}>
              {line}
            </span>
          );
        }
        if (lIdx < lines.length - 1) {
          parts.push(<br key={`${keyPrefix}-br-${i}-${lIdx}-${keyIdx++}`} />);
        }
      });
    });

    if (parts.length === 0) return <span> </span>;
    return parts;
  };

  return (
    <div className="inline-diff">
      <div className="inline-diff-pane">
        <div className="inline-diff-title">{leftTitle}</div>
        <div className="inline-diff-body">
          {Array.from({ length: rows }).map((_, i) => (
            <React.Fragment key={`left-row-${i}`}>
              <p
                className="inline-diff-paragraph"
                ref={(el) => { leftRefs.current[i] = el; }}
              >
                {renderTokens(rowTokens[i] || [], "left", `l-${i}`)}
              </p>
              {/* extra spacer to align with right side */}
              <div
                className="inline-diff-spacer"
                style={{ height: leftExtra[i] || 0 }}
                aria-hidden={true}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="inline-diff-pane">
        <div className="inline-diff-title">{rightTitle}</div>
        <div className="inline-diff-body">
          {Array.from({ length: rows }).map((_, i) => (
            <React.Fragment key={`right-row-${i}`}>
              <p
                className="inline-diff-paragraph"
                ref={(el) => { rightRefs.current[i] = el; }}
              >
                {renderTokens(rowTokens[i] || [], "right", `r-${i}`)}
              </p>
              <div
                className="inline-diff-spacer"
                style={{ height: rightExtra[i] || 0 }}
                aria-hidden={true}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InlineDiff;
