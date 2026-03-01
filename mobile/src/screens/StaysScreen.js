import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

function isoDateOffset(daysFromToday) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

const SUPPORT_WHATSAPP = "2348030001122";

export default function StaysScreen({ navigation }) {
  const { user } = useAuth();
  const [destination, setDestination] = useState("Bonny Island");
  const [checkInDate, setCheckInDate] = useState(isoDateOffset(1));
  const [checkOutDate, setCheckOutDate] = useState(isoDateOffset(2));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchState, setSearchState] = useState(null);
  const [hotels, setHotels] = useState([]);

  const loadHotels = useCallback(
    async (params = {}, isRefresh = false) => {
      const nextDestination = params.destination || destination || "Bonny Island";
      const nextCheckIn = params.checkInDate || checkInDate;
      const nextCheckOut = params.checkOutDate || checkOutDate;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const query = [
          `destination=${encodeURIComponent(nextDestination)}`,
          `checkInDate=${encodeURIComponent(nextCheckIn)}`,
          `checkOutDate=${encodeURIComponent(nextCheckOut)}`
        ].join("&");
        const payload = await apiRequest(`/api/stays?${query}`);
        setHotels(payload.hotels || []);
        setSearchState(payload.search || null);
        if (payload.search?.destination) {
          setDestination(payload.search.destination);
        }
        if (payload.search?.checkInDate) {
          setCheckInDate(payload.search.checkInDate);
        }
        if (payload.search?.checkOutDate) {
          setCheckOutDate(payload.search.checkOutDate);
        }
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [checkInDate, checkOutDate, destination]
  );

  useEffect(() => {
    loadHotels(
      {
        destination: "Bonny Island",
        checkInDate: isoDateOffset(1),
        checkOutDate: isoDateOffset(2)
      },
      false
    );
  }, [loadHotels]);

  const canSeeAdmin = user?.role === "hotel_admin" || user?.role === "platform_admin";
  const canSeeOnboardHotel = user?.role === "platform_admin";
  const resultCount = useMemo(() => hotels.length, [hotels.length]);

  async function openWhatsAppSupport() {
    try {
      await Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`);
    } catch (_error) {
      setError("Unable to open WhatsApp support right now.");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.brand}>HuT!</Text>
        <View style={styles.topActions}>
          <Pressable style={[styles.navChip, styles.navChipActive]}>
            <Text style={[styles.navChipText, styles.navChipTextActive]}>Hotels</Text>
          </Pressable>
          {canSeeAdmin ? (
            <Pressable style={styles.navChip} onPress={() => navigation.navigate("AdminHotels")}>
              <Text style={styles.navChipText}>Hotel Admin</Text>
            </Pressable>
          ) : null}
          {canSeeOnboardHotel ? (
            <Pressable style={styles.navChip} onPress={() => navigation.navigate("OwnerDashboard")}>
              <Text style={styles.navChipText}>Onboard Hotel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.title}>Book trusted hotels in Bonny Island</Text>
        <Text style={styles.subtitle}>Real-time availability, clear pricing, and secure checkout.</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={destination}
            placeholder="Destination"
            onChangeText={setDestination}
          />
          <TextInput
            style={styles.searchInput}
            value={checkInDate}
            placeholder="Check-in (YYYY-MM-DD)"
            onChangeText={setCheckInDate}
          />
          <TextInput
            style={styles.searchInput}
            value={checkOutDate}
            placeholder="Check-out (YYYY-MM-DD)"
            onChangeText={setCheckOutDate}
          />
          <Pressable
            style={styles.searchButton}
            onPress={() =>
              loadHotels({
                destination,
                checkInDate,
                checkOutDate
              })
            }
          >
            <Text style={styles.searchButtonText}>Update availability</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3665f3" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() =>
              loadHotels({
                destination,
                checkInDate,
                checkOutDate
              })
            }
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={hotels}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                loadHotels(
                  {
                    destination,
                    checkInDate,
                    checkOutDate
                  },
                  true
                )
              }
            />
          }
          ListHeaderComponent={
            <Text style={styles.resultSummary}>
              {resultCount} hotel{resultCount === 1 ? "" : "s"} available
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                navigation.navigate("StayDetail", {
                  hotelId: item.id,
                  checkInDate: searchState?.checkInDate || checkInDate,
                  checkOutDate: searchState?.checkOutDate || checkOutDate
                })
              }
            >
              {item.premiumListingActive ? (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>Premium Badge</Text>
                </View>
              ) : null}
              <Image source={{ uri: item.coverImage }} style={styles.image} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.location}
                </Text>
                <Text style={styles.meta}>
                  Now {formatNaira(item.minPrice)}/night • {item.roomsAvailable} rooms available
                </Text>
                <View style={styles.cardButton}>
                  <Text style={styles.cardButtonText}>View rooms and book</Text>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.meta}>No stays found for this destination.</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable style={styles.whatsAppFab} onPress={openWhatsAppSupport}>
        <Text style={styles.whatsAppFabText}>WhatsApp Support</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f8fc",
    paddingHorizontal: 14,
    paddingTop: 10
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  brand: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a"
  },
  topActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end"
  },
  navChip: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  navChipActive: {
    borderColor: "#0f172a",
    backgroundColor: "#0f172a"
  },
  navChipText: {
    fontSize: 12,
    color: "#1f2937",
    fontWeight: "700"
  },
  navChipTextActive: {
    color: "#fff"
  },
  heroCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#dce5f3",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f1b2d"
  },
  subtitle: {
    marginTop: 2,
    color: "#5d6a83"
  },
  searchRow: {
    marginTop: 4,
    gap: 8
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  searchButton: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center"
  },
  searchButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  resultSummary: {
    marginVertical: 10,
    color: "#334155",
    fontWeight: "600",
    fontSize: 13
  },
  listContent: {
    paddingBottom: 88
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    position: "relative"
  },
  premiumBadge: {
    position: "absolute",
    zIndex: 2,
    top: 10,
    left: 10,
    borderRadius: 999,
    backgroundColor: "#f59e0b",
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  premiumBadgeText: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "800"
  },
  image: {
    width: "100%",
    height: 160
  },
  cardBody: {
    padding: 10
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827"
  },
  meta: {
    marginTop: 4,
    color: "#5d6a83",
    fontSize: 12
  },
  cardButton: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: "#111827",
    alignItems: "center",
    paddingVertical: 10
  },
  cardButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  error: {
    color: "#dc2626",
    textAlign: "center"
  },
  retryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  retryButtonText: {
    color: "#1f2937",
    fontWeight: "700"
  },
  whatsAppFab: {
    position: "absolute",
    right: 14,
    bottom: 14,
    borderRadius: 999,
    backgroundColor: "#10b981",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#047857"
  },
  whatsAppFabText: {
    color: "#052e16",
    fontWeight: "800",
    fontSize: 12
  }
});
