function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

module.exports = {
  formatNaira,
  formatPercent
};
