function hoursBeforeCheckIn(checkInDate, cancelledAt) {
  const checkInTime = new Date(`${checkInDate}T00:00:00.000Z`).getTime();
  const cancelTime = new Date(cancelledAt).getTime();
  return (checkInTime - cancelTime) / (1000 * 60 * 60);
}

function getRefundPolicyRules(policyType) {
  if (policyType === "flexible") {
    return [
      "100% refund if cancelled 48+ hours before check-in",
      "50% refund if cancelled 24-48 hours before check-in",
      "No refund if cancelled within 24 hours",
      "Pickup add-on is fully refundable only if cancelled at least 24 hours before check-in"
    ];
  }

  if (policyType === "moderate") {
    return [
      "75% refund if cancelled 72+ hours before check-in",
      "30% refund if cancelled 24-72 hours before check-in",
      "No refund if cancelled within 24 hours",
      "Pickup add-on is fully refundable only if cancelled at least 24 hours before check-in"
    ];
  }

  if (policyType === "strict") {
    return [
      "50% refund if cancelled 72+ hours before check-in",
      "No refund if cancelled within 72 hours",
      "Pickup add-on is fully refundable only if cancelled at least 24 hours before check-in"
    ];
  }

  return ["Policy configured by hotel.", "Manual review may be required."];
}

function calculateRefund({
  policyType,
  cancelledAt,
  checkInDate,
  totalPaid,
  pickupTotal,
  pickupRequested
}) {
  const leadHours = hoursBeforeCheckIn(checkInDate, cancelledAt);
  const nonPickupPaid = Math.max(0, totalPaid - (pickupTotal || 0));

  let refundablePercent = 0;
  if (policyType === "flexible") {
    if (leadHours >= 48) {
      refundablePercent = 1;
    } else if (leadHours >= 24) {
      refundablePercent = 0.5;
    } else {
      refundablePercent = 0;
    }
  } else if (policyType === "moderate") {
    if (leadHours >= 72) {
      refundablePercent = 0.75;
    } else if (leadHours >= 24) {
      refundablePercent = 0.3;
    } else {
      refundablePercent = 0;
    }
  } else if (policyType === "strict") {
    refundablePercent = leadHours >= 72 ? 0.5 : 0;
  }

  const baseRefund = Math.round(nonPickupPaid * refundablePercent);
  const pickupRefund =
    pickupRequested && leadHours >= 24 ? Math.round(pickupTotal || 0) : 0;
  const refundTotal = Math.min(totalPaid, baseRefund + pickupRefund);

  return {
    leadHours,
    refundablePercent,
    baseRefund,
    pickupRefund,
    refundTotal,
    rules: getRefundPolicyRules(policyType)
  };
}

module.exports = {
  calculateRefund,
  getRefundPolicyRules
};
