const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateRefund } = require("../src/services/refund");

test("flexible refund gives 100% when cancellation is 48+ hours", () => {
  const refund = calculateRefund({
    policyType: "flexible",
    cancelledAt: "2026-03-01T00:00:00.000Z",
    checkInDate: "2026-03-04",
    totalPaid: 150000,
    pickupTotal: 10000,
    pickupRequested: true
  });

  assert.equal(refund.refundTotal, 150000);
  assert.equal(refund.baseRefund, 140000);
  assert.equal(refund.pickupRefund, 10000);
});

test("flexible refund gives 50% in 24-48 hour window", () => {
  const refund = calculateRefund({
    policyType: "flexible",
    cancelledAt: "2026-03-02T00:00:00.000Z",
    checkInDate: "2026-03-03",
    totalPaid: 100000,
    pickupTotal: 10000,
    pickupRequested: true
  });

  assert.equal(refund.baseRefund, 45000);
  assert.equal(refund.pickupRefund, 10000);
  assert.equal(refund.refundTotal, 55000);
});

test("flexible refund gives no refund under 24 hours", () => {
  const refund = calculateRefund({
    policyType: "flexible",
    cancelledAt: "2026-03-02T12:00:00.000Z",
    checkInDate: "2026-03-03",
    totalPaid: 100000,
    pickupTotal: 10000,
    pickupRequested: true
  });

  assert.equal(refund.refundTotal, 0);
});
