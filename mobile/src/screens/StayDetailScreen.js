import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

function ratingChoices() {
  return [1, 2, 3, 4, 5];
}

function toIsoDate(value, fallback) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return fallback;
}

export default function StayDetailScreen({ route }) {
  const { hotelId, checkInDate, checkOutDate } = route.params || {};
  const { token, user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [bookingForm, setBookingForm] = useState({
    checkInDate: checkInDate || "",
    checkOutDate: checkOutDate || "",
    guests: "1",
    emergencyContactName: "",
    emergencyContactPhone: "",
    pickupRequested: false,
    specialRequest: ""
  });
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");

  const loadDetail = useCallback(async () => {
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
      const payload = await apiRequest(`/api/stays/${encodeURIComponent(hotelId)}${queryString}`, {
        token: isAuthenticated ? token : ""
      });
      setDetail(payload);
      if (Array.isArray(payload.rooms) && payload.rooms.length) {
        setSelectedRoomId((current) => current || payload.rooms[0].id);
      }
      setBookingForm((current) => ({
        ...current,
        checkInDate: toIsoDate(current.checkInDate, payload.checkInDate || ""),
        checkOutDate: toIsoDate(current.checkOutDate, payload.checkOutDate || ""),
        emergencyContactName: current.emergencyContactName || user?.name || "",
        emergencyContactPhone: current.emergencyContactPhone || user?.phone || ""
      }));
      if (payload.userReview) {
        setReviewRating(payload.userReview.rating || 5);
        setReviewComment(payload.userReview.comment || "");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [checkInDate, checkOutDate, hotelId, isAuthenticated, token, user]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const selectedRoom = useMemo(() => {
    if (!detail || !Array.isArray(detail.rooms)) {
      return null;
    }
    return detail.rooms.find((room) => room.id === selectedRoomId) || detail.rooms[0] || null;
  }, [detail, selectedRoomId]);

  const stayNights = useMemo(() => {
    const start = new Date(`${bookingForm.checkInDate}T00:00:00.000Z`).getTime();
    const end = new Date(`${bookingForm.checkOutDate}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return 0;
    }
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }, [bookingForm.checkInDate, bookingForm.checkOutDate]);

  const roomSubtotalEstimate = useMemo(() => {
    if (!selectedRoom || !stayNights) {
      return 0;
    }
    return Number(selectedRoom.pricePerNight || 0) * stayNights;
  }, [selectedRoom, stayNights]);

  async function submitBooking() {
    if (!isAuthenticated) {
      setBookingError("Sign in to continue booking.");
      return;
    }
    if (!selectedRoom) {
      setBookingError("Select a room category to continue.");
      return;
    }
    if (
      !bookingForm.checkInDate ||
      !bookingForm.checkOutDate ||
      !bookingForm.emergencyContactName ||
      !bookingForm.emergencyContactPhone
    ) {
      setBookingError("Complete check-in/out and emergency contact fields.");
      return;
    }

    setBookingBusy(true);
    setBookingError("");
    setBookingMessage("");
    try {
      const payload = await apiRequest("/api/bookings", {
        method: "POST",
        token,
        body: {
          hotelId,
          roomId: selectedRoom.id,
          checkInDate: bookingForm.checkInDate,
          checkOutDate: bookingForm.checkOutDate,
          guests: Number(bookingForm.guests || 1),
          emergencyContactName: bookingForm.emergencyContactName,
          emergencyContactPhone: bookingForm.emergencyContactPhone,
          pickupRequested: Boolean(bookingForm.pickupRequested),
          specialRequest: bookingForm.specialRequest
        }
      });

      const status = payload.checkout?.status || payload.booking?.paymentStatus || "pending";
      if (payload.checkout?.paymentUrl) {
        setBookingMessage(
          "Booking created. Continue payment in provider page, then refresh in My Account."
        );
        try {
          await Linking.openURL(payload.checkout.paymentUrl);
        } catch (_error) {
          setBookingMessage(
            `Booking created. Open payment URL manually: ${payload.checkout.paymentUrl}`
          );
        }
      } else if (status === "paid" || payload.booking?.paymentStatus === "paid") {
        setBookingMessage(
          `Booking confirmed. Reference: ${payload.booking?.referenceNumber || payload.booking?.id}`
        );
      } else {
        setBookingMessage("Booking created. Payment is pending verification.");
      }
    } catch (requestError) {
      setBookingError(requestError.message);
    } finally {
      setBookingBusy(false);
    }
  }

  async function submitHotelReview() {
    if (!isAuthenticated) {
      setReviewError("Sign in to submit a review.");
      return;
    }
    if (!reviewComment.trim()) {
      setReviewError("Enter your review comment.");
      return;
    }
    setReviewBusy(true);
    setReviewError("");
    setReviewMessage("");
    try {
      await apiRequest(`/api/hotels/${encodeURIComponent(hotelId)}/reviews`, {
        method: "POST",
        token,
        body: {
          rating: reviewRating,
          comment: reviewComment.trim()
        }
      });
      setReviewMessage("Review submitted successfully.");
      await loadDetail();
    } catch (requestError) {
      setReviewError(requestError.message);
    } finally {
      setReviewBusy(false);
    }
  }

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

      <Text style={styles.sectionTitle}>Room categories</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, styles.tableColCategory]}>Category</Text>
        <Text style={[styles.tableHeaderCell, styles.tableColPrice]}>Price/Night</Text>
        <Text style={[styles.tableHeaderCell, styles.tableColUnits]}>Total</Text>
        <Text style={[styles.tableHeaderCell, styles.tableColUnits]}>Available</Text>
      </View>
      {detail.rooms.map((room) => (
        <Pressable
          key={room.id}
          style={[
            styles.roomCard,
            selectedRoom?.id === room.id && styles.roomCardSelected
          ]}
          onPress={() => setSelectedRoomId(room.id)}
        >
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.tableColCategory]}>{room.category}</Text>
            <Text style={[styles.tableCell, styles.tableColPrice]}>{formatNaira(room.pricePerNight)}</Text>
            <Text style={[styles.tableCell, styles.tableColUnits]}>{room.totalUnits}</Text>
            <Text style={[styles.tableCell, styles.tableColUnits]}>
              {room.availability?.availableUnits ?? 0}
            </Text>
          </View>
          <Text style={styles.meta}>
            {room.sleeps} guests • {room.bedType}
          </Text>
        </Pressable>
      ))}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Book this stay</Text>
        {!isAuthenticated ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>Sign in as a customer to book this hotel.</Text>
            <Pressable style={styles.primaryButton} onPress={() => navigation.navigate("Login")}>
              <Text style={styles.primaryButtonText}>Sign in to book</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={styles.meta}>
          Customer:{" "}
          <Text style={styles.strongText}>
            {user?.name || "Unknown"} ({user?.email || "No email"}) {user?.phone ? `• ${user.phone}` : ""}
          </Text>
        </Text>
        <Text style={styles.meta}>
          Selected room:{" "}
          <Text style={styles.strongText}>{selectedRoom?.category || "None selected"}</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Check-in (YYYY-MM-DD)"
          value={bookingForm.checkInDate}
          onChangeText={(value) =>
            setBookingForm((current) => ({
              ...current,
              checkInDate: value
            }))
          }
        />
        <TextInput
          style={styles.input}
          placeholder="Check-out (YYYY-MM-DD)"
          value={bookingForm.checkOutDate}
          onChangeText={(value) =>
            setBookingForm((current) => ({
              ...current,
              checkOutDate: value
            }))
          }
        />
        <TextInput
          style={styles.input}
          placeholder="Guests"
          keyboardType="numeric"
          value={bookingForm.guests}
          onChangeText={(value) =>
            setBookingForm((current) => ({
              ...current,
              guests: value
            }))
          }
        />
        <TextInput
          style={styles.input}
          placeholder="Emergency contact name"
          value={bookingForm.emergencyContactName}
          onChangeText={(value) =>
            setBookingForm((current) => ({
              ...current,
              emergencyContactName: value
            }))
          }
        />
        <TextInput
          style={styles.input}
          placeholder="Emergency contact phone"
          keyboardType="phone-pad"
          value={bookingForm.emergencyContactPhone}
          onChangeText={(value) =>
            setBookingForm((current) => ({
              ...current,
              emergencyContactPhone: value
            }))
          }
        />
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Special request (optional)"
          multiline
          numberOfLines={3}
          value={bookingForm.specialRequest}
          onChangeText={(value) =>
            setBookingForm((current) => ({
              ...current,
              specialRequest: value
            }))
          }
        />
        <View style={styles.switchRow}>
          <Text style={styles.meta}>Request pickup service</Text>
          <Switch
            value={Boolean(bookingForm.pickupRequested)}
            onValueChange={(value) =>
              setBookingForm((current) => ({
                ...current,
                pickupRequested: value
              }))
            }
          />
        </View>
        <View style={styles.priceSummaryBox}>
          <Text style={styles.summaryLine}>
            Stay nights: <Text style={styles.strongText}>{stayNights || "-"}</Text>
          </Text>
          <Text style={styles.summaryLine}>
            Room subtotal (estimate):{" "}
            <Text style={styles.strongText}>{formatNaira(roomSubtotalEstimate)}</Text>
          </Text>
          <Text style={styles.summaryHint}>
            Note: final total = room + service charge (% commission model) + pickup (if selected).
          </Text>
        </View>
        {bookingError ? <Text style={styles.errorInline}>{bookingError}</Text> : null}
        {bookingMessage ? <Text style={styles.successInline}>{bookingMessage}</Text> : null}
        <Pressable
          style={[styles.primaryButton, !isAuthenticated && styles.primaryButtonDisabled]}
          onPress={submitBooking}
          disabled={bookingBusy || !isAuthenticated}
        >
          <Text style={styles.primaryButtonText}>
            {bookingBusy ? "Booking..." : "Book now"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Cancellation summary</Text>
        <Text style={styles.policyBullet}>• 100% refund if cancelled 48+ hours before check-in</Text>
        <Text style={styles.policyBullet}>• 50% refund if cancelled 24-48 hours before check-in</Text>
        <Text style={styles.policyBullet}>• No refund if cancelled less than 24 hours before check-in</Text>
        <Text style={styles.policyBullet}>• Pickup add-on refundable only when cancelled 24+ hours earlier</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Guest reviews</Text>
        {(detail.reviews || []).length ? (
          (detail.reviews || []).slice(0, 6).map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <Text style={styles.reviewHeader}>
                {review.reviewerName} • {review.rating}/5
              </Text>
              <Text style={styles.reviewComment}>{review.comment}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>No reviews yet for this stay.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Leave your review</Text>
        {!isAuthenticated ? (
          <Text style={styles.meta}>Sign in to submit your stay review.</Text>
        ) : (
          <>
            <View style={styles.ratingRow}>
              {ratingChoices().map((rating) => (
                <Pressable
                  key={rating}
                  style={[
                    styles.ratingChip,
                    reviewRating === rating && styles.ratingChipActive
                  ]}
                  onPress={() => setReviewRating(rating)}
                >
                  <Text
                    style={[
                      styles.ratingChipText,
                      reviewRating === rating && styles.ratingChipTextActive
                    ]}
                  >
                    {rating}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Share your experience"
              multiline
              numberOfLines={4}
              value={reviewComment}
              onChangeText={setReviewComment}
            />
            {reviewError ? <Text style={styles.errorInline}>{reviewError}</Text> : null}
            {reviewMessage ? <Text style={styles.successInline}>{reviewMessage}</Text> : null}
            <Pressable
              style={styles.primaryButton}
              onPress={submitHotelReview}
              disabled={reviewBusy}
            >
              <Text style={styles.primaryButtonText}>
                {reviewBusy ? "Submitting..." : "Submit review"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
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
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    padding: 10,
    backgroundColor: "#f8fbff",
    gap: 6
  },
  roomCardSelected: {
    borderColor: "#3665f3",
    backgroundColor: "#eef3ff"
  },
  tableHeader: {
    marginTop: 10,
    marginHorizontal: 14,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: "#eaf0fb"
  },
  tableHeaderCell: {
    color: "#1e293b",
    fontSize: 11,
    fontWeight: "800"
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  tableCell: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700"
  },
  tableColCategory: {
    flex: 1.4
  },
  tableColPrice: {
    flex: 1.1
  },
  tableColUnits: {
    flex: 0.7
  },
  roomTitle: {
    fontWeight: "700",
    color: "#1f2937"
  },
  roomPrice: {
    marginTop: 6,
    color: "#0d2d62",
    fontWeight: "700"
  },
  panel: {
    marginTop: 14,
    marginHorizontal: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    gap: 8
  },
  panelTitle: {
    fontWeight: "800",
    color: "#111827",
    fontSize: 15
  },
  strongText: {
    fontWeight: "700",
    color: "#111827"
  },
  input: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#fff"
  },
  textarea: {
    minHeight: 86,
    textAlignVertical: "top"
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#3665f3",
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  primaryButtonDisabled: {
    opacity: 0.6
  },
  noticeCard: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    gap: 6
  },
  noticeText: {
    color: "#334155",
    fontSize: 13
  },
  priceSummaryBox: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    padding: 8,
    gap: 4
  },
  summaryLine: {
    color: "#334155",
    fontSize: 13
  },
  summaryHint: {
    color: "#475569",
    fontSize: 12
  },
  errorInline: {
    color: "#dc2626"
  },
  successInline: {
    color: "#059669"
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fbff"
  },
  reviewHeader: {
    color: "#1f2937",
    fontWeight: "700",
    fontSize: 13
  },
  reviewComment: {
    color: "#475569",
    marginTop: 4,
    fontSize: 13
  },
  policyBullet: {
    color: "#334155",
    fontSize: 13
  },
  ratingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  ratingChip: {
    minWidth: 40,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    alignItems: "center"
  },
  ratingChipActive: {
    backgroundColor: "#3665f3",
    borderColor: "#3665f3"
  },
  ratingChipText: {
    color: "#1f2937",
    fontWeight: "700"
  },
  ratingChipTextActive: {
    color: "#fff"
  }
});
