import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

const faqs = [
  { q: 'How do I book an appointment?', a: 'Go to the Appointments tab and tap "+ New" to book a service for your pet, choosing a date and time that works for you.' },
  { q: 'How do I pay for a service?', a: 'Once the clinic confirms your appointment and finalizes the charges, a "Pay Now" button will appear on that appointment. You can pay securely via GCash or PayMaya.' },
  { q: 'Can I cancel an appointment?', a: 'Yes, appointments that are still "Pending" can be cancelled from the Appointments tab. Confirmed appointments should be cancelled by calling the clinic directly.' },
  { q: 'How do I add a new pet?', a: 'Go to the My Pets tab and tap "Add" to register a new pet, including their species, weight, and other details.' },
  { q: 'Who adds vaccination records?', a: 'Vaccination records and health notes are entered by clinic staff after a verified visit, so the information stays accurate and trustworthy.' },
];

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Missing Info', 'Please fill in both subject and message.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to send a message.');
        return;
      }
      const { error } = await (supabase as any).from('support_tickets').insert([{
        user_id: user.id,
        user_email: user.email,
        subject: subject.trim(),
        message: message.trim(),
      }]);
      if (error) throw error;

      Alert.alert('Sent', "We've received your message and will get back to you soon.");
      setSubject('');
      setMessage('');
    } catch {
      Alert.alert('Error', 'Failed to send your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* ── Contact Us ── */}
          <Text style={styles.sectionTitle}>Contact Us</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('tel:+639502791505')} activeOpacity={0.7}>
              <View style={styles.rowIconWrap}><Ionicons name="call-outline" size={17} color={TEAL} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Call the Clinic</Text>
                <Text style={styles.rowSub}>+63 950 279 1505</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('mailto:petroyaleclinic@gmail.com')} activeOpacity={0.7}>
              <View style={styles.rowIconWrap}><Ionicons name="mail-outline" size={17} color={TEAL} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Email Us</Text>
                <Text style={styles.rowSub}>petroyaleclinic@gmail.com</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          </View>

          {/* ── Send us a message ── */}
          <Text style={styles.sectionTitle}>Send Us a Message</Text>
          <View style={styles.card}>
            <View style={styles.formPad}>
              <Text style={styles.label}>Subject</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Question about my appointment"
                placeholderTextColor="#9CA3AF"
                value={subject}
                onChangeText={setSubject}
              />
              <Text style={styles.label}>Message</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                placeholder="Tell us what's going on…"
                placeholderTextColor="#9CA3AF"
                value={message}
                onChangeText={setMessage}
                multiline
              />
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitTicket} disabled={submitting} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="send" size={15} color="#fff" />
                    <Text style={styles.submitBtnText}>Send Message</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── FAQs ── */}
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          <View style={styles.card}>
            {faqs.map((faq, i) => (
              <View key={i}>
                <TouchableOpacity style={styles.faqRow} onPress={() => setOpenFaq(openFaq === i ? null : i)} activeOpacity={0.7}>
                  <Text style={styles.faqQ}>{faq.q}</Text>
                  <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={16} color={SUB} />
                </TouchableOpacity>
                {openFaq === i && <Text style={styles.faqA}>{faq.a}</Text>}
                {i < faqs.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: INK },
  content: { padding: 16 },
  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 18 },
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 13.5, fontWeight: '600', color: INK },
  rowSub: { fontSize: 11.5, color: SUB, marginTop: 2 },
  divider: { height: 1, backgroundColor: BORDER, marginLeft: 14 },

  formPad: { padding: 16 },
  label: { fontSize: 11, fontWeight: '700', color: SUB, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: INK },
  submitBtn: {
    backgroundColor: TEAL, borderRadius: 10, paddingVertical: 13, marginTop: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  faqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  faqQ: { flex: 1, fontSize: 13.5, fontWeight: '600', color: INK, marginRight: 10 },
  faqA: { fontSize: 12.5, color: SUB, lineHeight: 19, paddingHorizontal: 14, paddingBottom: 14 },
});