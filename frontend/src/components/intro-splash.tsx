import { ArrowRight, Check } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

// A document entry shows the opening before paint. In-app transitions keep
// the root layout mounted. Without JavaScript, the underlying page stays usable.
export const openingHref = "/?intro=1";
const notes = [
  { text: "23:00 后戴耳机", tone: "mint" },
  { text: "调温度先说一声", tone: "lemon" },
  { text: "外卖盒当晚带走", tone: "peach" },
];

export const openingScript = `(function(){
var d=document.documentElement;
try{
var forced=new URLSearchParams(location.search).get("intro")==="1";
if(navigator.webdriver&&!forced)return;
var motion=matchMedia("(prefers-reduced-motion: reduce)");
var closeTimer;
var box=function(){return document.getElementById("opening")};
var content=function(){return document.getElementById("application-content")};
var focus=function(){
  content()?.setAttribute("inert","");
  document.getElementById("opening-enter")?.focus({preventScroll:true});
};
var open=function(){
  clearTimeout(closeTimer);
  d.classList.remove("opening-leaving");
  d.classList.add("has-opening");
  if(document.readyState!=="loading")focus();
};
var close=function(){
  if(!d.classList.contains("has-opening")||d.classList.contains("opening-leaving"))return;
  d.classList.add("opening-leaving");
  closeTimer=setTimeout(function(){
    d.classList.remove("has-opening","opening-leaving");
    content()?.removeAttribute("inert");
    document.querySelector("#application-content main")?.focus({preventScroll:true});
  },motion.matches?0:360);
};
document.addEventListener("click",function(e){var t=e.target;if(t&&t.closest&&t.closest("[data-opening-close]"))close()});
document.addEventListener("keydown",function(e){
if(!d.classList.contains("has-opening"))return;
if(e.key==="Escape"){e.preventDefault();close();return}
if(e.key!=="Tab"||!box())return;
var b=box().querySelectorAll("button"),f=b[0],l=b[b.length-1];
if(e.shiftKey&&document.activeElement===f){e.preventDefault();l.focus()}
else if(!e.shiftKey&&document.activeElement===l){e.preventDefault();f.focus()}
else if(!box().contains(document.activeElement)){e.preventDefault();f.focus()}
});
open();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){
  if(d.classList.contains("has-opening"))focus();
},{once:true});
window.addEventListener("pageshow",function(event){if(event.persisted)open()});
}catch(e){d.classList.remove("has-opening")}
})();`;

export function IntroSplash() {
  return <>
    <div id="opening" className="opening" role="dialog" aria-modal="true" aria-labelledby="opening-title" aria-describedby="opening-line">
      <button className="opening-skip" type="button" data-opening-close>跳过</button>
      <div className="opening-stage">
        <ul className="opening-board" aria-label="三条示例小约定">
          {notes.map((note, index) => (
            <li key={note.text} className={`opening-note opening-note-${index + 1} tone-${note.tone}`}>
              <span className="opening-tape" aria-hidden="true" />
              {note.text}
              <span className="opening-check" aria-hidden="true"><Check size={13} strokeWidth={3.2} /></span>
            </li>
          ))}
        </ul>
        <h2 className="opening-title" id="opening-title"><BrandMark /><span>先说好。</span></h2>
        <p className="opening-line" id="opening-line">刚凑齐的室友、旅伴、社团同伴，<br />花 3 分钟，说好 5 件相处的小事。</p>
        <button className="opening-enter" id="opening-enter" type="button" data-opening-close>
          进来看看<ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="opening-hint">不用登录 · 匿名认领 · 存一张发群里</p>
      </div>
    </div>
  </>;
}
