import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Linking, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import supabase from './supabaseClient';

import SplashScreen from './pages/public/SplashScreen';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

import UserLayout from './layouts/UserLayout';
import ModLayout from './layouts/ModLayout';
import SupportLayout from './layouts/SupportLayout';
import AdminLayout from './layouts/AdminLayout';

import SetupInterests from './pages/user/SetupInterests';
import SkillDetails from './pages/user/SkillDetails';
import CreateSkill from './pages/user/CreateSkill';
import EditSkill from './pages/user/EditSkill';
import PublicProfile from './pages/user/PublicProfile';
import Profile from './pages/user/Profile';
import MyListings from './pages/user/MyListings';
import Payments from './pages/user/Payments';
import Settings from './pages/user/Settings';
import Notifications from './pages/user/Notifications';

import SkillReview from './pages/moderator/SkillReview';
import DisputeDetails from './pages/moderator/DisputeDetails';
import ReportDetails from './pages/moderator/ReportDetails';
import TicketChat from './pages/support/TicketChat';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();
const header = (title) => ({ headerShown: true, title, headerTintColor: '#047857' });
const PASSWORD_RESET_URL_PART = 'reset-password';

// Shared user screens are registered for every signed-in role. This is intentional:
// Admin, Moderator, and Support layouts all provide a "Switch to user app" action.
const userScreens = (
  <>
    <Stack.Screen name="User" component={UserLayout} />
    <Stack.Screen name="SkillDetails" component={SkillDetails} options={header('Skill')} />
    <Stack.Screen name="CreateSkill" component={CreateSkill} options={header('Create Skill')} />
    <Stack.Screen name="EditSkill" component={EditSkill} options={header('Edit Skill')} />
    <Stack.Screen name="PublicProfile" component={PublicProfile} options={header('Profile')} />
    <Stack.Screen name="Profile" component={Profile} options={header('My Profile')} />
    <Stack.Screen name="MyListings" component={MyListings} options={header('My Listings')} />
    <Stack.Screen name="Payments" component={Payments} options={header('Wallet')} />
    <Stack.Screen name="Settings" component={Settings} options={header('Settings')} />
    <Stack.Screen name="Notifications" component={Notifications} options={header('Notifications')} />
  </>
);

const getLandingRoute = (session, profile) => {
  if (!session) return 'Login';
  if (profile?.role === 'Admin') return 'Admin';
  if (profile?.role === 'Moderator') return 'Mod';
  if (profile?.role === 'Support') return 'Support';
  if (!profile?.hasInterests) return 'SetupInterests';
  return 'User';
};

