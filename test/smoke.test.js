const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const supertest = require("supertest");
const { createApp } = require("../src/app");
const { resetCache } = require("../src/data/store");

const dbFilePath = path.join(__dirname, "..", "data", "db.json");
let originalDb = "";

test.before(async () => {
  originalDb = await fs.readFile(dbFilePath, "utf8");
  resetCache();
});

test.after(async () => {
  await fs.writeFile(dbFilePath, originalDb);
  resetCache();
});

test("guest routes and health check", async () => {
  const app = createApp();
  const guest = supertest(app);

  const healthResponse = await guest.get("/health").expect(200);
  assert.equal(healthResponse.body.ok, true);

  await guest.get("/").expect(200);
  await guest.get("/admin").expect(302);
});

test("customer can login and complete mock booking", async () => {
  const app = createApp();
  const customer = supertest.agent(app);

  await customer
    .post("/auth/login")
    .type("form")
    .send({
      email: "customer@hut.app",
      password: "Customer@123",
      next: "/"
    })
    .expect(302);

  const bookingResponse = await customer
    .post("/bookings")
    .type("form")
    .send({
      hotelId: "hotel-seaside-grand",
      roomId: "room-seaside-standard",
      checkInDate: "2026-03-10",
      checkOutDate: "2026-03-12",
      guests: "1",
      emergencyContactName: "Jane Contact",
      emergencyContactPhone: "+2348039991111"
    })
    .expect(302);

  assert.match(bookingResponse.headers.location, /\/bookings\/.+\/success/);
  await customer.get(bookingResponse.headers.location).expect(200);
});

test("hotel admin can access assigned dashboard", async () => {
  const app = createApp();
  const admin = supertest.agent(app);

  await admin
    .post("/auth/login")
    .type("form")
    .send({
      email: "admin@seaside.hut",
      password: "Admin@123",
      next: "/admin"
    })
    .expect(302);

  await admin.get("/admin").expect(200);
  await admin.get("/admin/hotels/hotel-seaside-grand/dashboard").expect(200);
  await admin.get("/admin/hotels/hotel-bonny-suites/dashboard").expect(403);
});
