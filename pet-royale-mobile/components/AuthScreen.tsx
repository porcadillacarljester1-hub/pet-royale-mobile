import { useCallback, useState } from 'react';
import { View, Keyboard, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AuthShell, { type ShellMode } from './AuthShell';
import SignInForm from './SignInForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm, { StepPill } from './ForgotPasswordForm';
import ConfirmEmail from './ConfirmEmail';

/* One screen for "Sign in", "Create account" and "Forgot password".

   app/signin.tsx, app/register.tsx and app/forgot-password.tsx all render
   this, differing only in which side they start on. Switching between them
   never navigates anywhere: the hero stays put and only the form changes. */
export default function AuthScreen({ initialMode }: { initialMode: ShellMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<ShellMode>(initialMode);
  // Which step the forgot-password flow is on, for the progress pill.
  const [forgotStep, setForgotStep] = useState(0);
  // Set after sign-up. The "Check your email" page is drawn over the shell,
  // which stays mounted underneath so the form keeps what was typed.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [editEmailNonce, setEditEmailNonce] = useState(0);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  };

  const switchMode = useCallback((to: ShellMode) => {
    if (to === 'forgot') setForgotStep(0);
    setMode(to);
  }, []);

  const showConfirm = (email: string) => {
    Keyboard.dismiss();
    setConfirmEmail(email);
  };

  const goToSignIn = () => {
    setConfirmEmail(null);
    setMode('signin');
  };

  const changeEmail = () => {
    setConfirmEmail(null);
    setEditEmailNonce((n) => n + 1);
  };

  const covered = confirmEmail !== null;

  return (
    <View style={styles.root}>
      {/* Hidden from screen readers while the confirmation page covers it. */}
      <View
        style={styles.root}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        <AuthShell
          mode={mode}
          onSwitch={switchMode}
          onBack={leave}
          pill={
            mode === 'forgot'
              ? (style) => <StepPill index={forgotStep} style={style} />
              : undefined
          }
        >
          {(auth) =>
            mode === 'signin' ? (
              <SignInForm auth={auth} />
            ) : mode === 'register' ? (
              <RegisterForm auth={auth} onCheckEmail={showConfirm} editEmailNonce={editEmailNonce} />
            ) : (
              <ForgotPasswordForm auth={auth} onStep={setForgotStep} />
            )
          }
        </AuthShell>
      </View>

      {confirmEmail !== null ? (
        <ConfirmEmail email={confirmEmail} onGoToSignIn={goToSignIn} onChangeEmail={changeEmail} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
