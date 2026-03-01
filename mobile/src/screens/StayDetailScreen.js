import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { apiRequest } from "../api/client";

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

export default function StayDetailScreen({ route }) {
  const { hotelId, checkInDate, checkOutDate } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    async function loadDetail() {
      setLoading(true);
      setError("");
      try {
        const queryParts = [];
        if (checkInDate) {
          queryParts.push(`checkInDate=${encodeURIComponent(checkInDate)}`);
        }
        if (checkOutDate) {
          queryParts.push(`checkOutDate=${encodeURIComponent(checkOutDate)}`);
        }
        const queryString = queryParts.length ? `?${queryParts.join("&")}` : "";
        const payload = await apiRequest(
          `/api/stays/${encodeURIComponent(hotelId)}${queryString}`
        );
        setDetail(payload);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [hotelId, checkInDate, checkOutDate]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3665f3" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || "Unable to load hotel details."}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Image source={{ uri: detail.hotel.coverImage }} style={styles.heroImage} />
      <Text style={styles.title}>{detail.hotel.name}</Text>
      <Text style={styles.meta}>
        {detail.hotel.propertyType} • {detail.hotel.location}
      </Text>
      <Text style={styles.meta}>
        {detail.hotel.reviewLabel} {detail.hotel.reviewScore}/10 ({detail.hotel.reviewCount} reviews)
      </Text>
      <Text style={styles.price}>Now {formatNaira(detail.hotel.minPrice)} / night</Text>
      <Text style={styles.description}>{detail.hotel.about || detail.hotel.description}</Text>

      <Text style={styles.sectionTitle}>Available Rooms</Text>
      {detail.rooms.map((room) => (
        <View key={room.id} style={styles.roomCard}>
          <Text style={styles.roomTitle}>{room.category}</Text>
          <Text style={styles.meta}>
            {room.sleeps} guests • {room.bedType}
          </Text>
          <Text style={styles.meta}>
            {room.availability?.availableUnits ?? 0} of {room.totalUnits} rooms available
          </Text>
          <Text style={styles.roomPrice}>{formatNaira(room.pricePerNight)} per night</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff"
  },
  content: {
    paddingBottom: 24
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
  heroImage: {
    width: "100%",
    height: 220
  },
  title: {
    marginTop: 14,
    paddingHorizontal: 14,
    fontSize: 24,
    fontWeight: "800",
    color: "#0f1b2d"
  },
  meta: {
    paddingHorizontal: 14,
    marginTop: 4,
    color: "#5d6a83",
    fontSize: 13
  },
  price: {
    paddingHorizontal: 14,
    marginTop: 10,
    color: "#0d2d62",
    fontWeight: "700",
    fontSize: 18
  },
  description: {
    paddingHorizontal: 14,
    marginTop: 10,
    color: "#334155",
    lineHeight: 20
  },
  sectionTitle: {
    marginTop: 16,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: "700",
    color: "#0f1b2d"
  },
  roomCard: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    padding: 10,
    backgroundColor: "#f8fbff"
  },
  roomTitle: {
    fontWeight: "700",
    color: "#1f2937"
  },
  roomPrice: {
    marginTop: 6,
    color: "#0d2d62",
    fontWeight: "700"
  }
});
