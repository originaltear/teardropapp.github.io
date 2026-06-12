import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, AppState } from 'react-native';
import { useAuth } from '../../lib/auth';
import { getUnreadCount } from '../../lib/social';
import { useTheme } from '../../lib/themes';
import { selection } from '../../lib/haptics';

const TAB_BAR_BG = '#111827';
const INACTIVE = '#4a5568';

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

function NotifIcon({ color }: { color: string }) {
  const { session } = useAuth();
  const { theme: { accent } } = useTheme();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session) { setCount(0); return; }
    // Skip ticks while backgrounded (no point burning data/battery), but
    // refresh immediately when the app comes back to the foreground.
    const tick = () => {
      if (AppState.currentState === 'active') getUnreadCount().then(setCount).catch(() => {});
    };
    tick();
    const interval = setInterval(tick, 30000);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') tick(); });
    return () => { clearInterval(interval); sub.remove(); };
  }, [session]);

  return (
    <View>
      <Text style={{ fontSize: 20, color }}>🔔</Text>
      {count > 0 && (
        <View style={{
          position: 'absolute', top: -4, right: -6,
          backgroundColor: accent, borderRadius: 8,
          minWidth: 16, height: 16,
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}>
          <Text style={{ color: '#0d1117', fontSize: 9, fontWeight: '800' }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const { theme: { accent } } = useTheme();
  return (
    <Tabs
      screenListeners={{ tabPress: () => selection() }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: TAB_BAR_BG,
          borderTopColor: '#1f2937',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: INACTIVE,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <TabIcon emoji="🌍" color={color} />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <TabIcon emoji="📋" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <NotifIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon emoji="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}
