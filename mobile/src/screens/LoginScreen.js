import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email || !password) {
      setError("Provide your email and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await login({ email, password });
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
      <Text style={styles.title}>Sign In</Text>
      <Text style={styles.subtitle}>Use your HuT account credentials.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={handleLogin} disabled={submitting} style={styles.button}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </Pressable>

      <Pressable onPress={() => navigation.navigate("Register")} style={styles.linkButton}>
        <Text style={styles.linkText}>Create account instead</Text>
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
    marginBottom: 18,
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
