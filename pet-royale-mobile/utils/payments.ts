// utils/payments.ts
import { Linking, Alert } from "react-native";
import { supabase } from "../lib/supabase";

export async function payForAppointment(appointmentId: string, amount: number, description: string) {
  try {
    const { data, error } = await supabase.functions.invoke("create-payment-link", {
      body: { appointmentId, amount, description },
    });

    if (error || !data?.checkoutUrl) {
      Alert.alert("Payment Error", "Could not start payment. Please try again.");
      return null;
    }

    const canOpen = await Linking.canOpenURL(data.checkoutUrl);
    if (canOpen) {
      await Linking.openURL(data.checkoutUrl);
    } else {
      Alert.alert("Error", "Unable to open payment page.");
    }

    return data.referenceNumber;
  } catch (err) {
    console.error("Payment error:", err);
    Alert.alert("Payment Error", "Something went wrong. Please try again.");
    return null;
  }
}