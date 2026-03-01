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
import { useAuth } from "../context/AuthContext";

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

export default function MarketplaceScreen({ navigation }) {
  const { token, isAuthenticated } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [listings, setListings] = useState([]);
  const [account, setAccount] = useState(null);
  const [contactFee, setContactFee] = useState(500);

  const loadListings = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const queryString = query ? `?q=${encodeURIComponent(query)}` : "";
        const payload = await apiRequest(`/api/marketplace/listings${queryString}`, {
          token: isAuthenticated ? token : ""
        });
        setListings(payload.listings || []);
        setAccount(payload.account || null);
        setContactFee(payload.marketplaceContactSubscriptionFeeNaira || 500);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated, query, token]
  );

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Marketplace</Text>
      <Text style={styles.subtitle}>Browse local listings and seller ratings.</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search listings"
        />
        <Pressable style={styles.searchButton} onPress={() => loadListings()}>
          <Text style={styles.searchButtonText}>Find</Text>
        </Pressable>
      </View>

      {account ? (
        <View style={styles.accountPanel}>
          <Text style={styles.accountText}>
            Account type:{" "}
            <Text style={styles.accountType}>
              {String(account.marketplaceAccountType || "buyer").toUpperCase()}
            </Text>
          </Text>
          <Text style={styles.accountText}>
            Wallet: <Text style={styles.accountType}>{formatNaira(account.walletBalance || 0)}</Text>
          </Text>
          {account.isBuyer ? (
            <Text style={styles.accountText}>
              Contact subscription:{" "}
              <Text style={styles.accountType}>
                {account.buyerContactSubscription?.hasActive
                  ? `Active until ${account.buyerContactSubscription.expiresAt}`
                  : `Inactive (${formatNaira(contactFee)}/month)`}
              </Text>
            </Text>
          ) : null}
          {account.isSeller && account.sellerLimitState ? (
            <Text style={styles.accountText}>
              Seller quota:{" "}
              <Text style={styles.accountType}>
                {account.sellerLimitState.used}/{account.sellerLimitState.includedLimitDisplay}
              </Text>
            </Text>
          ) : null}
        </View>
      ) : (
        <Pressable style={styles.loginPanel} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.loginPanelText}>
            Sign in for buyer/seller tools and contact unlock features.
          </Text>
        </Pressable>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3665f3" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadListings()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadListings(true)} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate("MarketplaceDetail", { listingId: item.id })}
            >
              <Image source={{ uri: item.primaryImage }} style={styles.cardImage} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.category} • {item.condition}
                </Text>
                <Text style={styles.meta}>
                  {item.location}
                  {item.neighborhood ? ` • ${item.neighborhood}` : ""}
                </Text>
                <Text style={styles.meta}>
                  Seller: {item.sellerName} •{" "}
                  {item.sellerRatingCount
                    ? `${item.sellerRatingAverage}/5 (${item.sellerRatingCount})`
                    : "No ratings yet"}
                </Text>
                <Text style={styles.price}>Now {formatNaira(item.price)}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.meta}>No listings found.</Text>
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
  accountPanel: {
    marginTop: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    gap: 2
  },
  accountText: {
    color: "#475569",
    fontSize: 12
  },
  accountType: {
    color: "#1f2937",
    fontWeight: "700"
  },
  loginPanel: {
    marginTop: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    backgroundColor: "#ffffff"
  },
  loginPanelText: {
    color: "#1f2937",
    fontWeight: "600"
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
  cardImage: {
    width: "100%",
    height: 160
  },
  cardBody: {
    padding: 10
  },
  cardTitle: {
    fontSize: 16,
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
    fontWeight: "700",
    fontSize: 16
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
