// Lessons that follow the Companion Guide chapter by chapter (original text).
// Same format as lessons.js; `chapter` ties a lesson to the book.

export const BOOK_LESSONS = [
  {
    id: 'ch1-binary', chapter: 1, title: 'Binary, hex and IP addresses', domain: 'fund', week: 1,
    body: `Computers store everything as bits, 1s and 0s. Eight bits make a byte, and in networking we call an 8-bit group an octet. To work with IP addresses and masks you need to move comfortably between three number systems.

## Binary (base 2)
Each bit position is worth double the one to its right. In an octet the values are 128, 64, 32, 16, 8, 4, 2, 1. Binary to decimal: add up the values where there is a 1. 10101100 = 128 + 32 + 8 + 4 = 172.

Decimal to binary: walk the positions from 128 down. If the number is at least that value, write 1 and subtract; otherwise write 0. For 200: 128 fits (72 left), 64 fits (8 left), 32 no, 16 no, 8 fits (0 left), then 0, 0, 0. Answer: 11001000.

## Hexadecimal (base 16)
Hex uses 0–9 then A–F for 10–15. One hex digit is exactly 4 bits (a nibble), so one byte is two hex digits. That makes binary ↔ hex easy: split the byte in half and convert each nibble. 1111 1110 = F E = 0xFE. Hex to decimal: first digit × 16 + second digit, so 0xAF = 10 × 16 + 15 = 175. MAC addresses and IPv6 addresses are written in hex.

## IP addresses and masks
An IPv4 address is 32 bits written as four octets in dotted decimal. A subnet mask is a run of 1s followed by 0s. The 1s mark the network part. 255.255.255.0 is 24 ones, so it can be written /24.

The device finds its network by doing a Boolean AND of address and mask, bit by bit. 1 AND 1 = 1; anything AND 0 = 0. So 192.168.10.77 AND 255.255.255.0 = 192.168.10.0. Wherever the mask octet is 255 the address octet survives, and wherever it is 0 the octet becomes 0.

Practise conversions in **Drills → Binary & hex** until they are automatic. Subnetting depends on it.`,
    cues: [
      ['Octet bit values, left to right?', '128 64 32 16 8 4 2 1'],
      ['Convert 200 to binary.', '11001000'],
      ['Convert 0xC0 to decimal.', '12 × 16 + 0 = 192'],
      ['What does ANDing an address with its mask give you?', 'The network address.'],
    ],
  },
  {
    id: 'ch2-networks', chapter: 2, title: 'Networks, topologies and bandwidth', domain: 'fund', week: 1,
    body: `A network is just devices sharing resources over a medium. They come in sizes. A LAN covers a building or campus and is owned by you. A WAN spans cities or countries, usually over a service provider's links. You will also meet MAN (metropolitan) and SAN (storage) in older texts.

## Topologies
The physical topology is how cables and devices are laid out. The logical topology is how data actually flows and how hosts take turns on the medium.
- Bus: one shared cable. Historic.
- Ring: each device passes data to the next. Token Ring and FDDI used this. Historic.
- Star: everything connects to a central switch. Modern Ethernet LANs are stars.
- Extended star: stars linked together, the basis of hierarchical campus designs.
- Full mesh: every device links to every other, n(n−1)/2 links. Partial mesh connects only some pairs, and is common in WAN cores.

## Bandwidth and throughput
Bandwidth is how much data a link can carry per second, measured in bits per second: kbps, Mbps, Gbps. Throughput is what you actually achieve. It is almost always lower, because of protocol overhead, congestion, the number of users, and the slowest link in the path. Transfer time ≈ file size (in bits) ÷ throughput. Watch the units: a 100 MB file is 800 megabits.

## Peers, clients and servers
In a peer-to-peer network every computer can share and request resources; it is fine for a handful of machines. In a client/server network dedicated servers provide services centrally, which scales and is easier to secure.

## Standards
Protocols are rules for communication, and standards make different vendors work together. The IEEE writes the LAN standards (802.3 Ethernet, 802.11 wireless). The IETF publishes the Internet's RFCs. ISO created the OSI model, which the next lesson covers.`,
    cues: [
      ['Physical vs logical topology?', 'Physical = cable/device layout. Logical = how data flows / media access.'],
      ['Links in a full mesh of 5 routers?', '5 × 4 ÷ 2 = 10'],
      ['Why is throughput lower than bandwidth?', 'Overhead, congestion, number of users, slowest link.'],
      ['Which body writes the Ethernet and Wi-Fi standards?', 'IEEE (802.3, 802.11).'],
    ],
  },
  {
    id: 'ch3-media', chapter: 3, title: 'Copper, fiber and wireless media', domain: 'fund', week: 1,
    body: `## Copper
UTP (unshielded twisted pair) is the everyday LAN cable: four twisted pairs and RJ-45 connectors, up to 100 m. Twisting the pairs cancels crosstalk and outside interference. STP adds shielding for noisy environments. Coax used to carry Ethernet and still carries cable broadband. Categories matter: Cat 5e and Cat 6 handle Gigabit, and Cat 6a handles 10 Gbps to 100 m.

## Which cable where
- **Straight-through**: both ends wired the same (T568A–T568A or T568B–T568B). Traditionally used between unlike devices: PC ↔ switch, router ↔ switch.
- **Crossover**: one end T568A, the other T568B, which swaps transmit and receive. Traditionally used between like devices: switch ↔ switch, PC ↔ PC, router ↔ router, and PC ↔ router.
- **Rollover (console)**: pins reversed end to end. It connects a terminal to a router or switch console port. Today it is often a USB console cable instead.

Modern ports support Auto-MDIX and fix the wiring themselves, so a wrong cable usually still works. Knowing the rule is still expected.

## Fiber
Fiber carries light, so it is immune to EMI, hard to tap, and goes far. Multimode fiber has a wide core and uses LED or VCSEL light, is cheaper, and covers up to a few hundred metres, typically inside buildings. Single-mode fiber has a tiny core and uses a laser, is more expensive, and runs for kilometres between buildings or cities. Each link uses a pair of fibers, one per direction. Common connectors are LC, SC and ST.

## Wireless
Wireless LANs (802.11) use radio. An access point bridges wireless clients onto the wired LAN. Radio is a shared, half-duplex medium, so clients use CSMA/CA to avoid collisions.

Skip the book's wireless security section: WEP and LEAP are broken. WPA2 and WPA3 are covered in the Security lessons.`,
    cues: [
      ['Straight-through vs crossover: when is each used?', 'Straight: unlike devices (PC-switch). Crossover: like devices (switch-switch, PC-router).'],
      ['What is a rollover cable for?', 'Console access to a router or switch.'],
      ['Multimode vs single-mode?', 'MM: wider core, LED, shorter, cheaper. SM: laser, long distance.'],
      ['Why twist the pairs?', 'To cancel crosstalk and EMI.'],
    ],
  },
  {
    id: 'ch4-summary', chapter: 4, title: 'Chapter 4 at a glance (skip)', domain: 'fund', week: 1,
    body: `This chapter is about testing cables and wiring LANs and WANs. Your triage says **skip it**. Here is what it covers, so the terms are not a surprise if they show up.

- Signals weaken over distance. That is attenuation, measured in decibels (dB). Noise and crosstalk corrupt signals. NEXT (near-end crosstalk) is measured at the transmitting end.
- Cable testers check wire maps (pinouts), length, attenuation and crosstalk against the category standard.
- LAN cabling: which cable goes between which devices. This repeats Chapter 3.
- WAN cabling: serial links connect a router (DTE) to a CSU/DSU or modem (DCE). In a lab with two routers back to back, the router holding the DCE end of the cable must provide the clock with the \`clock rate\` command. ISDN is also described.

Why skip it: serial WAN links and ISDN have mostly disappeared, and the v1.1 exam does not test cable testing or serial clocking. Spend the time on subnetting instead.`,
    cues: [
      ['What is attenuation?', 'Loss of signal strength over distance.'],
      ['Which end of a serial link provides the clock?', 'The DCE.'],
    ],
  },
  {
    id: 'ch5-frames', chapter: 5, title: 'Ethernet standards and the frame', domain: 'fund', week: 1,
    body: `Ethernet is defined by IEEE 802.3. Names describe the standard: in 100BASE-TX, 100 is the speed in Mbps, BASE means baseband (one signal on the wire), and TX means twisted pair. 1000BASE-T is Gigabit over copper and 1000BASE-LX is Gigabit over long-wave fiber.

## Two sublayers
The IEEE splits the Data Link layer in two. LLC (Logical Link Control, 802.2) talks upward to the network layer protocol. MAC (Media Access Control) handles addressing, framing and access to the medium, and is defined per technology (802.3 for Ethernet, 802.11 for Wi-Fi).

## MAC addresses
A MAC address is 48 bits (6 bytes) shown as hex, such as 0050.56ab.cdef. The first 24 bits are the OUI assigned to the manufacturer; the vendor numbers the rest. FFFF.FFFF.FFFF is the broadcast address. Addresses starting 01-00-5E are IPv4 multicast.

## The frame
- **Preamble + SFD** (8 bytes): alternating bits to synchronise, then the start-of-frame delimiter.
- **Destination MAC** (6) and **Source MAC** (6)
- **Type/Length** (2): a value of 0x0600 or more is an EtherType (0x0800 = IPv4, 0x86DD = IPv6, 0x0806 = ARP); smaller values are a length.
- **Data** (46–1500 bytes): padded if shorter.
- **FCS** (4): a CRC the receiver uses to detect errors.

Not counting the preamble, the minimum frame is 64 bytes and the maximum is 1518 (1522 with an 802.1Q tag). Shorter frames are runts; longer ones are giants.

## CSMA/CD
On shared, half-duplex Ethernet, a station listens before sending (carrier sense). If two transmit at once there is a collision. Both send a jam signal, wait a random backoff time and try again. Full-duplex links have a dedicated path each way, so there are no collisions and CSMA/CD is switched off.`,
    cues: [
      ['What do the parts of "1000BASE-T" mean?', '1000 Mbps, baseband, twisted pair.'],
      ['List the Ethernet frame fields in order.', 'Preamble/SFD, dest MAC, src MAC, type/length, data, FCS.'],
      ['Minimum and maximum frame size?', '64 and 1518 bytes (1522 tagged).'],
      ['What happens after a collision?', 'Jam signal, random backoff, retransmit.'],
    ],
  },
  {
    id: 'ch6-switching', chapter: 6, title: 'Domains, bridges and switches', domain: 'access', week: 3,
    body: `## Collision and broadcast domains
A collision domain is the area where two transmissions can collide. Hubs and repeaters extend it: every port on a hub shares one collision domain. Bridges and switches break it up, giving every port its own collision domain. A broadcast domain is everything that hears a broadcast. Switches forward broadcasts out all ports (in the VLAN), so one switch is one broadcast domain. Routers stop broadcasts, so each router interface is a separate broadcast domain.

**Counting example:** two PCs on a hub, the hub plugged into a switch port, three PCs on other switch ports, and the switch uplinked to a router. That is **5 collision domains** (the hub segment, three PC ports, the uplink) and **1 broadcast domain** on that side of the router. Every switch port and every router port is its own collision domain.

## Bridges and switches
A bridge segments a LAN in software. A switch is a multi-port bridge doing the same job in hardware (ASICs) at wire speed. Both learn source MACs into a table, forward known unicast out one port, filter frames whose destination is on the same port they arrived on, and flood broadcasts and unknown unicasts.

## Switching methods
- Store-and-forward: receive the whole frame and check the FCS, then forward. Drops corrupted frames. Standard on Cisco switches today.
- Cut-through: start forwarding as soon as the destination MAC is read. Lowest latency, but errors propagate.
- Fragment-free: read the first 64 bytes (where collisions show up), then forward. A compromise.

## Why Spanning Tree exists
Redundant links between switches create loops. Ethernet has no TTL, so broadcasts circle and multiply into a broadcast storm, MAC tables flap, and hosts receive duplicate frames. STP blocks just enough ports to leave one loop-free path, and unblocks them if the active path fails. The supplementary Spanning Tree lesson covers root bridge election and Rapid STP, which v1.1 expects.

Skim the Gigabit/10-Gigabit pages, and skip 10BASE5/10BASE2.`,
    cues: [
      ['Which devices break up collision domains? Broadcast domains?', 'Bridges/switches (collision); routers (broadcast).'],
      ['Three switching methods?', 'Store-and-forward, cut-through, fragment-free (64 bytes).'],
      ['Three problems caused by a Layer 2 loop?', 'Broadcast storms, MAC table instability, duplicate frames.'],
    ],
  },
  {
    id: 'ch7-suite', chapter: 7, title: 'The TCP/IP suite and address classes', domain: 'fund', week: 1,
    body: `TCP/IP grew out of the US DoD's ARPANET work and became the Internet's protocol suite. Its layers map to OSI as follows:
- Application: OSI 5–7 (HTTP, FTP, TFTP, SMTP, DNS, SNMP, Telnet)
- Transport: OSI 4 (TCP, UDP)
- Internet: OSI 3 (IP, ICMP, ARP)
- Network Access: OSI 1–2 (Ethernet, Wi-Fi)

## Address classes
Before CIDR, the first octet decided the class and the default mask:
- **Class A**: 1–126, /8. Each network is huge. 127 is reserved for loopback.
- **Class B**: 128–191, /16.
- **Class C**: 192–223, /24.
- **Class D**: 224–239, multicast.
- **Class E**: 240–255, experimental.

Classful thinking still shows up in questions ("what is the classful network of 172.16.5.4?" → 172.16.0.0), but real networks are classless. Any prefix length is fine.

## Reserved addresses
In every network, the first address (host bits all 0) is the network address and the last (host bits all 1) is the broadcast address. Neither can be assigned to a host. The private ranges 10.0.0.0/8, 172.16.0.0/12 (172.16–172.31) and 192.168.0.0/16 are free for internal use and need NAT to reach the Internet. Other special ranges are 127.0.0.0/8 (loopback), 169.254.0.0/16 (link-local/APIPA) and 0.0.0.0 ("this host" or the default route).

## Getting an address
An address can be configured statically (servers, routers, printers) or dynamically with DHCP (clients). DHCP leases the address, mask, gateway and DNS servers. The book also covers RARP and BOOTP, its predecessors; skip them.

ARP links Layer 3 to Layer 2. A host that knows a local IP but not its MAC broadcasts an ARP request ("who has 192.168.1.20?"), and the owner replies with its MAC by unicast. The answer is cached in the ARP table.

## IPv6 preview
IPv6 uses 128-bit addresses written in hex. The book only scratches the surface; the IPv6 lesson in "Beyond the book" covers what v1.1 needs.`,
    cues: [
      ['First-octet ranges for classes A, B, C, D?', 'A 1–126, B 128–191, C 192–223, D 224–239.'],
      ['The three private ranges?', '10/8, 172.16/12, 192.168/16.'],
      ['Which TCP/IP layer is ARP in, and what does it resolve?', 'Internet layer; IP → MAC on the local link.'],
    ],
  },
  {
    id: 'ch8-routing', chapter: 8, title: 'Routed protocols, routing and the IP header', domain: 'ip', week: 2,
    body: `## Routed vs routing protocols
A **routed protocol** carries user data from network to network and has addresses a router can act on. IPv4 and IPv6 are routed protocols. A **routing protocol** is how routers tell each other which networks exist and how to reach them: RIP, OSPF, EIGRP, BGP. The routed protocol is the parcel; the routing protocol is the map.

## How a router decides
IP is connectionless and best-effort. Each packet is routed on its own, and nothing guarantees delivery; that is TCP's job. When a packet arrives, the router:
1. Checks the destination IP against its routing table and picks the most specific match.
2. Decrements the TTL. At 0 it drops the packet and sends an ICMP time-exceeded message.
3. Rebuilds the Layer 2 frame for the outgoing interface, with a new source MAC (its own) and the destination MAC of the next hop. The IP addresses stay the same end to end.

This path determination happens hop by hop. Every router decides only the next step.

## The IPv4 header
The fields to know:
- Version (4)
- Header length
- Type of Service (now DSCP, for QoS)
- Total length
- Identification, flags and fragment offset (for fragmentation)
- TTL
- Protocol (1 ICMP, 6 TCP, 17 UDP)
- Header checksum
- Source address and destination address
The basic header is 20 bytes.

## Subnetting: the book's method vs today
The book borrows host bits to create subnets and subtracts 2 from both the subnet count and the host count. **Only the host rule still applies.** Since IOS 12.0, \`ip subnet-zero\` is the default and the first and last subnets are usable. So n borrowed bits give 2^n subnets, and h host bits give 2^h − 2 hosts. If an old-style question insists on 2^n − 2 subnets, that is the reason. The Subnetting lesson that follows covers the fast block-size method.`,
    cues: [
      ['Routed vs routing protocol: give an example of each.', 'Routed: IPv4. Routing: OSPF.'],
      ['What changes in a packet at each router hop, and what stays the same?', 'New L2 header (MACs) and TTL − 1; source and destination IP stay the same.'],
      ['Subnets from borrowing 4 bits (modern rule)?', '2^4 = 16.'],
      ['IPv4 protocol numbers for ICMP, TCP, UDP?', '1, 6, 17.'],
    ],
  },
  {
    id: 'ch9-apps', chapter: 9, title: 'Application layer protocols', domain: 'svc', week: 2,
    body: `Above TCP and UDP sit the protocols users actually touch. For each one, know what it does, whether it rides on TCP or UDP, and its port.

- **DNS** (UDP 53, TCP 53 for zone transfers) turns names into IP addresses. It is a distributed hierarchy: root, top-level domains (.com), then the domain's own name servers.
- **HTTP** (TCP 80) and **HTTPS** (TCP 443) carry the web. HTTPS adds TLS encryption.
- **FTP** (TCP 21 control, 20 data) transfers files with a login. It is reliable but sends credentials in clear text.
- **TFTP** (UDP 69) is trivial FTP: no login, no directory listing, small and simple. Routers and switches use it for config and IOS transfers.
- **SMTP** (TCP 25) sends email between servers. POP3 (110) and IMAP (143) let clients retrieve it.
- **SNMP** (UDP 161, traps on 162) lets management stations monitor and configure devices.
- **Telnet** (TCP 23) is a remote terminal in clear text. SSH (TCP 22) replaces it.
- **DHCP** (UDP 67 server, 68 client) hands out addresses.

Why does a protocol pick UDP? Speed, low overhead, small request/response exchanges (DNS, DHCP, SNMP), or real-time data where retransmitting is pointless (voice, video). TCP is for anything that must arrive complete and in order: web pages, email, file transfers.

The drill **Drills → Port numbers** covers all of these.`,
    cues: [
      ['TCP or UDP, and which port: DNS, TFTP, SNMP, DHCP?', 'UDP 53 (TCP for zone transfers), UDP 69, UDP 161/162, UDP 67/68.'],
      ['FTP vs TFTP?', 'FTP: TCP 20/21, login, reliable. TFTP: UDP 69, no authentication.'],
      ['Why would an application choose UDP?', 'Low overhead, speed, small queries or real-time traffic.'],
    ],
  },
  {
    id: 'ch10-routers', chapter: 10, title: 'Inside a router', domain: 'ip', week: 6,
    body: `A router is a specialised computer. Know its parts and what each one holds, because questions love "where is X stored?"

- **CPU**: runs IOS and handles routing protocol work.
- **RAM**: the running-config, routing table, ARP cache and packet buffers. Volatile: wiped at power-off.
- **NVRAM**: the startup-config. It survives reboots.
- **Flash**: the IOS image (and other files). Also non-volatile.
- **ROM**: POST (power-on self-test), the bootstrap program and ROMmon for recovery.
- **Interfaces**: LAN ports (Ethernet), WAN ports, and management ports.

## Management ports
The **console** port gives out-of-band access with a rollover or USB cable, used for first-time setup or when the network is down. The **AUX** port was for a modem. Neither forwards traffic.

## LAN vs WAN
A LAN is owned and run by you, fast and local. A WAN connects sites across distance, usually over a provider's network, and its standards live at Layers 1 and 2. The book's WAN devices include the CSU/DSU (connects a router to a digital leased line) and modems. Its WAN technologies (ISDN, Frame Relay, dial-up) have been replaced by Ethernet WAN services, MPLS VPNs, broadband with VPNs, and SD-WAN, which v1.1 covers only conceptually.

Skim this chapter for router basics only. The Lab tab's routers behave like a 4331 with three Gigabit ports.`,
    cues: [
      ['Where do running-config, startup-config and IOS live?', 'RAM, NVRAM, flash.'],
      ['What is in ROM?', 'POST, bootstrap, ROMmon.'],
      ['What is the console port for?', 'Out-of-band CLI access (initial setup, recovery).'],
    ],
  },
  {
    id: 'ch11-cli', chapter: 11, title: 'The IOS command line', domain: 'ip', week: 3,
    body: `## Modes
- **User EXEC** (\`Router>\`): basic monitoring only.
- **Privileged EXEC** (\`Router#\`): every show and debug command, copy, reload. Reach it with \`enable\`; \`disable\` goes back.
- **Global configuration** (\`Router(config)#\`): reach it with \`configure terminal\`. Below it are sub-modes for interfaces (\`config-if\`), lines (\`config-line\`), routing protocols (\`config-router\`) and so on.
- \`exit\` goes up one level. \`end\` or Ctrl-Z jumps straight back to privileged EXEC.

## Help and shortcuts
- \`?\` lists the commands available in this mode. \`sh?\` lists commands starting with "sh". \`show ?\` lists what can follow "show".
- Commands can be abbreviated to any unique prefix: \`sh ip int br\`, \`conf t\`. Tab completes a word.
- Error messages:
  - \`% Ambiguous command\`: too few letters to identify one command.
  - \`% Incomplete command\`: required keywords are missing.
  - \`% Invalid input detected at '^' marker\`: the caret points at the mistake.

## Editing and history
Up arrow (Ctrl-P) recalls the previous command and down arrow (Ctrl-N) the next. Ctrl-A jumps to the start of the line, Ctrl-E to the end. \`show history\` lists recent commands. \`terminal history size\` changes how many are kept.

## Booting
1. POST tests the hardware (from ROM).
2. The bootstrap loads IOS, normally from flash (or TFTP, or ROMmon if nothing is found).
3. IOS loads the startup-config from NVRAM into RAM as the running-config.
4. If there is no startup-config, the router offers the setup dialog. Answer **no** and configure it from the CLI.

Skip the HyperTerminal and setup-mode pages. On sinstation, use \`screen /dev/ttyUSB0 9600\` (or minicom/PuTTY) with a USB console cable. In this app, every lab device has the same CLI. Try \`?\` everywhere.`,
    cues: [
      ['Prompts for user EXEC, privileged EXEC, global config, interface config?', 'R>  R#  R(config)#  R(config-if)#'],
      ['exit vs end?', 'exit = up one level; end/Ctrl-Z = straight to privileged EXEC.'],
      ['Ambiguous vs incomplete command?', 'Ambiguous: too few characters. Incomplete: missing keywords/arguments.'],
      ['Four boot steps?', 'POST, bootstrap, load IOS (flash), load startup-config (NVRAM).'],
    ],
  },
  {
    id: 'ch12-config', chapter: 12, title: 'Configuring a router', domain: 'ip', week: 5,
    body: `A minimal, secure base configuration:
\`\`\`
enable
configure terminal
hostname R1
enable secret Cl4ss!
line console 0
 password c0nsole
 login
line vty 0 4
 password v7y
 login
 transport input ssh
service password-encryption
banner motd #Authorized access only#
interface g0/0
 description Link to LAN A
 ip address 192.168.1.1 255.255.255.0
 no shutdown
end
copy running-config startup-config
\`\`\`

## Passwords
\`enable secret\` is stored hashed. \`enable password\` is plaintext, and if both exist the secret wins. Console and VTY passwords need \`login\` under the line, or they are never asked for. \`service password-encryption\` scrambles the plaintext passwords in the config (weak type 7); it only stops someone reading over your shoulder.

## Interfaces
Router interfaces start **administratively down**, so always finish with \`no shutdown\`. Add a \`description\` so the next person knows what the link is. The book also configures serial interfaces with \`clock rate\` on the DCE end; the exam no longer needs that.

## Verify and save
- \`show running-config\` shows what is active now (RAM). \`show startup-config\` shows what loads at boot (NVRAM).
- \`show interfaces\` gives per-interface detail. \`show ip interface brief\` gives one line each.
- \`copy running-config startup-config\` (or \`write memory\`) saves. Forgetting it means a reboot wipes your work.
- \`erase startup-config\` followed by \`reload\` returns the router to factory defaults.

Host tables (\`ip host NAME address\`) give local name resolution without DNS. In a lab, \`no ip domain-lookup\` stops a typo hanging the CLI while it tries to resolve a "hostname".

Skip password recovery (config register 0x2142). Then do **Lab 2** (switch basics) and **Lab 5** (router interfaces and routes) in the Lab tab.`,
    cues: [
      ['enable secret vs enable password?', 'Secret is hashed and takes precedence; password is plaintext.'],
      ['Why does a VTY password do nothing without "login"?', 'login tells the line to check the password.'],
      ['How do you make a router config survive a reboot?', 'copy running-config startup-config'],
      ['Default state of a router interface?', 'Administratively down.'],
    ],
  },
  {
    id: 'ch13-cdp', chapter: 13, title: 'CDP and reaching remote devices', domain: 'access', week: 5,
    body: `## Cisco Discovery Protocol
CDP is a Cisco Layer 2 protocol. Devices announce themselves to directly connected neighbours every 60 seconds, and a neighbour's entry expires after 180 seconds (holdtime) without an update. Because it runs at Layer 2, it works even before IP is configured, which makes it the best tool for mapping an undocumented network.

\`show cdp neighbors\` lists each neighbour's device ID, your local interface, holdtime, capability (R router, S switch…), platform, and the neighbour's port ID. \`show cdp neighbors detail\` (or \`show cdp entry *\`) adds the neighbour's IP address and IOS version.

Control it with:
- \`no cdp run\`: off globally
- \`no cdp enable\`: off on one interface (do this on Internet- or user-facing ports, since CDP leaks information)
- \`show cdp\`: timers
- \`show cdp interface\`: per-port status

LLDP (IEEE 802.1AB) is the vendor-neutral equivalent: \`lldp run\`, 30 s timer, 120 s holdtime.

## Connecting to remote devices
Once IP works, you can manage devices remotely. The book uses Telnet: \`telnet 10.0.0.2\`, or just type the IP. From a Telnet session, Ctrl-Shift-6 then x suspends it and returns you to the local router. \`show sessions\` lists open sessions, \`resume 1\` (or just Enter) returns to one, and \`disconnect\` closes it. \`show users\` shows who is logged in to this router.

The same workflow applies to SSH, which you should use instead because Telnet sends passwords in clear text. Verify basic reachability with \`ping\` and \`traceroute\` first.

In the Lab tab, \`show cdp neighbors\` works on every router and switch.`,
    cues: [
      ['CDP timer and holdtime?', '60 s / 180 s.'],
      ['What does "detail" add to show cdp neighbors?', 'Neighbour IP address and IOS version.'],
      ['Disable CDP globally vs per interface?', 'no cdp run / no cdp enable.'],
      ['How do you suspend a Telnet session?', 'Ctrl-Shift-6, then x.'],
    ],
  },
  {
    id: 'ch14-summary', chapter: 14, title: 'Chapter 14 at a glance (skip)', domain: 'ip', week: 6,
    body: `This chapter is about managing IOS images and the boot process. Your triage says **skip**. The concepts in brief:

- **Configuration register**: a 16-bit value that controls booting. 0x2102 is a normal boot that loads the startup-config. 0x2142 ignores NVRAM, which is how password recovery works. You can see it at the bottom of \`show version\`.
- **boot system** commands choose which IOS image to load (flash, TFTP, ROM).
- **IOS images** have names that encode platform, feature set and version. Upgrading means copying a new image to flash (\`copy tftp flash\`) and checking there is enough space with \`show flash\`.
- **Backups**: \`copy running-config tftp\` sends the config to a server. Today SCP or an automation tool is preferred.
- **ROMmon** is the minimal recovery environment used when IOS can't load.

Why skip: v1.1 only expects you to know where things are stored (Chapter 10) and to save and verify configs (Chapter 12).`,
    cues: [
      ['Normal config register value?', '0x2102'],
      ['Where do you see the config register?', 'At the bottom of show version.'],
    ],
  },
  {
    id: 'ch15-protocols', chapter: 15, title: 'Routing protocol families', domain: 'ip', week: 6,
    body: `Static routes are precise and predictable but don't adapt or scale. Dynamic routing protocols discover networks, pick best paths, and recover from failures on their own.

## IGP vs EGP
An autonomous system (AS) is a network under one administrative control. Interior Gateway Protocols route inside an AS: RIP, EIGRP, OSPF, IS-IS. Exterior Gateway Protocols route between ASes. BGP is the one in use, and it runs the Internet.

## Distance vector
Routers periodically send their whole routing table to their neighbours and believe what they hear ("routing by rumour"). Each router knows only a direction (vector) and a distance, not the full map. RIP uses hop count, with a maximum of 15. The weaknesses are slow convergence and routing loops (counting to infinity). The fixes are:
- maximum metric
- split horizon (don't advertise a route back where you learned it)
- route poisoning (advertise a dead route as unreachable)
- poison reverse
- hold-down timers
- triggered updates

## Link state
Every router floods LSAs describing its own links, builds an identical link-state database, and runs Dijkstra's SPF to compute its own best paths. Updates are sent only on change, convergence is fast, and the protocol scales with areas. OSPF is the one the CCNA tests.

## Metrics and AD
Each protocol has its own metric: RIP hops, OSPF cost (from bandwidth), EIGRP bandwidth and delay. Between protocols the router uses administrative distance: connected 0, static 1, eBGP 20, EIGRP 90, OSPF 110, RIP 120, iBGP 200.

Convergence is the point where every router agrees on the topology after a change. Until then traffic may be dropped or loop.

The book's IGRP no longer exists. EIGRP is its successor, and the exam only asks EIGRP basics such as its AD.`,
    cues: [
      ['IGP vs EGP, with examples?', 'IGP inside an AS (OSPF, EIGRP, RIP); EGP between ASes (BGP).'],
      ['Distance vector vs link state?', 'DV: share tables with neighbours, periodic. LS: flood LSAs, each router runs SPF.'],
      ['Name four DV loop-prevention mechanisms.', 'Split horizon, route poisoning, hold-down timers, max hop count (also poison reverse, triggered updates).'],
      ['What is convergence?', 'All routers agreeing on a consistent topology.'],
    ],
  },
  {
    id: 'ch16-table', chapter: 16, title: 'Examining the routing table', domain: 'ip', week: 6,
    body: `From this chapter, only the routing-table section matters. Learn to read every field of \`show ip route\`:

\`\`\`
Gateway of last resort is 10.0.12.2 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 10.0.12.2
C     10.0.12.0/30 is directly connected, GigabitEthernet0/0
L     10.0.12.1/32 is directly connected, GigabitEthernet0/0
O     192.168.3.0/24 [110/2] via 10.0.12.2, 00:04:11, GigabitEthernet0/0
R     172.16.0.0/16 [120/3] via 10.0.13.2, 00:00:21, GigabitEthernet0/1
\`\`\`

- **Code**: C connected, L local, S static, O OSPF, R RIP, D EIGRP. An asterisk marks a candidate default.
- **Prefix** /length: the destination network.
- **[AD/metric]**: [110/2] means administrative distance 110 (OSPF) and cost 2. [120/3] is RIP, 3 hops.
- **via**: the next-hop IP address.
- **Age** and **exit interface**.
- **Gateway of last resort**: the default route, used when nothing else matches.

## Choosing a route
1. Longest prefix match. The most specific route that contains the destination wins, whatever its AD.
2. For identical prefixes from different sources, the lowest AD wins and only that one is installed.
3. For identical prefixes from the same protocol, the lowest metric wins. Equal metrics are load-balanced.

**Example:** with 10.0.0.0/8 via R2, 10.1.0.0/16 via R3 and 10.1.1.0/24 via R4, a packet to 10.1.1.9 goes to R4, to 10.1.2.9 goes to R3, and to 10.9.9.9 goes to R2. A packet to 11.0.0.1 uses the default route, or is dropped if there is none.

Skip the RIP and IGRP configuration pages. Run \`show ip route\` in **Lab 5** and **Lab 6** to see real tables.`,
    cues: [
      ['What do the two numbers in [110/2] mean?', 'AD 110, metric (cost) 2.'],
      ['Order of route selection?', 'Longest prefix → lowest AD → lowest metric.'],
      ['C vs L codes?', 'C = connected subnet; L = the interface\'s own /32.'],
    ],
  },
  {
    id: 'ch17-icmp', chapter: 17, title: 'ICMP: error and control messages', domain: 'fund', week: 6,
    body: `IP is best-effort and has no way to report problems itself. ICMP (IP protocol 1) is its messenger. ICMP reports errors back to the original sender, but does not fix them or make IP reliable.

## Messages to know
- **Echo request (type 8) / echo reply (type 0)**: ping.
- **Destination unreachable (type 3)**: the code says why: network unreachable, host unreachable, protocol or port unreachable, administratively prohibited (an ACL), or fragmentation needed with DF set.
- **Time exceeded (type 11)**: TTL reached 0. Traceroute is built on it.
- **Redirect (type 5)**: "there's a better first hop on your subnet."
- **Parameter problem**: a bad header.
- Source quench used to ask senders to slow down. It is deprecated.

## Ping
On a Cisco device, ping sends five echoes by default:
- \`!\` = reply received
- \`.\` = timed out
- \`U\` = unreachable message received

A first \`.\` followed by \`!!!!\` is normal: the first packet was spent waiting for ARP. Extended ping (type \`ping\` with no address in privileged mode) lets you choose the source interface, size, count and other options. That's useful to test whether the far side has a route back to a particular LAN.

## Traceroute
Traceroute sends probes with TTL 1, 2, 3… Each router along the path drops the probe whose TTL expires there and sends back time exceeded, which reveals its address. \`* * *\` means no reply: a filter, a missing route back, or a device that doesn't send ICMP. Windows' \`tracert\` uses ICMP echo probes; Cisco and Linux \`traceroute\` use UDP probes by default.

Many firewalls block ICMP, so "ping fails" doesn't always mean "host down."`,
    cues: [
      ['ICMP types for echo request, echo reply, unreachable, time exceeded?', '8, 0, 3, 11.'],
      ['Why does the first ping often show "."?', 'ARP resolution delays the first packet.'],
      ['How does traceroute discover each hop?', 'Increasing TTLs; each hop returns time exceeded.'],
    ],
  },
  {
    id: 'ch18-troubleshoot', chapter: 18, title: 'Troubleshooting a router', domain: 'ip', week: 7,
    body: `Work bottom-up through the layers, and use show commands before you change anything.

## Reading interface status
\`show interfaces\` and \`show ip interface brief\` report two states: **status** (Layer 1) and **line protocol** (Layer 2).
- **up / up**: working.
- **down / down**: Layer 1. Unplugged or bad cable, or the far end is off or shut.
- **administratively down / down**: someone typed \`shutdown\`. Fix it with \`no shutdown\`.
- **up / down**: Layer 2. On serial links, an encapsulation mismatch, missing clock or failed keepalives. On Ethernet, rare (err-disabled or similar).

\`show interfaces\` also shows counters: input errors, CRC errors (often cabling or a duplex mismatch), collisions, and runts/giants.

## Step by step
1. **Physical**: lights, cables, \`show ip interface brief\`, \`show cdp neighbors\` (are the expected neighbours on the expected ports?).
2. **Data link**: interface up/up, duplex and speed match, the right VLAN.
3. **Network**: correct IP and mask (\`show ip interface brief\`, \`show running-config\`), routes in both directions (\`show ip route\`), the right default gateway on hosts. \`ping\` hop by hop, and \`traceroute\` to see where the path stops.
4. **Higher layers**: ACLs blocking traffic (\`show access-lists\` hit counters), services.

## debug
\`debug ip packet\`, \`debug ip routing\` and similar show events live. They can use a lot of CPU on a busy router, so use them briefly and turn them off with \`undebug all\` (or \`no debug all\`). Use \`terminal monitor\` to see debug output over SSH or Telnet.

## Classic faults
- Wrong subnet mask on one end.
- A missing return route.
- A host with no or the wrong default gateway.
- An interface left shut.
- Duplicate IP addresses.
- An ACL implicit deny.

Every lab in the Lab tab can be broken on purpose. Shut an interface or delete a route, then troubleshoot it with these commands.`,
    cues: [
      ['What does "up/down" indicate?', 'Layer 2 problem (status up, line protocol down).'],
      ['What does "administratively down" indicate, and how do you fix it?', 'The interface was shut down; no shutdown.'],
      ['How do you stop all debugging?', 'undebug all'],
      ['Ping works one way only. Suspect?', 'A missing return route (or an ACL).'],
    ],
  },
  {
    id: 'ch19-tcp-arp', chapter: 19, title: 'TCP in depth and ARP', domain: 'fund', week: 2,
    body: `## The TCP header
- Source port and destination port
- Sequence number: the byte number of the first data byte
- Acknowledgement number: the next byte expected
- Header length
- Flags: URG, ACK, PSH, RST, SYN, FIN
- Window size
- Checksum and urgent pointer
The basic header is 20 bytes. UDP's whole header is 8 bytes: ports, length, checksum.

## Reliability
TCP numbers bytes, not segments. If a receiver has bytes 1–1000, it acknowledges 1001, meaning "send byte 1001 next." Acknowledgements are cumulative. If an ACK doesn't arrive before the retransmission timer expires, the sender resends. The receiver uses sequence numbers to put segments back in order and drop duplicates.

## Windowing
The window is how many bytes may be sent before stopping to wait for an ACK. Bigger windows mean better throughput on long links. The receiver advertises its window in every segment. A window of 0 means "stop, my buffer is full." TCP also shrinks its own sending rate when it detects loss (congestion control).

## Opening and closing
To open: SYN (with the client's initial sequence number), SYN-ACK (the server's ISN plus an ACK), ACK. To close gracefully, each side sends FIN and the other ACKs it, four segments in total. RST aborts a connection immediately.

A **SYN flood** sends many SYNs from spoofed addresses and never completes the handshake. The server's table of half-open connections fills up, so legitimate users are refused. It is a classic DoS attack.

## ARP in detail
To send to an IP on its own subnet, a host needs that host's MAC. It checks its ARP cache. If the entry is missing, it broadcasts an ARP request. The owner replies by unicast, and both cache the mapping.

For a destination on another subnet, the host ARPs for its **default gateway's** MAC instead and sends the frame there. The destination IP in the packet stays the remote host's.

Proxy ARP is a router answering ARP for remote hosts. It can rescue hosts with a wrong mask or no gateway, but it is usually disabled now. Gratuitous ARP is a host announcing its own mapping, used to detect duplicate IPs and by FHRPs after a failover. ARP poisoning abuses it, and Dynamic ARP Inspection stops it.

See the ARP and MAC tables in the Lab tab with \`arp -a\` on a PC and \`show arp\` on a router.`,
    cues: [
      ['What does ACK 1001 mean?', 'Bytes up to 1000 received; send 1001 next.'],
      ['What does a window size of 0 mean?', 'Stop sending: the receiver\'s buffer is full.'],
      ['Whose MAC does a host ARP for when the destination is remote?', 'Its default gateway\'s.'],
      ['How does a SYN flood work?', 'Many SYNs and no final ACK, so half-open connections exhaust the server.'],
    ],
  },
];
