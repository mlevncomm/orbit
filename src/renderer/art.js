// Orbit görselleri: referanstaki fotoğraf/video alanlarının yerine geçen, uygulamaya gömülü
// SVG çizimler ve CSS ile canlandırılan sahneler. Dış kaynak yok (CSP: yalnızca 'self').
window.ART = (() => {
  let seq = 0;
  const uid = (p) => `${p}${++seq}`;

  /** İşlemci: ısı dağıtıcılı çip, altında pinler */
  function cpu() {
    const g = uid('cpu'), s = uid('cpus');
    const pins = [];
    for (let i = 0; i < 9; i++) {
      const p = 38 + i * 13.5;
      pins.push(`<rect x="${p}" y="18" width="5" height="14" rx="2"/><rect x="${p}" y="168" width="5" height="14" rx="2"/>`);
      pins.push(`<rect x="18" y="${p}" width="14" height="5" rx="2"/><rect x="168" y="${p}" width="14" height="5" rx="2"/>`);
    }
    return `<svg class="art art-cpu" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#d9d4ee"/><stop offset="1" stop-color="#9f97c6"/></linearGradient>
        <linearGradient id="${s}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3157"/><stop offset="1" stop-color="#1c1730"/></linearGradient>
      </defs>
      <g fill="#c9a24a" opacity=".95">${pins.join('')}</g>
      <rect x="30" y="30" width="140" height="140" rx="18" fill="url(#${s})"/>
      <rect x="48" y="48" width="104" height="104" rx="14" fill="url(#${g})"/>
      <path d="M48 62a14 14 0 0 1 14-14h40L48 102z" fill="#fff" opacity=".55"/>
      <rect x="64" y="118" width="46" height="5" rx="2.5" fill="#6d6497" opacity=".55"/>
      <rect x="64" y="128" width="30" height="5" rx="2.5" fill="#6d6497" opacity=".35"/>
      <circle cx="132" cy="68" r="5" fill="#6d6497" opacity=".35"/>
      <rect x="30" y="30" width="140" height="140" rx="18" fill="none" stroke="#fff" stroke-opacity=".15"/>
    </svg>`;
  }

  /** Ekran kartı: iki dönen fan, PCIe altın kontaklar, RGB şerit */
  function gpu() {
    const b = uid('gb'), f = uid('gf'), l = uid('gl');
    const fan = (cx) => `<g transform="translate(${cx} 88)">
      <circle r="38" fill="#14121c"/><circle r="38" fill="none" stroke="#3a3550" stroke-width="3"/>
      <g class="spin">${Array.from({ length: 7 }, (_, i) => `<path d="M0 -6 C 14 -10 26 -22 30 -34 C 16 -30 6 -22 0 -6z" fill="url(#${f})" transform="rotate(${i * 51.4})"/>`).join('')}</g>
      <circle r="9" fill="#2a2638"/><circle r="4" fill="#8a82b5"/>
    </g>`;
    return `<svg class="art art-gpu" viewBox="0 0 260 170" aria-hidden="true">
      <defs>
        <linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3450"/><stop offset="1" stop-color="#1d1a29"/></linearGradient>
        <linearGradient id="${f}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d5578"/><stop offset="1" stop-color="#2b2740"/></linearGradient>
        <linearGradient id="${l}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff7a59"/><stop offset=".5" stop-color="#ff4f9a"/><stop offset="1" stop-color="#7b5cff"/></linearGradient>
      </defs>
      <rect x="22" y="146" width="96" height="12" rx="2" fill="#d6ad4f"/>
      <g fill="#b48a32">${Array.from({ length: 14 }, (_, i) => `<rect x="${25 + i * 6.6}" y="148" width="3.6" height="9" rx="1"/>`).join('')}</g>
      <rect x="6" y="20" width="248" height="130" rx="20" fill="url(#${b})"/>
      <rect x="6" y="20" width="248" height="130" rx="20" fill="none" stroke="#fff" stroke-opacity=".12"/>
      <rect class="rgb-flow" x="22" y="30" width="216" height="5" rx="2.5" fill="url(#${l})"/>
      ${fan(80)}${fan(180)}
      <rect x="226" y="52" width="16" height="72" rx="6" fill="#2a2638"/>
      <path d="M14 34a14 14 0 0 1 14-14h60L14 96z" fill="#fff" opacity=".06"/>
    </svg>`;
  }

  /** Anakart: soket, RAM yuvaları, PCIe, akan RGB şerit */
  function board() {
    const p = uid('bp'), l = uid('bl');
    return `<svg class="art art-board" viewBox="0 0 220 220" aria-hidden="true">
      <defs>
        <linearGradient id="${p}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d3550"/><stop offset="1" stop-color="#161a2a"/></linearGradient>
        <linearGradient id="${l}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fd1ff"/><stop offset=".5" stop-color="#9b6bff"/><stop offset="1" stop-color="#ff5fa2"/></linearGradient>
      </defs>
      <rect x="10" y="10" width="200" height="200" rx="20" fill="url(#${p})"/>
      <rect x="10" y="10" width="200" height="200" rx="20" fill="none" stroke="#fff" stroke-opacity=".12"/>
      <rect x="22" y="22" width="30" height="66" rx="6" fill="#3c4566"/>
      <rect class="rgb-flow v" x="56" y="24" width="4" height="62" rx="2" fill="url(#${l})"/>
      <rect x="72" y="34" width="64" height="64" rx="10" fill="#cfd5ea"/><rect x="82" y="44" width="44" height="44" rx="6" fill="#aab2cf"/>
      <g fill="#0f1220">${[150, 162, 174, 186].map((x) => `<rect x="${x}" y="24" width="7" height="92" rx="3"/>`).join('')}</g>
      <g fill="url(#${l})" class="ram-glow">${[150, 162, 174, 186].map((x) => `<rect x="${x + 1.5}" y="26" width="4" height="10" rx="2"/>`).join('')}</g>
      <rect x="22" y="122" width="150" height="10" rx="3" fill="#0f1220"/><rect x="22" y="150" width="150" height="8" rx="3" fill="#0f1220"/>
      <rect x="22" y="176" width="60" height="22" rx="5" fill="#3c4566"/><circle cx="110" cy="186" r="11" fill="#3c4566"/><circle cx="110" cy="186" r="5" fill="#cfd5ea"/>
      <g fill="#7f89ad">${[136, 150, 164, 178, 192].map((x) => `<rect x="${x}" y="178" width="8" height="8" rx="2"/>`).join('')}</g>
    </svg>`;
  }

  /** Sistem: monitör ve Windows camı */
  function system() {
    const s = uid('ss');
    return `<svg class="art art-sys" viewBox="0 0 220 180" aria-hidden="true">
      <defs><linearGradient id="${s}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9be7ff"/><stop offset=".5" stop-color="#5aa9ff"/><stop offset="1" stop-color="#7b5cff"/></linearGradient></defs>
      <rect x="86" y="140" width="48" height="20" rx="4" fill="#3a4258"/><rect x="62" y="158" width="96" height="8" rx="4" fill="#2a3044"/>
      <rect x="10" y="10" width="200" height="134" rx="16" fill="#1d2233"/>
      <rect x="18" y="18" width="184" height="118" rx="10" fill="url(#${s})"/>
      <g fill="#fff" opacity=".92" transform="translate(84 46)"><rect width="24" height="24" rx="2"/><rect x="28" width="24" height="24" rx="2"/><rect y="28" width="24" height="24" rx="2"/><rect x="28" y="28" width="24" height="24" rx="2"/></g>
      <path d="M18 28a10 10 0 0 1 10-10h90L18 110z" fill="#fff" opacity=".14"/>
    </svg>`;
  }

  /** ESP32 geliştirme kartı: metal modül, USB, pin sıraları, yanıp sönen mavi LED */
  function esp32() {
    const m = uid('em');
    return `<svg class="art art-esp" viewBox="0 0 260 150" aria-hidden="true">
      <defs><linearGradient id="${m}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f8"/><stop offset=".5" stop-color="#c9c9d6"/><stop offset="1" stop-color="#9a9aab"/></linearGradient></defs>
      <rect x="6" y="18" width="248" height="114" rx="12" fill="#17171f"/>
      <g fill="#c9a24a">${Array.from({ length: 15 }, (_, i) => `<circle cx="${36 + i * 13.5}" cy="28" r="3.2"/><circle cx="${36 + i * 13.5}" cy="122" r="3.2"/>`).join('')}</g>
      <rect x="150" y="42" width="92" height="66" rx="6" fill="url(#${m})"/>
      <text x="196" y="80" text-anchor="middle" font-size="11" font-family="Consolas, monospace" fill="#5b5b6e" font-weight="700">ESP32</text>
      <path d="M150 48a6 6 0 0 1 6-6h40l-46 46z" fill="#fff" opacity=".45"/>
      <rect x="0" y="58" width="34" height="34" rx="5" fill="#b8b8c6"/><rect x="4" y="66" width="22" height="18" rx="3" fill="#6b6b7c"/>
      <rect x="54" y="56" width="22" height="16" rx="3" fill="#2b2b36"/><rect x="54" y="80" width="22" height="16" rx="3" fill="#2b2b36"/>
      <rect x="92" y="62" width="34" height="28" rx="4" fill="#2b2b36"/>
      <circle class="led" cx="112" cy="104" r="5" fill="#3d8bff"/>
      <circle cx="96" cy="104" r="4" fill="#ff4d4d" opacity=".85"/>
    </svg>`;
  }

  /** Asistan küresi: dönen konik gradyan + parıltı */
  function orb() {
    return `<div class="art-orb" aria-hidden="true"><i></i><b></b><span>${window.ICONS('sparkles', 30)}</span></div>`;
  }

  /**
   * Panel sahnesi ("video" alanı): ortada Orbit çekirdeği, eğik yörüngelerde dönen rozetler.
   * items: [{ icon, color }] — rozetlerde gösterilecek ikonlar.
   */
  function scene(items) {
    const I = window.ICONS;
    const rings = [
      { cls: 'r1', dur: 26, list: items.slice(0, 2) },
      { cls: 'r2', dur: 38, list: items.slice(2, 5) },
      { cls: 'r3', dur: 54, list: items.slice(5, 9) },
    ];
    return `<div class="scene" aria-hidden="true">
      <div class="scene-glow"></div>
      ${rings.map((r) => `<div class="ring ${r.cls}" style="--dur:${r.dur}s">${r.list.map((it, i) => {
        const a = (360 / r.list.length) * i + (r.cls === 'r2' ? 40 : r.cls === 'r3' ? 15 : 0);
        return `<b style="--a:${a}deg"><i style="--c:${it.color}">${I(it.icon, 20)}</i></b>`;
      }).join('')}</div>`).join('')}
      <div class="core">${I('logo', 34)}</div>
      ${Array.from({ length: 7 }, (_, i) => `<em class="spark" style="--x:${(i * 37) % 100}%;--y:${(i * 53 + 11) % 100}%;--d:${(i % 4) * 0.7}s"></em>`).join('')}
    </div>`;
  }

  return { cpu, gpu, board, system, esp32, orb, scene };
})();
