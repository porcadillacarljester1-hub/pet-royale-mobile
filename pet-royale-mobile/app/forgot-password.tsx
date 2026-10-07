import AuthScreen from '../components/AuthScreen';

/* Forgot password is now a third mode of the shared auth screen, so going
   between it and Sign in never changes screens. This route only exists so
   a link straight to /forgot-password still opens the right form. */
export default function ForgotPasswordRoute() {
  return <AuthScreen initialMode="forgot" />;
}
