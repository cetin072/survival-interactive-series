# AFTERFALL — World Map Grid v1

Status: **AUTHORITATIVE INTERNAL SPATIAL MODEL**
Worldline: AFTERFALL
Purpose: persistent distance / route / map consistency for gameplay and later visual map production.

## 1. Coordinate rule

- Origin: 외곽 제3거점 = (0.0, 0.0)
- +X = east
- +Y = north
- Unit = kilometer
- Coordinates are **fictional-world relative anchors**, not real-world GPS.
- Coordinates represent stable world topology. Exact building footprints and road bends may be refined later without moving a node casually.
- When future Canon establishes a contradictory travel relation, revise the lowest-confidence node or route edge and record the revision.

## 2. Distance rule

Two distances are tracked:

1. **Straight-line distance**: Euclidean distance between node anchors.
2. **Nominal route distance**: usable road / farm-road / bridge route in ordinary degraded conditions.

Travel time is NOT fixed from distance alone.
Weather, road blockage, checkpoint delay, vehicle condition and stealth requirements are separate modifiers.

Suggested travel model:
- clear vehicle movement: nominal distance / 25~40 km/h
- degraded winter movement: nominal distance / 10~25 km/h
- severe blizzard / ice: nominal distance / 5~15 km/h
- foot movement: terrain- and load-dependent; never derive purely from vehicle time

## 3. Node anchors

| Node | X km | Y km | Confidence | Notes |
|---|---:|---:|---|---|
| 외곽 제3거점 | 0.0 | 0.0 | HIGH | public forward service / exchange hub |
| 서림대학교 북서 실습센터 | -5.8 | 2.0 | MEDIUM | hidden rear base; exact public location remains secret |
| 북유성 농업기술 실증단지 | 1.8 | 5.8 | MEDIUM | production / well / seed base |
| 서쪽길 관리거점 | -4.8 | -1.8 | MEDIUM | west-road maintenance axis |
| 폐쇄 체육시설 | -1.8 | 3.3 | MEDIUM | previously visited for public-water control parts; large-building candidate |
| 동천교 | 5.1 | 1.6 | MEDIUM | natural chokepoint |
| 북쪽 의원 | 5.3 | 2.7 | LOW-MEDIUM | clinic / medical contact axis |
| 북쪽 연료장 | 5.8 | 4.7 | MEDIUM | north of Dongcheon Bridge / old logistics-fuel area |
| 백운생활관 | 6.7 | 0.7 | LOW-MEDIUM | location anchor may be refined by later travel evidence |
| 산림교육원 | 6.6 | 9.2 | LOW-MEDIUM | northern forest node |
| 폐교 | -4.3 | 3.0 | LOW-MEDIUM | known alternate withdrawal route landmark |
| 서쪽 창고군 | -6.0 | -3.5 | LOW-MEDIUM | fire-damaged west industrial / warehouse axis |

## 4. Canonical nominal route edges

| From | To | Nominal km | Route note |
|---|---|---:|---|
| 제3거점 | 북서 실습센터 | 7.2 | concealed operational route; avoid repetitive visible shuttle |
| 제3거점 | 북유성 실증단지 | 7.0 | direct service / outer road route |
| 북서 실습센터 | 북유성 실증단지 | 9.5 | two-base mutual-support route |
| 제3거점 | 폐쇄 체육시설 | 4.2 | mixed public / service road |
| 폐쇄 체육시설 | 북서 실습센터 | 4.8 | rear-side access; security-sensitive |
| 폐쇄 체육시설 | 북유성 실증단지 | 5.0 | farm/service-road access |
| 제3거점 | 서쪽길 관리거점 | 5.8 | west movement axis |
| 북서 실습센터 | 서쪽길 관리거점 | 4.6 | rear west access |
| 제3거점 | 동천교 | 6.0 | east/northeast public axis |
| 동천교 | 북쪽 의원 | 1.5 | short medical connector |
| 동천교 | 북쪽 연료장 | 3.5 | north logistics/fuel connector |
| 동천교 | 백운생활관 | 2.2 | eastern/northeastern living-zone connector |
| 북유성 실증단지 | 북쪽 연료장 | 4.6 | northern service route |
| 북유성 실증단지 | 북쪽 의원 | 4.5 | medical / production cross-route |
| 북쪽 연료장 | 산림교육원 | 5.0 | northern route |
| 북서 실습센터 | 폐교 | 2.0 | alternate withdrawal axis |
| 폐교 | 폐쇄 체육시설 | 3.0 | back-road connector |
| 서쪽길 관리거점 | 서쪽 창고군 | 2.5 | industrial access |

