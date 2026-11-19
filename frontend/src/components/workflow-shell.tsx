import { TransitionLink as Link } from "./transition-link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
export function WorkflowShell({ children }: { children: ReactNode }) {
  return <div className="site-shell workflow-shell">
    <a className="skip-link" href="#workflow-main">跳到主要内容</a>
    <header className="site-header"><Link className="brand" href="/" direction="back"><BrandMark />先说好</Link><Link className="quiet-link" href="/" direction="back">回首页看示例</Link></header>
    <main id="workflow-main" tabIndex={-1}>{children}<noscript><p className="feedback">创建与认领需要启用 JavaScript；首页仍提供完整静态示例。</p></noscript></main>
    <footer className="site-footer"><span>约定行为，不评判任何人。</span><span>一个昵称就够，不用真名。</span></footer>
  </div>;
}

