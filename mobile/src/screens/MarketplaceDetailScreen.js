import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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

export default function MarketplaceDetailScreen({ navigation, route }) {
  const { listingId } = route.params || {};
  const { token, user, isAuthenticated, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiRequest(`/api/marketplace/listings/${encodeURIComponent(listingId)}`, {
        token: isAuthenticated ? token : ""
      });
      setDetail(payload);
      if (payload.userSellerReview) {
        setReviewRating(payload.userSellerReview.rating || 5);
        setReviewComment(payload.userSellerReview.comment || "");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, listingId, token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function activateContactSubscription() {
    if (!isAuthenticated) {
      navigation.navigate("Login");
      return;
    }
    setSubmitting(true);
    setSuccess("");
    setError("");
    try {
      await apiRequest("/api/marketplace/contact-subscription/purchase", {
        method: "POST",
        token,
        body: {
          autoRenew: true
        }
      });
      await refreshProfile();
      await loadDetail();
      setSuccess("Contact subscription activated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function unlockContact() {
    if (!isAuthenticated) {
      navigation.navigate("Login");
      return;
    }
    setSubmitting(true);
    setSuccess("");
    setError("");
    try {
      await apiRequest(`/api/marketplace/listings/${encodeURIComponent(listingId)}/unlock-contact`, {
        method: "POST",
        token
      });
      await loadDetail();
      setSuccess("Seller contact unlocked successfully.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSellerReview() {
    if (!isAuthenticated) {
      navigation.navigate("Login");
      return;
    }
    const sellerUserId = detail?.listing?.sellerUserId;
    if (!sellerUserId) {
      setReviewError("Seller profile could not be loaded.");
      return;
    }
    if (!reviewComment.trim()) {
      setReviewError("Write a review comment before submitting.");
      return;
    }
    setReviewBusy(true);
    setReviewError("");
    setReviewMessage("");
    try {
      await apiRequest(`/api/marketplace/sellers/${encodeURIComponent(sellerUserId)}/reviews`, {
        method: "POST",
        token,
        body: {
          rating: reviewRating,
          comment: reviewComment.trim()
        }
      });
      setReviewMessage("Seller review submitted.");
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

  if (error && !detail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Listing not found.</Text>
      </View>
    );
  }

  const listing = detail.listing;
  const canViewContact = Boolean(detail.permissions?.canViewContact);
  const canUnlockWithSubscription = Boolean(detail.permissions?.canUnlockWithSubscription);
  const canUnlock = Boolean(detail.permissions?.canUnlock);
  const isBuyer = user?.marketplaceAccountType === "buyer";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Image source={{ uri: listing.primaryImage }} style={styles.heroImage} />
      <Text style={styles.title}>{listing.title}</Text>
      <Text style={styles.meta}>
        {listing.category} • {listing.condition}
      </Text>
      <Text style={styles.meta}>
        {listing.location}
        {listing.neighborhood ? ` • ${listing.neighborhood}` : ""}
      </Text>
      <Text style={styles.price}>Now {formatNaira(listing.price)}</Text>
      <Text style={styles.description}>{listing.description}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Seller</Text>
        <Text style={styles.metaText}>{listing.sellerName}</Text>
        <Text style={styles.metaText}>
          Rating:{" "}
          {listing.sellerRating?.count
            ? `${listing.sellerRating.average}/5 (${listing.sellerRating.count})`
            : "No ratings yet"}
        </Text>
        <Text style={styles.metaText}>
          Contact:{" "}
          <Text style={styles.contactText}>
            {canViewContact ? listing.sellerPhone || "Unavailable" : listing.sellerPhoneMasked}
          </Text>
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Seller reviews</Text>
        {(detail.sellerReviews || []).length ? (
          (detail.sellerReviews || []).slice(0, 6).map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <Text style={styles.reviewHeader}>
                {review.reviewerName} • {review.rating}/5
              </Text>
              <Text style={styles.reviewComment}>{review.comment}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.metaText}>No reviews yet for this seller.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leave seller review</Text>
        {!isAuthenticated ? (
          <Text style={styles.metaText}>Sign in to review this seller.</Text>
        ) : (
          <>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <Pressable
                  key={rating}
                  style={[styles.ratingChip, reviewRating === rating && styles.ratingChipActive]}
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
              style={[styles.textInput, styles.textarea]}
              multiline
              numberOfLines={4}
              placeholder="How was your experience with this seller?"
              value={reviewComment}
              onChangeText={setReviewComment}
            />
            {reviewError ? <Text style={styles.error}>{reviewError}</Text> : null}
            {reviewMessage ? <Text style={styles.success}>{reviewMessage}</Text> : null}
            <Pressable
              style={styles.primaryButton}
              onPress={submitSellerReview}
              disabled={reviewBusy}
            >
              <Text style={styles.primaryButtonText}>
                {reviewBusy ? "Submitting..." : "Submit seller review"}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {success ? <Text style={styles.success}>{success}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!isAuthenticated ? (
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.primaryButtonText}>Sign in to unlock contact</Text>
        </Pressable>
      ) : canUnlockWithSubscription ? (
        <Pressable style={styles.primaryButton} onPress={unlockContact} disabled={submitting}>
          <Text style={styles.primaryButtonText}>
            {submitting ? "Unlocking..." : "Unlock Seller Contact"}
          </Text>
        </Pressable>
      ) : canUnlock && isBuyer ? (
        <Pressable
          style={styles.primaryButton}
          onPress={activateContactSubscription}
          disabled={submitting}
        >
          <Text style={styles.primaryButtonText}>
            {submitting
              ? "Activating..."
              : `Activate Contact Access (${formatNaira(
                  detail.marketplaceContactSubscriptionFeeNaira || 500
                )}/month)`}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            Buyer accounts can unlock seller contact details. Seller accounts can publish listings.
          </Text>
        </View>
      )}
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
  heroImage: {
    width: "100%",
    height: 230
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
    marginTop: 8,
    fontSize: 18,
    fontWeight: "700",
    color: "#0d2d62"
  },
  description: {
    paddingHorizontal: 14,
    marginTop: 10,
    color: "#334155",
    lineHeight: 20
  },
  section: {
    marginTop: 14,
    marginHorizontal: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#f8fbff",
    gap: 2
  },
  sectionTitle: {
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 2
  },
  metaText: {
    color: "#475569",
    fontSize: 13
  },
  contactText: {
    fontWeight: "700",
    color: "#0f1b2d"
  },
  success: {
    color: "#059669",
    marginTop: 10,
    marginHorizontal: 14
  },
  error: {
    color: "#dc2626",
    marginTop: 10,
    marginHorizontal: 14
  },
  primaryButton: {
    marginTop: 14,
    marginHorizontal: 14,
    borderRadius: 10,
    paddingVertical: 13,
    backgroundColor: "#3665f3",
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 10
  },
  noticeBox: {
    marginTop: 14,
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fbff"
  },
  noticeText: {
    color: "#475569"
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#fff"
  },
  reviewHeader: {
    fontWeight: "700",
    color: "#1f2937",
    fontSize: 12
  },
  reviewComment: {
    marginTop: 4,
    color: "#475569",
    fontSize: 12
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
    borderColor: "#3665f3",
    backgroundColor: "#3665f3"
  },
  ratingChipText: {
    color: "#1f2937",
    fontWeight: "700"
  },
  ratingChipTextActive: {
    color: "#fff"
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#fff"
  },
  textarea: {
    minHeight: 90,
    textAlignVertical: "top"
  }
});
