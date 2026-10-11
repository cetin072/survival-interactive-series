// BAG-SIDE-01 test-only state model. Synthetic data; never calls APIs or stores personal data.
const BASE = {
  sampleOnly: true,
  bagName: "나의 생존가방",
  items: [
    { id: "food", name: "간편식", icon: "🥣", target: 6, unit: "개",
      batches: [
        { id: "food-A", quantity: 4, markedUntil: "2027-04-30" },
        { id: "food-B", quantity: 2, markedUntil: "2027-12-31" }
      ] },
    { id: "water", name: "생수", icon: "💧", target: 2, unit: "병",
      batches: [{ id: "water-A", quantity: 2, markedUntil: "2027-05-31" }] },
    { id: "light", name: "손전등", icon: "🔦", target: 1, unit: "개",
      nextInspection: "2026-11-01", batches: [{ id: "light-A", quantity: 1 }] },
    { id: "power", name: "보조배터리", icon: "🔋", target: 1, unit: "개",
      nextInspection: "2026-11-15", batches: [{ id: "power-A", quantity: 1 }] },
    { id: "wipes", name: "위생티슈", icon: "🧻", target: 2, unit: "개",
      batches: [{ id: "wipes-A", quantity: 2, markedUntil: "2027-07-01" }] }
  ],
  steps: { removed: false, ordered: false, replenished: false, snoozed: false },
  lastAction: "샘플 가방에 물품 5종이 등록되어 있습니다."
};
export const createDemo = () => JSON.parse(JSON.stringify(BASE));
export const currentQuantity = (item) => item.batches.reduce((sum, batch) => sum + batch.quantity, 0);
export const shortage = (item) => Math.max(0, item.target - currentQuantity(item));
export const summary = (state) => ({
  items: state.items.length,
  shortages: state.items.filter(item => shortage(item) > 0).length,
  shortageUnits: state.items.reduce((sum, item) => sum + shortage(item), 0)
});
export function changeDemo(state, action) {
  if (action === "reset") return createDemo();
  const next = JSON.parse(JSON.stringify(state));
  const food = next.items.find(item => item.id === "food");
  if (action === "remove-two") {
    if (next.steps.removed) return state; // one-time scenario: no accidental double tap subtraction
    const old = food.batches.find(batch => batch.id === "food-A");
    if (!old || old.quantity < 2) return state;
    old.quantity -= 2;
    next.steps.removed = true;
    next.lastAction = "간편식 2개를 꺼냈어요. 부족한 2개가 남아 있습니다.";
  } else if (action === "ordered-two") {
    if (!next.steps.removed || next.steps.replenished || next.steps.ordered) return state;
    next.steps.ordered = true;
    next.lastAction = "주문만 했어요. 실제 가방에는 아직 2개가 부족해요.";
  } else if (action === "put-two") {
    if (!next.steps.removed || next.steps.replenished) return state;
    food.batches.push({ id: "food-C", quantity: 2, markedUntil: "2028-03-31" });
    next.steps.replenished = true;
    next.lastAction = "새 물품 2개를 실제로 넣었다고 기록했어요. 부족분이 해소됐습니다.";
  } else if (action === "snooze") {
    if (next.steps.snoozed) return state;
    next.steps.snoozed = true;
    next.lastAction = "알림 표시만 7일 뒤로 미뤘어요. 실제 알림 예약은 하지 않았습니다.";
  } else {
    return state;
  }
  return next;
}
