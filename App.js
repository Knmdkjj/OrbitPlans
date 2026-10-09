import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, Switch as RNSwitch, Animated, Alert, Share, useColorScheme, StatusBar, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager, PanResponder } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

const KEY = 'orbitplans.v1', VERSION = 1, APP_VER = '2.0.0';
const ACCENTS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF375F', '#BF5AE0', '#64D2FF', '#FFD60A', '#FF6AD5', '#5E5CE6', '#00C7BE', '#FFFFFF'];
const PRI = ['Low', 'Medium', 'High'], PRI_C = ['#8E8E93', '#FF9F0A', '#FF453A'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DEF = { v: VERSION, tasks: [], projects: [], habits: [], notes: [], settings: { theme: 'system', accent: ACCENTS[0], haptics: true, start: 0, weekStart: 1, h24: true, remindHour: 9, notif: true, scene: 'Aurora', orbs: true, seen: '', bg: 'Default', bgCustom: '' } };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmt = (s) => parseD(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Natural-language date shortcuts. Returns 'YYYY-MM-DD', null (empty) or undefined (not understood).
function parseDate(t) {
  const s = t.trim().toLowerCase(), now = new Date();
  if (!s) return null;
  if (s === 'today') return ymd(now);
  if (s === 'tomorrow') return ymd(addDays(now, 1));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseD(s))) return s;
  const m = s.match(/^(next\s+)?(\w+)$/), i = m && m[2].length >= 3 ? WD.findIndex((w) => w.startsWith(m[2])) : -1;
  if (i >= 0) { const diff = (i - now.getDay() + 7) % 7 || 7; return ymd(addDays(now, diff)); }
  const inN = s.match(/^in\s+(\d+)\s+days?$/);
  if (inN) return ymd(addDays(now, +inN[1]));
  return undefined;
}

function streaks(h, today) {
  const sched = (d) => h.days.includes(d.getDay());
  let cur = 0, d = new Date(today);
  if (sched(d) && !h.log[ymd(d)]) d = addDays(d, -1);
  for (let i = 0; i < 400; i++) { if (sched(d)) { if (h.log[ymd(d)]) cur++; else break; } d = addDays(d, -1); }
  let best = 0, run = 0;
  for (let i = 0; i <= 400; i++) {
    const x = addDays(today, i - 400);
    if (!sched(x)) continue;
    if (h.log[ymd(x)]) { run++; best = Math.max(best, run); } else if (ymd(x) !== ymd(today)) run = 0;
  }
  return { cur, best: Math.max(best, cur) };
}

const Ctx = createContext();
const useApp = () => useContext(Ctx);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);
const smooth = () => LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity'));
let gi = 0;

const UPDATES = [
  { v: '2.0.0', d: 'Oct 10, 2026', n: ['Daily streak system: flame counter, best streak, 5-week heatmap and 6 unlockable badges', '8 one-tap app themes (Midnight, Noir, Paper, Sunset, Ocean, Forest, Candy, Lavender)', 'Changeable app background: 7 presets or any custom #hex color', 'White accent, plus automatic black/white text on every accent so labels are always readable', 'Clearer text: higher-contrast secondary text, calmer glow, sturdier glass', 'Fixes: invisible switches on white accent, faint other-month calendar days, low-contrast labels'] },
  { v: '1.2.0', d: 'Oct 10, 2026', n: ['10 accent colors and 6 background scenes with slowly drifting glow', 'Stronger frosted glass on cards, sheets and the tab bar', 'Animated screen transitions, bouncing tab icons and springy buttons', 'This update log'] },
  { v: '1.1.0', d: 'Oct 10, 2026', n: ['Animated progress rings on Today', 'Swipe a task left to delete it', 'Subtasks and daily/weekly recurring tasks', 'Fixes: date parsing, project long-press, progress counting, settings flicker'] },
  { v: '1.0.0', d: 'Oct 10, 2026', n: ['First release: Today, Calendar, Tasks, Habits and Profile', 'Projects, notes, reminders, streaks and JSON export'] },
];
const lum = (h) => { const n = parseInt(h.slice(1), 16); const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
const onColor = (h) => (lum(h) > 0.4 ? '#000' : '#fff');
const BGS = { Default: ['#000000', '#F2F2F7'], Midnight: ['#0B1026', '#E8EEFF'], Plum: ['#1A0B24', '#F6E9FB'], Forest: ['#06150E', '#E6F4EC'], Wine: ['#240A12', '#FBE9EE'], Slate: ['#1C1F26', '#E9ECF1'], Sand: ['#1E1A14', '#F5EFE3'] };
const THEMES = [
  { n: 'Midnight', mode: 'dark', accent: '#0A84FF', scene: 'Aurora', bg: 'Default' },
  { n: 'Noir', mode: 'dark', accent: '#FFFFFF', scene: 'Mono', bg: 'Default' },
  { n: 'Paper', mode: 'light', accent: '#1C1C1E', scene: 'Mono', bg: 'Default' },
  { n: 'Sunset', mode: 'dark', accent: '#FF9F0A', scene: 'Sunset', bg: 'Wine' },
  { n: 'Ocean', mode: 'dark', accent: '#64D2FF', scene: 'Ocean', bg: 'Midnight' },
  { n: 'Forest', mode: 'dark', accent: '#30D158', scene: 'Forest', bg: 'Forest' },
  { n: 'Candy', mode: 'light', accent: '#FF6AD5', scene: 'Candy', bg: 'Default' },
  { n: 'Lavender', mode: 'dark', accent: '#BF5AE0', scene: 'Aurora', bg: 'Plum' },
];
const BADGES = [[3, 'Spark', 'flash'], [7, 'Week Warrior', 'ribbon'], [14, 'Fortnight', 'rocket'], [30, 'Monthly Master', 'trophy'], [60, 'Unstoppable', 'diamond'], [100, 'Legend', 'star']];

// A day counts toward the streak if you completed a task or a habit that day.
function calcStreak(d) {
  const m = {};
  d.tasks.forEach((t) => { if (t.done && t.completedAt) { const k = ymd(new Date(t.completedAt)); m[k] = (m[k] || 0) + 1; } });
  d.habits.forEach((h) => Object.keys(h.log).forEach((k) => { m[k] = (m[k] || 0) + 1; }));
  const today = new Date();
  let cur = 0, x = new Date(today);
  if (!m[ymd(x)]) x = addDays(x, -1);
  while (m[ymd(x)]) { cur++; x = addDays(x, -1); }
  let best = 0, run = 0, prev = null;
  Object.keys(m).sort().forEach((k) => { run = prev && ymd(addDays(parseD(prev), 1)) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  return { cur, best: Math.max(best, cur), m, todayDone: !!m[ymd(today)] };
}

function Flame({ size = 20, on = true }) {
  const { th } = useApp();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    const a = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 900, useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 900, useNativeDriver: true })]));
    a.start(); return () => a.stop();
  }, [on]);
  return <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }) }] }}><Ionicons name="flame" size={size} color={on ? '#FF9F0A' : th.sub} /></Animated.View>;
}
function Toast({ text, onDone }) {
  const { th } = useApp();
  const ins = useSafeAreaInsets();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.sequence([Animated.spring(v, { toValue: 1, bounciness: 12, useNativeDriver: true }), Animated.delay(2200), Animated.timing(v, { toValue: 0, duration: 250, useNativeDriver: true })]).start(onDone); }, []);
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', top: ins.top + 8, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22, backgroundColor: th.accent, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-50, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}><Txt s={{ color: th.on, fontWeight: '800' }}>{text}</Txt></Animated.View>;
}
function StreakSheet({ visible, onClose }) {
  const { th, data } = useApp();
  const st = useMemo(() => calcStreak(data), [data.tasks, data.habits]);
  const next = BADGES.find((b) => b[0] > st.cur);
  const cells = Array.from({ length: 35 }, (_, i) => addDays(new Date(), i - 34));
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <Flame size={64} on={st.cur > 0} />
        <Txt s={{ fontSize: 44, fontWeight: '800', marginTop: 4 }}>{st.cur}</Txt>
        <Txt s={{ color: th.sub }}>day streak · best {st.best}</Txt>
        <Txt s={{ marginTop: 8, textAlign: 'center', color: st.todayDone ? th.text : th.sub }}>{st.todayDone ? "Today is counted. Nice work." : 'Complete a task or habit today to keep your streak alive.'}</Txt>
      </View>
      {next && <><Bar pct={st.cur / next[0]} /><Txt s={{ fontSize: 12, color: th.sub, marginTop: 6 }}>{next[0] - st.cur} more {next[0] - st.cur === 1 ? 'day' : 'days'} to unlock {next[1]}</Txt></>}
      <H>Last 5 weeks</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d) => { const n = st.m[ymd(d)] || 0; return <View key={ymd(d)} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 4 }}><View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: n ? th.accent : th.chip, opacity: n ? (n >= 4 ? 1 : n >= 2 ? 0.7 : 0.45) : 1, borderWidth: ymd(d) === ymd(new Date()) ? 1.5 : 0, borderColor: th.text }} /></View>; })}
      </View>
      <H>Badges</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {BADGES.map(([n, name, ic]) => { const got = st.best >= n; return (
          <View key={n} style={{ width: '33.3%', alignItems: 'center', paddingVertical: 10, opacity: got ? 1 : 0.4 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: got ? th.accent : th.chip }}><Ionicons name={got ? ic : 'lock-closed'} size={24} color={got ? th.on : th.sub} /></View>
            <Txt s={{ fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' }}>{name}</Txt><Txt s={{ fontSize: 11, color: th.sub }}>{n} days</Txt>
          </View>); })}
      </View>
      <View style={{ height: 14 }} /><Btn label="Close" onPress={onClose} />
    </Sheet>
  );
}