## 5. Major nominal route distances

Shortest nominal-route distances under ordinary degraded conditions:

| A | B | km |
|---|---|---:|
| 북서 실습센터 | 북유성 실증단지 | 9.5 |
| 북서 실습센터 | 제3거점 | 7.2 |
| 북유성 실증단지 | 제3거점 | 7.0 |
| 제3거점 | 동천교 | 6.0 |
| 제3거점 | 북쪽 연료장 | 9.5 |
| 제3거점 | 백운생활관 | 8.2 |
| 동천교 | 북쪽 연료장 | 3.5 |
| 동천교 | 백운생활관 | 2.2 |
| 북유성 실증단지 | 북쪽 연료장 | 4.6 |
| 북쪽 연료장 | 산림교육원 | 5.0 |

## 6. Security / operations-site geometry

For the three current strategic bases:
- 북서 실습센터
- 북유성 실증단지
- 외곽 제3거점

the equal-response geometric center falls roughly around **(-1.9, +3.7)**.

The previously known **폐쇄 체육시설** at approx **(-1.8, +3.3)** sits close to that center.

Approx nominal route distances from 폐쇄 체육시설:
- to 북서 실습센터: 4.8 km
- to 북유성 실증단지: 5.0 km
- to 제3거점: 4.2 km

This makes it a strong **candidate** for:
- rapid-response staging
- vehicle / tool reserve
- training
- radio relay
- limited defensive reserve
- temporary incident-command use

It should NOT automatically become a permanent barracks or public military headquarters.
Risks:
- large building heating cost
- multiple entrances
- visibility / route-pattern exposure
- possible prior scavenger claims
- repeated traffic could help outsiders infer rear-base directions

## 7. Candidate-building comparison

### A. 폐쇄 체육시설 — current best geometric candidate
Pros:
- near-equal reach to all three bases
- large parking / vehicle staging
- machinery room and utility spaces already known
- not itself a natural road chokepoint
- can be operated in only one wing

Cons:
- poor whole-building heating efficiency
- several entrances / large perimeter
- known scavenging history
- repeated rear-base traffic can create triangulation risk

### B. 폐교 — rear-defense candidate, not network center
Pros:
- small-room segmentation
- fence / yard
- close to rear withdrawal route

Cons:
- too close to hidden northwest base
- occupation may compromise an escape axis
- weak reach to agritech and public hub

### C. 서쪽 창고군 / industrial large-building axis
Pros:
- vehicle access
- storage volume
- close to west-road logistics

Cons:
- fire-damaged / ownership-disputed environment
- far from agritech
- tied too strongly to one approach axis
- poor as balanced three-base response point

## 8. Map-security rule

Public-facing maps and ordinary third-hub ledgers must NOT contain exact coordinates of:
- 서림대학교 북서 실습센터
- rear-stock routes
- concealed approach / withdrawal paths

Use separate:
- PUBLIC MAP: third hub, bridge, roads, market/service nodes
- TRUSTED OPERATIONS MAP: response distances and candidate staging points
- CORE MAP: exact rear-base anchors and concealed routes

## 9. Maintenance

Update this file when:
- a new recurring strategic node is established,
- a route is permanently lost/opened,
- a major base moves,
- future gameplay establishes a reliable contradictory distance,
- a visual world map is produced.
