import { ExampleExplorer } from "@/components/example-explorer";
import { BrandMark } from "@/components/brand-mark";

export default function Home() {
  return (
    <div className="site-shell home-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="site-header">
        <div className="brand"><BrandMark />先说好<span className="brand-description">共享空间的小约定</span></div>
        <a className="quiet-link" href="#how-it-works">怎么玩</a>
      </header>
      <main id="main-content" tabIndex={-1}><ExampleExplorer /></main>
      <footer className="site-footer"><span>小事提前说，相处轻一点。</span><span>不用登录，不用真名。</span></footer>
    </div>
  );
}
