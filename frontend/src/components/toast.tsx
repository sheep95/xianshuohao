"use client";

import { useEffect, useState } from "react";

export function useToast() {
  const [notice, setNotice] = useState({ text: "", sequence: 0 });
  function notify(text: string) {
    setNotice(previous => ({ text, sequence: previous.sequence + 1 }));
  }
  useEffect(() => {
    if (!notice.text) return;
    const timer = window.setTimeout(() => {
      setNotice(current => current === notice ? { ...current, text: "" } : current);
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return { notice, notify };
}

export function Toast({ notice }: { notice: { text: string; sequence: number } }) {
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
      {notice.text && <p key={notice.sequence} className="toast-message">{notice.text}</p>}
    </div>
  );
}