const SCENES = { Aurora: ['#30D158', '#0A84FF', '#BF5AE0'], Sunset: ['#FF9F0A', '#FF375F', '#BF5AE0'], Ocean: ['#0A84FF', '#64D2FF', '#5E5CE6'], Forest: ['#30D158', '#A3D977', '#00A38C'], Candy: ['#FF6AD5', '#FFD60A', '#64D2FF'], Mono: ['#8E8E93', '#48484A', '#C7C7CC'] };

function Orb({ c, size, x, y, d }) {
  const { th } = useApp();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: d, useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: d, useNativeDriver: true })])).start(); }, []);
  return <Animated.View style={{ position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: c, opacity: th.dark ? 0.3 : 0.2, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-30, 50] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [25, -45] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.18] }) }] }} />;
}
function Orbs() {
  const { data } = useApp(), s = data.settings;
  if (!s.orbs) return null;
  const c = SCENES[s.scene] || SCENES.Aurora;
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}><Orb c={c[0]} size={280} x={-80} y={40} d={7000} /><Orb c={c[1]} size={300} x={160} y={300} d={9000} /><Orb c={c[2]} size={240} x={-40} y={560} d={8000} /></View>;
}
function Swap({ k, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { v.setValue(0); Animated.spring(v, { toValue: 1, speed: 14, bounciness: 4, useNativeDriver: true }).start(); }, [k]);
  return <Animated.View style={{ flex: 1, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>{children}</Animated.View>;
}
function TabIcon({ on, name }) {
  const { th } = useApp();
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => { if (on) Animated.sequence([Animated.timing(s, { toValue: 1.4, duration: 110, useNativeDriver: true }), Animated.spring(s, { toValue: 1, bounciness: 14, useNativeDriver: true })]).start(); }, [on]);
  return <Animated.View style={{ transform: [{ scale: s }] }}><Ionicons name={on ? name : name + '-outline'} size={24} color={on ? th.accent : th.sub} /></Animated.View>;
}

function FadeIn({ children, i = 0, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 450, delay: Math.min(i, 8) * 60, useNativeDriver: true }).start(); }, []);
  return <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }, style]}>{children}</Animated.View>;
}
function Press({ children, onPress, style }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v) => Animated.spring(s, { toValue: v, speed: 40, bounciness: 8, useNativeDriver: true }).start();
  return <Pressable onPress={onPress} onPressIn={() => to(0.88)} onPressOut={() => to(1)}><Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View></Pressable>;
}
function Switch(p) { const { th } = useApp(); return <RNSwitch {...p} trackColor={{ true: th.sw, false: th.chip }} />; }
const ACirc = Animated.createAnimatedComponent(Circle);
function Ring({ pct, size = 92, label, caption }) {
  const { th } = useApp();
  const v = useRef(new Animated.Value(0)).current;
  const r = (size - 12) / 2, c = 2 * Math.PI * r;
  useEffect(() => { Animated.timing(v, { toValue: pct, duration: 800, useNativeDriver: false }).start(); }, [pct]);
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={th.chip} strokeWidth={9} fill="none" />
          <ACirc cx={size / 2} cy={size / 2} r={r} stroke={th.accent} strokeWidth={9} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={v.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })} />
        </Svg>
        <Txt s={{ fontSize: size / 4.2, fontWeight: '700' }}>{label}</Txt>
      </View>
      {caption && <Txt s={{ fontSize: 12, color: th.sub, marginTop: 6 }}>{caption}</Txt>}
    </View>
  );
}
const Row = ({ label, children }) => <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}><Txt>{label}</Txt>{children}</View>;

