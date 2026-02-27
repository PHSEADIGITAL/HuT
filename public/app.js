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
      const row = document.querySelector(`[data-room-id="${room.roomId}"]`);
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

(function historyNavigationControls() {
  const backButtons = document.querySelectorAll(".js-history-back");
  const forwardButtons = document.querySelectorAll(".js-history-forward");
  if (!backButtons.length && !forwardButtons.length) {
    return;
  }

  backButtons.forEach((button) => {
    button.addEventListener("click", () => {
      window.history.back();
    });
  });
  forwardButtons.forEach((button) => {
    button.addEventListener("click", () => {
      window.history.forward();
    });
  });
})();

(function rememberLoginCredentials() {
  const forms = document.querySelectorAll('form[data-remember-form="login"]');
  if (!forms.length) {
    return;
  }

  const identifierKey = "hut.savedLoginEmail";
  const passwordKey = "hut.savedLoginPassword";
  const rememberFlagKey = "hut.rememberLoginEnabled";
  const savedEmail = localStorage.getItem(identifierKey) || "";
  const savedPassword = localStorage.getItem(passwordKey) || "";
  const rememberEnabled = localStorage.getItem(rememberFlagKey) === "true";

  forms.forEach((form) => {
    const emailInput = form.querySelector('input[name="email"]');
    const passwordInput = form.querySelector('input[name="password"]');
    const rememberInput = form.querySelector("[data-remember-checkbox]");

    if (rememberInput && rememberEnabled) {
      rememberInput.checked = true;
    }
    if (emailInput && savedEmail) {
      emailInput.value = savedEmail;
    }
    if (passwordInput && savedPassword && rememberEnabled) {
      passwordInput.value = savedPassword;
    }

    form.addEventListener("submit", () => {
      if (!emailInput || !passwordInput || !rememberInput) {
        return;
      }

      if (rememberInput.checked) {
        localStorage.setItem(identifierKey, emailInput.value || "");
        localStorage.setItem(passwordKey, passwordInput.value || "");
        localStorage.setItem(rememberFlagKey, "true");
      } else {
        localStorage.removeItem(identifierKey);
        localStorage.removeItem(passwordKey);
        localStorage.setItem(rememberFlagKey, "false");
      }
    });
  });
})();
