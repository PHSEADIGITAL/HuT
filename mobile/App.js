import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import ChooserScreen from "./src/screens/ChooserScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import StaysScreen from "./src/screens/StaysScreen";
import StayDetailScreen from "./src/screens/StayDetailScreen";
import MarketplaceScreen from "./src/screens/MarketplaceScreen";
import MarketplaceDetailScreen from "./src/screens/MarketplaceDetailScreen";
import AccountScreen from "./src/screens/AccountScreen";
import AdminHotelsScreen from "./src/screens/AdminHotelsScreen";
import AdminHotelDashboardScreen from "./src/screens/AdminHotelDashboardScreen";
import OwnerDashboardScreen from "./src/screens/OwnerDashboardScreen";

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { bootstrapping } = useAuth();
  if (bootstrapping) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color="#3665f3" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        initialRouteName="Chooser"
        screenOptions={{
          headerStyle: {
            backgroundColor: "#ffffff"
          },
          headerTintColor: "#0f1b2d",
          contentStyle: {
            backgroundColor: "#f2f5ff"
          }
        }}
      >
        <Stack.Screen name="Chooser" component={ChooserScreen} options={{ title: "HuT!" }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Sign In" }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: "Create Account" }} />
        <Stack.Screen name="Stays" component={StaysScreen} options={{ title: "Stays" }} />
        <Stack.Screen
          name="StayDetail"
          component={StayDetailScreen}
          options={{ title: "Hotel Details" }}
        />
        <Stack.Screen
          name="Marketplace"
          component={MarketplaceScreen}
          options={{ title: "Marketplace" }}
        />
        <Stack.Screen
          name="MarketplaceDetail"
          component={MarketplaceDetailScreen}
          options={{ title: "Listing Details" }}
        />
        <Stack.Screen name="Account" component={AccountScreen} options={{ title: "My Account" }} />
        <Stack.Screen name="AdminHotels" component={AdminHotelsScreen} options={{ title: "Admin Hotels" }} />
        <Stack.Screen
          name="AdminHotelDashboard"
          component={AdminHotelDashboardScreen}
          options={{ title: "Hotel Dashboard" }}
        />
        <Stack.Screen
          name="OwnerDashboard"
          component={OwnerDashboardScreen}
          options={{ title: "Owner Dashboard" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f5ff"
  }
});
