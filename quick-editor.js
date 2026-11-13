/* RaceWrap quick edit dock: mirrors existing editor controls; no backend or AI generation. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const grid = document.querySelector('.grid');
  const panels = grid && grid.querySelectorAll(':scope > .panel');
  const preview = panels && panels[1];
  const head = preview && preview.querySelector('.preview-head');
  if (!grid || !head || !$('number') || !$('base') || !$('accent') || !$('trim')) return;

  const css = document.createElement('style');
  css.textContent = `
  body{background:radial-gradient(ellipse 80% 450px at 50% 0%,#172b47 0%,#0c1017 80%)}
  header{background:linear-gradient(90deg,#101a2a,#0c1422);border-bottom-color:#354969;box-shadow:0 6px 25px #0003}
  .brand{font-style:italic;letter-spacing:-1px}.brand b{color:#5d9dff}
  .panel{background:linear-gradient(165deg,#172336 0%,#121b29 75%);border-color:#344761;box-shadow:0 14px 34px #0002}
  .car-studio-hero{border-color:#48648b;box-shadow:0 18px 42px #0004}
  button:not(.secondary){background:linear-gradient(135deg,#2877ef,#2152b9)}
  .car-choice .car-choice-active{box-shadow:0 0 0 2px #397be755}
  .stage{border-color:#476486}
  .rw-quick-edit{margin:0 0 18px;padding:16px 18px;border:1px solid #456487;border-radius:16px;
    background:linear-gradient(115deg,#16283f 0%,#152032 54%,#1c1a31 100%);box-shadow:0 12px 36px #0003}
  .rw-quick-edit .rw-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:13px}
  .rw-quick-edit .rw-heading strong{font-size:16px;letter-spacing:-.25px;color:#f5f8ff}
  .rw-quick-edit .rw-heading small{font-size:11px;color:#b7cae3}
  .rw-quick-controls{display:flex;align-items:end;flex-wrap:wrap;gap:12px}
  .rw-quick-controls label{margin:0;min-width:78px;flex:0 0 auto;color:#cddcf1;font-size:12px}
  .rw-quick-controls input[type=text]{margin-top:6px;width:88px;padding:9px 11px;font-size:20px;font-weight:900;text-align:center}
  .rw-quick-controls input[type=color]{display:block;margin-top:6px;width:58px;height:42px;border:2px solid #6b819d;border-radius:11px;padding:3px}
  .rw-quick-controls button{min-height:43px;padding:10px 14px}
  .rw-quick-controls .rw-focus{margin-left:auto;background:#2364d5;border:1px solid #6c9bf0}
  .rw-quick-edit .rw-guide{margin:12px 0 0;color:#aebed5;font-size:12px;line-height:1.5}
  body.rw-focus-mode .grid{grid-template-columns:minmax(0,1fr)}
  body.rw-focus-mode .grid>.panel:first-child{display:none}
  body.rw-focus-mode .grid>.panel:nth-child(2){width:100%}
  body.rw-focus-mode #canvas{min-height:420px}
  @media(max-width:650px){.rw-quick-edit{padding:12px}.rw-quick-controls{gap:9px}
    .rw-quick-controls label{min-width:58px}.rw-quick-controls input[type=text]{width:76px}
    .rw-quick-controls input[type=color]{width:52px}.rw-quick-controls .rw-focus{margin-left:0;flex:1}
    body.rw-focus-mode #canvas{min-height:220px}}
  `;
  document.head.appendChild(css);

  const dock = document.createElement('section');
  dock.className = 'rw-quick-edit';
  dock.id = 'quickEdit';
  dock.setAttribute('aria-label', 'Quick race wrap editor');
  dock.innerHTML = `
    <div class="rw-heading"><strong>⚡ Live wrap controls</strong>
      <small>Changes update the editable concept, not print-ready panels</small></div>
    <div class="rw-quick-controls">
      <label for="quickNumber">Car number<input id="quickNumber" type="text" maxlength="4" inputmode="text" autocomplete="off" aria-label="Quick edit race number"></label>
      <label for="quickBase">Base<input id="quickBase" type="color" aria-label="Quick edit base color"></label>
      <label for="quickAccent">Accent<input id="quickAccent" type="color" aria-label="Quick edit accent color"></label>
      <label for="quickTrim">Trim<input id="quickTrim" type="color" aria-label="Quick edit trim color"></label>
      <button id="quickFocus" class="rw-focus" type="button" aria-pressed="false">Expand preview</button>
      <button id="quickSponsorJump" type="button" class="secondary">Add sponsors</button>
      <button id="quickExportJump" type="button" class="secondary">Save / export</button>
    </div>
    <p class="rw-guide" id="quickGuide" role="status">Pick a car, choose a design direction, then edit your number and colors here. Add sponsors using the main editor.</p>`;
  head.insertAdjacentElement('afterend', dock);

  const pairs = [['number','quickNumber'],['base','quickBase'],['accent','quickAccent'],['trim','quickTrim']];
  let syncing = false;
  function sync() {
    if (syncing) return;
    for (const [original, quick] of pairs) {
      const source = $(original), mirror = $(quick);
      if (source && mirror && document.activeElement !== mirror && mirror.value !== source.value) mirror.value = source.value;
    }
    const carLoaded = $('bodyImage') && $('bodyImage').style.display !== 'none' && !!$('bodyImage').getAttribute('src');
    const guide = $('quickGuide');
    if (guide) guide.textContent = carLoaded
      ? 'Live preview active. Drag numbers or sponsor logos on the car, resize a selected logo by its corner handle, then save your concept.'
      : 'Choose a car and select Start designing this car to activate the live preview. No licensed cut geometry is included.';
  }
  for (const [original, quick] of pairs) {
    const source = $(original), mirror = $(quick);
    mirror.addEventListener('input', () => {
      syncing = true;
      source.value = mirror.value;
      source.dispatchEvent(new Event('input', {bubbles:true}));
      syncing = false;
    });
    mirror.addEventListener('change', () => {
      syncing = true;
      source.value = mirror.value;
      source.dispatchEvent(new Event('change', {bubbles:true}));
      syncing = false;
    });
    source.addEventListener('input', sync);
    source.addEventListener('change', sync);
  }
  const focus = $('quickFocus');
  focus.addEventListener('click', () => {
    const active = document.body.classList.toggle('rw-focus-mode');
    focus.setAttribute('aria-pressed', String(active));
    focus.textContent = active ? 'Show all controls' : 'Expand preview';
    dock.scrollIntoView({block:'start',behavior:'instant'});
  });
  function exitFocus() {
    document.body.classList.remove('rw-focus-mode');
    focus.setAttribute('aria-pressed','false');
    focus.textContent = 'Expand preview';
  }
  $('quickSponsorJump').addEventListener('click', () => {
    exitFocus();
    $('dropzone').scrollIntoView({block:'center',behavior:'instant'});
    $('dropzone').focus({preventScroll:true});
  });
  $('quickExportJump').addEventListener('click', () => {
    exitFocus();
    $('saveProject').scrollIntoView({block:'center',behavior:'instant'});
    $('saveProject').focus({preventScroll:true});
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('rw-focus-mode')) {
      document.body.classList.remove('rw-focus-mode');
      focus.setAttribute('aria-pressed','false');
      focus.textContent = 'Expand preview';
    }
  });
  document.addEventListener('click', () => setTimeout(sync, 0));
  sync();
  setInterval(sync, 900);
})();