async function syncNotif(task, s) {
  try {
    if (task.nid) await Notifications.cancelScheduledNotificationAsync(task.nid);
    if (!task.remind || task.done || !task.due || !s.notif) return null;
    const at = parseD(task.due); at.setHours(s.remindHour, 0, 0, 0);
    if (at <= new Date()) return null;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title: task.title, body: 'Due today' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes?.DATE, date: at },
    });
  } catch (e) { return null; }
}

function Glass({ children, style, pad: p = 16 }) {
  const { th } = useApp();
  const idx = useRef(gi++ % 6).current;
  return (
    <FadeIn i={idx} style={style}>
    <View style={{ borderRadius: 22, overflow: 'hidden', borderWidth: 0.5, borderColor: th.line, backgroundColor: th.card }}>
      <BlurView intensity={75} tint={th.dark ? 'dark' : 'light'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 1, backgroundColor: th.dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)' }} />
      <View style={{ padding: p }}>{children}</View>
    </View>
    </FadeIn>
  );
}
const Txt = ({ s = {}, children, ...r }) => { const { th } = useApp(); return <Text {...r} style={[{ color: th.text, fontSize: 15 }, s]}>{children}</Text>; };
const Chip = ({ label, on, onPress, onLongPress, color }) => {
  const { th } = useApp();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, marginRight: 8, backgroundColor: on ? color || th.accent : th.chip })}>
      <Txt s={{ fontSize: 13, fontWeight: '600', color: on ? onColor(color || th.accent) : th.sub }}>{label}</Txt>
    </Pressable>
  );
};
const Btn = ({ label, onPress, danger, flat }) => {
  const { th } = useApp();
  return (
    <Press onPress={onPress} style={{ padding: 13, borderRadius: 14, alignItems: 'center', backgroundColor: flat ? th.chip : danger ? '#FF453A' : th.accent }}>
      <Txt s={{ fontWeight: '700', color: flat ? th.text : danger ? '#fff' : th.on }}>{label}</Txt>
    </Press>
  );
};
const Input = (p) => { const { th } = useApp(); return <TextInput placeholderTextColor={th.sub} {...p} style={[{ color: th.text, backgroundColor: th.chip, borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 10 }, p.style]} />; };
const Bar = ({ pct }) => {
  const { th } = useApp();
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(w, { toValue: pct, duration: 500, useNativeDriver: false }).start(); }, [pct]);
  return <View style={{ height: 8, borderRadius: 4, backgroundColor: th.chip, overflow: 'hidden' }}><Animated.View style={{ height: 8, borderRadius: 4, backgroundColor: th.accent, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /></View>;
};
const Empty = ({ icon, text }) => { const { th } = useApp(); return <View style={{ alignItems: 'center', padding: 28 }}><Ionicons name={icon} size={34} color={th.sub} /><Txt s={{ color: th.sub, marginTop: 8, textAlign: 'center' }}>{text}</Txt></View>; };
const H = ({ children }) => <Txt s={{ fontSize: 13, fontWeight: '700', opacity: 0.55, marginTop: 20, marginBottom: 8, letterSpacing: 0.6 }}>{String(children).toUpperCase()}</Txt>;

function Sheet({ visible, onClose, children }) {
  const { th } = useApp();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: th.dark ? 'rgba(18,18,24,0.78)' : 'rgba(242,242,247,0.82)', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', borderTopWidth: 0.5, borderColor: th.line, padding: 20, paddingBottom: 34, maxHeight: '88%' }}>
          <BlurView intensity={90} tint={th.dark ? 'dark' : 'light'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TaskRow({ t, onEdit }) {
  const { delTask } = useApp();
  const dRef = useRef(); dRef.current = delTask;
  const x = useRef(new Animated.Value(0)).current;
  const back = () => Animated.spring(x, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dy) < 10,
    onPanResponderMove: (_, g) => x.setValue(Math.max(-140, Math.min(0, g.dx))),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -90) Alert.alert('Delete task?', t.title, [{ text: 'Cancel', style: 'cancel', onPress: back }, { text: 'Delete', style: 'destructive', onPress: () => dRef.current(t.id) }]);
      else back();
    },
    onPanResponderTerminate: back,
  }), [t.id, t.title]);
  return (
    <View>
      <Animated.View style={{ position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center', opacity: x.interpolate({ inputRange: [-90, -20, 0], outputRange: [1, 0.5, 0] }) }}><Ionicons name="trash" size={22} color="#FF453A" /></Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}><TaskRowBase t={t} onEdit={onEdit} /></Animated.View>
    </View>
  );
}

function TaskRowBase({ t, onEdit }) {
  const { th, toggleTask, delTask, data } = useApp();
  const pr = data.projects.find((p) => p.id === t.project);
  const late = !t.done && t.due && t.due < ymd(new Date());
  const scale = useRef(new Animated.Value(1)).current;
  const tap = () => { Animated.sequence([Animated.timing(scale, { toValue: 1.3, duration: 90, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, useNativeDriver: true })]).start(); toggleTask(t.id); };
  return (
    <Pressable onPress={() => onEdit(t)} onLongPress={() => Alert.alert('Delete task?', t.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => delTask(t.id) }])} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11 }}>
      <Pressable onPress={tap} hitSlop={10}>
        <Animated.View style={{ transform: [{ scale }] }}><Ionicons name={t.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={t.done ? th.accent : PRI_C[t.pri]} /></Animated.View>
      </Pressable>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt s={{ fontSize: 16, textDecorationLine: t.done ? 'line-through' : 'none', opacity: t.done ? 0.45 : 1 }}>{t.title}</Txt>
        <Txt s={{ fontSize: 12, color: late ? '#FF453A' : th.sub, marginTop: 2 }}>{[t.due && (late ? 'Overdue · ' : '') + fmt(t.due), pr && pr.name, t.remind && '🔔', t.repeat && '🔁', t.sub && t.sub.length > 0 && `${t.sub.filter((s) => s.d).length}/${t.sub.length} ✓`].filter(Boolean).join(' · ')}</Txt>
      </View>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRI_C[t.pri] }} />
    </Pressable>
  );
}

