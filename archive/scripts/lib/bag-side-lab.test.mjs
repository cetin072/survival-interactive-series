import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, changeDemo, currentQuantity, shortage, summary, nextAction, prioritizedItems, dashboardSummary, dayDifference, minusDays } from "../../web/public/bag-lab/logic.mjs";

const food = state => state.items.find(item => item.id === "food");
test("five-item bag is only a synthetic example",()=>{
  const s=createDemo();
  assert.equal(s.sampleOnly,true);
  assert.equal(summary(s).items,5);
  assert.equal(summary(s).shortages,0);
  assert.equal(currentQuantity(food(s)),6);
});
test("remove 2 -> shortage 2, cannot double subtract",()=>{
  const start=createDemo();
  const s=changeDemo(start,"remove-two");
  assert.equal(currentQuantity(food(s)),4);
  assert.equal(shortage(food(s)),2);
  assert.strictEqual(changeDemo(s,"remove-two"),s);
  assert.equal(currentQuantity(food(start)),6,"original state must stay immutable");
});
test("ordering is NOT a physical refill",()=>{
  const s=changeDemo(changeDemo(createDemo(),"remove-two"),"ordered-two");
  assert.equal(currentQuantity(food(s)),4);
  assert.equal(shortage(food(s)),2);
  assert.equal(s.steps.ordered,true);
});
test("physical refill preserves both old batch deadlines",()=>{
  const start=createDemo();
  const s=changeDemo(changeDemo(changeDemo(start,"remove-two"),"ordered-two"),"put-two");
  assert.equal(currentQuantity(food(s)),6);
  assert.equal(shortage(food(s)),0);
  assert.deepEqual(food(s).batches.map(b=>[b.id,b.quantity,b.markedUntil]),[
    ["food-A",2,"2027-04-30"],["food-B",2,"2027-12-31"],["food-C",2,"2028-03-31"]
  ]);
  assert.strictEqual(changeDemo(s,"put-two"),s,"second tap must be ignored");
});
test("snooze changes no quantity or printed deadlines",()=>{
  const s=changeDemo(createDemo(),"remove-two");
  const before=JSON.stringify(s.items);
  const after=changeDemo(s,"snooze");
  assert.equal(after.steps.snoozed,true);
  assert.equal(JSON.stringify(after.items),before);
  assert.equal(shortage(food(after)),2);
});
test("refresh/reset only restores synthetic starting state",()=>{
  const done=changeDemo(changeDemo(createDemo(),"remove-two"),"put-two");
  assert.deepEqual(changeDemo(done,"reset"),createDemo());
  assert.deepEqual(JSON.parse(JSON.stringify(done)),done);
});

test("upcoming inspection and printed-date rotation are different kinds of management",()=>{
  const s=createDemo();
  assert.deepEqual(prioritizedItems(s).map(item=>item.id),["light","power","food","water","wipes"]);
  assert.equal(nextAction(s.items[2]).kind,"inspection");
  assert.equal(nextAction(s.items[2]).due,"2026-11-01");
  assert.equal(minusDays("2027-04-30",90),"2027-01-30");
  assert.equal(nextAction(s.items[0],90).due,"2027-01-30");
  assert.equal(nextAction(s.items[0],90).markedUntil,"2027-04-30");
});
test("dashboard date summary counts due-soon items without fake safety score",()=>{
  const s=createDemo();
  const overview=dashboardSummary(s,"2026-10-11");
  assert.equal(overview.items,5);
  assert.equal(overview.shortages,0);
  assert.equal(overview.soonCount,1);
  assert.equal(overview.next.item.id,"light");
  assert.equal(dayDifference(overview.next.task.due,"2026-10-11"),21);
});
test("physical shortage becomes first action even when its future label date is later",()=>{
  const s=changeDemo(createDemo(),"remove-two");
  assert.equal(prioritizedItems(s)[0].id,"food");
  assert.equal(dashboardSummary(s,"2026-10-11").shortages,1);
  const ordered=changeDemo(s,"ordered-two");
  assert.equal(prioritizedItems(ordered)[0].id,"food");
  const filled=changeDemo(ordered,"put-two");
  assert.equal(prioritizedItems(filled)[0].id,"light");
});
test("empty batches do not produce false future checks",()=>{
  const s=createDemo();
  s.items[0].batches[0].quantity=0;
  assert.equal(nextAction(s.items[0],90).markedUntil,"2027-12-31");
  assert.equal(nextAction(s.items[0],90).due,"2027-10-02");
});
