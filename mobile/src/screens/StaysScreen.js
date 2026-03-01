import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { apiRequest } from "../api/client";

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

export default function StaysScreen({ navigation }) {
  const [destination, setDestination] = useState("Bonny Island");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchState, setSearchState] = useState(null);
  const [hotels, setHotels] = useState([]);

  const loadHotels = useCallback(async (destinationValue, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const payload = await apiRequest(
        `/api/stays?destination=${encodeURIComponent(destinationValue || "Bonny Island")}`
      );
      setHotels(payload.hotels || []);
      setSearchState(payload.search || null);
      if (payload.search?.destination) {
        setDestination(payload.search.destination);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHotels("Bonny Island");
  }, [loadHotels]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stays</Text>
      <Text style={styles.subtitle}>Find available hotels and compare rates.</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={destination}
          placeholder="Destination"
          onChangeText={setDestination}
        />
        <Pressable style={styles.searchButton} onPress={() => loadHotels(destination)}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3665f3" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadHotels(destination)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={hotels}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadHotels(destination, true)} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                navigation.navigate("StayDetail", {
                  hotelId: item.id,
                  checkInDate: searchState?.checkInDate,
                  checkOutDate: searchState?.checkOutDate
                })
              }
            >
              <Image source={{ uri: item.coverImage }} style={styles.image} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.propertyType} • {item.location}
                </Text>
                <Text style={styles.meta}>
                  {item.reviewLabel} {item.reviewScore}/10 ({item.reviewCount} reviews)
                </Text>
                <Text style={styles.price}>Now {formatNaira(item.minPrice)}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f5ff",
    paddingHorizontal: 14,
    paddingTop: 10
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: "#0f1b2d"
  },
  subtitle: {
    marginTop: 4,
    color: "#5d6a83"
  },
  searchRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10
  },
  searchButton: {
    backgroundColor: "#3665f3",
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  searchButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 18
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#d6e1f2"
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
  price: {
    marginTop: 8,
    color: "#0d2d62",
    fontSize: 16,
    fontWeight: "700"
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
  }
});