function Today({ edit, openQuick }) {
  const { th, data, toggleHabit, openStreak } = useApp();
  const sk = useMemo(() => calcStreak(data), [data.tasks, data.habits]);
  const ins = useSafeAreaInsets();
  const now = new Date(), key = ymd(now), hr = now.getHours();
  const open = data.tasks.filter((t) => !t.done && t.due && t.due <= key).sort((a, b) => b.pri - a.pri);
  const doneToday = data.tasks.filter((t) => t.done && (t.completedAt ? ymd(new Date(t.completedAt)) === key : t.due === key));
  const total = open.length + doneToday.length;
  const habits = data.habits.filter((h) => !h.archived && h.days.includes(now.getDay()));
  const hDone = habits.filter((h) => h.log[key]).length;
  const msgs = ['Small steps, steady orbit.', 'One thing at a time.', 'Start with what matters.', 'Progress beats perfection.', 'Make today count.', 'Keep your momentum.', 'Rest is productive too.'];
  const focus = open[0];
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: ins.top + 16, paddingBottom: 130 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt s={{ fontSize: 28, fontWeight: '700' }}>{hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}</Txt>
        <Press onPress={openStreak} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, backgroundColor: th.chip }}><Flame size={20} on={sk.cur > 0} /><Txt s={{ fontWeight: '800', marginLeft: 5 }}>{sk.cur}</Txt></Press>
      </View>
      <Txt s={{ color: th.sub, marginTop: 2 }}>{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Txt>
      <Txt s={{ color: th.sub, fontSize: 13, marginTop: 4 }}>{msgs[(now.getDate() + now.getMonth()) % msgs.length]}</Txt>
      <Glass style={{ marginTop: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Txt s={{ fontWeight: '600' }}>Daily progress</Txt><Txt s={{ color: th.sub }}>{doneToday.length}/{total} tasks · {hDone}/{habits.length} habits</Txt>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 }}>
          <Ring pct={total ? doneToday.length / total : 0} label={`${Math.round((total ? doneToday.length / total : 0) * 100)}%`} caption="Tasks" />
          <Ring pct={habits.length ? hDone / habits.length : 0} label={`${hDone}/${habits.length}`} caption="Habits" />
        </View>
      </Glass>
      {focus && <><H>Daily focus</H><Glass><Txt s={{ fontSize: 18, fontWeight: '600' }}>{focus.title}</Txt><Txt s={{ color: th.sub, marginTop: 4 }}>{PRI[focus.pri]} priority</Txt></Glass></>}
      <H>Today & overdue</H>
      <Glass pad={12}>
        {open.length === 0 && doneToday.length === 0 ? <Empty icon="sparkles-outline" text="Nothing scheduled. Tap + to plan your day." /> : [...open, ...doneToday].map((t) => <TaskRow key={t.id} t={t} onEdit={edit} />)}
      </Glass>
      <H>Habits</H>
      <Glass pad={12}>
        {habits.length === 0 ? <Empty icon="leaf-outline" text="No habits scheduled today." /> : habits.map((h) => (
          <Pressable key={h.id} onPress={() => toggleHabit(h.id, key)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
            <Ionicons name={h.log[key] ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={th.accent} /><Txt s={{ marginLeft: 12 }}>{h.name}</Txt>
          </Pressable>
        ))}
      </Glass>
    </ScrollView>
  );
}

function Calendar({ edit }) {
  const { th, data } = useApp();
  const ins = useSafeAreaInsets();
  const [sel, setSel] = useState(ymd(new Date()));
  const [mode, setMode] = useState('month');
  const ws = data.settings.weekStart, cur = parseD(sel), today = ymd(new Date());
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  let cells = [];
  if (mode === 'month') { const off = (first.getDay() - ws + 7) % 7; for (let i = 0; i < 42; i++) cells.push(addDays(first, i - off)); }
  else { const off = (cur.getDay() - ws + 7) % 7; for (let i = 0; i < 7; i++) cells.push(addDays(cur, i - off)); }
  const move = (n) => setSel(ymd(mode === 'month' ? new Date(cur.getFullYear(), cur.getMonth() + n, 1) : addDays(cur, n * 7)));
  const agenda = data.tasks.filter((t) => t.due === sel);
  const dayNames = Array.from({ length: 7 }, (_, i) => DAYS[(i + ws) % 7]);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: ins.top + 16, paddingBottom: 130 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt s={{ fontSize: 26, fontWeight: '700' }}>{cur.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => move(-1)} hitSlop={10}><Ionicons name="chevron-back" size={24} color={th.text} /></Pressable>
          <Pressable onPress={() => setSel(today)} hitSlop={10}><Ionicons name="today-outline" size={22} color={th.accent} style={{ marginHorizontal: 12 }} /></Pressable>
          <Pressable onPress={() => move(1)} hitSlop={10}><Ionicons name="chevron-forward" size={24} color={th.text} /></Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 12 }}><Chip label="Month" on={mode === 'month'} onPress={() => setMode('month')} /><Chip label="Week" on={mode === 'week'} onPress={() => setMode('week')} /></View>
      <Glass style={{ marginTop: 14 }} pad={10}>
        <View style={{ flexDirection: 'row' }}>{dayNames.map((d, i) => <Txt key={i} s={{ flex: 1, textAlign: 'center', color: th.sub, fontSize: 12 }}>{d}</Txt>)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d) => {
            const k = ymd(d), items = data.tasks.filter((t) => t.due === k), isSel = k === sel, other = mode === 'month' && d.getMonth() !== cur.getMonth();
            const late = items.some((t) => !t.done && k < today), allDone = items.length && items.every((t) => t.done);
            return (
              <Pressable key={k} onPress={() => setSel(k)} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 7 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? th.accent : 'transparent', borderWidth: k === today && !isSel ? 1.5 : 0, borderColor: th.accent }}>
                  <Txt s={{ color: isSel ? th.on : th.text, opacity: other ? 0.45 : 1 }}>{d.getDate()}</Txt>
                </View>
                <View style={{ height: 5, width: 5, borderRadius: 3, marginTop: 2, backgroundColor: items.length ? (late ? '#FF453A' : allDone ? '#30D158' : th.accent) : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
      </Glass>
      <H>{fmt(sel)}</H>
      <Glass pad={12}>{agenda.length === 0 ? <Empty icon="calendar-outline" text="Nothing planned for this day." /> : agenda.map((t) => <TaskRow key={t.id} t={t} onEdit={edit} />)}</Glass>
    </ScrollView>
  );
}

