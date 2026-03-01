import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../context/AuthContext";

function AccountTypeOption({ active, label, hint, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.accountTypeOption, active && styles.accountTypeActive]}>
      <Text style={styles.accountTypeLabel}>{label}</Text>
      <Text style={styles.accountTypeHint}>{hint}</Text>
    </Pressable>
  );
}

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [marketplaceAccountType, setMarketplaceAccountType] = useState("buyer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister() {
    if (!name || !email || !phone || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await register({
        name,
        email,
        phone,
        password,
        confirmPassword,
        marketplaceAccountType
      });
      navigation.reset({
        index: 0,
        routes: [{ name: "Chooser" }]
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Choose buyer or seller to unlock role-specific tools.</Text>

      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />

      <View style={styles.accountTypeWrap}>
        <AccountTypeOption
          active={marketplaceAccountType === "buyer"}
          label="Buyer"
          hint="Unlock seller contacts and shop listings"
          onPress={() => setMarketplaceAccountType("buyer")}
        />
        <AccountTypeOption
          active={marketplaceAccountType === "seller"}
          label="Seller"
          hint="Create and manage your marketplace listings"
          onPress={() => setMarketplaceAccountType("seller")}
        />
      </View>

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={handleRegister} disabled={submitting} style={styles.button}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create Account</Text>
        )}
      </Pressable>

      <Pressable onPress={() => navigation.navigate("Login")} style={styles.linkButton}>
        <Text style={styles.linkText}>Already have an account? Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff"
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f1b2d"
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    color: "#5d6a83"
  },
  input: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10
  },
  accountTypeWrap: {
    gap: 10,
    marginBottom: 10
  },
  accountTypeOption: {
    borderWidth: 1,
    borderColor: "#d6e1f2",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f8fbff"
  },
  accountTypeActive: {
    borderColor: "#3665f3",
    backgroundColor: "#eef3ff"
  },
  accountTypeLabel: {
    fontWeight: "700",
    color: "#1f2937"
  },
  accountTypeHint: {
    marginTop: 3,
    color: "#5d6a83",
    fontSize: 12
  },
  error: {
    color: "#dc2626",
    marginBottom: 10
  },
  button: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#3665f3"
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  linkButton: {
    marginTop: 12,
    alignItems: "center"
  },
  linkText: {
    color: "#3665f3",
    fontWeight: "600"
  }
});
