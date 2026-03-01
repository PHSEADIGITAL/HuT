import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
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

export default function MarketplaceDetailScreen({ navigation, route }) {
  const { listingId } = route.params || {};
  const { token, user, isAuthenticated, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiRequest(`/api/marketplace/listings/${encodeURIComponent(listingId)}`, {
        token: isAuthenticated ? token : ""
      });
      setDetail(payload);
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
  }
});
