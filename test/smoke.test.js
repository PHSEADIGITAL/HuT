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

  await admin
    .post("/wallet/topup")
    .type("form")
    .send({
      amount: "1000",
      reference: "ADMIN-TOPUP-TEST"
    })
    .expect(302);

  const walletPage = await admin.get("/wallet").expect(200);
  assert.match(walletPage.text, /Wallet top-up is disabled for hotel admin accounts/);
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
      amount: "3000",
      reference: `SMOKE-${unique}`
    })
    .expect(302);

  await buyer
    .post("/marketplace/plans/purchase")
    .type("form")
    .send({
      planId: "basic"
    })
    .expect(302);

  const planPage = await buyer.get("/marketplace/new").expect(200);
  assert.match(planPage.text, /0 \/ 10/);

  await buyer
    .post("/marketplace/listings/listing-used-iphone-13/unlock-contact")
    .type("form")
    .send({})
    .expect(302);

  const listingPage = await buyer.get("/marketplace/listings/listing-used-iphone-13").expect(200);
  assert.match(listingPage.text, /\+2348030000201/);
});

test("forgot password OTP flow resets password", async () => {
  const app = createApp();
  const unique = Date.now();
  const email = `otp${unique}@hut.app`;
  const phone = `+23480366${String(unique).slice(-4)}`;
  const agent = supertest.agent(app);

  await agent
    .post("/auth/register")
    .type("form")
    .send({
      name: "Otp User",
      phone,
      email,
      password: "Start@123",
      confirmPassword: "Start@123",
      next: "/"
    })
    .expect(302);

  await agent.post("/auth/logout").send({}).expect(302);

  await agent
    .post("/auth/forgot-password")
    .type("form")
    .send({
      identifier: email
    })
    .expect(302);

  const db = JSON.parse(await fs.readFile(dbFilePath, "utf8"));
  const otpEntry = [...(db.passwordOtps || [])]
    .reverse()
    .find((item) => item.identifier === email && item.status === "active");
  assert.ok(otpEntry);

  await agent
    .post("/auth/reset-password")
    .type("form")
    .send({
      identifier: email,
      otpCode: otpEntry.code,
      password: "NewPass@123",
      confirmPassword: "NewPass@123"
    })
    .expect(302);

  const loginResponse = await agent
    .post("/auth/login")
    .type("form")
    .send({
      email,
      password: "NewPass@123",
      next: "/"
    })
    .expect(302);
  assert.equal(loginResponse.headers.location, "/");
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

test("onboarding supports room setup, commission updates, and hotel-admin room edits", async () => {
  const app = createApp();
  const owner = supertest.agent(app);

  await owner
    .post("/auth/login")
    .type("form")
    .send({
      email: "owner@hut.app",
      password: "Owner@123",
      next: "/admin/hotels/new"
    })
    .expect(302);

  const unique = Date.now();
  const adminEmail = `newadmin${unique}@hut.app`;
  const adminPassword = "HotelAdmin@123";
  const onboardingResponse = await owner
    .post("/admin/hotels")
    .type("form")
    .send({
      name: `Lagoon Horizon ${unique}`,
      description: "Freshly onboarded property for workflow test.",
      location: "Bonny Mainland",
      bankName: "Demo Bank",
      bankAccount: "1122334455",
      cancellationPolicy: "flexible",
      commissionRate: "14",
      pickupFee: "6500",
      standardRoomUnits: "6",
      deluxeRoomUnits: "3",
      executiveSuiteRoomUnits: "2",
      adminName: "Lagoon Admin",
      adminEmail,
      adminPassword
    })
    .expect(302);

  const location = onboardingResponse.headers.location || "";
  const hotelMatch = location.match(/^\/admin\/hotels\/([^/]+)\/dashboard$/);
  assert.ok(hotelMatch);
  const hotelId = decodeURIComponent(hotelMatch[1]);

  let db = JSON.parse(await fs.readFile(dbFilePath, "utf8"));
  const createdHotel = db.hotels.find((hotel) => hotel.id === hotelId);
  assert.ok(createdHotel);
  assert.equal(createdHotel.commissionRate, 0.14);

  const createdRooms = db.rooms.filter((room) => room.hotelId === hotelId);
  assert.equal(createdRooms.length, 3);
  assert.equal(createdRooms.find((room) => room.category === "Standard")?.totalUnits, 6);
  assert.equal(createdRooms.find((room) => room.category === "Deluxe")?.totalUnits, 3);
  assert.equal(createdRooms.find((room) => room.category === "Executive Suites")?.totalUnits, 2);

  await owner
    .post(`/admin/hotels/${hotelId}/commission`)
    .type("form")
    .send({
      commissionRate: "19.5",
      returnTo: "/admin/owner-dashboard"
    })
    .expect(302);

  db = JSON.parse(await fs.readFile(dbFilePath, "utf8"));
  const adjustedHotel = db.hotels.find((hotel) => hotel.id === hotelId);
  assert.ok(adjustedHotel);
  assert.equal(adjustedHotel.commissionRate, 0.195);

  const standardRoom = db.rooms.find(
    (room) => room.hotelId === hotelId && room.category === "Standard"
  );
  assert.ok(standardRoom);

  const hotelAdmin = supertest.agent(app);
  await hotelAdmin
    .post("/auth/login")
    .type("form")
    .send({
      email: adminEmail,
      password: adminPassword,
      next: `/admin/hotels/${hotelId}/dashboard`
    })
    .expect(302);

  await hotelAdmin
    .post(`/admin/hotels/${hotelId}/rooms/${standardRoom.id}`)
    .type("form")
    .send({
      pricePerNight: "64000",
      totalUnits: "7"
    })
    .expect(302);

  db = JSON.parse(await fs.readFile(dbFilePath, "utf8"));
  const updatedStandardRoom = db.rooms.find((room) => room.id === standardRoom.id);
  assert.ok(updatedStandardRoom);
  assert.equal(updatedStandardRoom.pricePerNight, 64000);
  assert.equal(updatedStandardRoom.totalUnits, 7);
});
