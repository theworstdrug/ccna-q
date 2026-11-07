import { h, toast, download, fmtDate } from '../ui.js';
import { db, update, exportJson, importJson, resetAll } from '../store.js';
import { WEEKS, CHAPTERS, MILESTONES, EXAM, weekOf, weekRange, phaseOf, parseDate, daysUntil, buildIcs } from '../data/plan.js';
import { checkItem, hoursBar, logHours } from './today.js';

export function render(root) {
  const wk = weekOf();
  const s = db();

  root.append(h('header.view-head', {}, h('h1', {}, 'Plan'),
    h('div.head-actions', {}, h('button.btn.ghost.small', { onclick: () => logHours(() => { root.replaceChildren(); render(root); }) }, '+ Hours'))));

  // weeks
  const weeks = h('section', {});
  for (const w of WEEKS) {
    const [a, b] = weekRange(w.n);
    const ph = phaseOf(w.n);
    const done = w.items.filter((_, i) => s.plan.checks[`w${w.n}-${i}`]).length;
    const open = w.n === wk || (wk === 0 && w.n === 1);
    weeks.append(h('details.week' + (w.n === wk ? '.current' : '') + (done === w.items.length ? '.complete' : ''), { open },
      h('summary', {},
        h('span.wk-n', {}, w.n),
        h('span.wk-main', {}, h('strong', {}, ph.name), h('span.muted.small', {}, ` ${fmtDate(a)} – ${fmtDate(b)} · ${ph.split[0]}/${ph.split[1]}`)),
        h('span.wk-count', {}, `${done}/${w.items.length}`)),
      w.n === wk ? hoursBar(s, w.n, ph) : null,
      h('ul.checklist', {}, w.items.map((it, i) => checkItem(`w${w.n}-${i}`, it)))));
  }
  root.append(h('h2.section-title', {}, '12-week plan'), weeks);

  // milestones
  root.append(h('section.panel', {}, h('h2', {}, 'Milestones'),
    h('ul.timeline', {}, MILESTONES.map(m => {
      const d = daysUntil(m.date);
      return h('li' + (d < 0 ? '.past' : '') + (m.big ? '.big' : ''), {}, h('strong', {}, fmtDate(parseDate(m.date))), ` ${m.text}`, h('span.muted.small', {}, d >= 0 ? ` · in ${d}d` : ' · done'));
    })),
    h('p.muted.small', {}, `${EXAM.name} · ${EXAM.minutes} min · ${EXAM.cost}. From Feb 3, 2027 only v2.0 is offered.`),
    h('p.muted.small', {}, 'Recurring: daily 7:30 pm Anki + 10 min subnetting · Sundays 4 pm weekly review (Cornell cue self-test + redo one lab from memory).'),
    h('button.btn.ghost.small', { onclick: () => download('ccna-12-week-plan.ics', buildIcs(), 'text/calendar') }, '⬇ Calendar (.ics)')));

  // hours log
  const hours = [...s.plan.hours].map((e, i) => ({ ...e, i })).sort((a, b) => b.date.localeCompare(a.date));
  const th = s.plan.hours.filter(e => e.kind === 'theory').reduce((x, e) => x + e.hours, 0);
  const pr = s.plan.hours.filter(e => e.kind === 'practice').reduce((x, e) => x + e.hours, 0);
  root.append(h('details.panel', {},
    h('summary', {}, h('strong', {}, 'Hours log'), h('span.muted.small', {}, ` · ${(th + pr).toFixed(1)} h total · ${th + pr ? Math.round((th / (th + pr)) * 100) : 0}% theory (target ~40%)`)),
    hours.length ? h('table.mini', {}, h('tbody', {}, hours.slice(0, 40).map(e => h('tr', {},
      h('td', {}, e.date.slice(5)), h('td', {}, `${e.hours} h`), h('td', {}, e.kind), h('td.muted', {}, e.note || ''),
      h('td', {}, h('button.icon-btn.tiny', { 'aria-label': 'Delete', onclick: () => { update(st => st.plan.hours.splice(e.i, 1)); root.replaceChildren(); render(root); } }, '✕'))))))
      : h('p.muted.small', {}, 'No hours logged yet.')));

  // book chapters
  const chDone = CHAPTERS.filter(c => s.plan.chapters[c[0]]).length;
  const toRead = CHAPTERS.filter(c => c[2] !== 'Skip').length;
  root.append(h('details.panel', {},
    h('summary', {}, h('strong', {}, 'Book chapters'), h('span.muted.small', {}, ` · ${chDone}/${toRead} done · finish by Dec 4`)),
    h('p.muted.small', {}, 'CCNA 1 and 2 Companion Guide, 3rd Ed. Out of date as a main source; good for fundamentals.'),
    h('ul.chapters', {}, CHAPTERS.map(([n, title, verdict, note]) => {
      const done = !!s.plan.chapters[n];
      return h('li' + (verdict === 'Skip' ? '.skip' : ''), {},
        h('label.check' + (done ? '.done' : ''), {},
          h('input', { type: 'checkbox', checked: done, disabled: verdict === 'Skip', onchange: e => { update(st => { st.plan.chapters[n] = e.target.checked; }); e.target.parentElement.classList.toggle('done', e.target.checked); } }),
          h('span', {}, h('span.ch-n', {}, n), ` ${title} `, h('span.verdict.v-' + verdict.toLowerCase(), {}, verdict))),
        note ? h('div.muted.small.ch-note', {}, note) : null);
    })),
    h('p.muted.small', {}, 'Not in the book: VLANs/trunking, inter-VLAN routing, EtherChannel, Rapid STP, OSPF, IPv6 in depth, NAT, HSRP, NTP, syslog, SNMP, QoS, SSH, port security, DHCP snooping, DAI, AAA, WPA2/3, WLCs, automation, AI. Use Jeremy\'s IT Lab and the Read tab.')));

  // resources
  root.append(h('details.panel', {},
    h('summary', {}, h('strong', {}, 'Resources')),
    h('ul.plain', {},
      h('li', {}, h('strong', {}, 'Main course: '), 'Jeremy\'s IT Lab (YouTube; Packet Tracer labs + Anki decks)'),
      h('li', {}, h('strong', {}, 'Labs: '), 'Packet Tracer (official Linux .deb) on sinstation; the Lab tab here on the phone. Optional: GNS3 / CML Free'),
      h('li', {}, h('strong', {}, 'Practice exams: '), 'Boson ExSim (buy Jan 18, use in week 12)'),
      h('li', {}, h('strong', {}, 'Flashcards: '), 'Anki desktop + AnkiMobile'),
      h('li', {}, h('strong', {}, 'Linux tie-ins: '), h('code', {}, 'ip addr/route/neigh, ss, dig, traceroute, tcpdump'), ', Wireshark, ', h('code', {}, 'curl | jq'), ' for REST/JSON'))));

  // data
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { importJson(await f.text()); toast('Backup restored'); root.replaceChildren(); render(root); } catch (err) { toast(err.message); }
  } });
  root.append(h('section.panel', {}, h('h2', {}, 'Your data'),
    h('p.muted.small', {}, 'Everything is stored on this device only. Export a backup now and then, and import it to move between your phone and sinstation. iOS can clear storage for home-screen apps you haven\'t opened in a while.'),
    h('div.row.wrap', {},
      h('button.btn.small', { onclick: () => download(`ccna-q-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJson(), 'application/json') }, '⬇ Export backup'),
      h('button.btn.ghost.small', { onclick: () => file.click() }, '⬆ Import backup'),
      h('button.btn.ghost.small.danger', { onclick: () => { if (confirm('Erase ALL progress on this device?')) { resetAll(); toast('Reset'); root.replaceChildren(); render(root); } } }, 'Reset')),
    file));
}
