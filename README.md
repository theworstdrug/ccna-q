# CCNA-Q

A personal CCNA 200-301 (v1.1) study PWA. It works offline on an iPhone and on the Linux desktop. There's no build step and no backend: plain HTML, CSS and ES modules, served by GitHub Pages.

## What's in it

| Tab | What it does |
|---|---|
| **Today** | Countdown to the Jan 29 exam and the Feb 2 v1.1 cutoff, tonight's habits (Anki, review, 10 min subnetting, a lab), this week's checklist with a theory/practice hours bar, progress per exam domain, and weak topics. |
| **Read** | LingQ-style reader. 22 original lessons follow the 12-week plan, and 230 CCNA terms are highlighted inside them. **Blue** = new, **yellow** = learning (fades as you rate 1→4), no highlight = known. Tap a term to see the definition, the sentence it came from and your note, then rate it. Tap any other word, or select a phrase, to save your own term. **Import** any text (your notes, a video transcript, a Cisco doc) and it gets highlighted too. Each lesson ends with Cornell-style cue questions. "Finish lesson" moves the remaining blue terms to Known, the same as LingQ. |
| **Review** | Spaced repetition (SM-2-style) for every term rated 1–4. Cards alternate between term→definition and fill-in-the-blank using the sentence you found the term in. Terms graduate to Known after a 21-day interval. Leeches get flagged. |
| **Subnet** | Unlimited drill across 11 question types, with a timer (goal: under 30 s), streaks, per-type accuracy and a block-size explanation for every answer. 10 minutes of drilling ticks off tonight's habit. |
| **Lab** | A stripped-back Packet Tracer (see below). |
| **Plan** | The 12 weeks with checkboxes, milestones, an hours log, the book-chapter triage tracker, an `.ics` export of the calendar, and backup/restore. |

## The mini Packet Tracer

Drag PCs, 2960 switches and 4331 routers onto the canvas, cable them, then tap a device for a terminal. Link lights go green or red. A ping animates the packet along its path.

What the simulated IOS supports:

- Abbreviations (`sh ip int br`, `conf t`, `int g0/0.10`), `?` help, Tab completion, `do`, falling back from sub-modes to global config, `% Invalid input` with the caret
- Interfaces, subinterfaces, loopbacks and SVIs: `ip address`, `shutdown`, `description`, `interface range`
- VLANs, access ports, 802.1Q trunks (native VLAN, allowed list), router-on-a-stick (`encapsulation dot1Q`), `ip default-gateway`
- Static, default and floating static routes, and single-area OSPF (network statements or `ip ospf 1 area 0`, router-id, passive-interface, cost, reference bandwidth, DR/BDR election)
- Standard, extended and named ACLs with `ip access-group in|out` and hit counters
- `show running-config | ip interface brief | ip route | vlan brief | interfaces trunk | mac address-table | arp | cdp neighbors | ip ospf neighbor | access-lists | ip protocols | interfaces`
- Basic hardening: `enable secret` (the password prompt really works), `banner motd`, `line vty`, `username`, `ip domain-name`, `crypto key generate rsa`, `copy run start`
- PCs: `ipconfig <ip> <mask> [gw]`, `ping`, `tracert`, `arp -a`, plus a GUI IP config tab

There are eight guided labs with auto-checked objectives (switch basics, VLANs and trunks, router-on-a-stick, static routes, OSPF, standard and extended ACLs) and an empty sandbox.

It doesn't model STP, DTP, EtherChannel, NAT, DHCP, IPv6 forwarding or timers. Use real Packet Tracer on the desktop for those.

## Deploying (one-time)

1. Push to the default branch (`main`).
2. In the repo, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The `Test & deploy` workflow runs the tests and publishes the site to `https://<user>.github.io/ccna-q/`.

Each deploy stamps the service worker with the commit SHA. The app then shows a "new version" bar and you tap Reload.

## Installing

- **iPhone:** open the URL in Safari → Share → **Add to Home Screen**. It runs full-screen and offline.
- **Linux (Chrome/Chromium):** open the URL and use the install icon in the address bar.

Progress is stored in `localStorage` on each device. Use **Plan → Your data → Export/Import** to back up or to move progress between the phone and the desktop. iOS may clear data for home-screen apps that go unused for a few weeks, so export now and then.

## Development

```sh
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # simulator, labs, subnet generator, SW file list
```

Layout:

```
index.html, manifest.webmanifest, sw.js
css/app.css
js/app.js            router + nav
js/store.js          localStorage state, backup
js/srs.js            statuses + SM-2 scheduler
js/terms.js          term matcher/tokenizer for the reader
js/subnetq.js        subnetting question generator
js/data/             glossary, lessons, 12-week plan
js/views/            today, read, review, subnet, lab, plan
js/sim/              net utils, engine (L2/L3), IOS CLI, labs
tests/               node --test suites
```

Adding a lesson means appending to `js/data/lessons.js`. Adding vocabulary means appending to `js/data/glossary.js`. New lessons pick up glossary terms automatically.
