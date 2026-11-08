// 내보낸 HTML 파일 안에서 쓰는 보기 화면. 열면 모든 장이 세로로 보이고, "발표 시작"으로 슬라이드쇼가 된다.
// 발표할 때의 움직임은 앱의 발표 화면과 같은 엔진(motion/engine.ts)을 쓴다. 엔진은 소스를 그대로 넣는다.
// 부품 장에서 넘치는 부품 맞추기(slides/fitBlocks.ts의 blockFitter)와 장의 배경(motion/backdrop.ts)도 같다. 처음에는 모든 장이 보이므로 열 때 한 번, 폰트가 오면 한 번 더.
// 모션 그래픽(motion/cine.ts)도 같은 엔진이 장을 움직일 때 알려(mo-cine) 그린다. 레시피의 대본은 칸(.bk-cn)의 data-script에 있다.

import { presentAction, presentKey, slideNumber } from '../lib/presentKeys'
import { backdropMotion } from '../motion/backdrop'
import { cineMotion } from '../motion/cine'
import { drawKit } from '../motion/draw'
import { motionEngine } from '../motion/engine'
import { blockFitter } from '../slides/fitBlocks'

/** 보기 화면에 쓰이는 글자 (폰트 묶음 고르기에 쓴다) */
export const VIEWER_TEXT = 'PDF로 저장 발표 시작 0123456789 /'

// 처음 보이는 목록의 장 너비(.v-slide)는 창 높이에도 맞춘다: 받는 분 대부분이 쓰는 1280×600 노트북 창에서 1280 너비의 장은
// 720 높이라 창보다 높아서, 장 하나를 다 보려면 스크롤해야 했고 어느 장도 한눈에 보이지 않았다. 112는 위 막대와 장 위아래 여백
// 위 막대(.v-bar)는 칠한 흰 면이다: 반투명에 흐림을 걸면 아래로 지나가는 슬라이드가 비쳐 얼룩처럼 보였다(앱도 유리 효과를 쓰지 않는다)
// 인쇄(PDF로 저장)는 한 쪽에 한 장, 장 사이에서만 쪽을 나눈다(마지막 장 뒤에서 나누면 끝에 빈 쪽이 생긴다). 발표하던 중에 인쇄해도
// 지금 장 하나가 아니라 모든 장이 나오게 발표 화면의 자리 잡기를 푼다
export const VIEWER_CSS = `
html,body{margin:0;background:#eeeeee;font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;-webkit-font-smoothing:antialiased}
.v-bar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 20px;background:#fff;border-bottom:1px solid #e1e1e1}
.v-title{min-width:0;overflow:hidden;color:#1a1a1a;font-size:15px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.v-actions{display:flex;flex:none;gap:8px}
.v-btn{padding:10px 16px;border:1px solid #d0d0d0;border-radius:4px;background:#fff;color:#1a1a1a;font:600 14px/1 inherit;cursor:pointer}
.v-btn:focus-visible{outline:2px solid #2b4fc0;outline-offset:2px}
.v-btn-primary{border-color:#1a1a1a;background:#1a1a1a;color:#fff}
.v-deck{display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px 16px 64px}
.v-slide{width:min(100%,1280px,calc((100vh - 112px)*16/9))}
.v-frame{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:2px;box-shadow:0 0 0 1px rgb(20 20 20/.06),0 4px 16px rgb(20 20 20/.06);cursor:pointer}
.v-scale{position:absolute;top:0;left:0;width:1920px;height:1080px;transform:scale(var(--s,.5));transform-origin:0 0}
.v-count{display:none}
body.is-present{overflow:hidden;background:#000}
body.is-present .v-bar{display:none}
body.is-present .v-deck{position:fixed;inset:0;display:block;padding:0;background:#000}
body.is-present .v-slide{position:absolute;inset:0;display:none;width:auto;max-width:none}
body.is-present .v-slide.is-current{display:flex;align-items:center;justify-content:center}
body.is-present .v-frame{width:var(--pw);height:var(--ph);aspect-ratio:auto;border-radius:0;box-shadow:none;cursor:default}
body.is-present .v-count{position:fixed;right:20px;top:16px;display:block;padding:8px 12px;border-radius:999px;background:rgb(0 0 0/.45);color:rgb(255 255 255/.8);font:600 13px/1 inherit;opacity:0;transition:opacity .2s}
body.is-present.is-awake .v-count{opacity:1}
body.is-present.v-side .v-count{right:0;width:calc((100vw - var(--pw))/2);box-sizing:border-box;text-align:center;background:none}
body.is-present.v-top .v-count{top:calc((100vh - var(--ph))/4);transform:translateY(-50%);background:none}
body.is-present:not(.is-awake){cursor:none}
.v-blank{display:none}
body.is-present .v-blank:not([hidden]){position:fixed;inset:0;z-index:5;display:block;background:#000}
body.is-present .v-blank.is-white{background:#fff}
@media print{
  @page{size:1920px 1080px;margin:0}
  html,body,body.is-present{overflow:visible;background:#fff}
  .v-bar,.v-count,.v-blank{display:none!important}
  .v-deck,body.is-present .v-deck{position:static;display:block;padding:0}
  .v-slide,body.is-present .v-slide{position:static;display:block;width:1920px;max-width:none;height:1080px}
  .v-slide+.v-slide{break-before:page}
  .v-frame,body.is-present .v-frame{width:1920px;height:1080px;border-radius:0;box-shadow:none}
  .v-scale{transform:none}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`

