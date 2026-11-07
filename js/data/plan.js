// The 12-week plan and milestones from the planning brief. Book triage lives in book.js.

export const EXAM = {
  name: 'Cisco CCNA 200-301 v1.1',
  target: '2027-01-29',
  cutoff: '2027-02-02',
  start: '2026-11-09',
  minutes: 120,
  cost: '$300 USD',
};

// v1.1 blueprint weights
export const DOMAINS = [
  { id: 'fund', name: 'Network Fundamentals', weight: 20 },
  { id: 'access', name: 'Network Access', weight: 20 },
  { id: 'ip', name: 'IP Connectivity', weight: 25 },
  { id: 'svc', name: 'IP Services', weight: 10 },
  { id: 'sec', name: 'Security Fundamentals', weight: 15 },
  { id: 'auto', name: 'Automation & Programmability', weight: 10 },
];

export const PHASES = [
  { weeks: [1, 2], name: 'Fundamentals', split: [60, 40] },
  { weeks: [3, 4, 5], name: 'Switching', split: [40, 60] },
  { weeks: [6, 7, 8], name: 'Routing', split: [40, 60] },
  { weeks: [9], name: 'IP Services', split: [40, 60] },
  { weeks: [10], name: 'Security & Wireless', split: [40, 60] },
  { weeks: [11], name: 'Automation', split: [40, 60] },
  { weeks: [12], name: 'Review', split: [20, 80] },
];

export const WEEKS = [
  { n: 1, items: ['Install Packet Tracer, Anki desktop + AnkiMobile', 'OSI & TCP/IP models, encapsulation', 'Ethernet frames & MAC addresses', 'IPv4 addresses, binary ↔ decimal', 'Book ch 1 (partial), 2, 5', 'Sim lab 1 · Hello, switch'] },
  { n: 2, items: ['TCP vs UDP, ports, 3-way handshake, windowing', 'Subnetting with the block-size method', 'VLSM', 'Book ch 7, 8, 9', 'Subnetting under 30 s on /24–/30'] },
  { n: 3, items: ['VLANs & access ports', '802.1Q trunks, native VLAN, allowed list', 'DTP/VTP (awareness)', 'Book ch 6 (partial)', 'Sim lab 3 · VLANs & trunk'] },
  { n: 4, items: ['Inter-VLAN routing: router-on-a-stick & SVIs', 'STP: root bridge, port roles/states, costs', 'Sim lab 4 · Router-on-a-stick'] },
  { n: 5, items: ['Rapid PVST+, PortFast, BPDU Guard', 'EtherChannel: LACP, PAgP, static', 'CDP & LLDP (book ch 13)', 'Sim lab 2 · Switch basics & SVI', 'Dec 4 · finish the book, take the Book exam'] },
  { n: 6, items: ['Routing table, longest match, AD & metrics', 'Static, default & floating static routes', 'Book ch 15, 16 (routing table only)', 'Sim lab 5 · Static & default routes'] },
  { n: 7, items: ['OSPF: neighbors, DR/BDR, cost, router ID, passive', 'Sim lab 6 · Single-area OSPF', 'IPv6 addressing, EUI-64, link-local, SLAAC'] },
  { n: 8, items: ['IPv6 static routes', 'FHRP / HSRP', 'Standard, extended & named ACLs (book ch 20)', 'Sim labs 7–8 · ACLs'] },
  { n: 9, items: ['NAT & PAT', 'DHCP & relay (ip helper-address), DNS', 'NTP, SNMP, syslog levels', 'SSH configuration', 'QoS concepts: marking, queuing, policing vs shaping'] },
  { n: 10, items: ['Security concepts: threats, mitigation, passwords/MFA', 'Port security', 'DHCP snooping & DAI', 'AAA, RADIUS vs TACACS+', 'WPA2/WPA3, WLC & AP modes'] },
  { n: 11, items: ['SDN: controller, planes, northbound/southbound', 'REST APIs, CRUD ↔ HTTP verbs, JSON', 'Ansible / Terraform / Puppet / Chef', 'AI & ML in network operations', 'Jan 18 · buy Boson ExSim'] },
  { n: 12, items: ['Boson exam A (timed)', 'Boson exam B (timed)', 'Boson exam C (timed)', 'Drill the weak-topic list', 'Jan 29 · sit the exam'] },
];

export const MILESTONES = [
  { date: '2026-11-09', text: 'Install tools' },
  { date: '2026-12-04', text: 'Finish the book + book exam' },
  { date: '2027-01-18', text: 'Buy Boson ExSim' },
  { date: '2027-01-29', text: 'Target exam date', big: true },
  { date: '2027-02-02', text: 'Last day for v1.1', big: true },
];

const DAY = 86400000;
export const parseDate = s => new Date(`${s}T00:00:00`);

/** 1-based plan week for a date, 0 before the plan, 13 after. */
export function weekOf(date = new Date()) {
  const d = Math.floor((date - parseDate(EXAM.start)) / DAY);
  if (d < 0) return 0;
  return Math.min(13, Math.floor(d / 7) + 1);
}

export function weekRange(n) {
  const s = new Date(parseDate(EXAM.start).getTime() + (n - 1) * 7 * DAY);
  const e = new Date(s.getTime() + 6 * DAY);
  return [s, e];
}

export function phaseOf(n) { return PHASES.find(p => p.weeks.includes(n)); }

export function daysUntil(s, from = new Date()) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((parseDate(s) - a) / DAY);
}

const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** Regenerate the study calendar as an .ics string (America/Chicago). */
export function buildIcs() {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CCNA-Q//Study Plan//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:CCNA 12-week plan', 'X-WR-TIMEZONE:America/Chicago',
    'BEGIN:VTIMEZONE', 'TZID:America/Chicago',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0600', 'TZOFFSETTO:-0500', 'TZNAME:CDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0600', 'TZNAME:CST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
    'END:VTIMEZONE'];
  const stamp = `${ymd(new Date())}T000000Z`;
  const ev = (uid, lines) => L.push('BEGIN:VEVENT', `UID:${uid}@ccna-q`, `DTSTAMP:${stamp}`, ...lines, 'END:VEVENT');
  for (const w of WEEKS) {
    const [s, e] = weekRange(w.n);
    const p = phaseOf(w.n);
    const end = new Date(e.getTime() + DAY);
    ev(`week${w.n}`, [`DTSTART;VALUE=DATE:${ymd(s)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:CCNA wk ${w.n}: ${p.name}`, `DESCRIPTION:${w.items.join('\\n').replace(/,/g, '\\,')}`, 'TRANSP:TRANSPARENT']);
  }
  for (const m of MILESTONES) {
    const d = parseDate(m.date);
    ev(`ms${ymd(d)}`, [`DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(new Date(d.getTime() + DAY))}`, `SUMMARY:${m.big ? '⭐ ' : ''}${m.text}`]);
  }
  const until = '20270202T235959Z';
  ev('daily', ['DTSTART;TZID=America/Chicago:20261109T193000', 'DTEND;TZID=America/Chicago:20261109T200000',
    `RRULE:FREQ=DAILY;UNTIL=${until}`, 'SUMMARY:Anki + 10 min subnetting', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Anki + subnetting', 'TRIGGER:-PT5M', 'END:VALARM']);
  ev('weekly', ['DTSTART;TZID=America/Chicago:20261115T160000', 'DTEND;TZID=America/Chicago:20261115T170000',
    `RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=${until}`, 'SUMMARY:Weekly review (Cornell cues + redo one lab)']);
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
