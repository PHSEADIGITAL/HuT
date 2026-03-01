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

export default function AdminHotelsScreen({ navigation }) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [hotels, setHotels] = useState([]);

  const loadHotels = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const payload = await apiRequest("/api/admin/hotels", {
          token
        });
        setHotels(payload.hotels || []);
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
    loadHotels();
  }, [loadHotels]);

  if (!user || (user.role !== "hotel_admin" && user.role !== "platform_admin")) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Only hotel admin or platform owner accounts can access this page.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHotels(true)} />}
    >
      <Text style={styles.title}>Admin Hotels</Text>
      <Text style={styles.subtitle}>Open a hotel dashboard to manage inventory and bookings.</Text>

      {loading ? (
        <ActivityIndicator color="#3665f3" />
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.ghostButton} onPress={() => loadHotels()}>
            <Text style={styles.ghostButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : hotels.length ? (
        hotels.map((hotel) => (
          <Pressable
            key={hotel.id}
            style={styles.card}
            onPress={() =>
              navigation.navigate("AdminHotelDashboard", {
                hotelId: hotel.id,
                hotelName: hotel.name
              })
            }
          >
            <Text style={styles.cardTitle}>{hotel.name}</Text>
            <Text style={styles.meta}>{hotel.location}</Text>
            <Text style={styles.meta}>Bookings: {hotel.bookingCount}</Text>
            <Text style={styles.meta}>Gross sales: {formatNaira(hotel.grossSales)}</Text>
            <Text style={styles.meta}>Commission: {(Number(hotel.commissionRate || 0) * 100).toFixed(2)}%</Text>
          </Pressable>
        ))
      ) : (
        <Text style={styles.meta}>No hotels found for this admin account.</Text>
      )}
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
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: "#0f1b2d"
  },
  subtitle: {
    color: "#5d6a83"
  },
  card: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    gap: 4
  },
  cardTitle: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 15
  },
  meta: {
    color: "#475569",
    fontSize: 13
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
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  error: {
    color: "#dc2626"
  }
});
