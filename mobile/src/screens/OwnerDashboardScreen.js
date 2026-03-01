import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

export default function OwnerDashboardScreen() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);

  const loadDashboard = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const payload = await apiRequest("/api/admin/owner-dashboard", {
          token
        });
        setDashboard(payload);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (!user || user.role !== "platform_admin") {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Only platform owner accounts can access this screen.</Text>
      </View>
    );
  }

  const summary = dashboard?.summary || {};
  const paymentRows = dashboard?.paymentRows || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} />}
    >
      <Text style={styles.title}>Platform Owner Dashboard</Text>
      <Text style={styles.subtitle}>Revenue, commissions, and transaction flow in one place.</Text>

      {loading ? <ActivityIndicator color="#3665f3" /> : null}
      {error ? (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.ghostButton} onPress={() => loadDashboard()}>
            <Text style={styles.ghostButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {dashboard ? (
        <>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Payment records</Text>
              <Text style={styles.statValue}>{summary.paymentCount || 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Hotel transactions</Text>
              <Text style={styles.statValue}>{summary.hotelTransactionCount || 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Gross hotel volume</Text>
              <Text style={styles.statValue}>{formatNaira(summary.grossHotelVolume || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Hotel payouts</Text>
              <Text style={styles.statValue}>{formatNaira(summary.totalHotelPayouts || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Booking commissions</Text>
              <Text style={styles.statValue}>{formatNaira(summary.commissionRevenue || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Premium subscriptions</Text>
              <Text style={styles.statValue}>{formatNaira(summary.premiumRevenue || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Marketplace contacts</Text>
              <Text style={styles.statValue}>{formatNaira(summary.marketplaceRevenue || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Marketplace plans</Text>
              <Text style={styles.statValue}>{formatNaira(summary.marketplacePlanRevenue || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Net platform revenue</Text>
              <Text style={styles.statValue}>{formatNaira(summary.netPlatformRevenue || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Wallet liability</Text>
              <Text style={styles.statValue}>{formatNaira(summary.walletLiability || 0)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Transactions</Text>
            {paymentRows.slice(0, 20).map((row) => (
              <View key={row.id} style={styles.row}>
                <Text style={styles.rowTitle}>{row.transactionType}</Text>
                <Text style={styles.meta}>
                  {row.hotelName} • {row.userName}
                </Text>
                <Text style={styles.meta}>
                  {row.transactionRef} • {row.paymentProvider || "-"}
                </Text>
                <Text style={styles.rowAmount}>{formatNaira(row.grossAmount || 0)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f5ff"
  },
  content: {
    padding: 16,
    gap: 10
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: "#0f1b2d"
  },
  subtitle: {
    color: "#5d6a83"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statCard: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 10
  },
  statLabel: {
    color: "#5d6a83",
    fontSize: 12
  },
  statValue: {
    marginTop: 5,
    color: "#111827",
    fontWeight: "800",
    fontSize: 13
  },
  card: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 12,
    gap: 8
  },
  cardTitle: {
    color: "#111827",
    fontWeight: "800"
  },
  row: {
    borderTopWidth: 1,
    borderColor: "#eef2ff",
    paddingTop: 8
  },
  rowTitle: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13
  },
  rowAmount: {
    marginTop: 3,
    color: "#0d2d62",
    fontWeight: "700",
    fontSize: 13
  },
  meta: {
    marginTop: 2,
    color: "#5d6a83",
    fontSize: 12
  },
  error: {
    color: "#dc2626"
  },
  ghostButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    backgroundColor: "#fff",
    paddingVertical: 10,
    alignItems: "center"
  },
  ghostButtonText: {
    color: "#1f2937",
    fontWeight: "700"
  }
});
