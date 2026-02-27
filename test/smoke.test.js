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

test("marketplace listing limit, wallet topup and contact unlock flow", async () => {
  const app = createApp();
  const seller = supertest.agent(app);

  await seller
    .post("/auth/login")
    .type("form")
    .send({
      email: "customer@hut.app",
      password: "Customer@123",
      next: "/marketplace"
    })
    .expect(302);

  await seller
    .get("/marketplace/new")
    .expect(200);

  let failures = 0;
  let successes = 0;
  for (let index = 0; index < 5; index += 1) {
    const response = await seller
      .post("/marketplace/listings")
      .type("form")
      .send({
        title: `Smoke Test Item ${index + 1}`,
        description: "Test listing for monthly cap validation",
        category: "Electronics",
        condition: "Used",
        price: "25000"
      })
      .expect(302);

    if (response.headers.location === "/marketplace/new") {
      failures += 1;
    } else {
      successes += 1;
    }
  }

  assert.ok(failures >= 1);
  assert.ok(successes <= 4);

  const buyer = supertest.agent(app);
  const unique = Date.now();
  await buyer
    .post("/auth/register")
    .type("form")
    .send({
      name: "Marketplace Buyer",
      phone: `+23480355${String(unique).slice(-4)}`,
      email: `buyer${unique}@hut.app`,
      password: "Buyer@123",
      confirmPassword: "Buyer@123",
      next: "/marketplace"
    })
    .expect(302);

  await buyer
    .post("/wallet/topup")
    .type("form")
    .send({
      amount: "500",
      reference: `SMOKE-${unique}`
    })
    .expect(302);

  await buyer
    .post("/marketplace/listings/listing-used-iphone-13/unlock-contact")
    .type("form")
    .send({})
    .expect(302);

  const listingPage = await buyer.get("/marketplace/listings/listing-used-iphone-13").expect(200);
  assert.match(listingPage.text, /\+2348030000201/);
});

test("platform owner can access revenue dashboard", async () => {
  const app = createApp();
  const owner = supertest.agent(app);

  await owner
    .post("/auth/login")
    .type("form")
    .send({
      email: "owner@hut.app",
      password: "Owner@123",
      next: "/admin/owner-dashboard"
    })
    .expect(302);

  const ownerDashboard = await owner.get("/admin/owner-dashboard").expect(200);
  assert.match(ownerDashboard.text, /Platform Owner Dashboard/);
});
