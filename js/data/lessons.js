// Reading lessons. Markdown-lite: "## " headings, "- " bullets, ``` code,
// `inline code`, **bold**. Every glossary term found in the text is tappable.
// cues: Cornell-style cue questions with answers for self-quiz mode.

export const LESSONS = [
  {
    id: 'layers', title: 'Layers and encapsulation', domain: 'fund', week: 1, book: 'Ch 2',
    body: `Every network conversation is easier to reason about when you split it into layers. The **OSI model** has seven: Physical, Data Link, Network, Transport, Session, Presentation and Application. The **TCP/IP model** the Internet actually runs on folds the top three into one Application layer, giving Link, Internet, Transport and Application.

## Encapsulation
When an application sends data, each layer adds its own header on the way down. That process is **encapsulation**. The Transport layer turns data into a segment, using TCP or UDP and port numbers. The Network layer wraps the segment in a packet with source and destination IPv4 addresses. The Data Link layer wraps the packet in a frame with source and destination MAC addresses and an FCS trailer. The Physical layer sends it as bits.

On the receiving side, each layer strips its header and hands the rest up. That is de-encapsulation. The name for the chunk of data at each layer is its PDU.

## Who works at which layer
- A hub repeats bits (Layer 1).
- A switch forwards frames using MAC addresses (Layer 2).
- A router forwards packets using IP addresses and a routing table (Layer 3).
- A firewall filters traffic, and modern ones look all the way up to Layer 7.

A useful troubleshooting habit is to work bottom-up. Is the link up (L1)? Is the MAC learned and the VLAN right (L2)? Is the IP, mask and default gateway right (L3)? Is the port open (L4)?`,
    cues: [
      ['Name the OSI layers from 1 to 7.', 'Physical, Data Link, Network, Transport, Session, Presentation, Application.'],
      ['What are the PDUs at L4, L3, L2 and L1?', 'Segment (or datagram), packet, frame, bits.'],
      ['Which header holds MAC addresses and which holds IP addresses?', 'The L2 frame header holds MACs. The L3 packet header holds IPs.'],
      ['Which device separates broadcast domains?', 'A router (or each VLAN, with a router between them).'],
    ],
  },
  {
    id: 'ethernet', title: 'Ethernet and how switches learn', domain: 'access', week: 1, book: 'Ch 5, 6',
    body: `Ethernet is the LAN technology almost everything runs on. An Ethernet frame carries a destination MAC address, a source MAC address, an EtherType saying what is inside (0x0800 means IPv4), the payload, and a 4-byte FCS so the receiver can detect corruption.

A MAC address is 48 bits written in hex, for example \`0050.56ab.cdef\`. The first half is the OUI, which identifies the vendor.

## Learning, forwarding, flooding
A switch keeps a MAC address table. Every time a frame arrives, the switch records the source MAC against the port it came in on. That is learning. Then it looks up the destination MAC:
- Known destination: forward out that one port.
- Unknown unicast or broadcast: flooding, out every port in the VLAN except the one it came in on.

That is why the first ping on a new LAN still works. The ARP request is a broadcast and gets flooded. The reply is unicast, and by then the switch has learned where the sender lives.

## Duplex and domains
Old hubs put everyone in one collision domain running half duplex with CSMA/CD. Every switch port is its own collision domain, and modern links run full duplex with no collisions at all. A duplex mismatch (one side full, the other half) shows up as late collisions and a crawling link. Autonegotiation usually prevents it.

All ports in the same VLAN still form one broadcast domain. Routers stop broadcasts.

Copper UTP runs up to 100 m. Fiber goes further. Multimode fiber is cheaper and covers shorter runs; single-mode fiber with a laser covers kilometres. Auto-MDIX means you rarely worry about straight-through cable vs crossover cable any more.`,
    cues: [
      ['What does a switch learn from, the source or the destination MAC?', 'The source MAC, mapped to the ingress port.'],
      ['When does a switch flood a frame?', 'Broadcasts, and unknown unicast (destination not in the MAC table).'],
      ['Symptoms of a duplex mismatch?', 'Slow throughput, late collisions and CRC errors on the half-duplex side.'],
      ['Max length of a UTP Ethernet run?', '100 metres.'],
    ],
  },
  {
    id: 'ipv4', title: 'IPv4 addresses and binary', domain: 'fund', week: 1, book: 'Ch 1, 7',
    body: `An IPv4 address is 32 bits written as four octets in dotted decimal, such as 192.168.10.37. A subnet mask marks which bits are the network and which are the host. 255.255.255.0 is 24 ones, so in prefix length notation it is /24.

## Binary you must know cold
Each octet is eight bits worth 128, 64, 32, 16, 8, 4, 2 and 1. The mask values come from adding the high bits in order: 128, 192, 224, 240, 248, 252, 254, 255. Learn that row and most subnetting turns into simple arithmetic.

## Special ranges
- Private address ranges (RFC 1918): 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16. They need NAT to reach the Internet.
- 127.0.0.0/8 is the loopback address range for testing your own stack.
- 169.254.0.0/16 is APIPA. If a PC shows one, DHCP failed.
- 224.0.0.0/4 is multicast.

The old address classes (class A, class B, class C) still show up in questions, but real networks use CIDR, where any prefix length is allowed.

## ARP and the default gateway
To send to a host on the same subnet, a PC uses ARP to find that host's MAC address. To reach anything off-subnet, it sends the frame to its default gateway's MAC instead, and the router takes it from there. A wrong gateway is a classic fault: local pings work, remote pings fail.

The TTL field in the IPv4 header is decremented by every router. At zero the packet is dropped and an ICMP time-exceeded message goes back to the sender. Traceroute is built on exactly that.`,
    cues: [
      ['List the eight possible mask octet values.', '128, 192, 224, 240, 248, 252, 254, 255 (and 0).'],
      ['What are the three RFC 1918 private ranges?', '10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.'],
      ['A PC has 169.254.x.x. What does that tell you?', 'APIPA: it did not get a DHCP lease.'],
      ['Local pings work, remote pings fail. First suspect?', 'The default gateway setting (or the gateway router itself).'],
    ],
  },
  {
    id: 'subnetting', title: 'Subnetting with the block size', domain: 'fund', week: 2, book: 'Ch 8',
    body: `Subnetting borrows host bits to cut one network into several smaller ones. Each borrowed bit doubles the number of subnets and halves the hosts in each. With h host bits you get 2^h − 2 usable hosts, because the network address (all host bits 0) and the broadcast address (all host bits 1) are reserved.

## The block-size method
1. Find the interesting octet: the one where the mask is not 255 or 0.
2. Block size = 256 − the mask value in that octet. This is the magic number.
3. Subnets start at multiples of the block size.
4. The network address is the multiple at or below the host's value. The broadcast address is one less than the next multiple.

**Example:** 172.16.45.200/27. The mask is 255.255.255.224, so the interesting octet is the 4th and the block size is 256 − 224 = 32. Multiples of 32 are 0, 32 … 192, 224. 200 falls in the 192 block, so:
- network 172.16.45.192
- first usable host .193
- last usable host .222
- broadcast .223
- 30 usable hosts

**Example 2:** 10.20.77.9/20. The mask is 255.255.240.0, so the interesting octet is the 3rd and the block is 16. 77 falls in the 64 block (64, 80…). The network is 10.20.64.0 and the broadcast is 10.20.79.255.

## VLSM
With VLSM you size each subnet to fit. Allocate the biggest first so the blocks line up. A point-to-point link only needs a /30 (2 hosts), or a /31.

A wildcard mask is the mask flipped: 255.255.255.255 minus the mask. A /27 has wildcard 0.0.0.31. You will use it in ACLs and OSPF network statements.

Drill this until each problem takes you under 30 seconds. The Subnet tab is there for that.`,
    cues: [
      ['Block size for /26? /28? /21?', '64 (4th octet), 16 (4th octet), 8 (3rd octet).'],
      ['Usable hosts in a /27?', '30.'],
      ['Network and broadcast for 192.168.5.77/26?', 'Network 192.168.5.64, broadcast 192.168.5.127.'],
      ['Wildcard for 255.255.255.240?', '0.0.0.15.'],
    ],
  },
  {
    id: 'transport', title: 'TCP, UDP and ports', domain: 'fund', week: 2, book: 'Ch 9, 19',
    body: `The Transport layer moves data between applications, and port numbers identify which application. A socket is an IP address plus a port, and a connection is the pair of sockets at each end.

## TCP
TCP is connection-oriented and reliable. It opens with the three-way handshake (SYN, SYN-ACK, ACK), numbers every byte with sequence numbers, acknowledges what arrived, and retransmits what didn't. Windowing provides flow control: the receiver advertises how much it can accept before the sender must wait for an acknowledgement. The window grows when things go well and shrinks after loss.

## UDP
UDP is connectionless. It has an 8-byte header, no handshake and no retransmission. That makes it right for real-time voice and video, where a late packet is useless anyway, and for quick request/response protocols.

## Ports worth memorising
- TCP: FTP 20/21, SSH 22, Telnet 23, SMTP 25, HTTP 80, POP3 110, IMAP 143, HTTPS 443, BGP 179
- UDP: DHCP 67/68, TFTP 69, NTP 123, SNMP 161/162, syslog 514
- Both: DNS 53

Well-known ports are 0–1023. A client picks a random ephemeral port (49152–65535 by IANA's definition) as its source port.

ICMP is neither TCP nor UDP. It is IP protocol 1, while TCP is 6 and UDP is 17. Ping uses ICMP echo request and reply.`,
    cues: [
      ['The three steps of the TCP handshake?', 'SYN → SYN-ACK → ACK.'],
      ['What does windowing provide?', 'Flow control: how much data can be in flight before an ACK.'],
      ['Ports: SSH, Telnet, DNS, DHCP server, NTP, SNMP, syslog?', '22, 23, 53, 67, 123, 161 (traps 162), 514.'],
      ['IP protocol numbers for ICMP, TCP, UDP?', '1, 6, 17.'],
    ],
  },
  {
    id: 'vlans', title: 'VLANs and trunks', domain: 'access', week: 3, book: '—',
    body: `A VLAN splits one physical switch into several logical ones. Each VLAN is its own broadcast domain, so hosts in VLAN 10 never see broadcasts from VLAN 20, and they need a router to talk to each other. VLANs give you security boundaries, smaller broadcast domains and grouping by function rather than by floor.

## Access ports
An access port belongs to exactly one VLAN and sends frames untagged:
\`\`\`
vlan 10
 name SALES
interface fa0/1
 switchport mode access
 switchport access vlan 10
\`\`\`
If the VLAN doesn't exist yet, \`switchport access vlan\` creates it. A voice VLAN lets an IP phone tag its traffic separately while the PC behind it stays in the access VLAN.

## Trunks
A trunk carries many VLANs over one link. 802.1Q inserts a 4-byte tag with the VLAN ID into each frame. Frames in the native VLAN (VLAN 1 by default) cross untagged, so the native VLAN must match on both ends. Changing it to an unused VLAN is a common hardening step. The allowed VLAN list restricts which VLANs a trunk carries.
\`\`\`
interface g0/1
 switchport mode trunk
 switchport trunk native vlan 99
 switchport trunk allowed vlan 10,20,99
\`\`\`
DTP can negotiate trunks automatically, but two ports left on dynamic auto stay access. Best practice is to hard-set the mode and turn DTP off with \`switchport nonegotiate\`. VTP can sync VLAN databases between switches, but a switch with a higher revision number can wipe your VLANs, so many networks run VTP transparent.

Verify with \`show vlan brief\` (access ports per VLAN) and \`show interfaces trunk\`. Trunk ports don't appear in \`show vlan brief\`.`,
    cues: [
      ['How big is the 802.1Q tag and what does it carry?', '4 bytes; it carries the 12-bit VLAN ID (plus priority bits).'],
      ['What crosses a trunk untagged?', 'Native VLAN frames (VLAN 1 by default).'],
      ['dynamic auto on both ends: trunk or access?', 'Access. Neither side initiates.'],
      ['Which command shows which VLANs a trunk carries?', 'show interfaces trunk'],
    ],
  },
  {
    id: 'intervlan', title: 'Routing between VLANs', domain: 'access', week: 4, book: '—',
    body: `Hosts in different VLANs are in different subnets, so getting between them takes inter-VLAN routing. There are three ways to do it.

## One router port per VLAN
Simple, but it burns a router interface and a switch port for every VLAN. It doesn't scale.

## Router-on-a-stick
One router interface connects to a switch trunk. On the router you create a subinterface per VLAN, tag it with the VLAN, and give it that VLAN's gateway address:
\`\`\`
interface g0/0
 no shutdown
interface g0/0.10
 encapsulation dot1Q 10
 ip address 10.0.10.1 255.255.255.0
interface g0/0.20
 encapsulation dot1Q 20
 ip address 10.0.20.1 255.255.255.0
\`\`\`
The physical interface must be up. The subinterfaces inherit that state. Traffic between VLANs goes up and back down the same link (hence "on a stick"), so the link can become a bottleneck.

## Layer 3 switch with SVIs
A Layer 3 switch routes in hardware. Turn on \`ip routing\` and create an SVI (\`interface vlan 10\`) with the gateway IP for each VLAN. An SVI is only up/up if its VLAN exists and at least one port in that VLAN (access or trunk) is up. Even a plain Layer 2 switch usually has one SVI for management, plus \`ip default-gateway\` so it can be reached from other subnets.

Whichever method you use, every host's default gateway must be the router address in its own VLAN. Try it in Sim lab 4.`,
    cues: [
      ['What command tags a subinterface for VLAN 20?', 'encapsulation dot1Q 20'],
      ['Two conditions for an SVI to be up/up?', 'Its VLAN exists, and at least one port carrying that VLAN is up (and the SVI is not shut down).'],
      ['What global command makes a multilayer switch route?', 'ip routing'],
      ['A Layer 2 switch needs what to be managed from another subnet?', 'A management SVI with an IP, plus ip default-gateway.'],
    ],
  },
  {
    id: 'stp', title: 'Spanning Tree', domain: 'access', week: 4, book: 'Ch 6',
    body: `Redundant links between switches are good until they form a loop. Ethernet frames have no TTL, so a broadcast caught in a loop circulates forever and multiplies. That is a broadcast storm, and it can take a network down in seconds. STP (802.1D) prevents it by logically blocking just enough ports to leave a loop-free tree.

## The election
1. Elect the root bridge: lowest bridge ID wins. The BID is priority (default 32768, set in steps of 4096) plus the VLAN number plus the MAC. With equal priorities, the oldest switch (lowest MAC) often wins, which is why you should set the root deliberately: \`spanning-tree vlan 10 root primary\`.
2. Every other switch picks one root port: the port with the lowest root path cost. Port cost depends on speed: 100 Mb = 19, 1 Gb = 4, 10 Gb = 2. Ties go to the lowest neighbour BID, then the lowest neighbour port ID.
3. Each segment gets one designated port, the one closest to the root. Every port on the root bridge is designated.
4. Everything left over goes blocking.

BPDUs carry this information every 2 seconds. Classic 802.1D moves a port through blocking, listening, learning and forwarding, which takes about 30 seconds.

## Faster and safer
RSTP (802.1w) converges in a second or two, and renames blocking to discarding, with alternate and backup port roles. Cisco runs a separate tree per VLAN with PVST+ or Rapid PVST+, so each VLAN can use a different root for load sharing.

On host-facing ports, PortFast skips straight to forwarding. Pair it with BPDU Guard, which err-disables the port if a switch is plugged in. Root Guard stops a port from ever becoming a root port.`,
    cues: [
      ['How is the root bridge elected?', 'Lowest bridge ID: priority first, then MAC.'],
      ['STP short-method costs for 100 Mb, 1 Gb, 10 Gb?', '19, 4, 2.'],
      ['Which ports on the root bridge are designated?', 'All of them.'],
      ['What does BPDU Guard do on a PortFast port?', 'Err-disables the port if a BPDU arrives.'],
    ],
  },
  {
    id: 'etherchannel', title: 'EtherChannel, CDP and LLDP', domain: 'access', week: 5, book: 'Ch 13',
    body: `If two switches are joined by four links, STP blocks three of them. EtherChannel bundles them into one logical Port-channel, so STP sees a single link and traffic is load-balanced across all four. Member ports must match on speed, duplex, access/trunk mode and VLANs, or the bundle won't form.

## Negotiation
- LACP (open, 802.3ad): \`channel-group 1 mode active\` or \`passive\`. Active + active or active + passive forms a bundle. Passive + passive does not.
- PAgP (Cisco): \`desirable\` or \`auto\`. Desirable + desirable or desirable + auto forms a bundle. Auto + auto does not.
- \`mode on\` forces a static bundle with no negotiation. It only works with \`on\` at the other end too.

\`show etherchannel summary\` should show the bundle as SU (Layer 2, in use) and each member as P (bundled).

## Discovering neighbours
CDP is Cisco's Layer 2 discovery protocol. It is on by default and sends every 60 seconds with a 180-second holdtime. \`show cdp neighbors\` lists each neighbour's device ID, your local interface, its platform and its port ID. \`show cdp neighbors detail\` adds its IP address and IOS version. It is the first thing to run when you inherit an undocumented network.

LLDP is the vendor-neutral equivalent (802.1AB). On Cisco it is off until you enter \`lldp run\`. Its timers are 30 seconds and 120 seconds. Both protocols leak information, so it is common to disable them on edge ports facing users or the Internet.

In the simulator, \`show cdp neighbors\` works on routers and switches.`,
    cues: [
      ['LACP mode pairs that form a bundle?', 'active/active, active/passive.'],
      ['PAgP auto + auto?', 'No bundle. At least one side must be desirable.'],
      ['CDP timer and holdtime?', '60 s and 180 s.'],
      ['How do you enable LLDP globally?', 'lldp run'],
    ],
  },
  {
    id: 'routing', title: 'The routing table and static routes', domain: 'ip', week: 6, book: 'Ch 15, 16',
    body: `A router forwards each packet by looking up its destination in the routing table. Three ideas decide which route wins.

## 1. Longest prefix match
If 10.1.1.0/24 and 10.0.0.0/8 both match a destination, the /24 wins. Longest prefix match beats everything else, including administrative distance.

## 2. Administrative distance
When different sources offer the same prefix, the lowest administrative distance wins: connected 0, static 1, eBGP 20, EIGRP 90, OSPF 110, RIP 120.

## 3. Metric
When one routing protocol knows several paths to the same prefix, the lowest metric wins: OSPF cost, RIP hop count. Equal metrics give ECMP load balancing.

## Reading show ip route
\`C\` is a connected route for an up/up interface's subnet. \`L\` is the local /32 for the interface's own address. \`S\` is a static route, \`O\` is OSPF. The numbers in brackets are [AD/metric].

## Static routes
\`\`\`
ip route 192.168.2.0 255.255.255.0 10.0.12.2
ip route 192.168.2.0 255.255.255.0 g0/0
ip route 0.0.0.0 0.0.0.0 10.0.12.1
ip route 192.168.2.0 255.255.255.0 10.0.13.2 130
\`\`\`
1. Route via a next-hop IP.
2. Route via an exit interface. Fine on point-to-point links.
3. A default route. It shows as \`S*\` and sets the gateway of last resort.
4. A floating static route. Its AD of 130 keeps it out of the table until the primary route, here learned by OSPF with AD 110, disappears.

Remember routing is hop by hop. Every router on the path needs a route to the destination, and every router on the way back needs a route to the source. "Ping works one way" almost always means a return route is missing.`,
    cues: [
      ['Which beats which: longest prefix or AD?', 'Longest prefix match always wins first; AD only compares identical prefixes.'],
      ['ADs: connected, static, EIGRP, OSPF, RIP?', '0, 1, 90, 110, 120.'],
      ['How do you make a floating static route?', 'Give it a higher AD than the primary route, e.g. 130 vs OSPF 110.'],
      ['What does S* mean in show ip route?', 'A static default route (candidate default).'],
    ],
  },
  {
    id: 'ospf', title: 'OSPF', domain: 'ip', week: 7, book: '—',
    body: `OSPF is the link-state routing protocol the CCNA cares most about. Every router floods LSAs describing its links. Every router in an area ends up with the same LSDB, then runs SPF (Dijkstra) to compute its own best paths. Routes show as \`O\` with administrative distance 110.

## Enabling it
\`\`\`
router ospf 1
 router-id 1.1.1.1
 network 10.0.0.0 0.255.255.255 area 0
 network 192.168.1.0 0.0.0.255 area 0
 passive-interface g0/2
\`\`\`
A network statement uses a wildcard mask and turns OSPF on for every interface whose IP matches. You can also enable it per interface with \`ip ospf 1 area 0\`. A passive interface still advertises its subnet but sends no hellos. Use it on LAN-facing ports and loopbacks.

The router ID comes from the \`router-id\` command first, then the highest loopback IP, then the highest active interface IP. It must be unique.

## Neighbours
Hellos go to 224.0.0.5 every 10 seconds, with a 40-second dead timer on Ethernet. To become OSPF neighbors, two routers must match on area, subnet and mask, hello/dead timers, authentication and stub flags. MTU must also match for the adjacency to reach Full. The neighbour states run Down, Init, 2-Way, ExStart, Exchange, Loading, Full.

On Ethernet, OSPF elects a DR and BDR to cut flooding. Highest OSPF priority wins (default 1, 0 means never), then highest router ID. The election is non-preemptive. Other routers (DROTHERs) go Full with the DR and BDR and stay 2-Way with each other. Point-to-point network types skip the election.

## Cost
OSPF cost = reference bandwidth ÷ interface bandwidth. The default reference is 100 Mbps, so FastEthernet and GigabitEthernet both cost 1. Raise it on every router with \`auto-cost reference-bandwidth 10000\`, or set \`ip ospf cost\` per interface.

Multi-area designs need area 0 as the backbone, with ABRs connecting the other areas. The CCNA focuses on single-area.`,
    cues: [
      ['Order of router ID selection?', 'router-id command → highest loopback IP → highest active interface IP.'],
      ['Five things that must match for OSPF neighbors?', 'Area, subnet/mask, hello/dead timers, authentication, stub flags (MTU for Full). Router IDs must differ.'],
      ['What does a passive interface do?', 'Advertises its network but sends no hellos, so no adjacencies form.'],
      ['Default OSPF cost of a GigabitEthernet link and why?', '1, because 100 Mbps ÷ 1000 Mbps rounds up to the minimum of 1.'],
    ],
  },
  {
    id: 'ipv6', title: 'IPv6 essentials', domain: 'ip', week: 7, book: '—',
    body: `IPv6 addresses are 128 bits written as eight hextets of four hex digits. Two IPv6 abbreviation rules shorten them: drop leading zeros in each hextet, and replace one run of all-zero hextets with a double colon. So 2001:0db8:0000:0000:0000:0000:0000:0001 becomes 2001:db8::1. You can only use the double colon once, or the address would be ambiguous.

## Address types
- Global unicast (2000::/3) is publicly routable. A typical split is a /48 from the provider, 16 bits of subnet ID, and a 64-bit interface ID.
- Unique local (FC00::/7, FD in practice) is the private range.
- Link-local (FE80::/10) is created automatically on every IPv6 interface. It never leaves the link, and routing protocols use it as the next hop.
- Multicast is FF00::/8. FF02::1 is all nodes, FF02::2 is all routers. IPv6 has no broadcast.
- Anycast is one address on several devices; packets reach the nearest.

## Getting an address
An interface ID can be configured manually, randomised, or built with EUI-64: split the MAC in half, insert FFFE, and flip the 7th bit. With SLAAC, a host learns the /64 prefix from a router advertisement and builds the rest itself, no DHCP needed. NDP (part of ICMPv6) replaces ARP. Neighbor solicitations go to a solicited-node multicast address rather than a broadcast, and DAD checks that nobody else already has the address.

## On a router
\`\`\`
ipv6 unicast-routing
interface g0/0
 ipv6 address 2001:db8:1:1::1/64
 ipv6 address fe80::1 link-local
ipv6 route ::/0 2001:db8:0:12::2
\`\`\`
Without \`ipv6 unicast-routing\` the router won't forward IPv6 or send RAs.`,
    cues: [
      ['Abbreviate 2001:0db8:0000:0010:0000:0000:0000:0001.', '2001:db8:0:10::1'],
      ['Link-local prefix?', 'FE80::/10'],
      ['Steps of EUI-64?', 'Split the MAC in half, insert FFFE, flip the 7th bit.'],
      ['What replaces ARP in IPv6?', 'NDP neighbor solicitation/advertisement (ICMPv6), using solicited-node multicast.'],
    ],
  },
  {
    id: 'fhrp', title: 'First hop redundancy', domain: 'ip', week: 8, book: '—',
    body: `A host has exactly one default gateway. If that router dies, the host is cut off even when a second router sits right next to it. An FHRP fixes this: two or more routers share a virtual IP and virtual MAC, and the hosts use that virtual IP as their gateway. Whichever router is active answers for it.

## HSRP
HSRP is Cisco's. One router is active and one standby. Highest priority becomes active (default 100), with the highest interface IP breaking ties. Preemption is off by default, so a recovered router with a higher priority won't take back the active role unless you configure \`standby 1 preempt\`.
\`\`\`
interface g0/1
 standby version 2
 standby 1 ip 10.0.0.1
 standby 1 priority 110
 standby 1 preempt
\`\`\`
HSRPv1 virtual MACs look like 0000.0c07.acXX, where XX is the group in hex. Version 2 uses 0000.0c9f.fXXX.

## VRRP and GLBP
VRRP is the open standard: master and backup, preemption on by default, virtual MAC 0000.5e00.01XX. GLBP is Cisco's load-balancing option. One AVG hands out different virtual MACs so every router forwards traffic at once.

When a failover happens, the new active router sends gratuitous ARP so switches update their MAC address tables. The hosts never notice.`,
    cues: [
      ['Default HSRP priority? Is preempt on by default?', '100. No, preempt is off by default.'],
      ['Which FHRP is an open standard?', 'VRRP.'],
      ['Which FHRP load-balances with multiple virtual MACs?', 'GLBP.'],
      ['HSRPv1 virtual MAC format?', '0000.0c07.acXX (XX = group number in hex).'],
    ],
  },
  {
    id: 'acls', title: 'Access control lists', domain: 'sec', week: 8, book: 'Ch 20',
    body: `An ACL is an ordered list of permit and deny entries. The router checks a packet against each line from the top and acts on the **first match**. If nothing matches, the implicit deny at the end drops the packet. An ACL containing only deny lines therefore blocks everything.

## Types
- A standard ACL (1–99, 1300–1999) matches source address only. Place it close to the destination so it doesn't block that source from everything else.
- An extended ACL (100–199, 2000–2699) matches protocol, source, destination and ports. Place it close to the source so unwanted traffic dies early.
- A named ACL (\`ip access-list extended NAME\`) can be either type, and lets you insert or remove lines by sequence number.

## Wildcard masks
ACLs match addresses with a wildcard mask: 0 bits must match, 1 bits don't matter. \`host 10.1.1.5\` is the same as 10.1.1.5 0.0.0.0. \`any\` is 0.0.0.0 255.255.255.255. 192.168.1.0 0.0.0.255 matches the whole /24.

\`\`\`
access-list 10 deny host 192.168.1.10
access-list 10 permit any
interface g0/1
 ip access-group 10 out

ip access-list extended NO-PING-SRV
 deny icmp 192.168.1.0 0.0.0.255 host 192.168.2.100 echo
 permit ip any any
interface g0/0
 ip access-group NO-PING-SRV in
\`\`\`
You can apply one ACL per interface, per direction, per protocol. Inbound filters before the routing decision; outbound filters after. \`show access-lists\` shows the hit counter on every line, which is the fastest way to see which line is catching traffic.

Labs 7 and 8 in the simulator cover both types.`,
    cues: [
      ['Where do you place standard vs extended ACLs?', 'Standard near the destination; extended near the source.'],
      ['What is at the end of every ACL?', 'An implicit deny any.'],
      ['Wildcard for a /26 network?', '0.0.0.63'],
      ['How many ACLs per interface?', 'One per direction per protocol (one IPv4 in, one IPv4 out).'],
    ],
  },
  {
    id: 'natdhcp', title: 'NAT and DHCP', domain: 'svc', week: 9, book: '—',
    body: `## NAT
Private addresses can't be routed on the Internet, so the edge router rewrites them using NAT. Interfaces are marked \`ip nat inside\` or \`ip nat outside\`. The vocabulary trips people up. Inside local is the host's real private IP. Inside global is the public IP it appears as. Outside local and outside global describe the remote host, and they are usually the same.

- Static NAT maps one inside address to one public address permanently, so outside users can reach a server.
- Dynamic NAT maps inside hosts to a pool of public addresses on a first-come basis. When the pool runs out, new hosts fail.
- PAT (NAT overload) lets many hosts share a single public IP, told apart by source port. This is what every home router does.
\`\`\`
access-list 1 permit 192.168.1.0 0.0.0.255
ip nat inside source list 1 interface g0/1 overload
\`\`\`
\`show ip nat translations\` lists the active mappings.

## DHCP
DHCP hands hosts an IP, mask, default gateway and DNS servers. The exchange is DORA: Discover (broadcast), Offer, Request, Ack. The server listens on UDP 67 and the client on UDP 68.
\`\`\`
ip dhcp excluded-address 192.168.1.1 192.168.1.10
ip dhcp pool LAN
 network 192.168.1.0 255.255.255.0
 default-router 192.168.1.1
 dns-server 8.8.8.8
\`\`\`
Routers don't forward broadcasts. If the server sits on another subnet, configure DHCP relay on the client-facing interface with \`ip helper-address <server>\`, and the router forwards the requests as unicast.`,
    cues: [
      ['Define inside local and inside global.', 'Inside local = real private IP of the inside host; inside global = the public address it is translated to.'],
      ['Which NAT type lets many hosts share one IP?', 'PAT / NAT overload (distinguished by port).'],
      ['DORA stands for?', 'Discover, Offer, Request, Acknowledge.'],
      ['How do clients reach a DHCP server on another subnet?', 'ip helper-address on the router interface facing the clients (DHCP relay).'],
    ],
  },
  {
    id: 'mgmt', title: 'DNS, NTP, SNMP, syslog and SSH', domain: 'svc', week: 9, book: 'Ch 12',
    body: `## DNS
DNS turns names into addresses. Queries normally use UDP 53. An A record maps a name to IPv4, AAAA to IPv6, CNAME is an alias, MX is mail and PTR is a reverse lookup. On a lab router, \`no ip domain-lookup\` stops a mistyped command being treated as a hostname to resolve.

## NTP
Logs from ten devices are useless if their clocks disagree. NTP (UDP 123) syncs clocks. Stratum measures distance from the reference clock, and lower is better. \`ntp server 10.0.0.1\` makes a device a client, and \`ntp master\` makes it a server.

## SNMP
SNMP lets a management station poll devices (UDP 161) and lets devices send traps when something happens (UDP 162). Values live in the MIB, addressed by OIDs. v2c authenticates with a plaintext community string. SNMPv3 adds real authentication and encryption.

## Syslog
Syslog messages carry a severity from 0 to 7: Emergency, Alert, Critical, Error, Warning, Notice, Informational, Debugging. \`logging trap 4\` sends level 4 and more severe (lower numbers) to the server. Messages such as \`%LINK-5-CHANGED\` show the severity right in the middle.

## SSH instead of Telnet
Telnet (TCP 23) sends everything, including passwords, in clear text. SSH (TCP 22) encrypts the session. Setup:
\`\`\`
hostname R1
ip domain-name lab.local
crypto key generate rsa
username admin secret Str0ng!
line vty 0 4
 login local
 transport input ssh
\`\`\`
Also set \`enable secret\` (hashed) rather than \`enable password\`. Remember that \`service password-encryption\` only applies weak type 7 obfuscation.`,
    cues: [
      ['Syslog severities 0–7 in order?', 'Emergency, Alert, Critical, Error, Warning, Notice, Informational, Debugging.'],
      ['SNMP poll and trap ports?', 'UDP 161 for polling, UDP 162 for traps.'],
      ['What does NTP stratum mean?', 'Hops from the reference clock; lower is more accurate.'],
      ['Four things IOS needs before SSH works?', 'Hostname, ip domain-name, RSA keys (crypto key generate rsa), a user/login method on the vty lines.'],
    ],
  },
  {
    id: 'qos', title: 'Quality of service', domain: 'svc', week: 9, book: '—',
    body: `A congested link drops or delays packets indiscriminately. QoS lets you decide who suffers. Voice is the classic VIP. It needs one-way delay under about 150 ms, jitter under 30 ms and loss under 1%, while a file download barely notices a delay.

## The toolbox
1. **Classification and marking.** Identify traffic and label it. At Layer 3 the label is DSCP (6 bits in the IP header). Voice gets EF (46), and other classes use AF or CS values. At Layer 2, the 802.1Q tag carries a 3-bit CoS. You mark as close to the source as you can trust, usually at the access switch or IP phone. That point is the trust boundary.
2. **Queuing.** During congestion, separate queues get guaranteed shares of bandwidth (CBWFQ). LLQ adds a strict-priority queue for voice that is always served first, with a policer so it can't starve everything else.
3. **Policing and shaping.** Policing drops or re-marks traffic above a rate immediately. Shaping buffers the excess and sends it later, smoothing bursts at the cost of delay. Service providers police; customers shape to match the contract.
4. **Congestion avoidance.** Tail drop throws away everything once a queue fills, which makes every TCP flow back off at once (TCP global synchronisation). WRED drops some packets randomly as the queue fills, gently slowing TCP flows before the cliff.`,
    cues: [
      ['Voice targets for delay, jitter and loss?', '≤150 ms one-way, ≤30 ms jitter, ≤1% loss.'],
      ['DSCP value for voice?', 'EF, decimal 46.'],
      ['Policing vs shaping?', 'Policing drops/re-marks excess immediately; shaping buffers and delays it.'],
      ['What problem does WRED address?', 'Tail drop causing TCP global synchronisation.'],
    ],
  },
  {
    id: 'l2sec', title: 'Layer 2 security', domain: 'sec', week: 10, book: '—',
    body: `The access layer is where untrusted devices plug in, so that is where most attacks start: a rogue DHCP server, a laptop doing ARP poisoning, a MAC flooding tool. Three switch features handle most of it.

## Port security
Port security limits which MAC addresses may use an access port. The defaults are a maximum of 1 MAC and violation mode shutdown, which err-disables the port.
\`\`\`
interface fa0/5
 switchport mode access
 switchport port-security
 switchport port-security maximum 2
 switchport port-security mac-address sticky
 switchport port-security violation restrict
\`\`\`
Sticky learns MACs into the running config. Violation modes: shutdown (err-disable), restrict (drop and log), protect (drop silently). Recover an err-disabled port with \`shutdown\` then \`no shutdown\`.

## DHCP snooping
DHCP snooping divides ports into a trusted port (toward your real DHCP server, and uplinks) and an untrusted port (everything else). Server messages such as Offer and Ack arriving on an untrusted port are dropped, which kills rogue servers and the man-in-the-middle attacks they enable. Snooping also builds a binding table of MAC, IP, VLAN and port.
\`\`\`
ip dhcp snooping
ip dhcp snooping vlan 10
interface g0/1
 ip dhcp snooping trust
\`\`\`

## Dynamic ARP Inspection
DAI checks every ARP message on untrusted ports against that binding table and drops forged ones, which stops ARP poisoning (spoofing). It depends on DHCP snooping, so enable snooping first.

Add BPDU Guard on host ports, shut unused ports, put them in an unused VLAN, and don't use VLAN 1 for anything.`,
    cues: [
      ['Port security default maximum and violation mode?', '1 MAC, shutdown.'],
      ['Restrict vs protect?', 'Both drop; restrict also logs and counts, protect is silent.'],
      ['Which ports should be DHCP snooping trusted?', 'Ports toward legitimate DHCP servers and uplinks to other switches.'],
      ['What does DAI depend on?', 'The DHCP snooping binding table.'],
    ],
  },
  {
    id: 'aaa', title: 'Security concepts, AAA and wireless security', domain: 'sec', week: 10, book: '—',
    body: `Security aims at the CIA triad: confidentiality, integrity and availability. A vulnerability is a weakness, an exploit is the thing that uses it, and a threat is the potential for that to happen. Common attacks:
- DoS and DDoS floods
- spoofing
- man-in-the-middle
- malware such as ransomware
- social engineering such as phishing, which is often the easiest way in

## Authentication
Passwords alone are weak, so use MFA: something you know, have, or are. AAA (authentication, authorization, accounting) centralises who can log in, what they can do and what they did, using one of two server protocols:
- RADIUS: open, UDP 1812/1813, encrypts only the password, combines authentication and authorization. Used for network access: 802.1X, VPN, Wi-Fi.
- TACACS+: Cisco, TCP 49, encrypts the whole payload, separates the three functions. Used for device administration with per-command authorization.

802.1X is port-based access control. The supplicant (client) talks EAP to the authenticator (switch or AP), which relays to the RADIUS authentication server. Nothing but authentication traffic passes until the user is approved.

## Wireless security
WEP is broken and WPA with TKIP is deprecated. WPA2 uses AES-CCMP, with either a pre-shared key (Personal) or 802.1X (Enterprise). WPA3 replaces the PSK handshake with SAE, which resists offline dictionary attacks and gives forward secrecy, and it requires PMF. Enterprise networks should use 802.1X so each user has their own credentials.

A VPN builds an encrypted tunnel over an untrusted network. Site-to-site usually means IPsec between routers or firewalls. Remote-access VPNs typically use TLS from a client app.`,
    cues: [
      ['RADIUS vs TACACS+: transport and encryption?', 'RADIUS UDP 1812/1813, password only. TACACS+ TCP 49, whole payload.'],
      ['The three 802.1X roles?', 'Supplicant, authenticator, authentication server.'],
      ['What does WPA3 use in place of a PSK handshake?', 'SAE (Simultaneous Authentication of Equals).'],
      ['Give the three MFA factor types.', 'Something you know, have, are.'],
    ],
  },
  {
    id: 'wireless', title: 'Wireless architectures', domain: 'access', week: 10, book: 'Ch 3',
    body: `A WLAN is a shared, half-duplex radio medium. Clients can't detect collisions over the air, so they use CSMA/CA: listen, transmit, and wait for an ACK. An AP and its clients form a BSS identified by the radio's MAC (the BSSID). Several APs sharing one SSID form an ESS that clients roam across. Each SSID usually maps to a VLAN.

## RF basics
2.4 GHz travels further but has only three non-overlapping channels, 1, 6 and 11, and a lot of interference. 5 GHz has many more channels. 6 GHz (Wi-Fi 6E) adds even more. Neighbouring APs should use different non-overlapping channels.

## Architectures
- An autonomous AP is configured one by one. Fine for a SOHO.
- A lightweight AP is managed by a WLC (wireless LAN controller). The AP and controller split the work (split-MAC) and talk over CAPWAP: control on UDP 5246, data on UDP 5247. The WLC pushes config, manages RF and enforces security centrally.
- Cloud-managed APs (such as Meraki) keep management in the cloud.

AP modes you should recognise: local (the default; serves clients and tunnels traffic to the WLC), FlexConnect (switches traffic locally and survives a WAN outage to the controller), monitor, sniffer, rogue detector, SE-Connect (spectrum analysis) and bridge/mesh.

A WLC connects to the switch with a LAG (EtherChannel, mode on) carrying a trunk. Each WLAN is tied to a dynamic interface, which is a VLAN on the controller. The GUI is where the CCNA expects you to create a WLAN, choose WPA2/WPA3 and map it to a VLAN.`,
    cues: [
      ['Non-overlapping 2.4 GHz channels?', '1, 6, 11.'],
      ['CAPWAP control and data ports?', 'UDP 5246 control, 5247 data.'],
      ['Which AP mode keeps working locally if the WLC link fails?', 'FlexConnect.'],
      ['Why CSMA/CA instead of CSMA/CD on Wi-Fi?', 'Radios can’t detect collisions while transmitting, so they avoid them and rely on ACKs.'],
    ],
  },
  {
    id: 'sdn', title: 'SDN, REST and JSON', domain: 'auto', week: 11, book: '—',
    body: `Every network device has three planes. The data plane forwards traffic. The control plane builds the tables it uses (OSPF, STP, ARP). The management plane is how you reach the device (SSH, SNMP). Traditionally each box runs its own control plane and you configure them one at a time.

SDN centralises control in a controller. Applications talk to the controller through a northbound API, usually REST. The controller talks to devices through southbound APIs such as NETCONF, RESTCONF, OpenFlow or plain SSH. Cisco Catalyst Center (formerly DNA Center) is the enterprise example: you describe intent, and it automates and verifies the network. SD-Access builds a VXLAN overlay on top of a routed underlay.

## REST
A REST API is stateless, client-server and cacheable, and resources live at URIs. HTTP verbs map to CRUD:
- POST = create
- GET = read
- PUT/PATCH = update
- DELETE = delete

Responses carry an HTTP status code: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error. Authentication is often a token in a header.

## JSON
JSON is the usual payload format:
\`\`\`
{
  "interface": "GigabitEthernet0/0",
  "enabled": true,
  "ipv4": ["10.0.0.1", "10.0.0.2"],
  "mtu": 1500,
  "description": null
}
\`\`\`
Objects use braces with "key": value pairs, arrays use square brackets, strings need double quotes, and true/false/null are lowercase. Exam questions often show a JSON blob and ask how many objects or arrays it holds, or what the value of a key is. XML (tags) and YAML (indentation) express the same data differently.

Try it on Linux: \`curl -s https://api.github.com | jq .\``,
    cues: [
      ['Define data, control and management planes.', 'Data forwards traffic; control builds tables (routing, STP); management is admin access (SSH, SNMP).'],
      ['Northbound vs southbound API?', 'Northbound: apps ↔ controller (REST). Southbound: controller ↔ devices (NETCONF, RESTCONF, OpenFlow).'],
      ['CRUD to HTTP verbs?', 'Create POST, Read GET, Update PUT/PATCH, Delete DELETE.'],
      ['What do 201, 401 and 404 mean?', 'Created, Unauthorized, Not Found.'],
    ],
  },
  {
    id: 'cfgmgmt', title: 'Configuration management and AI', domain: 'auto', week: 11, book: '—',
    body: `Configuring a hundred switches by hand guarantees configuration drift. Configuration management tools define the desired state once and apply it everywhere.

- Ansible: agentless. It pushes changes over SSH from a control node using YAML playbooks. It is the most common choice for network gear.
- Puppet and Chef: agent-based. Devices pull their config from a server. Puppet uses its own declarative language; Chef uses Ruby "recipes".
- Terraform: declarative infrastructure as code, aimed at provisioning (cloud, VMs, networks). You declare the end state, and Terraform plans and applies the difference.

Under the hood, device APIs such as NETCONF (SSH port 830, XML) and RESTCONF (HTTPS, JSON or XML) expose structured data defined by YANG models, so tools don't have to screen-scrape CLI output.

Intent-based networking goes a step further. You state the business outcome ("guests can only reach the Internet"), and the controller translates it, deploys it and keeps checking it stays true.

## AI in network operations
The v1.1 blueprint includes AI. Machine learning finds patterns in data: baselining normal traffic, spotting anomalies, predicting failures before they happen (predictive AI), classifying applications. Generative AI (LLMs) produces new content: drafting configs, explaining a confusing \`show\` output, summarising thousands of syslog lines, writing a Python script against a REST API. The exam angle is that AI assists operators, but its output still has to be verified, and data privacy matters when you paste configs into a cloud service.`,
    cues: [
      ['Agentless vs agent-based config tools?', 'Ansible is agentless (push over SSH); Puppet and Chef are agent-based (pull).'],
      ['What language are Ansible playbooks in?', 'YAML.'],
      ['NETCONF transport and encoding?', 'SSH (TCP 830), XML, YANG models.'],
      ['Predictive vs generative AI in networking?', 'Predictive/ML finds patterns and anomalies; generative creates content such as configs, scripts and summaries.'],
    ],
  },
];

export const lessonById = id => LESSONS.find(l => l.id === id);
