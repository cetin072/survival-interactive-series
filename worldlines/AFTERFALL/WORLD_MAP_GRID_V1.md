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
| 외곽 제3거점 | 0.0 | 0.0 | HIGH | public forward gateway / advance buffer; lean vetted staff |
| 서림대학교 북서 실습센터 | -5.8 | 2.0 | MEDIUM | hidden rear base; exact public location remains secret |
| 북유성 농업기술 실증단지 | 1.8 | 5.8 | MEDIUM | production / well / seed base |
| 서쪽길 관리거점 | -4.8 | -1.8 | MEDIUM | west-road maintenance axis |
| 폐쇄 직업훈련원 | -0.7 | 1.9 | MEDIUM | active primary residence of the core four; limited semi-private visibility |
| 폐쇄 체육시설 | -1.8 | 3.3 | HIGH | active central guild / work / logistics hub |
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
| 제3거점 | 폐쇄 직업훈련원 | 2.5 | short front-living connector |
| 폐쇄 직업훈련원 | 폐쇄 체육시설 | 2.3 | residence-to-work connector |
| 폐쇄 직업훈련원 | 북서 실습센터 | 6.3 | controlled rear connector |
| 폐쇄 직업훈련원 | 북유성 실증단지 | 5.8 | front-residence to production connector |
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

## 6. Five-node operating geometry — active as of 2027-02-24

The living network now uses five durable functional nodes.

### Front cluster

#### 1) 외곽 제3거점 — public forward gateway / advance buffer
Coordinate: **(0.0, 0.0)**

Route position:
- 서쪽길 관리거점: 5.8 km
- 동천교: 6.0 km
- 폐쇄 직업훈련원: 2.5 km
- 폐쇄 체육시설: 4.2 km

Primary role:
- first contact
- individual case intake
- short waiting / limited short stay
- basic medical triage
- low-value logistics
- public information intake
- buffer before visitors move deeper into the front cluster

Operating model:
- only a small vetted staff remains on routine duty;
- core guild operations moved inward to 폐쇄 체육시설.

Hidden contingency overlay:
- known only to 서진우 and 장태훈;
- uses the node's forward position for early warning, communication fallback, retreat guidance and delay/buffer functions;
- this does **not** make it a public military base, militia headquarters, barracks or attack-force node.

#### 2) 폐쇄 직업훈련원 — primary front residence
Coordinate: **(-0.7, +1.9)**

Nominal routes:
- to 외곽 제3거점: 2.5 km
- to 폐쇄 체육시설: 2.3 km
- to 북서 실습센터: 6.3 km
- to 북유성 실증단지: 5.8 km

Primary role:
- core four's main home
- sleeping / meals / hygiene / recovery / private life
- limited semi-private location policy

Security rule:
- the building's existence is not itself a secret;
- the core four's actual residence pattern, rear connectors and exact operating routine are restricted.

#### 3) 폐쇄 체육시설 — central guild / work / logistics hub
Coordinate: **(-1.8, +3.3)**

Nominal routes:
- to 외곽 제3거점: 4.2 km
- to 폐쇄 직업훈련원: 2.3 km
- to 북서 실습센터: 4.8 km
- to 북유성 실증단지: 5.0 km

Primary role:
- guild brokerage / matching
- larger trade
- vehicle staging and loading
- warehouse and sorting
- offices / shared workspaces
- day-market scale public activity

Current infrastructure:
- side/admin wing heated with installed salvaged wood-boiler system;
- liquid fuel is backup / freeze protection rather than primary heat;
- the main hall remains suited to unheated bulk use rather than whole-building residential heating.

The core four **live** at 폐쇄 직업훈련원 but use 폐쇄 체육시설 as their principal shared **workplace**.

### Rear cluster

#### 4) 서림대학교 북서 실습센터 — shared hidden fallback bunker
Coordinate: **(-5.8, +2.0)**

Role:
- hidden retreat
- emergency sleeping
- medical reserve
- long reserve stock
- important records
- spare fuel / parts
- continuity point if front living nodes fail

Governance:
- shared by the seven-person alliance without property merger;
- common emergency zone plus sealed core-four and agritech reserve zones;
- normally unmanned / dormant.

Maintenance:
- facility is checked every 48 hours under current great-cold conditions;
- front-core side and agritech side alternate;
- each group therefore visits approximately once every 96 hours;
- any anomaly, weather red condition, leak, power or battery warning shortens the next check.

#### 5) 북유성 농업기술 실증단지 — production / water / seed core
Coordinate: **(+1.8, +5.8)**

Role:
- well / water
- seed
- protected production
- long-term food-production continuity

It remains operationally independent and is not converted into a public distribution base.

## 7. Role logic

The five-node network is a **functional split**, not five duplicated headquarters.

- outer gateway catches problems early;
- vocational center provides stable daily living;
- sports complex concentrates work, trade and logistics;
- northwest training center preserves hidden continuity;
- agritech preserves production and water.

The front-side structure is deliberately layered:
**public gateway → semi-private home / central work hub → hidden rear continuity nodes**.

This structure should be the basis of **AF-MAP-001 — 서림 생활권 지도** unless later Canon changes the topology.

### Continuity guard
The 2027-02-07 correction remains active:
- no automatic militia formation;
- no public military headquarters;
- no barracks network;
- no attack-force organization.

Later player choice added one narrow exception:
- the old public third hub has a **private defensive contingency layer** known only to 서진우 and 장태훈, focused on early warning, communication, retreat guidance and buffering.

## 8. Map-security rule

Public-facing maps and ordinary third-hub ledgers must NOT contain exact coordinates of:
- 서림대학교 북서 실습센터
- rear-stock routes
- concealed approach / withdrawal paths

Use separate:
- PUBLIC MAP: third hub, bridge, roads, market/service nodes
- TRUSTED ROUTE MAP: route distances, candidate buildings and verified access constraints
- CORE MAP: exact rear-base anchors and concealed routes

## 9. Maintenance

Update this file when:
- a new recurring strategic node is established,
- a route is permanently lost/opened,
- a major base moves,
- future gameplay establishes a reliable contradictory distance,
- a visual world map is produced.
