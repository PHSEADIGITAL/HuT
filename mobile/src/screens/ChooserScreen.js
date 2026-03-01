import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";

function ActionButton({ label, onPress, secondary = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondaryButton : styles.primaryButton,
        pressed && styles.buttonPressed
      ]}
    >
      <Text style={secondary ? styles.secondaryButtonText : styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export default function ChooserScreen({ navigation }) {
  const { user, isAuthenticated } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Welcome to HuT!</Text>
      <Text style={styles.title}>Choose your experience</Text>
      <Text style={styles.subtitle}>Finding a Place to stay or going to the marketplace ?</Text>

      <View style={styles.actionStack}>
        <ActionButton label="Hotel Booking (Stays)" onPress={() => navigation.navigate("Stays")} />
        <ActionButton
          label="Marketplace"
          onPress={() => navigation.navigate("Marketplace")}
          secondary
        />
      </View>

      {isAuthenticated ? (
        <View style={styles.authBlock}>
          <Text style={styles.authText}>
            Signed in as <Text style={styles.authName}>{user?.name || "User"}</Text>
          </Text>
          <ActionButton
            label="Open My Account"
            onPress={() => navigation.navigate("Account")}
            secondary
          />
        </View>
      ) : (
        <View style={styles.authBlock}>
          <Text style={styles.authText}>Sign in or create an account for full access</Text>
          <ActionButton label="Sign In" onPress={() => navigation.navigate("Login")} />
          <ActionButton
            label="Create Account"
            onPress={() => navigation.navigate("Register")}
            secondary
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f3f6ff"
  },
  eyebrow: {
    fontSize: 12,
    color: "#4f6ea8",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  title: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: "800",
    color: "#0f1b2d"
  },
  subtitle: {
    marginTop: 8,
    color: "#4a5a77",
    fontSize: 15
  },
  actionStack: {
    marginTop: 28,
    gap: 12
  },
  authBlock: {
    marginTop: 30,
    gap: 10
  },
  authText: {
    color: "#4a5a77",
    fontSize: 14
  },
  authName: {
    fontWeight: "700",
    color: "#1f2937"
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  buttonPressed: {
    opacity: 0.85
  },
  primaryButton: {
    backgroundColor: "#3665f3"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderColor: "#d6e1f2",
    borderWidth: 1
  },
  secondaryButtonText: {
    color: "#1f2937",
    fontWeight: "700"
  }
});
