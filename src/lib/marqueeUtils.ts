export function prepareMarquee(event: { currentTarget: HTMLElement }) {
  const wrap = event.currentTarget.querySelector<HTMLElement>(".marquee-wrap");
  const text = event.currentTarget.querySelector<HTMLElement>(".marquee-text");
  if (!wrap || !text) return;

  const overflowDistance = text.scrollWidth - wrap.clientWidth;
  if (overflowDistance > 4) {
    wrap.dataset.marquee = "true";
    wrap.style.setProperty("--marquee-shift", `-${overflowDistance}px`);
    wrap.style.setProperty("--track-title-shift", `-${overflowDistance}px`);
  } else {
    delete wrap.dataset.marquee;
    wrap.style.removeProperty("--marquee-shift");
    wrap.style.removeProperty("--track-title-shift");
  }
}
