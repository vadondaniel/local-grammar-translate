import React from "react";
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
  const tokens = diffWordsWithSpace(oldValue || "", newValue || "") as Change[];

  const buildPane = (side: "left" | "right") => {
    const paragraphs: React.ReactNode[][] = [];
    let current: React.ReactNode[] = [];
    let keyIdx = 0;

    const pushParagraph = () => {
      paragraphs.push(current);
      current = [];
    };

    tokens.forEach((t, i) => {
      const isAdded = !!t.added;
      const isRemoved = !!t.removed;
      const keep = side === "left" ? !isAdded : !isRemoved;
      if (!keep) return;
      const cls = isAdded ? "inline-diff-added" : isRemoved ? "inline-diff-removed" : undefined;

      // split into paragraph blocks on double-newline, keep single-newlines as <br/>
      const parts = t.value.split(/\n{2,}/g);
      parts.forEach((part, pIdx) => {
        const lines = part.split("\n");
        lines.forEach((line, lIdx) => {
          if (line.length > 0) {
            current.push(
              <span className={cls} key={`t-${i}-${pIdx}-${lIdx}-${keyIdx++}`}>
                {line}
              </span>
            );
          }
          if (lIdx < lines.length - 1) {
            current.push(<br key={`br-${i}-${pIdx}-${lIdx}-${keyIdx++}`} />);
          }
        });
        // if there was a paragraph break, flush
        if (pIdx < parts.length - 1) {
          pushParagraph();
        }
      });
    });

    if (current.length) pushParagraph();
    if (paragraphs.length === 0) paragraphs.push([<span key="empty"> </span>]);

    return paragraphs.map((p, idx) => (
      <p className="inline-diff-paragraph" key={idx}>
        {p}
      </p>
    ));
  };

  return (
    <div className="inline-diff">
      <div className="inline-diff-pane">
        <div className="inline-diff-title">{leftTitle}</div>
        <div className="inline-diff-body">{buildPane("left")}</div>
      </div>
      <div className="inline-diff-pane">
        <div className="inline-diff-title">{rightTitle}</div>
        <div className="inline-diff-body">{buildPane("right")}</div>
      </div>
    </div>
  );
};

export default InlineDiff;
