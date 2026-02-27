(function realtimeAvailability() {
  const root = document.getElementById("availability-root");
  if (!root) {
    return;
  }

  const hotelId = root.dataset.hotelId;
  const checkInDate = root.dataset.checkIn;
  const checkOutDate = root.dataset.checkOut;
  if (!hotelId || !checkInDate || !checkOutDate) {
    return;
  }

  async function fetchAvailability() {
    const query = new URLSearchParams({
      checkInDate,
      checkOutDate
    });
    const response = await fetch(`/api/hotels/${hotelId}/availability?${query}`);
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    payload.rooms.forEach((room) => {
      const row = document.querySelector(`tr[data-room-id="${room.roomId}"]`);
      if (!row) {
        return;
      }

      const availabilityCell = row.querySelector(".availability-value");
      if (availabilityCell) {
        availabilityCell.textContent = String(room.availableUnits);
        availabilityCell.classList.remove("danger", "success");
        availabilityCell.classList.add(room.soldOut ? "danger" : "success");
      }

      const bookedCell = row.querySelector(".booked-value");
      if (bookedCell) {
        bookedCell.textContent = String(room.activeBookings);
      }
    });
  }

  fetchAvailability().catch(() => {});
  const stream = new EventSource(`/api/hotels/${hotelId}/availability/stream`);
  stream.addEventListener("availability_update", () => {
    fetchAvailability().catch(() => {});
  });
  stream.addEventListener("connected", () => {
    fetchAvailability().catch(() => {});
  });

  const timer = setInterval(() => {
    fetchAvailability().catch(() => {});
  }, 30000);

  window.addEventListener("beforeunload", () => {
    clearInterval(timer);
    stream.close();
  });
})();
