import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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

export default function AdminHotelDashboardScreen({ route }) {
  const { token, user } = useAuth();
  const { hotelId, hotelName } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [bookingReference, setBookingReference] = useState("");
  const [detail, setDetail] = useState(null);
  const [roomDrafts, setRoomDrafts] = useState({});
  const [savingRoomId, setSavingRoomId] = useState("");
  const [commissionInput, setCommissionInput] = useState("");
  const [savingCommission, setSavingCommission] = useState(false);

  const canAdjustCommission = user?.role === "platform_admin";

  const loadDashboard = useCallback(
    async (reference = "") => {
      setLoading(true);
      setError("");
      try {
        const query = reference ? `?bookingReference=${encodeURIComponent(reference)}` : "";
        const payload = await apiRequest(
          `/api/admin/hotels/${encodeURIComponent(hotelId)}/dashboard${query}`,
          {
            token
          }
        );
        setDetail(payload);
        setRoomDrafts((current) => {
          const next = { ...current };
          for (const room of payload.rooms || []) {
            if (!next[room.id]) {
              next[room.id] = {
                pricePerNight: String(room.pricePerNight || ""),
                totalUnits: String(room.totalUnits || "")
              };
            }
          }
          return next;
        });
        if (payload.hotel?.commissionRate !== undefined) {
          setCommissionInput((current) => current || String(Number(payload.hotel.commissionRate) * 100));
        }
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    [hotelId, token]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const availabilityByRoomId = useMemo(() => {
    const map = new Map();
    for (const row of detail?.availability || []) {
      map.set(row.roomId, row);
    }
    return map;
  }, [detail]);

  async function saveRoom(roomId) {
    const draft = roomDrafts[roomId];
    if (!draft) {
      return;
    }
    setSavingRoomId(roomId);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/admin/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(roomId)}`, {
        method: "POST",
        token,
        body: {
          pricePerNight: Number(draft.pricePerNight),
          totalUnits: Number(draft.totalUnits)
        }
      });
      setMessage("Room pricing and inventory updated.");
      await loadDashboard(bookingReference);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingRoomId("");
    }
  }

  async function saveCommission() {
    if (!canAdjustCommission) {
      return;
    }
    setSavingCommission(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/admin/hotels/${encodeURIComponent(hotelId)}/commission`, {
        method: "POST",
        token,
        body: {
          commissionRate: Number(commissionInput)
        }
      });
      setMessage("Commission updated successfully.");
      await loadDashboard(bookingReference);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingCommission(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{detail?.hotel?.name || hotelName || "Hotel Dashboard"}</Text>
      <Text style={styles.subtitle}>{detail?.hotel?.location || ""}</Text>

      {loading ? <ActivityIndicator color="#3665f3" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {detail ? (
        <>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Gross sales</Text>
              <Text style={styles.statValue}>{formatNaira(detail.summary?.grossSales || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Hotel receivables</Text>
              <Text style={styles.statValue}>{formatNaira(detail.summary?.hotelReceivables || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Platform commission</Text>
              <Text style={styles.statValue}>
                {formatNaira(detail.summary?.platformRevenue || 0)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Bookings</Text>
              <Text style={styles.statValue}>{detail.summary?.bookingCount || 0}</Text>
            </View>
          </View>

          {canAdjustCommission ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Commission control</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Commission (%)"
                value={commissionInput}
                onChangeText={setCommissionInput}
              />
              <Pressable
                style={styles.primaryButton}
                onPress={saveCommission}
                disabled={savingCommission}
              >
                <Text style={styles.primaryButtonText}>
                  {savingCommission ? "Saving..." : "Update commission"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Booking reference lookup</Text>
            <TextInput
              style={styles.input}
              placeholder="Booking reference"
              value={bookingReference}
              onChangeText={setBookingReference}
            />
            <View style={styles.rowWrap}>
              <Pressable style={styles.primaryButton} onPress={() => loadDashboard(bookingReference)}>
                <Text style={styles.primaryButtonText}>Search booking</Text>
              </Pressable>
              <Pressable
                style={styles.ghostButton}
                onPress={() => {
                  setBookingReference("");
                  loadDashboard("");
                }}
              >
                <Text style={styles.ghostButtonText}>Clear</Text>
              </Pressable>
            </View>
            {(detail.bookings || []).slice(0, 10).map((booking) => (
              <View key={booking.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>
                  {booking.referenceNumber || booking.id} • {booking.status}
                </Text>
                <Text style={styles.meta}>
                  {booking.customerName} • {booking.checkInDate} to {booking.checkOutDate}
                </Text>
                <Text style={styles.meta}>
                  {booking.paymentStatus} • {formatNaira(booking.pricing?.totalPaid || 0)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Room inventory + price</Text>
            {(detail.rooms || []).map((room) => {
              const availability = availabilityByRoomId.get(room.id);
              const draft = roomDrafts[room.id] || {
                pricePerNight: String(room.pricePerNight || ""),
                totalUnits: String(room.totalUnits || "")
              };
              return (
                <View key={room.id} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>{room.category}</Text>
                  <Text style={styles.meta}>
                    Available: {availability?.availableUnits ?? 0} / {availability?.totalUnits ?? room.totalUnits}
                  </Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="Price per night"
                    value={draft.pricePerNight}
                    onChangeText={(value) =>
                      setRoomDrafts((current) => ({
                        ...current,
                        [room.id]: {
                          ...draft,
                          pricePerNight: value
                        }
                      }))
                    }
                  />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="Total units"
                    value={draft.totalUnits}
                    onChangeText={(value) =>
                      setRoomDrafts((current) => ({
                        ...current,
                        [room.id]: {
                          ...draft,
                          totalUnits: value
                        }
                      }))
                    }
                  />
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => saveRoom(room.id)}
                    disabled={savingRoomId === room.id}
                  >
                    <Text style={styles.primaryButtonText}>
                      {savingRoomId === room.id ? "Saving..." : "Save room changes"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
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
    gap: 12
  },
  title: {
    fontSize: 25,
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
    marginTop: 6,
    color: "#111827",
    fontWeight: "800"
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
    fontWeight: "800",
    fontSize: 15
  },
  input: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#fff"
  },
  rowWrap: {
    flexDirection: "row",
    gap: 8
  },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#3665f3",
    paddingVertical: 11,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  ghostButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    backgroundColor: "#fff",
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  ghostButtonText: {
    color: "#1f2937",
    fontWeight: "700"
  },
  rowCard: {
    borderWidth: 1,
    borderColor: "#e5eaf6",
    borderRadius: 8,
    padding: 8,
    gap: 6
  },
  rowTitle: {
    color: "#111827",
    fontWeight: "700"
  },
  meta: {
    color: "#5d6a83",
    fontSize: 12
  },
  error: {
    color: "#dc2626"
  },
  success: {
    color: "#059669"
  }
});