export const VIEWER_JS = `(function(){
var engine=(${motionEngine.toString()})();
// 장의 배경: 엔진이 장을 움직일 때 알리면(mo-backdrop) 같은 그림을 캔버스로 움직이고, 장을 떠나면 끝 모습(SVG)으로 돌아온다
var kit=(${drawKit.toString()})();
var backdrops=(${backdropMotion.toString()})(kit);backdrops.listen(document);
// 모션 그래픽: 엔진이 알리면(mo-cine) 장면을 캔버스(GPU가 되면 WebGL)로 그리고, 끝나면 칸의 글과 남는 선(끝 모습)으로 돌아온다
var cines=(${cineMotion.toString()})(kit);cines.listen(document);
// 배경은 글 둘레를 비킨다: 글이 놓인 자리는 그려 봐야 알아서 열 때와 글꼴이 온 뒤에 잰다(앱은 그릴 때마다)
function clearBackdrops(){[].forEach.call(document.querySelectorAll('.slide'),function(s){backdrops.clear(s)})}
var fitBlocks=(${blockFitter.toString()})().fit;
var presentKey=(${presentKey.toString()}),presentAction=(${presentAction.toString()}),slideNumber=(${slideNumber.toString()}),num=slideNumber();
var slides=[].slice.call(document.querySelectorAll('.v-slide'));
var body=document.body,root=document.documentElement,count=document.querySelector('.v-count'),blank=document.querySelector('.v-blank');
var i=0,timer=0,stopMotion=null;
function levelOf(el){var s=el&&el.querySelector('.slide');return !s?'none':s.classList.contains('mo-lively')?'lively':s.classList.contains('mo-calm')?'calm':'none'}
function transitionOf(el){var s=el&&el.querySelector('.slide'),m=s&&/\\btr-(\\w+)/.exec(s.className);return m?m[1]:'none'}
function halt(){if(stopMotion){stopMotion();stopMotion=null}}
function presenting(){return body.classList.contains('is-present')}
function fit(){
  if(presenting()){
    var s=Math.min(innerWidth/1920,innerHeight/1080);
    root.style.setProperty('--pw',1920*s+'px');root.style.setProperty('--ph',1080*s+'px');
    // 쪽 번호는 장 밖의 검은 여백에 둔다(앱의 발표 화면과 같게). 여백이 없으면 장 위에 겹치니 마우스를 움직일 때만
    var side=(innerWidth-1920*s)/2,top=(innerHeight-1080*s)/2;
    body.classList.toggle('v-side',side>=72);body.classList.toggle('v-top',side<72&&top>=40);
    slides.forEach(function(el){el.querySelector('.v-frame').style.setProperty('--s',s)});
  }else{
    slides.forEach(function(el){var f=el.querySelector('.v-frame');f.style.setProperty('--s',f.clientWidth/1920)});
  }
}
function show(n,first){
  var next=Math.max(0,Math.min(slides.length-1,n));
  if(next===i&&!first)return;
  var forward=first||next>i,level=levelOf(slides[next]);
  function apply(){
    halt();i=next;
    slides.forEach(function(el,k){el.classList.toggle('is-current',k===i)});
    count.textContent=(i+1)+' / '+slides.length;
    // 앞으로 넘긴 장만 움직인다. 이전 장으로 돌아가면 다 보인 상태로. 움직임이 없는 장도 엔진에 맡긴다('누르면' 나오는 컴포넌트를 감춘다)
    if(forward)stopMotion=engine.play(slides[i],level);
  }
  // 전환은 넘어가는 장에 정한 것 (뒤로 갈 때는 떠나는 장의 것). 앱의 발표 화면과 같다
  if(first)apply();else engine.swap(apply,transitionOf(slides[forward?next:i]),forward?1:-1);
}
// 다음으로: 이 장에 '누르면' 나오는 컴포넌트가 남았으면 그것을, 아니면 다음 장
function forwardOne(){if(stopMotion&&stopMotion.next())return;show(i+1)}
function setBlank(kind){blank.className=kind?'v-blank is-'+kind:'v-blank';blank.hidden=!kind}
function wake(){body.classList.add('is-awake');clearTimeout(timer);timer=setTimeout(function(){body.classList.remove('is-awake')},2200)}
function roomy(){return body.classList.contains('v-side')||body.classList.contains('v-top')}
// 전체 화면은 창이 다 커진 뒤에 들어온다. 그 전에 첫 장을 움직이면 작은 크기로 올라오다가 한 번에 커진다(앱의 발표 화면과 같은 까닭).
// 커질 때까지는 검은 화면으로 두고(아직 지금 장이 없다), 다 커진 다음 프레임에 첫 장을 들인다. 거절되거나 늦어도 0.8초에서 그친다
function start(n){
  body.classList.add('is-present');fit();if(roomy())wake();
  var done=false;
  function go(){if(done||!presenting())return;done=true;fit();show(n,true)}
  if(root.requestFullscreen){root.requestFullscreen().then(function(){requestAnimationFrame(go)},go);setTimeout(go,800)}else go();
}
function stop(){
  body.classList.remove('is-present','v-side','v-top');setBlank(null);
  halt();
  if(document.fullscreenElement)document.exitFullscreen().catch(function(){});
  fit();if(slides[i])slides[i].scrollIntoView({block:'center'});
}
// 이 클릭이 문서까지 올라가면 발표가 시작되자마자 한 장 넘어간다
document.getElementById('v-present').addEventListener('click',function(e){e.stopPropagation();start(0)});
document.getElementById('v-print').addEventListener('click',function(){print()});
slides.forEach(function(el,k){el.querySelector('.v-frame').addEventListener('click',function(e){if(!presenting()){e.stopPropagation();start(k)}})});
document.addEventListener('click',function(e){if(!presenting())return;if(!blank.hidden){setBlank(null);return}if(e.clientX<innerWidth*.3)show(i-1);else forwardOne()});
document.addEventListener('mousemove',function(){if(presenting())wake()});
document.addEventListener('fullscreenchange',function(){if(!document.fullscreenElement&&presenting())stop()});
document.addEventListener('keydown',function(e){
  // 키를 읽는 법과 할 일은 앱의 발표 화면과 같은 함수다 (lib/presentKeys.ts)
  var k=presentKey(e);
  // 발표 중에 F5를 또 누르면 새로 고쳐져 발표가 끊긴다
  if(k==='F5'){e.preventDefault();if(!presenting())start(0);return}
  if(!presenting())return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  // 번호를 치고 Enter면 그 장으로 (숫자는 모아 둔다)
  if(num.push(k,e.timeStamp)){e.preventDefault();return}
  var a=presentAction(k,blank.hidden?null:blank.className.indexOf('is-white')>=0?'white':'black',i,slides.length-1,num.take(e.timeStamp));
  if(!a)return;
  e.preventDefault();
  if(a.kind==='blank')setBlank(a.blank);else if(a.kind==='go'&&a.index===i+1&&!a.jump)forwardOne();else if(a.kind==='go')show(a.index);else stop();
});
addEventListener('resize',function(){fit();if(presenting()&&!roomy()){clearTimeout(timer);body.classList.remove('is-awake')}});
fit();fitBlocks(document);clearBackdrops();
// 모션 그래픽의 글자 모양은 목록으로 보는 동안(모든 장이 보인다) 한가할 때 미리 딴다: 발표 중에는 다음 장이 숨어 있어 잴 수 없고, 장을 넘기는 프레임에 따면 첫 프레임이 늦다
function prewarm(){if(window.requestIdleCallback)requestIdleCallback(function(){if(!presenting())cines.prewarm(document)},{timeout:4000})}
if(document.fonts)document.fonts.ready.then(function(){fit();fitBlocks(document);clearBackdrops();prewarm()});else prewarm();
})();`
