import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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

const locationNeighborhoods = {
  "Bonny Island": [
    "Sandfield",
    "Iwoama",
    "Orosikiri",
    "Aganya",
    "Ayambo",
    "Akiama",
    "New-Road",
    "Simidia",
    "Abalamabie",
    "Water-Well",
    "Wilbros-Road",
    "Berger-Road",
    "Mission-Road",
    "Cable-Road",
    "Macauley",
    "Gana-Woman",
    "Ama-Omu",
    "Shell-Gate",
    "Finima",
    "LNG-Round-About",
    "Navy-Base",
    "Cocoanut-Estate",
    "Ukpo-Avenue",
    "Workers-Camp",
    "SDP",
    "New-Jerusalem",
    "Beach",
    "IT-Williams"
  ],
  "Port-Harcourt": [
    "Diobu",
    "Town",
    "Mile-1",
    "Mile-3",
    "Old-GRA",
    "Rumoula",
    "Garrison",
    "Stadium-Road",
    "Elekahia",
    "Rumoumasi",
    "Abali-Park",
    "1st-Artilery",
    "2nd-Artilery"
  ]
};

export default function AccountScreen({ navigation }) {
  const { token, user, refreshProfile, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sellerData, setSellerData] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
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
  const isCustomer = user?.role === "customer";
  const isAdmin = user?.role === "hotel_admin" || user?.role === "platform_admin";
  const isPlatformOwner = user?.role === "platform_admin";
  const neighborhoodOptions = useMemo(
    () => locationNeighborhoods[formState.location] || [],
    [formState.location]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const refreshedUser = (await refreshProfile()) || user;
      const activeRole = refreshedUser?.role || user?.role;
      if (isSeller) {
        const payload = await apiRequest("/api/marketplace/my-listings", {
          token
        });
        setSellerData(payload);
      } else {
        setSellerData(null);
      }

      const walletPayload = await apiRequest("/api/wallet", {
        token
      });
      setWalletData(walletPayload);

      if (activeRole === "customer") {
        const bookingPayload = await apiRequest("/api/bookings/my", {
          token
        });
        setBookings(bookingPayload.bookings || []);
      } else {
        setBookings([]);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [isSeller, refreshProfile, token, user?.role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function openImageLibrary() {
    setError("");
    setPickerBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Media library permission is required.");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 4,
        quality: 0.8
      });
      if (!result.canceled) {
        const nextUris = result.assets.map((asset) => asset.uri);
        setSelectedImages((current) => Array.from(new Set([...current, ...nextUris])).slice(0, 4));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPickerBusy(false);
    }
  }

  async function openCamera() {
    setError("");
    setPickerBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Camera permission is required.");
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8
      });
      if (!result.canceled && result.assets?.length) {
        const nextUris = result.assets.map((asset) => asset.uri);
        setSelectedImages((current) => Array.from(new Set([...current, ...nextUris])).slice(0, 4));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPickerBusy(false);
    }
  }

  async function uploadListingImages() {
    if (!selectedImages.length) {
      return [];
    }
    const formData = new FormData();
    selectedImages.slice(0, 4).forEach((uri, index) => {
      const fallbackExt = "jpg";
      const rawExtension = String(uri).split(".").pop()?.split("?")[0] || fallbackExt;
      const extension = rawExtension.toLowerCase();
      const type = extension === "png" ? "image/png" : "image/jpeg";
      formData.append("images", {
        uri,
        name: `listing-${Date.now()}-${index}.${extension}`,
        type
      });
    });
    const payload = await apiRequest("/api/marketplace/listings/upload-images", {
      method: "POST",
      token,
      body: formData
    });
    return payload.imageUrls || [];
  }

  async function handleCreateListing() {
    setError("");
    setMessage("");
    if (!isSeller) {
      setError("Only seller accounts can create listings.");
      return;
    }
    try {
      const imageUrls = await uploadListingImages();
      await apiRequest("/api/marketplace/listings", {
        method: "POST",
        token,
        body: {
          ...formState,
          price: Number(formState.price || 0),
          imageUrls
        }
      });
      setMessage("Listing created successfully.");
      setFormState((current) => ({
        ...current,
        title: "",
        description: "",
        price: ""
      }));
      setSelectedImages([]);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleWalletTopup() {
    if (!topupAmount) {
      setError("Enter top-up amount.");
      return;
    }
    setTopupBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await apiRequest("/api/wallet/topup", {
        method: "POST",
        token,
        body: {
          amount: Number(topupAmount)
        }
      });
      setTopupAmount("");
      if (payload.paymentUrl) {
        setMessage("Top-up initiated. Complete payment in provider page.");
        try {
          await Linking.openURL(payload.paymentUrl);
        } catch (_error) {
          setMessage(`Top-up initiated. Open payment URL manually: ${payload.paymentUrl}`);
        }
      } else {
        setMessage(`Wallet funded. New balance: ${formatNaira(payload.balanceAfter || 0)}`);
      }
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setTopupBusy(false);
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

  async function cancelBooking(bookingId) {
    setError("");
    setMessage("");
    try {
      const payload = await apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: "POST",
        token
      });
      setMessage(payload.message || "Booking cancelled.");
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
          Wallet Balance:{" "}
          <Text style={styles.infoStrong}>
            {formatNaira(walletData?.walletBalance ?? user.walletBalance ?? 0)}
          </Text>
        </Text>
      </View>

      {loading ? <ActivityIndicator color="#3665f3" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Wallet Top-up</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="Top-up amount (NGN)"
          value={topupAmount}
          onChangeText={setTopupAmount}
        />
        <Pressable style={styles.primaryButton} onPress={handleWalletTopup} disabled={topupBusy}>
          <Text style={styles.primaryButtonText}>
            {topupBusy ? "Processing..." : "Fund wallet"}
          </Text>
        </Pressable>
        {(walletData?.transactions || []).slice(0, 6).map((entry) => (
          <View key={entry.id} style={styles.row}>
            <Text style={styles.infoText}>{entry.type.replace(/_/g, " ")}</Text>
            <Text
              style={[
                styles.infoStrong,
                entry.direction === "credit" ? styles.creditText : styles.debitText
              ]}
            >
              {entry.direction === "credit" ? "+" : "-"}
              {formatNaira(entry.amount)}
            </Text>
          </View>
        ))}
      </View>

      {isCustomer ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My Bookings</Text>
          {bookings.length ? (
            bookings.slice(0, 8).map((booking) => (
              <View key={booking.id} style={styles.listingRow}>
                <Text style={styles.listingTitle}>
                  {booking.hotel?.name || "Hotel"} • {booking.roomCategory}
                </Text>
                <Text style={styles.infoText}>
                  {booking.checkInDate} to {booking.checkOutDate}
                </Text>
                <Text style={styles.infoText}>
                  Ref: {booking.referenceNumber || booking.id} • {booking.status} /{" "}
                  {booking.paymentStatus}
                </Text>
                {booking.status === "confirmed" ? (
                  <Pressable
                    style={styles.ghostButton}
                    onPress={() => cancelBooking(booking.id)}
                  >
                    <Text style={styles.ghostButtonText}>Cancel booking</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.infoText}>No bookings yet.</Text>
          )}
        </View>
      ) : null}

      {isBuyer ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Buyer Contact Access</Text>
          <Text style={styles.infoText}>
            Status:{" "}
            <Text style={styles.infoStrong}>
              {walletData?.contactAccessState?.hasActive
                ? `Active until ${walletData.contactAccessState.expiresAt}`
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
            placeholder="Category (e.g. Electronics)"
            value={formState.category}
            onChangeText={(value) => setFormState((current) => ({ ...current, category: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Condition (Used / Like New / Refurbished)"
            value={formState.condition}
            onChangeText={(value) => setFormState((current) => ({ ...current, condition: value }))}
          />
          <Text style={styles.infoText}>Select location</Text>
          <View style={styles.chipRow}>
            {Object.keys(locationNeighborhoods).map((location) => (
              <Pressable
                key={location}
                style={[
                  styles.chip,
                  formState.location === location && styles.chipActive
                ]}
                onPress={() =>
                  setFormState((current) => ({
                    ...current,
                    location,
                    neighborhood: locationNeighborhoods[location][0] || ""
                  }))
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    formState.location === location && styles.chipTextActive
                  ]}
                >
                  {location}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.infoText}>Neighborhood</Text>
          <View style={styles.chipRow}>
            {neighborhoodOptions.slice(0, 8).map((neighborhood) => (
              <Pressable
                key={neighborhood}
                style={[
                  styles.chip,
                  formState.neighborhood === neighborhood && styles.chipActive
                ]}
                onPress={() =>
                  setFormState((current) => ({
                    ...current,
                    neighborhood
                  }))
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    formState.neighborhood === neighborhood && styles.chipTextActive
                  ]}
                >
                  {neighborhood}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Neighborhood (exact)"
            value={formState.neighborhood}
            onChangeText={(value) =>
              setFormState((current) => ({
                ...current,
                neighborhood: value
              }))
            }
          />
          <TextInput
            style={styles.input}
            placeholder="Price (NGN)"
            keyboardType="numeric"
            value={formState.price}
            onChangeText={(value) => setFormState((current) => ({ ...current, price: value }))}
          />
          <View style={styles.rowWrap}>
            <Pressable style={styles.ghostButton} onPress={openImageLibrary} disabled={pickerBusy}>
              <Text style={styles.ghostButtonText}>
                {pickerBusy ? "Please wait..." : "Pick from gallery"}
              </Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={openCamera} disabled={pickerBusy}>
              <Text style={styles.ghostButtonText}>Use camera</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={() => setSelectedImages([])}>
              <Text style={styles.ghostButtonText}>Clear photos</Text>
            </Pressable>
          </View>
          <Text style={styles.infoText}>
            Selected images: <Text style={styles.infoStrong}>{selectedImages.length}/4</Text>
          </Text>
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

      {isAdmin ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Admin Tools</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => navigation.navigate("AdminHotels")}
          >
            <Text style={styles.primaryButtonText}>Open hotel admin dashboards</Text>
          </Pressable>
          {isPlatformOwner ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => navigation.navigate("OwnerDashboard")}
            >
              <Text style={styles.primaryButtonText}>Open owner revenue dashboard</Text>
            </Pressable>
          ) : null}
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#eef2ff",
    paddingTop: 6
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  creditText: {
    color: "#059669"
  },
  debitText: {
    color: "#b91c1c"
  },
  ghostButton: {
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d6e1f2",
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  ghostButtonText: {
    color: "#1f2937",
    fontWeight: "700"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d6e1f2",
    backgroundColor: "#fff"
  },
  chipActive: {
    borderColor: "#3665f3",
    backgroundColor: "#eef3ff"
  },
  chipText: {
    color: "#334155",
    fontSize: 12
  },
  chipTextActive: {
    color: "#143b8f",
    fontWeight: "700"
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
