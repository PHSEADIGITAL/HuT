const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateNights,
  dateRangeOverlaps,
  roomAvailability
} = require("../src/services/availability");

test("calculateNights computes stay length correctly", () => {
  const nights = calculateNights("2026-03-10", "2026-03-13");
  assert.equal(nights, 3);
});

test("date overlap logic handles common booking window", () => {
  assert.equal(
    dateRangeOverlaps("2026-03-10", "2026-03-12", "2026-03-11", "2026-03-14"),
    true
  );
  assert.equal(
    dateRangeOverlaps("2026-03-10", "2026-03-12", "2026-03-12", "2026-03-14"),
    false
  );
});

test("room availability subtracts overlapping confirmed bookings", () => {
  const data = {
    bookings: [
      {
        id: "b1",
        roomId: "r1",
        checkInDate: "2026-03-10",
        checkOutDate: "2026-03-12",
        status: "confirmed"
      },
      {
        id: "b2",
        roomId: "r1",
        checkInDate: "2026-03-11",
        checkOutDate: "2026-03-13",
        status: "cancelled"
      }
    ]
  };
  const room = { id: "r1", category: "Standard", totalUnits: 2 };
  const availability = roomAvailability(data, room, "2026-03-11", "2026-03-12");
  assert.equal(availability.availableUnits, 1);
});
