'use strict';

/**
 * Inline SVG, drawn on a 16×16 grid with currentColor strokes so every icon
 * inherits the colour and theme of whatever it sits in.
 */
const ICONS = (() => {
  const svg = (body, extra = '') =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

  return {
    today: svg('<circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.3 1.4"/>'),
    upcoming: svg('<rect x="2.3" y="3.2" width="11.4" height="10.5" rx="2"/><path d="M2.3 6.5h11.4M5.6 2v2.4M10.4 2v2.4"/>'),
    inbox: svg('<path d="M2.2 8.6h3.1l1 1.9h3.4l1-1.9h3.1"/><path d="M3.6 3.4h8.8l1.5 5.2v3.4a1.6 1.6 0 0 1-1.6 1.6H3.7a1.6 1.6 0 0 1-1.6-1.6V8.6z"/>'),
    all: svg('<path d="M2.6 4.4h10.8M2.6 8h10.8M2.6 11.6h7.2"/>'),
    completed: svg('<circle cx="8" cy="8" r="6.2"/><path d="M5.4 8.2l1.9 1.9 3.4-3.9"/>'),
    plus: svg('<path d="M8 3.2v9.6M3.2 8h9.6"/>'),
    close: svg('<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/>'),
    search: svg('<circle cx="7.2" cy="7.2" r="4.4"/><path d="M10.6 10.6l3 3"/>'),
    sort: svg('<path d="M4 3.4v9.2M4 12.6l-1.8-2M12 12.6V3.4M12 3.4l1.8 2"/>'),
    theme: svg('<circle cx="8" cy="8" r="4"/><path d="M8 1.4v1.3M8 13.3v1.3M14.6 8h-1.3M2.7 8H1.4M12.7 3.3l-.9.9M4.2 11.8l-.9.9M12.7 12.7l-.9-.9M4.2 4.2l-.9-.9"/>'),
    tick: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.3 8.3l2.4 2.4 5-5.4"/></svg>',
    flag: svg('<path d="M3.8 14V2.6M3.8 3.2h7.6l-1.3 2.6 1.3 2.6H3.8"/>'),
    note: svg('<path d="M3.4 3.6h9.2M3.4 6.6h9.2M3.4 9.6h6.4M3.4 12.6h4"/>'),
    emptyBox: svg('<path d="M2.4 5.6h11.2M4.4 2.6h7.2l2 3v7.2a1.6 1.6 0 0 1-1.6 1.6H4a1.6 1.6 0 0 1-1.6-1.6V5.6z"/><path d="M6.4 8.4h3.2"/>'),
    emptyCheck: svg('<circle cx="8" cy="8" r="6"/><path d="M5.4 8.2l1.9 1.9 3.4-3.9"/>'),

    // Pickers
    chevronLeft: svg('<path d="M9.8 3.6L5.4 8l4.4 4.4"/>'),
    chevronRight: svg('<path d="M6.2 3.6L10.6 8l-4.4 4.4"/>'),
    dotSmall: svg('<circle cx="8" cy="8" r="2.6"/>'),
    clock: svg('<circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.3"/>'),
    repeat: svg('<path d="M3 7a5 5 0 0 1 8.5-3.2l1.3 1.2M13 9a5 5 0 0 1-8.5 3.2L3.2 11"/><path d="M12.8 2.4V5h-2.6M3.2 13.6V11h2.6"/>'),
    check: svg('<path d="M3.4 8.4l3 3 6.2-6.8"/>'),
    bell: svg('<path d="M4 6.6a4 4 0 1 1 8 0c0 3 1 4 1 4H3s1-1 1-4z"/><path d="M6.6 13a1.6 1.6 0 0 0 2.8 0"/>'),
    labelTag: svg('<path d="M2.6 7V3.4a.8.8 0 0 1 .8-.8H7l6.3 6.3a1.1 1.1 0 0 1 0 1.6l-3.2 3.2a1.1 1.1 0 0 1-1.6 0L2.6 7z"/><circle cx="5.2" cy="5.2" r=".9"/>'),
    deadline: svg('<circle cx="8" cy="9" r="5"/><path d="M8 6.4V9l1.8 1.1M6 1.8h4"/>'),
    flag: svg('<path d="M3.8 14V2.6M3.8 3.2h7.6l-1.3 2.6 1.3 2.6H3.8"/>'),

    // View modes
    viewList: svg('<path d="M5.4 4.2h8.2M5.4 8h8.2M5.4 11.8h8.2"/><circle cx="2.7" cy="4.2" r=".9"/><circle cx="2.7" cy="8" r=".9"/><circle cx="2.7" cy="11.8" r=".9"/>'),
    viewTable: svg('<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6"/><path d="M2.2 6.4h11.6M6.6 6.4v6.4M10.2 6.4v6.4"/>'),
    viewBoard: svg('<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6"/><path d="M6.1 3.2v9.6M9.9 3.2v9.6"/>'),
    layout: svg('<path d="M2.6 4.6h10.8M2.6 11.4h10.8"/><circle cx="6" cy="4.6" r="1.7"/><circle cx="10.4" cy="11.4" r="1.7"/>'),
    viewCalendar: svg('<rect x="2.3" y="3.2" width="11.4" height="10.5" rx="2"/><path d="M2.3 6.5h11.4M5.6 2v2.4M10.4 2v2.4"/><circle cx="6" cy="9.4" r=".85"/><circle cx="10" cy="9.4" r=".85"/>'),

    // Date-picker quick rows
    quickToday: svg('<rect x="2.4" y="3.2" width="11.2" height="10.4" rx="2"/><path d="M2.4 6.2h11.2"/>'),
    quickTomorrow: svg('<circle cx="8" cy="8" r="3"/><path d="M8 1.6v1.4M8 13v1.4M14.4 8H13M3 8H1.6M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1"/>'),
    quickNextWeek: svg('<rect x="2.4" y="3.4" width="11.2" height="9.2" rx="2"/><path d="M5.8 8h4.4M8.6 6.4L10.2 8l-1.6 1.6"/>'),
    quickWeekend: svg('<path d="M2.4 9.4V7a1.6 1.6 0 0 1 3.2 0v1.4h4.8V7a1.6 1.6 0 0 1 3.2 0v2.4"/><rect x="1.8" y="9.2" width="12.4" height="3.4" rx="1.3"/>'),
    quickClear: svg('<circle cx="8" cy="8" r="6"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"/>')
  };
})();

if (typeof window !== 'undefined') window.ICONS = ICONS;