const readUrlParams = (url) => {
  const values = {};
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const hash = url.includes('#') ? url.split('#').slice(1).join('#') : '';
  for (const part of [query, hash]) {
    part.split('&').filter(Boolean).forEach((pair) => {
      const [rawKey, ...rawValue] = pair.split('=');
      const key = decodeURIComponent(rawKey || '');
      const value = decodeURIComponent(rawValue.join('=') || '').replace(/\+/g, ' ');
      if (key) values[key] = value;
    });
  }
  return values;
};

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialRouteName, setInitialRouteName] = useState(null);
  const recoveryMode = useRef(false);
  const handledUrls = useRef(new Set());

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession) {
      setProfile(null);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role, is_banned, has_set_interests')
        .eq('id', currentSession.user.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.is_banned) {
        await supabase.auth.signOut();
        return null;
      }

      const nextProfile = {
        role: data?.role ?? 'User',
        hasInterests: !!data?.has_set_interests,
      };
      setProfile(nextProfile);
      return nextProfile;
    } catch (error) {
      console.error('Unable to load user profile:', error);
      const fallbackProfile = { role: 'User', hasInterests: false };
      setProfile(fallbackProfile);
      return fallbackProfile;
    }
  }, []);

  const openResetScreen = useCallback(() => {
    if (navigationRef.isReady()) {
      navigationRef.resetRoot({ index: 0, routes: [{ name: 'ResetPassword' }] });
    } else {
      setInitialRouteName('ResetPassword');
    }
  }, []);

  const handleIncomingUrl = useCallback(async (url) => {
    if (!url || handledUrls.current.has(url)) return;
    const params = readUrlParams(url);
    const isPasswordReset = url.toLowerCase().includes(PASSWORD_RESET_URL_PART)
      || params.type === 'recovery'
      || !!params.error_code;

    if (!isPasswordReset) return;
    handledUrls.current.add(url);
    recoveryMode.current = true;

    // Supabase may return tokens in the URL fragment (implicit flow), or a PKCE code.
    // detectSessionInUrl is disabled for native apps, so exchange them here explicitly.
    try {
      if (params.access_token && params.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (error) console.error('Password recovery session error:', error.message);
      } else if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) console.error('Password recovery code error:', error.message);
      }
    } catch (error) {
      console.error('Unable to process password recovery link:', error);
    }

    openResetScreen();
  }, [openResetScreen]);

  useEffect(() => {
    let active = true;

    // Listen before reading the initial URL so a link opened during startup is not missed.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode.current = true;
        openResetScreen();
      }

      if (!nextSession) {
        setProfile(null);
        if (!recoveryMode.current && navigationRef.isReady()) {
          setTimeout(() => {
            if (navigationRef.isReady()) {
              navigationRef.resetRoot({ index: 0, routes: [{ name: 'Login' }] });
            }
          }, 0);
        }
      } else {
        // Defer Supabase queries until after this callback to avoid auth-client deadlocks.
        setTimeout(() => { if (active) loadProfile(nextSession); }, 0);
      }
    });

    const urlSub = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    const initialize = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await handleIncomingUrl(initialUrl);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active) return;

        const currentSession = data.session;
        setSession(currentSession);
        const currentProfile = await loadProfile(currentSession);
        if (!active) return;

        setInitialRouteName(
          recoveryMode.current ? 'ResetPassword' : getLandingRoute(currentSession, currentProfile),
        );
      } catch (error) {
        console.error('App initialization error:', error);
        if (active) setInitialRouteName('Login');
      } finally {
        if (active) setLoading(false);
      }
    };

    initialize();

    const recoveryDoneSub = DeviceEventEmitter.addListener('password_recovery_complete', () => {
      recoveryMode.current = false;
    });

    const refresh = DeviceEventEmitter.addListener('profile_updated', async () => {
      const { data } = await supabase.auth.getSession();
      if (active) await loadProfile(data.session);
    });

    return () => {
      active = false;
      authSub.subscription.unsubscribe();
      urlSub.remove();
      recoveryDoneSub.remove();
      refresh.remove();
    };
  }, [handleIncomingUrl, loadProfile, openResetScreen]);

  return (
    <SafeAreaProvider>
      {!splashDone ? (
        <SplashScreen onFinish={() => setSplashDone(true)} />
      ) : loading || !initialRouteName ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
          <ActivityIndicator color="#047857" />
        </View>
      ) : (
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
            {/* Keep all root routes mounted in the navigator's route map. This prevents
                role/session changes from removing a destination while another screen navigates. */}
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Register" component={Register} />
            <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
            <Stack.Screen name="ResetPassword" component={ResetPassword} />

            <Stack.Screen name="Admin" component={AdminLayout} />
            <Stack.Screen name="Mod" component={ModLayout} />
            <Stack.Screen name="Support" component={SupportLayout} />
            <Stack.Screen name="SetupInterests" component={SetupInterests} />

            <Stack.Screen name="SkillReview" component={SkillReview} />
            <Stack.Screen name="DisputeDetails" component={DisputeDetails} />
            <Stack.Screen name="ReportDetails" component={ReportDetails} />
            <Stack.Screen name="TicketChat" component={TicketChat} options={{ headerShown: true, title: 'Support ticket', headerTintColor: '#047857' }} />

            {userScreens}
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}
