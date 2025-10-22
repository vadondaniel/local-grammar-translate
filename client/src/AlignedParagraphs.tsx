import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

interface AlignedParagraphsProps {
  leftTitle?: string;
  rightTitle?: string;
  leftParagraphs: string[];
  rightParagraphs: string[];
}

const AlignedParagraphs: React.FC<AlignedParagraphsProps> = ({
  leftTitle = "Original",
  rightTitle = "Translated",
  leftParagraphs,
  rightParagraphs,
}) => {
  const rows = Math.max(leftParagraphs.length, rightParagraphs.length);
  const normalizedLeft = useMemo(
    () => Array.from({ length: rows }, (_, i) => leftParagraphs[i] ?? ""),
    [rows, leftParagraphs]
  );
  const normalizedRight = useMemo(
    () => Array.from({ length: rows }, (_, i) => rightParagraphs[i] ?? ""),
    [rows, rightParagraphs]
  );

  const leftRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const rightRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const [leftExtra, setLeftExtra] = useState<number[]>(() => new Array(rows).fill(0));
  const [rightExtra, setRightExtra] = useState<number[]>(() => new Array(rows).fill(0));

  const syncHeights = () => {
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

  useLayoutEffect(() => {
    syncHeights();
  }, [rows, normalizedLeft, normalizedRight]);

  useLayoutEffect(() => {
    const handler = () => syncHeights();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [rows]);

  const renderParagraph = (text: string, keyPrefix: string) => {
    if (!text) return <span>&nbsp;</span>;
    const parts: React.ReactNode[] = [];
    const split = text.split("\n");
    split.forEach((line, idx) => {
      parts.push(<span key={`${keyPrefix}-line-${idx}`}>{line}</span>);
      if (idx < split.length - 1) {
        parts.push(<br key={`${keyPrefix}-br-${idx}`} />);
      }
    });
    return parts;
  };

  return (
    <div className="inline-diff">
      <div className="inline-diff-pane">
        <div className="inline-diff-title">{leftTitle}</div>
        <div className="inline-diff-body">
          {normalizedLeft.map((value, i) => (
            <React.Fragment key={`left-${i}`}>
              <p className="inline-diff-paragraph" ref={(el) => { leftRefs.current[i] = el; }}>
                {renderParagraph(value, `left-${i}`)}
              </p>
              <div className="inline-diff-spacer" style={{ height: leftExtra[i] }} />
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="inline-diff-pane">
        <div className="inline-diff-title">{rightTitle}</div>
        <div className="inline-diff-body">
          {normalizedRight.map((value, i) => (
            <React.Fragment key={`right-${i}`}>
              <p className="inline-diff-paragraph" ref={(el) => { rightRefs.current[i] = el; }}>
                {renderParagraph(value, `right-${i}`)}
              </p>
              <div className="inline-diff-spacer" style={{ height: rightExtra[i] }} />
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AlignedParagraphs;