function Tasks({ edit, editNote }) {
  const { th, data, setData } = useApp();
  const ins = useSafeAreaInsets();
  const [seg, setSeg] = useState('tasks'), [q, setQ] = useState(''), [flt, setFlt] = useState('open'), [proj, setProj] = useState(null), [sort, setSort] = useState('due'), [pf, setPf] = useState(null), [np, setNp] = useState('');
  const today = ymd(new Date());
  const list = useMemo(() => {
    let l = data.tasks.filter((t) => (flt === 'all' || (flt === 'open' && !t.done) || (flt === 'done' && t.done) || (flt === 'overdue' && !t.done && t.due && t.due < today)) && (!proj || t.project === proj) && (pf === null || t.pri === pf) && t.title.toLowerCase().includes(q.toLowerCase()));
    return l.sort((a, b) => sort === 'pri' ? b.pri - a.pri : sort === 'new' ? b.created - a.created : (a.due || '9') < (b.due || '9') ? -1 : 1);
  }, [data.tasks, q, flt, proj, sort, pf]);
  const notes = data.notes.filter((n) => (n.title + n.body).toLowerCase().includes(q.toLowerCase()));
  const projs = data.projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || !q);
  const addProject = () => {
    const name = np.trim(); if (!name) return;
    setData((d) => ({ ...d, projects: [...d.projects, { id: uid(), name, color: ACCENTS[d.projects.length % ACCENTS.length] }] })); setNp('');
  };
  const delProject = (p) => Alert.alert('Delete project?', 'Its tasks stay, but lose the project.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { setProj(null); setData((d) => ({ ...d, projects: d.projects.filter((x) => x.id !== p.id), tasks: d.tasks.map((t) => (t.project === p.id ? { ...t, project: null } : t)) })); } }]);
  const pct = (p) => { const ts = data.tasks.filter((t) => t.project === p.id); return ts.length ? ts.filter((t) => t.done).length / ts.length : 0; };
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: ins.top + 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
      <Txt s={{ fontSize: 28, fontWeight: '700', marginBottom: 12 }}>Tasks</Txt>
      <View style={{ flexDirection: 'row', marginBottom: 12 }}><Chip label="Tasks" on={seg === 'tasks'} onPress={() => setSeg('tasks')} /><Chip label="Notes" on={seg === 'notes'} onPress={() => setSeg('notes')} /></View>
      <Input value={q} onChangeText={setQ} placeholder="Search tasks, projects, notes" />
      {seg === 'tasks' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{['open', 'overdue', 'done', 'all'].map((f) => <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} on={flt === f} onPress={() => setFlt(f)} />)}</ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {[['due', 'Sort: due'], ['pri', 'Sort: priority'], ['new', 'Sort: newest']].map(([k, l]) => <Chip key={k} label={l} on={sort === k} onPress={() => setSort(k)} />)}
            {PRI.map((p, i) => <Chip key={p} label={p} color={PRI_C[i]} on={pf === i} onPress={() => setPf(pf === i ? null : i)} />)}
          </ScrollView>
          <H>Projects</H>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip label="All" on={!proj} onPress={() => setProj(null)} />
            {projs.map((p) => <Chip key={p.id} onLongPress={() => delProject(p)} label={`${p.name} ${Math.round(pct(p) * 100)}%`} color={p.color} on={proj === p.id} onPress={() => setProj(proj === p.id ? null : p.id)} />)}
          </ScrollView>
          <View style={{ flexDirection: 'row', marginTop: 10 }}>
            <Input value={np} onChangeText={setNp} placeholder="New project (long-press chip to delete)" style={{ flex: 1, marginBottom: 0, marginRight: 8 }} onSubmitEditing={addProject} />
            <Pressable onPress={addProject} style={{ justifyContent: 'center' }}><Ionicons name="add-circle" size={34} color={th.accent} /></Pressable>
          </View>
          <H>{list.length} tasks</H>
          <Glass pad={12}>{list.length === 0 ? <Empty icon="checkbox-outline" text="No tasks match." /> : list.map((t) => <TaskRow key={t.id} t={t} onEdit={edit} />)}</Glass>
        </>
      ) : (
        <>
          <Btn label="New note" onPress={() => editNote(null)} />
          <View style={{ marginTop: 12 }}>
            {notes.length === 0 ? <Empty icon="document-text-outline" text="No notes yet." /> : notes.map((n) => (
              <Pressable key={n.id} onPress={() => editNote(n)} style={{ marginBottom: 10 }}><Glass><Txt s={{ fontWeight: '600', fontSize: 16 }}>{n.title || 'Untitled'}</Txt><Txt numberOfLines={2} s={{ color: th.sub, marginTop: 4 }}>{n.body}</Txt></Glass></Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Habits() {
  const { th, data, setData, toggleHabit } = useApp();
  const ins = useSafeAreaInsets();
  const [name, setName] = useState(''), [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const today = new Date(), key = ymd(today);
  const add = () => {
    if (!name.trim() || !days.length) return Alert.alert('Name and at least one weekday are required.');
    setData((d) => ({ ...d, habits: [...d.habits, { id: uid(), name: name.trim(), days, log: {}, archived: false }] })); setName('');
  };
  const arch = (h) => Alert.alert('Archive habit?', h.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive', onPress: () => setData((d) => ({ ...d, habits: d.habits.map((x) => (x.id === h.id ? { ...x, archived: true } : x)) })) }]);
  const list = data.habits.filter((h) => !h.archived);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: ins.top + 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
      <Txt s={{ fontSize: 28, fontWeight: '700', marginBottom: 14 }}>Habits</Txt>
      <Glass>
        <Input value={name} onChangeText={setName} placeholder="New habit" />
        <View style={{ flexDirection: 'row', marginBottom: 12 }}>{DAYS.map((d, i) => <Chip key={i} label={d} on={days.includes(i)} onPress={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} />)}</View>
        <Btn label="Add habit" onPress={add} />
      </Glass>
      <H>Your habits (long-press to archive)</H>
      {list.length === 0 && <Empty icon="leaf-outline" text="Create your first habit above." />}
      {list.map((h) => {
        const st = streaks(h, today), week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
        const sch = week.filter((d) => h.days.includes(d.getDay())), done = sch.filter((d) => h.log[ymd(d)]).length;
        return (
          <Pressable key={h.id} onLongPress={() => arch(h)} style={{ marginBottom: 12 }}>
            <Glass>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View><Txt s={{ fontSize: 17, fontWeight: '600' }}>{h.name}</Txt><Txt s={{ color: th.sub, fontSize: 12, marginTop: 2 }}>🔥 {st.cur} current · 🏆 {st.best} best · {sch.length ? Math.round((done / sch.length) * 100) : 0}% this week</Txt></View>
                {h.days.includes(today.getDay()) && <Press onPress={() => toggleHabit(h.id, key)}><Ionicons name={h.log[key] ? 'checkmark-circle' : 'ellipse-outline'} size={34} color={th.accent} /></Press>}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                {week.map((d) => { const k = ymd(d), s = h.days.includes(d.getDay()); return (
                  <Pressable key={k} onPress={() => s && toggleHabit(h.id, k)} style={{ alignItems: 'center' }}>
                    <Txt s={{ fontSize: 11, color: th.sub }}>{DAYS[d.getDay()]}</Txt>
                    <View style={{ width: 28, height: 28, borderRadius: 14, marginTop: 4, backgroundColor: h.log[k] ? th.accent : th.chip, opacity: s ? 1 : 0.25 }} />
                  </Pressable>); })}
              </View>
            </Glass>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Profile() {
  const { th, data, setData, setS, openLog, openStreak } = useApp();
  const ins = useSafeAreaInsets(), s = data.settings;
  const exp = () => Share.share({ message: JSON.stringify(data, null, 2), title: 'OrbitPlans export' }).catch(() => {});
  const reset = () => Alert.alert('Reset all data?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: async () => { try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (e) {} setData(() => DEF); } }]);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: ins.top + 16, paddingBottom: 130 }}>
      <Txt s={{ fontSize: 28, fontWeight: '700' }}>Profile</Txt>
      <H>Themes</H>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {THEMES.map((t) => {
          const on = s.accent === t.accent && s.scene === t.scene && s.bg === t.bg && s.theme === t.mode && !s.bgCustom;
          const dk = t.mode === 'dark';
          return (
            <Press key={t.n} onPress={() => setS({ theme: t.mode, accent: t.accent, scene: t.scene, bg: t.bg, bgCustom: '', orbs: true })} style={{ marginRight: 12, alignItems: 'center' }}>
              <View style={{ width: 84, height: 112, borderRadius: 20, backgroundColor: BGS[t.bg][dk ? 0 : 1], borderWidth: on ? 3 : 1, borderColor: on ? th.text : th.line, overflow: 'hidden', padding: 10, justifyContent: 'flex-end' }}>
                <View style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: 35, backgroundColor: SCENES[t.scene][0], opacity: 0.55 }} />
                <View style={{ height: 10, width: 40, borderRadius: 5, backgroundColor: t.accent, marginBottom: 6 }} />
                <View style={{ height: 26, borderRadius: 8, backgroundColor: dk ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.1)' }} />
              </View>
              <Txt s={{ fontSize: 12, marginTop: 6, fontWeight: on ? '800' : '500' }}>{t.n}</Txt>
            </Press>
          );
        })}
      </ScrollView>
      <H>Appearance</H>
      <Glass>
        <View style={{ flexDirection: 'row' }}>{['system', 'light', 'dark'].map((t) => <Chip key={t} label={t} on={s.theme === t} onPress={() => setS({ theme: t })} />)}</View>
        <Txt s={{ marginTop: 14, marginBottom: 10, color: th.sub, fontSize: 12 }}>ACCENT</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{ACCENTS.map((c) => <Press key={c} onPress={() => setS({ accent: c })} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, marginRight: 12, marginBottom: 12, borderWidth: s.accent === c ? 3 : 0, borderColor: th.text }} />)}</View>
        <Txt s={{ marginTop: 4, marginBottom: 10, color: th.sub, fontSize: 12 }}>BACKGROUND SCENE</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{Object.keys(SCENES).map((n) => <Chip key={n} label={n} color={SCENES[n][1]} on={s.scene === n} onPress={() => setS({ scene: n })} />)}</ScrollView>
        <Row label="Ambient glow"><Switch value={s.orbs} onValueChange={(v) => setS({ orbs: v })} /></Row>
        <Txt s={{ marginTop: 12, marginBottom: 10, color: th.sub, fontSize: 12 }}>APP BACKGROUND</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{Object.keys(BGS).map((n) => <Chip key={n} label={n} on={s.bg === n && !s.bgCustom} onPress={() => setS({ bg: n, bgCustom: '' })} />)}</ScrollView>
        <Input value={s.bgCustom || ''} onChangeText={(v) => setS({ bgCustom: v })} placeholder="Custom color, e.g. #1B2A41" autoCapitalize="none" style={{ marginTop: 10, marginBottom: 0 }} />
      </Glass>
      <H>Preferences</H>
      <Glass>
        <Row label="Haptic feedback"><Switch value={s.haptics} onValueChange={(v) => setS({ haptics: v })} trackColor={{ true: th.accent }} /></Row>
        <Row label="Reminders"><Switch value={s.notif} onValueChange={(v) => setS({ notif: v })} trackColor={{ true: th.accent }} /></Row>
        <Row label="24-hour time"><Switch value={s.h24} onValueChange={(v) => setS({ h24: v })} trackColor={{ true: th.accent }} /></Row>
        <Row label="Reminder time"><View style={{ flexDirection: 'row', alignItems: 'center' }}><Pressable onPress={() => setS({ remindHour: (s.remindHour + 23) % 24 })}><Ionicons name="remove-circle-outline" size={26} color={th.accent} /></Pressable><Txt s={{ marginHorizontal: 10 }}>{s.h24 ? `${pad(s.remindHour)}:00` : `${s.remindHour % 12 || 12}:00 ${s.remindHour < 12 ? 'AM' : 'PM'}`}</Txt><Pressable onPress={() => setS({ remindHour: (s.remindHour + 1) % 24 })}><Ionicons name="add-circle-outline" size={26} color={th.accent} /></Pressable></View></Row>
        <Row label="Week starts"><View style={{ flexDirection: 'row' }}><Chip label="Sun" on={s.weekStart === 0} onPress={() => setS({ weekStart: 0 })} /><Chip label="Mon" on={s.weekStart === 1} onPress={() => setS({ weekStart: 1 })} /></View></Row>
        <Txt s={{ marginTop: 6, marginBottom: 6 }}>Start screen</Txt>
        <View style={{ flexDirection: 'row' }}>{['Today', 'Calendar', 'Tasks', 'Habits'].map((n, i) => <Chip key={n} label={n} on={s.start === i} onPress={() => setS({ start: i })} />)}</View>
      </Glass>
      <H>Data</H>
      <Glass><Btn label="Export JSON" onPress={exp} flat /><View style={{ height: 10 }} /><Btn label="Reset all data" onPress={reset} danger /></Glass>
      <H>About</H>
      <Glass><Btn label="Streak & badges" onPress={openStreak} flat /><View style={{ height: 10 }} /><Btn label="Update log" onPress={openLog} flat /><View style={{ height: 12 }} /><Txt>OrbitPlans {APP_VER}</Txt><Txt s={{ color: th.sub, fontSize: 12, marginTop: 4 }}>All data is stored on this device. On iOS, reminders need notification permission and fire only if the app was allowed to schedule them; Expo Go/Snack may limit notifications.</Txt></Glass>
    </ScrollView>
  );
}

function TaskSheet({ visible, onClose, task, draft, setDraft }) {
  const { th, data, saveTask } = useApp();
  const isNew = !task;
  const [f, setF] = useState(draft), [st, setSt] = useState('');
  useEffect(() => { if (visible) setF(task ? { title: task.title, desc: task.desc, dueText: task.due || '', pri: task.pri, project: task.project, remind: task.remind, repeat: task.repeat || null, sub: task.sub || [] } : draft); setSt(''); }, [visible, task]);
  const upd = (p) => { const n = { ...f, ...p }; setF(n); if (isNew) setDraft(n); };
  const due = parseDate(f.dueText || '');
  const save = () => {
    if (!f.title.trim()) return Alert.alert('Title required');
    if (due === undefined) return Alert.alert('Date not understood', 'Try: today, tomorrow, next monday, or YYYY-MM-DD.');
    if (f.remind && !due) return Alert.alert('Reminders need a due date');
    saveTask(task, { title: f.title.trim(), desc: f.desc, due, pri: f.pri, project: f.project, remind: f.remind, repeat: f.repeat || null, sub: f.sub || [] });
    if (isNew) setDraft({ title: '', desc: '', dueText: '', pri: 1, project: null, remind: false });
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt s={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}>{isNew ? 'Quick add' : 'Edit task'}</Txt>
      <Input value={f.title} onChangeText={(v) => upd({ title: v })} placeholder="Title" autoFocus={isNew} />
      <Input value={f.desc} onChangeText={(v) => upd({ desc: v })} placeholder="Description (optional)" multiline />
      <Input value={f.dueText} onChangeText={(v) => upd({ dueText: v })} placeholder="Due: today, tomorrow, next monday, 2026-10-20" autoCapitalize="none" />
      <Txt s={{ fontSize: 12, color: due === undefined ? '#FF453A' : th.sub, marginBottom: 10 }}>{due === undefined ? 'Not understood' : due ? '→ ' + fmt(due) : 'No due date'}</Txt>
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>{PRI.map((p, i) => <Chip key={p} label={p} color={PRI_C[i]} on={f.pri === i} onPress={() => upd({ pri: i })} />)}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        <Chip label="No project" on={!f.project} onPress={() => upd({ project: null })} />
        {data.projects.map((p) => <Chip key={p.id} label={p.name} color={p.color} on={f.project === p.id} onPress={() => upd({ project: p.id })} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><Txt>Reminder</Txt><Switch value={f.remind} onValueChange={(v) => upd({ remind: v })} trackColor={{ true: th.accent }} /></View>
      <Txt s={{ fontSize: 12, color: th.sub, marginBottom: 6 }}>REPEAT</Txt>
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>{[[null, 'Never'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([k, l]) => <Chip key={l} label={l} on={(f.repeat || null) === k} onPress={() => upd({ repeat: k })} />)}</View>
      <Txt s={{ fontSize: 12, color: th.sub, marginBottom: 6 }}>SUBTASKS</Txt>
      {(f.sub || []).map((s) => (
        <Pressable key={s.id} onPress={() => upd({ sub: f.sub.map((x) => (x.id === s.id ? { ...x, d: !x.d } : x)) })} onLongPress={() => upd({ sub: f.sub.filter((x) => x.id !== s.id) })} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Ionicons name={s.d ? 'checkbox' : 'square-outline'} size={20} color={th.accent} /><Txt s={{ marginLeft: 10, opacity: s.d ? 0.5 : 1 }}>{s.t}</Txt>
        </Pressable>
      ))}
      <Input value={st} onChangeText={setSt} placeholder="Add subtask (long-press to remove)" onSubmitEditing={() => { if (st.trim()) { upd({ sub: [...(f.sub || []), { id: uid(), t: st.trim(), d: false }] }); setSt(''); } }} />
      <Btn label="Save" onPress={save} />
    </Sheet>
  );
}

function LogSheet({ visible, onClose }) {
  const { th } = useApp();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt s={{ fontSize: 24, fontWeight: '700' }}>What's new</Txt>
      {UPDATES.map((u, i) => (
        <View key={u.v} style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Txt s={{ fontWeight: '700', fontSize: 17 }}>v{u.v}</Txt>
            {i === 0 && <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: th.accent }}><Txt s={{ color: th.on, fontSize: 11, fontWeight: '700' }}>NEW</Txt></View>}
          </View>
          <Txt s={{ color: th.sub, fontSize: 12, marginBottom: 4 }}>{u.d}</Txt>
          {u.n.map((x) => <Txt key={x} s={{ marginTop: 4 }}>•  {x}</Txt>)}
        </View>
      ))}
      <View style={{ height: 18 }} /><Btn label="Got it" onPress={onClose} />
    </Sheet>
  );
}

function NoteSheet({ note, visible, onClose }) {
  const { setData } = useApp();
  const [t, setT] = useState(''), [b, setB] = useState('');
  useEffect(() => { if (visible) { setT(note ? note.title : ''); setB(note ? note.body : ''); } }, [visible, note]);
  const save = () => {
    if (!t.trim() && !b.trim()) return onClose();
    setData((d) => ({ ...d, notes: note ? d.notes.map((n) => (n.id === note.id ? { ...n, title: t, body: b } : n)) : [{ id: uid(), title: t, body: b }, ...d.notes] })); onClose();
  };
  const del = () => Alert.alert('Delete note?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { setData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== note.id) })); onClose(); } }]);
  return (
    <Sheet visible={visible} onClose={save}>
      <Input value={t} onChangeText={setT} placeholder="Title" />
      <Input value={b} onChangeText={setB} placeholder="Write something…" multiline style={{ minHeight: 160, textAlignVertical: 'top' }} />
      <Btn label="Done" onPress={save} />
      {note && <><View style={{ height: 10 }} /><Btn label="Delete note" danger onPress={del} /></>}
    </Sheet>
  );
}

const TABS = [['Today', 'sunny'], ['Calendar', 'calendar'], ['Tasks', 'checkbox'], ['Habits', 'leaf'], ['Profile', 'person']];

function Root() {
  const sys = useColorScheme();
  const ins = useSafeAreaInsets();
  const [data, setDataRaw0] = useState(DEF), [ready, setReady] = useState(false), [tab, setTab] = useState(0);
  const [bw, setBw] = useState(0), ind = useRef(new Animated.Value(0)).current;
  const setDataRaw = (f) => { smooth(); setDataRaw0(f); };
  const [showLog, setShowLog] = useState(false), [showStreak, setShowStreak] = useState(false), [toast, setToast] = useState(null);
  const st = useMemo(() => calcStreak(data), [data.tasks, data.habits]);
  const prevCur = useRef(null);
  useEffect(() => {
    if (!ready) return;
    if (prevCur.current !== null && st.cur > prevCur.current) {
      const b = BADGES.find((x) => x[0] === st.cur);
      setToast({ k: Date.now(), t: b ? `🏆 ${b[1]} unlocked · ${st.cur} days` : `🔥 ${st.cur}-day streak!` });
      if (data.settings.haptics) { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch (e) {} }
    }
    prevCur.current = st.cur;
  }, [st.cur, ready]);
  useEffect(() => { if (ready && data.settings.seen !== APP_VER) setShowLog(true); }, [ready]);
  useEffect(() => { Animated.spring(ind, { toValue: tab, bounciness: 9, speed: 14, useNativeDriver: true }).start(); }, [tab]);
  const [taskModal, setTaskModal] = useState({ open: false, task: null }), [noteModal, setNoteModal] = useState({ open: false, note: null });
  const [draft, setDraft] = useState({ title: '', desc: '', dueText: '', pri: 1, project: null, remind: false });
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) { const p = JSON.parse(raw); const m = { ...DEF, ...p, settings: { ...DEF.settings, ...(p.settings || {}) }, v: VERSION }; setDataRaw(m); setTab(m.settings.start); }
      } catch (e) {}
      loaded.current = true; setReady(true);
    })();
    try { Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) }); } catch (e) {}
  }, []);
  useEffect(() => { if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {}); }, [data]);

  const th = useMemo(() => {
    const st = data.settings, cu = /^#[0-9a-f]{6}$/i.test(st.bgCustom || '') ? st.bgCustom : null;
    const dk = cu ? lum(cu) < 0.4 : st.theme === 'system' ? sys !== 'light' : st.theme === 'dark';
    const bg = cu || (BGS[st.bg] || BGS.Default)[dk ? 0 : 1];
    const acc = lum(st.accent) > 0.85 && !dk ? '#1C1C1E' : st.accent;
    return { dark: dk, accent: acc, on: onColor(acc), sw: lum(acc) > 0.85 ? '#34C759' : acc, bg, text: dk ? '#FFFFFF' : '#000000', sub: dk ? '#B8B8C2' : '#48484C', card: dk ? 'rgba(44,44,52,0.5)' : 'rgba(255,255,255,0.62)', line: dk ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)', chip: dk ? 'rgba(120,120,128,0.32)' : 'rgba(120,120,128,0.18)' };
  }, [sys, data.settings.theme, data.settings.accent, data.settings.bg, data.settings.bgCustom]);
  const dark = th.dark;
  const hap = (style = Haptics.ImpactFeedbackStyle.Light) => { if (data.settings.haptics) { try { Haptics.impactAsync(style).catch(() => {}); } catch (e) {} } };
  const setData = (fn) => setDataRaw((d) => fn(d));
  const setS = (p) => setDataRaw((d) => ({ ...d, settings: { ...d.settings, ...p } }));

  const patchTask = (id, p) => setDataRaw((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...p, updated: Date.now() } : t)) }));
  const toggleTask = async (id) => {
    hap(Haptics.ImpactFeedbackStyle.Medium);
    const t = data.tasks.find((x) => x.id === id); if (!t) return;
    const n = { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null };
    const nid = await syncNotif(n, data.settings);
    patchTask(id, { done: n.done, completedAt: n.completedAt, nid });
    if (n.done && t.repeat && t.due) {
      const nt = { ...t, id: uid(), done: false, completedAt: null, due: ymd(addDays(parseD(t.due), t.repeat === 'daily' ? 1 : 7)), nid: null, created: Date.now(), updated: Date.now(), sub: (t.sub || []).map((s) => ({ ...s, d: false })) };
      nt.nid = await syncNotif(nt, data.settings);
      setDataRaw((d) => ({ ...d, tasks: [nt, ...d.tasks] }));
    }
  };
  const delTask = async (id) => {
    const t = data.tasks.find((x) => x.id === id);
    try { if (t && t.nid) await Notifications.cancelScheduledNotificationAsync(t.nid); } catch (e) {}
    setDataRaw((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== id) }));
  };
  const saveTask = async (old, p) => {
    hap();
    const base = old || { id: uid(), done: false, nid: null, created: Date.now() };
    const n = { ...base, ...p, updated: Date.now() };
    n.nid = await syncNotif(n, data.settings);
    setDataRaw((d) => ({ ...d, tasks: old ? d.tasks.map((t) => (t.id === old.id ? n : t)) : [n, ...d.tasks] }));
  };
  const toggleHabit = (id, k) => { hap(); setDataRaw((d) => ({ ...d, habits: d.habits.map((h) => { if (h.id !== id) return h; const log = { ...h.log }; if (log[k]) delete log[k]; else log[k] = true; return { ...h, log }; }) })); };

  const ctx = { th, data, setData, setS, toggleTask, delTask, saveTask, toggleHabit, openLog: () => setShowLog(true), openStreak: () => setShowStreak(true) };
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  const edit = (t) => setTaskModal({ open: true, task: t });
  return (
    <Ctx.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
        <Orbs />
        <Swap k={tab}>
        {tab === 0 && <Today edit={edit} />}
        {tab === 1 && <Calendar edit={edit} />}
        {tab === 2 && <Tasks edit={edit} editNote={(n) => setNoteModal({ open: true, note: n })} />}
        {tab === 3 && <Habits />}
        {tab === 4 && <Profile />}
        </Swap>
        {tab !== 4 && (
          <View style={{ position: 'absolute', right: 22, bottom: ins.bottom + 96 }}>
            <Press onPress={() => { hap(); setTaskModal({ open: true, task: null }); }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
              <Ionicons name="add" size={30} color={th.on} />
            </Press>
          </View>
        )}
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: ins.bottom + 12 }}>
          <View style={{ borderRadius: 30, overflow: 'hidden', borderWidth: 0.5, borderColor: th.line, backgroundColor: th.dark ? 'rgba(30,30,38,0.4)' : 'rgba(255,255,255,0.5)' }}>
            <BlurView intensity={95} tint={dark ? 'dark' : 'light'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View onLayout={(e) => setBw(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', paddingVertical: 10 }}>
              {bw > 0 && <Animated.View style={{ position: 'absolute', top: 5, bottom: 5, left: 4, width: bw / 5 - 8, borderRadius: 24, backgroundColor: th.accent + '26', transform: [{ translateX: ind.interpolate({ inputRange: [0, 4], outputRange: [0, (bw / 5) * 4] }) }] }} />}
              {TABS.map(([n, ic], i) => (
                <Pressable key={n} onPress={() => { hap(); setTab(i); }} style={{ flex: 1, alignItems: 'center' }}>
                  <TabIcon on={tab === i} name={ic} />
                  <Txt s={{ fontSize: 10, marginTop: 2, fontWeight: tab === i ? '700' : '500', color: tab === i ? th.accent : th.sub }}>{n}</Txt>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
        <TaskSheet visible={taskModal.open} task={taskModal.task} onClose={() => setTaskModal((m) => ({ ...m, open: false }))} draft={draft} setDraft={setDraft} />
        <LogSheet visible={showLog} onClose={() => { setShowLog(false); setS({ seen: APP_VER }); }} />
        <StreakSheet visible={showStreak} onClose={() => setShowStreak(false)} />
        {toast && <Toast key={toast.k} text={toast.t} onDone={() => setToast(null)} />}
        <NoteSheet visible={noteModal.open} note={noteModal.note} onClose={() => setNoteModal((m) => ({ ...m, open: false }))} />
      </View>
    </Ctx.Provider>
  );
}

export default function App() {
  return <SafeAreaProvider><Root /></SafeAreaProvider>;
}
