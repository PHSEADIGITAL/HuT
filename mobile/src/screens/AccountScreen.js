import { useCallback, useEffect, useState } from "react";
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

export default function AccountScreen({ navigation }) {
  const { token, user, refreshProfile, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sellerData, setSellerData] = useState(null);
  const [buyerState, setBuyerState] = useState(null);
  const [formState, setFormState] = useState({
    title: "",
    description: "",
    category: "Electronics",
    condition: "Used",
    location: "Bonny Island",
    neighborhood: "Sandfield",
    price: ""
  });

  const isSeller = user?.marketplaceAccountType === "seller";
  const isBuyer = user?.marketplaceAccountType === "buyer";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await refreshProfile();
      if (isSeller) {
        const payload = await apiRequest("/api/marketplace/my-listings", {
          token
        });
        setSellerData(payload);
        setBuyerState(null);
      } else if (isBuyer) {
        const payload = await apiRequest("/api/marketplace/listings", {
          token
        });
        setBuyerState(payload.account?.buyerContactSubscription || null);
        setSellerData(null);
      } else {
        setSellerData(null);
        setBuyerState(null);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [isBuyer, isSeller, refreshProfile, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateListing() {
    setError("");
    setMessage("");
    if (!isSeller) {
      setError("Only seller accounts can create listings.");
      return;
    }
    try {
      await apiRequest("/api/marketplace/listings", {
        method: "POST",
        token,
        body: {
          ...formState,
          price: Number(formState.price || 0)
        }
      });
      setMessage("Listing created successfully.");
      setFormState((current) => ({
        ...current,
        title: "",
        description: "",
        price: ""
      }));
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function activateBuyerContactSubscription() {
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/marketplace/contact-subscription/purchase", {
        method: "POST",
        token,
        body: {
          autoRenew: true
        }
      });
      setMessage("Buyer contact subscription activated.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>You need to sign in first.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>My Account</Text>
      <Text style={styles.subtitle}>Manage your HuT mobile profile.</Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          Name: <Text style={styles.infoStrong}>{user.name}</Text>
        </Text>
        <Text style={styles.infoText}>
          Email: <Text style={styles.infoStrong}>{user.email}</Text>
        </Text>
        <Text style={styles.infoText}>
          Marketplace Type:{" "}
          <Text style={styles.infoStrong}>{String(user.marketplaceAccountType).toUpperCase()}</Text>
        </Text>
        <Text style={styles.infoText}>
          Wallet Balance: <Text style={styles.infoStrong}>{formatNaira(user.walletBalance || 0)}</Text>
        </Text>
      </View>

      {loading ? <ActivityIndicator color="#3665f3" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {isBuyer ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Buyer Contact Access</Text>
          <Text style={styles.infoText}>
            Status:{" "}
            <Text style={styles.infoStrong}>
              {buyerState?.hasActive
                ? `Active until ${buyerState.expiresAt}`
                : "Inactive"}
            </Text>
          </Text>
          <Pressable style={styles.primaryButton} onPress={activateBuyerContactSubscription}>
            <Text style={styles.primaryButtonText}>Activate / Update Subscription</Text>
          </Pressable>
        </View>
      ) : null}

      {isSeller ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create Listing</Text>
          <TextInput
            style={styles.input}
            placeholder="Title"
            value={formState.title}
            onChangeText={(value) => setFormState((current) => ({ ...current, title: value }))}
          />
          <TextInput
            style={[styles.input, styles.textarea]}
            multiline
            numberOfLines={3}
            placeholder="Description"
            value={formState.description}
            onChangeText={(value) =>
              setFormState((current) => ({ ...current, description: value }))
            }
          />
          <TextInput
            style={styles.input}
            placeholder="Price (NGN)"
            keyboardType="numeric"
            value={formState.price}
            onChangeText={(value) => setFormState((current) => ({ ...current, price: value }))}
          />
          <Pressable style={styles.primaryButton} onPress={handleCreateListing}>
            <Text style={styles.primaryButtonText}>Publish Listing</Text>
          </Pressable>

          <Text style={styles.cardTitle}>My Listings</Text>
          {(sellerData?.listings || []).slice(0, 8).map((listing) => (
            <Pressable
              key={listing.id}
              style={styles.listingRow}
              onPress={() =>
                navigation.navigate("MarketplaceDetail", {
                  listingId: listing.id
                })
              }
            >
              <Text style={styles.listingTitle}>{listing.title}</Text>
              <Text style={styles.infoText}>
                {listing.status} • {formatNaira(listing.price)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </Pressable>
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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: "#0f1b2d"
  },
  subtitle: {
    color: "#5d6a83"
  },
  infoCard: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 10,
    gap: 4
  },
  infoText: {
    color: "#475569",
    fontSize: 13
  },
  infoStrong: {
    color: "#1f2937",
    fontWeight: "700"
  },
  card: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 10,
    gap: 8
  },
  cardTitle: {
    marginTop: 2,
    fontWeight: "700",
    color: "#1f2937"
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
  listingRow: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 8,
    padding: 8
  },
  listingTitle: {
    color: "#0f1b2d",
    fontWeight: "700"
  },
  error: {
    color: "#dc2626"
  },
  success: {
    color: "#059669"
  },
  logoutButton: {
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d6e1f2",
    paddingVertical: 12,
    alignItems: "center"
  },
  logoutButtonText: {
    color: "#1f2937",
    fontWeight: "700"
  }
});
