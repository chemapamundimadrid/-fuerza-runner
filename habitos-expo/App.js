import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Share, Switch, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

const KEY = 'habitos-v1';
const DEFAULT_REMIND = { on: false, hour: 21, minute: 0 };
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});
const COLORS = ['#22c55e', '#0ea5e9', '#a855f7', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
const EMOJIS = ['💧', '🏃', '📚', '🧘', '😴', '🥗', '💪', '🚭', '✍️', '💊', '🦷', '☀️'];
const DN = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const C = { bg: '#0f172a', card: '#1e293b', line: '#334155', text: '#f8fafc', muted: '#94a3b8' };

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const toDate = (s) => new Date(s + 'T12:00:00');
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => (toDate(s).getDay() + 6) % 7; // 0 = lunes

export default function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

function App() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState({ habits: [], log: {} });
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('hoy');
  const [day, setDay] = useState(iso(new Date()));
  const [editing, setEditing] = useState(null); // habit | 'new' | null

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && setData((d) => ({ ...d, ...JSON.parse(v) })))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, [data, ready]);

  const remind = data.remind || DEFAULT_REMIND;
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        if (!remind.on) return;
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Hábitos', body: 'Revisa y marca tus hábitos de hoy' },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: remind.hour, minute: remind.minute },
        });
      } catch (e) {}
    })();
  }, [ready, remind.on, remind.hour, remind.minute]);
  const setRemind = async (patch) => {
    if (patch.on) {
      const p = await Notifications.requestPermissionsAsync();
      if (!p.granted) { Alert.alert('Permiso denegado', 'Activa las notificaciones en Ajustes del iPhone.'); return; }
    }
    setData((d) => ({ ...d, remind: { ...(d.remind || DEFAULT_REMIND), ...patch } }));
  };
  const importData = (txt) => {
    try {
      const d = JSON.parse(txt);
      if (!Array.isArray(d.habits) || typeof d.log !== 'object') throw new Error();
      setData(d);
      Alert.alert('Importado', `${d.habits.length} hábitos`);
      return true;
    } catch (e) {
      Alert.alert('Datos no válidos');
      return false;
    }
  };

  const today = iso(new Date());
  const done = (id, d) => (data.log[d] || []).includes(id);
  const sched = (h, d) => h.days.includes(dow(d));

  const toggle = (id) =>
    setData((s) => {
      const cur = s.log[day] || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...s, log: { ...s.log, [day]: next } };
    });

  const streak = (h) => {
    let d = today, n = 0, first = true;
    for (let i = 0; i < 3650; i++) {
      if (sched(h, d)) {
        if (done(h.id, d)) n++;
        else if (!(first && d === today)) break;
      }
      first = false;
      d = addDays(d, -1);
    }
    return n;
  };
  const best = (h) => {
    const ks = Object.keys(data.log).sort();
    if (!ks.length) return 0;
    let d = ks[0], n = 0, b = 0;
    while (d <= today) {
      if (sched(h, d)) { if (done(h.id, d)) { n++; b = Math.max(b, n); } else n = 0; }
      d = addDays(d, 1);
    }
    return b;
  };
  const rate = (h, days) => {
    let s = 0, c = 0, d = today;
    for (let i = 0; i < days; i++) {
      if (sched(h, d)) { s++; if (done(h.id, d)) c++; }
      d = addDays(d, -1);
    }
    return s ? c / s : 0;
  };

  const saveHabit = (f) => {
    setData((s) => ({
      ...s,
      habits: f.id
        ? s.habits.map((h) => (h.id === f.id ? f : h))
        : [...s.habits, { ...f, id: 'h' + Date.now().toString(36) }],
    }));
    setEditing(null);
  };
  const deleteHabit = (id) =>
    Alert.alert('Borrar hábito', 'Se borra también su historial.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive',
        onPress: () => {
          setData((s) => ({
            habits: s.habits.filter((h) => h.id !== id),
            log: Object.fromEntries(Object.entries(s.log).map(([d, a]) => [d, a.filter((x) => x !== id)])),
          }));
          setEditing(null);
        },
      },
    ]);

  const list = data.habits.filter((h) => sched(h, day));
  const nDone = list.filter((h) => done(h.id, day)).length;
  const pct = list.length ? Math.round((nDone / list.length) * 100) : 0;
  const label = toDate(day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      {tab === 'hoy' ? (
        <FlatList
          contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
          data={list}
          keyExtractor={(h) => h.id}
          ListHeaderComponent={
            <View>
              <View style={s.nav}>
                <Pressable style={s.navBtn} onPress={() => setDay(addDays(day, -1))}><Text style={s.navTxt}>‹</Text></Pressable>
                <Text style={s.h1}>{day === today ? 'Hoy' : label.split(' ')[0]}</Text>
                <Pressable style={[s.navBtn, day >= today && { opacity: 0.3 }]} disabled={day >= today} onPress={() => setDay(addDays(day, 1))}><Text style={s.navTxt}>›</Text></Pressable>
              </View>
              <Text style={s.sub}>{label}</Text>
              <View style={s.bar}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
              <Text style={s.muted}>{nDone}/{list.length} completados · {pct}%</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={[s.muted, { textAlign: 'center', marginTop: 40 }]}>
              {data.habits.length ? 'Ningún hábito programado este día.' : 'Sin hábitos. Pulsa + para crear el primero.'}
            </Text>
          }
          renderItem={({ item: h }) => {
            const on = done(h.id, day);
            return (
              <View style={s.card}>
                <Pressable onPress={() => toggle(h.id)} style={[s.chk, { borderColor: h.color }, on && { backgroundColor: h.color }]}>
                  <Text style={s.chkTxt}>{on ? '✓' : h.emoji}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{h.name}</Text>
                  <Text style={s.meta}>🔥 {streak(h)} racha · {Math.round(rate(h, 30) * 100)}% 30d</Text>
                  <View style={s.week}>
                    {[6, 5, 4, 3, 2, 1, 0].map((i) => {
                      const d = addDays(day, -i);
                      return <View key={i} style={[s.dot, done(h.id, d) && { backgroundColor: h.color }, d === day && s.dotToday]} />;
                    })}
                  </View>
                </View>
                <Pressable onPress={() => setEditing(h)} hitSlop={10}><Text style={s.edit}>⋯</Text></Pressable>
              </View>
            );
          }}
        />
      ) : (
        <Stats habits={data.habits} done={done} sched={sched} streak={streak} best={best} rate={rate} today={today} log={data.log} remind={remind} setRemind={setRemind} data={data} importData={importData} />
      )}

      {tab === 'hoy' && (
        <Pressable style={[s.fab, { bottom: 76 + insets.bottom }]} onPress={() => setEditing('new')}>
          <Text style={s.fabTxt}>+</Text>
        </Pressable>
      )}

      <View style={[s.tabs, { paddingBottom: 8 + insets.bottom }]}>
        {[['hoy', 'Hoy'], ['stats', 'Estadísticas']].map(([k, t]) => (
          <Pressable key={k} style={[s.tab, tab === k && s.tabAct]} onPress={() => setTab(k)}>
            <Text style={{ color: tab === k ? C.text : C.muted, fontWeight: '600' }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {editing && (
        <HabitForm
          key={editing === 'new' ? 'new' : editing.id}
          habit={editing === 'new' ? null : editing}
          onSave={saveHabit}
          onDelete={deleteHabit}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

function Stats({ habits, done, sched, streak, best, rate, today, log, remind, setRemind, data, importData }) {
  const [importing, setImporting] = useState(false);
  const [txt, setTxt] = useState('');
  const cells = useMemo(() => Array.from({ length: 60 }, (_, i) => addDays(today, i - 59)), [today]);
  const avg = (n) => habits.reduce((a, h) => a + rate(h, n), 0) / habits.length;
  const total = Object.values(log).reduce((a, l) => a + l.length, 0);
  const box = (v, l) => (
    <View style={s.stat} key={l}><Text style={s.statV}>{v}</Text><Text style={s.statL}>{l}</Text></View>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[s.h1, { marginBottom: 12 }]}>Estadísticas</Text>
      {habits.length > 0 && <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {box(`${Math.round(avg(7) * 100)}%`, '7 días')}
        {box(`${Math.round(avg(30) * 100)}%`, '30 días')}
        {box(Math.max(...habits.map(streak)), 'mejor racha')}
        {box(total, 'total')}
      </View>}
      {habits.map((h) => (
        <View key={h.id} style={[s.card, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <Text style={s.name}>{h.emoji} {h.name}</Text>
          <Text style={s.meta}>Racha {streak(h)} · Mejor {best(h)} · 7d {Math.round(rate(h, 7) * 100)}% · 30d {Math.round(rate(h, 30) * 100)}%</Text>
          <View style={s.heat}>
            {cells.map((d) => (
              <View key={d} style={[s.heatCell, done(h.id, d) ? { backgroundColor: h.color } : !sched(h, d) && { opacity: 0.35 }]} />
            ))}
          </View>
        </View>
      ))}
      <View style={[s.card, { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.name}>⏰ Recordatorio diario</Text>
          <Switch value={remind.on} onValueChange={(on) => setRemind({ on })} />
        </View>
        {remind.on && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 10 }}>
            <Pressable style={s.navBtn} onPress={() => setRemind({ hour: (remind.hour + 23) % 24 })}><Text style={s.navTxt}>−</Text></Pressable>
            <Text style={s.h1}>{String(remind.hour).padStart(2, '0')}:{String(remind.minute).padStart(2, '0')}</Text>
            <Pressable style={s.navBtn} onPress={() => setRemind({ hour: (remind.hour + 1) % 24 })}><Text style={s.navTxt}>+</Text></Pressable>
            <Pressable style={s.navBtn} onPress={() => setRemind({ minute: (remind.minute + 15) % 60 })}><Text style={s.navTxt}>:15</Text></Pressable>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[s.btn, { backgroundColor: C.card }]} onPress={() => Share.share({ message: JSON.stringify(data) })}><Text style={s.btnTxt}>Exportar</Text></Pressable>
        <Pressable style={[s.btn, { backgroundColor: C.card }]} onPress={() => setImporting(true)}><Text style={s.btnTxt}>Importar</Text></Pressable>
      </View>
      {importing && (
        <Modal transparent animationType="slide" onRequestClose={() => setImporting(false)}>
          <Pressable style={s.overlay} onPress={() => setImporting(false)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.label}>Pega aquí el JSON exportado</Text>
              <TextInput style={[s.input, { height: 140 }]} multiline value={txt} onChangeText={setTxt} autoFocus />
              <View style={s.row}>
                <Pressable style={[s.btn, { backgroundColor: C.line }]} onPress={() => setImporting(false)}><Text style={s.btnTxt}>Cancelar</Text></Pressable>
                <Pressable style={[s.btn, { backgroundColor: '#22c55e' }]} onPress={() => importData(txt) && setImporting(false)}><Text style={[s.btnTxt, { color: '#052e16' }]}>Reemplazar datos</Text></Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </ScrollView>
  );
}

function HabitForm({ habit, onSave, onDelete, onClose }) {
  const [f, setF] = useState(habit || { name: '', emoji: EMOJIS[0], color: COLORS[0], days: [0, 1, 2, 3, 4, 5, 6] });
  const toggleDay = (i) => setF((x) => ({ ...x, days: x.days.includes(i) ? x.days.filter((d) => d !== i) : [...x.days, i] }));
  const ok = f.name.trim() && f.days.length;
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.label}>Nombre</Text>
          <TextInput style={s.input} value={f.name} onChangeText={(name) => setF({ ...f, name })} placeholder="Beber 2L de agua" placeholderTextColor={C.muted} maxLength={40} autoFocus={!habit} />
          <Text style={s.label}>Icono</Text>
          <View style={s.opts}>
            {EMOJIS.map((e) => (
              <Pressable key={e} style={[s.opt, f.emoji === e && s.sel]} onPress={() => setF({ ...f, emoji: e })}><Text style={{ fontSize: 22 }}>{e}</Text></Pressable>
            ))}
          </View>
          <Text style={s.label}>Color</Text>
          <View style={s.opts}>
            {COLORS.map((c) => (
              <Pressable key={c} style={[s.opt, { backgroundColor: c, borderRadius: 21 }, f.color === c && s.sel]} onPress={() => setF({ ...f, color: c })} />
            ))}
          </View>
          <Text style={s.label}>Días</Text>
          <View style={s.opts}>
            {DN.map((n, i) => (
              <Pressable key={n} style={[s.opt, f.days.includes(i) && s.sel]} onPress={() => toggleDay(i)}><Text style={{ color: C.text }}>{n}</Text></Pressable>
            ))}
          </View>
          <View style={s.row}>
            {habit && <Pressable style={[s.btn, { backgroundColor: '#7f1d1d' }]} onPress={() => onDelete(habit.id)}><Text style={s.btnTxt}>Borrar</Text></Pressable>}
            <Pressable style={[s.btn, { backgroundColor: C.line }]} onPress={onClose}><Text style={s.btnTxt}>Cancelar</Text></Pressable>
            <Pressable style={[s.btn, { backgroundColor: '#22c55e', opacity: ok ? 1 : 0.4 }]} disabled={!ok} onPress={() => onSave({ ...f, name: f.name.trim() })}>
              <Text style={[s.btnTxt, { color: '#052e16' }]}>Guardar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', textTransform: 'capitalize' },
  sub: { color: C.muted, textAlign: 'center', textTransform: 'capitalize', marginBottom: 12 },
  muted: { color: C.muted, fontSize: 13 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  navBtn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 6 },
  navTxt: { color: C.text, fontSize: 22 },
  bar: { height: 10, backgroundColor: C.line, borderRadius: 6, overflow: 'hidden', marginBottom: 6 },
  barFill: { height: '100%', backgroundColor: '#22c55e' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chk: { width: 48, height: 48, borderRadius: 24, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  chkTxt: { fontSize: 22, color: '#fff' },
  name: { color: C.text, fontWeight: '700', fontSize: 16 },
  meta: { color: C.muted, fontSize: 12, marginTop: 2 },
  week: { flexDirection: 'row', gap: 4, marginTop: 6 },
  dot: { width: 16, height: 16, borderRadius: 4, backgroundColor: C.line },
  dotToday: { borderWidth: 1.5, borderColor: C.muted },
  edit: { color: C.muted, fontSize: 24, paddingHorizontal: 6 },
  fab: { position: 'absolute', right: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabTxt: { fontSize: 32, color: '#052e16', marginTop: -2 },
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 6, backgroundColor: '#0b1220', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingHorizontal: 10 },
  tab: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10 },
  tabAct: { backgroundColor: C.card },
  overlay: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 36 },
  label: { color: C.muted, fontSize: 13, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, color: C.text, fontSize: 16 },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { width: 42, height: 42, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  sel: { borderColor: C.text },
  row: { flexDirection: 'row', gap: 8, marginTop: 18 },
  btn: { flex: 1, padding: 13, borderRadius: 12, alignItems: 'center' },
  btnTxt: { color: C.text, fontWeight: '700', fontSize: 16 },
  stat: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 10, alignItems: 'center' },
  statV: { color: C.text, fontSize: 20, fontWeight: '800' },
  statL: { color: C.muted, fontSize: 10, marginTop: 2 },
  heat: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 10 },
  heatCell: { width: 17, height: 17, borderRadius: 3, backgroundColor: C.line },
});
